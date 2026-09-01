import type { Board, Piece, Position, PieceColor } from './types';

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getPawnMoves(
  board: Board,
  pos: Position,
  piece: Piece,
  enPassantTarget?: Position | null,
): Position[] {
  const moves: Position[] = [];
  const dir = piece.color === 'white' ? -1 : 1;
  const startRow = piece.color === 'white' ? 6 : 1;

  // Forward 1
  const f1Row = pos.row + dir;
  if (isInBounds(f1Row, pos.col) && board[f1Row][pos.col] === null) {
    moves.push({ row: f1Row, col: pos.col });

    // Forward 2 from initial rank
    const f2Row = pos.row + 2 * dir;
    if (pos.row === startRow && isInBounds(f2Row, pos.col) && board[f2Row][pos.col] === null) {
      moves.push({ row: f2Row, col: pos.col });
    }
  }

  // Diagonal captures (standard enemy piece OR En Passant target)
  const captureCols = [pos.col - 1, pos.col + 1];
  for (const c of captureCols) {
    if (isInBounds(f1Row, c)) {
      const target = board[f1Row][c];
      if (target !== null && target.color !== piece.color) {
        moves.push({ row: f1Row, col: c });
      } else if (
        enPassantTarget &&
        enPassantTarget.row === f1Row &&
        enPassantTarget.col === c
      ) {
        moves.push({ row: f1Row, col: c });
      }
    }
  }

  return moves;
}

function getKnightMoves(board: Board, pos: Position, piece: Piece): Position[] {
  const moves: Position[] = [];
  const offsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];

  for (const [dr, dc] of offsets) {
    const r = pos.row + dr;
    const c = pos.col + dc;
    if (isInBounds(r, c)) {
      const target = board[r][c];
      if (target === null || target.color !== piece.color) {
        moves.push({ row: r, col: c });
      }
    }
  }

  return moves;
}

function getSlidingMoves(
  board: Board,
  pos: Position,
  piece: Piece,
  directions: [number, number][],
): Position[] {
  const moves: Position[] = [];

  for (const [dr, dc] of directions) {
    let r = pos.row + dr;
    let c = pos.col + dc;

    while (isInBounds(r, c)) {
      const target = board[r][c];
      if (target === null) {
        moves.push({ row: r, col: c });
      } else {
        if (target.color !== piece.color) {
          moves.push({ row: r, col: c });
        }
        break; // Blocked by piece (friendly or enemy)
      }
      r += dr;
      c += dc;
    }
  }

  return moves;
}

function getBishopMoves(board: Board, pos: Position, piece: Piece): Position[] {
  const directions: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  return getSlidingMoves(board, pos, piece, directions);
}

function getRookMoves(board: Board, pos: Position, piece: Piece): Position[] {
  const directions: [number, number][] = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  return getSlidingMoves(board, pos, piece, directions);
}

function getQueenMoves(board: Board, pos: Position, piece: Piece): Position[] {
  const directions: [number, number][] = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  return getSlidingMoves(board, pos, piece, directions);
}

function getKingMoves(board: Board, pos: Position, piece: Piece): Position[] {
  const moves: Position[] = [];
  const offsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  for (const [dr, dc] of offsets) {
    const r = pos.row + dr;
    const c = pos.col + dc;
    if (isInBounds(r, c)) {
      const target = board[r][c];
      if (target === null || target.color !== piece.color) {
        moves.push({ row: r, col: c });
      }
    }
  }

  return moves;
}

/**
 * Generates all pseudo-legal destination squares for a piece at `pos`.
 */
export function getPossibleMoves(
  board: Board,
  pos: Position,
  enPassantTarget?: Position | null,
): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  switch (piece.type) {
    case 'pawn':
      return getPawnMoves(board, pos, piece, enPassantTarget);
    case 'knight':
      return getKnightMoves(board, pos, piece);
    case 'bishop':
      return getBishopMoves(board, pos, piece);
    case 'rook':
      return getRookMoves(board, pos, piece);
    case 'queen':
      return getQueenMoves(board, pos, piece);
    case 'king':
      return getKingMoves(board, pos, piece);
    default:
      return [];
  }
}

/**
 * Validates whether moving a piece from `from` to `to` is valid for the current turn player.
 */
export function isValidMove(
  board: Board,
  from: Position,
  to: Position,
  currentTurn: PieceColor,
  enPassantTarget?: Position | null,
): boolean {
  const piece = board[from.row][from.col];
  if (!piece || piece.color !== currentTurn) {
    return false;
  }

  const possible = getPossibleMoves(board, from, enPassantTarget);
  return possible.some((p) => p.row === to.row && p.col === to.col);
}
