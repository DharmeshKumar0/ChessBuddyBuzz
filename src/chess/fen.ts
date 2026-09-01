import type { Board, Position, PieceColor, CastlingRights } from './types';
import { FILES, RANKS } from './board';
import { createInitialCastlingRights } from './types';

/**
 * Generates a FEN string from the current game state.
 */
export function generateFEN(
  board: Board,
  turn: PieceColor,
  castlingRights: CastlingRights,
  enPassantTarget: Position | null,
  halfmoveClock: number,
  fullmoveNumber: number,
): string {
  // 1. Piece placement
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

  // 2. Active color
  const turnStr = turn === 'white' ? 'w' : 'b';

  // 3. Castling rights
  let castlingStr = '';
  if (castlingRights.white.kingside) castlingStr += 'K';
  if (castlingRights.white.queenside) castlingStr += 'Q';
  if (castlingRights.black.kingside) castlingStr += 'k';
  if (castlingRights.black.queenside) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  // 4. En passant target
  const epStr = enPassantTarget
    ? `${FILES[enPassantTarget.col]}${RANKS[enPassantTarget.row]}`
    : '-';

  // 5. Halfmove clock
  const halfmoveStr = String(halfmoveClock);

  // 6. Fullmove number
  const fullmoveStr = String(fullmoveNumber);

  return `${boardFen} ${turnStr} ${castlingStr} ${epStr} ${halfmoveStr} ${fullmoveStr}`;
}

/**
 * Parses a FEN string and returns the game state.
 * Throws if FEN is invalid.
 */
export function parseFEN(fen: string): {
  board: Board;
  turn: PieceColor;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
} {
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 6) {
    throw new Error('Invalid FEN: must have 6 fields');
  }

  const [boardFen, turnStr, castlingStr, epStr, halfmoveStr, fullmoveStr] = parts;

  // Parse piece placement
  const board: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

  const ranks = boardFen.split('/');
  if (ranks.length !== 8) {
    throw new Error('Invalid FEN: board must have 8 ranks');
  }

  for (let r = 0; r < 8; r++) {
    const rank = ranks[r];
    let c = 0;

    for (const char of rank) {
      if (c >= 8) {
        throw new Error(`Invalid FEN: rank ${8 - r} has too many squares`);
      }

      if (char >= '1' && char <= '8') {
        const emptyCount = parseInt(char, 10);
        c += emptyCount;
      } else {
        const charMap: Record<string, { type: string; color: PieceColor }> = {
          P: { type: 'pawn', color: 'white' },
          N: { type: 'knight', color: 'white' },
          B: { type: 'bishop', color: 'white' },
          R: { type: 'rook', color: 'white' },
          Q: { type: 'queen', color: 'white' },
          K: { type: 'king', color: 'white' },
          p: { type: 'pawn', color: 'black' },
          n: { type: 'knight', color: 'black' },
          b: { type: 'bishop', color: 'black' },
          r: { type: 'rook', color: 'black' },
          q: { type: 'queen', color: 'black' },
          k: { type: 'king', color: 'black' },
        };

        const pieceInfo = charMap[char];
        if (!pieceInfo) {
          throw new Error(`Invalid FEN: unknown piece character '${char}'`);
        }

        board[r][c] = {
          type: pieceInfo.type as 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king',
          color: pieceInfo.color,
        };
        c++;
      }
    }

    if (c !== 8) {
      throw new Error(`Invalid FEN: rank ${8 - r} does not have 8 squares`);
    }
  }

  // Parse active color
  if (turnStr !== 'w' && turnStr !== 'b') {
    throw new Error('Invalid FEN: active color must be w or b');
  }
  const turn: PieceColor = turnStr === 'w' ? 'white' : 'black';

  // Parse castling rights
  const castlingRights = createInitialCastlingRights();
  castlingRights.white.kingside = false;
  castlingRights.white.queenside = false;
  castlingRights.black.kingside = false;
  castlingRights.black.queenside = false;

  if (castlingStr !== '-') {
    for (const char of castlingStr) {
      switch (char) {
        case 'K':
          castlingRights.white.kingside = true;
          break;
        case 'Q':
          castlingRights.white.queenside = true;
          break;
        case 'k':
          castlingRights.black.kingside = true;
          break;
        case 'q':
          castlingRights.black.queenside = true;
          break;
        default:
          throw new Error(`Invalid FEN: unknown castling character '${char}'`);
      }
    }
  }

  // Parse en passant target
  let enPassantTarget: Position | null = null;
  if (epStr !== '-') {
    if (epStr.length !== 2) {
      throw new Error('Invalid FEN: en passant target must be a square');
    }
    const fileIdx = FILES.indexOf(epStr[0] as 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h');
    const rankIdx = RANKS.indexOf(parseInt(epStr[1], 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
    if (fileIdx === -1 || rankIdx === -1) {
      throw new Error('Invalid FEN: en passant target square is invalid');
    }
    enPassantTarget = { row: rankIdx, col: fileIdx };
  }

  // Parse halfmove clock
  const halfmoveClock = parseInt(halfmoveStr, 10);
  if (isNaN(halfmoveClock) || halfmoveClock < 0) {
    throw new Error('Invalid FEN: halfmove clock must be a non-negative integer');
  }

  // Parse fullmove number
  const fullmoveNumber = parseInt(fullmoveStr, 10);
  if (isNaN(fullmoveNumber) || fullmoveNumber < 1) {
    throw new Error('Invalid FEN: fullmove number must be a positive integer');
  }

  return {
    board,
    turn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}