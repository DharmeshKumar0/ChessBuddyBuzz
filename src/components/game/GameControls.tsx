import { useChessStore } from '../../store';
import { RotateCcw, FlipVertical2 } from 'lucide-react';

export function GameControls() {
  const resetGame = useChessStore((s) => s.resetGame);
  const flipBoard = useChessStore((s) => s.flipBoard);
  const currentTurn = useChessStore((s) => s.currentTurn);
  const gameStatus = useChessStore((s) => s.gameStatus);

  return (
    <div className="flex flex-col gap-4">
      {/* Turn indicator */}
      <div className="rounded-lg bg-gray-800 p-4">
        <h3 className="mb-2 text-sm font-medium text-gray-400">Current Turn</h3>
        <div className="flex items-center gap-2">
          <div
            className={`h-4 w-4 rounded-full border border-gray-600 ${
              currentTurn === 'white' ? 'bg-white' : 'bg-gray-900'
            }`}
          />
          <span className="text-lg font-semibold capitalize text-gray-100">
            {currentTurn}
          </span>
        </div>
      </div>

      {/* Game status */}
      <div className="rounded-lg bg-gray-800 p-4">
        <h3 className="mb-2 text-sm font-medium text-gray-400">Status</h3>
        <span className="text-sm capitalize text-gray-200">
          {gameStatus === 'idle' ? 'Ready to play' : gameStatus}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={flipBoard}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
          aria-label="Flip board"
        >
          <FlipVertical2 size={16} />
          Flip
        </button>
        <button
          onClick={resetGame}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
          aria-label="Reset game"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
    </div>
  );
}
