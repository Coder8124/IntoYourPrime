import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Run `vercel dev` (default :3000) so /api/analyze works during Vite dev.
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
