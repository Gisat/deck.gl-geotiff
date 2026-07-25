# Fix Kernel-Mode Detection at Extended Zoom Levels

**Date:** 2026-07-25  
**Status:** Implemented  
**Branch:** `feature/extend-terrain-max-zoom`  
**Depends on:** commit `20cc879`

---

## Problem

`computeTerrainData` (`TerrainGenerator.ts:321`) uses a hardcoded check `width === 258` to detect kernel-padded elevation data. At native zoom (z=12), kernel data is always 258×258 (256 + 2 padding). But at extended zooms with the scaled tile-size approach, kernel data has different dimensions:

| Zoom | scaledTileSize | requiredSize (kernel) | `width === 258` |
|------|--------------|----------------------|-----------------|
| 12 | 256 | 258 | true |
| 13 | 128 | 130 | **false** → broken |
| 14 | 64 | 66 | **false** → broken |
| 15 | 32 | 34 | **false** → broken |

When the check fails at extended zoom:
1. `isKernel` is false → the default backfill code runs, adding an extra row/col (131×131 instead of 130×130)
2. Back in `generate()`, the options-based `isKernel` IS true, so `extractMeshRaster(terrain, width)` is called
3. `extractMeshRaster` uses the wrong stride because the terrain array dimensions don't match expectations
4. Result: corrupted mesh, incorrect slope/hillshade/relief output

**Affected use case:** Terrain layers with `useSlope`, `useHillshade`, or `useSwissRelief` enabled AND `maxZoom` extended beyond the DEM's native zoom. Plain terrain (OTM draping) is unaffected.

---

## Changes Required

### Single file: `geoimage/src/core/lib/TerrainGenerator.ts`

Only `computeTerrainData` needs changes. Three lines:

**Line 321** — Replace hardcoded kernel check:
```
const isKernel = width === 258;
```
→
```
const isKernel = !!(options.useSlope || options.useHillshade || options.useSwissRelief);
```

**Line 324** — Replace hardcoded 258 with `width`:
```
const outWidth = isKernel ? 258 : (isStitched ? width : width + 1);
```
→
```
const outWidth = isKernel ? width : (isStitched ? width : width + 1);
```

**Line 325** — Replace hardcoded 258 with `height`:
```
const outHeight = isKernel ? 258 : (isStitched ? height : height + 1);
```
→
```
const outHeight = isKernel ? height : (isStitched ? height : height + 1);
```

**Line 323** — Update comment (optional, nice-to-have):
```
// Kernel: 258×258 flat array. ...
```
→
```
// Kernel: flat array with kernel padding. ...
```

### Why this is safe

`generate()` already computes `isKernel` using the exact same expression (`line 20`):
```typescript
const isKernel = !!(options.useSlope || options.useHillshade || options.useSwissRelief);
```

`computeTerrainData` receives the same `options` object. The two methods will always agree on whether the data is kernel-padded.

At native zoom (z=12, width=258) with no kernel flags: `isKernel` = false, `isStitched` = (257 & 256 === 0) = true → outWidth=258 — wait, no. At native zoom without kernel flags, width=257 (256+1 stitching). So:
- `isKernel` = false (no kernel flags)
- `isStitched` = (256 & 255 === 0) = true  
- outWidth = 257 → correct

At native zoom WITH kernel flags, width=258:
- `isKernel` = true (flags set)
- outWidth = 258 → correct (same as before)

At z=13 WITH kernel flags, width=130:
- `isKernel` = true
- outWidth = 130 → correct
- `extractMeshRaster(terrain, 130)` receives 130×130 array → correct

At z=13 WITHOUT kernel flags, width=129:
- `isKernel` = false
- `isStitched` = (128 & 127 === 0) = true
- outWidth = 129 → correct

All cases produce identical results to the pre-change behavior at native zoom, and correct results at extended zoom.

---

## Verification

### Trace through `generate()` at z=13 with kernel mode

1. `requiredSize = 128 + 2 = 130` (CogTiles)
2. `generate({width: 130, ...})`: `isKernel = true` (options-based, line 20)
3. `computeTerrainData({width: 130, ...}, options)`:
   - `isKernel = true` (options-based, same expression)
   - `outWidth = 130`, `outHeight = 130` (NEW: uses width/height, not hardcoded 258)
   - returns 130×130 Float32Array
4. Back in `generate()`: `extractMeshRaster(terrain, 130)` — reads rows 1–129, cols 1–129 from 130×130 array using stride=130
5. Output: 129×129 mesh raster → correct

### Trace through native zoom (backward compatibility)

At z=12, all paths produce identical results to pre-change behavior because:
- width=258 → options check matches (if kernel flags set)
- width=257 → stitched check matches
- width=256 → neither matches → backfill
- The `outWidth`/`outHeight` values based on `width` (not hardcoded 258) produce the same result since at native zoom, kernel width IS 258

---

## No other files needed

The remaining pipeline already handles variable widths dynamically (all changed in the previous commit):

| File | Status |
|---|---|
| `extractMeshRaster` | Already parametrized with `inWidth` |
| `generate()` mesh size calculations | Already use `width - 1` / `width - 2` logic |
| `getMartiniTileMesh` / `getDelatinTileMesh` | Already use dynamic power-of-2 check |
| `getMeshAttributes` | Already uses dynamic power-of-2 check |
| `KernelGenerator` | Already derives IN/OUT from `sqrt(src.length)` |
| `terrain.worker.ts` | Already uses dynamic power-of-2 check |
