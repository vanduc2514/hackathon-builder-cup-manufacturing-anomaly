// Vite configuration for the technician mobile app: serves on :3001, proxies /api requests (HTTP, SSE and the Gemini Live WebSocket) to the FastAPI backend.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
});
