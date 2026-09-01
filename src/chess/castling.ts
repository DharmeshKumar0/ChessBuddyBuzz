import type { Board, Position, PieceColor, CastlingRights } from './types';
import { isSquareAttacked } from './check';

export function canCastleKingside(
  board: Board,
  color: PieceColor,
  rights: CastlingRights,
): boolean {
  if (!rights[color].kingside) return false;

  const row = color === 'white' ? 7 : 0;
  const king = board[row][4];
  const rook = board[row][7];

  // Must have King and Rook in original positions
  if (!king || king.type !== 'king' || king.color !== color) return false;
  if (!rook || rook.type !== 'rook' || rook.color !== color) return false;

  // Intervening squares must be empty (f1, g1 / f8, g8)
  if (board[row][5] !== null || board[row][6] !== null) return false;

  // King must not be in check, pass through check, or land in check
  const opponentColor: PieceColor = color === 'white' ? 'black' : 'white';
  if (
    isSquareAttacked(board, { row, col: 4 }, opponentColor) ||
    isSquareAttacked(board, { row, col: 5 }, opponentColor) ||
    isSquareAttacked(board, { row, col: 6 }, opponentColor)
  ) {
    return false;
  }

  return true;
}

export function canCastleQueenside(
  board: Board,
  color: PieceColor,
  rights: CastlingRights,
): boolean {
  if (!rights[color].queenside) return false;

  const row = color === 'white' ? 7 : 0;
  const king = board[row][4];
  const rook = board[row][0];

  // Must have King and Rook in original positions
  if (!king || king.type !== 'king' || king.color !== color) return false;
  if (!rook || rook.type !== 'rook' || rook.color !== color) return false;

  // Intervening squares must be empty (b1, c1, d1 / b8, c8, d8)
  if (
    board[row][1] !== null ||
    board[row][2] !== null ||
    board[row][3] !== null
  ) {
    return false;
  }

  // King must not be in check, pass through check, or land in check (e, d, c)
  const opponentColor: PieceColor = color === 'white' ? 'black' : 'white';
  if (
    isSquareAttacked(board, { row, col: 4 }, opponentColor) ||
    isSquareAttacked(board, { row, col: 3 }, opponentColor) ||
    isSquareAttacked(board, { row, col: 2 }, opponentColor)
  ) {
    return false;
  }

  return true;
}

export function getCastlingMoves(
  board: Board,
  color: PieceColor,
  rights: CastlingRights,
): Position[] {
  const moves: Position[] = [];
  const row = color === 'white' ? 7 : 0;

  if (canCastleKingside(board, color, rights)) {
    moves.push({ row, col: 6 });
  }

  if (canCastleQueenside(board, color, rights)) {
    moves.push({ row, col: 2 });
  }

  return moves;
}

export function updateCastlingRights(
  rights: CastlingRights,
  from: Position,
  to: Position,
  pieceType: string,
  pieceColor: PieceColor,
  capturedPieceType?: string,
): CastlingRights {
  const nextRights: CastlingRights = {
    white: { ...rights.white },
    black: { ...rights.black },
  };

  // 1. King moves -> loses both rights
  if (pieceType === 'king') {
    nextRights[pieceColor].kingside = false;
    nextRights[pieceColor].queenside = false;
  }

  // 2. Rook moves from initial square -> loses relevant right
  if (pieceType === 'rook') {
    if (from.row === 7 && from.col === 7) nextRights.white.kingside = false;
    if (from.row === 7 && from.col === 0) nextRights.white.queenside = false;
    if (from.row === 0 && from.col === 7) nextRights.black.kingside = false;
    if (from.row === 0 && from.col === 0) nextRights.black.queenside = false;
  }

  // 3. Enemy Rook captured on initial square -> loses relevant right
  if (capturedPieceType === 'rook') {
    if (to.row === 7 && to.col === 7) nextRights.white.kingside = false;
    if (to.row === 7 && to.col === 0) nextRights.white.queenside = false;
    if (to.row === 0 && to.col === 7) nextRights.black.kingside = false;
    if (to.row === 0 && to.col === 0) nextRights.black.queenside = false;
  }

  return nextRights;
}

export function performCastlingBoardUpdate(
  board: Board,
  color: PieceColor,
  side: 'kingside' | 'queenside',
): Board {
  const newBoard = board.map((row) => [...row]);
  const row = color === 'white' ? 7 : 0;
  const king = newBoard[row][4];

  if (side === 'kingside') {
    const rook = newBoard[row][7];
    newBoard[row][6] = king;
    newBoard[row][5] = rook;
    newBoard[row][4] = null;
    newBoard[row][7] = null;
  } else {
    const rook = newBoard[row][0];
    newBoard[row][2] = king;
    newBoard[row][3] = rook;
    newBoard[row][4] = null;
    newBoard[row][0] = null;
  }

  return newBoard;
}
