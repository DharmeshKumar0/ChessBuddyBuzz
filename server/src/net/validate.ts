import type { PieceType, Position } from '../chess/types.js';

/**
 * Nothing that arrives over a socket can be trusted to have the shape its
 * TypeScript signature promises — the types are erased at runtime and any
 * client can emit whatever it likes. Every payload is normalised here before it
 * reaches the game logic.
 *
 * This is a scale concern as much as a safety one: an unbounded `playerName`
 * used to be stored on the room and echoed to everyone in it, so a single
 * oversized string turned into repeated broadcast traffic.
 */

export const MAX_NAME_LENGTH = 20;

/** Bounds the work done on a hostile string before it is trimmed to size. */
const MAX_RAW_NAME_LENGTH = 200;

/** Collapses whitespace runs so a name cannot be padded out to look empty. */
const WHITESPACE_RUNS = /\s+/g;

/**
 * Replaces C0/C1 control characters with a space, written as a code-point test
 * rather than a character class so the source stays plain ASCII (a literal NUL
 * in a regex literal is a trap for the next reader).
 *
 * Replacing rather than deleting matters: a tab between two words is a word
 * separator, and dropping it would turn "the\tGreat" into "theGreat". The
 * whitespace collapse below then folds the space away where it was not one.
 */
function replaceControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
  }
  return out;
}

export function sanitizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = trimTrailingSurrogate(
    replaceControlChars(value.slice(0, MAX_RAW_NAME_LENGTH))
      .replace(WHITESPACE_RUNS, ' ')
      .trim()
      .slice(0, MAX_NAME_LENGTH),
  ).trim(); // the length cap can land on a space, or inside an emoji
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Drops a high surrogate left dangling by the length cap. */
function trimTrailingSurrogate(value: string): string {
  const last = value.charCodeAt(value.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value;
}

/**
 * Room codes are the first 8 hex characters of a uuid, upper-cased. Anything
 * else is rejected outright rather than handed to the room lookup, so a
 * malformed id costs a regex instead of a map probe plus error handling.
 */
const GAME_ID = /^[0-9A-F]{8}$/;

export function normalizeGameId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length !== 8) return null;
  const upper = value.toUpperCase();
  return GAME_ID.test(upper) ? upper : null;
}

export function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const { row, col } = value as { row: unknown; col: unknown };
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row <= 7 &&
    col >= 0 &&
    col <= 7
  );
}

/**
 * A pawn may only become a queen, rook, bishop or knight. The move generator
 * honours whatever type it is handed, so without this check a client could
 * promote to a second king and leave the board in a state check detection has
 * no answer for.
 */
const PROMOTABLE: ReadonlySet<string> = new Set(['queen', 'rook', 'bishop', 'knight']);

export function normalizePromotion(
  value: unknown,
): { ok: true; promotion?: PieceType } | { ok: false } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value === 'string' && PROMOTABLE.has(value)) {
    return { ok: true, promotion: value as PieceType };
  }
  return { ok: false };
}

/**
 * Time controls are matched against a fixed table downstream, which already
 * falls back to a default. The length cap just keeps a megabyte-long string
 * from reaching the comparison.
 */
export function sanitizeTimeControl(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 16) : '';
}

export function normalizeColorChoice(value: unknown): 'white' | 'black' | 'random' | undefined {
  return value === 'white' || value === 'black' || value === 'random' ? value : undefined;
}

/** Player ids are uuids; anything else cannot match a seat, so drop it early. */
export function sanitizePlayerId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
}
