import type { Board, Piece, PieceType, PieceColor } from './types';

function piece(type: PieceType, color: PieceColor): Piece {
  return { type, color };
}

function createBackRank(color: PieceColor): Piece[] {
  return [
    piece('rook', color),
    piece('knight', color),
    piece('bishop', color),
    piece('queen', color),
    piece('king', color),
    piece('bishop', color),
    piece('knight', color),
    piece('rook', color),
  ];
}

function createPawnRank(color: PieceColor): Piece[] {
  return Array.from({ length: 8 }, () => piece('pawn', color));
}

function createEmptyRank(): null[] {
  return Array.from({ length: 8 }, () => null);
}

/**
 * Creates the standard chess starting position.
 * board[0] = rank 8 (black back rank)
 * board[7] = rank 1 (white back rank)
 */
export function createInitialBoard(): Board {
  return [
    createBackRank('black'),   // rank 8
    createPawnRank('black'),   // rank 7
    createEmptyRank(),         // rank 6
    createEmptyRank(),         // rank 5
    createEmptyRank(),         // rank 4
    createEmptyRank(),         // rank 3
    createPawnRank('white'),   // rank 2
    createBackRank('white'),   // rank 1
  ];
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export function positionToAlgebraic(row: number, col: number): string {
  return `${FILES[col]}${RANKS[row]}`;
}

export function isLightSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

export const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

const INITIAL_PIECE_COUNTS: Record<PieceColor, Record<PieceType, number>> = {
  white: { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 },
  black: { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 },
};

export interface CapturedPiecesResult {
  whiteCaptured: Piece[]; // Black pieces that White captured
  blackCaptured: Piece[]; // White pieces that Black captured
  whiteScore: number;
  blackScore: number;
}

export function getCapturedPieces(board: Board): CapturedPiecesResult {
  const currentCounts: Record<PieceColor, Record<PieceType, number>> = {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) {
        currentCounts[sq.color][sq.type]++;
      }
    }
  }

  const whiteCaptured: Piece[] = [];
  const blackCaptured: Piece[] = [];

  const typesOrder: PieceType[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

  // Black pieces captured by White
  for (const t of typesOrder) {
    const missing = INITIAL_PIECE_COUNTS.black[t] - currentCounts.black[t];
    for (let i = 0; i < missing; i++) {
      whiteCaptured.push({ type: t, color: 'black' });
    }
  }

  // White pieces captured by Black
  for (const t of typesOrder) {
    const missing = INITIAL_PIECE_COUNTS.white[t] - currentCounts.white[t];
    for (let i = 0; i < missing; i++) {
      blackCaptured.push({ type: t, color: 'white' });
    }
  }

  let whiteVal = 0;
  let blackVal = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === 'white') whiteVal += PIECE_VALUES[sq.type];
        else blackVal += PIECE_VALUES[sq.type];
      }
    }
  }

  return {
    whiteCaptured,
    blackCaptured,
    whiteScore: whiteVal - blackVal,
    blackScore: blackVal - whiteVal,
  };
}
