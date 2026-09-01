import { useChessStore } from '../../store/useChessStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { EnginePvLine, EvaluationData } from '../../store';

interface EngineEvaluationProps {
  className?: string;
  /** Evaluation to display. Falls back to the live game store when omitted. */
  evaluation?: EvaluationData | null;
  /** Alternative principal variations from a MultiPV search. */
  engineLines?: EnginePvLine[];
  depth?: number;
  isAnalyzing?: boolean;
}

export function EngineEvaluation({
  className = '',
  evaluation,
  engineLines,
  depth,
  isAnalyzing,
}: EngineEvaluationProps) {
  const storeEvaluation = useChessStore((s) => s.engineEvaluation);
  const storeIsEngineThinking = useChessStore((s) => s.isEngineThinking);
  const showEngineEvaluation = useSettingsStore((s) => s.computer.showEngineEvaluation);

  // `undefined` means "not supplied"; an explicit `null` means "no evaluation yet".
  const evalData = evaluation !== undefined ? evaluation : storeEvaluation;
  const lines = engineLines ?? [];
  const currentDepth = depth ?? evalData?.depth ?? 0;
  const analyzing = isAnalyzing ?? storeIsEngineThinking;

  if (!showEngineEvaluation || !evalData) {
    return null;
  }

  const { score, mate, selDepth, nodes, nps, pv } = evalData;

  const evalText =
    mate !== undefined
      ? `Mate in ${Math.abs(mate)}`
      : score !== undefined
        ? `${score >= 0 ? '+' : ''}${(score / 100).toFixed(2)}`
        : '=';

  const bestMove = lines[0]?.bestMove ?? (pv && pv.length > 0 ? pv[0] : null);

  // Alternatives beyond the top line, when a MultiPV search supplied them.
  const alternatives = lines.length > 1 ? lines.slice(1, 3) : null;

  return (
    <div className={`flex flex-col items-center gap-1.5 px-2 py-1.5 text-xs font-mono ${className}`}>
      <div
        className={`flex items-center gap-1.5 font-semibold transition-colors ${
          mate !== undefined
            ? 'text-red-400'
            : score !== undefined && score > 20
            ? 'text-green-400'
            : score !== undefined && score < -20
            ? 'text-red-400'
            : 'text-amber-400'
        }`}
      >
        <span className="tabular-nums">{evalText}</span>
        {currentDepth !== undefined && (
          <span className="text-gray-500">d{currentDepth}</span>
        )}
        {selDepth !== undefined && (
          <span className="text-gray-600">/ {selDepth}</span>
        )}
      </div>
      {bestMove && (
        <div className="flex items-center gap-1 text-gray-500">
          <span className="text-[10px] uppercase tracking-wider">Best:</span>
          <span className="font-mono text-white">{formatUciMove(bestMove)}</span>
        </div>
      )}
      {alternatives && alternatives.length > 0 && (
        <div className="w-full space-y-0.5 text-[10px] text-gray-500">
          {alternatives.map((line) => (
            <div key={line.multipv} className="flex items-center gap-1">
              <span className="text-gray-400">{line.multipv}.</span>
              <span className="font-mono">{formatUciMove(line.bestMove)}</span>
              <span className="tabular-nums">
                {line.mate !== undefined
                  ? `#${Math.abs(line.mate)}`
                  : `${line.score >= 0 ? '+' : ''}${(line.score / 100).toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 uppercase tracking-wider">
        {nodes ? <span>{formatNumber(nodes)} nodes</span> : null}
        {nps ? <span>{formatNumber(nps)} nps</span> : null}
        {analyzing && (
          <span className="flex items-center gap-1 text-amber-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            thinking
          </span>
        )}
      </div>
    </div>
  );
}

function formatUciMove(uci: string): string {
  if (uci.length < 4) return uci;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length === 5 ? uci[4].toUpperCase() : '';
  return `${from}${to}${promo}`;
}

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
  return num.toString();
}
