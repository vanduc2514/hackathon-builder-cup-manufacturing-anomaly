// Vite configuration for the standalone 3D System Topology demo (:3003, no backend).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    strictPort: true,
  },
  preview: {
    port: 3003,
    strictPort: true,
  },
});
