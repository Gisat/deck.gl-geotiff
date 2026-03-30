# Performance Optimization Strategy ─────────────────────────────────────────────────────────────────────

## Problem Statement
Address architectural and API-level optimizations for `geoimage/src/core/lib/BitmapGenerator.ts` and related modules to enable high scalability, parallelism, and smooth user experience for large raster datasets.

## 1. Main Thread Offloading & Parallelism
1.1 Move heavy bitmap/tile processing to Web Workers to prevent UI jank during panning/zooming.
1.2 Batch multiple tiles per worker message to amortize setup cost.
1.3 Use Transferables (TypedArrays) for efficient memory sharing between threads.

## 2. Memory & Buffer Management
2.1 Strictly use TypedArrays for all color and pixel buffers to minimize GC pressure.
2.2 Use Transferables for zero-copy data transfer to workers.
2.3 Optimize partial tile recomposition (edge tiles) with TypedArray.set() instead of manual loops.

## 3. IO & Texture Upload
3.1 Eliminate PNG encoding (canvas.toDataURL) for tiles; use ImageBitmap or direct ImageData for GPU upload.
3.2 Return ImageBitmap/ImageData directly to Deck.gl layers for minimal latency.

## 4. Styling & Computation Offload
4.1 Move per-pixel styling (clipping, heatmaps) to Deck.gl GPU shaders where possible for instant updates.
4.2 Keep CPU-side fallback for environments without shader support.

## 5. SIMD and Low-Level Optimizations
5.1 Explore SIMD (where available) for per-pixel math in workers or main thread.

## 6. API Flexibility
6.1 Optionally expose a "raw buffer only" mode for downstream consumers to handle their own rendering.

## 7. Notes & Considerations
- All architectural changes should be opt-in and backward compatible.
- Benchmark and validate performance/compatibility across browsers and platforms.
- Prioritize user experience: no UI freezes, instant visual feedback, and smooth navigation.
