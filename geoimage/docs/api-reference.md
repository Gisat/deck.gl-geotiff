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

## Bitmap Specific Options

These options apply to `CogBitmapLayer` (via `cogBitmapOptions`) and to `CogTerrainLayer` (via `terrainOptions`). When passed in `terrainOptions`, a texture is automatically generated from the elevation data and applied to the 3D mesh — no separate `CogBitmapLayer` needed. **All parameters are optional.**

> **Note on `type`:** Set `type: 'image'` for `CogBitmapLayer` and `type: 'terrain'` for `CogTerrainLayer`. This field tells the library which processing pipeline to use.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`blurredTexture`** | `boolean` | `true` | If `true` (default), uses `GL.LINEAR` for smooth pixels. If `false`, uses `GL.NEAREST` for pixelated look. |

### Visualization & Colors

#### Continuous & Single Color
Used for visualizing continuous data (elevation, temperature) or simple single-color styling.

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
| **`alpha`** | `number` | `100` | Global opacity (0-100) if `useDataForOpacity` is false. |
| **`useDataForOpacity`** | `boolean` | `false` | Maps pixel intensity to opacity (0=transparent, max=opaque). |

---

## Terrain Options

These options apply specifically to `CogTerrainLayer` or when generating heightmaps. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`tesselator`** | `'martini'` \| `'delatin'` | `'martini'` | The algorithm used for terrain mesh generation. 'Martini' is generally faster, 'Delatin' may produce higher quality meshes. |
| **`multiplier`** | `number` | `1.0` | Multiplies each data value by this factor (e.g. vertical exaggeration). Used in calculating elevation. |
| **`terrainSkirtHeight`** | `number` | `100` | Height (in meters) of the "skirt" around tiles to hide cracks. |
| **`terrainMinValue`** | `number` | `0` | Default value to use if elevation data is missing. |
| **`terrainColor`** | `number[]` \| `ChromaColor` | `[133, 133, 133, 255]` | Base RGBA color of the terrain mesh when no texture or visualization options are set. |

### Kernel / Derived Analysis Options

These options activate 3×3 neighborhood kernel calculations on the elevation raster, producing slope or hillshade as the tile texture. **Mutually exclusive** — set either `useSlope` or `useHillshade`, not both. Requires `useHeatMap: true` and a `colorScale` to control the output visualization.

When active, tiles are fetched at 258×258 (one pixel border beyond the 256 output) to provide edge neighbors for the kernel, and the derived values are stored in `TileResult.rawDerived` alongside the original elevation in `TileResult.raw`. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useSlope`** | `boolean` | `false` | Computes slope (0–90°) for each pixel using Horn's method and uses it as the tile texture. |
| **`useHillshade`** | `boolean` | `false` | Computes hillshade (0–255 grayscale) using the ESRI algorithm and uses it as the tile texture. |
| **`hillshadeAzimuth`** | `number` | `315` | Sun azimuth in degrees (0 = North, clockwise). Only used when `useHillshade: true`. |
| **`hillshadeAltitude`** | `number` | `45` | Sun altitude above the horizon in degrees (0 = horizon, 90 = zenith). Only used when `useHillshade: true`. |
| **`zFactor`** | `number` | `1` | Vertical exaggeration applied before gradient calculation. Useful when horizontal and vertical units differ significantly (e.g. degrees vs. metres). |

### Layer Props (CogTerrainLayer)

These properties are set directly on the `CogTerrainLayer` instance, not within the `terrainOptions` object.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`meshMaxError`** | `number` | `4.0` | Martini/Delatin error tolerance in meters. Smaller number -> more detailed mesh (higher triangle count). |
| **`opacity`** | `number` | `1.0` | Standard deck.gl layer opacity (0.0 to 1.0). |
| **`disableTexture`** | `boolean` | `false` | When `true`, suppresses any generated texture and renders the mesh in plain `color`. Useful for showing neutral grey terrain during mode transitions. |

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
| `raw` | `TypedArray` | The original raster data, kept on the CPU. For terrain this is elevation in metres. |
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

## Type Definitions

### `chroma.Color`
Any color format supported by [chroma.js](https://gka.github.io/chroma.js/), including:
*   Named colors: `'red'`, `'darkblue'`
*   Hex codes: `'#ff0000'`
*   RGB/RGBA arrays: `[255, 0, 0]`, `[255, 0, 0, 128]`
*   Brewer palettes: `'chroma.brewer.Greens'`
