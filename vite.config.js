import { defineConfig } from 'vite';

export default defineConfig({
  root:  'src/web',
  base:  './',
  build: {
    outDir:     '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    // 让 src/web/app.js 里的 import '../core/...' 能被 Vite 正确解析
    alias: {},
  },
});
