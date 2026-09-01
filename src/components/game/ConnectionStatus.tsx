import { Loader2, Users, AlertCircle, WifiOff, RefreshCw } from 'lucide-react';
import { useChessStore } from '../../store/useChessStore';
import { multiplayerService } from '../../services/multiplayerService';

export function ConnectionStatus() {
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const opponentConnected = useChessStore((s) => s.opponentConnected);
  const opponentName = useChessStore((s) => s.opponentName);
  const myColor = useChessStore((s) => s.myColor);
  const gameStatus = useChessStore((s) => s.gameStatus);
  const isEngineThinking = useChessStore((s) => s.isEngineThinking);
  const onlineGameId = useChessStore((s) => s.onlineGameId);

  if (!isOnlineGame) return null;

  const isGameFinished = ['checkmate', 'stalemate', 'draw', 'timeout', 'resigned'].includes(gameStatus);
  const isSocketConnected = multiplayerService.isConnected();

  return (
    <div className="fixed top-2 right-2 z-40 flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur-sm border border-gray-700 shadow-lg">
        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            isSocketConnected 
              ? (opponentConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse')
              : 'bg-red-400 animate-pulse'
          }`} />
          <span className="text-xs font-medium text-white">
            {isSocketConnected 
              ? (opponentConnected ? 'Connected' : 'Waiting for opponent...')
              : 'Reconnecting...'
            }
          </span>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Opponent info */}
        {opponentName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-300">
            <Users size={12} />
            <span>{opponentName}</span>
            {!opponentConnected && isSocketConnected && (
              <span className="flex items-center gap-1 text-amber-400">
                <WifiOff size={10} />
                Disconnected
              </span>
            )}
          </div>
        )}

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Your color */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`font-bold ${myColor === 'white' ? 'text-white' : 'text-gray-300'}`}>
            {myColor === 'white' ? '♔' : '♚'}
          </span>
          <span className="text-gray-400 capitalize">{myColor}</span>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Room ID */}
        {onlineGameId && (
          <span className="text-xs font-mono text-gray-400 tracking-wider">{onlineGameId}</span>
        )}

        {/* Game state indicators */}
        {isGameFinished && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertCircle size={12} />
            <span className="capitalize">{gameStatus}</span>
          </div>
        )}

        {isEngineThinking && opponentConnected && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            <span>Opponent thinking...</span>
          </div>
        )}

        {!isSocketConnected && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <RefreshCw size={12} className="animate-spin" />
            <span>Reconnecting...</span>
          </div>
        )}
      </div>
    </div>
  );
}