import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Site isolado do app Electron: build proprio, sem qualquer dependencia do
// player. `base: './'` deixa o build funcionar tanto hospedado em raiz
// quanto em subpasta (ex.: GitHub Pages de projeto).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three.js/r3f/drei/framer-motion mudam pouco entre deploys — num
        // chunk proprio, o navegador reaproveita o cache mesmo quando so o
        // codigo do site (App/sections) mudar.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
