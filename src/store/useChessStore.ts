import { create } from 'zustand';
import type {
  Board,
  Position,
  Move,
  GameStatus,
  BoardOrientation,
  PieceColor,
  PieceType,
  CastlingRights,
  GameResult,
  UiTheme,
  Piece,
} from '../chess';

export type { Move } from '../chess';
import type { DifficultyLevel, EvaluationData } from '../services/chessEngineService';
import { getBotThinkTimeMs, getDifficultyEngineConfig } from '../services/chessEngineService';
import { useSettingsStore } from './useSettingsStore';
import { resolveBoardOrientation } from '../utils/boardOrientation';
import {
  createInitialBoard,
  createInitialCastlingRights,
  getLegalMoves,
  hasAnyLegalMoves,
  isKingInCheck,
  updateCastlingRights,
  performCastlingBoardUpdate,
  getPositionKey,
  isInsufficientMaterial,
  hasInsufficientMatingMaterial,
} from '../chess';
import { generateSAN, appendCheckStatus } from '../chess/san';
import { generateFEN, parseFEN } from '../chess/fen';
import { exportPGN, parsePGN } from '../chess/pgn';
import { sound } from '../utils/sound';
import type { TimeControl, ClockState } from '../utils/clock';
import { getEngineService } from '../services/chessEngineService';
import {
  createInitialClockState,
  tickClock,
  switchClock,
  stopClock,
  checkTimeUp,
  TIME_CONTROLS,
} from '../utils/clock';

// Single source of truth in src/chess/types.ts. These three used to be declared
// a second time here, byte-identical, which meant a change to either copy would
// silently diverge from the other. Re-exported so both import paths keep working.
import type { DrawReason, DrawOffer, PendingPromotion } from '../chess/types';
export type { DrawReason, DrawOffer, PendingPromotion };

/**
 * True once the game has a final result. Deliberately an allowlist: 'check' is
 * a *live* status, so any guard phrased as `gameStatus !== 'playing'` silently
 * treats being in check as game over.
 */
export function isTerminalGameStatus(status: GameStatus): boolean {
  return (
    status === 'checkmate' ||
    status === 'stalemate' ||
    status === 'draw' ||
    status === 'timeout' ||
    status === 'resigned'
  );
}

/** True while a player may still move, resign, flag or offer a draw. */
export function isLiveGameStatus(status: GameStatus): boolean {
  return status === 'playing' || status === 'check';
}

/**
 * True while a move may still be played. Broader than {@link isLiveGameStatus}:
 * it also covers 'idle', the status of a game nobody has moved in yet — a bot
 * playing white has to be allowed to open.
 */
export function isPlayableGameStatus(status: GameStatus): boolean {
  return status === 'idle' || isLiveGameStatus(status);
}

/**
 * Who is playing a move. A bot owns its side of the board outright, so the
 * player-driven paths (click, drag, promotion dialog) are refused on its pieces
 * while the bot's own move goes through as 'engine'.
 */
export type MoveSource = 'player' | 'engine';

/** True when the engine, not the player, owns `color` in this game. */
function isEngineSeat(
  state: Pick<ChessState, 'gameMode' | 'computerColor'>,
  color: PieceColor,
): boolean {
  return state.gameMode === 'computer' && state.computerColor === color;
}

/**
 * Identifies the bot turn currently in flight. A search cannot be recalled once
 * it has started, so every new game, reset or mode change bumps this and the
 * superseded run drops its move instead of playing it onto the new position.
 */
let engineRunId = 0;

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

interface ChessState {
  board: Board;
  selectedSquare: Position | null;
  possibleMoves: Position[];
  currentTurn: PieceColor;
  orientation: BoardOrientation;
  moveHistory: Move[];
  gameStatus: GameStatus;
  gameResult: GameResult;
  winner: PieceColor | null;
  drawReason: DrawReason;
  lastMove: Move | null;

  // Castling Rights & En Passant
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;

  // Draw rules state
  halfmoveClock: number;
  fullmoveNumber: number;
  positionHistory: string[];

  // Promotion
  pendingPromotion: PendingPromotion | null;

  // Draw offer
  drawOffer: DrawOffer | null;

  // Clock
  timeControl: TimeControl;
  clock: ClockState;

  // Customization & Settings
  uiTheme: UiTheme;
  isSettingsOpen: boolean;
  isNewGameSetupOpen: boolean;
  /**
   * The "Create Online Game" modal. Needs its own flag: OnlineGameSetup used to
   * gate on isNewGameSetupOpen, so it rendered stacked on top of NewGameSetup
   * every time the mode picker opened, hiding the picker behind it.
   */
  isOnlineSetupOpen: boolean;
  isJoinGameOpen: boolean;

  // Computer Play
  gameMode: 'local' | 'computer' | 'online';
  computerColor: PieceColor | null;
  isEngineThinking: boolean;

  // Multiplayer
  isOnlineGame: boolean;
  onlineGameId: string | null;
  myColor: PieceColor | null;
  /** Stable server-issued id for this client's seat; survives reconnects. */
  myPlayerId: string | null;
  /** The name this client entered when creating or joining the room. */
  myName: string | null;
  opponentName: string | null;
  opponentConnected: boolean;
  drawOfferedBy: PieceColor | null;

  // Engine Evaluation
  engineEvaluation: EvaluationData | null;

  // Move navigation (for review/analysis)
  analysisIndex: number;
  moveReviews: import('./useAnalysisStore').MoveReview[];
  /**
   * The game-over dialog has been closed on a game that is still finished, so
   * the board underneath can be reviewed. Reset by every new game.
   */
  isGameOverDismissed: boolean;

  // Actions
  selectPiece: (pos: Position) => void;
  executeMove: (from: Position, to: Position, promotionChoice?: PieceType, source?: MoveSource) => boolean;
  completePromotion: (type: PieceType) => void;
  cancelPromotion: () => void;
  handleSquareClick: (pos: Position) => void;
  resetGame: () => void;
  flipBoard: () => void;
  toggleUiTheme: () => void;
  setSettingsOpen: (open: boolean) => void;
  setNewGameSetupOpen: (open: boolean) => void;
  setOnlineSetupOpen: (open: boolean) => void;
  dismissGameOver: () => void;
  loadFEN: (fen: string) => boolean;
  loadPGN: (pgn: string) => boolean;
  exportPGN: () => string;
  copyFEN: () => string;
  setTimeControl: (display: string) => void;
  startClock: () => void;
  tickClock: () => void;
  resign: (color: PieceColor) => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  newGame: (options?: { color?: 'white' | 'black' | 'random'; timeControl?: string; opponent?: 'local' | 'computer' | 'online'; difficulty?: DifficultyLevel }) => void;
  setGameMode: (mode: 'local' | 'computer' | 'online', computerColor?: PieceColor) => void;
  makeEngineMove: () => Promise<void>;
  updateEngineEvaluation: (evaluation: EvaluationData | null) => void;

  // Move navigation actions
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  previousMove: () => void;
  nextMove: () => void;

  // Multiplayer actions
  connectToServer: () => Promise<void>;
  createOnlineGame: (playerName: string, timeControl: string, color?: 'white' | 'black' | 'random') => Promise<void>;
  joinOnlineGame: (gameId: string, playerName: string) => Promise<void>;
  leaveOnlineGame: () => Promise<void>;
  makeOnlineMove: (from: Position, to: Position, promotion?: PieceType) => Promise<void>;
  offerOnlineDraw: () => Promise<void>;
  acceptOnlineDraw: () => Promise<void>;
  declineOnlineDraw: () => Promise<void>;
  resignOnlineGame: () => Promise<void>;
  applyServerGameState: (game: import('../chess/types').GameRoom) => void;
  applyServerMove: (move: import('../chess/types').Move, fen: string, clocks: import('../chess/types').ClockState) => void;
  applyGameEnd: (result: import('../chess/types').GameResult, reason: string) => void;
  setOpponentConnected: (connected: boolean) => void;
  setDrawOfferedBy: (color: PieceColor | null) => void;
  setIsJoinGameOpen: (open: boolean) => void;
}

const initialBoard = createInitialBoard();
const initialRights = createInitialCastlingRights();
const initialPosKey = getPositionKey(initialBoard, 'white', initialRights, null);

const initialState = {
  board: initialBoard,
  selectedSquare: null as Position | null,
  possibleMoves: [] as Position[],
  currentTurn: 'white' as PieceColor,
  orientation: 'white' as BoardOrientation,
  moveHistory: [] as Move[],
  gameStatus: 'idle' as GameStatus,
  gameResult: '*' as GameResult,
  winner: null as PieceColor | null,
  drawReason: null as DrawReason,
  lastMove: null as Move | null,
  castlingRights: initialRights,
  enPassantTarget: null as Position | null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
  positionHistory: [initialPosKey],
  pendingPromotion: null as PendingPromotion | null,
  drawOffer: null as DrawOffer | null,
  timeControl: TIME_CONTROLS[4], // 5+0 default
  clock: createInitialClockState(TIME_CONTROLS[4]),
  uiTheme: 'dark' as UiTheme,
  isSettingsOpen: false,
  isNewGameSetupOpen: false,
  isOnlineSetupOpen: false,
  isJoinGameOpen: false,
  gameMode: 'local' as const,
  computerColor: null as PieceColor | null,
  isEngineThinking: false,

  // Multiplayer
  isOnlineGame: false,
  onlineGameId: null as string | null,
  myColor: null as PieceColor | null,
  myPlayerId: null as string | null,
  myName: null as string | null,
  opponentName: null as string | null,
  opponentConnected: false,
  drawOfferedBy: null as PieceColor | null,

  // Engine Evaluation
  engineEvaluation: null as EvaluationData | null,

  // Move navigation (for review/analysis)
  analysisIndex: 0,
  moveReviews: [] as import('./useAnalysisStore').MoveReview[],
  isGameOverDismissed: false,
};

// Unsubscribers for the multiplayerService handlers registered by
// connectToServer(). It runs once per create/join attempt and builds fresh
// closures each time, which the service's listener Set cannot dedupe, so the
// previous batch has to be torn down or every server event fires twice.
let serverListenerCleanups: Array<() => void> = [];

/**
 * The stable player id for a seat, as issued by the server. Needed to reclaim
 * that seat after a reconnect, since the socket id is no longer the same.
 */
function playerIdForColor(
  game: import('../chess/types').GameRoom | undefined,
  color: PieceColor | undefined,
): string | null {
  if (!game || !color) return null;
  const player = color === 'white' ? game.whitePlayer : game.blackPlayer;
  return player?.id ?? null;
}

/**
 * Give up the seat in whatever game this client is still in before taking a new
 * one. Server room membership is per socket, so a client that creates or joins a
 * second game without leaving the first stays subscribed to both — and the old
 * room's clockSync (broadcast every second) then overwrites the new game's
 * clocks, showing the wrong times and the wrong player on the move.
 *
 * Failures are swallowed on purpose: "Not in a game" is the expected answer when
 * the seat is already gone, and it must not block the game being started.
 */
async function releasePreviousSeat(get: () => ChessState): Promise<void> {
  if (!get().isOnlineGame) return;
  const { multiplayerService } = await import('../services/multiplayerService');
  try {
    await multiplayerService.leaveGame();
  } catch {
    // Seat was already vacated (or the server never knew about it).
  }
}

export const useChessStore = create<ChessState>()((set, get) => ({
  ...initialState,

  selectPiece: (pos: Position) => {
    const state = get();
    const { board, currentTurn, castlingRights, enPassantTarget, gameStatus } = state;

    if (isTerminalGameStatus(gameStatus)) {
      return;
    }

    const clickedPiece = board[pos.row][pos.col];
    // The bot plays its own side; picking up its pieces is not the player's to do.
    if (clickedPiece && isEngineSeat(state, clickedPiece.color)) {
      return;
    }
    if (clickedPiece && clickedPiece.color === currentTurn) {
      const moves = getLegalMoves(board, pos, castlingRights, enPassantTarget);
      set({ selectedSquare: pos, possibleMoves: moves });
    }
  },

  executeMove: (from: Position, to: Position, promotionChoice?: PieceType, source: MoveSource = 'player') => {
    const {
      board,
      currentTurn,
      castlingRights,
      enPassantTarget,
      gameStatus,
      analysisIndex,
      moveHistory,
    } = get();

    if (isTerminalGameStatus(gameStatus)) {
      return false;
    }

    // Only the engine moves the engine's pieces. Every player path — click,
    // drag-drop, promotion dialog — funnels through here, so one guard covers
    // them all; makeEngineMove passes 'engine' to get past it.
    if (source === 'player' && isEngineSeat(get(), currentTurn)) {
      set({ selectedSquare: null, possibleMoves: [] });
      return false;
    }

    // The board is rewound to an earlier move. Playing on from here would append
    // to the *full* history and desync the board from it, so refuse until the
    // caller returns to the live position. Enforced here rather than in the
    // components because Square.tsx's drag path calls executeMove directly.
    if (analysisIndex !== moveHistory.length) {
      set({ selectedSquare: null, possibleMoves: [] });
      return false;
    }

    const selectedPiece = board[from.row][from.col];
    if (!selectedPiece || selectedPiece.color !== currentTurn) {
      set({ selectedSquare: null, possibleMoves: [] });
      return false;
    }

    const legalMoves = getLegalMoves(board, from, castlingRights, enPassantTarget);
    const isValid = legalMoves.some((m) => m.row === to.row && m.col === to.col);

    if (!isValid) {
      set({ selectedSquare: null, possibleMoves: [] });
      return false;
    }

    // Pawn Promotion
    const isPromotionRank =
      selectedPiece.type === 'pawn' && (to.row === 0 || to.row === 7);

    // Read auto promotion setting from centralized settings store
    const autoQueenPromotion = useSettingsStore.getState().gameplay.autoQueenPromotion;

    if (isPromotionRank && !promotionChoice && !autoQueenPromotion) {
      set({
        pendingPromotion: { from, to, color: selectedPiece.color },
        selectedSquare: null,
        possibleMoves: [],
      });
      return true;
    }

    const actualPromotion: PieceType | null = isPromotionRank
      ? promotionChoice || (autoQueenPromotion ? 'queen' : null)
      : null;

    // Online games are authoritative on the server. Ship the move and let the
    // 'moveMade' broadcast update the board; applying it locally first would
    // fork the position whenever the server disagrees. Placed here rather than
    // in handleSquareClick so click, drag-drop and promotion all route through
    // it — they all funnel into executeMove.
    if (get().isOnlineGame) {
      set({ selectedSquare: null, possibleMoves: [], pendingPromotion: null });
      if (get().myColor !== currentTurn) return false;
      void get().makeOnlineMove(from, to, actualPromotion ?? undefined);
      return true;
    }

    let success = false;

    set((state) => {
      const clickedPiece = board[to.row][to.col];
      let newBoard: Board;
      let isCastling = false;
      let isEnPassant = false;
      let capturedPiece: Piece | null = clickedPiece ?? null;

      // 1. Castling Move
      if (selectedPiece.type === 'king' && Math.abs(to.col - from.col) === 2) {
        isCastling = true;
        newBoard = performCastlingBoardUpdate(board, currentTurn, to.col === 6 ? 'kingside' : 'queenside');
      }
      // 2. En Passant Capture Move
      else if (
        selectedPiece.type === 'pawn' &&
        enPassantTarget &&
        to.row === enPassantTarget.row &&
        to.col === enPassantTarget.col
      ) {
        isEnPassant = true;
        newBoard = board.map((row) => [...row]);
        const capturedPawnRow = currentTurn === 'white' ? to.row + 1 : to.row - 1;
        capturedPiece = newBoard[capturedPawnRow][to.col];
        newBoard[capturedPawnRow][to.col] = null;
        newBoard[to.row][to.col] = selectedPiece;
        newBoard[from.row][from.col] = null;
      }
      // 3. Normal / Promotion Move
      else {
        newBoard = board.map((row) => [...row]);
        if (actualPromotion) {
          newBoard[to.row][to.col] = {
            type: actualPromotion,
            color: selectedPiece.color,
          };
        } else {
          newBoard[to.row][to.col] = selectedPiece;
        }
        newBoard[from.row][from.col] = null;
      }

      // Track next En Passant target
      let nextEnPassantTarget: Position | null = null;
      if (selectedPiece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
        const targetRow = (from.row + to.row) / 2;
        nextEnPassantTarget = { row: targetRow, col: from.col };
      }

      // Update castling rights
      const nextCastlingRights = updateCastlingRights(
        castlingRights,
        from,
        to,
        selectedPiece.type,
        currentTurn,
        clickedPiece?.type,
      );

      // Sound effect
      if (capturedPiece) {
        sound.playCapture();
      } else {
        sound.playMove();
      }

      const nextTurn: PieceColor = currentTurn === 'white' ? 'black' : 'white';

      // 50-Move Rule Halfmove Clock
      const isPawnOrCapture = selectedPiece.type === 'pawn' || capturedPiece !== null;
      const nextHalfmoveClock = isPawnOrCapture ? 0 : state.halfmoveClock + 1;

      // Position Repetition Tracking
      const nextPosKey = getPositionKey(
        newBoard,
        nextTurn,
        nextCastlingRights,
        nextEnPassantTarget,
      );
      const nextPosHistory = [...state.positionHistory, nextPosKey];
      const repetitionCount = nextPosHistory.filter((k) => k === nextPosKey).length;

      // Game status and Draw evaluation
      const inCheck = isKingInCheck(newBoard, nextTurn);
      const canMove = hasAnyLegalMoves(
        newBoard,
        nextTurn,
        nextCastlingRights,
        nextEnPassantTarget,
      );
      const deadMaterial = isInsufficientMaterial(newBoard);

      let nextGameStatus: GameStatus = 'playing';
      let nextGameResult: GameResult = '*';
      let nextWinner: PieceColor | null = null;
      let nextDrawReason: DrawReason = null;

      if (inCheck && !canMove) {
        nextGameStatus = 'checkmate';
        nextGameResult = currentTurn === 'white' ? '1-0' : '0-1';
        nextWinner = currentTurn;
      } else if (!inCheck && !canMove) {
        nextGameStatus = 'stalemate';
        nextGameResult = '1/2-1/2';
        nextDrawReason = 'Stalemate';
      } else if (deadMaterial) {
        nextGameStatus = 'draw';
        nextGameResult = '1/2-1/2';
        nextDrawReason = 'Insufficient Material';
      } else if (repetitionCount >= 3) {
        nextGameStatus = 'draw';
        nextGameResult = '1/2-1/2';
        nextDrawReason = 'Threefold Repetition';
      } else if (nextHalfmoveClock >= 100) {
        nextGameStatus = 'draw';
        nextGameResult = '1/2-1/2';
        nextDrawReason = '50-Move Rule';
      } else if (inCheck) {
        nextGameStatus = 'check';
      }

      // Play check sound if the move puts opponent in check
      if (inCheck) {
        sound.playCheck();
      }

      const nextFullmoveNumber = nextTurn === 'white' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

      // Clock: executeMove owns the local clock. Online games are driven by the
      // server's authoritative clockSync, so never touch the clock here.
      const now = Date.now();
      const isTerminalStatus =
        nextGameStatus === 'checkmate' ||
        nextGameStatus === 'stalemate' ||
        nextGameStatus === 'draw';
      let nextClock = state.clock;
      let flagResult: {
        gameStatus: GameStatus;
        gameResult: GameResult;
        winner: PieceColor | null;
        drawReason: DrawReason;
      } | null = null;

      if (!state.isOnlineGame) {
        nextClock = isTerminalStatus
          ? stopClock(state.clock)
          : switchClock(state.clock, nextTurn, state.timeControl.incrementMs, now);

        // Play game end sound if game just ended (and not already in terminal state)
        if (isTerminalStatus && state.gameStatus !== 'checkmate' && state.gameStatus !== 'stalemate' && state.gameStatus !== 'draw' && state.gameStatus !== 'timeout' && state.gameStatus !== 'resigned') {
          sound.playGameEnd();
        }

        // switchClock settles the mover's elapsed time, which is exactly where a
        // flag-fall surfaces. It reports one by stopping the clock — and
        // tickClock early-returns on a stopped clock, so if the timeout isn't
        // recorded here it is never recorded at all and the game just hangs.
        if (!isTerminalStatus) {
          const timeoutLoser = checkTimeUp(nextClock);
          if (timeoutLoser) {
            const flagWinner: PieceColor = timeoutLoser === 'white' ? 'black' : 'white';
            flagResult = hasInsufficientMatingMaterial(newBoard, flagWinner)
              ? {
                  gameStatus: 'draw',
                  gameResult: '1/2-1/2',
                  winner: null,
                  drawReason: 'Timeout vs Insufficient Material',
                }
              : {
                  gameStatus: 'timeout',
                  gameResult: flagWinner === 'white' ? '1-0' : '0-1',
                  winner: flagWinner,
                  drawReason: null,
                };
          }
        }
      }

      const move: Move = {
        from,
        to,
        piece: selectedPiece,
        capturedPiece: capturedPiece,
        promotion: actualPromotion,
        isCastling,
        isEnPassant,
        san: '',
        check: inCheck,
        checkmate: inCheck && !canMove,
      };

      // Generate SAN for the move
      const san = generateSAN(board, move, castlingRights);
      const sanWithStatus = appendCheckStatus(san, board, move, castlingRights);
      move.san = sanWithStatus;

      success = true;

      return {
        board: newBoard,
        selectedSquare: null,
        possibleMoves: [],
        lastMove: move,
        moveHistory: [...state.moveHistory, move],
        currentTurn: nextTurn,
        gameStatus: flagResult?.gameStatus ?? nextGameStatus,
        gameResult: flagResult?.gameResult ?? nextGameResult,
        winner: flagResult ? flagResult.winner : nextWinner,
        drawReason: flagResult ? flagResult.drawReason : nextDrawReason,
        castlingRights: nextCastlingRights,
        enPassantTarget: nextEnPassantTarget,
        halfmoveClock: nextHalfmoveClock,
        fullmoveNumber: nextFullmoveNumber,
        positionHistory: nextPosHistory,
        pendingPromotion: null,
        clock: nextClock,
        // Stay pinned to the live position so move navigation keeps working.
        analysisIndex: state.moveHistory.length + 1,
      };
    });

    return success;
  },

  completePromotion: (type: PieceType) => {
    const { pendingPromotion, executeMove } = get();
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from, pendingPromotion.to, type);
  },

  cancelPromotion: () => {
    set({ pendingPromotion: null, selectedSquare: null, possibleMoves: [] });
  },

  handleSquareClick: (pos: Position) => {
    const state = get();
    const {
      board,
      selectedSquare,
      currentTurn,
      castlingRights,
      enPassantTarget,
      gameStatus,
    } = state;

    if (isTerminalGameStatus(gameStatus)) {
      return;
    }

    if (state.pendingPromotion) {
      state.cancelPromotion();
      return;
    }

    // 1. If no square currently selected:
    if (!selectedSquare) {
      const clickedPiece = board[pos.row][pos.col];
      // The bot's pieces are not the player's to pick up (see isEngineSeat).
      if (clickedPiece && isEngineSeat(state, clickedPiece.color)) return;
      if (clickedPiece && clickedPiece.color === currentTurn) {
        const moves = getLegalMoves(board, pos, castlingRights, enPassantTarget);
        set({ selectedSquare: pos, possibleMoves: moves });
      }
      return;
    }

    const clickedPiece = board[pos.row][pos.col];

    // 2. Clicked the same square -> Deselect
    if (selectedSquare.row === pos.row && selectedSquare.col === pos.col) {
      set({ selectedSquare: null, possibleMoves: [] });
      return;
    }

    // 3. Clicked another piece of current player's color -> Switch selection
    if (clickedPiece && clickedPiece.color === currentTurn && !isEngineSeat(state, clickedPiece.color)) {
      const moves = getLegalMoves(board, pos, castlingRights, enPassantTarget);
      set({ selectedSquare: pos, possibleMoves: moves });
      return;
    }

    // 4. Attempt to execute move from selectedSquare to pos
    state.executeMove(selectedSquare, pos);
  },

  resetGame: () => {
    const resetBoard = createInitialBoard();
    const resetRights = createInitialCastlingRights();
    const resetPosKey = getPositionKey(resetBoard, 'white', resetRights, null);

    // Abandon any bot turn still in flight for the position being thrown away.
    engineRunId++;

    set((state) => ({
      ...initialState,
      board: resetBoard,
      castlingRights: resetRights,
      positionHistory: [resetPosKey],
      uiTheme: state.uiTheme,
      // initialState hardcodes the 5+0 default; spreading it would silently
      // throw away whatever time control the player actually chose.
      timeControl: state.timeControl,
      clock: createInitialClockState(state.timeControl),
    }));
  },

  flipBoard: () => {
    // An explicit Board Orientation setting outranks the game's own perspective
    // (see resolveBoardOrientation), so flipping has to move whichever of the two
    // is actually in charge — otherwise the button does nothing visible.
    const settings = useSettingsStore.getState();
    const next: BoardOrientation =
      resolveBoardOrientation(settings.board.orientation, get().orientation) === 'white'
        ? 'black'
        : 'white';

    if (settings.board.orientation !== 'auto') settings.setBoard({ orientation: next });
    set({ orientation: next });
  },

  goToMove: (index: number) => {
    const { moveHistory } = get();
    if (index < 0 || index > moveHistory.length) return;
    
    // Replay moves up to the target index
    const movesToReplay = moveHistory.slice(0, index);
    const resetBoard = createInitialBoard();
    const resetRights = createInitialCastlingRights();
    let board = resetBoard;
    let turn: PieceColor = 'white';
    let castlingRights = resetRights;
    let enPassantTarget: Position | null = null;
    let halfmoveClock = 0;
    let fullmoveNumber = 1;

    for (const move of movesToReplay) {
      const clickedPiece = board[move.from.row][move.from.col];
      if (!clickedPiece) continue;

      let newBoard: Board;
      let capturedPiece: Piece | null = board[move.to.row][move.to.col] ?? null;

      if (clickedPiece.type === 'king' && Math.abs(move.to.col - move.from.col) === 2) {
        newBoard = performCastlingBoardUpdate(board, turn, move.to.col === 6 ? 'kingside' : 'queenside');
      } else if (
        clickedPiece.type === 'pawn' &&
        enPassantTarget &&
        move.to.row === enPassantTarget.row &&
        move.to.col === enPassantTarget.col
      ) {
        newBoard = board.map((row) => [...row]);
        const capturedPawnRow = turn === 'white' ? move.to.row + 1 : move.to.row - 1;
        capturedPiece = newBoard[capturedPawnRow][move.to.col];
        newBoard[capturedPawnRow][move.to.col] = null;
        newBoard[move.to.row][move.to.col] = clickedPiece;
        newBoard[move.from.row][move.from.col] = null;
      } else {
        newBoard = board.map((row) => [...row]);
        newBoard[move.to.row][move.to.col] = move.promotion
          ? { type: move.promotion, color: clickedPiece.color }
          : clickedPiece;
        newBoard[move.from.row][move.from.col] = null;
      }

      let nextEnPassantTarget: Position | null = null;
      if (clickedPiece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
        const targetRow = (move.from.row + move.to.row) / 2;
        nextEnPassantTarget = { row: targetRow, col: move.from.col };
      }

      const nextCastlingRights = updateCastlingRights(
        castlingRights,
        move.from,
        move.to,
        clickedPiece.type,
        turn,
        board[move.to.row][move.to.col]?.type,
      );

      const isPawnOrCapture = clickedPiece.type === 'pawn' || capturedPiece !== null;
      const nextHalfmoveClock = isPawnOrCapture ? 0 : halfmoveClock + 1;
      const nextTurn: PieceColor = turn === 'white' ? 'black' : 'white';
      const nextFullmoveNumber = nextTurn === 'white' ? fullmoveNumber + 1 : fullmoveNumber;

      board = newBoard;
      turn = nextTurn;
      castlingRights = nextCastlingRights;
      enPassantTarget = nextEnPassantTarget;
      halfmoveClock = nextHalfmoveClock;
      fullmoveNumber = nextFullmoveNumber;
    }

    const lastMove = movesToReplay.length > 0 ? movesToReplay[movesToReplay.length - 1] : null;

    set({
      board,
      currentTurn: turn,
      lastMove,
      castlingRights,
      enPassantTarget,
      halfmoveClock,
      fullmoveNumber,
      analysisIndex: index,
      // A selection made on the live position means nothing on a rewound board.
      selectedSquare: null,
      possibleMoves: [],
    });
  },

  goToStart: () => get().goToMove(0),
  goToEnd: () => get().goToMove(get().moveHistory.length),
  previousMove: () => {
    const { analysisIndex } = get();
    if (analysisIndex > 0) get().goToMove(analysisIndex - 1);
  },
  nextMove: () => {
    const { analysisIndex, moveHistory } = get();
    if (analysisIndex < moveHistory.length) get().goToMove(analysisIndex + 1);
  },

  toggleUiTheme: () =>
    set((state) => {
      const nextTheme = state.uiTheme === 'dark' ? 'light' : 'dark';
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { uiTheme: nextTheme };
    }),

  setSettingsOpen: (open: boolean) => set({ isSettingsOpen: open }),

  setNewGameSetupOpen: (open: boolean) => set({ isNewGameSetupOpen: open }),

  setOnlineSetupOpen: (open: boolean) => set({ isOnlineSetupOpen: open }),

  dismissGameOver: () => set({ isGameOverDismissed: true }),

  loadFEN: (fen: string) => {
    try {
      const parsed = parseFEN(fen);
      const initialPosKey = getPositionKey(parsed.board, parsed.turn, parsed.castlingRights, parsed.enPassantTarget);
      
      set({
        board: parsed.board,
        currentTurn: parsed.turn,
        castlingRights: parsed.castlingRights,
        enPassantTarget: parsed.enPassantTarget,
        halfmoveClock: parsed.halfmoveClock,
        fullmoveNumber: parsed.fullmoveNumber,
        positionHistory: [initialPosKey],
        moveHistory: [],
        analysisIndex: 0,
        moveReviews: [],
        gameStatus: 'playing',
        gameResult: '*' as GameResult,
        winner: null,
        drawReason: null,
        lastMove: null,
        selectedSquare: null,
        possibleMoves: [],
        pendingPromotion: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  loadPGN: (pgn: string) => {
    try {
      const result = parsePGN(pgn);
      if (result.finalFen) {
        return get().loadFEN(result.finalFen);
      }
      return false;
    } catch {
      return false;
    }
  },

  exportPGN: () => {
    const { moveHistory, gameStatus, gameResult } = get();
    const initialFen = generateFEN(
      createInitialBoard(),
      'white',
      createInitialCastlingRights(),
      null,
      0,
      1
    );
    return exportPGN(moveHistory, gameStatus, gameResult, initialFen);
  },

  copyFEN: () => {
    const { board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber } = get();
    return generateFEN(board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber);
  },

  setTimeControl: (display: string) => {
    const control = TIME_CONTROLS.find(tc => tc.display === display);
    if (!control) return;
    set({ timeControl: control, clock: createInitialClockState(control) });
  },

  startClock: () => {
    const { clock, currentTurn } = get();
    if (clock.isRunning || clock.activeColor) return;
    set({ clock: { ...clock, activeColor: currentTurn, isRunning: true, lastTickMs: Date.now() } });
  },

  tickClock: () => {
    const { clock, gameStatus, board, isOnlineGame } = get();
    // Online clocks belong to the server: it broadcasts clockSync every second
    // and decides flag-falls. A local ticker here would fight that state and
    // could unilaterally declare a timeout the server never saw.
    if (isOnlineGame) return;
    if (!clock.isRunning || !isLiveGameStatus(gameStatus)) return;

    const updated = tickClock(clock);
    const timeUp = checkTimeUp(updated);
    
    if (timeUp) {
      const loser = timeUp;
      const winner = loser === 'white' ? 'black' : 'white';
      
      // Check if winner has insufficient mating material
      const winnerHasInsufficientMaterial = hasInsufficientMatingMaterial(board, winner);
      
      if (winnerHasInsufficientMaterial) {
        // Draw by timeout with insufficient mating material
        set({
          clock: { ...updated, isRunning: false },
          gameStatus: 'draw',
          gameResult: '1/2-1/2',
          winner: null,
          drawReason: 'Timeout vs Insufficient Material',
        });
      } else {
        // Normal timeout win
        set({
          clock: { ...updated, isRunning: false },
          gameStatus: 'timeout',
          gameResult: winner === 'white' ? '1-0' : '0-1',
          winner,
          drawReason: null,
        });
      }
    } else {
      set({ clock: updated });
    }
  },

  resign: (color: PieceColor) => {
    const { gameStatus } = get();
    if (!isLiveGameStatus(gameStatus)) return;

    const winner = color === 'white' ? 'black' : 'white';
    set({
      gameStatus: 'resigned',
      gameResult: winner === 'white' ? '1-0' : '0-1',
      winner,
      drawReason: 'Resignation',
      clock: { ...get().clock, isRunning: false, activeColor: null },
    });
  },

  offerDraw: () => {
    const { gameStatus, currentTurn } = get();
    if (!isLiveGameStatus(gameStatus)) return;
    set({ drawOffer: { offeredBy: currentTurn, timestamp: Date.now() } });
  },

  acceptDraw: () => {
    const { gameStatus, drawOffer } = get();
    if (!isLiveGameStatus(gameStatus) || !drawOffer) return;
    set({
      gameStatus: 'draw',
      gameResult: '1/2-1/2',
      winner: null,
      drawReason: 'Draw Offer Accepted',
      drawOffer: null,
      clock: { ...get().clock, isRunning: false, activeColor: null },
    });
  },

  declineDraw: () => {
    const { gameStatus, drawOffer } = get();
    if (!isLiveGameStatus(gameStatus) || !drawOffer) return;
    set({ drawOffer: null });
  },

  newGame: (options?: { color?: 'white' | 'black' | 'random'; timeControl?: string; opponent?: 'local' | 'computer' | 'online'; difficulty?: DifficultyLevel }) => {
    const resetBoard = createInitialBoard();
    const resetRights = createInitialCastlingRights();
    const resetPosKey = getPositionKey(resetBoard, 'white', resetRights, null);

    // Abandon any bot turn still in flight for the game being replaced.
    engineRunId++;

    // The bot picked in the setup screen has to reach the settings store, which
    // is where makeEngineMove reads it from. Dropping it here left every game
    // being played against whichever bot was chosen last.
    if (options?.difficulty) {
      useSettingsStore.getState().setComputer({ difficulty: options.difficulty });
    }

    if (options?.opponent === 'computer') {
      // Boot the engine now, while the player is still looking at the opening
      // position. The first search otherwise carries the WebAssembly startup
      // cost and arrives seconds outside the bot's thinking window.
      // initialize() shares one promise, so makeEngineMove just awaits this one.
      void getEngineService()
        .initialize()
        .catch(() => {
          // makeEngineMove reports the failure when it needs the engine for real.
        });
    }
    
    // Determine time control
    let timeControl = get().timeControl;
    if (options?.timeControl) {
      const tc = TIME_CONTROLS.find(t => t.display === options.timeControl);
      if (tc) timeControl = tc;
    }

    // Determine orientation based on color choice
    let orientation: BoardOrientation = 'white';
    let computerColor: PieceColor | null = null;
    let gameMode: 'local' | 'computer' | 'online' = 'local';
    
    if (options?.color === 'black') {
      orientation = 'black';
    } else if (options?.color === 'random') {
      orientation = Math.random() < 0.5 ? 'white' : 'black';
    }
    
    if (options?.opponent === 'computer') {
      gameMode = 'computer';
      // If color is random, determine computer color based on orientation
      if (options.color === 'random') {
        computerColor = orientation === 'white' ? 'black' : 'white';
      } else if (options.color === 'white') {
        computerColor = 'black';
      } else if (options.color === 'black') {
        computerColor = 'white';
      }
    } else if (options?.opponent === 'online') {
      gameMode = 'online';
      // For online, we don't set computerColor, it will be set when joining/creating
    }

    set({
      board: resetBoard,
      selectedSquare: null,
      possibleMoves: [],
      currentTurn: 'white',
      orientation,
      moveHistory: [],
      gameStatus: 'idle',
      gameResult: '*' as GameResult,
      winner: null,
      drawReason: null,
      lastMove: null,
      castlingRights: resetRights,
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
      positionHistory: [resetPosKey],
      pendingPromotion: null,
      drawOffer: null,
      timeControl,
      clock: createInitialClockState(timeControl),
      gameMode,
      computerColor,
      isEngineThinking: false,
      // Move navigation must start at the live position of the new game.
      analysisIndex: 0,
      moveReviews: [],
      // Whatever was dismissed belonged to the game just replaced.
      isGameOverDismissed: false,
    });
  },

  setGameMode: (mode: 'local' | 'computer' | 'online', computerColor?: PieceColor) => {
    // Whatever the bot was thinking about no longer applies.
    engineRunId++;
    set({
      gameMode: mode,
      computerColor: mode === 'computer' ? (computerColor || 'black') : null,
      isEngineThinking: false,
    });
  },

  makeEngineMove: async () => {
    const { gameMode, computerColor, currentTurn, gameStatus, isEngineThinking, analysisIndex, moveHistory, copyFEN, updateEngineEvaluation } = get();

    // 'check' is a live status, and an unmoved game is still 'idle' — reading
    // either as "not playable" left the bot refusing to move out of check, and
    // never opening at all when it had white.
    if (gameMode !== 'computer' || !isPlayableGameStatus(gameStatus)) return;
    if (computerColor !== currentTurn) return;
    if (isEngineThinking) return;
    // The board is rewound for review. executeMove refuses moves from there, so
    // there is nothing to be gained by searching the position being reviewed.
    if (analysisIndex !== moveHistory.length) return;

    const level = useSettingsStore.getState().computer.difficulty;
    // Claim this turn. Anything that restarts the game bumps the counter, and
    // the checks after each await below drop the move if that has happened.
    const runId = ++engineRunId;
    const startedAt = performance.now();
    const thinkTarget = getBotThinkTimeMs(level, moveHistory.length);

    set({ isEngineThinking: true });

    try {
      const engine = getEngineService();
      await engine.initialize();
      await engine.setConfig(getDifficultyEngineConfig(level));

      // Set up evaluation callback
      engine.onEvaluation((evaluationData) => {
        updateEngineEvaluation(evaluationData);
      });

      const fen = copyFEN();
      const result = await engine.getBestMove(fen);

      // Clear evaluation after move is made
      updateEngineEvaluation(null);
      if (runId !== engineRunId) return;

      // The engine answers in a few milliseconds in simple positions, which is
      // what made its moves look like teleportation. Hold the move back until
      // this bot's thinking time is up so the game keeps a steady rhythm, with
      // the thinking indicator up for the whole wait.
      await wait(thinkTarget - (performance.now() - startedAt));
      if (runId !== engineRunId) return;

      const state = get();
      if (
        state.computerColor !== state.currentTurn ||
        !isPlayableGameStatus(state.gameStatus) ||
        state.analysisIndex !== state.moveHistory.length
      ) {
        return;
      }

      // Parse UCI move (e.g., "e2e4" or "e7e8q")
      const from = { row: 8 - parseInt(result.bestMove[1]), col: result.bestMove.charCodeAt(0) - 97 };
      const to = { row: 8 - parseInt(result.bestMove[3]), col: result.bestMove.charCodeAt(2) - 97 };

      let promotion: PieceType | undefined;
      if (result.bestMove.length === 5) {
        const promoChar = result.bestMove[4];
        const promoMap: Record<string, PieceType> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
        promotion = promoMap[promoChar];
      }

      state.executeMove(from, to, promotion, 'engine');
    } catch (error) {
      console.error('Engine error:', error);
      updateEngineEvaluation(null);
    } finally {
      // Only the run that still owns the engine tidies up: a superseded run
      // would otherwise pull down the indicator its replacement just raised, and
      // unhook the evaluation callback that replacement installed.
      if (runId === engineRunId) {
        // The engine is a singleton shared with the analysis store. Leaving this
        // callback installed would pipe every later analysis search into the
        // game's engineEvaluation.
        getEngineService().onEvaluation(null);
        set({ isEngineThinking: false });
      }
    }
  },

  updateEngineEvaluation: (evaluationData: EvaluationData | null) => set({ engineEvaluation: evaluationData }),

  // Multiplayer actions
  connectToServer: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.connect();

    // Drop the handlers from any earlier attempt before registering new ones.
    for (const cleanup of serverListenerCleanups) cleanup();
    serverListenerCleanups = [];

    // Set up event listeners
    serverListenerCleanups.push(
      multiplayerService.on('gameState', (game: import('../chess/types').GameRoom) => {
        get().applyServerGameState(game);
      }),

      multiplayerService.on('playerJoined', (player: import('../chess/types').Player) => {
        set({ opponentName: player.name, opponentConnected: true });
      }),

      multiplayerService.on('playerLeft', (_color: import('../chess/types').PieceColor) => {
        set({ opponentConnected: false });
      }),

      multiplayerService.on('moveMade', (move: import('../chess/types').Move, fen: string, clocks: import('../chess/types').ClockState) => {
        get().applyServerMove(move, fen, clocks);
      }),

      multiplayerService.on('moveRejected', (reason: string) => {
        console.log('Move rejected:', reason);
        // Could show notification to user
      }),

      multiplayerService.on('gameEnded', (result: import('../chess/types').GameResult, reason: string) => {
        get().applyGameEnd(result, reason);
      }),

      multiplayerService.on('drawOffered', (color: import('../chess/types').PieceColor) => {
        set({ drawOfferedBy: color });
      }),

      multiplayerService.on('error', (message: string) => {
        console.error('Server error:', message);
      }),

      multiplayerService.on('clockSync', (clocks: import('../chess/types').ClockState) => {
        set({ clock: clocks });
      }),

      multiplayerService.on('disconnect', (reason: string) => {
        console.log('Disconnected from server:', reason);
        set({ opponentConnected: false });
      }),

      // socket.io reconnects transparently, but the server's room membership is
      // keyed by socket id — which just changed. Without re-joining, the client
      // stays silently orphaned: no clockSync, no moves, no game end.
      multiplayerService.on('connect', () => {
        const { isOnlineGame, onlineGameId, myPlayerId } = get();
        if (!isOnlineGame || !onlineGameId) return;
        void multiplayerService
          .reconnectGame(onlineGameId, myPlayerId ?? undefined)
          .then((response: { game?: import('../chess/types').GameRoom; color?: PieceColor }) => {
            if (response?.color) set({ myColor: response.color });
            if (response?.game) get().applyServerGameState(response.game);
          })
          .catch((error: unknown) => {
            console.error('Failed to rejoin game after reconnect:', error);
          });
      }),
    );
  },

  createOnlineGame: async (playerName: string, timeControl: string, color?: 'white' | 'black' | 'random') => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await releasePreviousSeat(get);
    const response = await multiplayerService.createGame({ playerName, timeControl, color });

    set({
      gameMode: 'online',
      isOnlineGame: true,
      onlineGameId: response.gameId ?? null,
      myColor: response.color ?? null,
      myPlayerId: playerIdForColor(response.game, response.color),
      myName: playerName,
      // Always look at the board from your own side, so the panel under the
      // board is you and the one above it is your opponent.
      orientation: (response.color ?? 'white') as BoardOrientation,
      opponentName: null,
      opponentConnected: false,
      drawOfferedBy: null,
    });

    if (response.game) {
      get().applyServerGameState(response.game);
    }
  },

  joinOnlineGame: async (gameId: string, playerName: string) => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await releasePreviousSeat(get);
    const response = await multiplayerService.joinGame(gameId, playerName);

    // The opponent is whoever holds the *other* seat. Falling back to
    // "whichever player exists" shows a joiner their own name.
    const opponent =
      response.color === 'white' ? response.game?.blackPlayer : response.game?.whitePlayer;

    set({
      gameMode: 'online',
      isOnlineGame: true,
      onlineGameId: gameId.toUpperCase(),
      myColor: response.color ?? null,
      myPlayerId: playerIdForColor(response.game, response.color),
      myName: playerName,
      // Same reason as createOnlineGame: your own colour sits at the bottom.
      orientation: (response.color ?? 'white') as BoardOrientation,
      opponentName: opponent?.name ?? null,
      opponentConnected: opponent?.connected ?? false,
      drawOfferedBy: null,
    });

    if (response.game) {
      get().applyServerGameState(response.game);
    }
  },

  leaveOnlineGame: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.leaveGame();

    set({
      gameMode: 'local',
      isOnlineGame: false,
      onlineGameId: null,
      myColor: null,
      myPlayerId: null,
      myName: null,
      opponentName: null,
      opponentConnected: false,
      drawOfferedBy: null,
    });

    get().resetGame();
  },

  makeOnlineMove: async (from: Position, to: Position, promotion?: PieceType) => {
    const { multiplayerService } = await import('../services/multiplayerService');
    const { isOnlineGame, myColor, currentTurn } = get();
    
    if (!isOnlineGame || myColor !== currentTurn) return;
    
    try {
      await multiplayerService.makeMove(from, to, promotion);
    } catch (error) {
      console.error('Failed to make online move:', error);
    }
  },

  offerOnlineDraw: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.offerDraw();
  },

  acceptOnlineDraw: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.acceptDraw();
  },

  declineOnlineDraw: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.declineDraw();
  },

  resignOnlineGame: async () => {
    const { multiplayerService } = await import('../services/multiplayerService');
    await multiplayerService.resign();
  },

  applyServerGameState: (game: import('../chess/types').GameRoom) => {
    const parsed = parseFEN(game.currentFEN);
    
    // Convert server Move format to client Move format
    const moveHistory = game.moveHistory.map((m: import('../chess/types').Move) => ({
      from: m.from,
      to: m.to,
      piece: m.piece,
      capturedPiece: m.capturedPiece,
      promotion: m.promotion,
      isCastling: m.isCastling,
      isEnPassant: m.isEnPassant,
      san: m.san,
      check: m.check,
      checkmate: m.checkmate,
    }));
    
    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

    set({
      board: parsed.board,
      currentTurn: game.turn,
      moveHistory,
      gameStatus: game.gameStatus,
      gameResult: game.result,
      winner: game.result === '1-0' ? 'white' : game.result === '0-1' ? 'black' : null,
      lastMove,
      castlingRights: parsed.castlingRights,
      enPassantTarget: parsed.enPassantTarget,
      halfmoveClock: parsed.halfmoveClock,
      fullmoveNumber: parsed.fullmoveNumber,
      // Must be the same 4-field key every other writer stores. Seeding this
      // with a full 6-field FEN would make repetition counting stop matching
      // after a server sync, since the halfmove/fullmove counters always differ.
      positionHistory: [
        getPositionKey(parsed.board, game.turn, parsed.castlingRights, parsed.enPassantTarget),
      ],
      pendingPromotion: null,
      drawOffer: game.drawOffer, // Server is the source of truth for draw offers
      drawOfferedBy: game.drawOffer?.offeredBy ?? null,
      timeControl: game.timeControl,
      clock: game.clocks,
      // A server sync always lands on the live position.
      analysisIndex: moveHistory.length,
      // A synced game is a different game from any whose dialog was dismissed.
      isGameOverDismissed: false,
    });
  },

  applyServerMove: (move: import('../chess/types').Move, fen: string, clocks: import('../chess/types').ClockState) => {
    const parsed = parseFEN(fen);

    const newMoveHistory = [...get().moveHistory, move];
    // Keep the repetition history growing during an online game, in the same
    // 4-field key format every other writer uses, so threefold detection on the
    // client agrees with the server instead of only ever holding the seed key.
    const nextPosKey = getPositionKey(
      parsed.board,
      parsed.turn,
      parsed.castlingRights,
      parsed.enPassantTarget,
    );

    set({
      board: parsed.board,
      currentTurn: parsed.turn,
      moveHistory: newMoveHistory,
      positionHistory: [...get().positionHistory, nextPosKey],
      lastMove: move,
      castlingRights: parsed.castlingRights,
      enPassantTarget: parsed.enPassantTarget,
      halfmoveClock: parsed.halfmoveClock,
      fullmoveNumber: parsed.fullmoveNumber,
      clock: clocks,
      selectedSquare: null,
      possibleMoves: [],
      pendingPromotion: null,
      drawOffer: null, // Playing on withdraws any pending offer
      drawOfferedBy: null,
      analysisIndex: newMoveHistory.length,
    });
  },

  applyGameEnd: (result: import('../chess/types').GameResult, reason: string) => {
    const winner = result === '1-0' ? 'white' : result === '0-1' ? 'black' : null;
    const state = get();

    // The server's `reason` is a human-readable sentence, not a DrawReason, so
    // casting it would put junk like 'Checkmate! white wins' into drawReason and
    // leave every decisive online game labelled 'checkmate' — including
    // resignations and flag-falls. Classify the sentence instead.
    const lowered = reason.toLowerCase();
    let gameStatus: GameStatus;
    let drawReason: DrawReason = null;

    if (winner) {
      if (lowered.includes('resign')) {
        gameStatus = 'resigned';
        drawReason = null;
      } else if (lowered.includes('time') || lowered.includes('flag')) {
        gameStatus = 'timeout';
      } else {
        gameStatus = 'checkmate';
      }
    } else if (lowered.includes('stalemate')) {
      gameStatus = 'stalemate';
      drawReason = 'Stalemate';
    } else {
      gameStatus = 'draw';
      if (lowered.includes('accept')) {
        drawReason = 'Draw Offer Accepted';
      } else if (lowered.includes('time') || lowered.includes('flag')) {
        drawReason = 'Timeout vs Insufficient Material';
      } else if (isInsufficientMaterial(state.board)) {
        // The server reports a bare 'Draw' for every automatic draw, so the
        // specific cause has to be recovered from the position it just synced.
        drawReason = 'Insufficient Material';
      } else if (state.halfmoveClock >= 100) {
        drawReason = '50-Move Rule';
      } else {
        drawReason = 'Threefold Repetition';
      }
    }

    set({
      gameStatus,
      gameResult: result,
      winner,
      drawReason,
      // Freeze rather than stopClock(): these millisecond figures came from the
      // server, so deducting locally-measured elapsed time would fold clock skew
      // between the two machines into the final display.
      clock: { ...state.clock, isRunning: false, activeColor: null, lastTickMs: null },
    });

    // Play game end sound for online games
    sound.playGameEnd();
  },

  setOpponentConnected: (connected: boolean) => set({ opponentConnected: connected }),
  setDrawOfferedBy: (color: PieceColor | null) => set({ drawOfferedBy: color }),
  setIsJoinGameOpen: (open: boolean) => set({ isJoinGameOpen: open }),
}));