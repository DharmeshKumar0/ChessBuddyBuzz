import { useEffect, useRef } from 'react';
import type { Move, Piece } from '../../chess';
import { getPieceComponent } from './pieces';
import { useChessStore } from '../../store/useChessStore';
import { useBoardOrientation } from '../../store/useBoardOrientation';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useBoardView } from './BoardView';

interface ChessPieceProps {
  piece: Piece;
  isDraggable?: boolean;
  row: number;
  col: number;
}

/** Long enough to read as a glide, short enough not to hold up the next move. */
const GLIDE_MS = 200;
/** Quick off the mark, easing into the destination square. */
const GLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function ChessPiece({ piece, isDraggable = false, row, col }: ChessPieceProps) {
  const pieceStyle = useSettingsStore((s) => s.board.pieceStyle);
  const moveAnimation = useSettingsStore((s) => s.gameplay.moveAnimation);
  const Component = getPieceComponent(piece.color, piece.type, pieceStyle);
  // On a review or analysis board the move that just landed is the one the
  // navigation stepped to, not the last one played in the live game.
  const view = useBoardView();
  const storeLastMove = useChessStore((s) => s.lastMove);
  // Distinguishes consecutive moves that happen to travel the same distance, so
  // the glide restarts for each one. It tracks the navigation index rather than
  // the move count, so stepping through a finished game glides too.
  const storePly = useChessStore((s) => s.analysisIndex);
  const storeOrientation = useBoardOrientation();
  const lastMove = view ? view.lastMove : storeLastMove;
  const ply = view ? view.ply : storePly;
  const orientation = view ? view.orientation : storeOrientation;
  const ref = useRef<HTMLDivElement>(null);

  const travel = moveAnimation ? getMoveTravel(lastMove, row, col) : null;
  const dRow = travel?.dRow ?? 0;
  const dCol = travel?.dCol ?? 0;

  // Slide the piece in from where it came from. React has already painted it on
  // its destination square, so the animation starts at the offset back to the
  // origin and runs to zero — the piece appears to travel instead of blinking
  // from one square to the other.
  useEffect(() => {
    const el = ref.current;
    const square = el?.parentElement;
    if (!el || !square || (dRow === 0 && dCol === 0)) return;
    if (typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const size = square.getBoundingClientRect().width;
    if (!size) return;

    // Board coordinates are always white's; a flipped board draws them in
    // reverse, so the travel direction flips with it.
    const sign = orientation === 'white' ? 1 : -1;
    const from = `translate(${dCol * size * sign}px, ${dRow * size * sign}px)`;

    const animation = el.animate([{ transform: from }, { transform: 'translate(0px, 0px)' }], {
      duration: GLIDE_MS,
      easing: GLIDE_EASING,
    });

    // Travel over the squares in between rather than under their pieces.
    square.style.zIndex = '20';
    // Cancelling an animation rejects `finished`, and that rejection lands a
    // microtask later — by which time a re-run of this effect may already have
    // raised the square again. Only the run that is still current lowers it.
    let current = true;
    const clearLift = () => {
      if (current) square.style.zIndex = '';
    };
    animation.finished.then(clearLift, clearLift);

    return () => {
      current = false;
      animation.cancel();
      square.style.zIndex = '';
    };
  }, [ply, dRow, dCol, orientation]);

  if (!Component) return null;

  return (
    <div
      ref={ref}
      className={`pointer-events-none flex h-[85%] w-[85%] items-center justify-center ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={
        {
          transformOrigin: 'center center',
        } as React.CSSProperties
      }
      aria-label={`${piece.color} ${piece.type}`}
      aria-hidden="true"
    >
      <Component className="h-full w-full drop-shadow-[1px_1px_2px_rgba(0,0,0,0.35)]" />
    </div>
  );
}

/**
 * How far the piece now standing on (row, col) travelled on the last move, in
 * squares, or zero offsets if it was already sitting there.
 *
 * Castling moves two pieces, so the rook is matched separately — otherwise it
 * would pop into place beside a gliding king.
 */
function getMoveTravel(
  lastMove: Move | null,
  row: number,
  col: number,
): { dRow: number; dCol: number } | null {
  if (!lastMove) return null;

  if (lastMove.to.row === row && lastMove.to.col === col) {
    return { dRow: lastMove.from.row - row, dCol: lastMove.from.col - col };
  }

  if (lastMove.isCastling && lastMove.to.row === row) {
    const kingside = lastMove.to.col === 6;
    const rookTo = kingside ? 5 : 3;
    const rookFrom = kingside ? 7 : 0;
    if (col === rookTo) return { dRow: 0, dCol: rookFrom - rookTo };
  }

  return null;
}
