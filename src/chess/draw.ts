import type {
  Board,
  Position,
  PieceColor,
  CastlingRights,
  Piece,
} from './types';
import { FILES, RANKS, isLightSquare } from './board';

/**
 * Generates a unique FEN-like position key for repetition checking.
 * Includes piece placement, active turn, castling rights, and en passant availability.
 */
export function getPositionKey(
  board: Board,
  turn: PieceColor,
  castlingRights: CastlingRights,
  enPassantTarget: Position | null,
): string {
  const rankStrings: string[] = [];

  for (let r = 0; r < 8; r++) {
    let rankStr = '';
    let emptyCount = 0;

    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount;
          emptyCount = 0;
        }
        const charMap: Record<string, string> = {
          pawn: 'p',
          knight: 'n',
          bishop: 'b',
          rook: 'r',
          queen: 'q',
          king: 'k',
        };
        const char = charMap[sq.type];
        rankStr += sq.color === 'white' ? char.toUpperCase() : char;
      }
    }
    if (emptyCount > 0) {
      rankStr += emptyCount;
    }
    rankStrings.push(rankStr);
  }

  const boardFen = rankStrings.join('/');
  const turnStr = turn === 'white' ? 'w' : 'b';

  let castlingStr = '';
  if (castlingRights.white.kingside) castlingStr += 'K';
  if (castlingRights.white.queenside) castlingStr += 'Q';
  if (castlingRights.black.kingside) castlingStr += 'k';
  if (castlingRights.black.queenside) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  const epStr = enPassantTarget
    ? `${FILES[enPassantTarget.col]}${RANKS[enPassantTarget.row]}`
    : '-';

  return `${boardFen} ${turnStr} ${castlingStr} ${epStr}`;
}

/**
 * Detects dead material (insufficient material to force checkmate).
 * Handles:
 * - King vs King
 * - King + Bishop vs King
 * - King + Knight vs King
 * - King + Bishop vs King + Bishop (where both bishops are on same-colored squares)
 */
export function isInsufficientMaterial(board: Board): boolean {
  const pieces: { piece: Piece; pos: Position }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) {
        pieces.push({ piece: sq, pos: { row: r, col: c } });
      }
    }
  }

  // 1. King vs King (2 pieces total)
  if (pieces.length === 2) {
    return true;
  }

  // 2. King + Minor Piece vs King (3 pieces total)
  if (pieces.length === 3) {
    const nonKings = pieces.filter((p) => p.piece.type !== 'king');
    if (nonKings.length === 1) {
      const minor = nonKings[0].piece.type;
      if (minor === 'bishop' || minor === 'knight') {
        return true;
      }
    }
  }

  // 3. King + Bishop vs King + Bishop (4 pieces total, same square color)
  if (pieces.length === 4) {
    const whiteBishop = pieces.find(
      (p) => p.piece.color === 'white' && p.piece.type === 'bishop',
    );
    const blackBishop = pieces.find(
      (p) => p.piece.color === 'black' && p.piece.type === 'bishop',
    );

    if (whiteBishop && blackBishop) {
      const wLight = isLightSquare(whiteBishop.pos.row, whiteBishop.pos.col);
      const bLight = isLightSquare(blackBishop.pos.row, blackBishop.pos.col);
      // Both bishops on the same color square -> Insufficient material
      if (wLight === bLight) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a specific color has insufficient material to checkmate.
 * Used for timeout rules: if the opponent has no mating material, timeout = draw.
 */
export function hasInsufficientMatingMaterial(board: Board, color: PieceColor): boolean {
  const pieces: { piece: Piece; pos: Position }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) {
        pieces.push({ piece: sq, pos: { row: r, col: c } });
      }
    }
  }

  // Get pieces for the given color
  const colorPieces = pieces.filter(p => p.piece.color === color);
  const opponentPieces = pieces.filter(p => p.piece.color !== color);

  // If color has only a king (no pieces that can mate)
  const nonKingPieces = colorPieces.filter(p => p.piece.type !== 'king');
  
  // If no non-king pieces, insufficient
  if (nonKingPieces.length === 0) {
    return true;
  }

  // If only one minor piece (bishop or knight) and opponent has only king
  if (nonKingPieces.length === 1) {
    const piece = nonKingPieces[0].piece.type;
    if ((piece === 'bishop' || piece === 'knight') && opponentPieces.length === 1) {
      // King + minor vs King = draw
      return true;
    }
  }

  // If two bishops of same color vs King (and no other pieces)
  if (nonKingPieces.length === 2 && opponentPieces.length === 1) {
    const bishops = nonKingPieces.filter(p => p.piece.type === 'bishop');
    if (bishops.length === 2) {
      const wLight = isLightSquare(bishops[0].pos.row, bishops[0].pos.col);
      const bLight = isLightSquare(bishops[1].pos.row, bishops[1].pos.col);
      if (wLight === bLight) {
        return true;
      }
    }
  }

  return false;
}
