

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',

  // 加这一行！把 /repo-compress/ 改成你的仓库名
  base: '/repo-compress/',

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },

  server: {
    open: true,
  },
});
