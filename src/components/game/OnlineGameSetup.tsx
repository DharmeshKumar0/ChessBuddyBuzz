import { X, Check, Clock, Copy, Users, WifiOff, Loader2 } from 'lucide-react';
import { useChessStore } from '../../store/useChessStore';
import { useEffect, useState } from 'react';
import { TIME_CONTROLS } from '../../utils/clock';

export function OnlineGameSetup() {
  const isOpen = useChessStore((s) => s.isOnlineSetupOpen);
  const setOnlineSetupOpen = useChessStore((s) => s.setOnlineSetupOpen);
  const createOnlineGame = useChessStore((s) => s.createOnlineGame);
  const isOnlineGame = useChessStore((s) => s.isOnlineGame);
  const onlineGameId = useChessStore((s) => s.onlineGameId);
  const myColor = useChessStore((s) => s.myColor);
  const opponentConnected = useChessStore((s) => s.opponentConnected);
  const connectToServer = useChessStore((s) => s.connectToServer);

  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | 'random'>('random');
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROLS[4].display);
  const [playerName, setPlayerName] = useState('');
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colorOptions = [
    { value: 'white', label: 'White', icon: '♔' },
    { value: 'black', label: 'Black', icon: '♚' },
    { value: 'random', label: 'Random', icon: '🎲' },
  ];

  // Hand the board over once someone actually joins. Without this the modal would
  // sit on the waiting screen forever, covering the game it just started.
  useEffect(() => {
    if (isOpen && isOnlineGame && opponentConnected) {
      setOnlineSetupOpen(false);
    }
  }, [isOpen, isOnlineGame, opponentConnected, setOnlineSetupOpen]);

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    setError(null);
    setIsCreating(true);
    try {
      await connectToServer();
      await createOnlineGame(playerName.trim(), selectedTimeControl, selectedColor);
      // Deliberately stays open: the modal now falls through to the waiting
      // screen below, which is the only place the Room ID is shown. Closing here
      // meant the room code the user has to share was never displayed.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setIsCreating(false);
    }
  };

  const copyRoomId = async () => {
    if (onlineGameId) {
      await navigator.clipboard.writeText(onlineGameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  // Show waiting screen if game created but opponent not joined
  if (isOnlineGame && onlineGameId && !opponentConnected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setOnlineSetupOpen(false)} />
        <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Waiting for Opponent</h2>
            <button onClick={() => setOnlineSetupOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-lg font-semibold">Game Created</span>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">Room ID</div>
              <div className="flex items-center gap-2 justify-center">
                <code className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100 tracking-widest">
                  {onlineGameId}
                </code>
                <button
                  onClick={copyRoomId}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label={copied ? 'Copied' : 'Copy room ID'}
                >
                  {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                </button>
              </div>
              {copied && <span className="text-xs text-green-600 dark:text-green-400">Copied to clipboard!</span>}
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Users size={16} />
              <span>You: {myColor === 'white' ? '♔ White' : '♚ Black'}</span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="flex items-center gap-1">
                <WifiOff size={16} className="text-gray-400" />
                <span>Waiting for opponent...</span>
              </span>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Share the Room ID with a friend to start playing
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setOnlineSetupOpen(false)} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Create Online Game</h2>
          <button onClick={() => setOnlineSetupOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-5">
          {/* Player Name */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          {/* Color Selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Play As
            </label>
            <div className="mt-2.5 grid grid-cols-3 gap-3">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedColor(c.value as 'white' | 'black' | 'random')}
                  className={`flex flex-col items-center rounded-lg border p-3 text-left transition-all ${
                    selectedColor === c.value
                      ? 'border-amber-500 ring-2 ring-amber-500/20 dark:border-amber-500'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700'
                  }`}
                >
                  <span className="text-2xl">{c.icon}</span>
                  <span className="mt-1 text-xs font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Control */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Time Control
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">Initial time + increment</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.display}
                  onClick={() => setSelectedTimeControl(tc.display)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    selectedTimeControl === tc.display
                      ? 'bg-amber-600 text-white ring-2 ring-amber-500/20'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  <Clock size={12} />
                  <span>{tc.display}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleCreateGame}
            disabled={isCreating || !playerName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isCreating ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </div>
    </div>
  );
}