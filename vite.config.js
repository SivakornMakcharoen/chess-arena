import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Both pages live at the project root, same as the original static files.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        checkers: resolve(__dirname, 'checkers.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
