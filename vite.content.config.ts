import path from 'path';
import { defineConfig } from 'vite';

/**
 * Build du content script en un seul fichier IIFE pour Chrome MV3.
 * Les content_scripts ne supportent pas les modules ES natifs.
 */
export default defineConfig({
  build: {
    outDir: '.',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'content/core.js'),
      name: 'MangaCentralContent',
      fileName: () => 'content/core.bundle.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    sourcemap: false,
    minify: false, // plus lisible pour debug ; mettre true en prod si besoin
  },
});
