/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ERP_API_URL?: string
  readonly VITE_FCM_CONFIGURED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
