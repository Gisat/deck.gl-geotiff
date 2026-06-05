// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Custom plugin to handle web-worker: imports (convert to Vite ?worker syntax)
const webWorkerVitePlugin = {
  name: 'web-worker-handler',
  resolveId(id, importer) {
    if (id.startsWith('web-worker:')) {
      // Extract the relative path from web-worker: prefix
      const relativePath = id.replace(/^web-worker:/, '');
      
      // Resolve relative to the importing file
      if (importer) {
        const importerDir = path.dirname(importer);
        const resolvedPath = path.resolve(importerDir, relativePath);
        return { id: resolvedPath + '?worker', external: false };
      }
      
      return relativePath + '?worker';
    }
  },
};

export default defineConfig({
  plugins: [webWorkerVitePlugin, react()],
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
