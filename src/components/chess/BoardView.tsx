import { createContext, useContext } from 'react';
import type { Board, BoardOrientation, GameStatus, Move, PieceColor } from '../../chess';

/**
 * A position to draw that is not the live game's — the analysis page's replay,
 * for instance.
 *
 * ChessBoard, Square and ChessPiece read the game store by default. Wrapping
 * them in this context overrides that, which is what the analysis page needs:
 * it kept its own rewound position in useAnalysisStore while the board on
 * screen went on rendering useChessStore, so its navigation buttons moved
 * nothing. A view is always look-only — no selecting, dragging or moving.
 */
export interface BoardView {
  board: Board;
  currentTurn: PieceColor;
  gameStatus: GameStatus;
  lastMove: Move | null;
  orientation: BoardOrientation;
  /**
   * How many plies of the game are on the board. It changes on every navigation
   * step, which is what restarts the piece glide for the move just played.
   */
  ply: number;
}

export const BoardViewContext = createContext<BoardView | null>(null);

/** The position to draw, or null when the board belongs to the live game. */
export function useBoardView(): BoardView | null {
  return useContext(BoardViewContext);
}
