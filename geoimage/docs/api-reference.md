# API Reference

This document outlines the configuration options for the core `GeoImage` processing engine used by both `CogBitmapLayer` and `CogTerrainLayer`.

## Common Options

All options below are passed via the `cogBitmapOptions` (for bitmap layers) or `terrainOptions` (for terrain layers) object.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useChannel`** | `number` \| `null` | `null` | Index of the channel to visualize. Defaults to `null` (RGB/RGBA). |
| **`multiplier`** | `number` | `1.0` | Multiplies each data value by this factor. |
| **`blurredTexture`** | `boolean` | `true` | If `true` (default), uses `GL.LINEAR` for smooth pixels. If `false`, uses `GL.NEAREST` for pixelated look. |

### Visualization Modes

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`useHeatMap`** | `boolean` | `true` | Renders single-channel data as a color heatmap. |
| **`useSingleColor`** | `boolean` | `false` | Renders all data values in a single solid color. |
| **`color`** | `ChromaColor` | `magenta` | The solid color to use when `useSingleColor` is `true`. |
| **`useAutoRange`** | `boolean` | `false` | Automatically calculates min/max values for color scaling. **Note:** Range is calculated per-tile (separately for each image), not globally. For consistent visualization across large areas, it is recommended to set identifying `colorScaleValueRange` manually. |

### Colors & Classification

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`colorScale`** | `ChromaColor[]` | - | Array of colors for the heatmap gradient. |
| **`colorScaleValueRange`** | `number[]` | `[0, 255]` | Min and Max values for the color scale (if `useAutoRange` is false). |
| **`clipLow`** | `number` \| `null` | `null` | Hide values below this threshold. |
| **`clipHigh`** | `number` \| `null` | `null` | Hide values above this threshold. |
| **`clippedColor`** | `ChromaColor` | `transparent` | Color for values outside of the clip range. |
| **`nullColor`** | `ChromaColor` | `transparent` | Color for NoData values. |

### Thematic Coloring

| Option | Type | Default | Exact Usage |
| :--- | :--- | :--- | :--- |
| **`useColorsBasedOnValues`** | `boolean` | `false` | Enable exact value matching. |
| **`colorsBasedOnValues`** | `[number, Color][]` | `[]` | Map exact values to colors. `[[1, 'red'], [2, 'blue']]` |
| **`useColorClasses`** | `boolean` | `false` | Enable range-based classification. |
| **`colorClasses`** | `[Color, [min, max]][]` | `[]` | Map ranges to colors. `[['red', [0, 10]], ['blue', [10, 20]]]` |
| **`unidentifiedColor`** | `ChromaColor` | `transparent` | Color for values that don't match any class or value rule. |

### Transparency & Opacity

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`alpha`** | `number` | `100` | Global opacity (0-100) if `useDataForOpacity` is false. |
| **`useDataForOpacity`** | `boolean` | `false` | Maps pixel intensity to opacity (0=transparent, max=opaque). |

---

## Terrain Specific Options

These options apply specifically to `CogTerrainLayer`.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`terrainSkirtHeight`** | `number` | `100` | Height (in meters) of the "skirt" around tiles to hide cracks. |
| **`terrainMinValue`** | `number` | `0` | Default value to use if elevation data is missing. |

---

## Type Definitions

### `ChromaColor`
Any color format supported by [chroma.js](https://gka.github.io/chroma.js/), including:
*   Named colors: `'red'`, `'darkblue'`
*   Hex codes: `'#ff0000'`
*   RGB/RGBA arrays: `[255, 0, 0]`, `[255, 0, 0, 128]`
*   Brewer palettes: `'chroma.brewer.Greens'`
