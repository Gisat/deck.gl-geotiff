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
    useHeatMap: true,
    colorScaleValueRange: [100, 300],
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

### C. Terrain with Stylized Overlay

Render the terrain with a color visualization derived from the elevation data itself — no separate layer needed. Pass visualization options directly in `terrainOptions` and `CogTerrainLayer` will automatically generate and drape the texture.

<img src="/geoimage/docs/images/cogTerrainLayer_heatmap.jpeg" width="60%" alt="Terrain Heatmap Overlay" />

```typescript
const terrainLayer = new CogTerrainLayer({
  id: 'terrain-layer',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
    useHeatMap: true,
    useChannel: 1,
    colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScaleValueRange: [-100, 9000],
  }
});
```

> **Need a texture from a different COG?** If your overlay data comes from a separate file, use a `CogBitmapLayer` with `clampToTerrain: true` as before:
>
> ```typescript
> // Terrain mesh
> const terrainLayer = new CogTerrainLayer({ ... });
>
> // Overlay from a different source
> const heatmapOverlay = new CogBitmapLayer({
>   id: 'heatmap-overlay',
>   rasterData: 'https://example.com/other-data.tif',
>   isTiled: true,
>   clampToTerrain: true,
>   cogBitmapOptions: {
>     type: 'image',
>     useHeatMap: true,
>     colorScaleValueRange: [-100, 9000],
>   }
> });
> ```

### D. Terrain with Kernel Analysis (Slope & Hillshade)

Compute and visualize slope or hillshade directly from the elevation data using a 3×3 kernel. The derived surface is draped as a texture over the 3D mesh. Both elevation and the derived value are available for picking simultaneously via `TileResult.raw` and `TileResult.rawDerived`.

<img src="/geoimage/docs/images/cogTerrainLayer_kernel.jpg" width="60%" alt="Terrain Kernel Slope/Hillshade" />

**Static visualization** (single mode, no switching):

```typescript
const slopeLayer = new CogTerrainLayer({
  id: 'terrain-slope',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
    type: 'terrain',
    useChannel: 1,
    noDataValue: 0,
    useSlope: true,           // or useHillshade: true
    useHeatMap: true,
    colorScale: [[255, 255, 255], [235, 200, 150], [200, 80, 50], [100, 40, 30]],
    colorScaleValueRange: [0, 90], // degrees
  },
  pickable: true,
});
```

**Dynamic mode switching** (elevation / slope / hillshade toggle):

Each mode requires a different `CogTiles` instance (different fetch size and kernel logic). Pass it via the `cogTiles` prop — when the prop changes, `CogTerrainLayer` detects it and refetches tiles while keeping the previous tile content visible during the transition.

```tsx
import { useState, useEffect, useMemo } from 'react';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';

type Mode = 'elevation' | 'slope' | 'hillshade';

const modeOptions: Record<Mode, object> = {
  elevation: { useHeatMap: true, colorScale: ['green', 'yellow', 'white'], colorScaleValueRange: [0, 6000] },
  slope:     { useSlope: true, useHeatMap: true, colorScale: [[255,255,255],[120,70,30],[60,20,10]], colorScaleValueRange: [0, 60] },
  hillshade: { useHillshade: true, useHeatMap: true, colorScale: [[52,38,35],[255,250,245]], colorScaleValueRange: [0, 255] },
};

function buildOptions(mode: Mode) {
  return { type: 'terrain' as const, useChannel: 1, noDataValue: 0, ...modeOptions[mode] };
}

function MyMap() {
  const [mode, setMode] = useState<Mode>('elevation');
  // cogState pairs CogTiles with the mode it was built for.
  // Keeping mode alongside CogTiles ensures terrainOptions always matches what CogTiles fetches.
  const [cogState, setCogState] = useState<{ cog: CogTiles; mode: Mode } | null>(null);

  useEffect(() => {
    const cog = new CogTiles(buildOptions(mode));
    cog.initializeCog('https://example.com/dem.tif').then(() => {
      setCogState({ cog, mode });
    });
  }, [mode]);

  const layers = useMemo(() => {
    if (!cogState) return [];
    return [
      new CogTerrainLayer({
        id: 'terrain-kernel',            // stable id — deck.gl keeps tile content during refetch
        elevationData: 'https://example.com/dem.tif',
        cogTiles: cogState.cog,
        isTiled: true,
        tileSize: 256,
        operation: 'terrain+draw',
        terrainOptions: buildOptions(cogState.mode), // use cogState.mode, not mode
        pickable: true,
      }),
    ];
  }, [cogState]);

  return <DeckGL layers={layers} /* ... */ />;
}
```

> **Why stable layer id?** Using the same id (`'terrain-kernel'`) across mode changes tells deck.gl to update the existing layer rather than destroy and recreate it. This preserves the tile cache, so old tiles remain visible until new ones arrive — no white canvas flash.

> **Why `cogState.mode` not `mode`?** After clicking a new mode, `mode` updates immediately but `cogState` still holds the old `CogTiles`. Using `cogState.mode` for `terrainOptions` ensures the visualization options always match the `CogTiles` instance that is actually fetching — preventing a mismatch between heatmap options and kernel fetch size.

**Picking slope + elevation simultaneously:**

```typescript
getTooltip={(info) => {
  const tileResult = info.tile?.content?.[0];
  if (!tileResult?.raw) return null;

  const { raw, rawDerived, width, height } = tileResult;
  const { west, south, east, north } = info.tile.bbox;
  const u = (info.coordinate[0] - west) / (east - west);
  const v = (north - info.coordinate[1]) / (north - south);

  const x = Math.min(width - 1, Math.max(0, Math.floor(u * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * (height - 1))));
  const elevation = raw[y * width + x];

  const kx = Math.min(255, Math.max(0, Math.floor(u * 255)));
  const ky = Math.min(255, Math.max(0, Math.floor(v * 255)));
  const slope = rawDerived?.[ky * 256 + kx];

  return { text: [`Elevation: ${elevation.toFixed(1)} m`, slope != null ? `Slope: ${slope.toFixed(1)}°` : ''].join('\n') };
}}
```

> **Hillshade variant:** replace `useSlope: true` with `useHillshade: true` and set `colorScale: [[52, 38, 35], [255, 250, 245]]` with `colorScaleValueRange: [0, 255]`. Optionally set `hillshadeAzimuth` (default `315`) and `hillshadeAltitude` (default `45`) to control the sun position.

---

## 4. Raw Value Picking

**Use Case:** retrieving the original GeoTIFF raster values (elevation, band values, indices) at a clicked location, without extra network requests.

### A. Bitmap Picking (single or multiband)

```typescript
const layer = new CogBitmapLayer({
  id: 'picking-bitmap',
  rasterData: 'https://example.com/data.tif',
  isTiled: true,
  pickable: true, // default: false, opt-in required
  onClick: (info) => {
    const uv = info.uv || (info.bitmap && info.bitmap.uv);
    if (info.tile && info.tile.content && info.tile.content.raw && uv) {
      const { raw, width, height } = info.tile.content;
      const [u, v] = uv;
      const x = Math.floor(u * width);
      const y = Math.floor(v * height);
      const channels = raw.length / (width * height);
      const pixelIndex = Math.floor((y * width + x) * channels);
      const rawValues = raw.slice(pixelIndex, pixelIndex + channels);
      console.log('Raw values:', rawValues); // e.g. [128, 200, 45] for 3 bands
    }
  }
});
```

### B. Terrain Picking (elevation & multiband)

```typescript
const layer = new CogTerrainLayer({
  id: 'picking-terrain',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  pickable: true,
  operation: 'terrain+draw',
  terrainOptions: { type: 'terrain' },
  onClick: (info) => {
    if (info.tile && info.tile.content && info.tile.content[0]) {
      const { raw, width, height } = info.tile.content[0];

      let u, v;
      if (info.uv) {
        [u, v] = info.uv;
      } else if (info.coordinate && info.tile.bbox) {
        const { west, south, east, north } = info.tile.bbox;
        u = (info.coordinate[0] - west) / (east - west);
        v = (north - info.coordinate[1]) / (north - south);
      }

      if (u !== undefined && v !== undefined) {
        const x = Math.min(width - 1, Math.max(0, Math.floor(u * (width - 1))));
        const y = Math.min(height - 1, Math.max(0, Math.floor(v * (height - 1))));
        console.log('Elevation (m):', raw[y * width + x]);
      }
    }
  }
});
```

> **Known limitation:** Terrain picking does not work when an overlay (OSM/XYZ or `CogBitmapLayer` with `clampToTerrain`) is active. Fix planned for a future release.
