import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('echarts') || id.includes('zrender')) return 'charts';
          if (id.includes('node_modules/react') || id.includes('scheduler')) return 'react';
        },
      },
    },
  },
});
