/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Socket.IO multiplayer server, e.g. http://localhost:3001 */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
