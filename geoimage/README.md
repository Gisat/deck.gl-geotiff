# @gisatcz/deckgl-geolib

<p style="text-align: right;">
  <a href="https://www.npmjs.com/package/@gisatcz/deckgl-geolib">
    <img src="https://img.shields.io/npm/v/@gisatcz/deckgl-geolib.svg?style=flat-square" alt="version" />
  </a>
</p>

**A Deck.gl extension for rendering Cloud-Optimized GeoTIFF (COG) data.**

This library allows you to efficiently visualize high-resolution bitmap and terrain data directly from COG sources. It includes the `CogBitmapLayer` for 2D imagery and thematic layers and the `CogTerrainLayer` for 3D terrain meshes.

[//]: # (![Heatmap Example]&#40;geoimage/docs/images/ManillaCogHeatmap.png&#41;)

## Features

- **COG Rendering**: Efficiently loads and displays COG files directly without a backend server.
- **Bitmap and Terrain Layers**: Supports visualizing both raster and elevation data.
- **Customizable Rendering**: Allows custom color scales, multichannel support, and opacity control.


## Installation

To use this library, you need to have deck.gl and its dependencies installed.

```bash
npm install @gisatcz/deckgl-geolib
# or
yarn add @gisatcz/deckgl-geolib
```

For more information, visit the [npm package page](https://www.npmjs.com/package/@gisatcz/deckgl-geolib).

## Documentation

* **[Layer Showcase](docs/showcase-layers.md)** – Visual examples (RGB, Heatmaps, Terrain).
* **[API Reference](docs/api-reference.md)** – Detailed property configuration.

## Usage

### 1. CogBitmapLayer

Used for displaying 2D rasters: Raw Observation (Satellite/Aerial), Data Structure (Multi-band/Single-band), and Analysis Output (Thematic/Categorical).

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

### 2. CogTerrainLayer

Used for displaying 3D terrain from elevation data.


```typescript
import { CogTerrainLayer } from '@gisatcz/deckgl-geolib';

const cogLayer = new CogTerrainLayer({
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
  }
});
```


## Data Preparation

For this library to work efficiently, your COG must be Web-Optimized and projected in Web Mercator (EPSG:3857).

Quick Checklist:
1.  **Projection:** Web Mercator EPSG:3857
2.  **Tiling:** 256x256 tiles
3.  **Compression:** DEFLATE is recommended

[Read the full Data Preparation Guide](docs/dataPreparation.md)
*(Includes standard commands for `rio-cogeo`)*


## Architecture & Development

This repository is a monorepo containing the core library and example applications.

* `geoimage/`: The core library source code.
* `example/`: A React application for testing the layers.

### Building Locally

```bash
# 1. Install dependencies
yarn install

# 2. Build the library
yarn build

# 3. Run the example app
yarn start
```


<p style="text-align: center;">
  <sub>Maintained by <a href="https://gisat.cz">Gisat</a></sub>
</p>
