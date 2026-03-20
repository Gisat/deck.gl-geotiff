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
- **Customizable Rendering**: Custom color scales, multichannel support, heatmaps, categorical classification, and opacity control.
- **Terrain Texturing**: Drape a styled visualization (elevation heatmap, external imagery) directly onto the 3D terrain mesh — no separate layer needed.
- **Kernel Analysis**: Compute slope and hillshade directly from elevation data using 3×3 neighborhood kernels (Horn's method / ESRI algorithm).
- **Raw Value Picking**: Access original raster values (elevation, band values, slope, hillshade) at hover/click locations with no extra network requests.


## Installation

To use this library, you need to have deck.gl and its dependencies installed.

```bash
npm install @gisatcz/deckgl-geolib
# or
yarn add @gisatcz/deckgl-geolib
```

For more information, visit the [npm package page](https://www.npmjs.com/package/@gisatcz/deckgl-geolib).

## Documentation

* **[Layer Showcase](geoimage/docs/showcase-layers.md)** – Visual examples (RGB, Heatmaps, Terrain, Slope/Hillshade, Picking).
* **[API Reference](geoimage/docs/api-reference.md)** – Detailed property configuration.
* **[Internal Architecture](geoimage/docs/generators.md)** – Technical details about the core processing engines.

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

Used for displaying 3D terrain from elevation data. Supports draping a styled texture derived from the elevation itself.

```typescript
import { CogTerrainLayer } from '@gisatcz/deckgl-geolib';

const cogLayer = new CogTerrainLayer({
  id: 'cog_terrain_name',
  elevationData: 'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
    useHeatMap: true,
    useChannel: 1,
    colorScale: ['#440154', '#20908d', '#fde725'],
    colorScaleValueRange: [0, 3000],
  }
});
```

### 3. Kernel Analysis (Slope & Hillshade)

Compute slope or hillshade directly from elevation data and drape it as a texture on the terrain mesh.

```typescript
import { CogTerrainLayer } from '@gisatcz/deckgl-geolib';

const slopeLayer = new CogTerrainLayer({
  id: 'cog_slope',
  elevationData: 'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
    useChannel: 1,
    useSlope: true,           // or useHillshade: true
    useHeatMap: true,
    colorScale: [[255, 255, 255], [235, 200, 150], [200, 80, 50], [100, 40, 30]],
    colorScaleValueRange: [0, 90], // degrees
  },
});
```


## Data Preparation

For this library to work efficiently, your COG must be Web-Optimized and projected in Web Mercator (EPSG:3857).

Quick Checklist:
1.  **Projection:** Web Mercator EPSG:3857
2.  **Tiling:** 256x256 tiles
3.  **Compression:** DEFLATE is recommended

Use the following `rio-cogeo` command to generate compatible files:

```bash
rio cogeo create \
  --cog-profile=deflate \
  --blocksize=256 \
  --overview-blocksize=256 \
  --web-optimized \
  --nodata=nan \
  --forward-band-tags \
  [input_file.tif] \
  [output_cog_file.tif]
```


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
