import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@codetime/compiler': path.resolve(__dirname, '../compiler/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  worker: {
    format: 'es',
  },
});
