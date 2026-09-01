import { useEffect } from 'react';
import { useChessStore } from '../store/useChessStore';
import { useBoardOrientation } from '../store/useBoardOrientation';
import { useBotSeat } from '../store/useBotSeat';
import { useSettingsStore } from '../store/useSettingsStore';
import { getCapturedPieces } from '../chess';
import { isPlayableGameStatus } from '../store';
import { ChessBoard } from '../components/chess';
import { BoardControls, MoveHistory, GameReviewControls, PlayerPanel, ClockDisplay, GameOverDialog, NewGameSetup, EvaluationBar, EngineEvaluation, ThinkingIndicator, JoinGameModal, ConnectionStatus, OnlineGameSetup } from '../components/game';
import { Layout } from '../components/layout';

export function GamePage() {
  const board = useChessStore((s) => s.board);
  const currentTurn = useChessStore((s) => s.currentTurn);
  const gameStatus = useChessStore((s) => s.gameStatus);
  const moveHistory = useChessStore((s) => s.moveHistory);
  const tickClock = useChessStore((s) => s.tickClock);
  const gameMode = useChessStore((s) => s.gameMode);
  const computerColor = useChessStore((s) => s.computerColor);
  const isEngineThinking = useChessStore((s) => s.isEngineThinking);
  const makeEngineMove = useChessStore((s) => s.makeEngineMove);
  const flipBoard = useChessStore((s) => s.flipBoard);
  const goToMove = useChessStore((s) => s.goToMove);
  const goToStart = useChessStore((s) => s.goToStart);
  const goToEnd = useChessStore((s) => s.goToEnd);
  const previousMove = useChessStore((s) => s.previousMove);
  const nextMove = useChessStore((s) => s.nextMove);
  const analysisIndex = useChessStore((s) => s.analysisIndex);
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const myColor = useChessStore((s) => s.myColor);
  const myName = useChessStore((s) => s.myName);
  const opponentName = useChessStore((s) => s.opponentName);
  const showCoordinates = useSettingsStore((s) => s.board.showCoordinates);

  const capturedInfo = getCapturedPieces(board);

  // The same value the board itself uses, so the panel under the board always
  // belongs to the player whose pieces are on that half of it.
  const isWhiteOrientation = useBoardOrientation() === 'white';

  // Non-null only in a game against a bot, and only for the bot's own side.
  const botSeat = useBotSeat();

  /**
   * Online games label each panel with the name that player typed into the
   * invite screen, so it is obvious who is playing which colour. Against a bot,
   * the bot's side carries its name and the player's says "You". The name is
   * keyed off the panel's colour rather than its position, so it stays with its
   * own pieces however the board is turned. Local games keep their old labels.
   */
  const nameForColor = (color: 'white' | 'black', fallback: string): string => {
    if (botSeat) return color === botSeat.color ? botSeat.name : 'You';
    if (!isOnlineGame) return fallback;
    if (color === myColor) return myName ?? 'You';
    return opponentName ?? 'Waiting for opponent…';
  };

  /** Bots advertise their own rating; humans have no rating in this app yet. */
  const ratingForColor = (color: 'white' | 'black'): number =>
    botSeat && color === botSeat.color ? botSeat.elo : 1500;

  const topPlayer = isWhiteOrientation
    ? {
        color: 'black' as const,
        name: nameForColor('black', 'Opponent'),
        rating: ratingForColor('black'),
        isCurrentTurn: currentTurn === 'black',
        capturedPieces: capturedInfo.whiteCaptured,
        materialScore: capturedInfo.blackScore,
      }
    : {
        color: 'white' as const,
        name: nameForColor('white', 'Player'),
        rating: ratingForColor('white'),
        isCurrentTurn: currentTurn === 'white',
        capturedPieces: capturedInfo.blackCaptured,
        materialScore: capturedInfo.whiteScore,
      };

  const bottomPlayer = isWhiteOrientation
    ? {
        color: 'white' as const,
        name: nameForColor('white', 'Player'),
        rating: ratingForColor('white'),
        isCurrentTurn: currentTurn === 'white',
        capturedPieces: capturedInfo.blackCaptured,
        materialScore: capturedInfo.whiteScore,
      }
    : {
        color: 'black' as const,
        name: nameForColor('black', 'Opponent'),
        rating: ratingForColor('black'),
        isCurrentTurn: currentTurn === 'black',
        capturedPieces: capturedInfo.whiteCaptured,
        materialScore: capturedInfo.blackScore,
      };

  // Tick clock every 100ms for smooth updates
  // (executeMove owns starting/switching the clock; the server owns it online)
  useEffect(() => {
    const interval = setInterval(tickClock, 100);
    return () => clearInterval(interval);
  }, [tickClock]);

  // Trigger engine move when it's the bot's turn.
  // 'idle' counts: a bot with white has to open the game, and a game nobody has
  // moved in yet is still 'idle'. 'check' counts too — it is a live status, so
  // testing for 'playing' alone left the bot sitting there while checked.
  // analysisIndex is a dependency because the bot declines to move while the
  // board is rewound for review; coming back to the live position has to wake it.
  useEffect(() => {
    if (
      gameMode === 'computer' &&
      isPlayableGameStatus(gameStatus) &&
      computerColor === currentTurn &&
      !isEngineThinking
    ) {
      makeEngineMove();
    }
  }, [
    gameMode,
    gameStatus,
    currentTurn,
    computerColor,
    isEngineThinking,
    analysisIndex,
    moveHistory.length,
    makeEngineMove,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input/textarea or if a modal is open
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isModalOpen = document.querySelector('[class*="fixed inset-0 z-50"]') !== null;
      
      if (isInput || isModalOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (gameStatus !== 'playing' || moveHistory.length > 0) {
            const idx = analysisIndex > 0 ? analysisIndex - 1 : 0;
            goToMove(idx);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (gameStatus !== 'playing' || moveHistory.length > 0) {
            const idx = analysisIndex < moveHistory.length ? analysisIndex + 1 : moveHistory.length;
            goToMove(idx);
          }
          break;
        case 'Home':
          e.preventDefault();
          goToMove(0);
          break;
        case 'End':
          e.preventDefault();
          goToMove(moveHistory.length);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          flipBoard();
          break;
        case 'Escape':
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStatus, moveHistory.length, analysisIndex, goToMove, flipBoard]);

  return (
    <Layout>
      <div className="w-full flex flex-col lg:flex-row lg:items-start lg:gap-6 p-3 sm:p-4 max-w-full overflow-hidden">
        {/* Main Chess Board Section - Full width on mobile, flexible on desktop */}
        <div className="flex-1 w-full lg:w-[calc(100%-20rem)] min-w-0 flex flex-col gap-2">
          {/* Top Player Panel */}
          <PlayerPanel {...topPlayer} />

          {/* Chess Board with Evaluation Bar - responsive sizing */}
          <div className="flex flex-col items-center gap-2 py-2 relative w-full">
            <div className="flex gap-1 items-stretch w-full max-w-[min(95vw,540px)] mx-auto">
              {showCoordinates && <EvaluationBar />}
              <ChessBoard />
            </div>
            <EngineEvaluation className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 w-full max-w-[min(95vw,540px)]" />
          </div>

          {/* Bottom Player Panel */}
          <PlayerPanel {...bottomPlayer} />
        </div>

        {/* Sidebar / Game Panel - Collapsible on mobile */}
        <aside className="w-full lg:w-72 lg:min-w-72 flex-shrink-0 flex flex-col gap-3 order-first lg:order-last">
          <ClockDisplay />
          <BoardControls />
          {/* Replaying needs moves to replay; before that the controls are noise. */}
          {moveHistory.length > 0 && (
            <GameReviewControls
              index={analysisIndex}
              total={moveHistory.length}
              onGoToStart={goToStart}
              onPrevious={previousMove}
              onNext={nextMove}
              onGoToEnd={goToEnd}
            />
          )}
          {/* Clicking a move jumps the board to the position right after it. */}
          <MoveHistory
            className="flex-1 min-h-0"
            currentMoveIndex={analysisIndex - 1}
            onMoveClick={(ply) => goToMove(ply + 1)}
          />
        </aside>
      </div>

      {/* Game Over Dialog */}
      <GameOverDialog />
      {/* New Game Setup */}
      <NewGameSetup />
      {/* Online Game Setup */}
      <OnlineGameSetup />
      {/* Join Game Modal */}
      <JoinGameModal />
      {/* Connection Status */}
      <ConnectionStatus />
      {/* Thinking Indicator */}
      <ThinkingIndicator />
    </Layout>
  );
}
