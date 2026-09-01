import { useEffect, useRef } from 'react';
import { useChessStore } from '../../store';
import type { MoveReview, Move } from '../../store';

interface MoveHistoryProps {
  moveHistory?: Move[];
  /** Ply index of the move being viewed, or -1/undefined for none. */
  currentMoveIndex?: number;
  onMoveClick?: (index: number) => void;
  moveReviews?: MoveReview[];
  className?: string;
}

export function MoveHistory({
  moveHistory: propMoveHistory,
  currentMoveIndex,
  onMoveClick,
  moveReviews,
  className,
}: MoveHistoryProps) {
  // Hooks must run unconditionally, so always read the store and only then
  // let the prop win. `??` would short-circuit the selector on prop renders.
  const storeMoveHistory = useChessStore((s) => s.moveHistory);
  const moveHistory = propMoveHistory ?? storeMoveHistory;
  const currentTurn = useChessStore((s) => s.currentTurn);
  const gameStatus = useChessStore((s) => s.gameStatus);
  const gameResult = useChessStore((s) => s.gameResult);
  const winner = useChessStore((s) => s.winner);
  const drawReason = useChessStore((s) => s.drawReason);

  // Auto preview walks past the bottom of a 64px-tall list within a few moves,
  // so the row being viewed is kept in sight. 'nearest' leaves the list alone
  // while the row is already visible.
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const activePair = currentMoveIndex === undefined || currentMoveIndex < 0
    ? -1
    : Math.floor(currentMoveIndex / 2);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activePair]);

  const pairs: { turn: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    const whiteMove = moveHistory[i];
    const blackMove = moveHistory[i + 1];

    pairs.push({
      turn: Math.floor(i / 2) + 1,
      white: whiteMove?.san,
      black: blackMove?.san,
    });
  }

  return (
    <div className={`flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 w-full min-w-0 overflow-hidden ${className ?? ''}`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Move History
        </h3>
        <div className="flex items-center gap-2">
          {gameResult ? (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              {gameResult}
            </span>
          ) : (
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Turn: <span className="capitalize">{currentTurn}</span>
            </span>
          )}
        </div>
      </div>

      {/* Game Over Result Banners */}
      {gameStatus === 'checkmate' && winner && (
        <div className="flex items-center justify-between bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 border-b border-amber-500/20">
          <span>CHECKMATE — <span className="capitalize">{winner}</span> Wins!</span>
          <span>{gameResult}</span>
        </div>
      )}

      {(gameStatus === 'draw' || gameStatus === 'stalemate') && (
        <div className="flex items-center justify-between bg-gray-500/10 px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 border-b border-gray-500/20">
          <span>DRAW — {drawReason || 'Game Drawn'}</span>
          <span>1/2-1/2</span>
        </div>
      )}

      {/* Move Table */}
      <div className="h-64 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
        {pairs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4 text-gray-400 dark:text-gray-500">
            <span className="text-sm font-medium">No moves played yet</span>
            <span className="text-xs mt-1">
              {gameStatus === 'idle'
                ? 'White to move. Click a piece to view moves!'
                : gameStatus}
            </span>
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 dark:border-gray-800 dark:text-gray-500">
                <th className="w-12 py-1.5 px-2 font-normal">#</th>
                <th className="py-1.5 px-2 font-normal">White</th>
                <th className="py-1.5 px-2 font-normal">Black</th>
                {moveReviews && <th className="py-1.5 px-2 font-normal">Review</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {pairs.map((pair, pairIndex) => {
                const whiteIndex = pairIndex * 2;
                const blackIndex = pairIndex * 2 + 1;
                const whiteReview = moveReviews?.find(r => r.moveIndex === whiteIndex);
                const blackReview = moveReviews?.find(r => r.moveIndex === blackIndex);
                
                return (
                  <tr
                    key={pair.turn}
                    ref={pairIndex === activePair ? activeRowRef : undefined}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="py-1.5 px-2 font-medium text-gray-400 dark:text-gray-500">
                      {pair.turn}.
                    </td>
                    <td 
                      className={`py-1.5 px-2 font-semibold text-gray-800 dark:text-gray-200 ${
                        currentMoveIndex === whiteIndex ? 'bg-amber-100 dark:bg-amber-900/30' : ''
                      }`}
                      onClick={() => onMoveClick?.(whiteIndex)}
                      style={{ cursor: onMoveClick ? 'pointer' : 'default' }}
                    >
                      {pair.white ?? ''}
                    </td>
                    <td 
                      className={`py-1.5 px-2 font-semibold text-gray-800 dark:text-gray-200 ${
                        currentMoveIndex === blackIndex ? 'bg-amber-100 dark:bg-amber-900/30' : ''
                      }`}
                      onClick={() => onMoveClick?.(blackIndex)}
                      style={{ cursor: onMoveClick ? 'pointer' : 'default' }}
                    >
                      {pair.black ?? ''}
                    </td>
                    {moveReviews && (
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {whiteReview && (
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              whiteReview.classification === 'best' ? 'bg-green-500' :
                              whiteReview.classification === 'good' ? 'bg-blue-500' :
                              whiteReview.classification === 'inaccuracy' ? 'bg-yellow-500' :
                              whiteReview.classification === 'mistake' ? 'bg-orange-500' :
                              whiteReview.classification === 'blunder' ? 'bg-red-500' :
                              'bg-gray-400'
                            }`} title={`White: ${whiteReview.classification}`} />
                          )}
                          {blackReview && (
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              blackReview.classification === 'best' ? 'bg-green-500' :
                              blackReview.classification === 'good' ? 'bg-blue-500' :
                              blackReview.classification === 'inaccuracy' ? 'bg-yellow-500' :
                              blackReview.classification === 'mistake' ? 'bg-orange-500' :
                              blackReview.classification === 'blunder' ? 'bg-red-500' :
                              'bg-gray-400'
                            }`} title={`Black: ${blackReview.classification}`} />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}