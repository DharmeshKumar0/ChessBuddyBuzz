import { useChessStore } from '../../store';
import type { PieceType } from '../../chess';
import { getPieceComponent } from '../chess/pieces';

export function PromotionModal() {
  const pendingPromotion = useChessStore((s) => s.pendingPromotion);
  const completePromotion = useChessStore((s) => s.completePromotion);
  const cancelPromotion = useChessStore((s) => s.cancelPromotion);

  if (!pendingPromotion) return null;

  const color = pendingPromotion.color;

  const options: { type: PieceType; label: string }[] = [
    { type: 'queen', label: 'Queen' },
    { type: 'rook', label: 'Rook' },
    { type: 'bishop', label: 'Bishop' },
    { type: 'knight', label: 'Knight' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={cancelPromotion}
      />

      {/* Modal */}
      <div className="relative z-10 flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-2xl transition-all dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-1 text-base font-bold text-gray-900 dark:text-gray-100">
          Promote Pawn
        </h3>
        <p className="mb-5 text-xs text-gray-500 dark:text-gray-400">
          Choose a piece to replace your pawn
        </p>

        <div className="flex items-center gap-3 sm:gap-4">
          {options.map((opt) => {
            const Component = getPieceComponent(color, opt.type);
            if (!Component) return null;

            return (
              <button
                key={opt.type}
                onClick={() => completePromotion(opt.type)}
                className="group flex flex-col items-center rounded-xl border border-gray-200 bg-gray-50 p-3 transition-all hover:scale-105 hover:border-amber-500 hover:bg-amber-500/10 active:scale-95 dark:border-gray-800 dark:bg-gray-800/80 dark:hover:border-amber-500 dark:hover:bg-amber-500/20"
                title={`Promote to ${opt.label}`}
              >
                <div className="h-12 w-12 sm:h-14 sm:w-14">
                  <Component className="h-full w-full drop-shadow-md transition-transform group-hover:scale-110" />
                </div>
                <span className="mt-2 text-xs font-semibold capitalize text-gray-700 dark:text-gray-300 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
