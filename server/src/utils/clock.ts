import type { TimeControl, ClockState } from '../chess/types.js';

export const TIME_CONTROLS: TimeControl[] = [
  { display: '1+0', initialMs: 60_000, incrementMs: 0 },
  { display: '2+1', initialMs: 120_000, incrementMs: 1_000 },
  { display: '3+0', initialMs: 180_000, incrementMs: 0 },
  { display: '3+2', initialMs: 180_000, incrementMs: 2_000 },
  { display: '5+0', initialMs: 300_000, incrementMs: 0 },
  { display: '5+3', initialMs: 300_000, incrementMs: 3_000 },
  { display: '10+0', initialMs: 600_000, incrementMs: 0 },
  { display: '10+5', initialMs: 600_000, incrementMs: 5_000 },
  { display: '15+10', initialMs: 900_000, incrementMs: 10_000 },
  { display: '30+0', initialMs: 1_800_000, incrementMs: 0 },
];

export function parseTimeControl(display: string): TimeControl | null {
  const found = TIME_CONTROLS.find(tc => tc.display === display);
  return found || null;
}

export function createInitialClockState(timeControl: TimeControl): ClockState {
  return {
    whiteMs: timeControl.initialMs,
    blackMs: timeControl.initialMs,
    activeColor: null,
    isRunning: false,
    lastTickMs: null,
  };
}

export function tickClock(clock: ClockState, now: number): ClockState {
  if (!clock.isRunning || !clock.activeColor || clock.lastTickMs === null) {
    return clock;
  }

  const delta = now - clock.lastTickMs;
  const newClock = { ...clock, lastTickMs: now };

  if (clock.activeColor === 'white') {
    newClock.whiteMs = Math.max(0, clock.whiteMs - delta);
  } else {
    newClock.blackMs = Math.max(0, clock.blackMs - delta);
  }

  return newClock;
}

/**
 * Switch active player and credit the increment to the player who just moved.
 * Mirrors src/utils/clock.ts so local and online clocks behave identically.
 */
export function switchClock(clock: ClockState, nextColor: 'white' | 'black', incrementMs: number, now: number): ClockState {
  // The mover is whoever the clock was running for. Before the clock has
  // started there is nothing to deduct, so the mover is simply the opposite of
  // whoever is up next.
  const moverColor = clock.activeColor ?? (nextColor === 'white' ? 'black' : 'white');
  const elapsed =
    clock.isRunning && clock.activeColor && clock.lastTickMs !== null ? now - clock.lastTickMs : 0;

  let newWhiteTime = clock.whiteMs;
  let newBlackTime = clock.blackMs;

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
    ...clock,
    whiteMs: newWhiteTime,
    blackMs: newBlackTime,
    activeColor: isTimeUp ? null : nextColor,
    isRunning: !isTimeUp,
    lastTickMs: isTimeUp ? null : now,
  };
}

export function startClock(clock: ClockState, firstColor: 'white' | 'black', now: number): ClockState {
  if (clock.isRunning) return clock;
  return {
    ...clock,
    activeColor: firstColor,
    isRunning: true,
    lastTickMs: now,
  };
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (!clock.isRunning) return clock;
  const updated = tickClock(clock, now);
  return { ...updated, isRunning: false, activeColor: null, lastTickMs: null };
}

export function checkTimeUp(clock: ClockState): 'white' | 'black' | null {
  if (clock.whiteMs <= 0) return 'white';
  if (clock.blackMs <= 0) return 'black';
  return null;
}

/**
 * Get the current clock state with elapsed time calculated
 * This is the authoritative clock state that accounts for time passed since last tick
 */
export function getCurrentClockState(clock: ClockState, now: number): ClockState {
  return tickClock(clock, now);
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}