import { FlipVertical, RefreshCw, Settings, Sun, Moon, Flag, Handshake, RotateCcw, Loader2, BarChart2 } from 'lucide-react';
import { useState } from 'react';
import { useChessStore, isTerminalGameStatus } from '../../store/useChessStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useNavigate } from 'react-router-dom';

export function BoardControls() {
  const flipBoard = useChessStore((s) => s.flipBoard);
  const resign = useChessStore((s) => s.resign);
  const offerDraw = useChessStore((s) => s.offerDraw);
  const acceptDraw = useChessStore((s) => s.acceptDraw);
  const declineDraw = useChessStore((s) => s.declineDraw);
  const setSettingsOpen = useChessStore((s) => s.setSettingsOpen);
  const setNewGameSetupOpen = useChessStore((s) => s.setNewGameSetupOpen);
  const uiTheme = useChessStore((s) => s.uiTheme);
  const toggleUiTheme = useChessStore((s) => s.toggleUiTheme);
  const currentTurn = useChessStore((s) => s.currentTurn);
  const gameStatus = useChessStore((s) => s.gameStatus);
  const drawOffer = useChessStore((s) => s.drawOffer);
  const myColor = useChessStore((s) => s.myColor);
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const opponentConnected = useChessStore((s) => s.opponentConnected);
  const resignOnlineGame = useChessStore((s) => s.resignOnlineGame);
  const offerOnlineDraw = useChessStore((s) => s.offerOnlineDraw);
  const acceptOnlineDraw = useChessStore((s) => s.acceptOnlineDraw);
  const declineOnlineDraw = useChessStore((s) => s.declineOnlineDraw);
  const leaveOnlineGame = useChessStore((s) => s.leaveOnlineGame);
  
  // Read gameplay settings from centralized settings store
  const confirmResignation = useSettingsStore((s) => s.gameplay.confirmResignation);
  const confirmDrawOffer = useSettingsStore((s) => s.gameplay.confirmDrawOffer);
  
  const navigate = useNavigate();

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [showRematchConfirm, setShowRematchConfirm] = useState(false);

  // 'check' is a live status. The old `gameStatus !== 'playing' && !== 'idle'`
  // test treated it as game over, which swapped "New Game" for "Rematch" and
  // hid the Resign / Offer Draw buttons every time a king was checked.
  const isGameOver = isTerminalGameStatus(gameStatus);
  const isWaiting = isOnlineGame && !opponentConnected;
  const isGameFinished = isGameOver;

  // Who owns the pending draw offer. Online, the offer is mine when it came from
  // my own seat; locally (hotseat or vs. the computer) the offerer is whoever is
  // still on move, because offering a draw does not pass the turn. Comparing
  // against currentTurn online showed me the "opponent offered a draw" prompt
  // for my own offer as soon as it was the opponent's move.
  const offerIsMine = drawOffer
    ? isOnlineGame
      ? drawOffer.offeredBy === myColor
      : drawOffer.offeredBy === currentTurn
    : false;

  const handleAnalyze = () => {
    const { moveHistory, exportPGN } = useChessStore.getState();
    if (moveHistory.length === 0) return;
    const pgn = exportPGN();
    localStorage.setItem('analysis-pgn', pgn);
    navigate('/analysis');
  };

  const handleResign = () => {
    // Only show confirmation if setting is enabled OR if it's an online game
    if (confirmResignation || isOnlineGame) {
      setShowResignConfirm(true);
    } else {
      resign(currentTurn);
    }
  };

  const confirmResign = async () => {
    if (isOnlineGame) {
      await resignOnlineGame();
    } else {
      resign(currentTurn);
    }
    setShowResignConfirm(false);
  };

  const handleOfferDraw = () => {
    if (drawOffer) {
      // Always show confirmation when there's an existing draw offer (accepting/declining)
      setShowDrawConfirm(true);
    } else {
      // Only show confirmation for offering draw if setting is enabled
      if (confirmDrawOffer) {
        setShowDrawConfirm(true);
      } else if (isOnlineGame) {
        offerOnlineDraw();
      } else {
        offerDraw();
      }
    }
  };

  const acceptDrawOffer = async () => {
    if (isOnlineGame) {
      await acceptOnlineDraw();
    } else {
      acceptDraw();
    }
    setShowDrawConfirm(false);
  };

  const declineDrawOffer = async () => {
    if (isOnlineGame) {
      await declineOnlineDraw();
    } else {
      declineDraw();
    }
    setShowDrawConfirm(false);
  };

  // Reached when the "confirm draw offers" setting is on and no offer is pending.
  // Without this the confirmation dialog had no branch to render and no button to
  // send the offer, so the setting silently disabled the Offer Draw button.
  const confirmOfferDraw = async () => {
    if (isOnlineGame) {
      await offerOnlineDraw();
    } else {
      offerDraw();
    }
    setShowDrawConfirm(false);
  };

  const handleRematch = () => {
    setShowRematchConfirm(true);
  };

  const confirmRematch = () => {
    setShowRematchConfirm(false);
    if (isOnlineGame) {
      leaveOnlineGame();
      setNewGameSetupOpen(true);
    } else {
      setNewGameSetupOpen(true);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-1.5 rounded-xl border border-gray-200 bg-white p-2 sm:p-1.5 shadow-sm dark:border-gray-800 dark:bg-gray-900 w-full overflow-hidden">
      {/* Primary actions - always visible */}
      <div className="flex items-center gap-1.5 sm:gap-1 w-full sm:w-auto flex-wrap">
        {isGameFinished ? (
          <button
            onClick={handleRematch}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-green-700 transition-colors hover:bg-green-50 hover:text-green-900 active:scale-95 dark:text-green-400 dark:hover:bg-green-900/20 dark:hover:text-green-300 min-h-[40px] sm:min-h-[36px] touch-target"
            title="Play again"
            aria-label="Play again"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Rematch</span>
            <span className="sm:hidden" aria-hidden="true">↻</span>
          </button>
        ) : (
          <button
            onClick={() => setNewGameSetupOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 min-h-[40px] sm:min-h-[36px] touch-target"
            title="Start a new game"
            aria-label="New game"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">New Game</span>
            <span className="sm:hidden" aria-hidden="true">+</span>
          </button>
        )}

        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />

        <button
          onClick={flipBoard}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 min-h-[40px] sm:min-h-[36px] touch-target"
          title="Flip board perspective"
          aria-label="Flip board"
        >
          <FlipVertical size={16} />
          <span className="hidden sm:inline">Flip</span>
          <span className="sm:hidden" aria-hidden="true">↻</span>
        </button>

        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />

        {!isWaiting && (
          <button
            onClick={handleAnalyze}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 active:scale-95 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300 min-h-[40px] sm:min-h-[36px] touch-target"
            title="Analyze this game"
            aria-label="Analyze game"
          >
            <BarChart2 size={16} />
            <span className="hidden sm:inline">Analyze</span>
            <span className="sm:hidden" aria-hidden="true">⚡</span>
          </button>
        )}

        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />

        {isWaiting && (
          <div className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 min-h-[40px] sm:min-h-[36px]">
            <Loader2 size={16} className="animate-spin" />
            <span className="hidden sm:inline">Waiting...</span>
            <span className="sm:hidden" aria-hidden="true">⏳</span>
          </div>
        )}

        {!isGameFinished && !isWaiting && (
          <>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />

            <button
              onClick={handleOfferDraw}
              disabled={offerIsMine}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold transition-colors min-h-[40px] sm:min-h-[36px] touch-target ${
                offerIsMine
                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
              }`}
              title={drawOffer
                ? (offerIsMine ? 'You already offered a draw' : 'Accept or decline draw offer')
                : 'Offer a draw'}
              aria-label={drawOffer && !offerIsMine ? 'Accept draw offer' : 'Offer draw'}
            >
              <Handshake size={16} />
              <span className="hidden sm:inline">{drawOffer && !offerIsMine ? 'Accept' : 'Offer'}</span>
              <span className="sm:hidden" aria-hidden="true">{drawOffer && !offerIsMine ? '✓' : '='}</span>
              <span className="hidden sm:inline">Draw</span>
            </button>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />

            <button
              onClick={handleResign}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs sm:text-sm font-semibold text-gray-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400 min-h-[40px] sm:min-h-[36px] touch-target"
              title="Resign the game"
              aria-label="Resign game"
            >
              <Flag size={16} />
              <span className="hidden sm:inline">Resign</span>
              <span className="sm:hidden" aria-hidden="true">🏳️</span>
            </button>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 sm:hidden" />
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />
          </>
        )}
      </div>

      {/* Secondary actions - always visible on right */}
      <div className="flex items-center gap-1 w-full sm:w-auto justify-end flex-wrap">
        <button
          onClick={toggleUiTheme}
          className="flex items-center justify-center rounded-lg p-2 sm:p-1.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-[36px] touch-target"
          title={`Toggle ${uiTheme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Toggle ${uiTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {uiTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center rounded-lg p-2 sm:p-1.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-[36px] touch-target"
          title="Open board settings"
          aria-label="Open settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Resign Confirmation Dialog */}
      {showResignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="resign-dialog-title">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowResignConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="resign-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Resign Game?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to resign? This will end the game immediately.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResignConfirm(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 min-h-[44px] touch-target"
              >
                Cancel
              </button>
              <button
                onClick={confirmResign}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 min-h-[44px] touch-target"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Draw Confirmation (no offer pending yet) */}
      {showDrawConfirm && !drawOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="offer-draw-dialog-title">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowDrawConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="offer-draw-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Offer a Draw?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Your opponent will be asked whether they accept.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDrawConfirm(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 min-h-[44px] touch-target"
              >
                Cancel
              </button>
              <button
                onClick={confirmOfferDraw}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 min-h-[44px] touch-target"
              >
                Offer Draw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draw Offer Dialog */}
      {showDrawConfirm && drawOffer && !offerIsMine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="draw-dialog-title">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowDrawConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="draw-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Draw Offer</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Your opponent has offered a draw. Do you accept?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={declineDrawOffer}
                className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 min-h-[44px] touch-target"
              >
                Decline
              </button>
              <button
                onClick={acceptDrawOffer}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 min-h-[44px] touch-target"
              >
                Accept Draw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Your Draw Offer Pending */}
      {drawOffer && offerIsMine && !showDrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="draw-pending-title">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowDrawConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-2xl dark:border-amber-800 dark:bg-amber-900/20">
            <h3 id="draw-pending-title" className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">Draw Offer Sent</h3>
            <p className="text-amber-700 dark:text-amber-300 mb-4">
              Waiting for opponent to respond...
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={declineDrawOffer}
                className="rounded-lg bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-800 dark:text-amber-300 min-h-[44px] touch-target"
              >
                Withdraw Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rematch Confirmation Dialog */}
      {showRematchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rematch-dialog-title">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowRematchConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="rematch-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Rematch?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Start a new game with the same opponent?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRematchConfirm(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 min-h-[44px] touch-target"
              >
                Cancel
              </button>
              <button
                onClick={confirmRematch}
                className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-500 min-h-[44px] touch-target"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}