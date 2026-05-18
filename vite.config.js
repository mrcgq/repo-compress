import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web', // 保持这一行
  base: './',      // 保持相对路径
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 强制所有生成的 JS 和 CSS 都在 dist 根目录，不要进子文件夹
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
});







