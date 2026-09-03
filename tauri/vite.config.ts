import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { changelogPlugin } from '../app/plugins/changelog';

export default defineConfig({
  plugins: [react(), tailwindcss(), changelogPlugin(path.resolve(__dirname, '..'))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../app/src'),
    },
    dedupe: ['@tanstack/react-query', '@tanstack/query-core', 'react', 'react-dom', 'i18next', 'react-i18next'],
  },
  root: path.resolve(__dirname),
  clearScreen: false,
  server: {
    port: 21132,
    strictPort: true,
    watch: {
      ignored: ['!**/../app/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2021',
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tanstack/react-query') || id.includes('@tanstack/query-core')) {
            return 'vendor-tanstack';
          }
        },
      },
    },
  },
});
