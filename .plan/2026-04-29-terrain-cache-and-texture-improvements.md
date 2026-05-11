# Terrain Cache & Texture Improvements
**Date:** 2026-04-29

---

## Context & Related Plans

This plan continues the work started in the terrain performance series:

- [`2026-04-20-terrain-performance-plan.md`](2026-04-20-terrain-performance-plan.md) — Original 5-item plan (Items 1–4 now implemented; Item 5 = Web Workers, deferred)
- [`2026-04-23-terrain-perf-critical-review.md`](2026-04-23-terrain-perf-critical-review.md) — Code review of the implemented items; source of truth for all bugs and next steps described here
- [`2026-04-10-tile-caching-future-work.md`](2026-04-10-tile-caching-future-work.md) — Earlier TileResult cache spec (predates raster cache; superseded by Step B below)

**Current branch:** `feat/terrain-perf-item4-raster-cache`  
**Confirmed done:** Items 1, 2, 3 from the original plan.

---

## Problem Statement

The raster LRU cache introduced in Item 4 has structural bugs that prevent LRU eviction from
ever running, and the planned follow-on improvements (skip unnecessary texture computation,
TileResult-level caching, wireframe overlay, glaze mask cache) have not yet been implemented.

---

## Step A — Fix Raster Cache Bugs (before merging current branch)

_Files: `CogTiles.ts`_

### 1.1 — Wire `getCachedRaster` / `setCachedRaster` helpers

`getCachedRaster()` and `setCachedRaster()` implement LRU but are **never called**.
All reads/writes currently bypass them via direct `.get()` / `.set()` calls (lines 266, 391, 401).
Replace the direct calls with the helper calls so eviction actually runs.

### 1.2 — Add `fetchSize` to cache key

Current key: `${zoom}/${tileX}/${tileY}` — no size component.

`fetchSize` is constant per `CogTiles` instance (terrain = 257 or 258, bitmap = 256), so in
practice the risk is low. However, if `isKernel` options are toggled dynamically the wrong
size would be silently returned. Fix: `${zoom}/${tileX}/${tileY}/${fetchSize}`.

### 1.3 — Clear raster cache on URL change

`initializeCog` has no `this.rasterCache.clear()`. If an instance were reused with a
different URL, stale rasters would persist. Add a `rasterCache.clear()` call before the
early-return guard.

### 1.4 — Remove remaining debug `console.log` calls

Two debug logs remain in `CogTiles.ts`:
- Line 246: `console.log('getImageIndexForZoomLevel: error in retrieving image by zoom index')`
- Line 381: `console.log(\`error in assigning data to tile buffer: ...\`)`

These fire per tile in hot paths. Replace with `console.warn` / `console.error` or remove.
(`console.error`/`warn` on lines 122, 508, 552, 560, 574, 609 are appropriate and should stay.)

---

## Step B — Replace Raster Cache with TileResult Cache

_Files: `CogTiles.ts`, `types.ts`_  
_Supersedes the spec in `2026-04-10-tile-caching-future-work.md`_

### Why TileResult cache is strictly better

| Pipeline step | Cost | Raster cache saves it? | TileResult cache saves it? |
|---|---|---|---|
| Network + COG decompression | Medium | ✅ | ✅ |
| `computeTerrainData` | Cheap | ✅ | ✅ |
| Tessellation (Martini/Delatin) | **Expensive** | ❌ still runs | ✅ |
| `getMeshAttributes` + `addSkirt` | Medium | ❌ still runs | ✅ |
| `BitmapGenerator.generate()` | Medium | ❌ still runs | Re-run from `raw` only (~fast) |

### Why it WILL get hits

deck.gl's `TileLayer` has its own internal tile cache (`maxCacheSize` prop). When tiles
are evicted (user pans far enough, or `updateTriggers.getTileData` fires), deck.gl calls
`getTileData` → `getTile()` again. That is the same condition under which the existing
raster cache gets hits (confirmed working). A TileResult cache at `getTile()` level will
hit under **identical** conditions.

If hits seem absent during testing, verify that deck.gl is actually evicting tiles (pan
far enough to exceed `maxCacheSize` visible tiles, then return).

### Implementation

#### 2.1 — Remove raster cache infrastructure

- Remove `rasterCache: Map<string, any>` field
- Remove `maxCacheSize` field
- Remove `getCachedRaster()` helper
- Remove `setCachedRaster()` helper
- Remove all `rasterCache.get/set` calls inside `getTileFromImage`

#### 2.2 — Add TileResult cache

```ts
// In CogTiles class fields:
private tileResultCache: Map<string, TileResult> = new Map();
private readonly tileResultCacheMaxSize = 32; // terrain meshes can be several MB each

private getTileResultCacheKey(x: number, y: number, z: number, meshMaxError: number): string {
  return `${z}/${x}/${y}/${meshMaxError}`;
}
```

#### 2.3 — Cache check/set in `getTile()`

Place the cache lookup **before** `getTileFromImage` is called, and the cache set
**after** `geo.getMap()` returns. Store only `map` + `raw` — **not** `texture`
(ImageBitmap cannot be reused across frames and is fast to regenerate from `raw`).

```ts
async getTile(...): Promise<TileResult | null> {
  const cacheKey = this.getTileResultCacheKey(x, y, z, meshMaxError ?? 4.0);

  // LRU hit: refresh order + return
  const cached = this.tileResultCache.get(cacheKey);
  if (cached) {
    this.tileResultCache.delete(cacheKey);
    this.tileResultCache.set(cacheKey, cached);
    return { ...cached, texture: undefined }; // texture re-generated downstream
  }

  // ... full pipeline ...

  const result = await this.geo.getMap(...);
  if (result) {
    // Store without texture
    this.tileResultCache.set(cacheKey, { ...result, texture: undefined });
    // Evict oldest if over limit
    if (this.tileResultCache.size > this.tileResultCacheMaxSize) {
      this.tileResultCache.delete(this.tileResultCache.keys().next().value!);
    }
  }
  return result;
}
```

#### 2.4 — Kernel tile caveat

For kernel tiles (`useSwissRelief` / `useSlope` / `useHillshade`), `BitmapGenerator` needs
the 258×258 kernel-padded raster. On a TileResult cache hit, only `raw` (the 257×257
`meshTerrain`) is available. **Simple path (recommended):** kernel tiles fall back to a full
re-fetch on option changes. Cache hit still skips tessellation for non-option-change revisits.

#### 2.5 — Clear cache on URL change and `meshMaxError` change

- In `initializeCog`: `this.tileResultCache.clear()`
- In `CogTerrainLayer.updateState`: when `meshMaxError` prop changes, call
  `cogTiles.tileResultCache.clear()` (or expose a `clearCache()` method)

#### 2.6 — Type `tileResultCache` value correctly

Use `Map<string, Omit<TileResult, 'texture'>>` or add a dedicated `CachedTileResult` type
to `types.ts`.

---

## Step C — Include `skipTexture` in TileResult Cache Key

_Files: `CogTiles.ts`_

The `tileResultCache` key must include whether the tile was rendered with or without texture.
Without this, a mesh-only tile (cached without texture) could be served to a `terrain+draw`
request, producing a grey mesh, or a textured tile could be returned when wireframe was
expected.

### 3.1 — Extend `getTileResultCacheKey` with `skipTexture` flag

```ts
private getTileResultCacheKey(
  x: number, y: number, z: number,
  meshMaxError: number,
  skipTexture: boolean
): string {
  return `${z}/${x}/${y}/${meshMaxError}/${skipTexture ? '1' : '0'}`;
}
```

### 3.2 — Detect `skipTexture` condition in `CogTerrainLayer`

`skipTexture` is `true` when:
- `this.props.wireframe === true` — mesh drawn as lines, no face texture needed, OR
- `this.props.operation === 'terrain'` — deck.gl geometry-only pass, color buffer not written

Compute in `CogTerrainLayer` and write into `cogTiles.options.skipTexture`. Add to
`updateTriggers.getTileData` so tile data is refetched (using the correct cache key) when
either prop changes. Call `clearTileResultCache()` on change (both the `skipTexture=0` and
`skipTexture=1` halves of the cache remain valid and can be reused if the user switches back).

### 3.3 — Pass `skipTexture` through `getTile()` signature

`getTile(x, y, z, bounds, meshMaxError, signal)` → add `skipTexture: boolean` parameter so
the cache key and the downstream `TerrainGenerator` call both receive it.

---

## Step D — Skip Texture Calculation in Pipeline

_Files: `GeoImage.ts`, `TerrainGenerator.ts`, `types.ts`_

When `skipTexture` is set (wireframe mode or `operation: 'terrain'`), `BitmapGenerator.generate()`
runs inside `TerrainGenerator` but its output is immediately discarded at render time.
This step removes that wasted work.

### 4.1 — Add `skipTexture` to `GeoImageOptions`

```ts
// types.ts
skipTexture?: boolean; // when true, BitmapGenerator is not called; texture will be undefined
```

### 4.2 — Guard in `TerrainGenerator.generate()`

```ts
if (!options.skipTexture) {
  if (isKernel && options.useSwissRelief) { ... }
  else if (isKernel && (options.useSlope || options.useHillshade)) { ... }
  else if (this.hasVisualizationOptions(options)) { ... }
}
// tileResult.texture remains undefined when skipTexture=true
```

### 4.3 — Guard in `resolveVisualizationMode` (`GeoImage.ts`)

```ts
} else if (mergedOptions.type === 'terrain') {
  if (!mergedOptions.skipTexture && !hasKernelMode) {
    resolved.useSingleColor = true;
    resolved.color = mergedOptions.terrainColor;
  }
}
```

### 4.4 — Propagate `skipTexture` into `CogTiles.options` from `CogTerrainLayer`

In `updateState`: whenever `wireframe` or `operation` changes, recompute
`skipTexture = wireframe || operation === 'terrain'` and update `cogTiles.options.skipTexture`.

> **Note:** `operation` is a standard `CompositeLayerProps` field — accessible via
> `this.props.operation`. The values that imply no texture output are `'terrain'` and
> `'mask'`; `'terrain+draw'` and `'draw'` (default) require texture.

---

## Step E — `reliefGlaze` Mask Cache (Part 4 from review)

_Files: `CogTiles.ts`_

`ReliefCompositor.composeSwissRelief()` runs a full kernel neighbourhood pass per tile
per visit — expensive for large viewports. Cache the resulting `reliefMask` Float32Array
(256×256, ~256 KB) to skip re-computation on revisit.

### 5.1 — Add relief mask cache field

```ts
private reliefMaskCache: Map<string, Float32Array> = new Map();
```

Reuse the same key format as the TileResult cache (`z/x/y/meshMaxError` — meshMaxError
is irrelevant for the mask but keeps key logic unified).

### 5.2 — Check/set cache around `composeSwissRelief` in `getTile()`

```ts
const maskKey = this.getTileResultCacheKey(x, y, z, meshMaxError ?? 4.0);
let reliefMask = this.reliefMaskCache.get(maskKey);
if (!reliefMask) {
  reliefMask = ReliefCompositor.composeSwissRelief(...);
  this.reliefMaskCache.set(maskKey, reliefMask);
}
```

### 5.3 — Clear alongside TileResult cache

Clear `reliefMaskCache` in `initializeCog` and on URL change.

---

## Step F — Skip Mesh Calculation for noData / Discard Values ✅ **PLANNED**

_Files: `TerrainGenerator.ts`, `CogTiles.ts`_

Currently, tiles that are fully or partially covered by noData values still run the full
tessellation pipeline (Martini/Delatin) even when every vertex would be a discard/fill value.
This wastes CPU on tiles outside the COG extent or masked areas.

### 6.1 — Detect all-noData tiles before tessellation ✅

After `getTileFromImage` returns, perform a fast no-data check on the selected elevation channel. If the raster contains only noData values, return `null` from `getTile()` early — no mesh, no texture, no cache entry.

**Default heuristic:** runtime default is `'full'` (safe): it scans every pixel to avoid false-empty tiles. Use `'border+center'` when you prefer a faster heuristic; note it may miss small isolated land masses (e.g., archipelagos).

### 6.2 — Detect partially-noData tiles (optional / stretch)

For tiles partially covered by noData, consider clamping noData pixels to the nearest valid
elevation before tessellation (avoids spikes/holes at COG boundaries).

### 6.3 — Integration with TileResult cache

All-noData result (`null`) should NOT be stored in `tileResultCache` — if the COG extent
changes or options change, the tile should be re-evaluated. Only non-null results are cached.

---

## Step G — Web Workers for Tessellation (Deferred)

_See `2026-04-20-terrain-performance-plan.md` Item 5 for full spec._  
Separate PR, after Steps A–F are stable and merged.

---

## Implementation Order & Priority

| Step | What | Files | Priority | Branch | Status |
|---|---|---|---|---|---|
| A | Fix raster cache bugs + remove console.logs | `CogTiles.ts` | **Before merge** | feat/terrain-perf-item4-raster-cache | ✅ Done |
| B | TileResult cache with ref-counted abort (terrain) | `CogTiles.ts`, `types.ts` | High | feat/terrain-perf-tileresult-cache | ✅ Done |
| C | Include `skipTexture` in cache key; detect `wireframe`/`operation='terrain'` condition | `CogTiles.ts`, `CogTerrainLayer.ts` | High | feat/terrain-perf-tileresult-cache | ✅ Done |
| D | Skip `BitmapGenerator` in pipeline when `skipTexture=true` | `GeoImage.ts`, `TerrainGenerator.ts`, `types.ts` | High | feat/terrain-perf-tileresult-cache | ⬜ Pending |
| E | Per-type bitmap caching (raster + relief mask) | `CogTiles.ts` | Medium | feat/terrain-perf-tileresult-cache | ✅ Done |
| F | Skip mesh for noData/discard tiles | `TerrainGenerator.ts`, `CogTiles.ts` | Medium | feat/terrain-perf-tileresult-cache | ✅ Done |
| G | Web Worker tessellation | `TerrainGenerator.ts`, Rollup | Low | separate PR | ⬜ Pending |
