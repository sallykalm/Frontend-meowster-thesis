/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_HOST: string | undefined;
  readonly VITE_API_PORT: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
