import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local dev only: the built app is served by Fastify in prod.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    // terser compresses the shared vendor chunk (React/react-router-dom/
    // @tanstack/react-query) noticeably tighter than esbuild's default
    // minifier — needed to keep the guest-flow bundle under the ADR-029
    // 200KB gzipped budget.
    minify: 'terser',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
