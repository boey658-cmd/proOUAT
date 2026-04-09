import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Port du bot (API /admin). Ajustez si ADMIN_HTTP_PORT diffère dans .env du bot. */
const ADMIN_BACKEND = process.env.VITE_ADMIN_PROXY_TARGET ?? 'http://127.0.0.1:3840';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/admin': { target: ADMIN_BACKEND, changeOrigin: true },
      '/health': { target: ADMIN_BACKEND, changeOrigin: true },
    },
  },
});
