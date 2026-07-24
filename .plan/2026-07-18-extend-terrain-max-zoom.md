# Extend Terrain Tiles Beyond DEM Max Zoom (Sharp Overlay Draping)

**Date:** 2026-07-18  
**Status:** Planned  
**Branch:** `feature/2d-3d-transition` (or new branch)

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

### Change 1: Scale `FETCH_SIZE` by zoom difference

**File:** `geoimage/src/core/CogTiles.ts`  
**Line:** 329  
**Type:** Bug fix

The `FETCH_SIZE` determines how many pixels to read from the COG image. Currently it's always 256, regardless of zoom mismatch. At zoom 13 with a zoom-12 image, this reads a full zoom-12 tile (256px) instead of the correct 128×128 pixel window.

**Current code (line 329):**
```typescript
const FETCH_SIZE = fetchSize || TILE_SIZE;
```

**New code:**
```typescript
const imageZoom = this.cogZoomLookup[imageIndex];
const zoomDiff = Math.max(0, zoom - imageZoom);
const FETCH_SIZE = fetchSize || (TILE_SIZE >> zoomDiff);
```

**Effect:**
| Requested zoom | Image zoom | `zoomDiff` | `FETCH_SIZE` | Pixels read |
|---|---|---|---|---|
| 12 | 12 | 0 | 256 | 256×256 (full tile) |
| 13 | 12 | 1 | 128 | 128×128 (1/4 tile) |
| 14 | 12 | 2 | 64 | 64×64 (1/16 tile) |
| 15 | 12 | 3 | 32 | 32×32 (1/64 tile) |

**Why this is safe:**
- `getImageIndexForZoomLevel(zoom)` always returns a valid image index (clamped to the COG's range)
- `TILE_SIZE >> zoomDiff` produces clean power-of-2 values (128, 64, 32, ...) which are valid for Martini/Delatin tessellation
- The pixel window calculation (`startX`, `endX`, etc.) already handles arbitrary window sizes — no other changes needed
- The `readRasters({ window })` call reads the correct sub-tile region from the COG image
- Case A (partial overlap / padding) and Case B (perfect match) both work with smaller `FETCH_SIZE`

**Cap consideration:** At very high zoom differences (e.g. zoom 20 with zoom-12 image → `zoomDiff=8`, `FETCH_SIZE=1`), the elevation data becomes a single pixel. This is useless for tessellation. Consider capping at a reasonable max:

```typescript
const FETCH_SIZE = fetchSize || (TILE_SIZE >> Math.min(zoomDiff, 4)); // min 16px
```

This caps at `FETCH_SIZE=16` (zoom 16 with zoom-12 image), which is still tessellatable.

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

Or with a reasonable cap to avoid degenerate tessellation at extreme zooms:

```typescript
maxZoom: Math.min(16, Math.max(maxDemZoom, Math.round(viewState.zoom))),
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
// Only extend when zoom exceeds maxDemZoom, and cap at maxDemZoom + 3
const maxZoom = currentZoom > maxDemZoom
  ? Math.min(maxDemZoom + 3, currentZoom)
  : maxDemZoom;
```

This limits the extension to 3 zoom levels beyond the DEM's max, reducing tile count while still providing sharp draping at reasonable zoom levels.

---

## Visual Behaviour

| Viewport Zoom | Terrain Tiles | Mesh Resolution | OSM Drape |
|---|---|---|---|
| 8–12 | Native zoom tiles | DEM resolution | Sharp (normal) |
| 13 | Zoom-13 tiles from zoom-12 data | 128×128 elevation grid | Sharp |
| 14 | Zoom-14 tiles from zoom-12 data | 64×64 elevation grid | Sharp |
| 15+ | Capped at maxDemZoom+3 | Same as 14 | Sharp |

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/core/CogTiles.ts:329` | Scale `FETCH_SIZE` by zoom difference (`TILE_SIZE >> zoomDiff`) |
| `geoimage/src/layers/CogTerrainLayer.ts` | Add `maxZoom?: number` prop; use in `renderLayers()` line 632 |

---

## Testing

1. **Basic functionality:** Set `maxZoom: 15` on a DEM with zoom range 8–12. Verify terrain tiles appear at zoom 13–15 with correct elevation.
2. **OSM draping:** Verify OSM overlay is crisp (not blurry) at zoom 13+ when draped with `TerrainExtension`.
3. **Zoom-out regression:** Verify normal behavior at zoom 8–12 (no change from current).
4. **Edge tiles:** Verify tiles at the DEM's geographic boundary render correctly with padding (Case A in `getTileFromImage`).
5. **Progressive loading:** Verify `enableProgressiveLoading` still works correctly when `maxZoom` is extended.
6. **`meshMaxError: 'auto'`:** Verify auto meshMaxError produces reasonable tessellation at extended zooms.
7. **Animation/transition:** Verify the 2D/3D transition example works with extended maxZoom.

---

## Out of Scope

- Modifying deck.gl's `TerrainExtension` or `TerrainCover` internals
- Dynamic `maxZoom` based on overlay tile provider limits (e.g. OSM max 19)
- `CogBitmapLayer` extension (bitmap tiles don't have mesh geometry — no blurriness issue)
- Upscaling elevation data (the data stays at DEM resolution; only mesh geometry is finer)
