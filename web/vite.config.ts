import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow ngrok / cloudflared tunnels for cross-device dev. Leading dot =
    // subdomain wildcard, e.g. "303d-20-22-50-153.ngrok-free.app" matches.
    allowedHosts: ['.ngrok-free.app', '.trycloudflare.com', '.ngrok.app'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
