import type { Board, Position, Piece, PieceType, PieceColor, CastlingRights } from './types.js';
import {
  isValidPosition,
  cloneBoard,
  getPieceAt,
  setPieceAt,
  squaresBetween,
  isSquareAttacked,
  isInCheck
} from './board.js';

export function getPawnMoves(board: Board, pos: Position, color: PieceColor, enPassantTarget: Position | null): Position[] {
  const moves: Position[] = [];
  const dir = color === 'white' ? -1 : 1;
  const startRow = color === 'white' ? 6 : 1;

  // Forward move
  const oneStep = { row: pos.row + dir, col: pos.col };
  if (isValidPosition(oneStep) && !getPieceAt(board, oneStep)) {
    moves.push(oneStep);
    // Double step from starting position
    const twoSteps = { row: pos.row + 2 * dir, col: pos.col };
    if (pos.row === startRow && isValidPosition(twoSteps) && !getPieceAt(board, twoSteps)) {
      moves.push(twoSteps);
    }
  }

  // Captures
  for (const dc of [-1, 1]) {
    const capturePos = { row: pos.row + dir, col: pos.col + dc };
    if (isValidPosition(capturePos)) {
      const target = getPieceAt(board, capturePos);
      if (target && target.color !== color) {
        moves.push(capturePos);
      } else if (enPassantTarget && capturePos.row === enPassantTarget.row && capturePos.col === enPassantTarget.col) {
        moves.push(capturePos);
      }
    }
  }

  return moves;
}

export function getKnightMoves(board: Board, pos: Position, color: PieceColor): Position[] {
  const moves: Position[] = [];
  const knightMoves = [
    { dr: -2, dc: -1 }, { dr: -2, dc: 1 }, { dr: 2, dc: -1 }, { dr: 2, dc: 1 },
    { dr: -1, dc: -2 }, { dr: -1, dc: 2 }, { dr: 1, dc: -2 }, { dr: 1, dc: 2 },
  ];
  for (const { dr, dc } of knightMoves) {
    const newPos = { row: pos.row + dr, col: pos.col + dc };
    if (isValidPosition(newPos)) {
      const target = getPieceAt(board, newPos);
      if (!target || target.color !== color) {
        moves.push(newPos);
      }
    }
  }
  return moves;
}

export function getSlidingMoves(board: Board, pos: Position, color: PieceColor, directions: { dr: number; dc: number }[]): Position[] {
  const moves: Position[] = [];
  for (const { dr, dc } of directions) {
    let r = pos.row + dr;
    let c = pos.col + dc;
    while (isValidPosition({ row: r, col: c })) {
      const target = getPieceAt(board, { row: r, col: c });
      if (target) {
        if (target.color !== color) {
          moves.push({ row: r, col: c });
        }
        break;
      }
      moves.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
  }
  return moves;
}

export function getBishopMoves(board: Board, pos: Position, color: PieceColor): Position[] {
  return getSlidingMoves(board, pos, color, [
    { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
  ]);
}

export function getRookMoves(board: Board, pos: Position, color: PieceColor): Position[] {
  return getSlidingMoves(board, pos, color, [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ]);
}

export function getQueenMoves(board: Board, pos: Position, color: PieceColor): Position[] {
  return getSlidingMoves(board, pos, color, [
    { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ]);
}

export function getKingMoves(board: Board, pos: Position, color: PieceColor, castlingRights: CastlingRights): Position[] {
  const moves: Position[] = [];
  const directions = [
    { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    { dr: 1, dc: -1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 },
  ];

  for (const { dr, dc } of directions) {
    const newPos = { row: pos.row + dr, col: pos.col + dc };
    if (isValidPosition(newPos)) {
      const target = getPieceAt(board, newPos);
      if (!target || target.color !== color) {
        moves.push(newPos);
      }
    }
  }

  // Castling
  const backRank = color === 'white' ? 7 : 0;
  if (pos.row === backRank && pos.col === 4) {
    // King-side castling
    const kingSideRights = color === 'white' ? castlingRights.white.kingSide : castlingRights.black.kingSide;
    if (kingSideRights) {
      const rookPos = { row: backRank, col: 7 };
      const rook = getPieceAt(board, rookPos);
      if (rook && rook.type === 'rook' && rook.color === color) {
        const between = squaresBetween(pos, rookPos);
        const allEmpty = between.every((p: Position) => !getPieceAt(board, p));
        const notInCheck = !isInCheck(board, color);
        const notThroughCheck = !between.some((p: Position) => isSquareAttacked(board, p, color === 'white' ? 'black' : 'white'));
        const notIntoCheck = !isSquareAttacked(board, { row: backRank, col: 6 }, color === 'white' ? 'black' : 'white');
        if (allEmpty && notInCheck && notThroughCheck && notIntoCheck) {
          moves.push({ row: backRank, col: 6 });
        }
      }
    }

    // Queen-side castling
    const queenSideRights = color === 'white' ? castlingRights.white.queenSide : castlingRights.black.queenSide;
    if (queenSideRights) {
      const rookPos = { row: backRank, col: 0 };
      const rook = getPieceAt(board, rookPos);
      if (rook && rook.type === 'rook' && rook.color === color) {
        const between = squaresBetween(pos, rookPos);
        const allEmpty = between.every((p: Position) => !getPieceAt(board, p));
        const notInCheck = !isInCheck(board, color);
        const notThroughCheck = !between.some((p: Position) => isSquareAttacked(board, p, color === 'white' ? 'black' : 'white'));
        const notIntoCheck = !isSquareAttacked(board, { row: backRank, col: 2 }, color === 'white' ? 'black' : 'white');
        if (allEmpty && notInCheck && notThroughCheck && notIntoCheck) {
          moves.push({ row: backRank, col: 2 });
        }
      }
    }
  }

  return moves;
}

export function getLegalMoves(
  board: Board, 
  pos: Position, 
  castlingRights: CastlingRights, 
  enPassantTarget: Position | null
): Position[] {
  const piece = getPieceAt(board, pos);
  if (!piece) return [];

  let moves: Position[] = [];

  switch (piece.type) {
    case 'pawn':
      moves = getPawnMoves(board, pos, piece.color, enPassantTarget);
      break;
    case 'knight':
      moves = getKnightMoves(board, pos, piece.color);
      break;
    case 'bishop':
      moves = getBishopMoves(board, pos, piece.color);
      break;
    case 'rook':
      moves = getRookMoves(board, pos, piece.color);
      break;
    case 'queen':
      moves = getQueenMoves(board, pos, piece.color);
      break;
    case 'king':
      moves = getKingMoves(board, pos, piece.color, castlingRights);
      break;
  }

  // Filter out moves that leave king in check
  return moves.filter(to => {
    const testBoard = cloneBoard(board);
    makeMoveOnBoard(testBoard, pos, to, piece, castlingRights, enPassantTarget);
    return !isInCheck(testBoard, piece.color);
  });
}

export function makeMoveOnBoard(
  board: Board,
  from: Position,
  to: Position,
  piece: Piece,
  castlingRights: CastlingRights,
  enPassantTarget: Position | null,
  /** Piece a promoting pawn becomes. Defaults to a queen when not supplied. */
  promotionChoice?: PieceType
): { capturedPiece: Piece | null; isCastling: boolean; isEnPassant: boolean; promotion: PieceType | null; nextEnPassantTarget: Position | null; nextCastlingRights: CastlingRights } {
  const capturedPiece = getPieceAt(board, to);
  let isCastling = false;
  let isEnPassant = false;
  let promotion: PieceType | null = null;
  const nextCastlingRights = { ...castlingRights, white: { ...castlingRights.white }, black: { ...castlingRights.black } };

  // Handle castling
  if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
    isCastling = true;
    const backRank = piece.color === 'white' ? 7 : 0;
    if (to.col === 6) { // King-side
      const rook = getPieceAt(board, { row: backRank, col: 7 });
      setPieceAt(board, { row: backRank, col: 5 }, rook);
      setPieceAt(board, { row: backRank, col: 7 }, null);
    } else if (to.col === 2) { // Queen-side
      const rook = getPieceAt(board, { row: backRank, col: 0 });
      setPieceAt(board, { row: backRank, col: 3 }, rook);
      setPieceAt(board, { row: backRank, col: 0 }, null);
    }
  }

  // Handle en passant
  if (piece.type === 'pawn' && enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col) {
    isEnPassant = true;
    const capturedPawnRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
    setPieceAt(board, { row: capturedPawnRow, col: to.col }, null);
  }

  // Handle promotion. Honour the player's choice — silently queening an
  // under-promotion would change the game (…=N with check is a real tactic).
  const promotionRank = piece.color === 'white' ? 0 : 7;
  if (piece.type === 'pawn' && to.row === promotionRank) {
    promotion = promotionChoice ?? 'queen';
    setPieceAt(board, to, { type: promotion, color: piece.color });
  } else {
    setPieceAt(board, to, piece);
  }

  setPieceAt(board, from, null);

  // Update castling rights
  if (piece.type === 'king') {
    if (piece.color === 'white') {
      nextCastlingRights.white.kingSide = false;
      nextCastlingRights.white.queenSide = false;
    } else {
      nextCastlingRights.black.kingSide = false;
      nextCastlingRights.black.queenSide = false;
    }
  }
  if (piece.type === 'rook') {
    if (piece.color === 'white') {
      if (from.row === 7 && from.col === 0) nextCastlingRights.white.queenSide = false;
      if (from.row === 7 && from.col === 7) nextCastlingRights.white.kingSide = false;
    } else {
      if (from.row === 0 && from.col === 0) nextCastlingRights.black.queenSide = false;
      if (from.row === 0 && from.col === 7) nextCastlingRights.black.kingSide = false;
    }
  }
  // If rook is captured, update castling rights
  if (capturedPiece && capturedPiece.type === 'rook') {
    if (capturedPiece.color === 'white') {
      if (to.row === 7 && to.col === 0) nextCastlingRights.white.queenSide = false;
      if (to.row === 7 && to.col === 7) nextCastlingRights.white.kingSide = false;
    } else {
      if (to.row === 0 && to.col === 0) nextCastlingRights.black.queenSide = false;
      if (to.row === 0 && to.col === 7) nextCastlingRights.black.kingSide = false;
    }
  }

  // Calculate next en passant target
  let nextEnPassantTarget: Position | null = null;
  if (piece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
    nextEnPassantTarget = { row: (from.row + to.row) / 2, col: from.col };
  }

  return { capturedPiece, isCastling, isEnPassant, promotion, nextEnPassantTarget, nextCastlingRights };
}