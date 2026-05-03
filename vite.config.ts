import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api/* to Vercel dev server so local API routes work during Vite dev
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
