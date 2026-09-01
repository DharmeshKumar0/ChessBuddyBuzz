/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Socket.IO multiplayer server, e.g. http://localhost:3001 */
  readonly VITE_SERVER_URL?: string;
  /**
   * External URL for Stockfish WASM engine.
   * Must include the .wasm path in the hash fragment.
   * Example: https://cdn.example.com/stockfish-18-single.js#https://cdn.example.com/stockfish-18-single.wasm
   */
  readonly VITE_STOCKFISH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
