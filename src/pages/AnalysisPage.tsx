import { useEffect } from 'react';
import { Brain, X, Download, FileText, Search, Trash2 } from 'lucide-react';
import { useAnalysisStore } from '../store';
import { useSettingsStore } from '../store/useSettingsStore';
import { ChessBoard } from '../components/chess/ChessBoard';
import { BoardViewContext } from '../components/chess/BoardView';
import { EvaluationBar, EngineEvaluation, MoveHistory, PlayerPanel, GameReviewControls } from '../components/game';
import { getCapturedPieces } from '../chess';

export function AnalysisPage() {
  const {
    board,
    orientation,
    currentTurn,
    gameStatus,
    lastMove,
    moveHistory,
    analysisIndex,
    isAnalyzing,
    isReviewing,
    reviewProgress,
    moveReviews,
    engineLines,
    currentEvaluation,
    analysisDepth,
    goToMove,
    goToStart,
    goToEnd,
    previousMove,
    nextMove,
    flipBoard,
    analyzeCurrentPosition,
    analyzeAllMoves,
    stopReview,
    clearReviews,
    getCurrentFEN,
    exportPGN,
    loadPGN,
    loadFEN,
  } = useAnalysisStore();
  
  // Get display settings from centralized settings store
  const showEvaluationBar = useSettingsStore((s) => s.computer.showEvaluationBar);
  const showEngineEvaluation = useSettingsStore((s) => s.computer.showEngineEvaluation);
  const showCoordinates = useSettingsStore((s) => s.board.showCoordinates);

  // The "Analyze" buttons on the game page hand the finished game over by stashing
  // its PGN under this key and navigating here. Nothing used to read it back, so
  // Analyze always landed on an empty starting position. Consumed once and removed
  // so a later direct visit to /analysis does not resurrect a stale game.
  useEffect(() => {
    const pgn = localStorage.getItem('analysis-pgn');
    if (!pgn) return;
    localStorage.removeItem('analysis-pgn');
    loadPGN(pgn);
  }, [loadPGN]);

  // Keyboard shortcuts for analysis page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isModalOpen = document.querySelector('[class*="fixed inset-0 z-50"]') !== null;
      
      if (isInput || isModalOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          previousMove();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextMove();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          flipBoard();
          break;
        case 'Escape':
          // Close any open modals - handled by individual components
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previousMove, nextMove, goToStart, goToEnd, flipBoard]);

  const capturedInfo = getCapturedPieces(board);

  const isWhiteOrientation = orientation === 'white';

  const topPlayer = isWhiteOrientation
    ? {
        color: 'black' as const,
        name: 'Black',
        rating: 1500,
        isCurrentTurn: currentTurn === 'black',
        capturedPieces: capturedInfo.whiteCaptured,
        materialScore: capturedInfo.blackScore,
      }
    : {
        color: 'white' as const,
        name: 'White',
        rating: 1500,
        isCurrentTurn: currentTurn === 'white',
        capturedPieces: capturedInfo.blackCaptured,
        materialScore: capturedInfo.whiteScore,
      };

  const bottomPlayer = isWhiteOrientation
    ? {
        color: 'white' as const,
        name: 'White',
        rating: 1500,
        isCurrentTurn: currentTurn === 'white',
        capturedPieces: capturedInfo.blackCaptured,
        materialScore: capturedInfo.whiteScore,
      }
    : {
        color: 'black' as const,
        name: 'Black',
        rating: 1500,
        isCurrentTurn: currentTurn === 'black',
        capturedPieces: capturedInfo.whiteCaptured,
        materialScore: capturedInfo.blackScore,
      };

  const currentReview = moveReviews.find((r: { moveIndex: number }) => r.moveIndex === analysisIndex - 1);

  return (
    <div className="flex h-full w-full flex-col bg-gray-100 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-4">
          <GameReviewControls
            variant="bare"
            className="w-auto"
            index={analysisIndex}
            total={moveHistory.length}
            onGoToStart={goToStart}
            onPrevious={previousMove}
            onNext={nextMove}
            onGoToEnd={goToEnd}
          />

          <div className="flex-1 text-center">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Game Analysis</h1>
            {isReviewing && (
              <div className="flex items-center justify-center gap-2 mt-1">
                <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${reviewProgress * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(reviewProgress * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={analyzeAllMoves} disabled={isReviewing || moveHistory.length === 0} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50">
            <Brain size={14} />
            <span>{isReviewing ? 'Analyzing...' : 'Review All Moves'}</span>
          </button>
          <button onClick={stopReview} disabled={!isReviewing} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Stop review">
            <X size={18} />
          </button>
          <button onClick={clearReviews} disabled={moveReviews.length === 0} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Clear reviews">
            <Trash2 size={18} />
          </button>
          <button onClick={analyzeCurrentPosition} disabled={isAnalyzing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50">
            <Search size={14} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze Position'}</span>
          </button>
          <button onClick={() => navigator.clipboard.writeText(getCurrentFEN())} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Copy FEN">
            <FileText size={18} />
          </button>
          <button onClick={() => {
            const pgn = exportPGN();
            navigator.clipboard.writeText(pgn);
          }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Export PGN">
            <Download size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Board Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Player Panel */}
          <PlayerPanel {...topPlayer} />

          {/* Chess Board with Evaluation Bar */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="flex gap-1 items-stretch">
              {showEvaluationBar && (
                <EvaluationBar
                  evaluation={currentEvaluation}
                  orientation={orientation}
                  currentTurn={currentTurn}
                />
              )}
              {/* The board draws this page's replay, not the live game's
                  position — see BoardView. */}
              <BoardViewContext.Provider
                value={{ board, currentTurn, gameStatus, lastMove, orientation, ply: analysisIndex }}
              >
                <ChessBoard />
              </BoardViewContext.Provider>
            </div>
            {showEngineEvaluation && (
              <EngineEvaluation 
                className="absolute bottom-full left-0 right-0 mb-2 px-2"
                evaluation={currentEvaluation}
                engineLines={engineLines}
                depth={analysisDepth}
                isAnalyzing={isAnalyzing}
              />
            )}
            
            {/* Current move review info */}
            {currentReview && (
              <div className="absolute top-2 right-2 z-10 w-64 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-3 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {currentReview.isPlayerTurn === 'white' ? 'White' : 'Black'} to move
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    currentReview.classification === 'best' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    currentReview.classification === 'good' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                    currentReview.classification === 'inaccuracy' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    currentReview.classification === 'mistake' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                    currentReview.classification === 'blunder' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {currentReview.classification?.toUpperCase() || '—'}
                  </span>
                </div>
                <div className="text-sm font-mono text-gray-900 dark:text-gray-100 mb-1">
                  {currentReview.playerMove}
                </div>
                {(currentReview.evalBefore !== null || currentReview.evalAfter !== null) && (
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-mono">
                      {currentReview.evalBefore !== null 
                        ? (currentReview.evalBefore / 100).toFixed(2) 
                        : '—'}
                    </span>
                    <span>→</span>
                    <span className="font-mono">
                      {currentReview.evalAfter !== null 
                        ? (currentReview.evalAfter / 100).toFixed(2) 
                        : '—'}
                    </span>
                  </div>
                )}
                {currentReview.bestMoveSan && currentReview.bestMoveSan !== currentReview.playerMove && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Best: <span className="font-mono text-amber-600 dark:text-amber-400">{currentReview.bestMoveSan}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Player Panel */}
          <PlayerPanel {...bottomPlayer} />
        </div>

        {/* Sidebar */}
        <div className="w-80 flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/* Move History with Reviews. currentMoveIndex is a ply index, so the
              move being viewed is the one before the navigation index. */}
          <MoveHistory
            moveHistory={moveHistory}
            currentMoveIndex={analysisIndex - 1}
            onMoveClick={(ply) => goToMove(ply + 1)}
            moveReviews={moveReviews}
          />

          {/* FEN Display */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Current FEN</span>
              <button onClick={() => navigator.clipboard.writeText(getCurrentFEN())} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Copy FEN">
                <FileText size={14} className="text-gray-500" />
              </button>
            </div>
            <code className="text-xs font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 p-2 rounded break-all block max-h-16 overflow-auto">
              {getCurrentFEN()}
            </code>
          </div>

          {/* Captured Pieces */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Captured Pieces</span>
            <div className="mt-2 flex gap-2">
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">White captured</span>
                <div className="mt-1 flex justify-center gap-1 flex-wrap">
                  {capturedInfo.whiteCaptured.map((p: { type: string; color: string }, i: number) => (
                    <span key={i} className="text-lg">{p.color === 'white' ? '♙' : p.type === 'pawn' ? '♟' : p.type === 'knight' ? '♞' : p.type === 'bishop' ? '♝' : p.type === 'rook' ? '♜' : p.type === 'queen' ? '♛' : '♚'}</span>
                  ))}
                </div>
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">Black captured</span>
                <div className="mt-1 flex justify-center gap-1 flex-wrap">
                  {capturedInfo.blackCaptured.map((p: { type: string; color: string }, i: number) => (
                    <span key={i} className="text-lg">{p.color === 'black' ? '♙' : p.type === 'pawn' ? '♟' : p.type === 'knight' ? '♞' : p.type === 'bishop' ? '♝' : p.type === 'rook' ? '♜' : p.type === 'queen' ? '♛' : '♚'}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Display</span>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showEvaluationBar} onChange={(e) => useSettingsStore.getState().setComputer({ showEvaluationBar: e.target.checked })} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                Evaluation Bar
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showEngineEvaluation} onChange={(e) => useSettingsStore.getState().setComputer({ showEngineEvaluation: e.target.checked })} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                Engine Evaluation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showCoordinates} onChange={() => useSettingsStore.getState().setBoard({ showCoordinates: !showCoordinates })} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                Coordinates
              </label>
            </div>
          </div>

          {/* Load PGN/FEN */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Load Game</span>
            <div className="mt-3 space-y-2">
              <textarea 
                id="pgn-input"
                placeholder="Paste PGN here..."
                className="w-full p-2 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-h-[80px] resize-y"
              />
              <div className="flex gap-2">
                <button onClick={() => {
                  const pgn = (document.getElementById('pgn-input') as HTMLTextAreaElement)?.value;
                  if (pgn) loadPGN(pgn);
                }} className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500">
                  Load PGN
                </button>
                <button onClick={() => {
                  const fen = (document.getElementById('pgn-input') as HTMLTextAreaElement)?.value;
                  if (fen) loadFEN(fen);
                }} className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                  Load FEN
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}