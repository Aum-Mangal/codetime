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
    port: 5173,
    host: true,
  },
  worker: {
    format: 'es',
    plugins: () => [tailwindcss()],
  },
});
