/// <reference types="vitest" />
// Vite configuration for the Plant Ops Dashboard: serves on :3000, proxies /api and /health to the FastAPI backend.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';
const factoryTarget = process.env.FACTORY_PROXY_TARGET ?? 'http://localhost:8010';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api/factory': {
        target: factoryTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
  },
});
