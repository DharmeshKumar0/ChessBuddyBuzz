import type { RateLimitRule } from './net/rateLimit.js';

/**
 * Every operational knob in one place, each overridable by environment
 * variable so a deployment can be re-tuned without a code change.
 *
 * The defaults are sized for one small instance serving a few hundred
 * concurrent games, and are deliberately generous for real play: the limits
 * exist to stop floods, not to get in the way of a bullet time scramble.
 */

function readInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    console.warn(`[config] ${name}="${raw}" is not a number >= ${min}; using ${fallback}`);
    return fallback;
  }
  return Math.floor(value);
}

function readFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[config] ${name}="${raw}" is not a positive number; using ${fallback}`);
    return fallback;
  }
  return value;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 0 ? values : fallback;
}

/** `burst` requests immediately, then `perSecond` sustained. */
function rule(prefix: string, burst: number, perSecond: number): RateLimitRule {
  return {
    burst: readInt(`${prefix}_BURST`, burst, 1),
    perSecond: readFloat(`${prefix}_PER_SECOND`, perSecond),
  };
}

const MINUTE = 60_000;

export const config = {
  port: readInt('PORT', 3001),
  corsOrigins: readList('CORS_ORIGINS', ['http://localhost:5173', 'http://localhost:3000']),

  /**
   * Behind a reverse proxy every connection appears to come from the proxy, so
   * per-IP limits would either be useless or lock everyone out together. Enable
   * this only when a proxy you control sets X-Forwarded-For.
   *
   * When on, the real client is read from X-Forwarded-For at a fixed offset from
   * the *right* (see trustProxyHops), never the left: a client can prepend
   * whatever it likes to that header, and the leftmost value is therefore
   * attacker-controlled. Reading from the right locks onto the address your own
   * proxy appended, which a client cannot forge.
   */
  trustProxy: readBool('TRUST_PROXY', false),

  /**
   * Number of trusted proxy hops between the public internet and this server —
   * i.e. how many entries at the end of X-Forwarded-For your infrastructure
   * appends. One LB or reverse proxy is 1 (the default). The client IP is taken
   * `trustProxyHops` positions from the right of the chain, so extra entries a
   * client prepends to spoof a different address are simply ignored. Only
   * consulted when trustProxy is on. Setting this too high lets a client spoof;
   * setting it too low keys everyone behind the proxy together — match it to the
   * real hop count.
   */
  trustProxyHops: readInt('TRUST_PROXY_HOPS', 1, 1),

  /**
   * Per-connection logging is a syscall per event; at a few thousand
   * connections it becomes the bottleneck, so it is off unless asked for.
   */
  verbose: readBool('VERBOSE', false),

  capacity: {
    /** Hard ceiling on concurrent sockets; the last accept beyond it is refused. */
    maxSockets: readInt('MAX_SOCKETS', 4_000, 1),
    /**
     * Concurrent sockets from one address. Several tabs are normal; hundreds are
     * not. Note that an office or mobile-carrier NAT is many real people sharing
     * one address — raise this (and MAX_ROOMS_PER_IP) if that is your audience.
     */
    maxSocketsPerIp: readInt('MAX_SOCKETS_PER_IP', 64, 1),
    /** Rooms held in memory server-wide. */
    maxRooms: readInt('MAX_ROOMS', 5_000, 1),
    /** Rooms one address may hold open at once. */
    maxRoomsPerIp: readInt('MAX_ROOMS_PER_IP', 10, 1),
    /** Largest incoming socket frame. Our biggest real message is a few hundred bytes. */
    maxMessageBytes: readInt('MAX_MESSAGE_BYTES', 16_384, 1_024),
    /** Largest HTTP body. There are no body-consuming routes; this is a floor, not a target. */
    maxJsonBytes: readInt('MAX_JSON_BYTES', 8_192, 1_024),
  },

  limits: {
    /** New connections from one address. Survives a reconnect storm after a wifi blip. */
    handshake: rule('RL_HANDSHAKE', 30, 3),
    /** All HTTP requests from one address. */
    http: rule('RL_HTTP', 60, 5),
    /**
     * Floor under *every* socket event, including ones we do not handle, so an
     * unknown-event flood costs a map lookup rather than a handler.
     */
    socketFloor: rule('RL_SOCKET_FLOOR', 40, 12),
    /**
     * Room creation, per address — one tab or ten share the budget. Memory is
     * already bounded by maxRoomsPerIp, so this only has to stop churn, which
     * lets it stay loose enough for a shared address.
     */
    createGame: rule('RL_CREATE_GAME', 5, 0.5),
    /**
     * Join attempts, per address. Also the brake on guessing room codes — though
     * with 8 hex characters, brute force is hopeless at any rate we would allow.
     */
    joinGame: rule('RL_JOIN_GAME', 10, 1),
    /** Moves, per socket. Bullet chess peaks around 4/second; this allows 6. */
    makeMove: rule('RL_MAKE_MOVE', 15, 6),
    /**
     * Rejected moves, per socket. Legal play never touches this; a client
     * hammering illegal moves is spending server CPU on move generation.
     */
    illegalMove: rule('RL_ILLEGAL_MOVE', 10, 0.5),
    /** Draw offers, resignations, leaves — per socket. Draw-offer spam is the vector. */
    gameAction: rule('RL_GAME_ACTION', 5, 0.15),
    /** Reconnect attempts, per socket. */
    reconnect: rule('RL_RECONNECT', 6, 0.25),
  },

  /**
   * Consecutive rejected events before the socket is closed. A well-behaved
   * client backs off; one that does not is cheaper to drop than to keep
   * refusing packet by packet.
   */
  maxViolationsBeforeDisconnect: readInt('MAX_VIOLATIONS', 25, 1),

  intervals: {
    /** Authoritative clock broadcast to each live game. */
    clockSyncMs: readInt('CLOCK_SYNC_MS', 1_000, 100),
    /** Room reaping and rate-limiter sweeping. */
    maintenanceMs: readInt('MAINTENANCE_MS', 60_000, 1_000),
  },

  /**
   * How long a room survives without connected players. Tiered, because the
   * cost of dropping a room too early differs wildly by state: an abandoned
   * mid-game room is worth holding for a reconnect, an empty lobby is not.
   * The old flat 24-hour rule meant a create-and-drop loop could pin memory
   * for a day.
   */
  ttl: {
    /** Created, never joined, creator gone. */
    unstartedMs: readInt('TTL_UNSTARTED_MS', 2 * MINUTE, 1_000),
    /** Created, never joined, creator still connected — a lobby nobody came to. */
    unstartedIdleMs: readInt('TTL_UNSTARTED_IDLE_MS', 30 * MINUTE, MINUTE),
    /** Finished game, nobody watching. */
    finishedMs: readInt('TTL_FINISHED_MS', 5 * MINUTE, 1_000),
    /** Game still live but both players dropped — held for reconnects. */
    abandonedMs: readInt('TTL_ABANDONED_MS', 30 * MINUTE, MINUTE),
    /** Backstop for anything the tiers above miss. */
    hardMs: readInt('TTL_HARD_MS', 6 * 60 * MINUTE, MINUTE),
  },
} as const;

export type Config = typeof config;
