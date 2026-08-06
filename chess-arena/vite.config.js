import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // GitHub Pages project site serves at https://<user>.github.io/<repo>/
  // so all asset URLs need that repo name as a base path.
  // If you deploy to your own domain or a Pages "user/org site" (root domain),
  // change this back to '/'.
  base: '/chess-arena/',

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