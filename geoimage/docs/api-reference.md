# API Reference

This document outlines the configuration options for the core processing engines. The library is split into two specialized generators that handle data decoding and preparation for WebGL.

## Processing Overview

The configuration options below define how the raw GeoTIFF data is interpreted by the internal processing engines. These options are handled by two specialized generators:

- **`BitmapGenerator`**: Decodes and maps raster data into `ImageBitmap` textures.
- **`KernelGenerator`**: Computes analytical surfaces (slope, hillshade) via 3×3 neighborhood operations on elevation rasters.
- **`TerrainGenerator`**: Converts elevation data into 3D meshes using `Martini` or `Delatin`, and orchestrates texture generation via `BitmapGenerator` and `KernelGenerator`.

For a deep dive into the technical implementation and performance optimizations, see the **[Internal Architecture](generators.md)** guide.

---

## Channel Selection (Common)

These options select which band of the GeoTIFF to use. Shared by both Bitmap and Terrain layers. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useChannel`** | `number` \| `null` | `null` | **Optional**. 1-based index of the channel to visualize (e.g. `1` for the first channel). Defaults to `null` (RGB/RGBA). |
| **`useChannelIndex`** | `number` \| `null` | `null` | **Optional**. 0-based index of the channel to visualize (e.g. `0` for the first channel). Alternative to `useChannel`. |
| **`format`** | `string` \| `undefined` | `undefined` | **Optional**. Explicit data type hint: `'uint8'`, `'uint16'`, `'uint32'`, `'int8'`, `'int16'`, `'int32'`, `'float32'`, `'float64'`. Auto-detected from the GeoTIFF when omitted. |

## COG Fetching Options

These options control how raw bytes are fetched from the remote COG file. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`blockSize`** | `number` | `65536` | Block size in bytes for the internal HTTP range-request cache. The COG source is wrapped in a `BlockedSource` that fetches and caches data in fixed-size blocks. Larger values reduce the number of HTTP requests at the cost of fetching more data per request. Set to `0` to disable block caching entirely (not recommended for standard COG servers). The default of `65536` (64 KB) matches the geotiff.js internal default. |

## Bitmap Specific Options

These options apply to `CogBitmapLayer` (via `cogBitmapOptions`) and to `CogTerrainLayer` (via `terrainOptions`). When passed in `terrainOptions`, a texture is automatically generated from the elevation data and applied to the 3D mesh — no separate `CogBitmapLayer` needed. **All parameters are optional.**

> **Note on `type`:** Set `type: 'image'` for `CogBitmapLayer` and `type: 'terrain'` for `CogTerrainLayer`. This field tells the library which processing pipeline to use.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`blurredTexture`** | `boolean` | `true` | If `true` (default), uses `GL.LINEAR` for smooth pixels. If `false`, uses `GL.NEAREST` for pixelated look. |

### Visualization & Colors

#### Continuous & Single Color
Used for visualizing continuous data (elevation, temperature) or simple single-color styling.

> **Performance Note:** For float and 16-bit rasters with `useHeatMap`, a 1024-entry LUT is used for color mapping. This reduces per-pixel chroma.js calls and has no impact on memory usage for the output tile or picking performance.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useHeatMap`** | `boolean` | `true` | Renders single-channel data as a color heatmap using `colorScale`. |
| **`colorScale`** | `ChromaColor[]` | `YlOrRd` | Array of colors for the heatmap gradient. |
| **`useSingleColor`** | `boolean` | `false` | Renders all data values in a single solid color. |
| **`color`** | `ChromaColor` | `magenta` | The solid color to use when `useSingleColor` is `true`. |
| **`useAutoRange`** | `boolean` | `false` | Automatically calculates min/max values for color scaling. **Note:** Range is calculated per-tile. |
| **`colorScaleValueRange`** | `number[]` | `[0, 255]` | Min and Max values for the color scale (if `useAutoRange` is false). |
| **`clipLow`** | `number` \| `null` | `null` | Hide values below this threshold. |
| **`clipHigh`** | `number` \| `null` | `null` | Hide values above this threshold. |
| **`clippedColor`** | `ChromaColor` | `transparent` | Color for values outside of the clip range. |
| **`nullColor`** | `ChromaColor` | `transparent` | Color for NoData values. |

#### Thematic Colors
Used for categorical data (land cover, classification).

| Option | Type | Default | Exact Usage |
| :--- | :--- | :--- | :--- |
| **`useColorsBasedOnValues`** | `boolean` | `false` | Enable exact value matching. |
| **`colorsBasedOnValues`** | `[number, chroma.Color][]` | `[]` | Map exact values to colors. `[[1, 'red'], [2, 'blue']]` |
| **`useColorClasses`** | `boolean` | `false` | Enable range-based classification. |
| **`colorClasses`** | `[chroma.Color, [min, max], [inclMin?, inclMax?]?][]` | `[]` | Map value ranges to colors. The optional third element controls boundary inclusivity (both default to `true` for the last class, `[true, false]` for others). Example: `[['red', [0, 10]], ['blue', [10, 20]]]` |
| **`unidentifiedColor`** | `chroma.Color` | `transparent` | Color for values that don't match any class or value rule. |

#### Transparency

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`alpha`** | `number` | `100` | Global opacity (0-100) if `useDataForOpacity` is false. **Note:** Ignored when `useReliefGlaze: true` (glaze mode uses `maxGlazeAlpha` instead). |
| **`useDataForOpacity`** | `boolean` | `false` | Maps pixel intensity to opacity (0=transparent, max=opaque). |

---

## Terrain Options

These options apply specifically to `CogTerrainLayer` or when generating heightmaps. **All parameters are optional.**

> **`multiplier` vs. `verticalExaggeration`:** These are two separate concerns.
> - **`multiplier`** is for unit conversion (e.g. cm → m) and affects how Martini/Delatin compare the error threshold against the terrain mesh.
> - **`verticalExaggeration`** is for visual appearance only and stretches the final mesh vertically without changing the error tolerance or mesh density.
> 
> Example: If your data is in centimetres, set `multiplier: 0.01` to convert to metres. To make the terrain look 3× taller for visualization, set `verticalExaggeration: 3.0`. These changes are independent — changing `verticalExaggeration` will never cause over-tessellation.

> **`meshMaxError` and COG Resolution:** Set `meshMaxError` to approximately your COG's ground resolution (pixel size in meters), or larger. Your COG has a native resolution — trying to represent finer detail than this via smaller `meshMaxError` values creates unnecessary vertices without improving visual quality. For example, if your COG pixels are 38 meters, setting `meshMaxError: 40` uses the native resolution efficiently. Setting `meshMaxError: 1` wastes computation by creating a much finer mesh than the source data can support.

> **Performance and `terrainSkirtHeight`:** The skirt (enabled by default at 100 meters) prevents visible cracks at tile boundaries by adding vertical walls. This requires deduplicating mesh boundary edges during generation, which has a small CPU cost. For typical configurations (meshMaxError: 4.0), this is negligible (~5ms per tile). For very fine meshes or performance-critical applications, you can disable skirts with `terrainSkirtHeight: 0` to save the edge deduplication cost, accepting tile boundary cracks as a trade-off.

Additionally, as a performance optimization, tiles whose elevation channel contains only the configured `noDataValue` are detected early — in such cases no mesh or texture is generated and the tile loader returns `null`, avoiding expensive tessellation. The detection strategy can be configured via `terrainOptions.noDataCheck` with values `'full'` or `'border+center'`. The default is `'full'` (safe): it scans every pixel to avoid false-empty tiles. Use `'border+center'` when you prefer a faster heuristic; note it may miss small isolated land masses (e.g., archipelagos).

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`tesselator`** | `'martini'` \| `'delatin'` | `'martini'` | The algorithm used for terrain mesh generation. 'Martini' is generally faster, 'Delatin' may produce higher quality meshes. |
| **`multiplier`** | `number` | `1.0` | Scales each raw elevation value before Martini/Delatin tessellation. Use this for unit conversion into metres when needed (e.g. `0.01` to convert cm to m). `meshMaxError` must be specified in the same units as these scaled elevation values (typically meters after conversion), so changing `multiplier` without adjusting `meshMaxError` will change tessellation density. |
| **`verticalExaggeration`** | `number` | `1.0` | **Visual exaggeration only.** Scales vertex z positions after mesh generation, making terrain appear taller. Unlike `multiplier`, this does **not** affect `meshMaxError` — the error threshold is always evaluated against real-world (post-`multiplier`) elevation values. The skirt height is automatically scaled by this factor. |
| **`terrainSkirtHeight`** | `number` | `100` | Height (in meters) of the "skirt" around tiles to hide cracks at tile boundaries. Automatically scaled by `verticalExaggeration`. Set to `0` to disable. **Performance note:** Adding skirts has a small CPU cost during mesh generation (edge deduplication), roughly proportional to the number of triangles. For typical use cases with the default `meshMaxError: 4.0`, this cost is negligible (~5ms per tile). For very fine meshes (small `meshMaxError`), disabling skirts entirely (`terrainSkirtHeight: 0`) can improve performance if tile boundary cracks are acceptable. |
| **`terrainMinValue`** | `number` | `0` | Default value to use if elevation data is missing. |
| **`terrainColor`** | `number[]` \| `ChromaColor` | `[200, 200, 200, 255]` | Base RGBA color of the terrain mesh when no texture or visualization options are set. |

### Kernel / Derived / Glaze Analysis Options

These options activate 3×3 neighborhood kernel calculations on the elevation raster, producing slope, hillshade, or Swiss relief glaze as the tile texture. **Mutually exclusive** — set either `useSlope` or `useHillshade`, not both. For slope and hillshade heatmap-style visualization, use `useHeatMap: true` together with a `colorScale` to control the output. **For Swiss relief (baked or glaze mode):** use `useSwissRelief` or `useReliefGlaze` with any visualization option — these modes do not require `useHeatMap`.

When active, tiles are fetched at 258×258 (one pixel border beyond the 256 output) to provide edge neighbors for the kernel, and the derived values are stored in `TileResult.rawDerived` alongside the original elevation in `TileResult.raw`. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useSlope`** | `boolean` | `false` | Computes slope (0–90°) for each pixel using Horn's method and uses it as the tile texture. |
| **`useHillshade`** | `boolean` | `false` | Computes hillshade (0–255 grayscale) using the ESRI algorithm and uses it as the tile texture. |
| **`hillshadeAzimuth`** | `number` | `315` | Sun azimuth in degrees (0 = North, clockwise). Only used when `useHillshade: true`. |
| **`hillshadeAltitude`** | `number` | `45` | Sun altitude above the horizon in degrees (0 = horizon, 90 = zenith). Only used when `useHillshade: true`. |
| **`zFactor`** | `number` | `1` | Vertical exaggeration applied before gradient calculation. Useful when horizontal and vertical units differ significantly (e.g. degrees vs. metres). |
| **`swissSlopeWeight`** | `number` | `0.5` | Controls the influence of slope on the final appearance for both kernel and Swiss relief glaze. Lower values (0.2–0.5) favor hillshade, higher values (0.5–1.0) emphasize slope contrast. |
| **`useSwissRelief`** | `boolean` | `false` | Enables Swiss-style shaded relief (composited slope + multi-directional hillshade) for terrain visualization. Automatically disables lighting on `CogTerrainLayer`. Applies relief mask as a texture overlay. |
| **`useReliefGlaze`** | `boolean` | `false` | *(Bitmap layers only)* Generates a transparent Swiss relief glaze overlay (0–255 mask) that can be composited over external rasters or basemaps. Relief is computed from the elevation channel selected via `useChannel`/`useChannelIndex`. Ignores global `alpha` setting (uses `maxGlazeAlpha` instead). |
| **`maxGlazeAlpha`** | `number` | `128` | Intensity ceiling for relief glaze (0-255). 0 is fully transparent; 255 is maximum theoretical opacity. Only used with `useReliefGlaze`. Recommended range for satellite overlays: 120-160. |

### Layer Props (CogTerrainLayer)

These properties are set directly on the `CogTerrainLayer` instance, not within the `terrainOptions` object.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`meshMaxError`** | `number \| 'auto'` | `'auto'` | Martini/Delatin error tolerance in meters, or `'auto'` for zoom-adaptive scaling. **Modes:** (1) Explicit numeric value (e.g. `10`): Fixed meshMaxError for all zoom levels; user has full control. (2) `'auto'`: Dynamically scales meshMaxError based on zoom level and the COG's tile resolution. The scaling uses a linear interpolation multiplier that ranges from **3.0× at the COG's minimum zoom** (coarse meshes for performance when viewing entire regions) to **0.5× at the COG's maximum zoom** (fine meshes for detail when viewing local features). Formula: `meshMaxError = tileResolution × errorMultiplier`. This provides significant performance improvements at low zooms (fewer triangles, faster tessellation) while maintaining pixel-perfect detail at high zooms (no slivers). **Recommendation:** `'auto'` is the default and recommended for most cases. Explicit numbers are useful for fine-tuning if you want consistent tessellation across all zoom levels. |
| **`opacity`** | `number` | `1.0` | Standard deck.gl layer opacity (0.0 to 1.0). |
| **`disableTexture`** | `boolean` | `false` | When `true`, suppresses any generated texture and renders the mesh in plain `color`. Useful for showing neutral grey terrain during mode transitions. |
| **`onZRangeUpdate`** | `(zRange: [number, number] \| null) => void` | `undefined` | **Optional callback for 3D overlay tile culling.** Fired when the terrain's elevation bounds (`zRange`) are computed or updated. Use this to sync the elevation range to overlay `TileLayer` instances (e.g., OSM, satellite) for proper 3D frustum culling. Without `zRange`, overlay tiles may be incorrectly culled when the viewport is tilted in 3D. **Recommended:** Use with the `useTerrainZRange()` hook for easy integration. See [Overlay Tiles with Proper 3D Frustum Culling](showcase-layers.md#36-overlay-tiles-with-proper-3d-frustum-culling) for full examples. |

## Animation & Caching Options

These options control multi-band caching for smooth animation and real-time band switching. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`cacheAllBands`** | `boolean` | `false` | **Enable multi-band caching for smooth animation.** When `true`, on first tile access, fetches and caches all bands in a single HTTP request. Subsequent band changes (via `useChannel`) instantly return cached meshes from memory — zero network latency. **Use case:** Multi-temporal elevation data (time series, 4D monitoring) or multi-variable analysis (different scalar fields). **Lazy-load pattern:** Start with `cacheAllBands: false`, let users click a "Fetch All Bands" button to enable caching on demand. **Memory trade-off:** Each tile caches all bands in RAM (e.g., 30 bands × 256KB = ~7.7 MB per tile for Float32 data). **Recommendation:** Enable only for COGs with <50 bands to avoid memory bloat over long sessions. See [Animation Guide](animation-guide.md) for implementation details and performance tuning. |

---

## Picking & Raw Value Access

Both layers support deck.gl's picking system, giving access to the original raster values at the clicked or hovered location. The raw raster data is a byproduct of tile rendering and requires no additional network requests.

> **Memory trade-off:** When `pickable: true`, the raw `TypedArray` for each loaded tile is kept in RAM alongside the visual output for the lifetime of the tile in deck.gl's cache (~64 KB per 8-bit tile, ~256 KB per Float32 tile). When `pickable: false` (the default), the raw data is discarded immediately after rendering — only the visual `ImageBitmap` or mesh is retained.

### How it works

When a tile is loaded, both generators bundle the raw raster data alongside the visual output into a `TileResult` object. This object is stored by deck.gl's `TileLayer` in `tile.content` and is available in `onClick` / `onHover` callbacks.

### `TileResult`

| Property | Type | Description |
| :--- | :--- | :--- |
| `map` | `ImageBitmap \| MeshAttributes` | The visual artifact sent to the GPU. |
| `raw` | `TypedArray` | The original raster data after `multiplier` scaling (used by Martini/Delatin). For terrain this is elevation in metres (if `multiplier: 1.0`). **Note:** Does not include `verticalExaggeration` — the z values in the mesh vertices are exaggerated, but `raw` contains only the base elevation values. |
| `width` | `number` | Tile width in pixels. |
| `height` | `number` | Tile height in pixels. |
| `texture` | `ImageBitmap \| undefined` | *(Terrain only)* Generated texture bitmap from elevation data. Present when at least one visualization option is active in `terrainOptions` (`useHeatMap`, `colorScale`, `useSingleColor`, `useColorsBasedOnValues`, or `useColorClasses`). `undefined` when no visualization options are set. |
| `rawDerived` | `Float32Array \| null \| undefined` | *(Terrain kernel only)* The computed kernel output stored alongside `raw`. Contains slope in degrees (0–90) when `useSlope: true`, or hillshade values (0–255) when `useHillshade: true`. `null` when neither kernel option is active. Dimensions are always 256×256 (vs. 257×257 for `raw`). |

### CogBitmapLayer picking

Both layers default to `pickable: false` (deck.gl convention). Set `pickable: true` to enable picking. Use `info.uv` or `info.bitmap.uv` to get the local UV coordinate within the tile.

```typescript
const layer = new CogBitmapLayer({
  id: 'bitmap',
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
      console.log('Raw values at click:', rawValues);
    }
  }
});
```

### CogTerrainLayer picking

Terrain tile content is a **tuple** `[TileResult | null, TextureSource | null]` — always access the first element `[0]` for the `TileResult`. Use `info.uv` when available, or fall back to `info.coordinate` + tile bbox.

```typescript
const layer = new CogTerrainLayer({
  id: 'terrain',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  pickable: true,
  onClick: (info) => {
    if (info.tile && info.tile.content && info.tile.content[0]) {
      const { raw, rawDerived, width, height } = info.tile.content[0];

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
        console.log('Elevation at click:', raw[y * width + x]);

        // rawDerived is only present when useSlope or useHillshade is active.
        // Its dimensions are always 256×256 regardless of raw dimensions.
        if (rawDerived) {
          const kx = Math.min(255, Math.max(0, Math.floor(u * 255)));
          const ky = Math.min(255, Math.max(0, Math.floor(v * 255)));
          console.log('Derived value at click:', rawDerived[ky * 256 + kx]);
        }
      }
    }
  }
});
```

> **Known limitation:** Picking on `CogTerrainLayer` does **not** work when any overlay layer is rendered on top of it — this includes both OSM/XYZ tile layers using `TerrainExtension` and `CogBitmapLayer` with `clampToTerrain`. The overlay captures all picking events, preventing the terrain layer from receiving them.

### Hover tooltips

Since `pickable: true` enables both click and hover, you can show a live tooltip using deck.gl's `getTooltip` prop on the `DeckGL` component. This avoids React state updates on every mouse move (which would cause layer re-renders).

```typescript
<DeckGL
  layers={layers}
  getTooltip={(info: any) => {
    // CogBitmapLayer — single value from first band
    const uv = info.uv || (info.bitmap && info.bitmap.uv);
    if (info.tile?.content?.raw && uv) {
      const { raw, width, height } = info.tile.content;
      const x = Math.floor(uv[0] * width);
      const y = Math.floor(uv[1] * height);
      const channels = raw.length / (width * height);
      const pixelIndex = Math.floor((y * width + x) * channels);
      return { text: `Value: ${raw[pixelIndex].toFixed(2)}` };
    }
    // CogTerrainLayer — elevation
    const tileResult = info.tile?.content?.[0];
    if (tileResult?.raw && info.uv) {
      const { raw, width, height } = tileResult;
      const x = Math.min(width - 1, Math.max(0, Math.floor(info.uv[0] * (width - 1))));
      const y = Math.min(height - 1, Math.max(0, Math.floor(info.uv[1] * (height - 1))));
      return { text: `Elevation: ${raw[y * width + x].toFixed(1)} m` };
    }
    return null;
  }}
/>
```

> **Note:** Do not use React state (`useState`) inside `onHover` to drive a tooltip — this triggers re-renders during tile initialization and can cause deck.gl errors. Use `getTooltip` on the `DeckGL` component instead.

---

## React Hooks

### `useTerrainZRange()`

A React hook that simplifies syncing terrain elevation bounds to overlay tile layers for proper 3D frustum culling.

**Signature:**
```typescript
function useTerrainZRange(): {
  zRange: [number, number] | null;
  onZRangeUpdate: (zRange: [number, number] | null) => void;
}
```

**Returns:**
- **`zRange`**: The elevation bounds `[minZ, maxZ]` from the terrain layer. Initially `null`, updates as terrain tiles load.
- **`onZRangeUpdate`**: A callback function to pass to `CogTerrainLayer.onZRangeUpdate`.

**Purpose:**
When rendering overlay tile layers (OSM, satellite, CartoDB) over 3D terrain with a tilted viewport, deck.gl's frustum culling assumes tiles exist on a flat Z=0 plane. This causes foreground tiles to be incorrectly clipped. By syncing the terrain's elevation range (`zRange`) to the overlay layer, the culling algorithm expands its 3D bounding volume to include the elevated terrain, fixing the clipping issue.

**Example (Recommended):**
```typescript
import { CogTerrainLayer } from '@gisatcz/deckgl-geolib';
import { useTerrainZRange } from '@gisatcz/deckgl-geolib/react';

function Map3D() {
  const { zRange, onZRangeUpdate } = useTerrainZRange();

  return (
    <DeckGL layers={[
      new CogTerrainLayer({
        id: 'terrain',
        elevationData: 'https://example.com/dem.tif',
        terrainOptions: { type: 'terrain' },
        onZRangeUpdate,
      }),
      new TileLayer({
        id: 'osm-overlay',
        data: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        zRange,  // Pass elevation bounds from terrain
      }),
    ]} />
  );
}
```

**Manual Alternative (without hook):**
```typescript
const [terrainZRange, setTerrainZRange] = useState(null);

// Then:
new CogTerrainLayer({
  onZRangeUpdate: setTerrainZRange,
}),
new TileLayer({
  zRange: terrainZRange,
}),
```

For full implementation examples, see [Overlay Tiles with Proper 3D Frustum Culling](showcase-layers.md#36-overlay-tiles-with-proper-3d-frustum-culling).

---

## Type Definitions

### `chroma.Color`
Any color format supported by [chroma.js](https://gka.github.io/chroma.js/), including:
*   Named colors: `'red'`, `'darkblue'`
*   Hex codes: `'#ff0000'`
*   RGB/RGBA arrays: `[255, 0, 0]`, `[255, 0, 0, 128]`
*   Brewer palettes: `'chroma.brewer.Greens'`
