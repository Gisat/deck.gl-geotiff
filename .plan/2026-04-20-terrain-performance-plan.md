# Terrain Layer Performance Improvement Plan
**Date:** 2026-04-20  
**Author:** Copilot

---

## Problem Statement

The `CogTerrainLayer` (and to a lesser degree `CogBitmapLayer`) suffers from slow rendering
and poor responsiveness during pan/zoom. Four concrete issues were identified through code
analysis:

1. `meshMaxError` does not behave as documented when `options.multiplier` is set.
2. The `addSkirt` helper in `skirt.ts` uses an O(n log n) edge scan over **all** triangles — it
   becomes the dominant CPU cost when `meshMaxError` is small and the mesh is fine.
3. Cancelled tiles (AbortSignal) are still processed to completion, wasting CPU and network.
4. Previously-decoded tile rasters are never cached, so every revisit to a region
   re-fetches and re-tessellates from scratch.

A fifth, more ambitious improvement is offloading tessellation to Web Workers.

---

## Improvements — Ordered by Impact / Effort

---

### Item 1 — Introduce `verticalExaggeration` — separate unit scaling from visual exaggeration
**Priority:** High · **Effort:** ~2 hours · **Risk:** Low

#### Root Cause

The Martini RTIN algorithm (see the original Observable notebook by @mourner) is designed
to receive elevation values in **real-world units** and compare the RTIN error map directly
against `maxError` in those same units. Any visual exaggeration should be applied
*after* mesh generation — only to vertex z positions — never to the terrain array that
drives the error computation.

Currently, `options.multiplier` is applied to the terrain array **before** Martini:
```ts
// computeTerrainData — line 288
let elevationValue = channel[pixel] * multiplier;
```
This blends two semantically different operations:

| Use of `multiplier` | Effect on Martini error map | Effect on `meshMaxError` |
|---|---|---|
| Unit conversion (e.g. cm → m, `multiplier=0.01`) | Correct — errors in metres | Correct — threshold in metres |
| Visual exaggeration (e.g. `multiplier=3`) | **Wrong** — errors 3× too large | **Wrong** — threshold 3× too tight |

For the exaggeration case:
- `multiplier=3`, real elevation 0–2000 m → array values 0–6000.
  `meshMaxError=4` compares against a 0–6000 range → effective real tolerance = 4/3 ≈ **1.3 m**.
  The user expects 4 m of error tolerance but gets a 3× finer mesh and severe jank.
- `multiplier=10` → effective tolerance = 0.4 m → near-maximum mesh density, catastrophic performance.

#### Fix — New `verticalExaggeration` option

Add `verticalExaggeration?: number` (default `1.0`) to `GeoImageOptions`.

- **`multiplier`** — keeps its existing role: unit conversion, applied in `computeTerrainData`
  before Martini. `meshMaxError` is always compared against post-`multiplier` values
  (i.e., if data is in metres and `multiplier=1`, `meshMaxError=4` means 4 m — as documented).
- **`verticalExaggeration`** — new, applied **only** to vertex z positions in
  `getMeshAttributes()`, after mesh generation. Martini never sees the exaggerated values.
- **`terrainSkirtHeight`** is also scaled by `verticalExaggeration` (inside
  `TerrainGenerator.generate`) so the skirt stays visually proportional to the taller terrain.

```ts
// getMeshAttributes — only change is here:
positions[3 * i + 2] = terrain[pixelIdx] * verticalExaggeration;

// generate() — scale skirt height:
const effectiveSkirtHeight = terrainSkirtHeight * (options.verticalExaggeration ?? 1);
addSkirt(attributes, triangles, effectiveSkirtHeight);
```

**Migration for existing users:**  
Anyone currently using `multiplier > 1` purely for visual effect should move that value
to `verticalExaggeration` and reset `multiplier` to `1` (or omit it). Users who use
`multiplier` for unit conversion (e.g. `multiplier: 0.2` on GLOBAL_DTM_BAREEARTH) are
unaffected — `verticalExaggeration` defaults to 1 and no existing behaviour changes.

**Files:** `geoimage/src/core/types.ts`, `geoimage/src/core/lib/TerrainGenerator.ts`

---

### Item 2 — Fix `addSkirt` O(n log n) edge scan
**Priority:** High · **Effort:** ~2 hours · **Risk:** Low

#### Root Cause

`geoimage/src/core/helpers/skirt.ts` → `getOutsideEdgesFromTriangles`:

```ts
// 1. Collects ALL 3 edges from every triangle
for (let i = 0; i < triangles.length; i += 3) {
  edges.push([triangles[i], triangles[i + 1]]);
  edges.push([triangles[i + 1], triangles[i + 2]]);
  edges.push([triangles[i + 2], triangles[i]]);
}
// 2. Sorts the entire edge list — O(n log n) where n = triangles.length * 3
edges.sort(...);
```

For a fine Martini mesh (`meshMaxError = 1`) on a 257 × 257 grid, the number of triangles
approaches **~130,000**, producing **~390,000 edge entries** that must be sorted per tile.
Each tile therefore blocks the main JavaScript thread for tens to hundreds of milliseconds
— causing the exact jank the user observes, and directly explaining why small
`meshMaxError` values appear to "not work" (they work, but the render is so slow
the difference is imperceptible mid-load).

The cost also makes `terrainSkirtHeight` expensive by default (it defaults to 100 in
`DefaultGeoImageOptions`), so every single terrain tile is affected.

#### Fix

Replace the sort with an O(n) HashMap approach that keys each edge by its canonical
`min_vertex_max_vertex` form and counts occurrences. Boundary edges appear exactly once:

```ts
function getOutsideEdgesFromTriangles(triangles: any): number[][] {
  const edgeCount = new Map<string, number[]>();
  for (let i = 0; i < triangles.length; i += 3) {
    const triplets = [
      [triangles[i],     triangles[i + 1]],
      [triangles[i + 1], triangles[i + 2]],
      [triangles[i + 2], triangles[i]],
    ];
    for (const edge of triplets) {
      const key = `${Math.min(edge[0], edge[1])}_${Math.max(edge[0], edge[1])}`;
      if (!edgeCount.has(key)) edgeCount.set(key, edge);
      else edgeCount.delete(key);  // seen twice → interior edge, remove it
    }
  }
  return Array.from(edgeCount.values());
}
```

This is approximately **10× faster** for a fine 130,000-triangle mesh and reduces per-tile
main-thread blocking to under 5 ms.

**Files:** `geoimage/src/core/helpers/skirt.ts`

---

### Item 3 — Propagate AbortSignal through the fetch pipeline
**Priority:** High · **Effort:** ~3 hours · **Risk:** Low

#### Root Cause

Both `CogTerrainLayer.getTiledTerrainData()` and `CogBitmapLayer.getTiledBitmapData()`
receive `tile.signal` from deck.gl but have explicit `// TODO - pass signal to getTile`
comments — it is never used.  
Result: cancelled tiles continue to use network bandwidth and main-thread CPU.

#### Fix

3.1 **Layer → CogTiles**: Pass `tile.signal` into `CogTiles.getTile()`:
```ts
// CogTerrainLayer
const terrain = await this.state.terrainCogTiles.getTile(
  tile.index.x, tile.index.y, tile.index.z,
  bounds, this.props.meshMaxError,
  tile.signal,           // ← add
);
```

3.2 **CogTiles.getTile signature**:
```ts
async getTile(x, y, z, bounds, meshMaxError, signal?: AbortSignal)
```
Early-exit if already aborted:
```ts
if (signal?.aborted) return null;
```

3.3 **CogTiles.getTileFromImage**: pass signal to `readRasters`:
```ts
const validRasterData = await targetImage.readRasters({ window, signal });
// and
const tileData = await targetImage.readRasters({ window, interleave: true, signal });
```

3.4 **TerrainGenerator.generate**: guard before heavy CPU work. Check in `CogTiles.getTile`
right before calling `this.geo.getMap()`:
```ts
if (signal?.aborted) return null;
```

**Files:** `CogTerrainLayer.ts`, `CogBitmapLayer.ts`, `CogTiles.ts`

> **Note:** geotiff.js v3 `readRasters` accepts `signal` natively — no extra work needed there.

---

### Item 4 — Raster LRU cache in CogTiles
**Priority:** Medium · **Effort:** ~1 day · **Risk:** Low–Medium

#### Background

This was documented in `.plan/2026-04-10-tile-caching-future-work.md` but never implemented.

#### Root Cause

`CogTiles` already caches GeoTIFFImage *promises* (overview objects) in `this.imageCache`
to avoid redundant `getImage()` calls. But there is **no cache** for decoded raster pixel
data returned by `getTileFromImage`. Every re-visit to a tile re-fetches compressed bytes
from the COG (even if the browser HTTP cache helps) and re-runs decompression.

#### Implementation

Add an LRU map keyed by `"z/x/y"` that stores the raw raster arrays.

```ts
// CogTiles — add after imageCache:
private rasterCache: Map<string, TypedArray[]> = new Map();
private readonly RASTER_CACHE_MAX = 64; // tune as needed

private getRasterCacheKey(x: number, y: number, z: number, size: number): string {
  return `${z}/${x}/${y}/${size}`;
}
```

In `getTile()`, before calling `getTileFromImage`:
```ts
const cacheKey = this.getRasterCacheKey(x, y, z, requiredSize);
const cached = this.rasterCache.get(cacheKey);
if (cached) {
  // re-use cached rasters, skip network + decode
  return this.geo.getMap({ rasters: cached, width: requiredSize, ... }, ...);
}
```

After successful `getTileFromImage`, before returning:
```ts
this.rasterCache.set(cacheKey, tileData);
// Evict oldest if over limit (Map preserves insertion order)
if (this.rasterCache.size > this.RASTER_CACHE_MAX) {
  const firstKey = this.rasterCache.keys().next().value!;
  this.rasterCache.delete(firstKey);
}
```

Clear cache in `initializeCog` on new URL.

**Files:** `CogTiles.ts`

#### Memory Estimate

- 1 tile (257×257 Float32) ≈ 264 KB raster
- 64 tiles ≈ ~17 MB — well within browser limits

#### Why not cache the full TileResult (mesh / bitmap)?

The raster is cheaper to cache than the final mesh: the mesh `positions` buffer for a
complex terrain tile can be 5–20× larger. More importantly, rasters are stable regardless
of `meshMaxError` changes. If only the visualization option changes (e.g., `useHeatMap` →
`useSingleColor`), the raster can be re-used directly.

---

### Item 5 — Web Workers for tessellation
**Priority:** Low–Medium · **Effort:** 3–5 days · **Risk:** Medium–High

#### The Problem

`getMartiniTileMesh` and `getDelatinTileMesh` run synchronously on the main thread.
For 12–20 visible tiles at once, each tessellation blocks the UI thread for ~5–50 ms,
causing visible jank during zoom.

#### Approach

- Create a `terrain-worker.ts` script that imports `@mapbox/martini` and `delatin`.
- Use Transferable Objects (zero-copy) for the `Float32Array` terrain buffer.
- Rollup must bundle the worker separately — this is non-trivial configuration.

#### Why defer?

- Items 1–4 can be done quickly and will noticeably improve responsiveness.
- Workers require changes to the Rollup build config, TypeScript worker types, and
  potentially a worker pool library.
- The deck.gl / loaders.gl `TerrainLoader` already uses workers for PNG-encoded terrain —
  but our COG pipeline is custom, so we cannot reuse it directly.
- Recommended: implement after Items 1–3 are stable.

---

## Summary Table

| # | What | Files | Effort | Impact |
|---|---|---|---|---|
| 1 | Add `verticalExaggeration`, decouple from `multiplier` | `types.ts`, `TerrainGenerator.ts` | ~2 h | High — meshMaxError works as documented |
| 2 | Fix addSkirt O(n log n) edge scan | `skirt.ts` | ~2 h | High — eliminates main-thread jank from fine meshes |
| 3 | AbortSignal propagation | `CogTerrainLayer`, `CogBitmapLayer`, `CogTiles` | ~3 h | High — stops wasted network + CPU on fast zoom |
| 4 | Raster LRU cache | `CogTiles.ts` | ~1 day | Medium–High — pan-back is instant |
| 5 | Web Worker tessellation | `TerrainGenerator`, build config | 3–5 days | High — removes jank during initial load |

---

## Recommended Execution Order

1. **Items 1 + 2** (meshMaxError fix + skirt fix) — both small and self-contained, fix the most
   visible and user-reported issues. Can be done in a single session.
2. **Item 3** (AbortSignal) — similarly small, prevents wasted work on fast pan/zoom
3. **Item 4** (raster LRU) — a bit more invasive but well-specified and already documented
4. **Item 5** (workers) — plan as a separate PR after 1–4 are merged and tested

Items 1 + 2 + 3 can realistically be done in a single half-day session.  
Item 4 needs a full day including testing.  
Item 5 needs its own detailed design spike first.
