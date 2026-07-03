import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Front multi-pages : le formulaire (index) + les pages de retour de paiement.
export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index.html'),
        merci: resolve(__dirname, 'src/merci.html'),
        erreur: resolve(__dirname, 'src/erreur.html'),
      },
    },
  },
  server: { port: 5173 },
});
