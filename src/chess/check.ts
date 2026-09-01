import type { Board, Position, PieceColor, CastlingRights } from './types';
import { isInBounds, getPossibleMoves } from './moves';
import { getCastlingMoves } from './castling';

/**
 * Finds the position of a King of the specified color.
 */
export function findKing(board: Board, color: PieceColor): Position | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === 'king' && sq.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

/**
 * Checks whether targetPos is under attack by any piece of attackerColor.
 */
export function isSquareAttacked(
  board: Board,
  targetPos: Position,
  attackerColor: PieceColor,
): boolean {
  // 1. Pawn attacks
  const pawnRowOffset = attackerColor === 'white' ? 1 : -1;
  const pRow = targetPos.row + pawnRowOffset;
  const pCols = [targetPos.col - 1, targetPos.col + 1];

  for (const pCol of pCols) {
    if (isInBounds(pRow, pCol)) {
      const sq = board[pRow][pCol];
      if (sq && sq.type === 'pawn' && sq.color === attackerColor) {
        return true;
      }
    }
  }

  // 2. Knight attacks
  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const r = targetPos.row + dr;
    const c = targetPos.col + dc;
    if (isInBounds(r, c)) {
      const sq = board[r][c];
      if (sq && sq.type === 'knight' && sq.color === attackerColor) {
        return true;
      }
    }
  }

  // 3. Orthogonal rays (Rook / Queen)
  const orthoDirs: [number, number][] = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  for (const [dr, dc] of orthoDirs) {
    let r = targetPos.row + dr;
    let c = targetPos.col + dc;
    while (isInBounds(r, c)) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === attackerColor && (sq.type === 'rook' || sq.type === 'queen')) {
          return true;
        }
        break; // Ray blocked
      }
      r += dr;
      c += dc;
    }
  }

  // 4. Diagonal rays (Bishop / Queen)
  const diagDirs: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  for (const [dr, dc] of diagDirs) {
    let r = targetPos.row + dr;
    let c = targetPos.col + dc;
    while (isInBounds(r, c)) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === attackerColor && (sq.type === 'bishop' || sq.type === 'queen')) {
          return true;
        }
        break; // Ray blocked
      }
      r += dr;
      c += dc;
    }
  }

  // 5. King attacks (adjacent squares)
  const kingOffsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];
  for (const [dr, dc] of kingOffsets) {
    const r = targetPos.row + dr;
    const c = targetPos.col + dc;
    if (isInBounds(r, c)) {
      const sq = board[r][c];
      if (sq && sq.type === 'king' && sq.color === attackerColor) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether the King of `color` is currently in check.
 */
export function isKingInCheck(board: Board, color: PieceColor): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const opponentColor: PieceColor = color === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPos, opponentColor);
}

/**
 * Generates all strictly legal moves for a piece at `pos`.
 * Filters out pseudo-legal moves that would leave own King in check.
 * Also includes castling moves if piece is a King and castlingRights provided.
 */
export function getLegalMoves(
  board: Board,
  pos: Position,
  castlingRights?: CastlingRights,
  enPassantTarget?: Position | null,
): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  const pseudoMoves = getPossibleMoves(board, pos, enPassantTarget);
  const legalMoves: Position[] = [];

  for (const movePos of pseudoMoves) {
    const simBoard = board.map((row) => [...row]);

    // Check if this move is an En Passant capture
    const isEnPassant =
      piece.type === 'pawn' &&
      enPassantTarget &&
      movePos.row === enPassantTarget.row &&
      movePos.col === enPassantTarget.col;

    if (isEnPassant) {
      simBoard[movePos.row][movePos.col] = piece;
      simBoard[pos.row][pos.col] = null;
      simBoard[pos.row][movePos.col] = null; // Remove captured pawn
    } else {
      simBoard[movePos.row][movePos.col] = piece;
      simBoard[pos.row][pos.col] = null;
    }

    if (!isKingInCheck(simBoard, piece.color)) {
      legalMoves.push(movePos);
    }
  }

  // Include castling moves if piece is a King
  if (piece.type === 'king' && castlingRights) {
    const castlingTargets = getCastlingMoves(board, piece.color, castlingRights);
    legalMoves.push(...castlingTargets);
  }

  return legalMoves;
}

/**
 * Checks if the player of `color` has any legal moves available.
 */
export function hasAnyLegalMoves(
  board: Board,
  color: PieceColor,
  castlingRights?: CastlingRights,
  enPassantTarget?: Position | null,
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.color === color) {
        const moves = getLegalMoves(board, { row: r, col: c }, castlingRights, enPassantTarget);
        if (moves.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}
