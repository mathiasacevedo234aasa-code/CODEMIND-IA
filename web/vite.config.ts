import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Todo lo que toca Groq o el disco pasa por el backend.
      '/api': { target: 'http://localhost:5174', changeOrigin: true },
    },
  },
  // El analizador en segundo plano carga gramáticas con import(): eso solo
  // funciona si el trabajador se empaqueta como módulo.
  worker: { format: 'es' },
  build: {
    // Monaco solo ya pasa del aviso por defecto; los trozos se separan a mano
    // para que la aplicación no sea un único archivo de varios megabytes y lo
    // que no cambia entre versiones se aproveche de la caché.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Los ayudantes de Vite (precarga, interoperabilidad) van aparte: si
          // caen dentro del trozo de Monaco, la página de inicio lo descarga
          // entero solo para usarlos.
          if (id.includes('preload-helper') || id.includes('commonjsHelpers')) return 'ayudas';
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('monaco-editor') || id.includes('emmet-monaco')) return 'monaco';
          if (id.includes('@babel')) return 'babel';
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('react') || id.includes('scheduler') || id.includes('zustand')) return 'react';
          return undefined;
        },
      },
    },
  },
});
