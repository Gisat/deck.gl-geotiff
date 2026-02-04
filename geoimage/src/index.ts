// src/index.ts

// 1. Export from the Layers Barrel
export { CogBitmapLayer, CogTerrainLayer } from './layers/index';

// 2. Export from the Core Barrel
// This tells the linter: "See? I AM using those exports from /core/index.ts!"
export { CogTiles, GeoImage } from './core/index';
