# LOD Placeholder Layer — Progressive Terrain Loading

**Date:** 2026-06-06  
**Status:** Phase 3 — Single-Layer Ancestor Fallback + Dynamic Z-Offset

---

## Problem

COG tiles are served from Linode Object Storage over **HTTP/1.1**. Browsers enforce a strict limit of **6 concurrent connections per domain**.

When the map loads at a high zoom level, deck.gl requests 16+ terrain tiles simultaneously. Only 6 download at a time; the rest queue. On slow connections this leaves the map **blank for several seconds**.

The Web Worker pool (implemented in `2026-06-04-web-worker-terrain-tessellation.md`) eliminated the CPU bottleneck. Network latency is now the primary bottleneck.

---

## Rejected Approaches

| Approach | Why Rejected |
|---|---|
| Async generator (`yield` low-res then high-res in `getTileData`) | `TileLayer.getTileData` in deck.gl v9.3 only accepts `Promise<DataT>`, not `AsyncIterable`. Not supported. |
| Parent tile crop + upscale | Martini requires exactly `(tileSize+1)²` input. Cropped quadrant (129×129 or 65×65) must be bilinearly upscaled — significant complexity with elevation-specific math. |
| `onViewportLoad` visibility toggle | Fires at zoom 0 during initial boot before high-zoom tiles are even requested — kills placeholder too early. |
| Percentage-based fade | Uneven tile loading leaves white holes: e.g., 8/16 tiles cache-hit triggers fade while the other 8 still fetch. |
| Semi-transparent terrain (`opacity < 1`) | WebGL depth sorting breaks on 3D terrain without per-triangle back-to-front sorting. Interior faces bleed through. |
| Higher `meshMaxError` to reduce interpolation visibility | Counterproductive: larger triangles stretch further across ravines, making the floating-ceiling artifact *worse*. |
| Global `visible` toggle via `onTileLoad` counter | Works but hides/shows the **entire** placeholder at once. In ravine terrain the low-res mesh physically pokes through the high-res detail — placeholder must be masked at tile granularity, not globally. |
| Two-layer stencil masking | "3D Silhouette Problem": Low-res mesh (meshMaxError: 30) is physically "fatter" — geometry protrudes horizontally beyond high-res footprints. Stencil/depth masking cannot hide non-occluded geometry at viewport edges. |

---

## Chosen Solution: Single-Layer Ancestor Fallback + Dynamic Z-Offset

Instead of two layers with stencil masking, use **a single `CogTerrainLayer` that exploits deck.gl's native TileLayer ancestor caching**. Start with `zoomOverride: minZoom` to fetch only the root overview tile (1–4 tiles, exclusive network access). When the overview tile loads, remove the `zoomOverride` to allow high-res child tiles to fetch. deck.gl automatically renders cached ancestor tiles while waiting for high-res children — no manual layer coordination needed.

To solve Z-fighting between the cached low-res ancestor and incoming high-res tiles, apply **dynamic polygon offset** based on zoom level: `getPolygonOffset: () => [0, -(tile.index.z * 1000)]`. Each zoom level deeper pulls the geometry 1000 units closer to the camera, ensuring high-res tiles always depth-test in front.

### How it works

```
Boot (Zoom 9)         → Layer created with zoomOverride: 9 → Fetches only Zoom 9 tile (1 tile, exclusive network)
onTileLoad fires      → Remove zoomOverride (set to undefined) → deck.gl requests Zoom 12+ children
User pans/zooms       → new viewport triggers new tile requests → deck.gl auto-renders cached ancestors while children load
Detail tile render    → Dynamic offset -(z * 1000) pulls it 1000 units closer than ancestor
Fully loaded          → All high-res tiles in place; ancestors cached but depth-tested behind
```

### Why this is better than stencil masking

| Concern | Two-layer stencil | Single-layer ancestor |
|---|---|---|
| 3D Silhouette Problem | **Failed** — stencil cannot mask non-occluded fat geometry | **Solved** — high-res tiles naturally depth-test in front (no masking needed) |
| Architecture complexity | Coordinate two layers, stencil state, onTileLoad gate | One layer, dynamic offset based on zoom level |
| GPU overhead | Stencil test per fragment + overdraw | Depth test (native, no extra cost) + minor Z-offset |
| Ancestor tile fallback | Not used (two separate instances) | **Leveraged** — deck.gl's native behavior, perfect fit |
| React state management | `detailLayerEnabled` gate required | Simple `overviewLoaded` boolean (optional, for UI feedback) |

### How overlay clamping still works

The layer writes to the depth buffer with `operation: 'terrain+draw'`. `polygonOffset` modifies depth values in clip-space by a negligible amount in world-space. `TerrainExtension` reads the depth buffer to reconstruct coordinates for satellite/OSM draping — the microscopic offset does not degrade drape accuracy.

---

## Visual Behaviour

| State | What the user sees |
|---|---|
| Initial load (Zoom 9) | Low-res overview mesh (1–4 tiles) covering full DEM instantly + satellite/OSM draped on it |
| Detail tiles loading (Zoom 12+) | Ancestor mesh remains fully visible; high-res tiles fade in as they load without Z-fighting |
| Fully loaded | Full-detail terrain; ancestors cached but hidden behind high-res tiles via dynamic offset |

---

## Phase 1 — Completed ✅

These items are implemented and committed on branch `feature/lod-placeholder-layer` (stencil masking approach, now superseded).

### 1.1 Add `zoomOverride` prop to `CogTerrainLayer` ✅

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- Added `zoomOverride?: number` to `_CogTerrainLayerProps`
- No `defaultProps` entry needed (optional prop, defaults to `undefined`)
- In `renderLayers()`:
  ```ts
  minZoom: this.props.zoomOverride ?? this.state.minZoom,
  maxZoom: this.props.zoomOverride ?? this.state.maxZoom,
  ```

### 1.2 Forward `getPolygonOffset` to the sublayer ✅

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- Inherited from deck.gl base `LayerProps` — no type redefinition needed
- Explicitly forwarded in `renderSubLayers()` with fallback:
  ```ts
  getPolygonOffset: this.props.getPolygonOffset ?? ((params) => [0, -params.layerIndex * 100]),
  ```

---

## Phase 3 — Single-Layer Ancestor Fallback + Dynamic Z-Offset (Current)

### 3.1 Dynamic polygon offset based on tile zoom level

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- 3.1.1. Modify `renderSubLayers()` to replace the static `getPolygonOffset` fallback with dynamic zoom-based calculation using closure access to `props.tile`:
  ```ts
  getPolygonOffset: this.props.getPolygonOffset ?? [0, -((props.tile?.index?.z ?? 0) * 1000)],
  ```
  **Why static array, not callback:** `getPolygonOffset` callbacks only receive `{ layerIndex }` from deck.gl; they cannot access the tile. We access `props.tile` directly from the `renderSubLayers` closure instead. This pulls higher zoom levels 1000 units closer to camera, ensuring each tile depth-tests in front without Z-fighting.
- 3.1.2. This ensures that as tiles load at progressive zooms (Zoom 9 ancestor, then Zoom 12+ children), each new level depth-tests in front automatically.

### 3.2 Add `overviewLoaded` state and `zoomOverride` gate logic

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 3.2.1. Add state flag:
  ```ts
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  ```
- 3.2.2. Determine minimum zoom from the `initializedCog`:
  ```ts
  const minZoom = initializedCog?.getZoomRange()[0] ?? 9;
  ```
- 3.2.3. Define the single layer with `zoomOverride` gate:
  ```ts
  zoomOverride: overviewLoaded ? undefined : minZoom,  // Gate: start at minZoom only
  onTileLoad: (tile) => {
    // Fire once when the first overview tile loads (Zoom 9 in this case)
    // Use 500ms debounce to ensure overview tile is fetched AND rendered before removing gate
    // This prevents deck.gl from jumping to higher zoom levels (e.g., z:14) before z:8 is visible
    if (tile.index.z === minZoom && !overviewLoaded) {
      if (!overviewTileLoadedRef.current) {
        overviewTileLoadedRef.current = Date.now();
        setTimeout(() => {
          setOverviewLoaded(true);  // Remove zoomOverride after debounce
          overviewTileLoadedRef.current = null;
        }, 500);
      }
    }
  },
  ```
- 3.2.4. **Critical timing fix:** The 500ms debounce ensures that the overview tile loads and renders to GPU before removing `zoomOverride`. Without this delay, deck.gl may request higher-zoom tiles (e.g., z:14) before the overview tile is rendered, bypassing the fallback entirely. This was observed as 50-50 intermittent behavior during testing.
- 3.2.5. No need for `detailLayerEnabled` gate — single layer handles all tile ranges.

### 3.3 Remove stencil parameters and clean up

**File:** `geoimage/src/layers/CogTerrainLayer.ts` and `example/src/examples/CogTerrainLayerExample.tsx`

- 3.3.1. Remove `stencilParameters` prop from `_CogTerrainLayerProps` type (not needed)
- 3.3.2. Remove any `stencilParameters` merge logic from `renderSubLayers()`
- 3.3.3. Remove `deviceProps={{ webgl: { stencil: true } }}` from the `DeckGL` component (stencil buffer no longer needed)
- 3.3.4. Remove the placeholder-specific layer configuration
- 3.3.5. Remove `detailLayerEnabled` state and all its associated logic

### 3.4 Verify layer order and simplify

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 3.4.1. Return layers array with just the single terrain layer + OSM tile layer:
  ```ts
  return [cogLayer, tileLayer].filter(Boolean);
  ```

---

## Key Design Decisions

### Single layer exploits deck.gl's native ancestor caching
TileLayer automatically retains cached ancestor tiles in GPU memory as long as their screen-space footprints aren't completely occluded by fully loaded children. This is designed for exactly this LOD use case — no custom masking or layer coordination needed.

### `zoomOverride` gate ensures exclusive network access
By capping the layer to `minZoom` on boot, we guarantee that only 1–4 low-res tiles request the network simultaneously. This fits comfortably within the 6-connection HTTP/1.1 limit, loading in milliseconds. Once the overview tile is in GPU memory (`onTileLoad` fires), we remove the gate to allow child tiles to flood the pool.

### Dynamic polygon offset avoids Z-fighting
Instead of masking or making tiles transparent, we use the GPU's native depth buffer mechanics. Zoom-based offset `-(z * 1000)` ensures that each new tile render at a deeper zoom level floats 1000 units closer to the camera — no mathematical overlap, no stencil buffer state management, no cross-frame persistence issues.

### Why not static offset or depthRange?
- Static offset (e.g., `[0, 100]`) fails when multiple ancestor zoom levels coexist (e.g., Zoom 9 ancestor + Zoom 11 intermediate + Zoom 13 detail).
- `depthRange` (near/far bounds) quantizes the viewport into bands — when user zooms within a band, ancestor tiles reappear in front of detail.
- Dynamic zoom-based offset scales infinitely: Zoom 0 at offset 0, Zoom 12 at offset -12,000, Zoom 18 at offset -18,000 — all automatically sorted in depth order.

### Precision at extreme zoom levels
WebGL's depth buffer has sufficient precision to handle offsets of ±1,000,000. At Zoom 20 (offset -20,000), we are far within this range. If future datasets push to Zoom 25+ (offset -25,000), precision could degrade — but this is rare and can be tuned down to 500 units/zoom or addressed by adjusting the elevation coordinate system.

### `meshMaxError: 'auto'` recommended
Use the adaptive zoom-based `meshMaxError` (default 'auto') to allow deck.gl's automatic LOD switching. At Zoom 9, tessellation is naturally coarser; at Zoom 12+, finer triangles respect detail. This synergizes with the ancestor fallback — if a user rapidly pans across the Zoom 9 tile, it loads faster than if we force `meshMaxError: 30` at all zooms.

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/layers/CogTerrainLayer.ts` | Update `renderSubLayers()` to calculate dynamic polygon offset based on `tile.index.z`; remove stencilParameters prop if present |
| `example/src/examples/CogTerrainLayerExample.tsx` | Replace two-layer stencil approach with single-layer ancestor fallback; add `overviewLoaded` state; add `zoomOverride` and `onTileLoad` gate logic; remove `detailLayerEnabled`, stencil params, and device stencil setup |

---

## Out of Scope

- HTTP/2 migration (investigate separately with infra team — would eliminate the root cause entirely)
- Full LOD crop+upscale pipeline (re-evaluate if ancestor approach is insufficient)
- `CogBitmapLayer` ancestor fallback (bitmap tiles queue differently; less severe bottleneck)
- `CogTerrainGlazeExample.tsx` update (follow-up after `CogTerrainLayerExample.tsx` is validated)
