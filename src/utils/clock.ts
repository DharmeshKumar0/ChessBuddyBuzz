/**
 * Chess Clock Utility
 * Provides accurate time control parsing and clock logic
 */

export interface TimeControl {
  initialMs: number;
  incrementMs: number;
  display: string; // e.g., "5+3"
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  activeColor: 'white' | 'black' | null;
  isRunning: boolean;
  lastTickMs: number | null;
}

/**
 * Predefined time controls
 */
export const TIME_CONTROLS: TimeControl[] = [
  { initialMs: 60_000, incrementMs: 0, display: '1+0' },
  { initialMs: 120_000, incrementMs: 1_000, display: '2+1' },
  { initialMs: 180_000, incrementMs: 0, display: '3+0' },
  { initialMs: 180_000, incrementMs: 2_000, display: '3+2' },
  { initialMs: 300_000, incrementMs: 0, display: '5+0' },
  { initialMs: 300_000, incrementMs: 3_000, display: '5+3' },
  { initialMs: 600_000, incrementMs: 0, display: '10+0' },
  { initialMs: 600_000, incrementMs: 5_000, display: '10+5' },
  { initialMs: 900_000, incrementMs: 10_000, display: '15+10' },
  { initialMs: 1_800_000, incrementMs: 0, display: '30+0' },
];

/**
 * Parse time control string (e.g., "5+3" -> { initialMs: 300000, incrementMs: 3000 })
 */
export function parseTimeControl(control: string): TimeControl | null {
  const match = control.match(/^(\d+)\+(\d+)$/);
  if (!match) return null;
  
  const initialMinutes = parseInt(match[1], 10);
  const incrementSeconds = parseInt(match[2], 10);
  
  return {
    initialMs: initialMinutes * 60_000,
    incrementMs: incrementSeconds * 1_000,
    display: control,
  };
}

/**
 * Format milliseconds to clock display (MM:SS or H:MM:SS)
 */
export function formatTime(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Create initial clock state
 */
export function createInitialClockState(control: TimeControl): ClockState {
  return {
    whiteMs: control.initialMs,
    blackMs: control.initialMs,
    activeColor: null,
    isRunning: false,
    lastTickMs: null,
  };
}

/**
 * Tick the clock - returns updated state
 */
export function tickClock(state: ClockState): ClockState {
  if (!state.isRunning || !state.activeColor || !state.lastTickMs) {
    return state;
  }
  
  const now = Date.now();
  const elapsed = now - state.lastTickMs;
  
  if (state.activeColor === 'white') {
    const newWhiteTime = Math.max(0, state.whiteMs - elapsed);
    return {
      ...state,
      whiteMs: newWhiteTime,
      lastTickMs: now,
      isRunning: newWhiteTime > 0,
    };
  } else {
    const newBlackTime = Math.max(0, state.blackMs - elapsed);
    return {
      ...state,
      blackMs: newBlackTime,
      lastTickMs: now,
      isRunning: newBlackTime > 0,
    };
  }
}

/**
 * Switch active player and credit the increment to the player who just moved.
 * Mirrors server/src/utils/clock.ts so local and online clocks behave identically.
 */
export function switchClock(
  state: ClockState,
  nextColor: 'white' | 'black',
  incrementMs: number,
  now: number = Date.now(),
): ClockState {
  // The mover is whoever the clock was running for. Before the clock has
  // started there is nothing to deduct, so the mover is simply the opposite of
  // whoever is up next.
  const moverColor = state.activeColor ?? (nextColor === 'white' ? 'black' : 'white');
  const elapsed =
    state.isRunning && state.activeColor && state.lastTickMs ? now - state.lastTickMs : 0;

  let newWhiteTime = state.whiteMs;
  let newBlackTime = state.blackMs;

  // Deduct the mover's thinking time before touching the increment, so a
  // flag-fall is never masked by the increment being credited.
  if (moverColor === 'white') {
    newWhiteTime = Math.max(0, newWhiteTime - elapsed);
  } else {
    newBlackTime = Math.max(0, newBlackTime - elapsed);
  }

  const isTimeUp = newWhiteTime <= 0 || newBlackTime <= 0;

  // The increment belongs to the player who just moved.
  if (!isTimeUp && incrementMs > 0) {
    if (moverColor === 'white') {
      newWhiteTime += incrementMs;
    } else {
      newBlackTime += incrementMs;
    }
  }

  return {
    ...state,
    whiteMs: newWhiteTime,
    blackMs: newBlackTime,
    activeColor: isTimeUp ? null : nextColor,
    isRunning: !isTimeUp,
    lastTickMs: isTimeUp ? null : now,
  };
}

/**
 * Stop the clock
 */
export function stopClock(state: ClockState): ClockState {
  if (!state.isRunning) return state;
  
  const now = Date.now();
  const elapsed = state.lastTickMs ? now - state.lastTickMs : 0;
  
  let newWhiteTime = state.whiteMs;
  let newBlackTime = state.blackMs;
  
  if (state.activeColor === 'white') {
    newWhiteTime = Math.max(0, state.whiteMs - elapsed);
  } else if (state.activeColor === 'black') {
    newBlackTime = Math.max(0, state.blackMs - elapsed);
  }
  
  return {
    ...state,
    whiteMs: newWhiteTime,
    blackMs: newBlackTime,
    isRunning: false,
    activeColor: null,
    lastTickMs: null,
  };
}

/**
 * Check if either player has run out of time
 */
export function checkTimeUp(state: ClockState): 'white' | 'black' | null {
  if (state.whiteMs <= 0) return 'white';
  if (state.blackMs <= 0) return 'black';
  return null;
}