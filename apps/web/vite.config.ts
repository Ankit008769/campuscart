import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The student and shop website. It talks to the same Supabase project as the app, through
// @campuscart/core; there is no server of its own, so `vite build` produces plain files for any host.
//
// Production builds publish as little as possible: minified, no source maps, no comments of any kind
// (license banners included), and no console logging or debugger statements.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    sourcemap: false,
    minify: true,
    rolldownOptions: {
      output: {
        comments: false,
        minify: { compress: { dropConsole: true, dropDebugger: true } },
      },
    },
  },
});
