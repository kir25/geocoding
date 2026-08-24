import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // One .env at the repo root serves both workspaces, so there is a single
  // place to change the database URL and the API URL together.
  envDir: '..',
  server: {
    port: 5173,
    // Proxying keeps the browser on one origin in development, so CORS never
    // enters the picture and VITE_API_URL can stay a relative path.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
