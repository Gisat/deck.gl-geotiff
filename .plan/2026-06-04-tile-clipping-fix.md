# Tile Clipping Issue Analysis - 2026-06-04

## Problem Statement
When rendering an overlay `TileLayer` (Satellite/OSM) with a tilted and rotated 3D viewport, the foreground tile strip (closest to camera) is clipped and not displayed. This appears to be a frustum culling issue.

## Root Cause Analysis

**The issue is frustum culling math (Your Solution #1).**

When the viewport is tilted in 3D, deck.gl's `TileLayer` performs culling based on a **flat Z=0 plane assumption**. However, when a terrain layer raises the surface, the overlay `TileLayer` needs to know the **3D bounding volume** to properly compute which tiles are visible.

## Architectural Analysis

### Current Implementation

1. **CogTerrainLayer** (lines 411-436 in `CogTerrainLayer.ts`):
   - ✅ Already computes and maintains `zRange` in state
   - ✅ Calculates `zRange` from loaded terrain tiles via `onViewportLoad()`
   - ✅ Passes `zRange` to its internal `TileLayer` (line 483)
   
2. **Standard Overlay TileLayer** (e.g., OSM, Satellite):
   - ❌ Currently has NO `zRange` prop
   - ❌ Assumes tiles exist on Z=0 plane
   - ❌ Frustum culling incorrectly excludes foreground tiles when viewport is tilted

### Why Your Other Solutions Don't Apply

- **Solution #2 (Tile Fetching/Padding)**: ❌ Not the issue - deck.gl already handles viewport padding automatically via the `TileLayer` implementation
- **Solution #3 (maxRequests)**: ❌ Concurrency issue would cause slow/delayed loading, not clipping/culling
- **Solution #4 (zoomOffset)**: ❌ Would affect tile resolution and grid alignment, not visibility culling

## Correct Solution: Pass `zRange` to Overlay TileLayer

The architecturally correct approach is:

1. **Access** `zRange` from the `CogTerrainLayer` instance (it's already being computed!)
2. **Pass** it to the overlay `TileLayer` as a prop
3. This tells deck.gl's frustum culling: **"tiles exist between minZ and maxZ, not just Z=0"**

## Implementation Strategy

### Option A: React State Pattern (Recommended for Examples)
Use React state to track `zRange` from terrain layer and pass to overlay:

```tsx
const [terrainZRange, setTerrainZRange] = useState<[number, number] | null>(null);

// In CogTerrainLayer:
<CogTerrainLayer
  onTileLoad={(tile) => {
    // Access updated zRange and sync to state
  }}
/>

// In overlay TileLayer:
<TileLayer
  zRange={terrainZRange}
  // ... other props
/>
```

### Option B: Add Public Getter (For Library Enhancement)
Add a `getZRange()` method to `CogTerrainLayer` for programmatic access.

## Implementation Checklist

### 1. Library Enhancement (Optional)
- [ ] 1.1 Add `getZRange()` public method to `CogTerrainLayer`
- [ ] 1.2 Add callback prop `onZRangeUpdate?: (zRange: ZRange | null) => void`

### 2. Example Updates (Required for Testing)
- [ ] 2.1 Update `CogTerrainKernelExample.tsx` - Add zRange to OSM TileLayer
- [ ] 2.2 Update `CogTerrainGlazeExample.tsx` - Add zRange to Satellite TileLayer
- [ ] 2.3 Test with tilted/rotated viewport to verify foreground tiles load

### 3. Documentation
- [ ] 3.1 Document the `zRange` requirement for overlay layers in README
- [ ] 3.2 Add code example showing proper overlay configuration

## Code Changes Required

### File: `geoimage/src/layers/CogTerrainLayer.ts`
**Action**: Add callback prop for zRange updates

```typescript
type _CogTerrainLayerProps = {
  // ... existing props
  
  /** Callback fired when terrain zRange is updated (for syncing overlay layers) */
  onZRangeUpdate?: (zRange: ZRange | null) => void;
};
```

Update `onViewportLoad` to call the callback:
```typescript
if (!zRange || minZ < zRange[0] || maxZ > zRange[1]) {
  const newZRange: ZRange = [
    Number.isFinite(minZ) ? minZ : 0, 
    Number.isFinite(maxZ) ? maxZ : 0
  ];
  this.setState({ zRange: newZRange });
  this.props.onZRangeUpdate?.(newZRange); // Notify parent
}
```

### File: `example/src/examples/CogTerrainKernelExample.tsx`
**Action**: Track zRange in state and pass to OSM layer

```typescript
const [terrainZRange, setTerrainZRange] = useState<[number, number] | null>(null);

// In layers array:
new TileLayer({
  id: 'osm',
  data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  zRange: terrainZRange, // ← ADD THIS
  // ... rest of props
}),
new CogTerrainLayer({
  // ... existing props
  onZRangeUpdate: setTerrainZRange, // ← ADD THIS
}),
```

### File: `example/src/examples/CogTerrainGlazeExample.tsx`
**Action**: Same pattern as above for Satellite layer

## Expected Behavior After Fix

✅ **Before tilt**: All tiles visible (no regression)  
✅ **During tilt**: Foreground tiles remain visible and load correctly  
✅ **3D rotation**: Full tile coverage maintained regardless of camera angle  

## Technical Explanation

deck.gl's `TileLayer` uses the `zRange` prop to expand its bounding volume for frustum culling. When `zRange` is:
- **Undefined/null**: Tiles assumed to be on Z=0 plane (2D mode)
- **[minZ, maxZ]**: Tiles assumed to exist within this elevation range (3D mode)

The frustum culling algorithm checks if the tile's 3D bounding box (including the zRange) intersects with the camera frustum. Without `zRange`, tilted cameras incorrectly cull tiles that are "below" the Z=0 plane in screen space but are actually visible on the elevated terrain surface.
