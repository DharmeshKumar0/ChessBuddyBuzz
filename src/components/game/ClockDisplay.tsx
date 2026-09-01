import { useChessStore } from '../../store/useChessStore';
import { formatTime } from '../../utils/clock';

export function ClockDisplay() {
  const clock = useChessStore((s) => s.clock);
  const timeControl = useChessStore((s) => s.timeControl);
  const gameStatus = useChessStore((s) => s.gameStatus);

  const whiteTime = formatTime(clock.whiteMs);
  const blackTime = formatTime(clock.blackMs);

  const isWhiteActive = clock.activeColor === 'white' && clock.isRunning;
  const isBlackActive = clock.activeColor === 'black' && clock.isRunning;

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full min-w-0" role="region" aria-label="Game clocks">
      {/* Time Control Display */}
      <div className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" aria-hidden="true">
        {timeControl.display}
      </div>

      {/* Black Clock (Top) */}
      <div
        role="timer"
        aria-label="Black player time"
        aria-live="polite"
        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-lg sm:text-xl font-mono font-bold transition-all duration-200 w-full min-w-0 ${
          isBlackActive
            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500'
            : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        <span className="font-mono tabular-nums text-nowrap">{blackTime}</span>
        {isBlackActive && <span className="sr-only">Black to move</span>}
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-gray-300 dark:bg-gray-600" aria-hidden="true" />

      {/* White Clock (Bottom) */}
      <div
        role="timer"
        aria-label="White player time"
        aria-live="polite"
        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-lg sm:text-xl font-mono font-bold transition-all duration-200 w-full min-w-0 ${
          isWhiteActive
            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500'
            : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        <span className="font-mono tabular-nums text-nowrap">{whiteTime}</span>
        {isWhiteActive && <span className="sr-only">White to move</span>}
      </div>

      {/* Game Status Indicators */}
      <div className="flex flex-wrap justify-center gap-1 text-xs sm:text-sm" aria-live="assertive" aria-atomic="true">
        {gameStatus === 'check' && (
          <div className="text-red-600 dark:text-red-400 font-bold animate-pulse px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded" role="alert">CHECK</div>
        )}
        {gameStatus === 'checkmate' && (
          <div className="text-red-600 dark:text-red-400 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded" role="alert">CHECKMATE</div>
        )}
        {gameStatus === 'timeout' && (
          <div className="text-red-600 dark:text-red-400 font-bold animate-pulse px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded" role="alert">TIME'S UP</div>
        )}
        {gameStatus === 'stalemate' && (
          <div className="text-gray-600 dark:text-gray-400 font-bold px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded" role="alert">STALEMATE</div>
        )}
        {gameStatus === 'draw' && (
          <div className="text-gray-600 dark:text-gray-400 font-bold px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded" role="alert">DRAW</div>
        )}
      </div>
    </div>
  );
}