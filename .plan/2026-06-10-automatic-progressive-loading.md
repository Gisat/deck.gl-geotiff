# Automatic Progressive Loading — Default LOD Behavior

**Date:** 2026-06-10  
**Status:** ✅ Complete — All bugs fixed (see Section 7). Follow-up: see `.plan/2026-06-11-two-layer-terrain-lod.md` for the two-layer LOD approach that solves blank areas when panning at high zoom.

---

## Problem

The LOD placeholder/progressive loading feature requires users to manually manage state in their application code:
- `overviewLoaded` state in React components
- Manual `zoomOverride` prop with gate logic
- Custom `onTileLoad` callback with 500ms debounce

This is wrong architecture — the burden should not be on every user. Progressive loading should be **automatic by default** when using `CogTerrainLayer` with `isTiled: true`.

---

## Solution

Move the LOD gate logic **inside** `CogTerrainLayer.ts` as internal state. Users get progressive loading automatically without any manual setup.

---

## Implementation Tasks

> **Note:** Sections 1–5 are already implemented in `geoimage/src/layers/CogTerrainLayer.ts`.
> The current implementation contains four bugs that must be corrected — see **Section 7**.

### 1. ✅ Add Internal State to `CogTerrainLayer.ts` — DONE

### 2. ✅ Add `enableProgressiveLoading` Prop — DONE

### 3. ✅ Implement Automatic LOD Gate in `renderLayers()` — DONE (needs fix, see 7.2)

### 4. ✅ Implement Internal `onTileLoad` Wrapper — DONE (needs fix, see 7.1)

### 5. Clean Up Example Application

**5.1** Remove manual state management from `CogTerrainLayerExample.tsx`
- Remove `overviewLoaded` state (line 47)
- Remove `overviewTileLoadedRef` ref (line 48)
- Remove `dynamicZoomOverride` calculation (lines 111-112)
- Remove `zoomOverride` prop from `CogTerrainLayer` (line 128)
- Remove entire `onTileLoad` gate logic (lines 131-141)

**5.2** Simplify layer instantiation
- The `CogTerrainLayer` should now work with just the essential props:
  ```typescript
  const cogLayer = new CogTerrainLayer({
    id: 'cog-terrain-layer',
    elevationData: mainCog.url,
    cogTiles: initializedCog,
    isTiled: true,
    tileSize: 256,
    meshMaxError: 'auto',
    operation: 'terrain+draw',
    terrainOptions,
    pickable: '3d',
    onZRangeUpdate: onZRangeUpdate,
    // Progressive loading now automatic by default!
    // No zoomOverride, no overviewLoaded, no onTileLoad gate needed
  });
  ```

### 6. Update Plan Document

**6.1** Update `.plan/2026-06-06-lod-placeholder-layer.md`
- Add note at top that the implementation has been refactored to be automatic by default
- Reference this plan file for the automatic behavior implementation

---

## Expected Outcome

**Before:**
- Users must copy 20+ lines of boilerplate state management
- Easy to get wrong (missing debounce, incorrect gate logic)
- Clutters application code

**After:**
- `CogTerrainLayer` with `isTiled: true` automatically enables progressive loading
- Users can disable with `enableProgressiveLoading: false` if needed
- Zero boilerplate in application code

---

## Files to Change

| File | Change |
|------|--------|
| `geoimage/src/layers/CogTerrainLayer.ts` | Add internal state, `enableProgressiveLoading` prop, automatic LOD gate logic |
| `example/src/examples/CogTerrainLayerExample.tsx` | Remove manual state management, simplify layer instantiation |
| `.plan/2026-06-06-lod-placeholder-layer.md` | Add note about automatic behavior refactor |

---

## Testing

1. **Default behavior**: Create `CogTerrainLayer` with no LOD-related props → overview loads first automatically
2. **Disabled**: Set `enableProgressiveLoading: false` → all tiles request immediately
3. **Manual override**: Set explicit `zoomOverride` → user's value takes precedence over auto-gate
4. **User onTileLoad**: Provide custom `onTileLoad` callback → both internal gate and user callback fire

---

## Notes

- The 500ms debounce timing is still used internally — proven to prevent race conditions
- User's explicit `zoomOverride` always wins over automatic gate (backward compatibility)
- `enableProgressiveLoading` defaults to `true` — users opt-out if needed, not opt-in

---

## Section 7 — Bug Fixes Required

**File:** `geoimage/src/layers/CogTerrainLayer.ts`

All four fixes are in the same file. Apply them in order.

---

### 7.1 — Remove Arbitrary Debounce

**Problem:** The `onTileLoad` callback uses `setTimeout(..., 500)` to delay setting `overviewLoaded: true`. This is arbitrary and causes unnecessary render lag. The `overviewTileLoadTime` state field exists only to support this debounce and must also be removed.

**Step 7.1.1 — Remove `overviewTileLoadTime` from the state type declaration.**

Find this block (around line 214):
```typescript
declare state: {
  isTiled?: boolean;
  terrain?: MeshAttributes;
  zRange?: ZRange | null;
  minZoom: number;
  maxZoom: number;
  terrainCogTiles: CogTiles;
  initialized: boolean;
  overviewLoaded: boolean;
  overviewTileLoadTime: number | null;
};
```
Replace with (remove the `overviewTileLoadTime` line):
```typescript
declare state: {
  isTiled?: boolean;
  terrain?: MeshAttributes;
  zRange?: ZRange | null;
  minZoom: number;
  maxZoom: number;
  terrainCogTiles: CogTiles;
  initialized: boolean;
  overviewLoaded: boolean;
};
```

**Step 7.1.2 — Remove `overviewTileLoadTime` from `initializeState()`.**

Find in `initializeState()`:
```typescript
this.setState({
  terrainCogTiles,
  initialized: false,
  overviewLoaded: false,
  overviewTileLoadTime: null,
});
```
Replace with:
```typescript
this.setState({
  terrainCogTiles,
  initialized: false,
  overviewLoaded: false,
});
```

**Step 7.1.3 — Remove `overviewTileLoadTime` from both `updateState()` reset calls.**

In `updateState()`, find this block:
```typescript
if (props.cogTiles && props.cogTiles !== oldProps.cogTiles) {
  this.setState({ terrainCogTiles: props.cogTiles, overviewLoaded: false, overviewTileLoadTime: null });
} else if (elevationDataChanged) {
  // Reset progressive loading state when dataset URL changes
  this.setState({ overviewLoaded: false, overviewTileLoadTime: null });
}
```
Replace with:
```typescript
if (props.cogTiles && props.cogTiles !== oldProps.cogTiles) {
  this.setState({ terrainCogTiles: props.cogTiles, overviewLoaded: false });
} else if (elevationDataChanged) {
  // Reset progressive loading state when dataset URL changes
  this.setState({ overviewLoaded: false });
}
```

**Step 7.1.4 — Replace the `onTileLoad` implementation in `renderLayers()`.**

Find this entire block inside the `TileLayer` props in `renderLayers()`:
```typescript
onTileLoad: (tile) => {
  // Internal LOD gate logic: detect when overview tile loads
  if (
    this.props.enableProgressiveLoading &&
    tile.index.z === this.state.minZoom &&
    !this.state.overviewLoaded &&
    !this.state.overviewTileLoadTime
  ) {
    // Start 500ms debounce: ensures overview renders to GPU before releasing gate
    this.setState({ overviewTileLoadTime: Date.now() });
    setTimeout(() => {
      this.setState({
        overviewLoaded: true,
        overviewTileLoadTime: null,
      });
    }, 500);
  }

  // Call user's onTileLoad callback if provided
  this.props.onTileLoad?.(tile);
},
```
Replace with:
```typescript
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

---

### 7.2 — Remove `zoomThreshold` LOD Blocking

**Problem:** The current gate logic also blocks tiles when `viewportZoom <= zoomThreshold` (minZoom + 3). This permanently caps `effectiveMaxZoom` to `minZoom` when the user is zoomed out, preventing deck.gl's TileLayer from ever loading intermediate-resolution tiles. The gate should be based solely on `overviewLoaded`.

Find this block inside `renderLayers()`:
```typescript
} else if (this.props.enableProgressiveLoading) {
  // Get current viewport zoom to determine if we should show overview or detail
  const viewportZoom = this.context.viewport?.zoom ?? this.state.maxZoom;
  const zoomThreshold = this.state.minZoom + 3;
  
  if (!this.state.overviewLoaded || viewportZoom <= zoomThreshold) {
    // Auto-gate: lock at minZoom if overview hasn't loaded OR if zoomed out
    // This keeps overview tiles visible when zooming back out
    effectiveMinZoom = this.state.minZoom;
    effectiveMaxZoom = this.state.minZoom;
  }
  // else: overview loaded and zoomed in → use full zoom range
}
```
Replace with:
```typescript
} else if (this.props.enableProgressiveLoading) {
  if (!this.state.overviewLoaded) {
    // Auto-gate: lock at minZoom until the overview tile has loaded
    effectiveMinZoom = this.state.minZoom;
    effectiveMaxZoom = this.state.minZoom;
  }
  // else: overview loaded → use full zoom range
}
```

---

### 7.3 — Fix Dead-Code Polygon Offset

**Problem:** `getPolygonOffset` in deck.gl is typed as `((params: {layerIndex: number}) => [number, number]) | null`. Its default value (from `Layer.defaultProps`) is the function `({layerIndex}) => [0, -layerIndex * 100]`. Since this function is truthy and not `null`/`undefined`, the `??` operator **always** takes the left side (`this.props.getPolygonOffset`), and the dynamic tile-zoom offset `[0, -z*1000]` is **never applied**.

Additionally, `getPolygonOffset` must be a **function** — passing a plain array would cause a runtime error because deck.gl calls it as `getPolygonOffset(uniforms)`.

Find in `renderSubLayers()`:
```typescript
// Dynamic polygon offset: pull higher zoom levels closer to camera to depth-test in front.
// Uses tile.index.z from closure to avoid Z-fighting between ancestor tiles and high-res detail.
// Formula: zoom 0 = offset 0, zoom 9 = offset -9000, zoom 12 = offset -12000, etc.
getPolygonOffset: this.props.getPolygonOffset ?? [0, -((props.tile?.index?.z ?? 0) * 1000)],
```
Replace with:
```typescript
// Dynamic polygon offset: pull higher zoom levels closer to camera to depth-test in front.
// Uses tile.index.z from closure to avoid Z-fighting between ancestor tiles and high-res detail.
// Formula: zoom 0 = offset 0, zoom 9 = offset -9000, zoom 12 = offset -12000, etc.
// getPolygonOffset must be a function (deck.gl calls it as getPolygonOffset(uniforms)).
// If the user supplied a custom override on the CogTerrainLayer, respect it;
// otherwise apply the tile-zoom-based dynamic offset.
getPolygonOffset: (this.props.getPolygonOffset !== (CogTerrainLayer.defaultProps as any).getPolygonOffset && this.props.getPolygonOffset != null)
  ? this.props.getPolygonOffset
  : () => [0, -((props.tile?.index?.z ?? 0) * 1000)],
```

---

### 7.4 — Fix ZRange Clipping Caused by `?? 0` Fallback

**Problem:** In `onViewportLoad()`, `ranges.map((x) => x?.[0] ?? 0)` converts tiles with missing bounding-box Z values to `0`. Since `0` is finite, it passes the `Number.isFinite` filter and drags `minZ` down to `0` even for datasets entirely above sea level.

A secondary edge case: after filtering, the array may be empty if no tiles have valid Z bounds. `Math.min(...[])` returns `Infinity` and `Math.max(...[])` returns `-Infinity`, which must also be guarded.

Find in `onViewportLoad()`:
```typescript
const minZ = Math.min(...ranges.map((x) => x?.[0] ?? 0).filter((n) => Number.isFinite(n)));
const maxZ = Math.max(...ranges.map((x) => x?.[1] ?? 0).filter((n) => Number.isFinite(n)));
```
Replace with:
```typescript
const minValues = ranges
  .map((x) => x?.[0])
  .filter((n): n is number => n !== undefined && Number.isFinite(n));
const maxValues = ranges
  .map((x) => x?.[1])
  .filter((n): n is number => n !== undefined && Number.isFinite(n));

if (minValues.length === 0 || maxValues.length === 0) {
  return;
}

const minZ = Math.min(...minValues);
const maxZ = Math.max(...maxValues);
```
