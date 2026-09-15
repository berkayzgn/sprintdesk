import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: '.',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // Kaynak haritası yayınlanmaz: DevTools'ta orijinal dosyalar/yorumlar görünmez
    sourcemap: false,
  },
  esbuild: mode === 'production'
    ? { drop: ['console', 'debugger'], legalComments: 'none' }
    : {},
}));
