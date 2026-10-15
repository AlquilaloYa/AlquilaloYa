import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const firebaseConfigured = existsSync(
  fileURLToPath(new URL('android/app/google-services.json', import.meta.url)),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_FCM_CONFIGURED': JSON.stringify(
      firebaseConfigured ? 'true' : 'false',
    ),
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.FIELDOPS_ERP_ORIGIN || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
