// src/index.ts

import { suppressGlobalAbortErrors } from './utils/suppressAbortErrors';

// Initialize global error suppression for deck.gl AbortErrors
suppressGlobalAbortErrors();

export { CogBitmapLayer, CogTerrainLayer } from './layers/index';
export { CogTiles, GeoImage } from './core/index';
export { suppressGlobalAbortErrors } from './utils/suppressAbortErrors';
export type { GeoImageOptions } from './core/index';
