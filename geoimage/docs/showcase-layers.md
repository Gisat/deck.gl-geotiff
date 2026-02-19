# Layer Showcase

This guide demonstrates the core visual capabilities of `@gisatcz/deckgl-geolib`. 
For detailed API properties, please refer to the [API Reference](api-reference.md).

## Setup

```typescript
import { CogBitmapLayer, CogTerrainLayer } from '@gisatcz/deckgl-geolib';
```

---

## 1. Satellite Imagery (RGB)

**Use Case:** rendering standard multi-band satellite or aerial imagery (True Color). 
The `CogBitmapLayer` automatically detects RGB channels.

<img src="/geoimage/docs/images/cogBitmapLayer_rgb.jpg" width="60%" alt="Satellite RGB" />

```typescript
const satelliteLayer = new CogBitmapLayer({
  id: 'satellite-rgb',
  rasterData: 'https://example.com/satellite-imagery.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    // Optional: Enhance visuals
    // blurredTexture: true (default) for smooth interpolated pixels
  }
});
```

---

## 2. Thematic Analysis (Heatmaps & Classification)

**Use Case:** visualizing scientific data (e.g., NDVI, temperature, elevation benchmarks) using heatmaps or categorical coloring.

### A. Heatmaps
Convert a single channel of data into a visualized heatmap.

<img src="/geoimage/docs/images/cogBitmapLayer_customColor.jpg" width="60%" alt="Heatmap" />

```typescript
const heatmapLayer = new CogBitmapLayer({
  id: 'heatmap',
  rasterData: 'https://example.com/heatmap.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 1,
    useHeatmap: true,
    colorScaleValueRange: [100, 200, 300],
    colorScale: ['yellow', '#20908d', [68, 1, 84]]
  }
});
```

### B. Data Clipping
Highlight specific values (e.g., "Show me values between 100–200 in green").

<img src="/geoimage/docs/images/cogBitmapLayer_clip.jpg" width="60%" alt="Clipped Data" />

```typescript
const analysisLayer = new CogBitmapLayer({
  id: 'analysis-clip',
  rasterData: 'https://example.com/analysis.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 1,
    useSingleColor: true,
    color: [32, 144, 81, 255], // Green
    clipLow: 100, 
    clipHigh: 200,
    clippedColor: 'yellow' // Yellow for values outside range
  }
});
```

### C. Categorical Classification
Assign specific colors to exact data values (e.g., Land Cover classes).

<img src="/geoimage/docs/images/cogBitmapLayer_categorical.jpeg" width="60%" alt="Clipped Data" />

```typescript
const categoricalLayer = new CogBitmapLayer({
  id: 'categorical-layer',
  rasterData: 'https://example.com/landcover.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 1,
    useColorsBasedOnValues: true,
    colorsBasedOnValues: [
      [10, 'red'],           // Class 1 (Red)
      [20, [0, 0, 255]],     // Class 2 (Blue)
      [30, '#00FF00']        // Class 3 (Green)
    ]
  }
});
```

### D. Interval Classes
Assign colors to data ranges (e.g. elevation zones or risk levels).

<img src="/geoimage/docs/images/cogBitmapLayer_classes.jpeg" width="60%" alt="Clipped Data" />


```typescript
const intervalLayer = new CogBitmapLayer({
  id: 'interval-layer',
  rasterData: 'https://example.com/data.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 1,
    useColorClasses: true,
    colorClasses: [
      ['#fde725', [0, 1000]],     // Range 0 - 1000
      ['#5dc962', [1000, 2000]],  // Range 1000 - 2000
      ['#20908d', [2000, 4000]]   // Range 2000 - 4000
    ]
  }
});
```

---

## 3. 3D Terrain & Draping

**Use Case:** rendering 3D landscapes from Digital Elevation Models (DEM) and draping satellite imagery over them.

### A. Basic Terrain
Render a 3D mesh from elevation data.

<img src="/geoimage/docs/images/cogTerrainLayer.jpg" width="60%" alt="Terrain Mesh" />

```typescript
const terrainLayer = new CogTerrainLayer({
  id: 'terrain-layer',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  tileSize: 256,
  meshMaxError: 4.0, // Martini error tolerance in meters, smaller number -> more detailed mesh, (default 4.0)
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
    multiplier: 1.0, // Vertical exaggeration
    terrainSkirtHeight: 100 // Hides gaps between tiles
  }
});
```

### B. Terrain with Draping (External Texture)
Project a satellite image or tile service (XYZ) onto the 3D terrain.

<img src="/geoimage/docs/images/cogTerrainLayer_overlay.jpg" width="60%" alt="Terrain Overlay" />

```typescript
const drapedLayer = new CogTerrainLayer({
  id: 'terrain-draped',
  elevationData: 'https://example.com/dem.tif',
  texture: 'https://site.com/satellite/{z}/{x}/{y}.png', // XYZ Service
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
  }
});
```

### C. Terrain with Stylized Overlay (Dual Layer)
Drape a *stylized* COG (e.g., a heatmap) onto the terrain. This advanced technique uses a separate `CogBitmapLayer` with `clampToTerrain: true`.

<img src="/geoimage/docs/images/cogTerrainLayer_heatmap.jpeg" width="60%" alt="Terrain Heatmap Overlay" />

```typescript
// 1. Terrain Layer (Mesh Source)
const terrainLayer = new CogTerrainLayer({
  id: 'terrain-layer',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
  }
});

// 2. Overlay Layer (Stylized Bitmap)
const heatmapOverlay = new CogBitmapLayer({
  id: 'heatmap-overlay',
  rasterData: 'https://example.com/dem.tif',
  isTiled: true,
  opacity: 0.8,
  clampToTerrain: true, // Drapery enabled
  cogBitmapOptions: {
    type: 'image',
    useHeatMap: true,
    useChannel: 1,
    colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScaleValueRange: [-100, 9000],
  }
});
```
