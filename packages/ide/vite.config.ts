import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@codetime/compiler': path.resolve(__dirname, '../compiler/src/index.ts'),
    },
  },
  server: {
    // Bound to localhost only; pass `--host` explicitly to expose it on a network.
    port: 5173,
    fs: {
      // Allow importing the shared example programs from the repo root.
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  worker: {
    format: 'es',
  },
});
