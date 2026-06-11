# LOD Placeholder Layer — Progressive Terrain Loading

**Date:** 2026-06-06  
**Status:** Planning

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

---

## Chosen Solution: Placeholder Layer

Add a **second `CogTerrainLayer` instance** locked to the COG's minimum zoom level. It fetches 1–4 tiles to cover the entire DEM and tessellates them instantly with a very high `meshMaxError`. The normal detail layer renders on top as tiles load.

### How overlay clamping still works

Both `operation: 'terrain'` and `operation: 'terrain+draw'` patterns write to the **GPU depth buffer**. `TerrainExtension` reads the depth buffer — not a specific layer reference — so satellite/OSM imagery drapes correctly onto the placeholder in areas where detail tiles have not yet loaded.

---

## Visual Behaviour

| State | What the user sees |
|---|---|
| Initial load | Low-res terrain mesh covering full DEM + satellite/OSM draped on it |
| Detail tiles loading | Detail tiles pop in tile by tile, satellite re-drapes on detail depth |
| Fully loaded | Full-detail terrain, placeholder hidden underneath |

---

## Implementation Checklist

### 1. Add `zoomOverride` prop to `CogTerrainLayer`

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- 1.1. Add `zoomOverride?: number` to `_CogTerrainLayerProps` type
- 1.2. Add to `defaultProps` as `{ type: 'number', value: undefined, optional: true }`
- 1.3. In `renderLayers()`, replace hardcoded state values:
  ```ts
  minZoom: this.props.zoomOverride ?? this.state.minZoom,
  maxZoom: this.props.zoomOverride ?? this.state.maxZoom,
  ```

### 2. Forward `getPolygonOffset` to the sublayer

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- 2.1. Do **NOT** add `getPolygonOffset` to `_CogTerrainLayerProps` — it is already defined in deck.gl's base `LayerProps` as:
  ```ts
  getPolygonOffset?: (params: { layerIndex: number }) => [number, number] | null;
  ```
  Adding it again would create a type conflict.
- 2.2. No `defaultProps` entry needed — the prop is inherited.
- 2.3. In `renderSubLayers()`, explicitly forward it to `SimpleMeshLayer` (the `CompositeLayer`'s own polygon offset does **not** cascade to sublayers automatically):
  ```ts
  getPolygonOffset: this.props.getPolygonOffset ?? ((params: { layerIndex: number }) => [0, -params.layerIndex * 100]),
  ```
  > The fallback `[0, -layerIndex * 100]` matches deck.gl's own default so non-placeholder layers are unaffected.

### 3. Update type exports

**File:** `geoimage/src/core/types.ts` (or `CogTerrainLayer.ts` type export)

- 3.1. Ensure `zoomOverride` and `getPolygonOffset` appear in the exported `CogTerrainLayerProps` type

### 4. Update example app

**File:** `example/src/examples/CogTerrainLayerExample.tsx` (and `CogTerrainGlazeExample.tsx`)

- 4.1. Add a placeholder `CogTerrainLayer` below the detail layer using the shared `cogTiles` instance:
  ```tsx
  // Placeholder layer — locked to lowest zoom, instant tessellation
  new CogTerrainLayer({
    id: 'cog-terrain-placeholder',
    elevationData: mainCog.url,
    cogTiles: initializedCog,           // shared instance — no extra metadata fetch
    isTiled: true,
    tileSize: 256,
    meshMaxError: 80,                   // coarse mesh, fast tessellation
    zoomOverride: initializedCog.getZoomRange()[0],  // force minZoom = maxZoom = lowest COG zoom
    operation: 'terrain+draw',          // or 'terrain' — match detail layer
    disableTexture: true,               // no texture fetch — saves 1 HTTP connection
    color: [180, 180, 180],             // neutral gray while detail loads
    getPolygonOffset: () => [0, 100],   // function signature required — push back in depth
    terrainOptions,
    pickable: false,
  }),
  // Detail layer — normal
  new CogTerrainLayer({
    id: 'cog-terrain-layer',
    ...
  }),
  ```
- 4.2. Ensure placeholder layer is **below** detail layer in the array (renders first → depth overwritten by detail)
- 4.3. Confirm satellite/OSM TileLayer with `TerrainExtension` is **above** both terrain layers

---

## Key Design Decisions

### Shared `CogTiles` instance
Both placeholder and detail layers use `cogTiles: initializedCog`. This avoids a second COG metadata fetch and a second worker pool allocation. The `initializeCog()` guard prevents double-initialization.

### `zoomOverride = getZoomRange()[0]`
`getZoomRange()[0]` returns `minZoom` (the lowest overview level). At that zoom, the entire DEM fits in 1–4 tiles. With `meshMaxError: 80`, Martini tessellates in <5ms per tile.

### `disableTexture: true` on placeholder
Prevents a texture fetch, leaving one more HTTP connection slot for detail tiles.

### `getPolygonOffset: () => [0, 100]`
Pushes the placeholder mesh back in depth so detail tiles always render cleanly on top without Z-fighting. The prop type is a **function** `(params) => [number, number]` — passing a plain array would be a type error. Positive units = further from camera = loses depth test to the detail layer whose default is `[0, -layerIndex * 100]` (negative = wins).

### Z-fighting fallback for oblique angles
At high pitch (>60°), WebGL depth buffer precision degrades and polygon offset alone can fail. If flickering appears on the horizon, apply a **`modelMatrix` translation** on the `SimpleMeshLayer` sublayer to shift the entire placeholder mesh down by a small amount (e.g., −2 m in Cartesian Z). This requires no changes to the tessellation pipeline and is safer than attempting to post-process Martini vertex buffers after the Web Worker returns them.

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/layers/CogTerrainLayer.ts` | Add `zoomOverride`, `getPolygonOffset` props; wire into `renderLayers` and `renderSubLayers` |
| `example/src/examples/CogTerrainLayerExample.tsx` | Add placeholder layer |
| `example/src/examples/CogTerrainGlazeExample.tsx` | Add placeholder layer |

---

## Out of Scope

- HTTP/2 migration (investigate separately with infra team — would eliminate the root cause entirely)
- Full LOD crop+upscale pipeline (re-evaluate if placeholder approach is insufficient)
- `CogBitmapLayer` placeholder (bitmap tiles queue differently; less severe bottleneck)
