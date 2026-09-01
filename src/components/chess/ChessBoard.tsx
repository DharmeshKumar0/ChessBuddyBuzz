import { useCallback } from 'react';
import { useChessStore, isTerminalGameStatus, useBoardOrientation } from '../../store';
import { useSettingsStore } from '../../store/useSettingsStore';
import { FILES, RANKS, findKing } from '../../chess';
import { Square } from './Square';
import { useBoardView } from './BoardView';

export function ChessBoard() {
  // A provider (the analysis page) hands us a position to draw instead of the
  // live game's. Hooks still run unconditionally; the view only wins where it
  // has an opinion.
  const view = useBoardView();

  const storeBoard = useChessStore((s) => s.board);
  const storeSelectedSquare = useChessStore((s) => s.selectedSquare);
  const storePossibleMoves = useChessStore((s) => s.possibleMoves);
  const storeLastMove = useChessStore((s) => s.lastMove);
  const storeCurrentTurn = useChessStore((s) => s.currentTurn);
  const storeGameStatus = useChessStore((s) => s.gameStatus);
  const analysisIndex = useChessStore((s) => s.analysisIndex);
  const movesPlayed = useChessStore((s) => s.moveHistory.length);
  const handleSquareClickInStore = useChessStore((s) => s.handleSquareClick);

  // Read settings from centralized settings store
  const showLegalMoves = useSettingsStore((s) => s.gameplay.showLegalMoves);
  const showLastMove = useSettingsStore((s) => s.gameplay.showLastMove);

  // Shared with the player panels and the evaluation bar. Deriving it here
  // instead let the squares disagree with the panels, which put a player's name
  // on the side holding their opponent's pieces.
  const storeOrientation = useBoardOrientation();

  const board = view ? view.board : storeBoard;
  const lastMove = view ? view.lastMove : storeLastMove;
  const currentTurn = view ? view.currentTurn : storeCurrentTurn;
  const gameStatus = view ? view.gameStatus : storeGameStatus;
  const orientation = view ? view.orientation : storeOrientation;
  // A selection belongs to the live position and means nothing on a replay.
  const selectedSquare = view ? null : storeSelectedSquare;
  const possibleMoves = view ? [] : storePossibleMoves;

  const isWhite = orientation === 'white';

  const rowIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const colIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  const checkedKingPos = gameStatus === 'check' ? findKing(board, currentTurn) : null;

  // 'check' is a live status: `gameStatus !== 'playing'` here froze the board
  // the moment a king was checked, so no move could ever answer the check.
  const isGameOver = isTerminalGameStatus(gameStatus);

  // A rewound board shows a position that has already been played on, and an
  // analysis view is somebody else's game. Both are look-only — without this,
  // clicking a piece during a review selected it and lit up legal moves that
  // could never be played.
  const interactive = !view && !isGameOver && analysisIndex === movesPlayed;

  const handleSquareClick = useCallback(
    (row: number, col: number) => {
      if (!interactive) return;
      handleSquareClickInStore({ row, col });
    },
    [handleSquareClickInStore, interactive],
  );

  return (
    <div className="relative aspect-square w-full max-w-[min(85vw,540px)] sm:max-w-[min(75vw,540px)] md:max-w-[540px] touch-none select-none">
      {/* Screen reader status */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {gameStatus === 'check' && `Check. ${currentTurn} to move.`}
        {gameStatus === 'checkmate' && 'Checkmate. Game over.'}
        {gameStatus === 'stalemate' && 'Stalemate. Game drawn.'}
        {gameStatus === 'draw' && 'Game drawn.'}
        {gameStatus === 'timeout' && 'Time up. Game over.'}
        {gameStatus === 'resigned' && 'Resignation. Game over.'}
        {gameStatus === 'playing' && `${currentTurn} to move.`}
      </div>

      {/* Board container */}
      <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-md shadow-xl ring-1 ring-black/10 dark:ring-white/10 touch-none" role="grid" aria-label="Chess board">
        {rowIndices.map((r, visualRow) =>
          colIndices.map((c, visualCol) => {
            const piece = board[r][c];

            const isSelected =
              selectedSquare !== null &&
              selectedSquare.row === r &&
              selectedSquare.col === c;

            // Only show legal moves if the setting is enabled
            const isPossibleMove = showLegalMoves && possibleMoves.some(
              (m) => m.row === r && m.col === c,
            );

            // Only show last move highlights if the setting is enabled
            const isLastMoveFrom =
              showLastMove &&
              lastMove !== null &&
              lastMove.from.row === r &&
              lastMove.from.col === c;

            const isLastMoveTo =
              showLastMove &&
              lastMove !== null &&
              lastMove.to.row === r &&
              lastMove.to.col === c;

            const isInCheck =
              checkedKingPos !== null &&
              checkedKingPos.row === r &&
              checkedKingPos.col === c;

            const fileLabel = visualRow === 7 ? FILES[c] : null;
            const rankLabel = visualCol === 0 ? String(RANKS[r]) : null;

            return (
              <Square
                key={`${r}-${c}`}
                row={r}
                col={c}
                piece={piece}
                isSelected={isSelected}
                isPossibleMove={isPossibleMove}
                isLastMoveFrom={isLastMoveFrom}
                isLastMoveTo={isLastMoveTo}
                isInCheck={isInCheck}
                fileLabel={fileLabel}
                rankLabel={rankLabel}
                interactive={interactive}
                onClick={handleSquareClick}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
