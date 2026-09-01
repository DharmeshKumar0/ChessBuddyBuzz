import { X, Check, Sun, Moon, Monitor, Volume2, VolumeX, Settings2, Gamepad2, Cpu, Palette, Layout, Shield } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { BoardTheme, PieceStyle, UiTheme } from '../../store/useSettingsStore';
import { getBots } from '../../services/chessEngineService';

const THEME_ICONS: Record<UiTheme, React.ReactNode> = {
  light: <Sun size={20} />,
  dark: <Moon size={20} />,
  system: <Monitor size={20} />,
};

const THEME_LABELS: Record<UiTheme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const BOARD_THEMES: { id: BoardTheme; name: string; lightBg: string; darkBg: string }[] = [
  { id: 'wood', name: 'Classic Wood', lightBg: 'bg-[#f0d9b5]', darkBg: 'bg-[#b58863]' },
  { id: 'emerald', name: 'Emerald', lightBg: 'bg-[#eeeed2]', darkBg: 'bg-[#769656]' },
  { id: 'slate', name: 'Slate', lightBg: 'bg-[#e2e8f0]', darkBg: 'bg-[#475569]' },
  { id: 'blue', name: 'Blue', lightBg: 'bg-[#dbeafe]', darkBg: 'bg-[#1e40af]' },
  { id: 'purple', name: 'Purple', lightBg: 'bg-[#f3e8ff]', darkBg: 'bg-[#7c3aed]' },
  { id: 'marble', name: 'Marble', lightBg: 'bg-[#f5f5f4]', darkBg: 'bg-[#44403c]' },
];

const PIECE_STYLES: { id: PieceStyle; name: string; description: string }[] = [
  { id: 'standard', name: 'Standard', description: 'Classic Staunton pieces' },
  { id: 'modern', name: 'Modern', description: 'Clean contemporary design' },
  { id: 'minimal', name: 'Minimal', description: 'Simple geometric shapes' },
  { id: 'pixel', name: 'Pixel', description: 'Retro 8-bit style' },
  { id: 'alpha', name: 'Alpha', description: 'AlphaZero-inspired' },
];

// The bots come from the engine service, which is also where their strength is
// configured. A second hardcoded list here drifted out of step with it and
// showed ratings the bots did not play at.
const BOTS = getBots();

function ToggleSwitch({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
        checked ? 'bg-amber-600' : 'bg-gray-300 dark:bg-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SectionHeader({ Icon, title, description }: { Icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={20} className="text-amber-500" />
      <div>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function SettingRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-800">{children}</div>;
}

function SettingLabel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-2">
      <div>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

import { useChessStore } from '../../store/useChessStore';

export function SettingsModal() {
  // Read all settings
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const board = useSettingsStore((s) => s.board);
  const setBoard = useSettingsStore((s) => s.setBoard);
  const gameplay = useSettingsStore((s) => s.gameplay);
  const setGameplay = useSettingsStore((s) => s.setGameplay);
  const sound = useSettingsStore((s) => s.sound);
  const setSound = useSettingsStore((s) => s.setSound);
  const computer = useSettingsStore((s) => s.computer);
  const setComputer = useSettingsStore((s) => s.setComputer);
  const applyTheme = useSettingsStore((s) => s.applyTheme);
  const resetSettings = useSettingsStore((s) => s.resetSettings);

  const isSettingsOpen = useChessStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useChessStore((s) => s.setSettingsOpen);

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl transition-all dark:border-gray-800 dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-500" />
            Settings
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* APPEARANCE */}
          <div>
            <SectionHeader Icon={Palette} title="Appearance" description="Customize the look and feel of the interface" />
            <div className="space-y-3">
              <SettingRow>
                <SettingLabel title="Theme" description="Choose color scheme for the application" />
                <div className="flex gap-2">
                  {Object.entries(THEME_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => { setAppearance({ theme: value as UiTheme }); applyTheme(); }}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        appearance.theme === value
                          ? 'bg-amber-600 text-white ring-2 ring-amber-500/20'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {THEME_ICONS[value as UiTheme]}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          </div>

          {/* BOARD */}
          <div>
            <SectionHeader Icon={Layout} title="Board" description="Configure board appearance and behavior" />
            <div className="space-y-4">
              {/* Board Theme */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 block">
                  Board Theme
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {BOARD_THEMES.map((t) => {
                    const active = board.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setBoard({ theme: t.id })}
                        className={`flex flex-col items-center rounded-lg border p-2.5 text-left transition-all ${
                          active
                            ? 'border-amber-500 ring-2 ring-amber-500/20 dark:border-amber-500'
                            : 'border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className="flex h-10 w-full overflow-hidden rounded border border-black/10">
                          <div className={`h-full w-1/2 ${t.lightBg}`} />
                          <div className={`h-full w-1/2 ${t.darkBg}`} />
                        </div>
                        <span className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Piece Style */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 block">
                  Piece Style
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {PIECE_STYLES.map((s) => {
                    const active = board.pieceStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setBoard({ pieceStyle: s.id })}
                        className={`flex flex-col items-center rounded-lg border p-3 text-center transition-all ${
                          active
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20'
                            : 'border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-1">
                          <span className="text-lg">♔</span>
                        </div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{s.name}</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{s.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Board Toggles */}
              <SettingRow>
                <SettingLabel title="Show Coordinates" description="Display rank and file labels on the board" />
                <ToggleSwitch checked={board.showCoordinates} onChange={() => setBoard({ showCoordinates: !board.showCoordinates })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Show Legal Moves" description="Highlight legal moves when piece is selected" />
                <ToggleSwitch checked={gameplay.showLegalMoves} onChange={() => setGameplay({ showLegalMoves: !gameplay.showLegalMoves })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Show Last Move" description="Highlight the last move played" />
                <ToggleSwitch checked={gameplay.showLastMove} onChange={() => setGameplay({ showLastMove: !gameplay.showLastMove })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Board Orientation" description="Default board perspective" />
                <div className="flex gap-2">
                  {['white', 'black', 'auto'].map((o) => (
                    <button
                      key={o}
                      onClick={() => setBoard({ orientation: o as 'white' | 'black' | 'auto' })}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        board.orientation === o
                          ? 'bg-amber-600 text-white ring-2 ring-amber-500/20'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {o === 'white' ? '♔' : o === 'black' ? '♚' : '↻'}
                      <span className="capitalize">{o}</span>
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          </div>

          {/* GAMEPLAY */}
          <div>
            <SectionHeader Icon={Gamepad2} title="Gameplay" description="Configure game behavior and confirmations" />
            <div className="space-y-3">
              <SettingRow>
                <SettingLabel title="Auto Queen Promotion" description="Automatically promote pawns to queen without prompt" />
                <ToggleSwitch checked={gameplay.autoQueenPromotion} onChange={() => setGameplay({ autoQueenPromotion: !gameplay.autoQueenPromotion })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Confirm Resignation" description="Ask for confirmation before resigning" />
                <ToggleSwitch checked={gameplay.confirmResignation} onChange={() => setGameplay({ confirmResignation: !gameplay.confirmResignation })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Confirm Draw Offer" description="Ask for confirmation before offering a draw" />
                <ToggleSwitch checked={gameplay.confirmDrawOffer} onChange={() => setGameplay({ confirmDrawOffer: !gameplay.confirmDrawOffer })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Move Animation" description="Animate pieces when moving" />
                <ToggleSwitch checked={gameplay.moveAnimation} onChange={() => setGameplay({ moveAnimation: !gameplay.moveAnimation })} />
              </SettingRow>
            </div>
          </div>

          {/* SOUND */}
          <div>
            <SectionHeader Icon={Volume2} title="Sound" description="Configure game sounds" />
            <div className="space-y-3">
              <SettingRow>
                <SettingLabel title="Master Sound" description="Enable or disable all sounds" />
                <ToggleSwitch checked={sound.master} onChange={() => setSound({ master: !sound.master })} />
              </SettingRow>

              {!sound.master ? null : (
                <>
                  <SettingRow>
                    <SettingLabel title="Move Sound" description="Play sound when moving pieces" />
                    <ToggleSwitch checked={sound.move} onChange={() => setSound({ move: !sound.move })} disabled={!sound.master} />
                  </SettingRow>

                  <SettingRow>
                    <SettingLabel title="Capture Sound" description="Play sound when capturing pieces" />
                    <ToggleSwitch checked={sound.capture} onChange={() => setSound({ capture: !sound.capture })} disabled={!sound.master} />
                  </SettingRow>

                  <SettingRow>
                    <SettingLabel title="Check Sound" description="Play sound when king is in check" />
                    <ToggleSwitch checked={sound.check} onChange={() => setSound({ check: !sound.check })} disabled={!sound.master} />
                  </SettingRow>

                  <SettingRow>
                    <SettingLabel title="Game End Sound" description="Play sound when game ends" />
                    <ToggleSwitch checked={sound.gameEnd} onChange={() => setSound({ gameEnd: !sound.gameEnd })} disabled={!sound.master} />
                  </SettingRow>

                  <div className="flex items-center gap-3 py-2 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2 w-24">
                      <VolumeX size={16} className="text-gray-400" />
                      <Volume2 size={16} className="text-gray-400" />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(sound.volume * 100)}
                      onChange={(e) => setSound({ volume: parseInt(e.target.value) / 100 })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none accent-amber-600 dark:bg-gray-700"
                      disabled={!sound.master}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                      {Math.round(sound.volume * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* COMPUTER */}
          <div>
            <SectionHeader Icon={Cpu} title="Bot" description="Choose your opponent and configure analysis" />
            <div className="space-y-4">
              {/* Bot */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 block">
                  Opponent bot
                </label>
                <div className="space-y-2">
                  {BOTS.map((d) => {
                    const active = computer.difficulty === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setComputer({ difficulty: d.id })}
                        className={`w-full flex items-center gap-3 rounded-lg p-3 transition-all text-left ${
                          active
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20'
                            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <Cpu size={18} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{d.name}</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{d.description}</p>
                        </div>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                          {d.elo} Elo
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Engine Display */}
              <SettingRow>
                <SettingLabel title="Evaluation Bar" description="Visual advantage bar on the side of the board" />
                <ToggleSwitch checked={computer.showEvaluationBar} onChange={() => setComputer({ showEvaluationBar: !computer.showEvaluationBar })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Engine Evaluation" description="Show numerical evaluation, depth, and best move" />
                <ToggleSwitch checked={computer.showEngineEvaluation} onChange={() => setComputer({ showEngineEvaluation: !computer.showEngineEvaluation })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Thinking Indicator" description="Show when the computer is calculating" />
                <ToggleSwitch checked={computer.showThinkingIndicator} onChange={() => setComputer({ showThinkingIndicator: !computer.showThinkingIndicator })} />
              </SettingRow>

              <SettingRow>
                <SettingLabel title="Auto Analyze" description="Automatically analyze positions with engine" />
                <ToggleSwitch checked={computer.autoAnalyze} onChange={() => setComputer({ autoAnalyze: !computer.autoAnalyze })} />
              </SettingRow>
            </div>
          </div>

          {/* RESET */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={() => { resetSettings(); applyTheme(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
            >
              <Shield size={14} />
              <span>Reset All Settings</span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setSettingsOpen(false)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
          >
            <Check size={14} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}