/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected at build time by vite.config.ts `define`.
declare const __APP_VERSION__: string
declare const __APP_BUILD__: string
declare const __APP_VERSION_LABEL__: string
