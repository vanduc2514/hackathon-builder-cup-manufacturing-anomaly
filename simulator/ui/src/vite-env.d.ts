/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Standalone factory service Cloud Run origin for SSE/REST in production builds; unset in dev. */
  readonly VITE_STREAM_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
