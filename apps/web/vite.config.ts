import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.JARVIS_API_URL ?? 'http://127.0.0.1:4310';
const WEB_PORT = Number(process.env.JARVIS_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: 'localhost',
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      // The API is same-origin from the browser's point of view; no CORS needed.
      '/api': { target: API_TARGET },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2023',
  },
});
