import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Migrated from Create-React-App (react-scripts). Behavior-preserving config:
//  - outDir 'build' matches the Express backend's hardcoded static path
//    (backend/src/server.js serves ../../frontend/build in production).
//  - envPrefix keeps the existing REACT_APP_* variable names working, so the
//    .env files stay untouched (code reads import.meta.env.REACT_APP_*).
//  - dev server pinned to :3000 (strictPort) so it never collides with the
//    backend on :3001 and start-monty.sh's health check keeps working.
export default defineConfig({
  plugins: [react()],
  base: '/',
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
});
