# Extend Terrain Tiles Beyond DEM Max Zoom (Sharp Overlay Draping)

**Date:** 2026-07-18  
**Status:** Implemented  
**Branch:** `feature/extend-terrain-max-zoom`

---

## Problem

When a DEM COG has a limited zoom range (e.g. 8–12) and an overlay tile layer (OSM, satellite) uses `_TerrainExtension` for draping, the overlay appears **blurry at zoom levels beyond the DEM's max zoom**.

### Root Cause

The blurriness comes from the `TerrainCover` drape mechanism in deck.gl's `TerrainExtension`:

1. `CogTerrainLayer`'s internal `TileLayer` has `maxZoom` set from the COG's zoom range (e.g. 12)
2. At viewport zoom 13+, the terrain layer produces **no new tiles** — only cached zoom-12 ancestor tiles remain visible
3. The `TerrainCover` renders the drape layers (OSM) into a framebuffer covering the zoom-12 tile's geographic extent
4. The drape framebuffer is mapped onto the zoom-12 terrain mesh, which has **coarse geometry**
5. The coarse mesh triangles stretch the high-res OSM texture, causing visible blur

### Why `zoomOverride` Doesn't Help

Setting `zoomOverride: demMaxZoom` locks the terrain at zoom 12. The drape framebuffer stays at zoom-12 resolution. OSM tiles at zoom 13+ are rendered into this lower-res framebuffer → still blurry.

### Why Removing `TerrainExtension` Is Undesirable

Conditionally removing `TerrainExtension` at high zooms makes OSM tiles render flat (z=0 plane), losing the terrain-following draping alignment.

---

## Chosen Solution: Extend Terrain Tiles to Viewport Zoom

Generate terrain mesh tiles at the viewport's zoom level using the existing DEM data from the highest available overview. The elevation values stay at zoom-12 resolution (no new data), but the **mesh geometry is finer** (more triangles), allowing the `TerrainCover` drape framebuffer to render at matching resolution.

### How It Works

```
Viewport at Zoom 13   → CogTerrainLayer requests tiles at Zoom 13
getTileFromImage(13)  → getImageIndexForZoomLevel(13) returns Zoom-12 image index
                       → Reads 128×128 pixel window from Zoom-12 image (1/4 tile)
                       → Tessellates mesh from 128×128 elevation grid
TerrainCover          → Renders OSM into framebuffer at Zoom-13 resolution
Result                → Sharp OSM draped on finer terrain mesh
```

### Key Insight

`CogTiles.getTileFromImage` already handles zoom mismatches via `getImageIndexForZoomLevel(zoom)` — it returns the closest available image index. The elevation data is read from the correct COG image. But the `FETCH_SIZE` (pixel window size) is hardcoded to `TILE_SIZE` (256), which reads too many pixels at higher zooms.

---

## Changes Required

### Change 1: Scale `requiredSize` by zoom difference in tile callers

**File:** `geoimage/src/core/CogTiles.ts`  
**Type:** Bug fix

The tile generation methods (`getTerrainTile`, `getGlazeTile`, `getBitmapTile`) compute `requiredSize` from `this.tileSize` (always 256). At extended zoom levels, this reads too many pixels from the COG image and produces oversized data buffers.

**Implementation (applied to all three callers):**

```typescript
const imageIndex = this.getImageIndexForZoomLevel(z);
const imageZoom = this.cogZoomLookup[imageIndex];
const zoomDiff = Math.max(0, z - imageZoom);
const clampedDiff = Math.min(zoomDiff, 4);
const scaledTileSize = this.tileSize >> clampedDiff;
```

Then use `scaledTileSize` instead of `this.tileSize` for:
- `getTileFromImage` fetch size
- `geo.getMap` width/height
- `ReliefCompositor.composeSwissRelief` width/height (glaze only)

**Effect:**
| Requested zoom | Image zoom | `zoomDiff` | `scaledTileSize` | Pixels read |
|---|---|---|---|---|
| 12 | 12 | 0 | 256 | 256×256 (full tile) |
| 13 | 12 | 1 | 128 | 128×128 |
| 14 | 12 | 2 | 64 | 64×64 |
| 15 | 12 | 3 | 32 | 32×32 |
| 16 | 12 | 4 | 16 | 16×16 |

**Cap:** `Math.min(zoomDiff, 4)` caps at `scaledTileSize=16` (zoom 16 with zoom-12 image). Beyond `maxDemZoom + 4`, the elevation grid stays at 16×16 — higher `maxZoom` values only generate more tile objects with no additional mesh resolution. The practical application cap is therefore `maxDemZoom + 4`.

---

### Change 2: Expose `maxZoom` override on `CogTerrainLayer`

**File:** `geoimage/src/layers/CogTerrainLayer.ts`  
**Type:** New feature

The layer's internal `TileLayer` `maxZoom` is currently derived from the COG's zoom range (`this.state.maxZoom`). There's no way for the application to extend it.

**2.1 Add prop to type definition (around line 172):**

```typescript
/**
 * Override the maximum zoom level for terrain tile requests.
 * When set higher than the DEM's native max zoom, the layer generates
 * terrain tiles at the requested zoom using resampled elevation data
 * from the highest available overview. This produces finer mesh geometry
 * for sharper overlay draping (TerrainExtension) at high zoom levels.
 *
 * Default: undefined (uses the DEM's native max zoom)
 */
maxZoom?: number;
```

**2.2 Use the prop in `renderLayers()` (line 632):**

Current:
```typescript
maxZoom: effectiveMaxZoom,
```

New:
```typescript
maxZoom: this.props.maxZoom ?? effectiveMaxZoom,
```

**Why a separate prop instead of reusing `zoomOverride`:**
- `zoomOverride` locks BOTH `minZoom` and `maxZoom` to the same value (used for progressive loading gate)
- The new prop only overrides `maxZoom`, keeping `minZoom` at the DEM's native minimum
- This allows the terrain layer to load overview tiles at minZoom AND detail tiles at extended maxZoom

---

### Change 3: Update `meshMaxError` lookup for extended zooms

**File:** `geoimage/src/core/CogTiles.ts`  
**Lines:** 462–470  
**Type:** Ensure correctness

When `meshMaxError` is `'auto'` and the requested zoom exceeds the DEM's range, the LUT lookup uses `getImageIndexForZoomLevel(z)` which returns the highest image index. The auto meshMaxError for that index is correct for the zoom-12 resolution. But at zoom 13+, the mesh covers a smaller geographic area, so the same meshMaxError (in meters) produces relatively finer tessellation — which is the desired behavior.

**No code change needed** — the existing logic handles this correctly. The meshMaxError is in meters and scales naturally with the tile's geographic extent.

---

## Application Usage

After implementing Changes 1 and 2, the application sets `maxZoom` based on the viewport:

```typescript
const demZoomRange = initializedCog?.getZoomRange(); // e.g. [8, 12]
const maxDemZoom = demZoomRange?.[1] ?? 12;

new CogTerrainLayer({
  id: 'terrain',
  elevationData: cogUrl,
  isTiled: true,
  tileSize: 256,
  meshMaxError: 'auto',
  operation: 'terrain',
  terrainOptions: { type: 'terrain', ... },
  maxZoom: Math.max(maxDemZoom, Math.round(viewState.zoom)),
  onZRangeUpdate,
})
```

Or with a cap at the useful maximum (`maxDemZoom + 4`, where the 16×16 grid limit is reached):

```typescript
maxZoom: Math.min(maxDemZoom + 4, Math.round(viewState.zoom)),
```

The OSM overlay keeps `TerrainExtension` at all zooms — no conditional removal needed:

```typescript
new TileLayer({
  id: 'osm-basemap',
  data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  zRange,
  renderSubLayers: (props) => {
    const { bbox } = props.tile;
    return new BitmapLayer(props, {
      data: undefined,
      image: props.data,
      bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
      extensions: [new TerrainExtension()], // Always draped
    });
  },
})
```

---

## Performance Considerations

| Concern | Impact | Mitigation |
|---|---|---|
| Tile count at high zooms | More terrain tiles at zoom 13+ (each covering 1/4 the area of zoom 12) | deck.gl's TileLayer naturally limits visible tiles to the viewport |
| Tessellation cost | Smaller elevation grids (128×128, 64×64) tessellate faster than 256×256 | Net positive — smaller grids are cheaper |
| Network requests | No additional COG requests — data is read from the same zoom-12 image | The pixel window is smaller, so response size is smaller |
| Memory | More terrain mesh objects in GPU memory at high zooms | Same as normal terrain at equivalent zoom — no额外 overhead |
| `maxZoom` changes on zoom | If `maxZoom` is recomputed on every zoom change, the TileLayer may refetch | Use `useMemo` or debounce to avoid rapid `maxZoom` changes |

### Debouncing `maxZoom` updates

If `maxZoom` changes on every zoom step (e.g. zoom 13 → 14 → 15), the TileLayer may clear its cache and refetch. To avoid this:

```typescript
const maxDemZoom = demZoomRange?.[1] ?? 12;
const currentZoom = Math.round(viewState.zoom);
// Only extend when zoom exceeds maxDemZoom. Cap at +4 — beyond that,
// the internal clamp already limits the pixel window to 16×16.
const maxZoom = currentZoom > maxDemZoom
  ? Math.min(maxDemZoom + 4, currentZoom)
  : maxDemZoom;
```

This limits the extension to 4 zoom levels beyond the DEM's max. Beyond that, the internal `Math.min(zoomDiff, 4)` cap in `CogTiles.getScaledTileSize()` bottoms out at 16×16 data windows — additional zoom levels generate more tile objects with identical mesh resolution, wasting GPU memory and tile requests for no visual gain.

---

## Visual Behaviour

| Viewport Zoom | Terrain Tiles | Mesh Resolution | OSM Drape |
|---|---|---|---|
| 8–12 | Native zoom tiles | DEM resolution | Sharp (normal) |
| 13 | Zoom-13 tiles from zoom-12 data | 128×128 elevation grid | Sharp |
| 14 | Zoom-14 tiles from zoom-12 data | 64×64 elevation grid | Sharp |
| 15 | Zoom-15 tiles from zoom-12 data | 32×32 elevation grid | Sharp |
| 16 | Zoom-16 tiles from zoom-12 data | 16×16 elevation grid | Sharp |
| 17+ | Same as zoom-16 (cap) | 16×16 (clamped) | No additional gain |

At zoom 16, the 16×16 elevation grid produces a 17×17 Martini mesh — the finest mesh the algorithm can generate from the scaled data window. Beyond zoom 16 (`zoomDiff > 4`), `getScaledTileSize` returns 16 regardless, so higher `maxZoom` values create no finer geometry.

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/core/CogTiles.ts` | Scale `requiredSize` in `getTerrainTile`, `getGlazeTile`, `getBitmapTile` |
| `geoimage/src/layers/CogTerrainLayer.ts` | Add `maxZoom?: number` prop; apply in `renderLayers()` + `updateTriggers` |
| `geoimage/src/core/lib/TerrainGenerator.ts` | Replace 6 hardcoded `256`/`257`/`258` checks with dynamic power-of-2 detection |
| `geoimage/src/core/lib/KernelGenerator.ts` | Derive `IN`/`OUT` from `Math.sqrt(src.length)` instead of hardcoded values |
| `geoimage/src/workers/terrain.worker.ts` | Fix `gridSize` detection for Martini/Delatin to handle any `2^n+1` size |

### Change 4: Replace hardcoded dimension constants in downstream processors

The original plan assumed only `CogTiles.ts` and `CogTerrainLayer.ts` needed changes. In practice, the scaled tile sizes ripple through the entire mesh pipeline, and every stage had hardcoded `256`/`257`/`258` constants that produced corrupt geometry at scaled sizes.

**`TerrainGenerator.ts` — 6 locations fixed:**

| Location | Old | New |
|---|---|---|
| `generate()` isKernel | `width === 258` | `!!(options.useSlope \|\| options.useHillshade \|\| options.useSwissRelief)` |
| `generate()` meshWidth | `isKernel ? 257 : width` | `isKernel ? width - 1 : width` |
| `generate()` gridWidth | `meshWidth === 257 ? 257 : meshWidth + 1` | `meshWidth` |
| `computeTerrainData()` isStitched | `width === 257` | `(width-1) & (width-2) === 0` |
| `getMeshAttributes()` gridSize | `width === 257 ? 257 : width + 1` | same power-of-2 check |
| `getMeshAttributes()` effectiveWidth | `width === 257 ? width - 1 : width` | same power-of-2 check |
| `getMartiniTileMesh()` | `width === 257 ? 257 : width + 1` | same power-of-2 check |
| `getDelatinTileMesh()` | `width === 257 ? 257 : width + 1` | same power-of-2 check |

**`KernelGenerator.ts` — 3 methods fixed:**

All three methods (`calculateSlope`, `calculateHillshade`, `calculateMultiHillshade`) had `OUT=256; IN=258;`. Changed to:
```typescript
const IN = Math.round(Math.sqrt(src.length));
const OUT = IN - 2;
```

**`terrain.worker.ts` — 2 locations fixed:**

Martini and Delatin paths had `width === 257 ? 257 : width + 1`. Changed to the same power-of-2 detection.

### Known Limitation: Kernel mode at extended zooms

`computeTerrainData` (line 321) still uses `width === 258` for kernel detection. If kernel mode (slope/hillshade/relief) is used with `maxZoom` extended beyond the DEM's native range, the kernel-padded data (e.g. 130×130 at zoom 13) will not be recognized as kernel data and will be processed incorrectly.

**Impact:** Only affects terrain layers that enable `useSlope`, `useHillshade`, or `useSwissRelief` AND extend `maxZoom` beyond native range. The 2D/3D transition example uses `type: 'terrain'` without kernel flags, so it is unaffected.

**Fix:** Replace `width === 258` with the options-based kernel detection used in `generate()`, or pass `isKernel` as a parameter through the call chain.

---

## Testing

1. **Basic functionality:** Set `maxZoom: 15` on a DEM with zoom range 8–12. Verify terrain tiles appear at zoom 13–15 with correct elevation.
2. **OSM draping:** Verify OSM overlay is crisp (not blurry) at zoom 13+ when draped with `TerrainExtension`.
3. **Zoom-out regression:** Verify normal behavior at zoom 8–12 (no change from current).
4. **Edge tiles:** Verify tiles at the DEM's geographic boundary render correctly with padding (Case A in `getTileFromImage`).
5. **Progressive loading:** Verify `enableProgressiveLoading` still works correctly when `maxZoom` is extended.
6. **`meshMaxError: 'auto'`:** Verify auto meshMaxError produces reasonable tessellation at extended zooms.
7. **Animation/transition:** Verify the 2D/3D transition example works with extended maxZoom.
8. **Backward compatibility:** At native zoom levels (≤ DEM max), all dimension checks produce identical values to the pre-change behavior (256→256, 257→257, 258→258).

---

## Out of Scope

- Modifying deck.gl's `TerrainExtension` or `TerrainCover` internals
- Dynamic `maxZoom` based on overlay tile provider limits (e.g. OSM max 19)
- `CogBitmapLayer` extension (bitmap tiles don't have mesh geometry — no blurriness issue)
- Upscaling elevation data (the data stays at DEM resolution; only mesh geometry is finer)
