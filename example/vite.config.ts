// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: './public',
  resolve: {
    alias: {
      // Maps the package name directly to the source index file
      '@gisatcz/deckgl-geolib': path.resolve(__dirname, '../geoimage/src/index.ts'),
    },
  },
  // Ensure Vite doesn't try to pre-bundle the library from node_modules
  optimizeDeps: {
    exclude: ['@gisatcz/deckgl-geolib']
  }
});
