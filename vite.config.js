import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

// Identificador distinto en cada compilacion.
//
// Vite nombra cada archivo por el hash de su contenido, asi que compilar dos
// veces el mismo codigo produce exactamente los mismos nombres. Cuando una CDN
// guarda una respuesta mala bajo una de esas direcciones —por ejemplo el HTML
// del index servido donde tenia que ir un .js—, volver a subir el sitio no la
// sustituye: son la misma direccion y sigue entregando lo guardado, con la web
// en blanco y sin ningun error. Al meter este identificador en el nombre, cada
// despliegue estrena direcciones y no puede heredar nada envenenado.
//
// El precio es que cada despliegue obliga a descargar de nuevo todos los
// archivos, aunque no hayan cambiado. Son unos 1,5 MB: barato comparado con
// dejar el sitio caido.
const COMPILACION = Date.now().toString(36);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${COMPILACION}-[hash].js`,
        chunkFileNames: `assets/[name]-${COMPILACION}-[hash].js`,
        assetFileNames: `assets/[name]-${COMPILACION}-[hash][extname]`,
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
