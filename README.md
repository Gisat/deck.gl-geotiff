# @gisatcz/deckgl-geolib

<p align="right">
  <a href="https://www.npmjs.com/package/@gisatcz/deckgl-geolib">
    <img src="https://img.shields.io/npm/v/@gisatcz/deckgl-geolib.svg?style=flat-square" alt="version" />
  </a>
</p>

**A Deck.gl extension for rendering Cloud-Optimized GeoTIFF (COG) data.**

This library allows you to efficiently visualize high-resolution bitmap and terrain data directly from COG sources. It includes the `CogBitmapLayer` for 2D imagery/heatmaps and the `CogTerrainLayer` for 3D terrain meshes.

<img src="geoimage/docs/images/ManillaCogHeatmap.png" width="100%" alt="Heatmap Example">


## Features

- **COG Rendering**: Efficiently loads and displays COG files directly without a backend server.
- **Bitmap and Terrain Layers**: Supports visualizing both raster and elevation data.
- **Customizable Rendering**: Allows custom color scales, multichannel support, and opacity control.


## Installation

To use the Geolib Visualizer library, you need to have deck.gl and its dependencies installed.

```bash
npm install @gisatcz/deckgl-geolib
# or
yarn add @gisatcz/deckgl-geolib
```

For more information, visit the [npm package page](https://www.npmjs.com/package/@gisatcz/deckgl-geolib).

## Usage


### 1. CogBitmapLayer

Used for displaying 2D rasters (satellite imagery, analysis results, heatmaps).

```typescript
import { CogBitmapLayer } from '@gisatcz/deckgl-geolib';

const cogLayer = new CogBitmapLayer({
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image'
  }
});
```

> **Detailed Documentation:**
> * [👉 API Reference & Examples](geoimage/docs/layer-cogbitmap.md)
> * [👉 Visualization Options (GeoImage Core)](geoimage/docs/architecture-geoimage.md)

### 2. CogTerrainLayer

Used for displaying 3D terrain from elevation data.


```typescript
import { CogTerrainLayer } from '@gisatcz/deckgl-geolib';

const cogLayer = new CogTerrainLayer({
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  meshMaxError: 1,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
  }
});
```

> **📘 Detailed Documentation:**
> * [👉 API Reference & Examples](geoimage/docs/layer-cogterrain.md)
> * [👉 Terrain Processing Options (GeoImage Core)](geoimage/docs/architecture-geoimage.md)

## Data Preparation

For this library to work efficiently, your COG must be Web-Optimized and projected in Web Mercator (EPSG:3857).

**Quick Checklist:**
1.  **Projection:** Web Mercator EPSG:3857
2.  **Tiling:** 256x256 tiles
3.  **Compression:** DEFLATE is recommended

[👉 Read the full Data Preparation Guide](geoimage/docs/dataPreparation.md)
*(Includes standard commands for `rio-cogeo`)*


## Architecture & Development

This repository is a monorepo containing the core library and example applications.

* **`geoimage/`**: The core library source code.
* **`example/`**: A React application for testing the layers.

### Building Locally

```bash
# 1. Install dependencies
yarn install

# 2. Build the library
yarn build

# 3. Run the example app
yarn start
```

### Technical Documentation
For developers contributing to the core logic:
* [GeoImage Internal Logic](geoimage/docs/architecture-geoimage.md) - How the image processing and configuration works.
* [CogTiles Architecture](geoimage/docs/architecture-cogtiles.md) - How the tiling grid is calculated.


<p align="center">
  <sub>Maintained by <a href="http://gisat.cz">Gisat</a></sub>
</p>
