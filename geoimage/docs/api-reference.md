# API Reference

This document outlines the configuration options for the core processing engines. The library is split into two specialized generators that handle data decoding and preparation for WebGL.

## Processing Overview

The configuration options below define how the raw GeoTIFF data is interpreted by the internal processing engines. These options are handled by two specialized generators:

- **`BitmapGenerator`**: Decodes and maps raster data into `ImageBitmap` textures.
- **`TerrainGenerator`**: Converts elevation data into 3D meshes using `Martini` or `Delatin`.

For a deep dive into the technical implementation and performance optimizations, see the **[Internal Architecture](generators.md)** guide.

---

## Channel Selection (Common)

These options select which band of the GeoTIFF to use. Shared by both Bitmap and Terrain layers. **All parameters are optional.**

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useChannel`** | `number` \| `null` | `null` | **Optional**. 1-based index of the channel to visualize (e.g. `1` for the first channel). Defaults to `null` (RGB/RGBA). |
| **`useChannelIndex`** | `number` \| `null` | `null` | **Optional**. 0-based index of the channel to visualize (e.g. `0` for the first channel). Alternative to `useChannel`. |

## Bitmap Specific Options

These options apply specifically to `CogBitmapLayer` or when generating textures. **All parameters are optional.**

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
| **`colorClasses`** | `[chroma.Color, [min, max]][]` | `[]` | Map ranges to colors. `[['red', [0, 10]], ['blue', [10, 20]]]` |
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

### Layer Props (CogTerrainLayer)

These properties are set directly on the `CogTerrainLayer` instance, not within the `terrainOptions` object.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`meshMaxError`** | `number` | `4.0` | Martini/Delatin error tolerance in meters. Smaller number -> more detailed mesh (higher triangle count). |
| **`opacity`** | `number` | `1.0` | Standard deck.gl layer opacity (0.0 to 1.0). |

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
| `raw` | `TypedArray` | The original raster data, kept on the CPU. |
| `width` | `number` | Tile width in pixels. |
| `height` | `number` | Tile height in pixels. |

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

Terrain tile content is a tuple `[TileResult | null, TextureSource | null]`. Use `info.uv` when available, or fall back to `info.coordinate` + tile bbox.

```typescript
const layer = new CogTerrainLayer({
  id: 'terrain',
  elevationData: 'https://example.com/dem.tif',
  isTiled: true,
  pickable: true,
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
        console.log('Elevation at click:', raw[y * width + x]);
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
