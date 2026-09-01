import type { Board, Position, Piece, PieceType, PieceColor, CastlingRights } from './types.js';
import { getPieceAt } from './board.js';
import { getLegalMoves } from './moves.js';

const FILES = 'abcdefgh';
const RANKS = '87654321';

/**
 * FEN/SAN letter for each piece type. Must not be derived from the type name's
 * first letter: 'knight' and 'king' both start with 'k'.
 */
const PIECE_TO_FEN: Record<PieceType, string> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export function squareToAlgebraic(pos: Position): string {
  return FILES[pos.col] + RANKS[pos.row];
}

export function algebraicToSquare(alg: string): Position | null {
  if (alg.length !== 2) return null;
  const file = FILES.indexOf(alg[0]);
  const rank = RANKS.indexOf(alg[1]);
  if (file === -1 || rank === -1) return null;
  return { row: rank, col: file };
}

export function generateSAN(
  board: Board,
  from: Position,
  to: Position,
  piece: Piece,
  capturedPiece: Piece | null,
  promotion: PieceType | null,
  isCastling: boolean,
  isEnPassant: boolean,
  castlingRights: CastlingRights,
  enPassantTarget: Position | null
): string {
  if (isCastling) {
    return to.col === 6 ? 'O-O' : 'O-O-O';
  }

  const pieceChar = piece.type === 'pawn' ? '' : PIECE_TO_FEN[piece.type].toUpperCase();
  let san = pieceChar;

  if (piece.type !== 'pawn') {
    // Disambiguation is about rival *movers*: any other piece of the same type
    // and colour that could also legally reach `to`. Scan the board for those
    // and qualify by the file or rank they disagree on.
    const rivals: Position[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row === from.row && col === from.col) continue;
        const other = getPieceAt(board, { row, col });
        if (!other || other.type !== piece.type || other.color !== piece.color) continue;

        const rivalMoves = getLegalMoves(board, { row, col }, castlingRights, enPassantTarget);
        if (rivalMoves.some((m: Position) => m.row === to.row && m.col === to.col)) {
          rivals.push({ row, col });
        }
      }
    }

    if (rivals.length > 0) {
      const sameFile = rivals.some((p) => p.col === from.col);
      const sameRank = rivals.some((p) => p.row === from.row);

      if (!sameFile) {
        san += FILES[from.col];
      } else if (!sameRank) {
        san += RANKS[from.row];
      } else {
        san += FILES[from.col] + RANKS[from.row];
      }
    }
  } else if (capturedPiece || isEnPassant) {
    san += FILES[from.col];
  }

  if (capturedPiece || isEnPassant) {
    san += 'x';
  }

  san += squareToAlgebraic(to);

  if (promotion) {
    san += '=' + PIECE_TO_FEN[promotion].toUpperCase();
  }

  return san;
}

export function parseFEN(fen: string): { board: Board; turn: PieceColor; castlingRights: CastlingRights; enPassantTarget: Position | null; halfmoveClock: number; fullmoveNumber: number } {
  const parts = fen.split(' ');
  if (parts.length !== 6) throw new Error('Invalid FEN');

  // Must start empty. Seeding from createInitialBoard() only ever *wrote* the
  // squares the FEN names, so every square the FEN reports as empty kept its
  // opening-position piece and any parsed mid-game position came back corrupt.
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const rows = parts[0].split('/');

  for (let row = 0; row < 8; row++) {
    let col = 0;
    for (const char of rows[row]) {
      if (char >= '1' && char <= '8') {
        col += parseInt(char, 10);
      } else {
        const color: PieceColor = char === char.toUpperCase() ? 'white' : 'black';
        const typeMap: Record<string, PieceType> = {
          p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king'
        };
        const type = typeMap[char.toLowerCase()];
        if (type) {
          board[row][col] = { type, color };
          col++;
        }
      }
    }
  }

  const turn: PieceColor = parts[1] === 'w' ? 'white' : 'black';

  // Rights are exactly what the field lists. Starting from
  // createInitialCastlingRights() (all true) and only ever setting true meant a
  // revoked right could never be parsed back out of a FEN.
  const castlingRights: CastlingRights = {
    white: { kingSide: parts[2].includes('K'), queenSide: parts[2].includes('Q') },
    black: { kingSide: parts[2].includes('k'), queenSide: parts[2].includes('q') },
  };

  let enPassantTarget: Position | null = null;
  if (parts[3] !== '-') {
    enPassantTarget = algebraicToSquare(parts[3]);
  }

  const halfmoveClock = parseInt(parts[4], 10);
  const fullmoveNumber = parseInt(parts[5], 10);

  return { board, turn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber };
}

export function generateFEN(
  board: Board,
  turn: PieceColor,
  castlingRights: CastlingRights,
  enPassantTarget: Position | null,
  halfmoveClock: number,
  fullmoveNumber: number
): string {
  let fen = '';
  
  for (let row = 0; row < 8; row++) {
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        const char = PIECE_TO_FEN[piece.type].toUpperCase();
        fen += piece.color === 'white' ? char : char.toLowerCase();
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) fen += emptyCount;
    if (row < 7) fen += '/';
  }

  fen += ' ' + (turn === 'white' ? 'w' : 'b');

  let castlingStr = '';
  if (castlingRights.white.kingSide) castlingStr += 'K';
  if (castlingRights.white.queenSide) castlingStr += 'Q';
  if (castlingRights.black.kingSide) castlingStr += 'k';
  if (castlingRights.black.queenSide) castlingStr += 'q';
  fen += ' ' + (castlingStr || '-');

  fen += ' ' + (enPassantTarget ? squareToAlgebraic(enPassantTarget) : '-');

  fen += ' ' + halfmoveClock;
  fen += ' ' + fullmoveNumber;

  return fen;
}