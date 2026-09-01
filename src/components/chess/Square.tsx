import { useCallback } from 'react';
import { isLightSquare } from '../../chess';
import type { Square as SquareType, BoardTheme } from '../../chess';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useChessStore } from '../../store/useChessStore';
import { useBotSeat } from '../../store/useBotSeat';
import { ChessPiece } from './ChessPiece';

interface SquareProps {
  row: number;
  col: number;
  piece: SquareType;
  isSelected: boolean;
  isPossibleMove: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  isInCheck: boolean;
  fileLabel: string | null;
  rankLabel: string | null;
  /** False while a past position is on the board, or on an analysis view. */
  interactive: boolean;
  onClick: (row: number, col: number) => void;
}

const BOARD_THEME_COLORS: Record<
  BoardTheme,
  {
    lightSq: string;
    darkSq: string;
    selectedLight: string;
    selectedDark: string;
    lastMoveLight: string;
    lastMoveDark: string;
    labelLight: string;
    labelDark: string;
  }
> = {
  wood: {
    lightSq: 'bg-[#f0d9b5]',
    darkSq: 'bg-[#b58863]',
    selectedLight: 'bg-[#7b97a2]',
    selectedDark: 'bg-[#537884]',
    lastMoveLight: 'bg-[#cdd26a]',
    lastMoveDark: 'bg-[#aaa23a]',
    labelLight: 'text-[#b58863]',
    labelDark: 'text-[#f0d9b5]',
  },
  emerald: {
    lightSq: 'bg-[#eeeed2]',
    darkSq: 'bg-[#769656]',
    selectedLight: 'bg-[#b9ca43]',
    selectedDark: 'bg-[#9fb12b]',
    lastMoveLight: 'bg-[#f7f769]',
    lastMoveDark: 'bg-[#baba41]',
    labelLight: 'text-[#769656]',
    labelDark: 'text-[#eeeed2]',
  },
  slate: {
    lightSq: 'bg-[#e2e8f0]',
    darkSq: 'bg-[#475569]',
    selectedLight: 'bg-[#94a3b8]',
    selectedDark: 'bg-[#64748b]',
    lastMoveLight: 'bg-[#cbd5e1]',
    lastMoveDark: 'bg-[#475569]',
    labelLight: 'text-[#475569]',
    labelDark: 'text-[#e2e8f0]',
  },
  blue: {
    lightSq: 'bg-[#dbeafe]',
    darkSq: 'bg-[#1e40af]',
    selectedLight: 'bg-[#93c5fd]',
    selectedDark: 'bg-[#60a5fa]',
    lastMoveLight: 'bg-[#bfdbfe]',
    lastMoveDark: 'bg-[#3b82f6]',
    labelLight: 'text-[#1e40af]',
    labelDark: 'text-[#dbeafe]',
  },
  purple: {
    lightSq: 'bg-[#f3e8ff]',
    darkSq: 'bg-[#7c3aed]',
    selectedLight: 'bg-[#d8b4fe]',
    selectedDark: 'bg-[#c084fc]',
    lastMoveLight: 'bg-[#e9d5ff]',
    lastMoveDark: 'bg-[#a855f7]',
    labelLight: 'text-[#7c3aed]',
    labelDark: 'text-[#f3e8ff]',
  },
  marble: {
    lightSq: 'bg-[#f5f5f4]',
    darkSq: 'bg-[#44403c]',
    selectedLight: 'bg-[#e7e5e4]',
    selectedDark: 'bg-[#78716c]',
    lastMoveLight: 'bg-[#fafaf9]',
    lastMoveDark: 'bg-[#57534e]',
    labelLight: 'text-[#44403c]',
    labelDark: 'text-[#f5f5f4]',
  },
};

export function Square({
  row,
  col,
  piece,
  isSelected,
  isPossibleMove,
  isLastMoveFrom,
  isLastMoveTo,
  isInCheck,
  fileLabel,
  rankLabel,
  interactive,
  onClick,
}: SquareProps) {
  const light = isLightSquare(row, col);
  const boardTheme = useSettingsStore((s) => s.board.theme);
  const showCoordinates = useSettingsStore((s) => s.board.showCoordinates);
  const theme = BOARD_THEME_COLORS[boardTheme] || BOARD_THEME_COLORS.wood;
  const currentTurn = useChessStore((s) => s.currentTurn);
  const selectPiece = useChessStore((s) => s.selectPiece);
  const executeMove = useChessStore((s) => s.executeMove);
  const botSeat = useBotSeat();

  // The bot plays its whole side by itself, so its pieces don't pick up. The
  // store refuses player moves on them anyway; this stops the drag from ever
  // starting, and leaves the pieces without a grab cursor. A board being
  // reviewed hands out no drags at all.
  const isDraggable =
    interactive && piece !== null && piece.color === currentTurn && piece.color !== botSeat?.color;

  const handleClick = useCallback(() => {
    onClick(row, col);
  }, [onClick, row, col]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      onClick(row, col);
    },
    [onClick, row, col],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(row, col);
      }
      // Arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const boardSize = 8;
        let newRow = row;
        let newCol = col;
        
        switch (e.key) {
          case 'ArrowUp': newRow = Math.max(0, row - 1); break;
          case 'ArrowDown': newRow = Math.min(boardSize - 1, row + 1); break;
          case 'ArrowLeft': newCol = Math.max(0, col - 1); break;
          case 'ArrowRight': newCol = Math.min(boardSize - 1, col + 1); break;
        }
        
        // Navigate to the new square by focusing it
        const targetSquare = document.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`);
        if (targetSquare && targetSquare instanceof HTMLElement) {
          targetSquare.focus();
        }
      }
    },
    [onClick, row, col],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!isDraggable) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', JSON.stringify({ row, col }));
      e.dataTransfer.effectAllowed = 'move';
      selectPiece({ row, col });
    },
    [isDraggable, row, col, selectPiece],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const from = JSON.parse(raw);
          if (
            from &&
            typeof from.row === 'number' &&
            typeof from.col === 'number'
          ) {
            executeMove({ row: from.row, col: from.col }, { row, col });
          }
        }
      } catch {
        // Drop error handled safely
      }
    },
    [executeMove, row, col],
  );

  let bg: string;
  if (isInCheck) {
    bg = 'bg-red-500/80 shadow-[inset_0_0_12px_rgba(239,68,68,0.8)]';
  } else if (isSelected) {
    bg = light ? theme.selectedLight : theme.selectedDark;
  } else if (isLastMoveTo || isLastMoveFrom) {
    bg = light ? theme.lastMoveLight : theme.lastMoveDark;
  } else {
    bg = light ? theme.lightSq : theme.darkSq;
  }

  const labelColor = light ? theme.labelLight : theme.labelDark;

  return (
    <div
      className={`group relative flex items-center justify-center ${bg} ${
        interactive ? 'cursor-pointer' : 'cursor-default'
      } transition-colors duration-100 select-none touch-none`}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label={`${fileLabel ?? ''}${rankLabel ?? ''}${piece ? ` ${piece.color} ${piece.type}` : 'empty square'}`}
      data-row={row}
      data-col={col}
      aria-roledescription="chess square"
    >
      {/* Square hover effect overlay */}
      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 dark:group-hover:bg-white/10" />

      {/* Check highlight pulsing ring */}
      {isInCheck && (
        <div className="absolute inset-0 ring-4 ring-inset ring-red-600 animate-pulse pointer-events-none" />
      )}

      {/* Selected square border highlight */}
      {isSelected && !isInCheck && (
        <div className="absolute inset-0 ring-4 ring-inset ring-amber-400/80 dark:ring-amber-400/90 pointer-events-none" />
      )}

      {/* Possible move indicators */}
      {isPossibleMove && !piece && (
        <div className="absolute h-3.5 w-3.5 rounded-full bg-black/25 dark:bg-white/35 pointer-events-none transition-transform duration-150 scale-100 group-hover:scale-125" />
      )}

      {isPossibleMove && piece && (
        <div className="absolute inset-0 rounded-full border-4 border-black/25 dark:border-white/35 pointer-events-none transition-all duration-150" />
      )}

      {/* Piece */}
      {piece && <ChessPiece piece={piece} isDraggable={isDraggable} row={row} col={col} />}

      {/* Rank label — top left corner */}
      {showCoordinates && rankLabel && (
        <span
          className={`absolute top-[2px] left-[3px] text-[10px] sm:text-[11px] font-bold leading-none ${labelColor} pointer-events-none`}
        >
          {rankLabel}
        </span>
      )}

      {/* File label — bottom right corner */}
      {showCoordinates && fileLabel && (
        <span
          className={`absolute right-[3px] bottom-[2px] text-[10px] sm:text-[11px] font-bold leading-none ${labelColor} pointer-events-none`}
        >
          {fileLabel}
        </span>
      )}
    </div>
  );
}
