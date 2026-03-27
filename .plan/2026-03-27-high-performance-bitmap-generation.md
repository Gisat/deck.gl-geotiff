# Plan: High-Performance Bitmap Generation

## Problem Statement
This plan addresses:
- [Issue #98](https://github.com/Gisat/deck.gl-geotiff/issues/98): "Invisible 15-band COG" — Ensuring all bands are correctly detected and rendered by distinguishing between planar and interleaved layouts.
- [Issue #83](https://github.com/Gisat/deck.gl-geotiff/issues/83): "Performance: Bitmap generation GC/allocations" — Reducing garbage collection and improving rendering speed by minimizing allocations and optimizing LUT usage.

Improve bitmap generation performance and correctness in the presence of multi-band COGs, large scientific rasters, and interactive map panning. Address memory layout detection, LUT efficiency, and allocation minimization.

## 1. In-Place Hot Path Optimizations
1.1 Profile and minimize allocations in per-pixel and per-tile loops (avoid array spreading, reuse buffers).
1.2 Refactor LUT logic for both 8-bit and 16/32-bit data to minimize recomputation and maximize cache efficiency.
1.3 Inline or hoist invariant calculations outside of loops (e.g., alpha, color scale setup).
1.4 Replace repeated chroma.js calls with precomputed color arrays where possible.
1.5 Standardize and clarify variable naming for read/write indices.

## 2. Memory Layout & Channel Handling
2.1 Robustly detect planar vs. interleaved layouts; support both efficiently.
2.2 Dynamically compute stride and sampleIndex for all layouts.
2.3 Move RGB(A) and single-band logic into specialized helpers for clarity and JIT optimization.

## 3. LUT System Enhancements
3.1 Use N=1024 LUT for high-res color mapping (float/16-bit), 256 for 8-bit.
3.2 Precompute LUTs per tile, not per pixel.
3.3 Consider typed array pooling for LUTs to reduce GC pressure.

## 4. Debugging & Verification
4.1 Add targeted benchmarks and micro-profiling hooks.
4.2 Test with large, multi-band, and scientific rasters.
4.3 Validate output visually and numerically against reference images.

1.1 Detect memory layout (`isPlanar`) to distinguish between planar and interleaved rasters.
1.2 Calculate stride dynamically:
    - Interleaved: `stride = numAvailableChannels`
    - Planar: `stride = 1`
1.3 Initialize `sampleIndex` at `options.useChannelIndex` for correct band selection.
1.4 Move RGB logic into specialized helpers (`renderInterleavedImagery`, `renderPlanarImagery`).

## 2. N=1024 LUT (Look-Up Table) System
2.1 Set `LUT_SIZE = 1024` for high-resolution color mapping.
2.2 Precompute LUT once per tile, mapping `colorScaleValueRange` linearly.
2.3 In main loop, use normalized `t` to index LUT: `index = Math.floor(t * (LUT_SIZE - 1)) * 4`.
2.4 Maintain a separate 256-entry LUT for 8-bit data.

## 3. Zero-Allocation Refactoring
3.1 Remove array spreading (`[...]`) in per-pixel loops.
3.2 Implement `writeSingleColor(destBuffer, offset, ...)` for direct buffer writes.
3.3 Standardize variable names: `sampleIndex` (read), `destIdx` (write).

## 4. Debugging & Verification
4.1 Use VS Code debugger with `launch.json` for breakpoints in helpers.
4.2 Test with 15-band COGs and large scientific rasters.

## Notes & Considerations
- All optimizations must preserve correctness for both single-band and multi-band rasters.
- Prioritize zero-GC allocations in hot paths.
- Architectural changes (workers, batching) should be opt-in and backward compatible.
- Ensure all logic is compatible with both single-band and multi-band rasters.
- Prioritize zero-GC allocations in hot paths.
- Validate visual output for both scientific and RGB(A) imagery.
