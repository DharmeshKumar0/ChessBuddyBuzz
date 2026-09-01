import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UiTheme = 'light' | 'dark' | 'system';
export type BoardTheme = 'wood' | 'emerald' | 'slate' | 'blue' | 'purple' | 'marble';
export type PieceStyle = 'standard' | 'modern' | 'minimal' | 'pixel' | 'alpha';
export type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export interface SoundSettings {
  master: boolean;
  move: boolean;
  capture: boolean;
  check: boolean;
  gameEnd: boolean;
  volume: number; // 0-1
}

export interface GameplaySettings {
  autoQueenPromotion: boolean;
  confirmResignation: boolean;
  confirmDrawOffer: boolean;
  moveAnimation: boolean;
  showLegalMoves: boolean;
  showLastMove: boolean;
}

export interface BoardSettings {
  theme: BoardTheme;
  pieceStyle: PieceStyle;
  showCoordinates: boolean;
  orientation: 'white' | 'black' | 'auto';
}

export interface ComputerSettings {
  difficulty: DifficultyLevel;
  showEvaluationBar: boolean;
  showEngineEvaluation: boolean;
  showThinkingIndicator: boolean;
  autoAnalyze: boolean;
}

export interface AppearanceSettings {
  theme: UiTheme;
}

export interface SettingsState {
  appearance: AppearanceSettings;
  board: BoardSettings;
  gameplay: GameplaySettings;
  sound: SoundSettings;
  computer: ComputerSettings;

  // Actions
  setAppearance: (settings: Partial<AppearanceSettings>) => void;
  setBoard: (settings: Partial<BoardSettings>) => void;
  setGameplay: (settings: Partial<GameplaySettings>) => void;
  setSound: (settings: Partial<SoundSettings>) => void;
  setComputer: (settings: Partial<ComputerSettings>) => void;
  resetSettings: () => void;
  applyTheme: () => void;
}

const DEFAULT_SETTINGS: SettingsState = {
  appearance: {
    theme: 'system',
  },
  board: {
    theme: 'wood',
    pieceStyle: 'standard',
    showCoordinates: true,
    // 'auto' = show the board from your own side: your colour online, the side
    // the engine is not playing in a computer game. A fixed 'white' here used to
    // leave a black player looking at the board from white's end.
    orientation: 'auto',
  },
  gameplay: {
    autoQueenPromotion: false,
    confirmResignation: true,
    confirmDrawOffer: true,
    moveAnimation: true,
    showLegalMoves: true,
    showLastMove: true,
  },
  sound: {
    master: true,
    move: true,
    capture: true,
    check: true,
    gameEnd: true,
    volume: 0.7,
  },
  computer: {
    difficulty: 'medium',
    showEvaluationBar: true,
    showEngineEvaluation: true,
    showThinkingIndicator: true,
    autoAnalyze: false,
  },
  // Actions will be added below
  setAppearance: () => {},
  setBoard: () => {},
  setGameplay: () => {},
  setSound: () => {},
  setComputer: () => {},
  resetSettings: () => {},
  applyTheme: () => {},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setAppearance: (settings: Partial<AppearanceSettings>) =>
        set((state) => ({
          appearance: { ...state.appearance, ...settings },
        })),

      setBoard: (settings: Partial<BoardSettings>) =>
        set((state) => ({
          board: { ...state.board, ...settings },
        })),

      setGameplay: (settings: Partial<GameplaySettings>) =>
        set((state) => ({
          gameplay: { ...state.gameplay, ...settings },
        })),

      setSound: (settings: Partial<SoundSettings>) =>
        set((state) => ({
          sound: { ...state.sound, ...settings },
        })),

      setComputer: (settings: Partial<ComputerSettings>) =>
        set((state) => ({
          computer: { ...state.computer, ...settings },
        })),

      resetSettings: () => set(DEFAULT_SETTINGS),

      applyTheme: () => {
        const { theme } = get().appearance;
        const root = document.documentElement;
        
        if (theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.classList.toggle('dark', prefersDark);
        } else {
          root.classList.toggle('dark', theme === 'dark');
        }
      },
    }),
    {
      name: 'chess-settings',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // v1 shipped 'white' as the default Board Orientation, which pinned every
      // board to white's view: playing as black online showed the opponent's
      // pieces at the bottom, with the panels naming the sides the other way
      // round. Anything still sitting on that default moves to 'auto'.
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as SettingsState;
        if (version < 2 && state?.board?.orientation === 'white') {
          return { ...state, board: { ...state.board, orientation: 'auto' } };
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.applyTheme();
        }
      },
    }
  )
);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const { appearance } = useSettingsStore.getState();
    if (appearance.theme === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}