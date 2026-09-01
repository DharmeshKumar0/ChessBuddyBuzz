import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play } from 'lucide-react';

interface GameReviewControlsProps {
  /** Plies on the board: 0 is the starting position, `total` the final move. */
  index: number;
  total: number;
  onGoToStart: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoToEnd: () => void;
  /** 'card' matches the other sidebar panels; 'bare' drops the frame. */
  variant?: 'card' | 'bare';
  className?: string;
}

/** One move per beat — slow enough to follow, quick enough to sit through. */
const AUTO_PREVIEW_MS = 900;

const BUTTON_CLASS =
  'flex items-center justify-center rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 min-h-[36px] min-w-[36px] touch-target';

/**
 * Walks back and forth through a game that has already been played: a step per
 * click, or hands-free with the auto preview. Both pages own their own history
 * (useChessStore for the game just played, useAnalysisStore for a loaded one),
 * so the four navigation actions come in as props.
 */
export function GameReviewControls({
  index,
  total,
  onGoToStart,
  onPrevious,
  onNext,
  onGoToEnd,
  variant = 'card',
  className,
}: GameReviewControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const atStart = index <= 0;
  const atEnd = index >= total;

  // Auto preview: one move per beat, stopping by itself at the end of the game.
  // Keying the timer on `index` restarts it after each step, so playback keeps
  // to the beat however long a step's own re-render takes.
  useEffect(() => {
    if (!isPlaying) return;
    if (index >= total) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(onNext, AUTO_PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, index, total, onNext]);

  // Playback stops the moment the viewer takes over by hand.
  const step = useCallback((action: () => void) => {
    setIsPlaying(false);
    action();
  }, []);

  const toggleAutoPreview = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    // Nothing left to preview at the final move, so play the game again.
    if (index >= total) onGoToStart();
    setIsPlaying(true);
  };

  const frame =
    variant === 'card'
      ? 'rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900'
      : '';

  return (
    <div
      className={`flex flex-col gap-1 w-full ${frame} ${className ?? ''}`}
      role="group"
      aria-label="Game review"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Review
        </span>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300" aria-live="polite">
          {total === 0 ? 'No moves yet' : atEnd ? `Move ${total} · latest` : `Move ${index} / ${total}`}
        </span>
      </div>

      <div className="flex items-center justify-center gap-0.5">
        <button
          onClick={() => step(onGoToStart)}
          disabled={atStart}
          className={BUTTON_CLASS}
          title="First move (Home)"
          aria-label="Go to first move"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          onClick={() => step(onPrevious)}
          disabled={atStart}
          className={BUTTON_CLASS}
          title="Previous move (←)"
          aria-label="Previous move"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={toggleAutoPreview}
          disabled={total === 0}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 min-h-[36px] touch-target ${
            isPlaying
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
          title={isPlaying ? 'Pause auto preview' : 'Auto preview the whole game'}
          aria-label={isPlaying ? 'Pause auto preview' : 'Auto preview'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          <span>{isPlaying ? 'Pause' : 'Auto'}</span>
        </button>
        <button
          onClick={() => step(onNext)}
          disabled={atEnd}
          className={BUTTON_CLASS}
          title="Next move (→)"
          aria-label="Next move"
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => step(onGoToEnd)}
          disabled={atEnd}
          className={BUTTON_CLASS}
          title="Latest move (End)"
          aria-label="Go to latest move"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  );
}
