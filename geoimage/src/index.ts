// src/index.ts

// 1. Export from the Layers Barrel
// eslint-disable-next-line import/extensions
export { CogBitmapLayer, CogTerrainLayer } from './layers/index';

// 2. Export from the Core Barrel
// This tells the linter: "See? I AM using those exports from /core/index.ts!"
// eslint-disable-next-line import/extensions
export { CogTiles, GeoImage } from './core/index';
