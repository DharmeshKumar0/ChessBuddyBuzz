import { useChessStore } from '../../store/useChessStore';
import { useBoardOrientation } from '../../store/useBoardOrientation';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { EvaluationData, PieceColor } from '../../store';

interface EvaluationBarProps {
  /** Evaluation to display. Falls back to the live game store when omitted. */
  evaluation?: EvaluationData | null;
  /** Board orientation. Falls back to the live game store when omitted. */
  orientation?: 'white' | 'black';
  /** Side to move. Falls back to the live game store when omitted. */
  currentTurn?: PieceColor;
}

export function EvaluationBar({
  evaluation,
  orientation: orientationProp,
  currentTurn: currentTurnProp,
}: EvaluationBarProps = {}) {
  const storeEvaluation = useChessStore((s) => s.engineEvaluation);
  const storeOrientation = useBoardOrientation();
  const storeCurrentTurn = useChessStore((s) => s.currentTurn);
  const showEvaluationBar = useSettingsStore((s) => s.computer.showEvaluationBar);

  // `undefined` means "not supplied"; an explicit `null` means "no evaluation yet".
  const evalData = evaluation !== undefined ? evaluation : storeEvaluation;
  const orientation = orientationProp ?? storeOrientation;
  const currentTurn = currentTurnProp ?? storeCurrentTurn;

  if (!showEvaluationBar || !evalData) {
    return null;
  }

  const { score, mate } = evalData;

  const evalPercent = getEvaluationPercent(score, mate);
  const whitePercent = orientation === 'white' ? evalPercent : 100 - evalPercent;

  const isWhiteTurn = currentTurn === 'white';

  return (
    <div
      className={`relative w-3 h-full bg-gray-900 rounded-full overflow-hidden border border-gray-700 transition-all duration-300 ${
        orientation === 'white' ? '' : 'rotate-180'
      }`}
      style={{ minHeight: '280px' }}
      role="img"
      aria-label={`Evaluation bar: ${formatEvaluation(score, mate)}`}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-500 ease-out"
        style={{ height: `${whitePercent}%` }}
      />
      <div
        className={`absolute left-0 right-0 h-1 transition-all duration-500 ${
          isWhiteTurn ? 'bg-amber-400' : 'bg-gray-600'
        }`}
        style={{ bottom: `${whitePercent}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-xs font-mono text-gray-400 select-none">
          {formatEvaluation(score, mate)}
        </span>
      </div>
    </div>
  );
}

function getEvaluationPercent(score: number | undefined, mate: number | undefined): number {
  if (mate !== undefined) {
    return mate > 0 ? 99 : 1;
  }
  if (score === undefined) return 50;
  const cp = score;
  const sigmoid = 1 / (1 + Math.exp(-cp / 300));
  return Math.max(1, Math.min(99, sigmoid * 100));
}

function formatEvaluation(score: number | undefined, mate: number | undefined): string {
  if (mate !== undefined) {
    return mate > 0 ? `#${mate}` : `#${mate}`;
  }
  if (score === undefined) return '=';
  const sign = score >= 0 ? '+' : '';
  return `${sign}${(score / 100).toFixed(2)}`;
}
