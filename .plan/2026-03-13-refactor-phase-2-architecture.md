# Refactor Checklist: Phase 2 (Architecture & Performance)

This document outlines the **secondary** improvements for the `refactor/geoimage-structure` branch. These items focus on architectural purity, memory management, and advanced performance optimizations.

## 1. Architectural Cleanup

- [ ] **1.1 Remove Full-File Fetch Pattern (`GeoImage.ts`)**
  - **Issue:** `setUrl` uses `response.arrayBuffer()`, which is extremely dangerous for large (GB-scale) GeoTIFFs as it downloads the entire file into memory.
  - **Fix:** Refactor `GeoImage.setUrl` and `GeoImage.getMap` to consistently use the streaming `fromUrl` approach from `geotiff.js`.
- [ ] **1.2 Streamline Interface Between `CogTiles` and `GeoImage`**
  - **Issue:** Data is currently passed as `rasters: [tileData[0]]`, which is a bit opaque.
  - **Fix:** Standardize the "input" object to better reflect multi-band COG structures and avoid unnecessary array wrapping.

## 2. Advanced Performance (GC & Memory)

- [ ] **2.1 Reduce Allocation Pressure (Buffer Pooling)**
  - **Issue:** `createTileBuffer` is called for every band of every tile. This creates significant Garbage Collection (GC) pressure during map movement.
  - **Fix:** Implement a simple object pool for tile buffers or allocate a single interleaved buffer for all bands at once.
- [ ] **2.2 Investigate Terrain Buffer Quantization**
  - **Issue:** `TerrainGenerator` always uses `Float32Array` (4 bytes per vertex).
  - **Fix:** If the source GeoTIFF is `Int16` (common for DEMs), investigate using `Int16Array` or `Uint16Array` for the intermediate terrain buffer to save 50% memory.

## 3. Documentation Sync

- [ ] **3.1 Verify `api-reference.md` against Types**
  - **Check:** Ensure all new options in `types.ts` (like `useChannelIndex`, `tesselator`, etc.) are fully documented in the API reference.
- [ ] **3.2 Update `PERFORMANCE_OPTIMIZATION_PLAN.md`**
  - **Action:** Mark "ImageBitmap" as **Complete** (since it is already implemented in `BitmapGenerator.ts`).
  - **Action:** Add the Phase 1 critical bugs to the historical context.
- [ ] **3.3 Finalize `LIBRARY_ARCHITECTURE.md`**
  - **Check:** Ensure the Mermaid diagram accurately reflects the final relationship between `CogTiles`, `GeoImage`, and the Generators.

---
**Status:** 🟡 Phase 2: Planned
**Focus:** Architectural Purity and Performance
