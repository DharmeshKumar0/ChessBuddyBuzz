import { X, Check, User, Cpu, Globe, Clock, Shuffle, HelpCircle, Brain, Users } from 'lucide-react';
import { useState } from 'react';
import { useChessStore } from '../../store';
import { useSettingsStore } from '../../store/useSettingsStore';
import { TIME_CONTROLS } from '../../utils/clock';
import { getBots, type DifficultyLevel } from '../../services/chessEngineService';

const TIME_CONTROL_CATEGORIES = [
  {
    name: 'Bullet',
    controls: TIME_CONTROLS.filter(tc => tc.initialMs < 180_000),
  },
  {
    name: 'Blitz',
    controls: TIME_CONTROLS.filter(tc => tc.initialMs >= 180_000 && tc.initialMs < 600_000),
  },
  {
    name: 'Rapid',
    controls: TIME_CONTROLS.filter(tc => tc.initialMs >= 600_000 && tc.initialMs < 1_800_000),
  },
  {
    name: 'Classical',
    controls: TIME_CONTROLS.filter(tc => tc.initialMs >= 1_800_000),
  },
];

export function NewGameSetup() {
  const isOpen = useChessStore((s) => s.isNewGameSetupOpen);
  const setSetupOpen = useChessStore((s) => s.setNewGameSetupOpen);
  const setOnlineSetupOpen = useChessStore((s) => s.setOnlineSetupOpen);
  const setJoinGameOpen = useChessStore((s) => s.setIsJoinGameOpen);
  const newGame = useChessStore((s) => s.newGame);
  const timeControl = useChessStore((s) => s.timeControl);

  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | 'random'>('random');
  const [selectedOpponent, setSelectedOpponent] = useState<'local' | 'computer' | 'online'>('local');
  const [selectedTimeControl, setSelectedTimeControl] = useState(timeControl.display);
  // Start on the bot already in use, so reopening the dialog shows the truth.
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>(
    () => useSettingsStore.getState().computer.difficulty,
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setSetupOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            New Game Setup
          </h2>
          <button
            onClick={() => setSetupOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Color Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <User size={14} />
              Play As
            </label>
            <div className="mt-3 flex gap-3">
              {[
                { value: 'white' as const, label: 'White', icon: <div className="w-6 h-6 rounded bg-white border border-gray-300" />, desc: 'Move first' },
                { value: 'black' as const, label: 'Black', icon: <div className="w-6 h-6 rounded bg-gray-800" />, desc: 'Move second' },
                { value: 'random' as const, label: 'Random', icon: <Shuffle size={18} className="text-gray-700 dark:text-gray-300" />, desc: 'Randomly assigned' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedColor(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
                    selectedColor === opt.value
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded border border-gray-300 dark:border-gray-600">
                    {opt.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Opponent Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Cpu size={14} />
              Opponent
            </label>
            <div className="mt-3 flex gap-3">
              {[
                { value: 'local' as const, label: 'Local Player', icon: <User size={20} />, desc: 'Play on this device', available: true },
                { value: 'computer' as const, label: 'Bot', icon: <Cpu size={20} />, desc: 'Play vs an AI bot', available: true },
                { value: 'online' as const, label: 'Online Player', icon: <Globe size={20} />, desc: 'Play vs friend online', available: true },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => opt.available && setSelectedOpponent(opt.value)}
                  disabled={!opt.available}
                  className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
                    selectedOpponent === opt.value
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20'
                      : opt.available
                      ? 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                      : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded border border-gray-300 dark:border-gray-600">
                    {opt.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</span>
                  {!opt.available && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <HelpCircle size={10} />
                      Coming Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bot Selection (only shown when a bot opponent is selected) */}
          {selectedOpponent === 'computer' && (
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <Brain size={14} />
                Choose your bot
              </label>
              <div className="mt-3 space-y-3">
                {getBots().map((bot) => (
                  <button
                    key={bot.id}
                    onClick={() => setSelectedDifficulty(bot.id)}
                    className={`w-full flex items-center gap-3 rounded-lg p-3 transition-all text-left ${
                      selectedDifficulty === bot.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <Brain size={18} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{bot.name}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{bot.description}</p>
                    </div>
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      {bot.elo} Elo
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time Control Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Clock size={14} />
              Time Control
            </label>
            <div className="mt-3 space-y-4">
              {TIME_CONTROL_CATEGORIES.map((category) => (
                <div key={category.name}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    {category.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {category.controls.map((tc) => (
                      <button
                        key={tc.display}
                        onClick={() => setSelectedTimeControl(tc.display)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
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
              ))}
              {/* Custom time control placeholder */}
              <button
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 border border-dashed border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-400"
                disabled
              >
                <Clock size={12} />
                <span>Custom...</span>
                <HelpCircle size={10} className="text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setSetupOpen(false)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X size={14} />
            Cancel
          </button>
          {selectedOpponent === 'online' ? (
            // Online needs a server round trip (name, room code, handshake), which
            // lives in its own two modals. Picking 'online' here used to just call
            // newGame(), which flipped gameMode to 'online' and left the player on a
            // dead board with no room and no connection.
            <>
              <button
                onClick={() => {
                  setSetupOpen(false);
                  setJoinGameOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Users size={14} />
                Join with Room ID
              </button>
              <button
                onClick={() => {
                  setSetupOpen(false);
                  setOnlineSetupOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
              >
                <Globe size={14} />
                Create Online Game
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                newGame({
                  color: selectedColor,
                  timeControl: selectedTimeControl,
                  opponent: selectedOpponent,
                  difficulty: selectedDifficulty
                });
                setSetupOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
            >
              <Check size={14} />
              Start Game
            </button>
          )}
        </div>
      </div>
    </>
  );
}