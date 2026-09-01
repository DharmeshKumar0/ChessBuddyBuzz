# chess-app

A browser chess app. Four things it does:

- **Local two-player** — both sides on one board, one device.
- **Play vs Stockfish** — Stockfish 18 compiled to WebAssembly, running in a Web Worker in the
  page. Five difficulty presets (`beginner`, `easy`, `medium`, `hard`, `expert`) that set Stockfish's
  `Skill Level`, `UCI_Elo`, search depth and movetime.
- **Analysis board** — load a PGN or FEN, step through moves, run a MultiPV search on the current
  position, or review a whole game move-by-move and get per-move classifications
  (best / good / inaccuracy / mistake / blunder), plus PGN export.
- **Online multiplayer** — an authoritative Express + Socket.IO server owns the game state. Clients
  send `from`/`to`/`promotion`; the server validates the move, updates the board and the clocks, and
  broadcasts the result. Games are joined with a short room code. Draw offers, resignation,
  disconnect/reconnect and server-side clock sync are all handled.

The board, move list, clocks and settings are React components; game state lives in Zustand stores.
Settings persist to `localStorage`.

## Stack

Versions are the ranges declared in `package.json` / `server/package.json`.

Front end:

| Package | Version |
|---|---|
| React | ^19.2.8 (`react`, `react-dom`) |
| Vite | ^8.2.0 with `@vitejs/plugin-react` ^6.0.4 |
| TypeScript | ~6.0.2 |
| Tailwind CSS | ^4.3.3 via `@tailwindcss/vite` |
| Zustand | ^5.0.15 |
| React Router | ^7.18.2 (`react-router-dom`) |
| Socket.IO client | ^4.8.3 |
| Icons | `lucide-react` ^1.31.0 |
| Lint | `oxlint` ^1.75.0 |
| Stockfish | `stockfish` ^18.0.8 (see [Chess engine](#chess-engine-stockfish)) |

Server (`server/`, separate `package.json` and lockfile):

| Package | Version |
|---|---|
| Express | ^4.19.2 |
| Socket.IO | ^4.7.5 |
| cors | ^2.8.5 |
| uuid | ^10.0.0 |
| TypeScript | ^5.6.2 |
| Dev runner | `tsx` ^4.19.0 |

## Prerequisites

- Node.js and npm. Neither `package.json` declares an `engines` range, so nothing is enforced, but
  Vite 8 and `tsx` both need a current Node LTS — use the latest LTS you have.
- Both projects have a committed `package-lock.json`, so `npm ci` works if you want reproducible
  installs.
- A browser with WebAssembly support. The engine downloads a large `.wasm` on first use; see below.

## Install and run

The front end and the server are two separate npm projects. Install both.

Front end dependencies:

```bash
npm install
```

Server dependencies:

```bash
cd server && npm install
```

Start the Vite dev server (defaults to <http://localhost:5173>):

```bash
npm run dev
```

Start the multiplayer server in watch mode (defaults to port 3001):

```bash
cd server && npm run dev
```

You only need the server for online multiplayer. Local play, play-vs-Stockfish and the analysis
board all work with the front end alone.

Production build of the front end (runs `tsc -b` first, then `vite build`, output in `dist/`):

```bash
npm run build
```

Serve that build locally to check it:

```bash
npm run preview
```

Compile the server to `server/dist/` and run the compiled output:

```bash
cd server && npm run build
```

```bash
cd server && npm start
```

The server's entry point is `server/src/index.ts` (compiled to `server/dist/index.js`, which is also
its `main`). It exposes a single HTTP route, `GET /health`, returning
`{ status: 'ok', timestamp }`; everything else is Socket.IO.

## Environment variables

### Front end

Copy `.env.example` to `.env` and edit as needed.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:3001` | Origin of the Socket.IO multiplayer server. |

Vite **inlines `VITE_*` variables at build time**. Changing `VITE_SERVER_URL` requires a rebuild (or
a dev server restart) — it is not read at runtime, so you cannot point a prebuilt `dist/` at a
different server by setting an environment variable on the host.

Only variables prefixed `VITE_` are exposed to client code; anything you put in `.env` without that
prefix stays out of the bundle. `VITE_SERVER_URL` is typed in `src/vite-env.d.ts`.

### Server

Copy `server/.env.example` to `server/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Port the HTTP + Socket.IO server listens on. |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated list of browser origins allowed to connect. |

Set `CORS_ORIGINS` to your deployed front end's origin in production; the defaults only cover local
development.

## Project layout

```
index.html                 Vite entry
vite.config.ts             react + tailwind plugins, nothing else
tsconfig.json              solution file -> tsconfig.app.json (src/), tsconfig.node.json (vite.config.ts)
.oxlintrc.json             oxlint config
public/
  favicon.svg, icons.svg
  stockfish/               engine script + wasm, served at /stockfish/*
src/
  main.tsx                 createRoot + StrictMode
  App.tsx                  BrowserRouter: "/" -> GamePage, "/analysis" -> AnalysisPage
  index.css                Tailwind entry + global base styles
  chess/                   rules engine (pure TS, no React)
    board.ts               initial board, files/ranks, piece values, captured-piece tally
    moves.ts               per-piece move generation
    check.ts               king location, attacked squares, legal-move filtering
    castling.ts            castling rights and the rook/king board update
    draw.ts                position keys (repetition), insufficient material
    fen.ts                 FEN parse/generate
    san.ts                 SAN generation
    pgn.ts                 PGN import/export
    types.ts               Board, Piece, Move, GameStatus, CastlingRights, ...
    index.ts               public surface of the module
  store/                   Zustand stores
    useChessStore.ts       the live game: board, turn, history, clocks, promotion,
                           draw offers, engine moves, online-game wiring
    useAnalysisStore.ts    analysis board: navigation, engine search, whole-game review
    useSettingsStore.ts    persisted settings (appearance, board, gameplay, sound, computer)
    index.ts               re-exports
  services/
    chessEngineService.ts  Stockfish Web Worker + UCI protocol, difficulty presets
    multiplayerService.ts  typed Socket.IO client and event bridge
  components/
    chess/                 ChessBoard, Square, ChessPiece, piece SVGs
    game/                  clocks, move history, player panels, evaluation bar and engine
                           readout, promotion / settings / game-over / join-game modals,
                           new-game and online-game setup, connection status
    layout/                Header, Layout
  utils/
    clock.ts               time-control table, increment handling, formatting
    sound.ts               WebAudio move/capture/check/game-end sounds
server/
  tsconfig.json            outDir ./dist, rootDir ./src, NodeNext
  src/
    index.ts               Express + Socket.IO wiring, all socket handlers,
                           clock-sync and room-cleanup intervals
    game/GameRoomManager.ts  rooms, join/leave/reconnect, move application,
                             game-end detection, draw offers, resignation
    chess/                 the server's own rules code (board, moves, fen, types)
    utils/clock.ts         server-side clock state
```

Both `GamePage` and `AnalysisPage` bind keyboard shortcuts: left/right arrow to step through moves,
`Home`/`End` to jump to the start/end, `f` to flip the board. They are suppressed while a text input
is focused or a modal is open.

Time controls (shared list, defined in `src/utils/clock.ts` and again in `server/src/utils/clock.ts`):
`1+0`, `2+1`, `3+0`, `3+2`, `5+0`, `5+3`, `10+0`, `10+5`, `15+10`, `30+0`.

## Chess engine (Stockfish)

`src/services/chessEngineService.ts` talks to Stockfish directly. There is no wrapper worker and no
adapter library:

- The engine is Stockfish 18 compiled to WebAssembly. The build shipped in `public/stockfish/` is
  the **single-threaded** flavour, which avoids needing `SharedArrayBuffer` and therefore avoids
  having to serve the app with cross-origin isolation (COOP/COEP) headers.
- The service creates a `Worker` from the engine script itself, with the `.wasm` path in the URL's
  **hash fragment**:

  ```
  /stockfish/stockfish-18-single.js#/stockfish/stockfish-18-single.wasm
  ```

  That hash convention is required by stockfish.js. Without it the engine derives the wasm path from
  its own script name and requests the wrong URL, and startup fails with a 404. If you rename or
  relocate either file, both halves of that string have to change together.
- Communication is the raw **UCI text protocol** over `postMessage` — `uci`, `isready`,
  `setoption name ... value ...`, `position fen ...`, `go depth ... movetime ...` — and the service
  parses the `info` / `bestmove` lines back into `EvaluationData`, `EnginePvLine` and `EngineMove`.
  Scores are normalised to White's perspective before they leave the service, so the UI never has to
  reason about whose turn it is when rendering an evaluation.
- Difficulty presets map to `Skill Level`, `UCI_Elo`, `UCI_LimitStrength`, `depth` and `movetime`
  (`DIFFICULTY_LEVELS` in the same file). `Threads` is 1 and `Hash` is 64 MB.

### The wasm binary is very large

`public/stockfish/stockfish-18-single.wasm` is **112,992,459 bytes (~113 MB)**. That is the full
Stockfish NNUE build with the big network embedded.

This matters twice over:

- **Shipping it.** Every visitor who plays the computer or opens the analysis board downloads it
  before the engine answers. The UCI handshake timeout in the service is deliberately set to 180
  seconds to survive that download on a slow connection. Make sure your host serves it compressed
  and with a long-lived cache header.
- **Committing it.** A ~113 MB binary in version control is permanent once pushed and makes clones
  painful. `.gitignore` deliberately does **not** ignore `public/`, because the app cannot start
  without this file — but that means initialising a repo here commits the binary as-is. Better
  arrangements, none of which are implemented: Git LFS, or a `postinstall` script that copies the
  file out of `node_modules/stockfish/bin/` into `public/stockfish/` and leaves it untracked.

The files in `public/stockfish/` are copies of `node_modules/stockfish/bin/stockfish-18-single.js`
and `.wasm`. That same package also ships much smaller **"lite"** builds:
`stockfish-18-lite-single.wasm` is 7,295,411 bytes (~7 MB) — roughly 1/15th the size — using a
smaller neural network in exchange for some playing strength. For an app whose hardest preset is
capped at 2400 Elo with `UCI_LimitStrength` on, the lite build is almost certainly the right trade,
and most projects should prefer it. Switching means copying `stockfish-18-lite-single.js` and
`stockfish-18-lite-single.wasm` into `public/stockfish/` and updating `DEFAULT_ENGINE_URL` in
`chessEngineService.ts` so both the script name and the hash fragment point at the new pair.

## Scripts

Front end (`package.json`):

| Script | Command | What it does |
|---|---|---|
| `dev` | `vite` | Dev server with HMR. |
| `build` | `tsc -b && vite build` | Typecheck the project references, then build to `dist/`. |
| `lint` | `oxlint` | Lint using `.oxlintrc.json`. |
| `preview` | `vite preview` | Serve the built `dist/` locally. |

Server (`server/package.json`):

| Script | Command | What it does |
|---|---|---|
| `dev` | `tsx watch src/index.ts` | Run the server from TypeScript, restarting on change. |
| `build` | `tsc` | Compile `src/` to `dist/`. |
| `start` | `node dist/index.js` | Run the compiled server. |

There is no root script that starts both processes; run them in two terminals.

## Known limitations

- **The chess rules engine is implemented twice.** `src/chess/` is the client's rules engine and
  `server/src/chess/` is a second, independent implementation used by the authoritative server. They
  share no code — not even types — and they are not identical: the client splits check, castling and
  draw detection into their own modules and has SAN and PGN support, while the server folds SAN into
  `fen.ts`, keeps legality filtering inside `moves.ts`, and puts repetition and
  insufficient-material checks in `GameRoomManager`. `src/utils/clock.ts` and
  `server/src/utils/clock.ts` are likewise near-duplicates, including the time-control table. Any
  rules fix has to be made in both places or the two will disagree about a position — the client will
  offer a move the server rejects, or show a different game result. This duplication is real and
  currently unresolved.
- **No automated tests.** There is no test runner configured, no test script, and no test files.
  Every change is verified by hand.
- **Not a git repository.** The working tree is not under version control at the moment, so there is
  no history, no branches and no way to diff or revert. The `.gitignore` is present and correct for
  when it is initialised.
- **No persistence on the server.** Rooms live in memory in `GameRoomManager` and a cleanup interval
  discards stale ones. Restarting the server loses every in-progress game.
- **No accounts or matchmaking.** Online play is code-based: one player creates a game and shares the
  generated room code. Player names are whatever the client sends; nothing is authenticated. The
  ratings shown next to the player panels in local play are placeholders.
- **Move review is coarse.** Classification is a pure centipawn-delta bucket at a fixed depth 15,
  with no notion of sacrifices, forced sequences or opening theory. `MoveClassification` also
  declares a `'brilliant'` case that the review loop never assigns.
