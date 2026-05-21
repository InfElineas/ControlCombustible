import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React ecosystem must stay together to avoid cross-chunk hook/context issues
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (id.includes('@supabase/')) return 'vendor-supabase';
          if (id.includes('@radix-ui/')) return 'vendor-ui';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) return 'vendor-charts';
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('html2canvas')) return 'vendor-canvas';
          if (id.includes('exceljs')) return 'vendor-excel';
        },
      },
    },
  },
});
