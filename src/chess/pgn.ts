import type {
  Board,
  Move,
  GameStatus,
  GameResult,
  Piece,
  PieceColor,
  PieceType,
  Position,
  CastlingRights,
} from './types';
import { getLegalMoves, hasAnyLegalMoves, isKingInCheck } from './check';
import { updateCastlingRights, performCastlingBoardUpdate } from './castling';
import { generateFEN, parseFEN } from './fen';
import { generateSAN } from './san';

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Exports the current game as a PGN string.
 */
export function exportPGN(
  moveHistory: Move[],
  _gameStatus: GameStatus,
  gameResult: GameResult,
  initialFen?: string,
): string {
  const headers: string[] = [];

  // Standard headers
  headers.push('[Event "Casual Game"]');
  headers.push('[Site "Local"]');
  headers.push('[Date "' + new Date().toISOString().split('T')[0].replace(/-/g, '.') + '"]');
  headers.push('[Round "1"]');
  headers.push('[White "Player 1"]');
  headers.push('[Black "Player 2"]');
  headers.push('[Result "' + (gameResult || '*') + '"]');

  if (initialFen && initialFen !== STANDARD_START_FEN) {
    headers.push('[FEN "' + initialFen + '"]');
    headers.push('[SetUp "1"]');
  }

  // Move text
  let moveText = '';
  for (let i = 0; i < moveHistory.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moveHistory[i];
    const blackMove = moveHistory[i + 1];

    moveText += `${moveNumber}. `;
    moveText += whiteMove.san || '';

    if (blackMove) {
      moveText += ` ${blackMove.san || ''}`;
    }

    moveText += ' ';
  }

  // Add result
  moveText += gameResult || '*';

  return headers.join('\n') + '\n\n' + moveText.trim();
}

/**
 * Parses a PGN string and replays the game.
 *
 * Only the mainline is replayed: comments, variations and NAGs are stripped, and
 * an unresolvable token stops the replay rather than aborting it, so a partially
 * malformed PGN still yields every move up to the bad one.
 */
export function parsePGN(pgn: string): {
  moveHistory: Move[];
  gameStatus: GameStatus;
  gameResult: GameResult;
  /** Position the game started from: the SetUp FEN, or the standard opening. */
  initialFen: string;
  finalFen: string;
} {
  const lines = pgn.split('\n');
  let moveText = '';
  let initialFen = '';
  let hasSetup = false;
  let headerResult: GameResult | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[FEN "')) {
      const match = trimmed.match(/"([^"]+)"/);
      if (match) initialFen = match[1];
    } else if (trimmed.startsWith('[SetUp "1"]')) {
      hasSetup = true;
    } else if (trimmed.startsWith('[Result "')) {
      const match = trimmed.match(/"([^"]+)"/);
      if (match && isGameResult(match[1])) headerResult = match[1];
    } else if (trimmed && !trimmed.startsWith('[')) {
      moveText += ' ' + trimmed;
    }
  }

  const startFen = hasSetup && initialFen ? initialFen : STANDARD_START_FEN;

  let state: ReplayState;
  try {
    const parsed = parseFEN(startFen);
    state = {
      board: parsed.board,
      turn: parsed.turn,
      castlingRights: parsed.castlingRights,
      enPassantTarget: parsed.enPassantTarget,
      halfmoveClock: parsed.halfmoveClock,
      fullmoveNumber: parsed.fullmoveNumber,
    };
  } catch {
    return {
      moveHistory: [],
      gameStatus: 'idle',
      gameResult: headerResult ?? '*',
      initialFen: startFen,
      finalFen: startFen,
    };
  }

  const moveHistory: Move[] = [];
  for (const token of extractMoves(moveText)) {
    const move = resolveSanMove(state, token);
    if (!move) break;
    moveHistory.push(move);
    state = applyMove(state, move);
  }

  const finalFen = generateFEN(
    state.board,
    state.turn,
    state.castlingRights,
    state.enPassantTarget,
    state.halfmoveClock,
    state.fullmoveNumber,
  );

  return {
    moveHistory,
    gameStatus: deriveGameStatus(state, moveHistory, headerResult),
    gameResult: headerResult ?? '*',
    initialFen: startFen,
    finalFen,
  };
}

interface ReplayState {
  board: Board;
  turn: PieceColor;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

function isGameResult(value: string): value is GameResult {
  return value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*';
}

/**
 * Reduce the movetext to a flat list of SAN tokens. Comments and variations can
 * nest, so they are consumed with depth counters rather than a regex.
 */
function extractMoves(moveText: string): string[] {
  let text = '';
  let braceDepth = 0;
  let parenDepth = 0;

  for (const char of moveText) {
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (braceDepth === 0 && char === '(') parenDepth++;
    else if (braceDepth === 0 && char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (braceDepth === 0 && parenDepth === 0) text += char;
  }

  // Rest-of-line comments, then move numbers ("12." / "12..."), NAGs and the
  // result token. Move numbers must go before tokenising: "12.e4" is legal PGN.
  text = text
    .replace(/;[^\n]*/g, ' ')
    .replace(/\d+\s*\.(\.\.)?/g, ' ')
    .replace(/\$\d+/g, ' ');

  return text
    .split(/\s+/)
    .map((token) => token.replace(/[?!]+$/, ''))
    .filter(
      (token) =>
        token.length > 0 &&
        token !== '1-0' &&
        token !== '0-1' &&
        token !== '1/2-1/2' &&
        token !== '*' &&
        token !== '--', // "unknown move" placeholder used by some exporters
    );
}

const SAN_PIECE: Record<string, PieceType> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

const PROMOTION_PIECE: Record<string, PieceType> = {
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

/**
 * Turns one SAN token into a full Move against `state`, or null when the token is
 * unparseable or does not name a legal move in this position.
 */
function resolveSanMove(state: ReplayState, token: string): Move | null {
  // Check/mate suffixes are re-derived from the resulting position, so drop them.
  const san = token.replace(/[+#]+$/, '');
  const { board, turn, castlingRights, enPassantTarget } = state;

  // Castling. Some exporters write zeroes instead of letter O.
  const castleToken = san.replace(/0/g, 'O');
  if (castleToken === 'O-O' || castleToken === 'O-O-O') {
    const row = turn === 'white' ? 7 : 0;
    const from: Position = { row, col: 4 };
    const to: Position = { row, col: castleToken === 'O-O' ? 6 : 2 };
    const king = board[from.row][from.col];
    if (!king || king.type !== 'king' || king.color !== turn) return null;
    const legal = getLegalMoves(board, from, castlingRights, enPassantTarget);
    if (!legal.some((m) => m.row === to.row && m.col === to.col)) return null;
    return finishMove(state, from, to, king, null, null, true, false);
  }

  const match = san.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h])([1-8])(?:=?([QRBN]))?$/);
  if (!match) return null;

  const [, pieceLetter, fromFile, fromRank, toFile, toRank, promotionLetter] = match;
  const pieceType: PieceType = pieceLetter ? SAN_PIECE[pieceLetter] : 'pawn';
  const to: Position = { row: 8 - Number(toRank), col: toFile.charCodeAt(0) - 97 };
  const promotion = promotionLetter ? PROMOTION_PIECE[promotionLetter] : null;

  const candidates: Position[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece.type !== pieceType || piece.color !== turn) continue;
      if (fromFile !== undefined && col !== fromFile.charCodeAt(0) - 97) continue;
      if (fromRank !== undefined && row !== 8 - Number(fromRank)) continue;
      const legal = getLegalMoves(board, { row, col }, castlingRights, enPassantTarget);
      if (legal.some((m) => m.row === to.row && m.col === to.col)) {
        candidates.push({ row, col });
      }
    }
  }

  // Zero candidates means an illegal or mis-transcribed move; more than one means
  // the SAN was under-disambiguated. Either way there is no single move to apply.
  if (candidates.length !== 1) return null;

  const from = candidates[0];
  const piece = board[from.row][from.col]!;
  const isEnPassant =
    piece.type === 'pawn' &&
    enPassantTarget !== null &&
    to.row === enPassantTarget.row &&
    to.col === enPassantTarget.col &&
    board[to.row][to.col] === null;
  const capturedPiece: Piece | null = isEnPassant
    ? board[from.row][to.col]
    : board[to.row][to.col];

  return finishMove(state, from, to, piece, capturedPiece, promotion, false, isEnPassant);
}

/**
 * Builds the Move record, including the SAN this engine would have generated for
 * it plus the check/checkmate suffix taken from the resulting position. The
 * regenerated SAN is used rather than the PGN token so notation is uniform with
 * moves played in the app.
 */
function finishMove(
  state: ReplayState,
  from: Position,
  to: Position,
  piece: Piece,
  capturedPiece: Piece | null,
  promotion: PieceType | null,
  isCastling: boolean,
  isEnPassant: boolean,
): Move {
  const draft: Move = {
    from,
    to,
    piece,
    capturedPiece,
    promotion,
    isCastling,
    isEnPassant,
    san: '',
    check: false,
    checkmate: false,
  };

  const baseSan = generateSAN(state.board, draft, state.castlingRights);
  const next = applyMove(state, draft);
  const opponent: PieceColor = piece.color === 'white' ? 'black' : 'white';
  const check = isKingInCheck(next.board, opponent);
  const checkmate =
    check && !hasAnyLegalMoves(next.board, opponent, next.castlingRights, next.enPassantTarget);

  return {
    ...draft,
    san: baseSan + (checkmate ? '#' : check ? '+' : ''),
    check,
    checkmate,
  };
}

/** Advances the replay state by one already-validated move. */
function applyMove(state: ReplayState, move: Move): ReplayState {
  const { board, turn, castlingRights, halfmoveClock, fullmoveNumber } = state;
  const { from, to, piece, promotion, isCastling, isEnPassant } = move;

  let board2: Board;
  if (isCastling) {
    board2 = performCastlingBoardUpdate(board, turn, to.col === 6 ? 'kingside' : 'queenside');
  } else {
    board2 = board.map((row) => [...row]);
    if (isEnPassant) {
      board2[from.row][to.col] = null;
    }
    board2[to.row][to.col] = promotion ? { type: promotion, color: piece.color } : piece;
    board2[from.row][from.col] = null;
  }

  let nextEnPassantTarget: Position | null = null;
  if (piece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
    nextEnPassantTarget = { row: (from.row + to.row) / 2, col: from.col };
  }

  const nextTurn: PieceColor = turn === 'white' ? 'black' : 'white';
  const isPawnOrCapture = piece.type === 'pawn' || move.capturedPiece !== null;

  return {
    board: board2,
    turn: nextTurn,
    castlingRights: updateCastlingRights(
      castlingRights,
      from,
      to,
      piece.type,
      turn,
      board[to.row][to.col]?.type,
    ),
    enPassantTarget: nextEnPassantTarget,
    halfmoveClock: isPawnOrCapture ? 0 : halfmoveClock + 1,
    fullmoveNumber: nextTurn === 'white' ? fullmoveNumber + 1 : fullmoveNumber,
  };
}

/**
 * The header result records *how the game was scored*, which the position alone
 * cannot always tell you: a decisive result with legal moves left is a
 * resignation or a flag-fall, not a checkmate.
 */
function deriveGameStatus(
  state: ReplayState,
  moveHistory: Move[],
  headerResult: GameResult | null,
): GameStatus {
  if (moveHistory.length === 0) return 'idle';

  const inCheck = isKingInCheck(state.board, state.turn);
  const canMove = hasAnyLegalMoves(
    state.board,
    state.turn,
    state.castlingRights,
    state.enPassantTarget,
  );

  if (!canMove) return inCheck ? 'checkmate' : 'stalemate';
  if (headerResult === '1-0' || headerResult === '0-1') return 'resigned';
  if (headerResult === '1/2-1/2') return 'draw';
  return inCheck ? 'check' : 'playing';
}
