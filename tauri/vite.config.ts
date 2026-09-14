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
        // Same code-splitting map as app/vite.config.ts so both shells ship
        // identical chunking. Page-chunk rules match app/src paths via the
        // '@' alias. Module ids are absolute; `src/components/...` matches
        // the app tree in both workspaces.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('@tanstack/react-query') || id.includes('@tanstack/react-router') || id.includes('@tanstack/query-core')) return 'vendor-tanstack';
          if (id.includes('framer-motion') || id.includes('node_modules/motion')) return 'vendor-ui';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          if (id.includes('zustand')) return 'vendor-state';
          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) return 'vendor-forms';
          if (id.includes('react-markdown') || id.includes('remark-')) return 'vendor-markdown';
          if (id.includes('react-syntax-highlighter')) return 'vendor-syntax';
          if (id.includes('wavesurfer')) return 'vendor-wavesurfer';
          if (id.includes('src/components/Store')) return 'page-store';
          if (id.includes('src/features/audioStudio')) return 'page-audio-studio';
          if (id.includes('src/components/Workspace')) return 'page-workspace';
        },
      },
    },
  },
});
