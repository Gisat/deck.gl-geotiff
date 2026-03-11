# Core Generators Documentation

The processing logic in `deck.gl-geotiff` is split into two specialized static generators. These classes handle the translation from raw GeoTIFF raster buffers into GPU-ready data.

## BitmapGenerator

The `BitmapGenerator` class is responsible for converting multi-band raster data into `ImageBitmap` objects for textures.

### Key Responsibilities
- **Multi-Band Selection**: Can pick single bands for visualization or multiple bands for RGB(A).
- **Color Mapping**: Translates raw pixel values into colors using `chroma-js` scales, categorical mappings, or range-based classification.
- **Dynamic Opacity**: Can map pixel values directly to alpha transparency.

### Performance Optimizations
- **LUT (Look-Up Table)**: For 8-bit (Uint8) data, color calculations are pre-computed into a 256-entry table. This allows processing millions of pixels with simple array lookups instead of expensive color scale calculations.
- **Memory Efficiency**: Returns `ImageBitmap` directly, which is more memory-efficient and faster to upload to the GPU than standard `ImageData` or `Canvas` objects.
- **Typed Traversal**: Uses typed arrays and minimized object lookups in the main pixel loops.

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

---

## Technical Considerations

### Data Types
Both generators use the `TypedArray` union type to ensure high performance. Supported types include `Uint8`, `Int16`, `Float32`, etc.

### Error Handling
- **NoData Values**: Both generators detect and replace NoData pixels with configurable fallback values or transparent colors.
- **Range Safety**: Values are clamped and validated to ensure they don't cause WebGL "NaN" errors during rendering.
