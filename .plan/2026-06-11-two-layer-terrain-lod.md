# Two-Layer Terrain LOD — Persistent Overview Fallback

**Date:** 2026-06-11  
**Status:** Planned

**Predecessor:** `.plan/2026-06-10-automatic-progressive-loading.md`

---

## Problem

After the progressive loading gate was implemented (Section 7), the initial load works correctly: the overview tile loads first, then the full detail range is unlocked.

**However**, a second gap remains: when the user is zoomed in and **pans to a new area**, then zooms out, blank areas appear where tiles have not been loaded yet. `refinementStrategy: 'best-available'` cannot help here because `minZoom` is already the lowest level — there are no ancestor tiles to fall back to.

**Example:** Dataset covers a whole country. User opens at Zoom 14 over City A. They pan 100km to City B. The `minZoom` (e.g. zoom 5) tile for City B was never requested. When they zoom out, deck.gl finds nothing in cache → blank.

---

## Solution

Replace the current single-TileLayer implementation in `renderLayers()` with two TileLayers:

1. **Base (overview) layer** — permanently locked to `minZoom`. Always fetches low-res tiles for whatever viewport area is visible. Acts as a guaranteed visual fallback.
2. **Detail layer** — covers `minZoom + 1` to `maxZoom`. Only created after `overviewLoaded: true`.

Both layers share the same `terrainCogTiles` instance (and therefore the same tile result cache), so a tile fetched by one layer is reused by the other at no extra cost.

Z-fighting is already handled: `getPolygonOffset: () => [0, -z*1000]` in `renderSubLayers()` (fixed in predecessor plan) mathematically ensures the detail layer's tiles always render in front of overview tiles at the GPU level.

### Progressive loading gate changes

In the current single-layer implementation, `overviewLoaded` is set to `true` in `onTileLoad` when any `minZoom` tile finishes decoding. In the two-layer approach, this moves to the **overview layer's `onViewportLoad`** callback — which fires when the full viewport is covered by overview tiles, not just a single tile. This is semantically better: detail tiles unlock only when the user actually sees a complete overview, not just a corner tile.

---

## Implementation

**File:** `geoimage/src/layers/CogTerrainLayer.ts`  
**Method:** `renderLayers()` only — no other methods need to change.

### Step 1 — Extract shared TileLayer props into a constant

Inside `renderLayers()`, after the `effectiveMinZoom`/`effectiveMaxZoom` block is **removed** (see Step 2), extract props shared by both layers:

```typescript
const sharedTileLayerProps = {
  getTileData: this.getTiledTerrainData.bind(this),
  renderSubLayers: this.renderSubLayers.bind(this),
  pickable: this.props.pickable,
  onClick: this.props.onClick,
  updateTriggers: {
    getTileData: {
      elevationData: urlTemplateToUpdateTrigger(elevationData),
      meshMaxError,
      elevationDecoder,
      terrainCogTiles: this.state.terrainCogTiles,
      skipTexture: !!(this.props.wireframe || this.props.operation === 'terrain' || this.props.disableTexture),
      useChannel: this.props.terrainOptions?.useChannel,
    },
    renderSubLayers: {
      disableTexture: this.props.disableTexture,
      terrainOptions: this.props.terrainOptions,
    },
  },
  zRange: this.state.zRange || null,
  tileSize,
  extent,
  maxRequests,
  onTileUnload,
  onTileError,
  maxCacheSize,
  maxCacheByteSize,
  refinementStrategy,
};
```

### Step 2 — Remove the effectiveMinZoom / effectiveMaxZoom block and the zoomOverride logic

**Remove** the entire block that calculates `effectiveMinZoom` and `effectiveMaxZoom`:

```typescript
// DELETE THIS ENTIRE BLOCK:
let effectiveMinZoom = this.state.minZoom;
let effectiveMaxZoom = this.state.maxZoom;

if (this.props.zoomOverride !== undefined) {
  effectiveMinZoom = this.props.zoomOverride;
  effectiveMaxZoom = this.props.zoomOverride;
} else if (this.props.enableProgressiveLoading) {
  if (!this.state.overviewLoaded) {
    effectiveMinZoom = this.state.minZoom;
    effectiveMaxZoom = this.state.minZoom;
  }
}
```

> **Note on `zoomOverride`:** This prop was used for manual LOD overrides from application code, which the automatic two-layer approach replaces. The `zoomOverride` prop can remain in the type definitions for backward compatibility but is no longer used internally. If it's still needed for edge cases, it can be applied to the detail layer's `maxZoom`.

### Step 3 — Also remove the onTileLoad gate from the TileLayer props

The `onTileLoad` handler currently sets `overviewLoaded: true`. This logic moves to the overview layer's `onViewportLoad` (see Step 4). 

**Remove** this block from the TileLayer props (the `onTileLoad` handler):

```typescript
// DELETE THIS BLOCK inside TileLayer props:
onTileLoad: (tile) => {
  // Release LOD gate immediately once any minZoom tile finishes loading
  if (
    this.props.enableProgressiveLoading &&
    tile.index.z === this.state.minZoom &&
    !this.state.overviewLoaded
  ) {
    this.setState({ overviewLoaded: true });
  }

  // Call user's onTileLoad callback if provided
  this.props.onTileLoad?.(tile);
},
```

### Step 4 — Replace the single TileLayer return with two layers

Replace the existing `return new TileLayer<MeshAndTexture | null>(...)` block with:

```typescript
// LAYER 1: Base overview layer — permanently locked to minZoom.
// Guarantees a low-res terrain tile is always loaded for any viewport area.
// Unlocks the detail layer once the viewport is fully covered at overview resolution.
const overviewLayer = new TileLayer<MeshAndTexture | null>(
  this.getSubLayerProps({ id: 'tiles-overview' }),
  {
    ...sharedTileLayerProps,
    minZoom: this.state.minZoom,
    maxZoom: this.state.minZoom,
    onViewportLoad: (tiles) => {
      // Release detail layer gate once overview viewport is fully covered
      if (this.props.enableProgressiveLoading && !this.state.overviewLoaded) {
        this.setState({ overviewLoaded: true });
      }
      this.onViewportLoad(tiles);
    },
    onTileLoad: this.props.onTileLoad,
  },
);

// If dataset has only one zoom level, return just the overview layer
if (this.state.minZoom === this.state.maxZoom) {
  return overviewLayer;
}

// LAYER 2: Detail layer — loads tiles from minZoom+1 to maxZoom.
// Only created after the overview is loaded (progressive loading gate).
// Renders on top of the overview layer via dynamic polygon offset.
const isDetailEnabled = !this.props.enableProgressiveLoading || this.state.overviewLoaded;

const detailLayer = isDetailEnabled
  ? new TileLayer<MeshAndTexture | null>(
      this.getSubLayerProps({ id: 'tiles-detail' }),
      {
        ...sharedTileLayerProps,
        minZoom: this.state.minZoom + 1,
        maxZoom: this.state.maxZoom,
        onViewportLoad: this.onViewportLoad.bind(this),
        onTileLoad: this.props.onTileLoad,
      },
    )
  : null;

return [overviewLayer, detailLayer].filter(Boolean) as LayersList;
```

---

## Key design decisions

| Decision | Reason |
|---|---|
| `onViewportLoad` triggers `overviewLoaded` (not `onTileLoad`) | `onViewportLoad` fires when the full viewport is covered, so the user always sees a complete overview before detail tiles unlock |
| Both layers share `terrainCogTiles` | Tile fetch results are cached inside `CogTiles.getTileResultCache`, so fetching the same tile from two layers hits the cache the second time |
| Detail layer `minZoom` is `minZoom + 1` | The base layer already handles `minZoom` tiles — starting at `minZoom + 1` avoids duplicate fetches at the same zoom |
| `filter(Boolean)` on return array | Safely excludes `null` detail layer during the progressive loading gate phase |
| `zoomOverride` removed from internal logic | The two-layer architecture makes the `zoomOverride` gate pattern obsolete; external prop remains for backward compatibility |

---

## Files to Change

| File | Change |
|---|---|
| `geoimage/src/layers/CogTerrainLayer.ts` | Refactor `renderLayers()` only — no other methods need changes |

---

## Testing

1. **Initial load**: Overview tiles appear first, then detail tiles load → same as before
2. **Pan while zoomed in**: No blanks — overview layer always loads the minZoom tile for the new area immediately
3. **Zoom out**: Overview layer covers the new viewport instantly; no blank frames
4. **Single-zoom dataset**: Only the overview layer is returned (minZoom === maxZoom guard)
5. **enableProgressiveLoading: false**: Detail layer is created immediately (no gate), overview layer still acts as permanent fallback
6. **Picking**: Both layers share `pickable` and `onClick` from `sharedTileLayerProps`
7. **Z-fighting**: Detail tiles always render in front of overview tiles (confirmed by polygon offset fix from predecessor plan)
