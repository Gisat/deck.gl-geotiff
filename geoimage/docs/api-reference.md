# API Reference

This document outlines the configuration options for the core `GeoImage` processing engine used by both `CogBitmapLayer` and `CogTerrainLayer`.

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
| **`multiplier`** | `number` | `1.0` | Multiplies each data value by this factor (e.g. vertical exaggeration). Used in calculating elevation. |
| **`terrainSkirtHeight`** | `number` | `100` | Height (in meters) of the "skirt" around tiles to hide cracks. |
| **`terrainMinValue`** | `number` | `0` | Default value to use if elevation data is missing. |

### Opacity
**Setting opacity for terrain layers**: The Terrain layer is an ordinary Deck.gl layer instance, so `opacity` is a common prop.

---

## Type Definitions

### `chroma.Color`
Any color format supported by [chroma.js](https://gka.github.io/chroma.js/), including:
*   Named colors: `'red'`, `'darkblue'`
*   Hex codes: `'#ff0000'`
*   RGB/RGBA arrays: `[255, 0, 0]`, `[255, 0, 0, 128]`
*   Brewer palettes: `'chroma.brewer.Greens'`
