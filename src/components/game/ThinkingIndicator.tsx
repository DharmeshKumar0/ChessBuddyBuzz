import { useChessStore } from '../../store/useChessStore';
import { useBotSeat } from '../../store/useBotSeat';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Brain } from 'lucide-react';

export function ThinkingIndicator() {
  const { isEngineThinking, computerColor, currentTurn, gameMode } = useChessStore();
  const showThinkingIndicator = useSettingsStore((s) => s.computer.showThinkingIndicator);
  const botSeat = useBotSeat();

  if (!showThinkingIndicator || gameMode !== 'computer' || !isEngineThinking) {
    return null;
  }

  const isComputerTurn = computerColor === currentTurn;
  const botName = botSeat?.name ?? 'The bot';

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-700 shadow-lg animate-fade-in">
      <Brain className="w-5 h-5 text-amber-400 animate-pulse" />
      <span className="text-sm font-medium text-white">
        {isComputerTurn ? `${botName} is thinking...` : 'Analyzing position...'}
      </span>
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}