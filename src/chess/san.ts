import type { Board, Position, Piece, PieceType, PieceColor, Move, CastlingRights } from './types';
import { isSquareAttacked, getLegalMoves } from './check';
import { FILES, RANKS, positionToAlgebraic } from './board';

/**
 * Generates Standard Algebraic Notation (SAN) for a move.
 */
export function generateSAN(
  board: Board,
  move: Move,
  castlingRights?: CastlingRights,
): string {
  const { piece, from, to, capturedPiece, promotion, isCastling, isEnPassant } = move;

  // Castling
  if (isCastling) return to.col === 6 ? 'O-O' : 'O-O-O';

  const dest = positionToAlgebraic(to.row, to.col);
  const pieceLetter = getPieceLetter(piece.type);

  // Pawn moves
  if (piece.type === 'pawn') {
    let san = '';

    if (capturedPiece || isEnPassant) {
      // Pawn capture includes originating file
      san += FILES[from.col] + 'x' + dest;
    } else {
      // Simple pawn move
      san += dest;
    }

    // Promotion
    if (promotion) {
      san += '=' + getPieceLetter(promotion);
    }

    return san;
  }

  // Piece moves (Knight, Bishop, Rook, Queen, King)
  let san = pieceLetter;

  // Check for disambiguation
  const disambiguation = getDisambiguation(board, piece, from, to, castlingRights);
  if (disambiguation) {
    san += disambiguation;
  }

  // Capture
  if (capturedPiece) {
    san += 'x';
  }

  // Destination
  san += dest;

  // Promotion
  if (promotion) {
    san += '=' + getPieceLetter(promotion);
  }

  return san;
}

function getPieceLetter(type: PieceType): string {
  const letters: Record<PieceType, string> = {
    king: 'K',
    queen: 'Q',
    rook: 'R',
    bishop: 'B',
    knight: 'N',
    pawn: '',
  };
  return letters[type];
}

/**
 * Determines if disambiguation is needed and returns the appropriate file/rank/square.
 */
function getDisambiguation(
  board: Board,
  piece: Piece,
  from: Position,
  to: Position,
  castlingRights?: CastlingRights,
): string | null {
  // Find all other pieces of same type and color that can move to the destination
  const sameColorPieces: Position[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (
        sq &&
        sq.type === piece.type &&
        sq.color === piece.color &&
        !(r === from.row && c === from.col)
      ) {
        // Check if this piece can also move to the target square
        const legalMoves = getLegalMoves(board, { row: r, col: c }, castlingRights);
        if (legalMoves.some((m) => m.row === to.row && m.col === to.col)) {
          sameColorPieces.push({ row: r, col: c });
        }
      }
    }
  }

  if (sameColorPieces.length === 0) {
    return null; // No disambiguation needed
  }

  // Check if file disambiguation is sufficient
  const sameFile = sameColorPieces.some((p) => p.col === from.col);
  const sameRank = sameColorPieces.some((p) => p.row === from.row);

  if (!sameFile) {
    // File is enough to disambiguate
    return FILES[from.col];
  }

  if (!sameRank) {
    // Rank is enough to disambiguate
    return String(RANKS[from.row]);
  }

  // Both file and rank needed
  return FILES[from.col] + RANKS[from.row];
}

/**
 * Appends check/checkmate suffix if applicable.
 */
export function appendCheckStatus(san: string, board: Board, move: Move, castlingRights?: CastlingRights): string {
  // Simulate the move to check for check/checkmate
  const newBoard = simulateMove(board, move);
  const opponentColor = move.piece.color === 'white' ? 'black' : 'white';

  const inCheck = isSquareAttacked(
    newBoard,
    findKing(newBoard, opponentColor)!,
    move.piece.color,
  );

  if (!inCheck) return san;

  const opponentCanMove = hasAnyLegalMove(newBoard, opponentColor, castlingRights);

  if (!opponentCanMove) {
    return san + '#';
  }

  return san + '+';
}

function findKing(board: Board, color: PieceColor): Position | null {
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

function hasAnyLegalMove(board: Board, color: PieceColor, castlingRights?: CastlingRights): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.color === color) {
        const moves = getLegalMoves(board, { row: r, col: c }, castlingRights);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

function simulateMove(board: Board, move: Move): Board {
  const newBoard = board.map((row) => [...row]);
  const { from, to, piece, promotion, isCastling, isEnPassant } = move;

  if (isCastling) {
    const row = piece.color === 'white' ? 7 : 0;
    if (to.col === 6) { // kingside
      newBoard[row][6] = piece;
      newBoard[row][5] = newBoard[row][7];
      newBoard[row][4] = null;
      newBoard[row][7] = null;
    } else { // queenside
      newBoard[row][2] = piece;
      newBoard[row][3] = newBoard[row][0];
      newBoard[row][4] = null;
      newBoard[row][0] = null;
    }
  } else if (isEnPassant) {
    newBoard[to.row][to.col] = piece;
    newBoard[from.row][from.col] = null;
    newBoard[from.row][to.col] = null; // Remove captured pawn
  } else {
    newBoard[to.row][to.col] = promotion
      ? { type: promotion, color: piece.color }
      : piece;
    newBoard[from.row][from.col] = null;
  }

  return newBoard;
}