# Automatic Progressive Loading — Default LOD Behavior

**Date:** 2026-06-10  
**Status:** In Progress

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

### 1. Add Internal State to `CogTerrainLayer.ts`

**1.1** Add `overviewLoaded` and `overviewTileLoadTime` to layer state type declaration
- Location: `geoimage/src/layers/CogTerrainLayer.ts` state type (around line 204-212)
- Add two new fields:
  ```typescript
  overviewLoaded: boolean;
  overviewTileLoadTime: number | null;
  ```

**1.2** Initialize the new state fields in `initializeState()`
- Location: `geoimage/src/layers/CogTerrainLayer.ts` around line 214-232
- In the `setState()` call, add:
  ```typescript
  overviewLoaded: false,
  overviewTileLoadTime: null,
  ```

### 2. Add `enableProgressiveLoading` Prop

**2.1** Add prop to `_CogTerrainLayerProps` type
- Location: `geoimage/src/layers/CogTerrainLayer.ts` around line 129-187
- Add after `zoomOverride`:
  ```typescript
  /**
   * When true (default), automatically loads low-resolution overview tiles first
   * before fetching high-resolution detail tiles. Prevents blank-map delays on slow connections.
   * Set to false to disable automatic LOD gate and request all visible tiles immediately.
   */
  enableProgressiveLoading?: boolean;
  ```

**2.2** Add to `defaultProps`
- Location: `geoimage/src/layers/CogTerrainLayer.ts` around line 68-101
- Add:
  ```typescript
  enableProgressiveLoading: true,
  ```

### 3. Implement Automatic LOD Gate in `renderLayers()`

**3.1** Calculate effective `zoomOverride` with automatic LOD gate
- Location: `geoimage/src/layers/CogTerrainLayer.ts` in `renderLayers()` method (around line 459-517)
- Before the `TileLayer` instantiation, add logic:
  ```typescript
  // Auto-enable LOD gate: start with minZoom, release after overview loads
  // User's explicit zoomOverride takes precedence over auto-gate
  let effectiveMinZoom = this.state.minZoom;
  let effectiveMaxZoom = this.state.maxZoom;
  
  if (this.props.zoomOverride !== undefined) {
    // User explicitly set zoomOverride — use it
    effectiveMinZoom = this.props.zoomOverride;
    effectiveMaxZoom = this.props.zoomOverride;
  } else if (this.props.enableProgressiveLoading && !this.state.overviewLoaded) {
    // Auto-gate: lock at minZoom until overview loads
    effectiveMinZoom = this.state.minZoom;
    effectiveMaxZoom = this.state.minZoom;
  }
  ```

**3.2** Use `effectiveMinZoom` and `effectiveMaxZoom` in TileLayer props
- Replace:
  ```typescript
  minZoom: this.props.zoomOverride ?? this.state.minZoom,
  maxZoom: this.props.zoomOverride ?? this.state.maxZoom,
  ```
- With:
  ```typescript
  minZoom: effectiveMinZoom,
  maxZoom: effectiveMaxZoom,
  ```

### 4. Implement Internal `onTileLoad` Wrapper

**4.1** Wrap user's `onTileLoad` with internal LOD detection logic
- Location: In the `TileLayer` props object in `renderLayers()`
- Replace the simple `onTileLoad: this.props.onTileLoad,` passthrough with:
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
