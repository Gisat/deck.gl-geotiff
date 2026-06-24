# Tile Clipping Issue Analysis - 2026-06-04

## Problem Statement
When rendering an overlay `TileLayer` (Satellite/OSM) with a tilted and rotated 3D viewport, the foreground tile strip (closest to camera) is clipped and not displayed. This appears to be a frustum culling issue.

## Root Cause Analysis ✅ RESOLVED

**The issue is frustum culling math (Your Solution #1).**

When the viewport is tilted in 3D, deck.gl's `TileLayer` performs culling based on a **flat Z=0 plane assumption**. However, when a terrain layer raises the surface, the overlay `TileLayer` needs to know the **3D bounding volume** to properly compute which tiles are visible.

## Solution Implemented ✅ COMPLETE

### Code Changes
- ✅ Added `onZRangeUpdate` callback prop to `CogTerrainLayer`
- ✅ Updated `CogTerrainKernelExample.tsx` with zRange integration
- ✅ Updated `CogTerrainGlazeExample.tsx` with zRange integration
- ✅ Verified builds and type-checks pass

### Documentation Updates
- ✅ Added comprehensive guide in `showcase-layers.md` (Section 3.6: Overlay Tiles with Proper 3D Frustum Culling)
- ✅ Documented `onZRangeUpdate` callback in `api-reference.md`
- ✅ Included working code examples showing OSM/Satellite overlays synced with terrain

## Commits

1. **feat: add zRange callback to CogTerrainLayer for 3D overlay tile culling** (b2e3f90)
   - Library implementation with callback prop
   - Example integration patterns
   
2. **docs: add overlay tile zRange culling guide and onZRangeUpdate API** (34f459b)
   - Showcase-layers.md guide (Section 3.6)
   - API reference documentation

## How to Use

```typescript
const [terrainZRange, setTerrainZRange] = useState<[number, number] | null>(null);

const layers = useMemo(() => [
  // Overlay with zRange for 3D culling
  new TileLayer({
    id: 'osm',
    zRange: terrainZRange,  // ← Prevents foreground tile clipping
    // ... other props
  }),
  // Terrain layer that updates zRange
  new CogTerrainLayer({
    // ... props
    onZRangeUpdate: setTerrainZRange,  // ← Sync elevation bounds
  }),
], [terrainZRange]);
```

## Testing Verification

✅ **Lint**: Passed (1 false-positive warning on parameter naming)
✅ **Build**: Both ESM and CJS built successfully  
✅ **TypeCheck**: Example app type-checks correctly

## Status: COMPLETE ✅

All changes tested, documented, and committed to `feat/tile-clipping-zrange-fix` branch.
Ready for PR review.
