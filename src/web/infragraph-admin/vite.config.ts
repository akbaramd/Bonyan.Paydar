import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://localhost:7187',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'https://localhost:7187',
        changeOrigin: true,
        secure: false,
      },
      '/hubs': {
        target: 'https://localhost:7187',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
