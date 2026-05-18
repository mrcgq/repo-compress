

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',

  // 修改这里：改为 './' 即可，它会自动适配任何路径
  base: './', 

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },

  server: {
    open: true,
  },
});











