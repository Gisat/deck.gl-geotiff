# Progressive Loading & Terrain Tile Pipeline — Fixes

**Date:** 2026-09-03
**Status:** 🟡 In progress — 1 fix shipped today, remaining items proposed below.

---

## Context

Investigating why the Nepal Copernicus 30m DEM (`DEM_COP30_float32_wgs84_deflate_cog_float32.tif`, EPSG:3857, minZoom 4 / maxZoom 12, `NoData: None`) did not show the low-resolution overview before high-res tiles. Root cause traced via console logging through `CogTerrainLayer` → `CogTiles` → deck.gl `TileLayer`/`Tileset2D`.

---

## ✅ Already Fixed Today

### 1. Progressive-loading gate released on the *first* min-zoom tile instead of the *full* overview

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

**Problem:** The gate (`overviewLoaded`) was released in `onTileLoad` as soon as any single min-zoom tile finished loading. For this DEM, the out-of-bounds zoom-4 tile `x:12` resolves instantly to an empty mesh and released the gate, which then aborted the still-loading meaningful tile `x:11` (Nepal) via deck.gl request pruning. Net effect: the low-res overview never reached the screen.

**Fix:** Release the gate in `onViewportLoad` (fires only when **all** selected tiles are loaded) instead of `onTileLoad`, gated by `tiles.every((tile) => tile.index.z === this.state.minZoom)`. `onTileLoad` is now a pure pass-through to the user callback.

**Verification:** confirmed via logs — both `z:4` tiles now resolve and render before `onViewportLoad — overview fully loaded, RELEASING GATE`, then zoom-12 tiles stream in.

---

## Proposed Fixes (not yet implemented)

### 2. Out-of-extent tiles render as flat planes (visual artifact)

**File:** `geoimage/src/core/CogTiles.ts` and/or `geoimage/src/layers/CogTerrainLayer.ts`

**Problem:** For COGs with `NoData: None`, a tile outside the COG bbox reads a window with `readWidth <= 0` and `getTileFromImage` returns `createEmptyTile()` — a zero-filled `Float32Array` (`TileReader.ts:15-27`). Because `noDataValue` is `undefined`, the no-data check in `getTerrainTile` is skipped, so `geo.getMap` tessellates a **flat mesh at elevation 0**. These render as flat green planes beyond the terrain edge (e.g. zoom-4 `x:12` east of the DEM).

**Fix options:**
- **Preferred:** auto-derive `extent` from `cog.getBoundsAsLatLon()` in the layer so deck.gl clips to the COG bbox (`getOSMTileIndices` accepts `[minLng, minLat, maxLng, maxLat]` and `insideBounds` skips those tiles — confirmed in `node_modules/@deck.gl/geo-layers/dist/tileset-2d/tile-2d-traversal.js:95-102,148-153`). Allow user override via the existing `extent` prop.
- **Alternative:** detect `readWidth <= 0` in `getTileFromImage` and signal "empty" so `getTerrainTile` returns `null` instead of a flat mesh.

### 3. Gate can hang forever on a stalled request

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

**Problem:** `onViewportLoad` only fires on full load. A fetch that stalls (no error, no completion) keeps `overviewLoaded = false` indefinitely. Errored tiles are safe (deck.gl marks them loaded with `content: null`), but a true hang blocks the gate.

**Fix:** Add a ~3–5s timeout fallback that forces `overviewLoaded = true` if the overview hasn't completed. Clear the timer on `_finalize`.

### 4. `elevationData` change without a new `cogTiles` → stale COG

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

**Problem:** `updateState` resets `overviewLoaded` on `elevationDataChanged`, but `terrainCogTiles` still points at the old URL and is never re-initialized. Data only reloads if the parent also swaps a fresh `cogTiles`. A bare `elevationData` swap silently renders old data.

**Fix:** On `elevationDataChanged` (when no `cogTiles` prop is supplied), re-run `init()` against the new URL, or guard/throw to make the contract explicit.

### 5. zRange underestimated during the gate

**File:** `geoimage/src/layers/CogTerrainLayer.ts` (`onViewportLoad`)

**Problem:** During the gate only min-zoom tiles are loaded, so zRange is computed from nearest-neighbor-downsampled data. Peaks (e.g. Everest) can be missed, so `maxZ` is too low until high-res tiles stream in. This feeds both the inner TileLayer frustum culling and `onZRangeUpdate` → the OSM drape `zRange`. Self-corrects as tiles load, but can cause brief drape/cull pop.

**Fix:** Investigate using a more conservative initial zRange (or the COG's known value range) until full-res tiles arrive.

### 6. Overzoom detail capped at 4 levels

**File:** `geoimage/src/core/CogTiles.ts` (`getScaledTileSize`)

**Problem:** `clampedDiff = Math.min(zoomDiff, 4)` → minimum 16×16 tile. When `maxZoom` is set above the DEM's native zoom (12) to get finer drape, terrain mesh detail is hard-capped at 16px and never refines further.

**Fix:** Evaluate whether the cap is intentional; if finer overzoom is desired, allow a higher clamp (or configurable) with the associated memory/perf trade-off.

### 7. `GLOBAL_MULTI_BAND_CACHE` grows unbounded

**File:** `geoimage/src/core/CogTiles.ts`

**Problem:** Module-level `GLOBAL_MULTI_BAND_CACHE` (line ~23) is only pruned on a URL change in `initializeCog`. With a fixed dataset and `cacheAllBands` enabled it grows forever.

**Fix:** Add an LRU/bound to the cache. Not hit by the Nepal example (no `cacheAllBands`), but a latent leak.

---

## Files to Change (summary)

| File | Fix |
|------|-----|
| `geoimage/src/layers/CogTerrainLayer.ts` | #1 (done), #3, #4, #5 |
| `geoimage/src/core/CogTiles.ts` | #2 (alt), #6, #7 |
| `geoimage/src/core/lib/TileReader.ts` | #2 (context: empty-tile fill) |

---

## Notes

- Debug logging added during diagnosis (`[CogTerrainLayer:progressive]`, `[CogTiles:progressive]`) has been removed. Typecheck passes.
- deck.gl default `refinementStrategy` is `'best-available'` — it keeps a loaded ancestor tile visible while high-res children load; the custom gate complements this by sequencing *overview-first* rather than requesting all zooms at once.
- deck.gl tile traversal disables distance-based LOD at `pitch <= 60` (`minZ = maxZ`), so the example's `pitch: 60` is exactly at that boundary — worth noting for future perf tuning.
