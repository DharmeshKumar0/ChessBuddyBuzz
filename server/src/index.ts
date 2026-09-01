import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { gameRoomManager, type VacatedSeat } from './game/GameRoomManager.js';
import { toWireRoom } from './game/wire.js';
import { ConcurrencyLimiter, RateLimiter } from './net/rateLimit.js';
import {
  isPosition,
  normalizeColorChoice,
  normalizeGameId,
  normalizePromotion,
  sanitizeName,
  sanitizePlayerId,
  sanitizeTimeControl,
} from './net/validate.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CreateGameOptions,
  GameStatus,
  PieceColor,
} from './chess/types.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Every acknowledgement the server sends back has this shape. */
type AckResponse = { success: boolean; error?: string } & Record<string, unknown>;

/** Per-socket bookkeeping, parked on socket.data (typed `any` by socket.io). */
interface SocketState {
  ip: string;
  /** Consecutive refusals; a client that will not back off is dropped. */
  violations: number;
}

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  /**
   * Our largest real message is a few hundred bytes, so the 1 MB default is
   * only useful to somebody trying to make the server hold megabytes per
   * socket.
   */
  maxHttpBufferSize: config.capacity.maxMessageBytes,
  /**
   * Compressing packets this small costs more CPU than the bytes are worth, and
   * CPU is the scarce resource once a few thousand sockets are connected.
   */
  perMessageDeflate: false,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 20_000,
  cleanupEmptyChildNamespaces: true,
});

// ---------------------------------------------------------------------------
// Limiters. One place, so the numbers are all visible at once and every one of
// them can be swept from the maintenance loop.
// ---------------------------------------------------------------------------

const limiters = {
  handshake: new RateLimiter('handshake', config.limits.handshake),
  http: new RateLimiter('http', config.limits.http),
  socketFloor: new RateLimiter('socketFloor', config.limits.socketFloor),
  createGame: new RateLimiter('createGame', config.limits.createGame),
  joinGame: new RateLimiter('joinGame', config.limits.joinGame),
  makeMove: new RateLimiter('makeMove', config.limits.makeMove),
  illegalMove: new RateLimiter('illegalMove', config.limits.illegalMove),
  gameAction: new RateLimiter('gameAction', config.limits.gameAction),
  reconnect: new RateLimiter('reconnect', config.limits.reconnect),
};

/** Concurrent sockets, overall and per address. */
const connections = new ConcurrencyLimiter(
  config.capacity.maxSocketsPerIp,
  config.capacity.maxSockets,
);

/** Limiters keyed by socket id, so a closed socket's bucket can be dropped. */
const socketKeyedLimiters = [
  limiters.socketFloor,
  limiters.makeMove,
  limiters.illegalMove,
  limiters.gameAction,
  limiters.reconnect,
];

/**
 * The client's real address, for keying per-IP limits.
 *
 * With trustProxy off (direct connections) the socket/HTTP peer address is the
 * client and is unforgeable, so we use it verbatim.
 *
 * With trustProxy on, the client is behind `config.trustProxyHops` trusted
 * proxies that each append the address they received from to X-Forwarded-For.
 * We therefore read the entry `trustProxyHops` positions from the *right*: that
 * is the address our own outermost proxy inserted. A client can prepend forged
 * entries to the left of the header (to try to dodge its per-IP limit or frame
 * another address), but it cannot shift the right-anchored value — extra
 * entries only push their own spoofed data further left, where we never read.
 * Taking the leftmost entry, as is common, would trust exactly that forgeable
 * data.
 */
function ipFromHeaders(forwarded: string | string[] | undefined, fallback: string): string {
  if (!config.trustProxy) return fallback;

  const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (!header) return fallback;

  const chain = header
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (chain.length === 0) return fallback;

  // Clamp into range: if the client sent fewer entries than the expected hop
  // count, there is nothing forged to skip and the leftmost is the client.
  const index = Math.max(0, chain.length - config.trustProxyHops);
  return chain[index] ?? fallback;
}

function httpIp(req: Request): string {
  return ipFromHeaders(req.headers['x-forwarded-for'], req.socket.remoteAddress ?? 'unknown');
}

function stateOf(socket: TypedSocket): SocketState {
  return socket.data as SocketState;
}

/**
 * Counts a refusal and closes sockets that keep hitting the wall. A
 * well-behaved client backs off after one 'too many requests'; one that does
 * not is cheaper to drop than to keep refusing packet by packet. Successful
 * requests bleed the counter back down, so an ordinary burst never accumulates
 * into a disconnect.
 */
function countViolation(socket: TypedSocket): void {
  const state = stateOf(socket);
  state.violations++;
  if (state.violations >= config.maxViolationsBeforeDisconnect) {
    socket.disconnect(true);
  }
}

function creditGoodBehaviour(socket: TypedSocket): void {
  const state = stateOf(socket);
  if (state.violations > 0) state.violations--;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

app.disable('x-powered-by');
// Match express's own client-IP logic to ours: a hop count trusts only the last
// N entries of X-Forwarded-For, so req.ip (and req.protocol/req.secure behind a
// TLS-terminating proxy) reflect the real client rather than a forged header.
if (config.trustProxy) app.set('trust proxy', config.trustProxyHops);

app.use(cors({ origin: config.corsOrigins, credentials: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const verdict = limiters.http.consume(httpIp(req));
  if (!verdict.allowed) {
    res
      .status(429)
      .set('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)))
      .json({ error: 'Too many requests' });
    return;
  }
  next();
});

// No route reads a body today; the cap is here so that stays true by default.
app.use(express.json({ limit: config.capacity.maxJsonBytes }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * Enough to see whether the server is coping — room and socket counts, and the
 * size of every limiter's bucket map so a leak there would be visible. No
 * player names, addresses or game content.
 */
app.get('/stats', (_req: Request, res: Response) => {
  res.json({
    uptimeSeconds: Math.floor(process.uptime()),
    sockets: { total: connections.total, addresses: connections.keys },
    games: gameRoomManager.stats(),
    limiterKeys: Object.fromEntries(
      Object.entries(limiters).map(([name, limiter]) => [name, limiter.size]),
    ),
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
    },
  });
});

// ---------------------------------------------------------------------------
// Connection gate
// ---------------------------------------------------------------------------

io.use((socket, next) => {
  const ip = ipFromHeaders(socket.handshake.headers['x-forwarded-for'], socket.handshake.address);

  // Rate first, capacity second: a refused handshake must not hold a slot.
  if (!limiters.handshake.consume(ip).allowed) {
    next(new Error('Too many connection attempts — please wait a moment'));
    return;
  }
  if (!connections.tryAcquire(ip)) {
    next(new Error('Too many connections'));
    return;
  }

  socket.data = { ip, violations: 0 } satisfies SocketState;
  next();
});

/**
 * Wires up one client event with everything every handler needs and none of
 * them should repeat:
 *
 *  - a real acknowledgement callback. The handlers used to call whatever
 *    arrived in the last argument, so a client that simply omitted it threw
 *    inside a socket.io listener — which nothing catches, taking the process
 *    and every game on it down with it.
 *  - a rate-limit verdict, answered immediately so the client fails fast
 *    instead of waiting out its ack timeout.
 *  - a catch-all, for the same reason.
 *
 * Arguments arrive as `unknown[]` on purpose: the declared event types are
 * erased at runtime, so this layer treats them as the untrusted input they are
 * and each handler validates what it needs.
 */
function register(
  socket: TypedSocket,
  event: keyof ClientToServerEvents,
  limiter: RateLimiter,
  keyBy: 'ip' | 'socket',
  handler: (args: unknown[], respond: (response: AckResponse) => void) => void,
): void {
  const untyped = socket as unknown as {
    on(event: string, listener: (...args: unknown[]) => void): void;
  };

  untyped.on(event, (...received: unknown[]) => {
    const last = received[received.length - 1];
    const hasAck = typeof last === 'function';
    const sendAck = hasAck ? (last as (response: AckResponse) => void) : () => {};
    const args = hasAck ? received.slice(0, -1) : received;

    /**
     * A request that actually did something bleeds the violation counter back
     * down, so an ordinary burst never accumulates into a disconnect. Refusals
     * deliberately do not count as good behaviour: a client hammering illegal
     * moves gets a `success: false` every time, and crediting those would let it
     * flood indefinitely.
     */
    const respond = (response: AckResponse): void => {
      if (response.success) creditGoodBehaviour(socket);
      sendAck(response);
    };

    const key = keyBy === 'ip' ? stateOf(socket).ip : socket.id;
    const verdict = limiter.consume(key);
    if (!verdict.allowed) {
      respond({
        success: false,
        error: `Too many requests — try again in ${Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))}s`,
      });
      countViolation(socket);
      return;
    }

    try {
      handler(args, respond);
    } catch (error) {
      console.error(`[${event}] failed:`, error);
      respond({ success: false, error: 'Server error' });
    }
  });
}

/** Terminal statuses. 'check' is a live status, not a result. */
function isTerminalStatus(status: GameStatus): boolean {
  return status !== 'idle' && status !== 'playing' && status !== 'check';
}

/**
 * The human-readable sentence that goes with a finish. The client classifies
 * the ending from this text, so the wording matters.
 */
function endReason(status: GameStatus, moverColor: PieceColor): string {
  switch (status) {
    case 'checkmate':
      return `Checkmate! ${moverColor} wins`;
    case 'stalemate':
      return 'Stalemate';
    case 'draw':
      return 'Draw';
    case 'timeout':
      return 'Timeout';
    case 'resigned':
      return 'Resignation';
    default:
      return 'Game over';
  }
}

/**
 * A player who starts or joins a game while already seated in another gives up
 * the old seat. Tell the room they left, and stop routing their socket there.
 */
function announceVacatedSeat(socket: TypedSocket, vacated: VacatedSeat | null): void {
  if (!vacated) return;
  socket.leave(vacated.room.gameId);
  if (vacated.destroyed) return;
  socket.to(vacated.room.gameId).emit('playerLeft', vacated.color);
  io.to(vacated.room.gameId).emit('gameState', toWireRoom(vacated.room));
}

io.on('connection', (socket) => {
  if (config.verbose) console.log(`Client connected: ${socket.id}`);

  /**
   * A floor under every incoming packet, including events we do not handle, so
   * an unknown-event flood costs a map lookup instead of a handler. Not calling
   * next() drops the packet; the client still gets an answer if it asked for
   * one, so nothing hangs waiting on an ack.
   */
  socket.use((packet, next) => {
    if (limiters.socketFloor.consume(socket.id).allowed) {
      next();
      return;
    }
    const last = packet[packet.length - 1];
    if (typeof last === 'function') {
      (last as (response: AckResponse) => void)({ success: false, error: 'Too many requests' });
    }
    countViolation(socket);
  });

  // Create game
  register(socket, 'createGame', limiters.createGame, 'ip', (args, respond) => {
    const options = (args[0] ?? {}) as Partial<CreateGameOptions>;
    const result = gameRoomManager.createGame(
      socket.id,
      stateOf(socket).ip,
      sanitizeName(options.playerName, 'Player'),
      sanitizeTimeControl(options.timeControl),
      normalizeColorChoice(options.color),
    );

    if (!result.ok) {
      respond({ success: false, error: result.error });
      return;
    }

    announceVacatedSeat(socket, result.vacated);
    socket.join(result.game.gameId);

    respond({
      success: true,
      gameId: result.game.gameId,
      game: toWireRoom(result.game),
      color: result.color,
    });
  });

  // Join game
  register(socket, 'joinGame', limiters.joinGame, 'ip', (args, respond) => {
    const gameId = normalizeGameId(args[0]);
    if (!gameId) {
      respond({ success: false, error: 'That room code is not valid' });
      return;
    }

    const playerName = sanitizeName(args[1], 'Player');
    const result = gameRoomManager.joinGame(gameId, socket.id, playerName);
    if (!result.ok) {
      respond({ success: false, error: result.error });
      return;
    }

    announceVacatedSeat(socket, result.vacated);
    socket.join(gameId);

    const seat = result.color === 'white' ? result.game.whitePlayer : result.game.blackPlayer;
    socket.to(gameId).emit('playerJoined', {
      id: seat?.id ?? socket.id,
      name: playerName,
      color: result.color,
      connected: true,
    });
    // The room only becomes 'playing' when the second player sits down, so both
    // sides need the room state, not just the joiner.
    io.to(gameId).emit('gameState', toWireRoom(result.game));

    respond({ success: true, game: toWireRoom(result.game), color: result.color });
  });

  // Leave game
  register(socket, 'leaveGame', limiters.gameAction, 'socket', (_args, respond) => {
    const result = gameRoomManager.leaveGame(socket.id);
    if (!result) {
      respond({ success: false, error: 'Not in a game' });
      return;
    }

    socket.leave(result.room.gameId);
    if (!result.destroyed) {
      socket.to(result.room.gameId).emit('playerLeft', result.color);
      io.to(result.room.gameId).emit('gameState', toWireRoom(result.room));
    }
    respond({ success: true });
  });

  // Make move
  register(socket, 'makeMove', limiters.makeMove, 'socket', (args, respond) => {
    const [from, to, promotionArg] = args;
    if (!isPosition(from) || !isPosition(to)) {
      respond({ success: false, error: 'Invalid square' });
      return;
    }
    const promotion = normalizePromotion(promotionArg);
    if (!promotion.ok) {
      respond({ success: false, error: 'Invalid promotion piece' });
      return;
    }

    const result = gameRoomManager.makeMove(socket.id, from, to, promotion.promotion);

    if (!result.success || !result.game || !result.move) {
      // Rejected moves get their own, much tighter budget: legal play never
      // touches it, while a client hammering illegal moves is spending server
      // CPU on move generation for nothing. Past the budget the answer changes
      // to a throttle message, which is both the honest reason for the refusal
      // and something a client can back off on.
      if (!limiters.illegalMove.consume(socket.id).allowed) {
        countViolation(socket);
        respond({ success: false, error: 'Too many rejected moves — slow down' });
        return;
      }
      respond({ success: false, error: result.error });
      return;
    }

    const { game, move, fen, clocks } = result;

    io.to(game.gameId).emit('moveMade', move, fen!, clocks!);

    /**
     * The full room state is only worth its bytes when the move changed
     * something a client cannot derive from the move itself — into or out of
     * check, or a finish. Everything else (board, clocks, history) arrives with
     * 'moveMade'. This used to go out on every single move, growing with the
     * game, to every player in the room.
     */
    if (result.statusChanged) {
      io.to(game.gameId).emit('gameState', toWireRoom(game));
    }

    if (isTerminalStatus(game.gameStatus)) {
      io.to(game.gameId).emit('gameEnded', game.result, endReason(game.gameStatus, move.piece.color));
    }

    respond({ success: true, move, fen, clocks });
  });

  // Offer draw
  register(socket, 'offerDraw', limiters.gameAction, 'socket', (_args, respond) => {
    const result = gameRoomManager.offerDraw(socket.id);
    if (result.success && result.game) {
      const playerColor = result.game.whitePlayer?.socketId === socket.id ? 'white' : 'black';
      socket.to(result.game.gameId).emit('drawOffered', playerColor);
      io.to(result.game.gameId).emit('gameState', toWireRoom(result.game));
    }
    respond({ success: result.success, error: result.error });
  });

  // Accept draw
  register(socket, 'acceptDraw', limiters.gameAction, 'socket', (_args, respond) => {
    const result = gameRoomManager.acceptDraw(socket.id);
    if (result.success && result.game) {
      io.to(result.game.gameId).emit('gameEnded', '1/2-1/2', 'Draw accepted');
      io.to(result.game.gameId).emit('gameState', toWireRoom(result.game));
    }
    respond({ success: result.success, error: result.error });
  });

  // Decline draw
  register(socket, 'declineDraw', limiters.gameAction, 'socket', (_args, respond) => {
    const result = gameRoomManager.declineDraw(socket.id);
    if (result.success && result.game) {
      io.to(result.game.gameId).emit('gameState', toWireRoom(result.game));
    }
    respond({ success: result.success, error: result.error });
  });

  // Resign
  register(socket, 'resign', limiters.gameAction, 'socket', (_args, respond) => {
    const result = gameRoomManager.resign(socket.id);
    if (result.success && result.game) {
      const playerColor = result.game.whitePlayer?.socketId === socket.id ? 'white' : 'black';
      io.to(result.game.gameId).emit('gameEnded', result.game.result, `${playerColor} resigned`);
      io.to(result.game.gameId).emit('gameState', toWireRoom(result.game));
    }
    respond({ success: result.success, error: result.error });
  });

  // Reconnect into a seat this player already holds
  register(socket, 'reconnectGame', limiters.reconnect, 'socket', (args, respond) => {
    const gameId = normalizeGameId(args[0]);
    if (!gameId) {
      respond({ success: false, error: 'That room code is not valid' });
      return;
    }

    const result = gameRoomManager.reconnectPlayer(socket.id, gameId, sanitizePlayerId(args[1]));
    if (!result.success || !result.game) {
      respond({ success: false, error: result.error });
      return;
    }

    const { game, color } = result;
    socket.join(game.gameId);

    const playerColor = color ?? 'white';
    const player = playerColor === 'white' ? game.whitePlayer : game.blackPlayer;

    // Notify other player
    socket.to(game.gameId).emit('playerJoined', {
      id: player?.id ?? socket.id,
      name: player?.name ?? (playerColor === 'white' ? 'White' : 'Black'),
      color: playerColor,
      connected: true,
    });

    // Send current authoritative state including clocks
    const currentClocks = gameRoomManager.getCurrentClocks(gameId);
    if (currentClocks) {
      socket.emit('clockSync', currentClocks);
    }

    respond({ success: true, game: toWireRoom(game), color });

    if (config.verbose) console.log(`Player reconnected to game ${gameId} as ${color}`);
  });

  socket.on('disconnect', () => {
    if (config.verbose) console.log(`Client disconnected: ${socket.id}`);

    connections.release(stateOf(socket).ip);
    for (const limiter of socketKeyedLimiters) limiter.forget(socket.id);

    // The seat is kept so the player can reconnect into it; an explicit
    // 'leaveGame' vacates it instead.
    const result = gameRoomManager.handleDisconnect(socket.id);
    if (!result) return;

    if (result.color) socket.to(result.room.gameId).emit('playerLeft', result.color);
    io.to(result.room.gameId).emit('gameState', toWireRoom(result.room));
  });
});

// ---------------------------------------------------------------------------
// Periodic work
// ---------------------------------------------------------------------------

/**
 * Authoritative clock broadcast. tickClocks() walks only the games that are
 * actually live and skips rooms with nobody connected, so an instance full of
 * finished games costs nothing per second — it used to scan every room the
 * process had ever held and emit into empty ones.
 */
const clockTimer = setInterval(() => {
  for (const tick of gameRoomManager.tickClocks()) {
    io.to(tick.gameId).emit('clockSync', tick.clocks);

    if (tick.timedOut) {
      const { game, timedOutColor } = tick.timedOut;
      io.to(tick.gameId).emit('gameEnded', game.result, `Timeout: ${timedOutColor} flagged`);
      io.to(tick.gameId).emit('gameState', toWireRoom(game));
    }
  }
}, config.intervals.clockSyncMs);

const maintenanceTimer = setInterval(() => {
  const now = Date.now();
  const reaped = gameRoomManager.cleanup(now);
  for (const limiter of Object.values(limiters)) limiter.sweep(now);

  if (config.verbose && reaped > 0) {
    console.log(`[maintenance] reaped ${reaped} room(s); ${JSON.stringify(gameRoomManager.stats())}`);
  }
}, config.intervals.maintenanceMs);

// ---------------------------------------------------------------------------
// Staying up
// ---------------------------------------------------------------------------

/**
 * A single malformed request used to be able to end every game on the server:
 * an exception thrown inside a socket.io listener reaches no handler and the
 * process exits. The handlers above are individually wrapped, and these are the
 * backstop for anything they miss. Carrying on after an uncaught exception
 * means running in a state Node makes no promises about — for a game server
 * with live rooms in memory that is still a far better trade than dropping
 * everyone.
 */
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  clearInterval(clockTimer);
  clearInterval(maintenanceTimer);

  io.close(() => {
    httpServer.close(() => process.exit(0));
  });

  // Do not let a stuck socket hold the process open forever.
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

httpServer.listen(config.port, () => {
  console.log(`Chess server running on port ${config.port}`);
  console.log(
    `Limits: ${config.capacity.maxSockets} sockets ` +
      `(${config.capacity.maxSocketsPerIp}/address), ` +
      `${config.capacity.maxRooms} rooms (${config.capacity.maxRoomsPerIp}/address)`,
  );
});
