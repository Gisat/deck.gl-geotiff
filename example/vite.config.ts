// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: './public',
  resolve: {
    alias: [
      {
        find: '@gisatcz/deckgl-geolib/react',
        replacement: path.resolve(__dirname, '../geoimage/src/react/index.ts'),
      },
      {
        find: '@gisatcz/deckgl-geolib',
        replacement: path.resolve(__dirname, '../geoimage/src/index.ts'),
      },
    ],
    dedupe: [
      '@deck.gl/core',
      '@luma.gl/core',
      '@luma.gl/engine',
      'react',
      'react-dom'
    ]
  },
  // Ensure Vite doesn't try to pre-bundle the library from node_modules
  optimizeDeps: {
    exclude: ['@gisatcz/deckgl-geolib']
  }
});
