# Core Generators Documentation

The processing logic in `deck.gl-geotiff` is split into three specialized static generators. These classes handle the translation from raw GeoTIFF raster buffers into GPU-ready data.

## BitmapGenerator

The `BitmapGenerator` class is responsible for converting multi-band raster data into `ImageBitmap` objects for textures.

### Key Responsibilities
- **Multi-Band Selection**: Can pick single bands for visualization or multiple bands for RGB(A).
- **Color Mapping**: Translates raw pixel values into colors using `chroma-js` scales, categorical mappings, or range-based classification.
- **Dynamic Opacity**: Can map pixel values directly to alpha transparency.

### Performance Optimizations
- **LUT (Look-Up Table)**: For 8-bit (Uint8) data, color calculations are pre-computed into a 256-entry table. This allows processing millions of pixels with simple array lookups instead of expensive color scale calculations.
- **Memory Efficiency**: Returns a `TileResult` object containing an `ImageBitmap` (GPU-ready) and the original `raw` raster `TypedArray` (CPU-side). The `ImageBitmap` is more memory-efficient and faster to upload to the GPU than standard `ImageData` or `Canvas` objects. The `raw` array is a byproduct of rendering — no extra network requests are needed. It is discarded immediately when `pickable: false` (the default), and retained in RAM only when `pickable: true`.
- **Typed Traversal**: Uses typed arrays and minimized object lookups in the main pixel loops.

---

## KernelGenerator

The `KernelGenerator` class performs 3×3 neighborhood operations on elevation rasters, producing derived analytical surfaces (slope, hillshade) as Float32 arrays.

### Input / Output Contract

- **Input**: `Float32Array` of **258×258** elevation values (row-major). The extra 1-pixel border on all sides provides the outer neighbors needed for the 3×3 kernel at every output pixel.
- **Output**: `Float32Array` of **256×256** derived values. Edge pixels of the 258×258 input are used only as kernel neighbors and never appear in the output.

### Algorithms

**`calculateSlope(src, cellSize, zFactor, noDataValue?)`** — Horn's method

Computes slope in degrees (0–90) using a weighted finite-difference gradient across the 3×3 neighborhood:

```
dzdx = ((z3 + 2·z6 + z9) − (z1 + 2·z4 + z7)) / (8 · cellSize)
dzdy = ((z7 + 2·z8 + z9) − (z1 + 2·z2 + z3)) / (8 · cellSize)
slope = atan(zFactor · √(dzdx² + dzdy²)) × (180/π)
```

**`calculateHillshade(src, azimuth, altitude, cellSize, zFactor, noDataValue?)`** — ESRI algorithm

Computes hillshade (0–255) from the sun position defined by azimuth and altitude:

```
zenith  = (90 − altitude) × π/180
aspect  = atan2(dzdy, −dzdx)
hillshade = 255 × (cos(zenith)·cos(slope) + sin(zenith)·sin(slope)·cos(azimuth − aspect))
```

### NoData Propagation

Both methods accept an optional `noDataValue` parameter. If the **center pixel** of a 3×3 neighborhood equals `noDataValue`, the output for that pixel is written as `NaN`. `BitmapGenerator` already skips `NaN` values when building textures, so noData areas render as fully transparent — no false slope/hillshade values appear over void areas.

### Cell Size

Cell size must be in **metres per pixel** in geographic (ground) space, not in deck.gl world units. `CogTiles.getTile` computes this from the tile's `x, y, z` indices using the standard Web Mercator formula:

```
lat = atan(sinh(π · (1 − 2·(y+0.5) / 2^z)))
cellSizeMeters = EARTH_CIRCUMFERENCE / 2^z × cos(lat) / tileSize
```

---

## TerrainGenerator

The `TerrainGenerator` class converts elevation raster data into 3D meshes (vertices, triangles, and attributes).

### Key Responsibilities
- **Elevation Decoding**: Scales and offsets raw values (Int16, Float32) into real-world elevation meters using `multiplier`.
- **Tesselation**: Supports two algorithms:
  - **`Martini`**: Optimized for regular grid data, very fast for on-the-fly generation.
  - **`Delatin`**: A more flexible TIN-based (Triangulated Irregular Network) algorithm for high-quality meshes with fewer triangles.
- **Coordinate Transformation**: Projects local pixel coordinates into spatial coordinates based on tile bounds.

### Technical Features
- **Skirt Generation**: Automatically adds "skirts" (vertical edges) to tiles. This prevents visible cracks between tiles of different detail levels.
- **Safe Elevation Backfilling**: Handles NoData values and ensures consistent elevation at tile borders for seamless stitching.
- **Bounding Box Calculation**: Automatically computes the 3D bounding box for each tile to enable accurate frustum culling.
- **`TileResult` Output**: Returns a `TileResult` where `map` is the mesh geometry (vertices, indices, attributes) sent to the GPU, and `raw` is the source elevation `Float32Array`. The `raw` array is a byproduct of rendering — no extra network requests are needed. It is discarded immediately when `pickable: false` (the default), and retained in RAM only when `pickable: true`.
- **Texture Generation**: `generate()` is async. When visualization options are present in `terrainOptions` (e.g. `useHeatMap`, `colorScale`, `useSingleColor`), it automatically generates a `texture` `ImageBitmap` by cropping the 257×257 elevation raster to 256×256 and passing it through `BitmapGenerator`. The texture is attached to `TileResult.texture` and cached by deck.gl's `TileLayer`. When no visualization options are set, no texture is generated and terrain renders with the flat `color` prop — zero extra cost.
- **Kernel Path**: When `useSlope` or `useHillshade` is active, `generate()` fetches 258×258 elevation pixels (instead of 257×257), delegates gradient computation to `KernelGenerator`, stores the 256×256 derived output in `TileResult.rawDerived`, and passes it to `BitmapGenerator` to produce the tile texture. The 257×257 mesh raster is extracted from rows/cols 1–257 of the 258×258 input — the mesh geometry is unchanged.

---

## Technical Considerations

### Data Types
Both generators use the `TypedArray` union type to ensure high performance. Supported types include `Uint8`, `Int16`, `Float32`, etc.

### Error Handling
- **NoData Values**: Both generators detect and replace NoData pixels with configurable fallback values or transparent colors.
- **Range Safety**: Values are clamped and validated to ensure they don't cause WebGL "NaN" errors during rendering.
