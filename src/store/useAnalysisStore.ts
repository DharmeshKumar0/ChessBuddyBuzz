import { create } from 'zustand';
import type {
  Board,
  Position,
  Move,
  PieceColor,
  CastlingRights,
  GameResult,
  UiTheme,
  Piece,
} from '../chess';
import type {
  DifficultyLevel,
  EngineConfig,
  EnginePvLine,
  EvaluationData,
} from '../services/chessEngineService';
import {
  createInitialBoard,
  createInitialCastlingRights,
  getLegalMoves,
  updateCastlingRights,
  performCastlingBoardUpdate,
  getPositionKey,
} from '../chess';
import { generateSAN, appendCheckStatus } from '../chess/san';
import { generateFEN, parseFEN } from '../chess/fen';
import { exportPGN, parsePGN } from '../chess/pgn';
import { getEngineService, getDifficultyEngineConfig } from '../services/chessEngineService';

export type MoveClassification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'brilliant' | null;

export interface MoveReview {
  moveIndex: number;
  classification: MoveClassification;
  evalBefore: number | null;  // centipawns from white's perspective
  evalAfter: number | null;   // centipawns from white's perspective
  bestMove: string | null;    // UCI format
  bestMoveSan: string | null; // SAN format
  playerMove: string;         // SAN format
  isPlayerTurn: 'white' | 'black';
}

export interface AnalysisState {
  // Board state (read-only during analysis)
  board: Board;
  currentTurn: PieceColor;
  orientation: 'white' | 'black';
  moveHistory: Move[];
  gameStatus: 'idle' | 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw' | 'timeout' | 'resigned';
  gameResult: GameResult;
  lastMove: Move | null;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  positionHistory: string[];

  // Analysis state
  analysisIndex: number; // Current move index being analyzed (0 = start, moveHistory.length = end)
  isAnalyzing: boolean;
  engineConfig: EngineConfig;
  difficulty: DifficultyLevel;
  analysisDepth: number;
  showEngineLines: boolean;
  multiPV: number;
  /** Alternative variations from the last MultiPV search. */
  engineLines: EnginePvLine[];
  /** Evaluation of the position last analysed, from white's perspective. */
  currentEvaluation: EvaluationData | null;

  // Move review/analysis
  moveReviews: MoveReview[];
  isReviewing: boolean;
  reviewProgress: number; // 0-1

  // UI
  uiTheme: UiTheme;

  // Actions
  loadGame: (moves: Move[], initialFen?: string) => void;
  loadPGN: (pgn: string) => boolean;
  loadFEN: (fen: string) => boolean;
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  previousMove: () => void;
  nextMove: () => void;
  flipBoard: () => void;
  toggleUiTheme: () => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  setEngineConfig: (config: Partial<EngineConfig>) => void;
  setShowEngineLines: (show: boolean) => void;
  setMultiPV: (pv: number) => void;
  analyzeCurrentPosition: () => Promise<void>;
  stopAnalysis: () => Promise<void>;
  clearAnalysis: () => void;
  getCurrentFEN: () => string;
  exportPGN: () => string;
  
  // Move review actions
  analyzeAllMoves: () => Promise<void>;
  stopReview: () => Promise<void>;
  clearReviews: () => void;
  getMoveReview: (index: number) => MoveReview | null;
}

const initialBoard = createInitialBoard();
const initialRights = createInitialCastlingRights();
const initialPosKey = getPositionKey(initialBoard, 'white', initialRights, null);

/** Mate scores are clamped so eval deltas stay comparable to centipawn scores. */
const MATE_SCORE = 10_000;

/**
 * Analysis must never be handicapped. The difficulty presets exist to make the
 * engine a beatable *opponent* — every one of them sets UCI_LimitStrength with a
 * capped UCI_Elo and a low Skill Level, so reusing them here would grade the
 * user's moves against a deliberately weak engine (the default 'medium' preset
 * is ~1600 Elo). Only `depth`/`movetime` are honoured from the preset, as the
 * user's chosen speed/accuracy trade-off.
 */
const FULL_STRENGTH_OVERRIDES = {
  skillLevel: 20,
  uciLimitStrength: false,
} as const;

/**
 * Flatten an engine evaluation to a single centipawn number from white's
 * perspective. Returns null when the engine reported no score at all.
 */
function scoreToCentipawns(evaluation: EvaluationData | null): number | null {
  if (!evaluation) return null;
  if (evaluation.mate !== undefined) {
    return evaluation.mate > 0 ? MATE_SCORE : -MATE_SCORE;
  }
  return evaluation.score;
}

const initialState = {
  board: initialBoard,
  currentTurn: 'white' as PieceColor,
  orientation: 'white' as const,
  moveHistory: [] as Move[],
  gameStatus: 'idle' as const,
  gameResult: '*' as GameResult,
  lastMove: null as Move | null,
  castlingRights: initialRights,
  enPassantTarget: null as Position | null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
  positionHistory: [initialPosKey],
  analysisIndex: 0,
  isAnalyzing: false,
  engineConfig: getDifficultyEngineConfig('medium'),
  difficulty: 'medium' as DifficultyLevel,
  analysisDepth: 0,
  showEngineLines: true,
  multiPV: 3,
  engineLines: [] as EnginePvLine[],
  currentEvaluation: null as EvaluationData | null,
  moveReviews: [] as MoveReview[],
  isReviewing: false,
  reviewProgress: 0,
  uiTheme: 'dark' as UiTheme,
};

export const useAnalysisStore = create<AnalysisState>()((set, get) => ({
  ...initialState,

  loadGame: (moves: Move[], initialFen?: string) => {
    const startFen = initialFen || generateFEN(
      createInitialBoard(),
      'white',
      createInitialCastlingRights(),
      null,
      0,
      1
    );
    
    const parsed = parseFEN(startFen);
    let board = parsed.board;
    let turn: PieceColor = parsed.turn;
    let castlingRights = parsed.castlingRights;
    let enPassantTarget = parsed.enPassantTarget;
    let halfmoveClock = parsed.halfmoveClock;
    let fullmoveNumber = parsed.fullmoveNumber;
    const positionHistory: string[] = [startFen];
    const processedMoves: Move[] = [];

    for (const move of moves) {
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

      positionHistory.push(generateFEN(newBoard, nextTurn, nextCastlingRights, nextEnPassantTarget, nextHalfmoveClock, nextFullmoveNumber));

      const san = generateSAN(board, move, castlingRights);
      const sanWithStatus = appendCheckStatus(san, board, move, castlingRights);
      
      const processedMove: Move = {
        ...move,
        san: sanWithStatus,
        capturedPiece,
      };
      processedMoves.push(processedMove);

      board = newBoard;
      turn = nextTurn;
      castlingRights = nextCastlingRights;
      enPassantTarget = nextEnPassantTarget;
      halfmoveClock = nextHalfmoveClock;
      fullmoveNumber = nextFullmoveNumber;
    }

    const inCheck = false; // Simplified - could add full check detection
    const canMove = true; // Simplified

    set({
      board,
      currentTurn: turn,
      moveHistory: processedMoves,
      gameStatus: processedMoves.length > 0 ? (inCheck && !canMove ? 'checkmate' : 'playing') : 'idle',
      gameResult: '*',
      lastMove: processedMoves.length > 0 ? processedMoves[processedMoves.length - 1] : null,
      castlingRights,
      enPassantTarget,
      halfmoveClock,
      fullmoveNumber,
      positionHistory,
      analysisIndex: processedMoves.length,
      engineLines: [],
      currentEvaluation: null,
    });
  },

  loadPGN: (pgn: string) => {
    try {
      const result = parsePGN(pgn);
      if (result.moveHistory.length > 0) {
        get().loadGame(result.moveHistory, result.initialFen);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  loadFEN: (fen: string) => {
    try {
      const parsed = parseFEN(fen);
      
      set({
        board: parsed.board,
        currentTurn: parsed.turn,
        castlingRights: parsed.castlingRights,
        enPassantTarget: parsed.enPassantTarget,
        halfmoveClock: parsed.halfmoveClock,
        fullmoveNumber: parsed.fullmoveNumber,
        positionHistory: [fen],
        moveHistory: [],
        gameStatus: 'playing',
        gameResult: '*' as GameResult,
        lastMove: null,
        analysisIndex: 0,
        engineLines: [],
        currentEvaluation: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  goToMove: (index: number) => {
    const { moveHistory, loadGame } = get();
    if (index < 0 || index > moveHistory.length) return;

    loadGame(moveHistory.slice(0, index));
    // loadGame rebuilds the position from the moves it is handed and stores that
    // list as *the* game. Left alone, stepping back one move threw away every
    // move after it: the game got shorter with each click and Next had nothing
    // left to step through, so the board could only ever go backwards.
    set({ moveHistory, analysisIndex: index });
  },

  goToStart: () => get().goToMove(0),

  goToEnd: () => get().goToMove(get().moveHistory.length),

  previousMove: () => {
    const { analysisIndex } = get();
    if (analysisIndex > 0) {
      get().goToMove(analysisIndex - 1);
    }
  },

  nextMove: () => {
    const { analysisIndex, moveHistory } = get();
    if (analysisIndex < moveHistory.length) {
      get().goToMove(analysisIndex + 1);
    }
  },

  flipBoard: () =>
    set((state) => ({
      orientation: state.orientation === 'white' ? 'black' : 'white',
    })),

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

  setDifficulty: (difficulty: DifficultyLevel) => {
    const config = getDifficultyEngineConfig(difficulty);
    set({ difficulty, engineConfig: config });
  },

  setEngineConfig: (config: Partial<EngineConfig>) =>
    set((state) => ({ engineConfig: { ...state.engineConfig, ...config } })),

  setShowEngineLines: (show: boolean) => set({ showEngineLines: show }),
  setMultiPV: (pv: number) => set({ multiPV: Math.max(1, Math.min(10, pv)) }),

  analyzeCurrentPosition: async () => {
    const { board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber, engineConfig, multiPV, isAnalyzing, isReviewing } = get();
    // One engine instance, one search at a time. A full-game review drives the
    // same engine, so starting a single-position analysis on top of it would make
    // the two searches steal each other's `bestmove` lines.
    if (isAnalyzing || isReviewing) return;

    set({ isAnalyzing: true, engineLines: [], currentEvaluation: null });

    try {
      const engine = getEngineService();
      await engine.initialize();

      const analysisConfig = { ...engineConfig, ...FULL_STRENGTH_OVERRIDES, multiPV };
      await engine.setConfig(analysisConfig);

      const fen = generateFEN(board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber);

      await engine.setPosition(fen);

      // A single MultiPV search yields every variation; running N parallel
      // searches on one engine instance was broken and wasted the engine.
      const result = await engine.go(analysisConfig);
      const topLine = result.lines[0];

      set({
        engineLines: result.lines,
        currentEvaluation: result.evaluation,
        analysisDepth: topLine?.depth ?? result.evaluation?.depth ?? 0,
      });
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      set({ isAnalyzing: false });
    }
  },

  stopAnalysis: async () => {
    const engine = getEngineService();
    await engine.stop();
    set({ isAnalyzing: false });
  },

  clearAnalysis: () => set({ engineLines: [], currentEvaluation: null, analysisDepth: 0 }),

  getCurrentFEN: () => {
    const { board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber } = get();
    return generateFEN(board, currentTurn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber);
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

  // Move review actions
  analyzeAllMoves: async () => {
    const { moveHistory, engineConfig, isReviewing, isAnalyzing } = get();
    // Same single-engine constraint as analyzeCurrentPosition.
    if (isReviewing || isAnalyzing || moveHistory.length === 0) return;

    set({ isReviewing: true, reviewProgress: 0, moveReviews: [] });

    try {
      const engine = getEngineService();
      await engine.initialize();

      const analysisConfig = { ...engineConfig, ...FULL_STRENGTH_OVERRIDES, multiPV: 1 };
      await engine.setConfig(analysisConfig);

      /**
       * A search can legitimately fail: a mated or stalemated position has no
       * best move, and the engine can time out. Letting that throw out of the
       * loop discarded every review computed so far, so the whole game report
       * came back empty because of one terminal position at the end.
       */
      const searchPosition = async (fen: string) => {
        try {
          await engine.setPosition(fen);
          return await engine.go({ ...analysisConfig, depth: 15 });
        } catch (error) {
          console.warn('Skipping position that could not be searched:', fen, error);
          return null;
        }
      };

      // Replay the game move by move, analyzing each position
      const startFen = generateFEN(
        createInitialBoard(),
        'white',
        createInitialCastlingRights(),
        null,
        0,
        1
      );
      
      let board = parseFEN(startFen).board;
      let turn: 'white' | 'black' = 'white';
      let castlingRights = createInitialCastlingRights();
      let enPassantTarget: Position | null = null;
      let halfmoveClock = 0;
      let fullmoveNumber = 1;

      const reviews: MoveReview[] = [];

      for (let i = 0; i < moveHistory.length; i++) {
        // `stopReview` clears the flag; bail out so the loop actually stops
        // instead of grinding through the rest of the game.
        if (!get().isReviewing) break;

        const move = moveHistory[i];

        // Update progress
        set({ reviewProgress: (i + 1) / moveHistory.length });

        // Get evaluation BEFORE the move
        const fenBefore = generateFEN(board, turn, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber);
        const evalBeforeResult = await searchPosition(fenBefore);

        let evalBefore: number | null = null;
        let bestMoveBefore: string | null = null;
        let bestMoveSanBefore: string | null = null;

        if (evalBeforeResult?.bestMove) {
          bestMoveBefore = evalBeforeResult.bestMove;
          // The engine service already normalises scores to white's perspective.
          evalBefore = scoreToCentipawns(evalBeforeResult.evaluation);
          
          // Convert best move to SAN
          try {
            const from = { row: 8 - parseInt(bestMoveBefore[1]), col: bestMoveBefore.charCodeAt(0) - 97 };
            const to = { row: 8 - parseInt(bestMoveBefore[3]), col: bestMoveBefore.charCodeAt(2) - 97 };
            const piece = board[from.row][from.col];
            if (piece) {
              const legalMoves = getLegalMoves(board, from, castlingRights, enPassantTarget);
              const legalMove = legalMoves.find(m => m.row === to.row && m.col === to.col);
              if (legalMove) {
                const san = generateSAN(board, { ...move, from, to, piece }, castlingRights);
                bestMoveSanBefore = appendCheckStatus(san, board, { ...move, from, to, piece }, castlingRights);
              }
            }
          } catch {}
        }

        // Make the player's move on the board
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
        const nextTurn: 'white' | 'black' = turn === 'white' ? 'black' : 'white';
        const nextFullmoveNumber = nextTurn === 'white' ? fullmoveNumber + 1 : fullmoveNumber;

        // Get evaluation AFTER the move
        const fenAfter = generateFEN(newBoard, nextTurn, nextCastlingRights, nextEnPassantTarget, nextHalfmoveClock, nextFullmoveNumber);
        const evalAfterResult = await searchPosition(fenAfter);

        const evalAfter: number | null = scoreToCentipawns(evalAfterResult?.evaluation ?? null);

        // Classify the move based on evaluation change
        // Evaluation is from white's perspective
        // If white moved: positive eval is good for white
        // If black moved: negative eval is good for black
        let classification: MoveClassification = null;
        
        if (evalBefore !== null && evalAfter !== null) {
          // Convert to player's perspective
          const playerPerspective = turn === 'white' ? 1 : -1;
          const evalChange = (evalAfter - evalBefore) * playerPerspective;
          
          // Classification thresholds (in centipawns)
          if (evalChange >= -10) {
            classification = 'best';
          } else if (evalChange >= -50) {
            classification = 'good';
          } else if (evalChange >= -100) {
            classification = 'inaccuracy';
          } else if (evalChange >= -300) {
            classification = 'mistake';
          } else {
            classification = 'blunder';
          }
        }

        reviews.push({
          moveIndex: i,
          classification,
          evalBefore,
          evalAfter,
          bestMove: bestMoveBefore,
          bestMoveSan: bestMoveSanBefore,
          playerMove: move.san,
          isPlayerTurn: turn,
        });

        // Update board state for next iteration
        board = newBoard;
        turn = nextTurn;
        castlingRights = nextCastlingRights;
        enPassantTarget = nextEnPassantTarget;
        halfmoveClock = nextHalfmoveClock;
        fullmoveNumber = nextFullmoveNumber;
      }

      set({
        moveReviews: reviews,
        reviewProgress: moveHistory.length > 0 ? reviews.length / moveHistory.length : 0,
      });
    } catch (error) {
      console.error('Review error:', error);
    } finally {
      set({ isReviewing: false });
    }
  },

  stopReview: async () => {
    const engine = getEngineService();
    await engine.stop();
    set({ isReviewing: false, reviewProgress: 0 });
  },

  clearReviews: () => set({ moveReviews: [], reviewProgress: 0 }),

  getMoveReview: (index: number) => {
    const { moveReviews } = get();
    return moveReviews.find(r => r.moveIndex === index) || null;
  },
}));