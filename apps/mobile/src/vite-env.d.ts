/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloud Run origin for SSE/WebSocket in production builds; unset in dev (Vite proxy). */
  readonly VITE_STREAM_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
