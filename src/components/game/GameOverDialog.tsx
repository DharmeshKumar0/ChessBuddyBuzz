import { Clock, Trophy, RefreshCw, RotateCcw, Search, History, Copy, FileText, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChessStore, isTerminalGameStatus } from '../../store/useChessStore';
import { formatTime } from '../../utils/clock';
import { useEffect } from 'react';

export function GameOverDialog() {
  // Only a *finished* game opens this dialog. `gameStatus !== 'playing'` would
  // also fire on 'check', popping the modal up on every check. Closing it does
  // not end the game — it steps aside so the board can be reviewed.
  const isFinished = useChessStore((s) => isTerminalGameStatus(s.gameStatus));
  const isGameOverDismissed = useChessStore((s) => s.isGameOverDismissed);
  const isOpen = isFinished && !isGameOverDismissed;
  const gameStatus = useChessStore((s) => s.gameStatus);
  const gameResult = useChessStore((s) => s.gameResult);
  const winner = useChessStore((s) => s.winner);
  const drawReason = useChessStore((s) => s.drawReason);
  const clock = useChessStore((s) => s.clock);
  const newGame = useChessStore((s) => s.newGame);
  const exportPGN = useChessStore((s) => s.exportPGN);
  const copyFEN = useChessStore((s) => s.copyFEN);
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const gameMode = useChessStore((s) => s.gameMode);
  const computerColor = useChessStore((s) => s.computerColor);
  const leaveOnlineGame = useChessStore((s) => s.leaveOnlineGame);
  const setNewGameSetupOpen = useChessStore((s) => s.setNewGameSetupOpen);
  const dismissGameOver = useChessStore((s) => s.dismissGameOver);
  const goToStart = useChessStore((s) => s.goToStart);
  const navigate = useNavigate();

  // Keyboard shortcuts for game over dialog
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'Escape') {
        // Close onto the finished board instead of trapping the viewer in the
        // dialog. The game is left exactly as it ended.
        e.preventDefault();
        dismissGameOver();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dismissGameOver]);

  if (!isOpen) return null;

  const getResultInfo = () => {
    switch (gameStatus) {
      case 'checkmate':
        return {
          title: 'Checkmate',
          winnerColor: winner,
          message: winner === 'white' ? 'White wins by checkmate' : 'Black wins by checkmate',
          icon: Trophy,
          iconColor: 'text-amber-500',
        };
      case 'timeout':
        return {
          title: 'Time\'s Up',
          winnerColor: winner,
          message: winner === 'white' ? 'Black flagged - White wins on time' : 'White flagged - Black wins on time',
          icon: Clock,
          iconColor: 'text-red-500',
        };
      case 'stalemate':
        return {
          title: 'Stalemate',
          winnerColor: null,
          message: 'Game drawn by stalemate',
          icon: Clock,
          iconColor: 'text-gray-500',
        };
      case 'draw':
        return {
          title: 'Draw',
          winnerColor: null,
          message: drawReason || 'Game drawn',
          icon: Clock,
          iconColor: 'text-gray-500',
        };
      case 'resigned':
        return {
          title: 'Resignation',
          winnerColor: winner,
          message: winner === 'white' ? 'Black resigned - White wins' : 'White resigned - Black wins',
          icon: Trophy,
          iconColor: 'text-amber-500',
        };
      default:
        return {
          title: 'Game Over',
          winnerColor: null,
          message: 'Game ended',
          icon: Clock,
          iconColor: 'text-gray-500',
        };
    }
  };

  const info = getResultInfo();
  const Icon = info.icon;

  const whiteTime = formatTime(clock.whiteMs);
  const blackTime = formatTime(clock.blackMs);

  const handleNewGame = () => {
    if (isOnlineGame) {
      leaveOnlineGame();
    }
    setNewGameSetupOpen(true);
    newGame();
  };

  const handleRematch = () => {
    if (isOnlineGame) {
      // For online, leave and create new game
      leaveOnlineGame();
      setNewGameSetupOpen(true);
    } else if (gameMode === 'computer') {
      // Same bot, same sides. A bare newGame() resets the mode to 'local', which
      // quietly turned a rematch against a bot into a game against nobody.
      newGame({ opponent: 'computer', color: computerColor === 'white' ? 'black' : 'white' });
    } else {
      newGame();
    }
  };

  const handleAnalyze = () => {
    const pgn = exportPGN();
    localStorage.setItem('analysis-pgn', pgn);
    navigate('/analysis');
  };

  /**
   * Replay the game on the board it was just played on: close the dialog, keep
   * the finished game, and rewind to the opening position so the review
   * controls under the board can walk forward through it.
   */
  const handleReview = () => {
    dismissGameOver();
    goToStart();
  };

  const handleCopyFEN = () => {
    const fen = copyFEN();
    navigator.clipboard.writeText(fen);
  };

  const handleCopyPGN = () => {
    const pgn = exportPGN();
    navigator.clipboard.writeText(pgn);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — clicking away leaves the finished game on the board */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={dismissGameOver}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {info.title}
          </h2>
          <button
            onClick={dismissGameOver}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            title="Close and review the board"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Result Icon */}
        <div className={`flex justify-center mb-4 ${info.iconColor}`}>
          <Icon size={48} className="animate-pulse" />
        </div>

        {/* Result Message */}
        <div className="text-center mb-6">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {info.message}
          </p>
        </div>

        {/* Final Clock Times */}
        <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="text-center">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              White
            </div>
            <div className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
              {whiteTime}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Black
            </div>
            <div className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
              {blackTime}
            </div>
          </div>
        </div>

        {/* Game Result */}
        <div className="text-center mb-6">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
              gameResult === '1-0' || gameResult === '0-1'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
            }`}
          >
            {gameResult === '1-0' && '1-0 White Wins'}
            {gameResult === '0-1' && '0-1 Black Wins'}
            {gameResult === '1/2-1/2' && '½-½ Draw'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handleRematch}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500"
            >
              <RotateCcw size={16} />
              Rematch
            </button>
            <button
              onClick={handleNewGame}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
            >
              <RefreshCw size={16} />
              New Game
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReview}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              title="Step through this game on the board"
            >
              <History size={16} />
              Review Game
            </button>
            <button
              onClick={handleAnalyze}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              title="Open the analysis board with the engine"
            >
              <Search size={16} />
              Analyze
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyFEN}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-100 text-gray-700 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Copy size={14} />
              Copy FEN
            </button>
            <button
              onClick={handleCopyPGN}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-100 text-gray-700 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <FileText size={14} />
              Copy PGN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}