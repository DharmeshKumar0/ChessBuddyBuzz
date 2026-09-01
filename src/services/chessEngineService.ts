/**
 * Chess Engine Service
 *
 * Drives Stockfish 18 (WASM) running in a Web Worker.
 *
 * stockfish.js is a "raw engine": you load the script itself as a Worker and
 * speak the UCI text protocol over postMessage. The location of the .wasm blob
 * is passed in the worker URL's hash fragment — without it the engine derives
 * the wasm path from its own script name and 404s.
 */

const DEFAULT_ENGINE_URL =
  '/stockfish/stockfish-18-single.js#/stockfish/stockfish-18-single.wasm';

const ENGINE_URL = import.meta.env.VITE_STOCKFISH_URL || DEFAULT_ENGINE_URL;

/** The UCI handshake includes downloading a large wasm binary on first load. */
const HANDSHAKE_TIMEOUT_MS = 180_000;
/** Head-room added on top of a search's own movetime before we give up. */
const SEARCH_TIMEOUT_SLACK_MS = 60_000;
/**
 * Longest we wait for the `readyok` barrier. Generous, because an `isready`
 * queued behind an in-flight search on this single-threaded build is only
 * answered once that search finishes.
 */
const READY_TIMEOUT_MS = 60_000;

export interface EngineOptions {
  /** Worker URL for the engine script. Must carry the wasm path in its hash. */
  engineUrl?: string;
}

export type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyConfig {
  /** The bot's name, as shown on its player panel and in the setup screens. */
  name: string;
  /** One-line personality blurb shown beside the name. */
  description: string;
  /**
   * The rating advertised to the player. Not the same as `uciElo`: Stockfish's
   * UCI_Elo bottoms out around 1350, so the two weakest bots get their strength
   * from `skillLevel` instead and quote the level they actually play at.
   */
  elo: number;
  skillLevel: number;        // 0-20, Stockfish skill level
  depth: number;             // Search depth limit
  movetime: number;          // Time limit in ms
  uciElo: number;            // UCI Elo rating limit
  uciLimitStrength: boolean; // Whether to limit strength
  /**
   * How long the move should take to appear, search time included. Stronger
   * bots deliberate for longer; the actual wait is jittered inside this window
   * (see `getBotThinkTimeMs`) so the moves land in a human-looking rhythm
   * instead of snapping out the instant the search returns. Keep `movetime` at
   * or below `maxThinkMs`, or a slow search overruns the rhythm it is meant to
   * keep.
   */
  minThinkMs: number;
  maxThinkMs: number;
}

export const DIFFICULTY_LEVELS: Record<DifficultyLevel, DifficultyConfig> = {
  beginner: {
    name: 'ShadowRook',
    description: 'A mysterious, tactical player who strikes from the shadows.',
    elo: 800,
    skillLevel: 2,
    depth: 8,
    movetime: 500,
    uciElo: 1350,
    uciLimitStrength: true,
    minThinkMs: 500,
    maxThinkMs: 1100,
  },
  easy: {
    name: 'GlassKing',
    description: 'Fragile yet daring, perfect for aggressive, risky play.',
    elo: 1200,
    skillLevel: 6,
    depth: 12,
    movetime: 1000,
    uciElo: 1350,
    uciLimitStrength: true,
    minThinkMs: 700,
    maxThinkMs: 1600,
  },
  medium: {
    name: 'SilentKnight64',
    description: 'Quiet, calculating, and always a move ahead.',
    elo: 1600,
    skillLevel: 10,
    depth: 16,
    movetime: 2000,
    uciElo: 1600,
    uciLimitStrength: true,
    minThinkMs: 1000,
    maxThinkMs: 2200,
  },
  hard: {
    name: 'FireBishop',
    description: 'Loves long diagonals and explosive tactics.',
    elo: 2000,
    skillLevel: 14,
    depth: 20,
    movetime: 3000,
    uciElo: 2000,
    uciLimitStrength: true,
    minThinkMs: 1400,
    maxThinkMs: 3000,
  },
  expert: {
    name: 'CenterFortress',
    description: 'Solid, strategic, and hard to break through.',
    elo: 2400,
    skillLevel: 18,
    depth: 24,
    // Was 5000, which put every move a second and a half past the top of this
    // bot's thinking window — the search, not the rhythm, set the pace. Depth 24
    // at skill 18 is still master strength on 3.8 seconds.
    movetime: 3800,
    uciElo: 2400,
    uciLimitStrength: true,
    minThinkMs: 1800,
    maxThinkMs: 3800,
  },
};

/** The bots in the order they are offered, weakest first. */
export const BOT_LADDER: DifficultyLevel[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];

/** Every bot as a flat list, ready to render. */
export function getBots(): (DifficultyConfig & { id: DifficultyLevel })[] {
  return BOT_LADDER.map((id) => ({ id, ...DIFFICULTY_LEVELS[id] }));
}

export function getDifficultyConfig(level: DifficultyLevel): DifficultyConfig {
  return DIFFICULTY_LEVELS[level];
}

/**
 * How long this bot's next move should take to arrive, in milliseconds.
 *
 * The engine answers far faster than its `movetime` budget in simple positions,
 * which is what made the moves feel like teleportation. Callers wait out this
 * target instead of the raw search time, so each bot keeps a steady cadence of
 * its own. Opening moves come out quicker — the way a human rattles off known
 * theory — and settle into the full window by around move eight.
 *
 * @param plyNumber Half-moves played so far.
 */
export function getBotThinkTimeMs(level: DifficultyLevel, plyNumber = 0): number {
  const { minThinkMs, maxThinkMs } = DIFFICULTY_LEVELS[level];
  const openingFactor = plyNumber < 16 ? 0.55 + (0.45 * plyNumber) / 16 : 1;
  const jittered = minThinkMs + Math.random() * (maxThinkMs - minThinkMs);
  return Math.round(jittered * openingFactor);
}

export function getDifficultyEngineConfig(level: DifficultyLevel): EngineConfig {
  const config = DIFFICULTY_LEVELS[level];
  return {
    depth: config.depth,
    movetime: config.movetime,
    skillLevel: config.skillLevel,
    uciElo: config.uciElo,
    uciLimitStrength: config.uciLimitStrength,
    threads: 1,
    hash: 64,
  };
}

export interface EngineConfig {
  /** Search depth limit (1-100) */
  depth?: number;
  /** Time limit in milliseconds */
  movetime?: number;
  /** Number of nodes to search */
  nodes?: number;
  /** Whether to search infinitely until stopped */
  infinite?: boolean;
  /** Skill level (0-20, 20 is strongest) */
  skillLevel?: number;
  /** Number of threads (the single-threaded build ignores this) */
  threads?: number;
  /** Hash size in MB */
  hash?: number;
  /** UCI_Elo rating limit (1350-2850) */
  uciElo?: number;
  /** Limit strength to UCI_Elo */
  uciLimitStrength?: boolean;
  /** MultiPV - number of principal variations to return */
  multiPV?: number;
}

export interface EvaluationData {
  /** Centipawns, always from white's perspective. */
  score: number;
  /** Mate in N moves, from white's perspective (positive = white mates). */
  mate?: number;
  depth: number;
  selDepth?: number;
  nodes: number;
  nps: number;
  time: number;
  pv: string[];
}

/** One principal variation from a MultiPV search. */
export interface EnginePvLine {
  /** 1-based MultiPV rank. */
  multipv: number;
  /** Centipawns from white's perspective. */
  score: number;
  /** Mate in N from white's perspective, if the line is forced mate. */
  mate?: number;
  depth: number;
  /** Moves in UCI format. */
  pv: string[];
  /** First move of the line, UCI format. */
  bestMove: string;
}

export interface EngineMove {
  /** Best move in UCI format (e.g., "e2e4") */
  bestMove: string;
  /** Ponder move in UCI format */
  ponderMove: string | null;
  /** Verbatim engine output for the deciding info line plus the bestmove line. */
  raw: string;
  /** Final evaluation, normalised to white's perspective. */
  evaluation: EvaluationData | null;
  /** All MultiPV lines seen at the deepest completed depth. */
  lines: EnginePvLine[];
}

export interface EngineInfo {
  depth?: number;
  selDepth?: number;
  /** Centipawns from white's perspective. */
  score?: number;
  /** Mate in N from white's perspective. */
  mate?: number;
  multipv?: number;
  nodes?: number;
  nps?: number;
  time?: number;
  pv?: string[];
  /** Raw info string */
  raw: string;
}

export type EngineCallback = (info: EngineInfo) => void;
export type EngineErrorCallback = (error: Error) => void;

interface PendingSearch {
  resolve: (value: EngineMove) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /** Latest info line per MultiPV index for the deepest depth seen. */
  lines: Map<number, EnginePvLine>;
  lastInfoRaw: string;
  lastEvaluation: EvaluationData | null;
}

interface PendingHandshake {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One caller blocked on the `readyok` barrier. */
interface ReadyWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class ChessEngineService {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private engineUrl: string;

  private onInfoCallback: EngineCallback | null = null;
  private onEvaluationCallback: ((evaluation: EvaluationData) => void) | null = null;

  private config: EngineConfig = {};
  private currentEvaluation: EvaluationData | null = null;

  /** Pending `go`. Only one search may run at a time on a single engine. */
  private search: PendingSearch | null = null;
  private uciHandshake: PendingHandshake | null = null;
  private readyWaiters: ReadyWaiter[] = [];

  /**
   * Side to move for the position currently loaded in the engine. Stockfish
   * reports scores relative to the side to move; we normalise to white.
   */
  private sideToMove: 'white' | 'black' = 'white';

  constructor(options: EngineOptions = {}) {
    this.engineUrl = options.engineUrl || ENGINE_URL;
  }

  /** Boot the worker and complete the UCI handshake. Idempotent. */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(this.engineUrl);
      } catch (error) {
        this.initializationPromise = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      this.worker = worker;

      /**
       * Tear the engine back down to an uninitialised state. Without this a
       * failed boot leaks a worker that has already started fetching the wasm,
       * and a post-handshake crash leaves the service looking initialised while
       * every command is posted into the void.
       */
      const fail = (error: Error) => {
        const handshake = this.uciHandshake;
        this.uciHandshake = null;
        if (handshake) clearTimeout(handshake.timer);

        this.initializationPromise = null;
        this.isInitialized = false;
        this.currentEvaluation = null;

        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;

        // A no-op once the boot promise has already settled.
        reject(error);
      };

      worker.onmessage = (event: MessageEvent) => this.handleLine(event.data);
      worker.onerror = (event: ErrorEvent) => {
        const error = new Error(`Stockfish worker error: ${event.message}`);
        this.failAllPending(error);
        fail(error);
      };

      const timer = setTimeout(
        () => fail(new Error('Stockfish did not respond to the UCI handshake in time')),
        HANDSHAKE_TIMEOUT_MS,
      );

      this.uciHandshake = {
        resolve: () => {
          this.isInitialized = true;
          resolve();
        },
        reject,
        timer,
      };

      try {
        this.post('uci');
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return this.initializationPromise;
  }

  private post(command: string): void {
    if (!this.worker) throw new Error('Engine worker is not running');
    this.worker.postMessage(command);
  }

  private async ensureReady(): Promise<void> {
    await this.initialize();
    // `isready`/`readyok` is the UCI barrier that guarantees prior commands
    // (setoption, position) have been fully applied.
    await new Promise<void>((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          // Drop the waiter first so a late `readyok` can't settle it twice.
          this.readyWaiters = this.readyWaiters.filter((w) => w !== waiter);
          reject(new Error('Stockfish did not answer `isready` in time'));
        }, READY_TIMEOUT_MS),
      };

      this.readyWaiters.push(waiter);

      try {
        this.post('isready');
      } catch (error) {
        clearTimeout(waiter.timer);
        this.readyWaiters = this.readyWaiters.filter((w) => w !== waiter);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Handle one line of engine output. */
  private handleLine(data: unknown): void {
    // stockfish.js emits strings; be tolerant of wrappers.
    const line =
      typeof data === 'string'
        ? data
        : typeof data === 'object' && data !== null && 'data' in data
          ? String((data as { data: unknown }).data)
          : String(data);

    const msg = line.trim();
    if (!msg) return;

    if (msg === 'uciok') {
      const handshake = this.uciHandshake;
      this.uciHandshake = null;
      if (handshake) {
        clearTimeout(handshake.timer);
        handshake.resolve();
      }
      return;
    }

    if (msg === 'readyok') {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      return;
    }

    if (msg.startsWith('info ')) {
      this.handleInfo(msg);
      return;
    }

    if (msg.startsWith('bestmove')) {
      this.handleBestMove(msg);
      return;
    }
  }

  private handleInfo(msg: string): void {
    const info = this.parseInfo(msg);

    // Ignore the low-value "currmove" progress spam.
    if (info.depth === undefined) return;

    if (this.onInfoCallback) this.onInfoCallback(info);

    if (info.score !== undefined || info.mate !== undefined) {
      const evaluation: EvaluationData = {
        score: info.score ?? 0,
        mate: info.mate,
        depth: info.depth,
        selDepth: info.selDepth,
        nodes: info.nodes ?? 0,
        nps: info.nps ?? 0,
        time: info.time ?? 0,
        pv: info.pv ?? [],
      };

      const multipv = info.multipv ?? 1;

      // Only the primary variation describes the position. The remaining
      // MultiPV lines are strictly worse alternatives and must not overwrite
      // the headline evaluation.
      if (multipv === 1) {
        this.currentEvaluation = evaluation;
        if (this.onEvaluationCallback) this.onEvaluationCallback(evaluation);
      }

      const search = this.search;
      if (search) {
        if (multipv === 1) {
          search.lastInfoRaw = msg;
          search.lastEvaluation = evaluation;
        }

        const pv = info.pv ?? [];
        if (pv.length > 0) {
          const existing = search.lines.get(multipv);
          // Keep only the deepest line per MultiPV slot.
          if (!existing || existing.depth <= info.depth) {
            search.lines.set(multipv, {
              multipv,
              score: info.score ?? 0,
              mate: info.mate,
              depth: info.depth,
              pv,
              bestMove: pv[0],
            });
          }
        }
      }
    }
  }

  private handleBestMove(msg: string): void {
    const search = this.search;
    if (!search) return;
    this.search = null;
    clearTimeout(search.timer);

    const parts = msg.split(/\s+/);
    const bestMove = parts[1] ?? '';
    const ponderIndex = parts.indexOf('ponder');
    const ponderMove = ponderIndex !== -1 ? (parts[ponderIndex + 1] ?? null) : null;

    if (!bestMove || bestMove === '(none)') {
      search.reject(new Error('Engine returned no legal move for this position'));
      return;
    }

    const lines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv);

    search.resolve({
      bestMove,
      ponderMove,
      raw: search.lastInfoRaw ? `${search.lastInfoRaw}\n${msg}` : msg,
      evaluation: search.lastEvaluation,
      lines,
    });
  }

  /**
   * Parse a Stockfish `info` line. Scores are converted from side-to-move
   * relative (what UCI reports) to white relative (what callers expect).
   */
  private parseInfo(raw: string): EngineInfo {
    const info: EngineInfo = { raw };
    const parts = raw.split(/\s+/);
    const perspective = this.sideToMove === 'white' ? 1 : -1;

    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          info.depth = parseInt(parts[++i], 10);
          break;
        case 'seldepth':
          info.selDepth = parseInt(parts[++i], 10);
          break;
        case 'multipv':
          info.multipv = parseInt(parts[++i], 10);
          break;
        case 'score':
          // `score cp <n>` or `score mate <n>`, optionally + lowerbound/upperbound
          if (parts[i + 1] === 'cp') {
            info.score = parseInt(parts[i + 2], 10) * perspective;
            i += 2;
          } else if (parts[i + 1] === 'mate') {
            info.mate = parseInt(parts[i + 2], 10) * perspective;
            // Give mate a saturating centipawn value so eval bars still work.
            info.score = (info.mate > 0 ? 1 : -1) * 10_000;
            i += 2;
          }
          break;
        case 'nodes':
          info.nodes = parseInt(parts[++i], 10);
          break;
        case 'nps':
          info.nps = parseInt(parts[++i], 10);
          break;
        case 'time':
          info.time = parseInt(parts[++i], 10);
          break;
        case 'pv':
          info.pv = parts.slice(i + 1);
          i = parts.length;
          break;
      }
    }

    return info;
  }

  /** Apply engine options. */
  async setConfig(config: EngineConfig): Promise<void> {
    await this.initialize();
    this.config = { ...this.config, ...config };

    const options: Array<[string, string | number | boolean]> = [];
    if (config.threads !== undefined) options.push(['Threads', config.threads]);
    if (config.hash !== undefined) options.push(['Hash', config.hash]);
    if (config.multiPV !== undefined) options.push(['MultiPV', config.multiPV]);
    // UCI_LimitStrength must be set before UCI_Elo takes effect.
    if (config.uciLimitStrength !== undefined) {
      options.push(['UCI_LimitStrength', config.uciLimitStrength]);
    }
    if (config.uciElo !== undefined) options.push(['UCI_Elo', config.uciElo]);
    if (config.skillLevel !== undefined) options.push(['Skill Level', config.skillLevel]);

    for (const [name, value] of options) {
      this.post(`setoption name ${name} value ${value}`);
    }

    await this.ensureReady();
  }

  /** Load a position from FEN. */
  async setPosition(fen: string): Promise<void> {
    await this.initialize();
    // Track side to move so we can normalise scores to white's perspective.
    const turnField = fen.split(/\s+/)[1];
    this.sideToMove = turnField === 'b' ? 'black' : 'white';
    this.post(`position fen ${fen}`);
    await this.ensureReady();
  }

  /** Load a position by replaying moves from the initial position. */
  async setPositionFromMoves(moves: string[]): Promise<void> {
    await this.initialize();
    this.sideToMove = moves.length % 2 === 0 ? 'white' : 'black';
    this.post(
      moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos',
    );
    await this.ensureReady();
  }

  /** Search the current position and resolve when the engine reports bestmove. */
  async go(config?: EngineConfig): Promise<EngineMove> {
    await this.initialize();

    if (this.search) {
      throw new Error('A search is already in progress; call stop() first');
    }

    const searchConfig = { ...this.config, ...config };

    let command = 'go';
    if (searchConfig.infinite) {
      command += ' infinite';
    } else {
      if (searchConfig.depth) command += ` depth ${searchConfig.depth}`;
      if (searchConfig.movetime) command += ` movetime ${searchConfig.movetime}`;
      if (searchConfig.nodes) command += ` nodes ${searchConfig.nodes}`;
      if (command === 'go') command += ' depth 12';
    }

    return new Promise<EngineMove>((resolve, reject) => {
      const budget = searchConfig.infinite
        ? HANDSHAKE_TIMEOUT_MS
        : (searchConfig.movetime ?? 0) + SEARCH_TIMEOUT_SLACK_MS;

      const timer = setTimeout(() => {
        this.search = null;
        // Nudge the engine so it isn't left searching forever.
        try {
          this.post('stop');
        } catch {
          /* worker already gone */
        }
        reject(new Error('Engine search timed out'));
      }, budget);

      this.search = {
        resolve,
        reject,
        timer,
        lines: new Map(),
        lastInfoRaw: '',
        lastEvaluation: null,
      };

      try {
        this.post(command);
      } catch (error) {
        clearTimeout(timer);
        this.search = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Ask the engine to stop searching. The in-flight `go` still resolves. */
  async stop(): Promise<void> {
    if (!this.worker || !this.isInitialized) return;
    this.post('stop');
  }

  /** Reset engine state between games (clears hash, killers, etc.). */
  async newGame(): Promise<void> {
    await this.initialize();
    this.post('ucinewgame');
    await this.ensureReady();
  }

  /** Convenience: load a FEN and search it. */
  async getBestMove(fen: string, config?: EngineConfig): Promise<EngineMove> {
    await this.setPosition(fen);
    return this.go(config);
  }

  onInfo(callback: EngineCallback | null): void {
    this.onInfoCallback = callback;
  }

  onEvaluation(callback: ((evaluation: EvaluationData) => void) | null): void {
    this.onEvaluationCallback = callback;
  }

  getCurrentEvaluation(): EvaluationData | null {
    return this.currentEvaluation;
  }

  clearEvaluation(): void {
    this.currentEvaluation = null;
  }

  private failAllPending(error: Error): void {
    const search = this.search;
    this.search = null;
    if (search) {
      clearTimeout(search.timer);
      search.reject(error);
    }

    const handshake = this.uciHandshake;
    this.uciHandshake = null;
    if (handshake) {
      clearTimeout(handshake.timer);
      handshake.reject(error);
    }

    // Fail anything waiting on `readyok` rather than letting it hang, and
    // rather than resolving it as though the barrier had actually been met.
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  terminate(): void {
    this.failAllPending(new Error('Engine terminated'));
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initializationPromise = null;
    this.currentEvaluation = null;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
let engineInstance: ChessEngineService | null = null;

export function getEngineService(options?: EngineOptions): ChessEngineService {
  if (!engineInstance) {
    engineInstance = new ChessEngineService(options);
  }
  return engineInstance;
}

export function resetEngineService(): void {
  if (engineInstance) {
    engineInstance.terminate();
    engineInstance = null;
  }
}

export { ChessEngineService };
