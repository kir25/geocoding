/// <reference types="vite/client" />

/**
 * Declares import.meta.env and the asset-import modules Vite resolves at build
 * time — image imports and VITE_* variables are not part of the base TS lib.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
