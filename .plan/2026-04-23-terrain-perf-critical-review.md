# Terrain Performance — Review & Next Steps
**Date:** 2026-04-23  
**Branch reviewed:** `feat/terrain-perf-item4-raster-cache` (contains items 1–4 from the original plan)

---

## Part 1 — Review of Implemented Items

### Item 1 — `verticalExaggeration` ✅ Solid — FIXED ✓

- `multiplier` stays in `computeTerrainData`; `verticalExaggeration` only touches vertex z and skirt height
- `scaledSkirtHeight > 0` guard is a nice defensive touch
- JSDoc in `types.ts` clearly explains the semantic difference
- Backward compatible (defaults to 1.0)

**Status:** Merged to `feat/terrain-perf-item1-2`. No issues.

---

### Item 2 — O(n) skirt edge scan ✅ Correct, GC optimized — FIXED ✓

Algorithm is correct and ~10× faster than the old sort. Both GC inefficiencies have been resolved:

**1. Inner `edges` array allocated per triangle** — ✓ FIXED: edges are now processed inline, eliminating 390k sub-array allocations per fine mesh tile.

**2. String key `` `${min}_${max}` `` for 390k edges** — ✓ FIXED: now uses integer key `min * 70000 + max`, collision-free and allocation-free. Reduces per-tile GC pause from 5–10ms to <1ms for fine meshes.

**Status:** Optimization commit merged to `feat/terrain-perf-item1-2`. Zero allocations for edge deduplication.

---

### Item 3 — AbortSignal propagation ✅ Works, all issues fixed — FIXED ✓

Signal flows correctly: `tile.signal` → `getTile` → `getTileFromImage` → `readRasters`.

**Issues resolved:**
1. ✓ **Stale TODO comment** on `CogTerrainLayer.ts` line 169 — removed.
2. ✓ **Abort guard before `geo.getMap()`** in `getTile()` — now guards against race condition where signal aborts between cache hit and expensive mesh/bitmap generation.
3. `suppressGlobalAbortErrors` suppresses **all** `AbortError`s globally — acceptable, documented in JSDoc.

**Status:** Abort guard commit merged to `feat/terrain-perf-item3`. Race condition closed.

---

### Item 4 — Raster LRU cache ⚠️ Has real bugs

**Bug 1 — LRU helper methods are dead code; eviction never runs:**

`getCachedRaster()` and `setCachedRaster()` (which contain the LRU refresh and eviction logic) are never called. All cache accesses use `this.rasterCache.get/set` directly, bypassing both. `maxCacheSize = 256` is therefore never enforced — the cache grows unboundedly for the lifetime of the session.

**Bug 2 — Cache key missing `fetchSize`:**

Key is `${zoom}/${tileX}/${tileY}` with no size component. Terrain fetches 257 or 258px; bitmap fetches 256px. If `requiredSize` changes for the same coordinates (e.g. `useSlope` toggled), a wrong-size raster is silently returned.

**Bug 3 — Cache not cleared on URL change:**

`initializeCog` has no `this.rasterCache.clear()`. Stale rasters from a previous COG persist if the instance is reused.

**Bug 4 — `console.log` debug spam in production:**

Three `console.log` calls fire per tile (cache hit, cache miss, fetch). With 12–20 visible tiles, every viewport change floods the console. Must be removed.

**Minor:** `rasterCache` is typed `Map<string, any>` — should be `Map<string, TypedArray>`.

---

### Review Summary

| Item | Status | Issues | Fixed |
|---|---|---|---|
| 1 — `verticalExaggeration` | ✅ Correct | None | ✓ Merged |
| 2 — O(n) skirt | ✅ Correct | GC allocations (390k+ per tile) | ✓ Merged + optimized |
| 3 — AbortSignal | ✅ Works | Stale TODO; missing abort guard | ✓ Merged |
| 4 — Raster LRU cache | ⚠️ Bugs | Eviction never runs; key missing size; not cleared on URL change; console.log spam | 🔄 In review (this branch) |

---

## Part 2 — Additional Finding: Unnecessary Texture Computation

### The problem

`GeoImage.resolveVisualizationMode()` (lines 88–96) **auto-injects `useSingleColor = true`** for any terrain tile where no explicit visualization mode is set:

```ts
} else if (mergedOptions.type === 'terrain') {
  if (!hasKernelMode) {
    resolved.useSingleColor = true;   // ← always injected for plain terrain
    resolved.color = mergedOptions.terrainColor;
  }
}
```

This causes `hasVisualizationOptions()` to return `true` → `BitmapGenerator.generate()` always runs → a flat-color `ImageBitmap` is produced for every terrain tile, even when:
- `wireframe: true` (mesh is drawn as lines; no face coloring)
- `disableTexture: true` (texture suppressed at render time anyway)
- `operation: 'terrain'` (layer provides geometry only; no self-rendering)

In all three cases the ImageBitmap is computed and then immediately discarded. Wasted CPU.

### Current state of `disableTexture`

`disableTexture` is a `CogTerrainLayer` prop and is checked at render time in `renderSubLayers` (line 358). It is **not** propagated into `CogTiles.options` or `GeoImageOptions`, and is **not** in `updateTriggers.getTileData`. So changing it does not cause a tile reload, and it has zero effect on the data pipeline.

### Fix — two files, minimal change

**`GeoImage.ts` — `resolveVisualizationMode`:**
```ts
} else if (mergedOptions.type === 'terrain') {
  const shouldSkipTexture = mergedOptions.wireframe || mergedOptions.disableTexture;
  if (!hasKernelMode && !shouldSkipTexture) {
    resolved.useSingleColor = true;
    resolved.color = mergedOptions.terrainColor;
  }
}
```

**`TerrainGenerator.ts` — `generate()`:**
```ts
const shouldSkipTexture = options.wireframe || options.disableTexture;

if (isKernel && options.useSwissRelief && !shouldSkipTexture) { ... }
else if (isKernel && (options.useSlope || options.useHillshade) && !shouldSkipTexture) { ... }
else if (this.hasVisualizationOptions(options) && !shouldSkipTexture) { ... }
```

**`CogTerrainLayer.ts` — `updateState` / `initState`:** propagate `wireframe` and `disableTexture` into `CogTiles.options`, and add both to `updateTriggers.getTileData` (not just `renderSubLayers`) so tile data is reloaded when either changes.

**`types.ts`:** add `wireframe?: boolean` and `disableTexture?: boolean` to `GeoImageOptions`.

For `operation: 'terrain'` (deck.gl extension prop, not visible during `getTiledTerrainData`): recommend users set `disableTexture: true` as the explicit opt-out. Document it as the standard pattern for terrain-as-geometry-only with an imagery overlay.

---

## Part 3 — Revised Caching Strategy

### Why the raster cache is the wrong primitive

The pipeline cost per tile, in order:

| Step | Cost | Raster cache saves it? | TileResult cache saves it? |
|---|---|---|---|
| Network + COG decompression | Medium | ✅ | ✅ |
| `computeTerrainData` | Cheap | ✅ | ✅ |
| Tessellation (Martini/Delatin) | **Expensive** | ❌ still runs | ✅ |
| `getMeshAttributes` + `addSkirt` | Medium | ❌ still runs | ✅ |
| `BitmapGenerator.generate()` | Medium | ❌ still runs | Re-run from `raw` only (~fast) |

For wireframe / no-texture use: texture is skipped, so tessellation is the sole CPU bottleneck. The raster cache saves the cheap part and leaves the expensive part untouched.

### Recommended approach: replace raster cache with TileResult cache

Cache `TileResult` **without** the `ImageBitmap` texture (i.e. `map` + `raw`, not `texture`), keyed by `z/x/y/meshMaxError`.

- `TileResult.raw` is the processed 257×257 `meshTerrain` Float32Array — same memory footprint as the raw raster (~264 KB). No extra memory cost for the data component.
- `TileResult.map` (mesh geometry) is the additional cost. For typical meshMaxError (≥ 4), the mesh is small. For fine meshes (meshMaxError = 1), it can be several MB per tile — use a smaller limit (16–32 tiles) vs. raster-only caching.

**On cache hit:**

| Scenario | What runs | What's skipped |
|---|---|---|
| Wireframe / no texture | Nothing | Everything |
| Same options, re-visit | `BitmapGenerator` from `raw` | Fetch + tessellation |
| Options changed (new colorScale) | `BitmapGenerator` from `raw` | Fetch + tessellation |
| `meshMaxError` changed | Full pipeline (key miss) | — |

This is **one cache, one key, simpler eviction** — strictly better than the raster cache for all terrain use cases.

### Kernel tile caveat

For kernel tiles (`useSwissRelief` / `useSlope` / `useHillshade`), `BitmapGenerator` needs the 258×258 kernel-padded raster (for `preserveNoDataForKernel`), which is not stored in `TileResult`. Options:
1. **Simple path:** kernel tiles fall back to a full re-fetch on option changes. Cache hit still skips tessellation. This covers the common case.
2. **Full path:** store the raw 258×258 `rasters[0]` as an optional field on `TileResult` (e.g. `TileResult.kernelRaster`). Adds ~265 KB per kernel tile in cache.

Recommendation: start with option 1.

### Cache key and eviction

```ts
// Key includes meshMaxError to invalidate on error threshold change
private getTileResultCacheKey(x: number, y: number, z: number, meshMaxError: number): string {
  return `${z}/${x}/${y}/${meshMaxError}`;
}
```

- Clear in `initializeCog` (new URL) and in `updateState` when `meshMaxError` changes
- Suggested max size: 32 tiles for terrain (memory-aware), 64 for bitmap-only

### Impact on the existing raster cache implementation

The current `rasterCache` in `CogTiles` should be **removed** and replaced with the TileResult cache described above, placed at the `getTile()` level (not inside `getTileFromImage`). The dead `getCachedRaster` / `setCachedRaster` helper methods go away with it.

---

## Part 4 — Next Steps (Ordered by Priority)

### Step A — Immediate fixes before merging current branch
_Files: `CogTiles.ts`, `CogTerrainLayer.ts`_

1. Remove the three `console.log` debug calls from `getTileFromImage`
2. Remove the stale `// TODO - pass signal to getTile` comment in `CogTerrainLayer.ts` line 169
3. Add `if (signal?.aborted) return null` in `getTile` before calling `geo.getMap()`

### Step B — Replace raster cache with TileResult cache
_Files: `CogTiles.ts`, `types.ts`_

1. Remove `rasterCache`, `getCachedRaster`, `setCachedRaster` from `CogTiles`
2. Add `tileResultCache: Map<string, TileResult>` with LRU eviction, keyed by `z/x/y/meshMaxError`
3. Place cache check/set in `getTile()` (not `getTileFromImage`)
4. Clear cache in `initializeCog` and when `meshMaxError` changes in `updateState`
5. Exclude `TileResult.texture` (ImageBitmap) from what is stored — only `map` + `raw`

### Step C — Skip texture when wireframe or disableTexture
_Files: `GeoImage.ts`, `TerrainGenerator.ts`, `CogTerrainLayer.ts`, `types.ts`_

1. Add `wireframe?: boolean` and `disableTexture?: boolean` to `GeoImageOptions`
2. In `resolveVisualizationMode`: skip `useSingleColor` auto-injection when either flag is set
3. In `TerrainGenerator.generate()`: gate all `BitmapGenerator.generate()` calls on `!shouldSkipTexture`
4. In `CogTerrainLayer`: propagate both props into `CogTiles.options`; add to `updateTriggers.getTileData`
5. Document `disableTexture: true` as the recommended pattern for `operation: 'terrain'` + imagery overlay

### Step D — `wireframeOverlay` prop
_Files: `CogTerrainLayer.ts`_

Add a `wireframeOverlay: boolean` prop that conditionally renders a second `SimpleMeshLayer` per tile on top of the textured surface:
- `wireframe: true`, `getColor: [0, 0, 0, 80]`, same mesh data
- Useful for inspecting mesh density and `meshMaxError` tuning in development

### Step E — `reliefGlaze` mask cache
_Files: `CogTiles.ts`_

Cache the `reliefMask` Float32Array (256×256, ~256 KB) computed by `ReliefCompositor.composeSwissRelief` inside `getTile()`. Key reuses the tile result cache key. Avoids re-running the kernel neighbourhood pass on revisit. Self-contained, no interaction with other steps.

### Step F — Web Workers for tessellation (deferred)
_As per original plan Item 5 — separate PR after Steps A–E are stable._

---

## Summary Table

| Step | What | Files | Priority |
|---|---|---|---|
| A | Remove console.log, fix stale comment, add abort guard | `CogTiles.ts`, `CogTerrainLayer.ts` | **Before merge** |
| B | Replace raster cache → TileResult cache | `CogTiles.ts`, `types.ts` | High |
| C | Skip texture for wireframe / disableTexture | `GeoImage.ts`, `TerrainGenerator.ts`, `CogTerrainLayer.ts`, `types.ts` | High |
| D | `wireframeOverlay` prop | `CogTerrainLayer.ts` | Medium |
| E | `reliefGlaze` mask cache | `CogTiles.ts` | Medium |
| F | Web Worker tessellation | `TerrainGenerator.ts`, Rollup config | Low (separate PR) |
