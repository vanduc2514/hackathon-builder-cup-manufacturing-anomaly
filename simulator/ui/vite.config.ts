import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
    proxy: {
      '/api/auth': { target: process.env.API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true },
      '/api': { target: process.env.FACTORY_API_TARGET || 'http://localhost:8010', changeOrigin: true },
      '/health': { target: process.env.FACTORY_API_TARGET || 'http://localhost:8010', changeOrigin: true },
    },
  },
  preview: { port: 3002, strictPort: true },
});
