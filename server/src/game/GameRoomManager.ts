import type { GameRoom, Player, Move, Position, PieceType, PieceColor, GameStatus, ClockState, CastlingRights } from '../chess/types.js';
import type { Piece } from '../chess/types.js';
import { createInitialBoard, createInitialCastlingRights, cloneBoard, isInCheck, getPieceAt } from '../chess/board.js';
import { getLegalMoves, makeMoveOnBoard } from '../chess/moves.js';
import { generateSAN, generateFEN } from '../chess/fen.js';
import { config } from '../config.js';
import {
  TIME_CONTROLS,
  parseTimeControl,
  createInitialClockState,
  switchClock,
  startClock,
  stopClock,
  checkTimeUp,
  getCurrentClockState,
} from '../utils/clock.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * A room as the server keeps it: everything the client is allowed to see
 * (GameRoom) plus the derived state the server needs to validate moves.
 * Extending GameRoom rather than restating its fields keeps the wire shape in
 * lockstep with src/chess/types.ts — but the extra fields are *not* for the
 * client, so rooms go out through toWireRoom() rather than being emitted whole.
 */
export interface GameRoomInternal extends GameRoom {
  /**
   * How often each position has occurred, keyed by the first four FEN fields.
   * A counter rather than a list of positions: threefold detection used to
   * re-split and re-join every FEN in the game on every single move.
   */
  repetitions: Map<string, number>;
  halfmoveClock: number;
  fullmoveNumber: number;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  board: (Piece | null)[][];
  /** Address that opened the room, for per-address accounting. Never sent to a client. */
  creatorIp: string;
}

/** A seat given up because its occupant started or joined another game. */
export interface VacatedSeat {
  room: GameRoomInternal;
  color: PieceColor;
  /** True when vacating left the room empty and it was dropped. */
  destroyed: boolean;
}

export type CreateGameResult =
  | { ok: true; game: GameRoomInternal; color: PieceColor; vacated: VacatedSeat | null }
  | { ok: false; error: string };

export type JoinGameResult =
  | { ok: true; game: GameRoomInternal; color: PieceColor; vacated: VacatedSeat | null }
  | { ok: false; error: string };

export interface MakeMoveResult {
  success: boolean;
  game?: GameRoomInternal;
  move?: Move;
  fen?: string;
  clocks?: ClockState;
  error?: string;
  /**
   * Whether the move changed the game's status (into or out of check, or to a
   * finish). The clients already apply the move itself from `moveMade`, so this
   * is what decides whether a full state broadcast is worth the bytes.
   */
  statusChanged?: boolean;
}

/** One live game's clock, as of a tick, plus the flag-fall it may have caused. */
export interface ClockTick {
  gameId: string;
  clocks: ClockState;
  timedOut: { game: GameRoomInternal; timedOutColor: PieceColor } | null;
}

/**
 * Statuses in which the game is still live: a player can move, flag, resign or
 * offer a draw. 'check' is just as live as 'playing'.
 */
function isLiveStatus(status: GameStatus): boolean {
  return status === 'playing' || status === 'check';
}

/** A room nobody has finished and nobody is sitting at both ends of. */
function hasConnectedPlayer(room: GameRoomInternal): boolean {
  return room.whitePlayer?.connected === true || room.blackPlayer?.connected === true;
}

/** Mirrors isLightSquare in the client's src/chess/board.ts. */
function isLightSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

/** The repetition key: position, side to move, castling rights, en passant. */
function positionKeyOf(fen: string): string {
  return fen.split(' ', 4).join(' ');
}

export class GameRoomManager {
  private rooms = new Map<string, GameRoomInternal>();
  private playerToRoom = new Map<string, string>(); // socketId -> gameId

  /**
   * Ids of games that are still live. The clock loop runs every second over
   * *this* set rather than over every room the server has ever held, so a
   * server full of finished games costs nothing per tick.
   */
  private liveGames = new Set<string>();

  /** Rooms opened per address, so one client cannot hoard them. */
  private roomsByIp = new Map<string, Set<string>>();

  createGame(
    socketId: string,
    ip: string,
    playerName: string,
    timeControlDisplay: string,
    colorChoice?: 'white' | 'black' | 'random',
  ): CreateGameResult {
    if (this.rooms.size >= config.capacity.maxRooms) {
      return { ok: false, error: 'Server is at capacity — please try again in a moment' };
    }
    // The room this socket is about to give up does not count against it, or a
    // player holding the last permitted room could never start a different one.
    const held = (this.roomsByIp.get(ip)?.size ?? 0) - this.roomsReleasedByVacating(socketId, ip);
    if (held >= config.capacity.maxRoomsPerIp) {
      return { ok: false, error: 'Too many open rooms from this connection — close one first' };
    }

    // A client that creates a second game without leaving the first used to
    // orphan the first room: the seat still looked occupied and connected, so
    // nothing ever reclaimed it.
    const vacated = this.vacateSeat(socketId);

    const timeControl = parseTimeControl(timeControlDisplay) || TIME_CONTROLS[4]; // Default 5+0
    const gameId = this.nextGameId();

    let color: PieceColor;
    if (colorChoice === 'white') color = 'white';
    else if (colorChoice === 'black') color = 'black';
    else color = Math.random() < 0.5 ? 'white' : 'black';

    const board = createInitialBoard();
    const castlingRights = createInitialCastlingRights();
    const initialFEN = generateFEN(board, 'white', castlingRights, null, 0, 1);
    const clocks = createInitialClockState(timeControl);

    const player: Player = {
      // `id` must be stable across reconnects, so it cannot be the socket id —
      // that is exactly the value that changes when a client reconnects.
      id: uuidv4(),
      name: playerName,
      color,
      connected: true,
      socketId,
    };

    const now = Date.now();
    const game: GameRoomInternal = {
      gameId,
      whitePlayer: color === 'white' ? player : null,
      blackPlayer: color === 'black' ? player : null,
      currentFEN: initialFEN,
      moveHistory: [],
      turn: 'white',
      clocks,
      gameStatus: 'idle',
      result: '*',
      timeControl,
      createdAt: now,
      updatedAt: now,
      drawOffer: null,
      repetitions: new Map([[positionKeyOf(initialFEN), 1]]),
      halfmoveClock: 0,
      fullmoveNumber: 1,
      castlingRights,
      enPassantTarget: null,
      board,
      creatorIp: ip,
    };

    this.rooms.set(gameId, game);
    this.playerToRoom.set(socketId, gameId);
    let owned = this.roomsByIp.get(ip);
    if (!owned) {
      owned = new Set();
      this.roomsByIp.set(ip, owned);
    }
    owned.add(gameId);

    return { ok: true, game, color, vacated };
  }

  joinGame(gameId: string, socketId: string, playerName: string): JoinGameResult {
    const room = this.rooms.get(gameId);
    if (!room) return { ok: false, error: 'Game not found' };
    if (room.whitePlayer && room.blackPlayer) return { ok: false, error: 'Game is full' };

    // A seat can also fall vacant *after* a game ends (the loser leaves). That
    // room is a finished game to be looked at, not a lobby to be joined —
    // seating someone in it used to flip the final position back to 'playing'.
    if (room.gameStatus !== 'idle') {
      return { ok: false, error: 'That game has already finished' };
    }

    const color: PieceColor = room.whitePlayer ? 'black' : 'white';

    // Same reasoning as createGame: never leave a stale seat behind.
    const vacated = this.vacateSeat(socketId);

    const player: Player = {
      // Stable across reconnects — see createGame.
      id: uuidv4(),
      name: playerName,
      color,
      connected: true,
      socketId,
    };

    if (color === 'white') {
      room.whitePlayer = player;
    } else {
      room.blackPlayer = player;
    }

    room.gameStatus = 'playing';
    room.updatedAt = Date.now();
    this.playerToRoom.set(socketId, room.gameId);
    this.refreshLive(room);

    return { ok: true, game: room, color, vacated };
  }

  /**
   * Explicit, deliberate departure: the seat is vacated so the room becomes
   * joinable again, and a room nobody is sitting in is dropped. (An involuntary
   * disconnect is handled separately and *keeps* the seat, so the player can
   * reconnect into it.)
   */
  leaveGame(socketId: string): { room: GameRoomInternal; color: PieceColor; destroyed: boolean } | null {
    return this.vacateSeat(socketId);
  }

  /**
   * An involuntary drop. The seat is kept so the player can reconnect into it,
   * but the socket's routing entry is not: that map used to grow by one entry
   * per connection for the lifetime of the process.
   */
  handleDisconnect(socketId: string): { room: GameRoomInternal; color: PieceColor | null } | null {
    const gameId = this.playerToRoom.get(socketId);
    this.playerToRoom.delete(socketId);
    if (!gameId) return null;

    const room = this.rooms.get(gameId);
    if (!room) return null;

    let color: PieceColor | null = null;
    if (room.whitePlayer?.socketId === socketId) {
      color = 'white';
      room.whitePlayer = { ...room.whitePlayer, connected: false };
    } else if (room.blackPlayer?.socketId === socketId) {
      color = 'black';
      room.blackPlayer = { ...room.blackPlayer, connected: false };
    }

    // Marks the moment the room went quiet, which is what the reaper measures.
    room.updatedAt = Date.now();

    return { room, color };
  }

  getGame(gameId: string): GameRoomInternal | undefined {
    return this.rooms.get(gameId.toUpperCase());
  }

  getGameBySocket(socketId: string): GameRoomInternal | undefined {
    const gameId = this.playerToRoom.get(socketId);
    if (!gameId) return undefined;
    return this.rooms.get(gameId);
  }

  makeMove(socketId: string, from: Position, to: Position, promotion?: PieceType): MakeMoveResult {
    const room = this.getGameBySocket(socketId);
    if (!room) return { success: false, error: 'Not in a game' };

    const playerColor = room.whitePlayer?.socketId === socketId ? 'white' : 'black';
    if (room.turn !== playerColor) return { success: false, error: 'Not your turn' };
    if (!isLiveStatus(room.gameStatus)) return { success: false, error: 'Game not in progress' };

    const piece = getPieceAt(room.board, from);
    if (!piece || piece.color !== playerColor) return { success: false, error: 'Invalid piece' };

    const legalMoves = getLegalMoves(room.board, from, room.castlingRights, room.enPassantTarget);
    const isValid = legalMoves.some(m => m.row === to.row && m.col === to.col);
    if (!isValid) return { success: false, error: 'Illegal move' };

    // Handle promotion
    const isPromotionRank = piece.type === 'pawn' && (to.row === 0 || to.row === 7);
    if (isPromotionRank && !promotion) {
      return { success: false, error: 'Promotion required' };
    }

    const statusBefore = room.gameStatus;

    // Make the move. makeMoveOnBoard mutates room.board in place, so snapshot the
    // pre-move position first: generateSAN needs it for disambiguation.
    const boardBeforeMove = cloneBoard(room.board);
    const moveResult = makeMoveOnBoard(
      room.board,
      from,
      to,
      piece,
      room.castlingRights,
      room.enPassantTarget,
      promotion
    );

    const san = generateSAN(
      boardBeforeMove,
      from,
      to,
      piece,
      moveResult.capturedPiece,
      moveResult.promotion,
      moveResult.isCastling,
      moveResult.isEnPassant,
      room.castlingRights,
      room.enPassantTarget
    );

    const move: Move = {
      from,
      to,
      piece,
      capturedPiece: moveResult.capturedPiece,
      promotion: moveResult.promotion,
      isCastling: moveResult.isCastling,
      isEnPassant: moveResult.isEnPassant,
      san: '',
      check: false,
      checkmate: false,
    };

    // Update game state
    room.castlingRights = moveResult.nextCastlingRights;
    room.enPassantTarget = moveResult.nextEnPassantTarget;
    room.halfmoveClock = moveResult.capturedPiece || piece.type === 'pawn' ? 0 : room.halfmoveClock + 1;
    if (room.turn === 'black') room.fullmoveNumber++;

    // Playing on withdraws a pending draw offer — the same rule the client
    // applies locally. Left standing, a stale offer could be accepted many
    // moves later out of a position its author never agreed to.
    room.drawOffer = null;

    room.moveHistory.push(move);

    // Update clocks
    const now = Date.now();
    room.clocks = switchClock(room.clocks, room.turn === 'white' ? 'black' : 'white', room.timeControl.incrementMs, now);

    // Start clock on first move
    if (room.moveHistory.length === 1 && !room.clocks.isRunning) {
      room.clocks = startClock(room.clocks, 'white', now);
    }

    // Generate new FEN
    room.currentFEN = generateFEN(
      room.board,
      room.turn === 'white' ? 'black' : 'white',
      room.castlingRights,
      room.enPassantTarget,
      room.halfmoveClock,
      room.fullmoveNumber
    );

    const positionKey = positionKeyOf(room.currentFEN);
    const timesSeen = (room.repetitions.get(positionKey) ?? 0) + 1;
    room.repetitions.set(positionKey, timesSeen);
    room.turn = room.turn === 'white' ? 'black' : 'white';

    // Check for check/checkmate/stalemate
    const opponentColor = room.turn;
    const inCheck = isInCheck(room.board, opponentColor);
    let hasLegalMove = false;

    for (let row = 0; row < 8 && !hasLegalMove; row++) {
      for (let col = 0; col < 8 && !hasLegalMove; col++) {
        const p = room.board[row][col];
        if (p && p.color === opponentColor) {
          const moves = getLegalMoves(room.board, { row, col }, room.castlingRights, room.enPassantTarget);
          if (moves.length > 0) hasLegalMove = true;
        }
      }
    }

    // Build the SAN suffix from the values just computed for the side *now* to
    // move. Calling appendCheckStatus here would test room.turn's opponent —
    // i.e. the player who just moved, who is never in check.
    move.san = san + (inCheck ? (hasLegalMove ? '+' : '#') : '');
    move.check = inCheck;
    move.checkmate = inCheck && !hasLegalMove;

    if (inCheck && !hasLegalMove) {
      room.gameStatus = 'checkmate';
      room.result = playerColor === 'white' ? '1-0' : '0-1';
      room.clocks = stopClock(room.clocks, now);
    } else if (!inCheck && !hasLegalMove) {
      room.gameStatus = 'stalemate';
      room.result = '1/2-1/2';
      room.clocks = stopClock(room.clocks, now);
    } else if (timesSeen >= 3) { // Threefold repetition
      room.gameStatus = 'draw';
      room.result = '1/2-1/2';
      room.clocks = stopClock(room.clocks, now);
    } else if (room.halfmoveClock >= 100) { // 50-move rule
      room.gameStatus = 'draw';
      room.result = '1/2-1/2';
      room.clocks = stopClock(room.clocks, now);
    } else if (this.isInsufficientMaterial(room)) {
      room.gameStatus = 'draw';
      room.result = '1/2-1/2';
      room.clocks = stopClock(room.clocks, now);
    } else if (inCheck) {
      room.gameStatus = 'check';
    } else {
      room.gameStatus = 'playing';
    }

    room.updatedAt = Date.now();
    this.refreshLive(room);

    // Update move in history with final SAN
    room.moveHistory[room.moveHistory.length - 1] = move;

    return {
      success: true,
      game: room,
      move,
      fen: room.currentFEN,
      clocks: room.clocks,
      statusChanged: room.gameStatus !== statusBefore,
    };
  }

  private isInsufficientMaterial(room: GameRoomInternal): boolean {
    let whitePieces: Piece[] = [];
    let blackPieces: Piece[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = room.board[row][col];
        if (piece) {
          if (piece.color === 'white') whitePieces.push(piece);
          else blackPieces.push(piece);
          // Four or more pieces on the board can never be insufficient
          // material, and that is the overwhelmingly common case — bail before
          // walking the rest of the board on every move of every game.
          if (whitePieces.length + blackPieces.length > 4) return false;
        }
      }
    }

    const hasOnlyKing = (pieces: Piece[]) => pieces.length === 1 && pieces[0].type === 'king';
    const hasKingAndMinor = (pieces: Piece[]) =>
      pieces.length === 2 && pieces.some(p => p.type === 'king') &&
      pieces.some(p => p.type === 'bishop' || p.type === 'knight');

    if (hasOnlyKing(whitePieces) && hasOnlyKing(blackPieces)) return true;
    if (hasOnlyKing(whitePieces) && hasKingAndMinor(blackPieces)) return true;
    if (hasKingAndMinor(whitePieces) && hasOnlyKing(blackPieces)) return true;
    if (hasKingAndMinor(whitePieces) && hasKingAndMinor(blackPieces)) {
      // Check if both have bishops on same color
      const whiteBishop = whitePieces.find(p => p.type === 'bishop');
      const blackBishop = blackPieces.find(p => p.type === 'bishop');
      if (whiteBishop && blackBishop) {
        // Find bishop positions to check color
        let whiteBishopPos: Position | null = null;
        let blackBishopPos: Position | null = null;
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const p = room.board[row][col];
            if (p && p.type === 'bishop') {
              if (p.color === 'white') whiteBishopPos = { row, col };
              else blackBishopPos = { row, col };
            }
          }
        }
        if (whiteBishopPos && blackBishopPos) {
          if (isLightSquare(whiteBishopPos.row, whiteBishopPos.col) === isLightSquare(blackBishopPos.row, blackBishopPos.col)) {
            return true;
          }
        }
      }
      // Every other minor-vs-minor pairing (K+N vs K+N, K+B vs K+N, and
      // opposite-coloured K+B vs K+B) still admits a forced mate, so it is not
      // an automatic draw.
      return false;
    }

    return false;
  }

  handleTimeUp(gameId: string, now = Date.now()): { game: GameRoomInternal; timedOutColor: PieceColor } | null {
    const room = this.rooms.get(gameId);
    if (!room || !isLiveStatus(room.gameStatus)) return null;

    // room.clocks only advances when a move is played, so the stored value is
    // stale between moves — exactly the window a flag falls in. Settle the
    // elapsed time into it before testing, and keep the result.
    room.clocks = getCurrentClockState(room.clocks, now);

    const timedOutColor = checkTimeUp(room.clocks);
    if (!timedOutColor) return null;

    const opponentColor = timedOutColor === 'white' ? 'black' : 'white';
    const opponentHasMatingMaterial = !this.hasOnlyKing(room, opponentColor);

    if (opponentHasMatingMaterial) {
      room.gameStatus = 'timeout';
      room.result = opponentColor === 'white' ? '1-0' : '0-1';
    } else {
      room.gameStatus = 'draw';
      room.result = '1/2-1/2';
    }

    room.clocks = stopClock(room.clocks, now);
    room.updatedAt = now;
    this.refreshLive(room);

    return { game: room, timedOutColor };
  }

  /**
   * Settles the clock of every live game and reports the ones worth
   * broadcasting: a room with nobody connected is skipped, since encoding a
   * packet for an empty room is pure cost. Flag-falls are still detected there,
   * so an abandoned game still resolves instead of ticking forever.
   */
  tickClocks(now = Date.now()): ClockTick[] {
    const ticks: ClockTick[] = [];

    for (const gameId of this.liveGames) {
      const room = this.rooms.get(gameId);
      if (!room) {
        this.liveGames.delete(gameId);
        continue;
      }
      if (!isLiveStatus(room.gameStatus)) {
        this.liveGames.delete(gameId);
        continue;
      }
      if (!room.clocks.isRunning) continue;

      const clocks = getCurrentClockState(room.clocks, now);
      const flagged = clocks.whiteMs <= 0 || clocks.blackMs <= 0;
      const timedOut = flagged ? this.handleTimeUp(gameId, now) : null;

      if (timedOut === null && !hasConnectedPlayer(room)) continue;

      ticks.push({ gameId, clocks: timedOut ? room.clocks : clocks, timedOut });
    }

    return ticks;
  }

  private hasOnlyKing(room: GameRoomInternal, color: PieceColor): boolean {
    let pieceCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = room.board[row][col];
        if (piece && piece.color === color) {
          if (piece.type !== 'king') return false;
          pieceCount++;
        }
      }
    }
    return pieceCount === 1;
  }

  offerDraw(socketId: string): { success: boolean; game?: GameRoomInternal; error?: string } {
    const room = this.getGameBySocket(socketId);
    if (!room) return { success: false, error: 'Not in a game' };
    if (!isLiveStatus(room.gameStatus)) return { success: false, error: 'Game not in progress' };

    const playerColor = room.whitePlayer?.socketId === socketId ? 'white' : 'black';
    if (room.drawOffer) return { success: false, error: 'Draw already offered' };

    room.drawOffer = { offeredBy: playerColor, timestamp: Date.now() };
    room.updatedAt = Date.now();

    return { success: true, game: room };
  }

  acceptDraw(socketId: string): { success: boolean; game?: GameRoomInternal; error?: string } {
    const room = this.getGameBySocket(socketId);
    if (!room) return { success: false, error: 'Not in a game' };
    if (!room.drawOffer) return { success: false, error: 'No draw offer' };

    const playerColor = room.whitePlayer?.socketId === socketId ? 'white' : 'black';
    if (room.drawOffer.offeredBy === playerColor) return { success: false, error: 'Cannot accept own draw offer' };

    room.gameStatus = 'draw';
    room.result = '1/2-1/2';
    room.drawOffer = null;
    room.clocks = stopClock(room.clocks, Date.now());
    room.updatedAt = Date.now();
    this.refreshLive(room);

    return { success: true, game: room };
  }

  declineDraw(socketId: string): { success: boolean; game?: GameRoomInternal; error?: string } {
    const room = this.getGameBySocket(socketId);
    if (!room) return { success: false, error: 'Not in a game' };
    if (!room.drawOffer) return { success: false, error: 'No draw offer' };

    const playerColor = room.whitePlayer?.socketId === socketId ? 'white' : 'black';
    if (room.drawOffer.offeredBy === playerColor) return { success: false, error: 'Cannot decline own draw offer' };

    room.drawOffer = null;
    room.updatedAt = Date.now();

    return { success: true, game: room };
  }

  resign(socketId: string): { success: boolean; game?: GameRoomInternal; error?: string } {
    const room = this.getGameBySocket(socketId);
    if (!room) return { success: false, error: 'Not in a game' };
    if (!isLiveStatus(room.gameStatus)) return { success: false, error: 'Game not in progress' };

    const playerColor = room.whitePlayer?.socketId === socketId ? 'white' : 'black';
    room.gameStatus = 'resigned';
    room.result = playerColor === 'white' ? '0-1' : '1-0';
    room.clocks = stopClock(room.clocks, Date.now());
    room.updatedAt = Date.now();
    this.refreshLive(room);

    return { success: true, game: room };
  }

  /**
   * Get authoritative clock state with elapsed time calculated
   */
  getCurrentClocks(gameId: string): ClockState | null {
    const room = this.rooms.get(gameId.toUpperCase());
    if (!room) return null;
    return getCurrentClockState(room.clocks, Date.now());
  }

  /**
   * Handle player reconnection - reattach the new socket to the seat the player
   * already holds. Identification is by the player's stable `id`, never by
   * socket id: the socket id is precisely what a reconnect changes.
   */
  reconnectPlayer(socketId: string, gameId: string, playerId?: string): { success: boolean; game?: GameRoomInternal; color?: PieceColor; error?: string } {
    const room = this.rooms.get(gameId);
    if (!room) return { success: false, error: 'Game not found' };

    let playerColor: PieceColor | null = null;

    if (playerId && room.whitePlayer?.id === playerId) {
      playerColor = 'white';
    } else if (playerId && room.blackPlayer?.id === playerId) {
      playerColor = 'black';
    } else if (room.whitePlayer?.socketId === socketId) {
      // Same socket re-issuing the request (never actually dropped).
      playerColor = 'white';
    } else if (room.blackPlayer?.socketId === socketId) {
      playerColor = 'black';
    } else {
      return { success: false, error: 'Not a participant in this game' };
    }

    if (playerColor === 'white') {
      room.whitePlayer = { ...room.whitePlayer!, connected: true, socketId };
    } else {
      room.blackPlayer = { ...room.blackPlayer!, connected: true, socketId };
    }

    this.playerToRoom.set(socketId, room.gameId);
    room.updatedAt = Date.now();

    return { success: true, game: room, color: playerColor };
  }

  /**
   * Reaps rooms nobody is coming back to. Tiered, because the cost of dropping
   * a room too early differs wildly by state — an abandoned mid-game room is
   * worth holding for a reconnect, an empty lobby is not. A single flat
   * 24-hour rule meant a create-and-drop loop could pin memory for a day.
   */
  cleanup(now = Date.now()): number {
    const { ttl } = config;
    let removed = 0;

    for (const room of this.rooms.values()) {
      const idleFor = now - room.updatedAt;
      const occupied = hasConnectedPlayer(room);
      const seated = (room.whitePlayer ? 1 : 0) + (room.blackPlayer ? 1 : 0);
      const started = room.gameStatus !== 'idle';

      let expired: boolean;
      if (occupied) {
        // Someone is still here. Only a lobby that never filled ages out.
        expired = !started && seated < 2 && idleFor > ttl.unstartedIdleMs;
      } else if (!started) {
        expired = idleFor > ttl.unstartedMs;
      } else if (isLiveStatus(room.gameStatus)) {
        expired = idleFor > ttl.abandonedMs;
      } else {
        expired = idleFor > ttl.finishedMs;
      }

      if (expired || idleFor > ttl.hardMs) {
        this.destroyRoom(room);
        removed++;
      }
    }

    return removed;
  }

  stats(): { rooms: number; liveGames: number; seatedPlayers: number; trackedSockets: number } {
    let seatedPlayers = 0;
    for (const room of this.rooms.values()) {
      if (room.whitePlayer) seatedPlayers++;
      if (room.blackPlayer) seatedPlayers++;
    }
    return {
      rooms: this.rooms.size,
      liveGames: this.liveGames.size,
      seatedPlayers,
      trackedSockets: this.playerToRoom.size,
    };
  }

  /**
   * How many of `ip`'s rooms would be freed by this socket leaving its seat: one
   * if it is the last occupant of a room opened from this address, zero
   * otherwise. Used so the per-address room cap counts what a client will hold
   * *after* the call, not before.
   */
  private roomsReleasedByVacating(socketId: string, ip: string): number {
    const gameId = this.playerToRoom.get(socketId);
    if (!gameId) return 0;

    const room = this.rooms.get(gameId);
    if (!room || room.creatorIp !== ip) return 0;

    const occupants = [room.whitePlayer, room.blackPlayer].filter(
      (seat) => seat && seat.socketId !== socketId,
    ).length;
    return occupants === 0 ? 1 : 0;
  }

  /**
   * Frees the seat this socket holds, ending the game if it was in progress
   * (nobody can play on a player short) and dropping the room once it is empty.
   */
  private vacateSeat(socketId: string): VacatedSeat | null {
    const gameId = this.playerToRoom.get(socketId);
    if (!gameId) return null;

    const room = this.rooms.get(gameId);
    if (!room) {
      this.playerToRoom.delete(socketId);
      return null;
    }

    let color: PieceColor;
    if (room.whitePlayer?.socketId === socketId) {
      color = 'white';
      room.whitePlayer = null;
    } else if (room.blackPlayer?.socketId === socketId) {
      color = 'black';
      room.blackPlayer = null;
    } else {
      this.playerToRoom.delete(socketId);
      return null;
    }

    this.playerToRoom.delete(socketId);
    room.updatedAt = Date.now();

    // A game in progress cannot continue a player short.
    if (isLiveStatus(room.gameStatus)) {
      room.gameStatus = 'resigned';
      room.result = color === 'white' ? '0-1' : '1-0';
      room.clocks = stopClock(room.clocks, Date.now());
    }
    this.refreshLive(room);

    const destroyed = !room.whitePlayer && !room.blackPlayer;
    if (destroyed) this.destroyRoom(room);

    return { room, color, destroyed };
  }

  /** The one place a room leaves memory, so no index can drift out of step. */
  private destroyRoom(room: GameRoomInternal): void {
    this.rooms.delete(room.gameId);
    this.liveGames.delete(room.gameId);

    for (const seat of [room.whitePlayer, room.blackPlayer]) {
      const socketId = seat?.socketId;
      if (socketId && this.playerToRoom.get(socketId) === room.gameId) {
        this.playerToRoom.delete(socketId);
      }
    }

    const owned = this.roomsByIp.get(room.creatorIp);
    if (owned) {
      owned.delete(room.gameId);
      if (owned.size === 0) this.roomsByIp.delete(room.creatorIp);
    }
  }

  /** Keeps the live-game index in step with a room's status. */
  private refreshLive(room: GameRoomInternal): void {
    if (isLiveStatus(room.gameStatus)) this.liveGames.add(room.gameId);
    else this.liveGames.delete(room.gameId);
  }

  /**
   * Eight hex characters of a uuid. Collisions are vanishingly unlikely but not
   * impossible, and one would hand a joiner somebody else's game, so the id is
   * checked against the rooms actually in memory.
   */
  private nextGameId(): string {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = uuidv4().slice(0, 8).toUpperCase();
      if (!this.rooms.has(candidate)) return candidate;
    }
    return uuidv4().slice(0, 8).toUpperCase();
  }
}

export const gameRoomManager = new GameRoomManager();
