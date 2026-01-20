# @gisatcz/deckgl-geolib

<p align="right">
  <a href="https://www.npmjs.com/package/@gisatcz/deckgl-geolib">
    <img src="https://img.shields.io/npm/v/@gisatcz/deckgl-geolib.svg?style=flat-square" alt="version" />
  </a>
</p>

**A Deck.gl extension for rendering Cloud-Optimized GeoTIFF (COG) data.**

This library allows you to efficiently visualize high-resolution bitmap and terrain data directly from COG sources. It includes the `CogBitmapLayer` for 2D imagery/heatmaps and the `CogTerrainLayer` for 3D terrain meshes.

<img src="geoimage/docs/images/ManillaCogHeatmap.png" width="100%" alt="Heatmap Example">

---

## Features

- **COG Rendering**: Efficiently loads and displays Cloud-Optimized GeoTIFF files directly without a backend server.
- **Bitmap and Terrain Layers**: Supports visualizing both bitmap and elevation data.
- **Customizable Rendering**: Allows custom color scales, multichannel support, opacity control, and flexible geographic bounds.

---

## Installation

To use the Geolib Visualizer library, you need to have deck.gl and its dependencies installed.

```bash
npm install @gisatcz/deckgl-geolib
# or
yarn add @gisatcz/deckgl-geolib
```

For more information, visit the [npm package page](https://www.npmjs.com/package/@gisatcz/deckgl-geolib).

## Usage

Import package into project:

```typescript
import { CogBitmapLayer, CogTerrainLayer } from '@gisatcz/deckgl-geolib';
```

### 1. CogBitmapLayer

Used for displaying 2D rasters (satellite imagery, analysis results, heatmaps).

```typescript
const cogLayer = new CogBitmapLayer({
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image'
  }
});
```


> 👉 for more information and examples refer to the [CogBitmapLayer](geoimage/docs/layer-cogbitmap.md).
>
> **💡 Important Configuration:** `cogBitmapOptions` supports powerful processing features like **clipping ranges**, **custom color scales**, and **channel selection**.
>
> **[👉 See the Full List of Options in the GeoImage Architecture Guide](geoimage/docs/architecture-geoimage.md)**

### 2. CogTerrainLayer

Used for displaying 3D terrain from elevation data.


```typescript
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
> 👉 for more information and examples refer to the [CogTerrainLayer](geoimage/docs/layer-cogterrain.md).
---

## Data Preparation

For this library to work efficiently, your GeoTIFFs must be Cloud-Optimized (COG) and projected in **Web Mercator (EPSG:3857)**.

**Quick Checklist:**
1.  **Projection:** EPSG:3857 (Spherical Mercator).
2.  **Tiling:** 256x256 internal tiles.
3.  **Compression:** DEFLATE is recommended.

**[👉 Read the full Data Preparation Guide](geoimage/docs/dataPreparation.md)**
*(Includes standard commands for `rio-cogeo`)*

**[👉 Guide for Hosting on S3](geoimage/docs/guideForS3.md)**

---

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

---

<p align="center">
  <sub>Maintained by <a href="http://gisat.cz">Gisat</a></sub>
</p>
