# LOD Placeholder Layer — Progressive Terrain Loading

**Date:** 2026-06-06  
**Status:** Phase 2 — Stencil Masking

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

---

## Chosen Solution: Stencil Masking

The placeholder layer uses the **WebGL stencil buffer** to hide itself precisely in the footprints where the detail layer has already rendered. This achieves pixel-perfect per-tile masking without shader rewrites and without any React state management overhead.

### How it works

| Pass | Layer | Stencil operation | Result |
|---|---|---|---|
| 1 (render first) | Placeholder | Write `0` everywhere it draws | Marks placeholder coverage |
| 2 (render second) | Detail tiles | Write `1` in every fragment they cover | Marks "detail present" footprint |
| 3 (re-read) | Placeholder (second pass / discard logic) | `stencilFunc: EQUAL, ref: 0` — discard fragments where stencil = 1 | Placeholder only visible where no detail tile has painted |

Because deck.gl renders layers in array order — placeholder first, detail on top — this naturally maps to a single-pass stencil write/test flow:

1. **Placeholder renders first:** draws its geometry, writes stencil value `0` everywhere.
2. **Detail tiles render second:** each rendered fragment writes stencil value `1`.
3. Any re-render of the placeholder uses `stencilTest: NOTEQUAL, ref: 1` to skip fragments already covered by detail.

### Why this is better than the `activeRequests` counter

| Concern | `activeRequests` counter | Stencil masking |
|---|---|---|
| Granularity | Global show/hide | Per-pixel per-tile |
| Ravine Z-fighting | Still visible globally until `activeRequests === 0` | Masked tile-by-tile as each detail tile arrives |
| Network race conditions | Requires `onInteractionStateChange` guards | Zero React state — GPU-only |
| Performance | React re-renders per tile event | Zero JS overhead after initial `parameters` setup |
| Transparency/opacity | Cannot use (breaks depth buffer) | Not needed — masking is binary per pixel |

### How overlay clamping still works

Both layers use `operation: 'terrain+draw'` and write to the depth buffer. `TerrainExtension` reads the **depth buffer** (not stencil), so satellite/OSM imagery continues to drape correctly. The stencil test does not interfere with depth writes.

---

## Visual Behaviour

| State | What the user sees |
|---|---|
| Initial load | Low-res terrain mesh covering full DEM + satellite/OSM draped on it |
| Detail tiles loading | Placeholder disappears tile-by-tile as each detail tile's footprint is stencil-masked |
| Fully loaded | Full-detail terrain; placeholder fragments fully masked, zero GPU overdraw |

---

## Phase 1 — Completed ✅

These items are implemented and committed on branch `feature/lod-placeholder-layer`.

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

### 1.3 Add placeholder layer to example app ✅

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- Placeholder uses **isolated `CogTiles` instance** (no `cogTiles` prop) so it gets its own worker pool, independent of detail layer traffic
- `activeRequests` counter tracks pending detail tile operations via `onTileLoad` / `onTileUnload` / `onTileError`
- `onInteractionStateChange` guard resets counter only when all interaction flags are `false`
- Layer order: `[terrainPlaceholderLayer, cogLayer, tileLayer]`

---

## Phase 2 — Stencil Masking (Current)

### The Network vs. Render Order Problem

A naive stencil approach creates a fundamental conflict:

| Goal | Needs |
|---|---|
| Same-frame stencil masking | `[detail, placeholder]` array order — detail writes stencil=1 first, placeholder reads it in the same draw call |
| Placeholder fetches first | `[placeholder, detail]` array order — placeholder's request fires before detail floods the 6-connection pool |

These are incompatible if array order controls both concerns simultaneously.

**Attempted alternative — next-frame stencil (`[placeholder, detail]`):**  
Placeholder renders first (writes stencil=0), detail renders second (writes stencil=1), then next frame placeholder tests stencil. Rejected because deck.gl's `MaskExtension` internally manages the stencil buffer and may modify or clear stencil values between frames. Cross-frame stencil reads are unreliable without ownership of the clear cycle.

### Solution: `onTileLoad` Gate + Flipped Render Order

Decouple network priority from render order by **gating the detail layer's existence** on the placeholder's `onTileLoad` event:

1. On boot, only the placeholder layer is in the `layers` array — it has **exclusive access** to all 6 browser connections and loads its single low-res tile immediately.
2. When placeholder fires `onTileLoad`, its tile is in GPU memory. A `detailLayerEnabled` flag flips to `true`.
3. `useMemo` re-evaluates: the detail layer is added to the array. It can now flood the connection pool — the placeholder tile is already rendered.
4. Layer order becomes `[detail, placeholder, tileLayer]`: detail writes stencil=1, placeholder reads it and masks covered pixels **in the same frame** — no cross-frame dependency, no stencil persistence assumptions.

```
Boot              → [placeholder]               → placeholder fetches instantly (exclusive network)
onTileLoad fires  → [detail, placeholder, tile] → detail floods network; same-frame stencil masking active
```

### 2.1 Add `stencilParameters` prop to `CogTerrainLayer` sublayers

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

- 2.1.1. Add `stencilParameters?: Record<string, unknown>` to `_CogTerrainLayerProps` type
- 2.1.2. In `renderSubLayers()`, merge `stencilParameters` into the `SimpleMeshLayer` `parameters` prop:
  ```ts
  parameters: {
    ...(this.props.stencilParameters ?? {}),
  },
  ```

### 2.2 Add `detailLayerEnabled` gate

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 2.2.1. Add state flag:
  ```ts
  const [detailLayerEnabled, setDetailLayerEnabled] = useState(false);
  ```
- 2.2.2. Add `onTileLoad` to the placeholder layer to open the gate:
  ```ts
  onTileLoad: () => setDetailLayerEnabled(true),
  ```
- 2.2.3. Conditionally construct the detail layer:
  ```ts
  const cogLayer = detailLayerEnabled ? new CogTerrainLayer({ id: 'cog-terrain-layer', ... }) : null;
  ```
- 2.2.4. Add `detailLayerEnabled` to `useMemo` dependencies.

### 2.3 Configure detail layer to write stencil

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 2.3.1. Pass `stencilParameters` to the detail `CogTerrainLayer`:
  ```ts
  stencilParameters: {
    stencilTest: true,
    stencilWriteMask: 0xFF,          // luma.gl v9: stencilWriteMask (not stencilMask)
    stencilCompare: 'always',        // always pass — write unconditionally
    stencilPassOperation: 'replace', // write the reference value
    stencilReference: 1,             // value written wherever detail renders
  },
  ```

### 2.4 Configure placeholder layer to test stencil

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 2.4.1. Pass `stencilParameters` to the placeholder `CogTerrainLayer`:
  ```ts
  stencilParameters: {
    stencilTest: true,
    stencilWriteMask: 0x00,          // luma.gl v9: stencilWriteMask (not stencilMask)
    stencilCompare: 'not-equal',     // luma.gl v9: kebab-case (not 'notEqual')
    stencilReference: 1,
    stencilReadMask: 0xFF,
  },
  ```
- 2.4.2. Change placeholder `visible` from `activeRequests > 0` to `true` — stencil test handles masking at GPU level.

### 2.5 Update layer array order and OSM tile layer position

**File:** `example/src/examples/CogTerrainLayerExample.tsx`

- 2.5.1. Return layers in `[cogLayer, terrainPlaceholderLayer, tileLayer].filter(Boolean)` order:
  - `cogLayer` renders first → writes stencil=1 in its footprint
  - `terrainPlaceholderLayer` renders second → masked where cogLayer painted
  - `tileLayer` (OSM) renders last as before

### 2.6 Remove `activeRequests` state (cleanup)

- 2.6.1. Remove `activeRequests` state variable
- 2.6.2. Remove `onTileLoad` (increment), `onTileUnload`, `onTileError` callbacks from detail layer  
  _(`onTileLoad` on the **placeholder** for the gate in 2.2.2 is kept)_
- 2.6.3. Remove `onInteractionStateChange` reset-to-zero logic (deck.gl clears stencil to `0` automatically at the start of every render frame via `layers-pass.js`)
- 2.6.4. Remove `activeRequests` from `useMemo` dependencies; add `detailLayerEnabled`

---

## Key Design Decisions

### `onTileLoad` gate — why not `setTimeout`
A timer delay is arbitrary and breaks on slow networks. `onTileLoad` fires exactly when the placeholder tile is in GPU memory — the only moment it is guaranteed safe to flood the connection pool with detail requests.

### Why `detailLayerEnabled` not `visible: false` on detail layer
`visible: false` still causes deck.gl to create the layer instance and call `getTileData` on tile requests — the tiles are just not drawn. The connection pool would still be flooded. Omitting the layer from the array entirely prevents all data fetching.

### Render order: `[detail, placeholder]` not `[placeholder, detail]`
Same-frame stencil masking requires detail to draw **before** the placeholder in each render frame. This is safe because by the time the detail layer enters the array (post-gate), the placeholder tile is fully loaded — there is no more network competition.

### Cross-frame stencil is avoided — and auto-clear confirmed
deck.gl's `layers-pass.js` calls `clearStencil = clearCanvas ? 0 : false` at the start of every render frame. This means:
1. No stale stencil values persist across frames — no manual clear needed, no `onBeforeRender` hook needed.
2. Stencil masking works within a single frame: detail draws and writes stencil=1, then placeholder reads it and skips covered pixels — all in the same frame, same draw list.

### Isolated `CogTiles` for placeholder
The placeholder does **not** receive `cogTiles: initializedCog`. It spins up its own isolated instance with its own worker pool. This prevents its single low-res tile from being queued behind 16+ detail tile requests in the shared worker FIFO queue.

### `meshMaxError: 30` not `80`
Lower `meshMaxError` = smaller triangles = the placeholder mesh follows valleys and ravines more closely. This minimises the elevation difference in ravines, reducing the stencil-unmasked surface area where Z-fighting could still be visible at tile boundaries.

### `disableTexture: true` on placeholder
Prevents a texture fetch, leaving one more HTTP connection slot for detail tiles during the gate phase.

### `getPolygonOffset: () => [0, 100]` retained
Retained as a secondary defence against Z-fighting at tile boundary seams where stencil values transition from 1 to 0.

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/layers/CogTerrainLayer.ts` | Add `stencilParameters` prop; merge into `SimpleMeshLayer` `parameters` |
| `example/src/examples/CogTerrainLayerExample.tsx` | Add `detailLayerEnabled` gate; `stencilWriteMask`/`'not-equal'` stencil params on both layers; `[detail, placeholder, tile]` layer order; remove `activeRequests` |

---

## Out of Scope

- HTTP/2 migration (investigate separately with infra team — would eliminate the root cause entirely)
- Full LOD crop+upscale pipeline (re-evaluate if placeholder approach is insufficient)
- `CogBitmapLayer` placeholder (bitmap tiles queue differently; less severe bottleneck)
- `CogTerrainGlazeExample.tsx` update (follow-up after `CogTerrainLayerExample.tsx` is validated)
