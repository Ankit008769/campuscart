import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The student website. It talks to the same Supabase project as the app, through @campuscart/core;
// there is no server of its own, so `vite build` produces plain files for any static host.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
