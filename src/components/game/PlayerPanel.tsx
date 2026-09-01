import { User, AlertTriangle, Trophy, MinusCircle } from 'lucide-react';
import type { Piece, PieceColor } from '../../chess';
import { getPieceComponent } from '../chess/pieces';
import { useChessStore } from '../../store';

interface PlayerPanelProps {
  color: PieceColor;
  name: string;
  rating?: number;
  isCurrentTurn: boolean;
  capturedPieces: Piece[];
  materialScore: number;
}

export function PlayerPanel({
  color,
  name,
  rating = 1500,
  isCurrentTurn,
  capturedPieces,
  materialScore,
}: PlayerPanelProps) {
  const isWhite = color === 'white';
  const gameStatus = useChessStore((s) => s.gameStatus);
  const winner = useChessStore((s) => s.winner);

  const isWinner = gameStatus === 'checkmate' && winner === color;
  const isMated = gameStatus === 'checkmate' && winner !== color;
  const isStalemate = gameStatus === 'stalemate';
  const isInCheck = isCurrentTurn && gameStatus === 'check';

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-2 rounded-lg border px-3 py-2 sm:px-3.5 sm:py-2.5 transition-all duration-200 text-sm sm:text-base ${
        isWinner
          ? 'border-amber-500 bg-amber-500/10 shadow-md dark:border-amber-400 dark:bg-amber-950/40'
          : isMated
            ? 'border-red-600/70 bg-red-600/10 shadow-sm dark:border-red-600/50 dark:bg-red-950/40'
            : isStalemate
              ? 'border-gray-400/50 bg-gray-500/10 shadow-sm dark:border-gray-600 dark:bg-gray-800/40'
              : isInCheck
                ? 'border-red-500/60 bg-red-500/10 shadow-sm dark:border-red-500/50 dark:bg-red-950/30'
                : isCurrentTurn
                  ? 'border-amber-500/50 bg-amber-500/5 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10'
                  : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/80'
      }`}
    >
      {/* Player info */}
      <div className="flex items-center gap-2 w-full sm:gap-2.5">
        <div
          className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border text-xs sm:text-sm font-semibold transition-colors flex-shrink-0 ${
            isWinner
              ? 'border-amber-500 bg-amber-500 text-white'
              : isWhite
                ? 'border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                : 'border-gray-800 bg-gray-900 text-gray-100 dark:border-gray-700 dark:bg-black dark:text-gray-100'
          }`}
        >
          {isWinner ? <Trophy size={15} /> : <User size={15} />}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100 truncate">
              {name}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              ({rating})
            </span>
            {isCurrentTurn && !isInCheck && !isWinner && !isMated && !isStalemate && (
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-amber-500"></span>
              </span>
            )}
            {isWinner && (
              <span className="flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap">
                <Trophy size={9} />
                WINNER
              </span>
            )}
            {isMated && (
              <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap">
                CHECKMATED
              </span>
            )}
            {isStalemate && (
              <span className="flex items-center gap-1 rounded bg-gray-600 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap">
                <MinusCircle size={9} />
                STALEMATE
              </span>
            )}
            {isInCheck && (
              <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap animate-pulse">
                <AlertTriangle size={9} />
                CHECK
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {color}
          </span>
        </div>
      </div>

      {/* Captured pieces & material score */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <div className="flex -space-x-1 overflow-hidden min-w-0">
          {capturedPieces.slice(0, 8).map((piece, idx) => {
            const Component = getPieceComponent(piece.color, piece.type);
            if (!Component) return null;
            return (
              <div
                key={idx}
                className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 transition-transform duration-200 hover:scale-125 hover:z-10"
                title={`${piece.color} ${piece.type}`}
              >
                <Component className="h-full w-full drop-shadow-xs" />
              </div>
            );
          })}
          {capturedPieces.length > 8 && (
            <div className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 flex items-center justify-center text-[9px] text-gray-500 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              +{capturedPieces.length - 8}
            </div>
          )}
        </div>

        {materialScore > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 transition-all duration-200 whitespace-nowrap">
            +{materialScore}
          </span>
        )}
      </div>
    </div>
  );
}
