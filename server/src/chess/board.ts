import type { Board, Piece, Position, PieceType, PieceColor, CastlingRights } from './types.js';

export function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));

  const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: pieceOrder[col], color: 'black' };
    board[1][col] = { type: 'pawn', color: 'black' };
    board[6][col] = { type: 'pawn', color: 'white' };
    board[7][col] = { type: pieceOrder[col], color: 'white' };
  }

  return board;
}

export function createInitialCastlingRights(): CastlingRights {
  return {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  };
}

export function isValidPosition(pos: Position): boolean {
  return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(piece => piece ? { ...piece } : null));
}

export function getPieceAt(board: Board, pos: Position): Piece | null {
  if (!isValidPosition(pos)) return null;
  return board[pos.row][pos.col];
}

export function setPieceAt(board: Board, pos: Position, piece: Piece | null): void {
  if (isValidPosition(pos)) {
    board[pos.row][pos.col] = piece;
  }
}

export function findKing(board: Board, color: PieceColor): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

export function squaresBetween(from: Position, to: Position): Position[] {
  const squares: Position[] = [];
  const dr = Math.sign(to.row - from.row);
  const dc = Math.sign(to.col - from.col);
  let r = from.row + dr;
  let c = from.col + dc;
  while (r !== to.row || c !== to.col) {
    squares.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  return squares;
}

export function isSquareAttacked(board: Board, pos: Position, byColor: PieceColor): boolean {
  const directions = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
  ];

  // Pawn attacks
  const pawnDir = byColor === 'white' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const r = pos.row + pawnDir;
    const c = pos.col + dc;
    if (isValidPosition({ row: r, col: c })) {
      const piece = board[r][c];
      if (piece && piece.type === 'pawn' && piece.color === byColor) return true;
    }
  }

  // Knight attacks
  const knightMoves = [
    { dr: -2, dc: -1 }, { dr: -2, dc: 1 }, { dr: 2, dc: -1 }, { dr: 2, dc: 1 },
    { dr: -1, dc: -2 }, { dr: -1, dc: 2 }, { dr: 1, dc: -2 }, { dr: 1, dc: 2 },
  ];
  for (const { dr, dc } of knightMoves) {
    const r = pos.row + dr;
    const c = pos.col + dc;
    if (isValidPosition({ row: r, col: c })) {
      const piece = board[r][c];
      if (piece && piece.type === 'knight' && piece.color === byColor) return true;
    }
  }

  // Sliding pieces (bishop, rook, queen)
  for (const { dr, dc } of directions) {
    let r = pos.row + dr;
    let c = pos.col + dc;
    while (isValidPosition({ row: r, col: c })) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === byColor) {
          const isDiagonal = Math.abs(dr) === Math.abs(dc);
          const isOrthogonal = dr === 0 || dc === 0;
          if (piece.type === 'queen' ||
              (isDiagonal && piece.type === 'bishop') ||
              (isOrthogonal && piece.type === 'rook') ||
              (piece.type === 'king' && Math.abs(r - pos.row) === 1 && Math.abs(c - pos.col) === 1)) {
            return true;
          }
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // King attacks (adjacent squares)
  for (const { dr, dc } of directions) {
    const r = pos.row + dr;
    const c = pos.col + dc;
    if (isValidPosition({ row: r, col: c })) {
      const piece = board[r][c];
      if (piece && piece.type === 'king' && piece.color === byColor) return true;
    }
  }

  return false;
}

export function isInCheck(board: Board, color: PieceColor): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isSquareAttacked(board, kingPos, color === 'white' ? 'black' : 'white');
}