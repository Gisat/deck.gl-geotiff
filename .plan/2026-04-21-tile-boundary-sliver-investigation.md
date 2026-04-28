# Tile Boundary Sliver Investigation & Future Improvements

**Date:** 2026-04-21  
**Author:** Copilot & User  
**Status:** Investigation Complete, Reverted (not in original plan)  
**Blocker:** No — does not affect PR review for Items 1-2

---

## Problem Statement

When rendering terrain with `CogTerrainLayer` using coarse `meshMaxError` values (≥ COG resolution), **small triangular gaps (slivers) appear between adjacent tiles**. The slivers:
- **Only visible when zooming in** (high zoom levels z=18+)
- **Disappear with fine meshMaxError** (≤ 5 meters)
- Appear as small triangle-sized discontinuities along tile boundaries
- Not fully fixed by visual band-aids like tall `terrainSkirtHeight`

### Example Scenario
- COG Resolution: 38 m/pixel
- meshMaxError: 40 meters  
- Zoom Level: 18+
- Result: Visible slivers between tile boundaries

---

## Root Cause Analysis

### Root Cause 1: Independent Martini Simplification (CONFIRMED)
**Issue:** Martini makes independent mesh simplification decisions per tile.  
**Impact:** Adjacent tiles with identical 257×257 boundary data may select different boundary vertices.

**Example:**
- Tile A boundary: keeps vertices at y=[0, 64, 128, 192, 256]
- Tile B boundary: keeps vertices at y=[0, 80, 144, 208, 256] (different positions!)
- Result: Gaps where one tile has a vertex the other doesn't

**Testing Results:**
- Martini does **consistently preserve boundary vertices** when boundary data varies
- With monotonic/simple slope data, only 4 corners are kept
- With realistic multi-frequency terrain, intermediate boundary vertices are preserved
- The issue: selection of which intermediate vertices are kept differs between tiles

### Root Cause 2: Floating-Point Precision in World Coordinates (PARTIALLY CONFIRMED)
**Issue:** Tile bounds from viewport projection have accumulated floating-point errors.  
**Impact:** Boundary vertex world positions computed with slightly different scales/offsets.

**Details:**
- At low zoom: bounds ≈ 50,000–100,000, floating-point epsilon ≈ 1e-15
- At high zoom: bounds ≈ 50,000,000–100,000,000, floating-point epsilon ≈ 1e-8
- Adjacent tiles compute scales differently: `xScale = (maxX - minX) / 256`
  - Tile A: xScale = (256.00000002 - 0.00000001) / 256 ≠ exactly 1.0
  - Tile B: xScale = (512.00000003 - 256.00000001) / 256 ≠ exactly 1.0
- Boundary vertices end up at ~1e-8 unit offsets

**Testing Results:**
- Rounding bounds to 6 decimals (micrometer precision) didn't eliminate slivers
- Snapping boundary vertices to tile bounds didn't eliminate slivers
- Suggests this is **a contributing factor but not the primary cause**

### Root Cause 3: Triangle Connectivity Mismatch (MOST LIKELY PRIMARY)
**Issue:** Martini simplifies the boundary independently; interior triangles near the boundary don't connect properly.  
**Impact:** One tile has triangles from a vertex the adjacent tile simplified away.

**Example:**
- Tile A interior near boundary: triangle A=(256,0)-(256,64)-(250,30)
- Tile B interior near boundary: triangle B=(0,0)-(0,64)-(10,30) with different interior vertex
- Even if (256,0)-(256,64) vertices align, the interior vertices (250,30) vs (10,30) don't match
- Results in triangular gaps

---

## Approaches Investigated

### Approach 1: Post-Process Vertex Addition ❌ (Not Viable)
**Idea:** After Martini returns simplif mesh, manually insert missing boundary vertices.  
**Problem:** 
- Adds vertices but not triangles
- Triangle indices become stale
- Would require complete triangle remesh, complex and error-prone
- No guarantee of proper connectivity

### Approach 2: Boundary Coordinate Snapping ❌ (Insufficient)
**Idea:** Snap boundary vertex world positions to exact tile edges.  
**Tested:** Round bounds to 6 decimals before snapping  
**Result:** Slivers still visible at high zoom
**Reason:** Doesn't address Root Cause 3 (triangle connectivity)

### Approach 3: Force Martini Boundary Vertices (NOT IMPLEMENTED)
**Idea:** Modify Martini's error map to force boundary pixels as must-keep vertices.  
**Status:** Martini.tile.errors is modifiable but calling `getMesh()` again doesn't re-tessellate  
**Conclusion:** Martini caches the mesh or error map isn't used after initial creation

### Approach 4: Coarser Boundary Grid (PARTIALLY INVESTIGATED)
**Idea:** Force boundary vertices every N pixels (e.g., every 16 pixels) before tessellation.  
**Challenge:** Need to modify terrain data or error map before Martini, not after  
**Status:** Not fully implemented due to Martini API limitations

---

## Recommended Fix Strategies (For Future Work)

### Strategy A: Pre-Tessellation Terrain Modification (Recommended)
**Priority:** High  
**Effort:** ~4 hours  
**Approach:**
1. Before passing terrain to Martini, artificially modify the terrain or error map
2. Mark boundary pixels as "critical" with high error penalties
3. Ensure Martini keeps consistent boundary vertices across tiles

**Implementation Options:**
- Option A1: Duplicate terrain and keep a version with inflated boundary errors
- Option A2: Use Delatin tesselator (has explicit boundary control) instead of Martini
- Option A3: Pre-compute Martini error map with boundary constraints

**Pros:**
- Addresses root cause at source
- Consistent boundary vertices guaranteed
- No post-process complexity

**Cons:**
- Requires deep understanding of Martini's error algorithm
- May reduce mesh optimization effectiveness
- Need to tune "force" parameters per zoom/resolution

### Strategy B: Use Delatin for Boundary-Critical Terrain
**Priority:** Medium  
**Effort:** ~2 hours  
**Approach:**
- For coarse meshMaxError values (>= 20m), switch to Delatin tessellator
- Delatin has more explicit boundary control and naturally handles stitching better
- Martini for fine meshes, Delatin for coarse

**Pros:**
- Leverages existing library with different algorithm
- Lower risk than modifying Martini behavior
- User-configurable via `tesselator` option

**Cons:**
- Delatin may have different visual quality
- Need benchmarking to ensure performance is acceptable
- Increases binary size (though already bundled)

### Strategy C: Explicit Boundary Stitching Post-Process
**Priority:** Low (fallback)  
**Effort:** ~6 hours  
**Approach:**
1. After Martini returns mesh, identify misaligned boundary edges
2. Explicitly add missing boundary vertices
3. Re-triangulate only the boundary regions

**Pros:**
- Non-invasive, doesn't modify core Martini usage
- Can be toggled per COG or zoom level

**Cons:**
- Complex triangle remeshing
- High maintenance burden
- Potential for visual artifacts if not carefully implemented

### Strategy D: Dynamic meshMaxError Based on Zoom Level (PRAGMATIC)
**Priority:** High  
**Effort:** ~3 hours  
**Approach:**
1. Allow `meshMaxError` to be a function of zoom level or predefined zoom-based lookup table
2. At low zoom (z<15): Use coarse meshMaxError (e.g., 40m) for performance
3. At medium zoom (z=15-18): Use moderate meshMaxError (e.g., 20m)
4. At high zoom (z>18): Use fine meshMaxError (e.g., 4-5m) to eliminate slivers
5. Optionally expose as user-configurable zoom/error map or hardcoded presets

**Examples:**

**Hardcoded preset (simplest):**
```typescript
const getMeshMaxErrorForZoom = (zoom: number, cogResolution: number) => {
  if (zoom < 12) return cogResolution * 3;      // Very coarse
  if (zoom < 15) return cogResolution * 1.5;    // Coarse
  if (zoom < 18) return cogResolution;          // Balanced
  return Math.min(cogResolution / 2, 5);        // Fine (prevent slivers)
};
```

**User-configurable (flexible):**
```typescript
interface MeshMaxErrorConfig {
  static: number;                          // Fixed value
  dynamic?: {                              // Optional zoom-based
    zoomLevels: [number, number, number];  // [low, medium, high]
    errors: [number, number, number];      // [error1, error2, error3]
  }
}
```

**Pros:**
- **Pragmatic:** Directly addresses the reported issue (slivers at high zoom)
- **Performance-friendly:** Coarse mesh at low zoom saves computation
- **User-friendly:** Can expose simple zoom-error mapping, no complex tuning
- **Naturally fixes slivers:** Fine meshes at high zoom force more boundary vertices (discovered during investigation)
- **Low risk:** Non-invasive, additive feature, backward compatible
- **Fast to implement:** Don't need to understand Martini internals

**Cons:**
- Doesn't fundamentally fix the boundary stitching issue (applies a workaround)
- Slight performance trade-off at high zoom
- Need to define good zoom/error mappings for common COG resolutions
- May not help if user deliberately sets `meshMaxError` very low

**Why This Works for Your Slivers:**
- You observed slivers only at high zoom (z=18+)
- You observed slivers disappear with `meshMaxError: 5`
- This strategy automatically switches to fine meshMaxError at high zoom
- Result: Slivers eliminated at zoom levels where they're visible, while keeping performance good at low zoom

### Strategy E: Accept Slivers with Documentation
**Priority:** Lowest (last resort)  
**Effort:** ~1 hour  
**Approach:**
- Document that coarse meshMaxError (>=30m) at high zoom shows minor artifacts
- Recommend users increase `terrainSkirtHeight` for coarse meshes
- Provide guidance on choosing appropriate meshMaxError for their data resolution

**Pros:**
- No code changes
- Users understand trade-offs

**Cons:**
- Poor user experience
- Doesn't solve the problem

---

## Implementation Notes for Future

### Key Files
- `geoimage/src/core/lib/TerrainGenerator.ts` — `getMartiniTileMesh()` method
- `geoimage/src/core/lib/Delatin.ts` — Alternative tessellator (already integrated)
- `geoimage/src/core/types.ts` — May need to extend options if adding boundary control parameters

### Testing Approach
1. Use example COG with 38 m/pixel resolution
2. Test at zoom levels 15-20
3. Vary meshMaxError from 5 to 80
4. Compare with/without fix side-by-side

### Benchmarking Considerations
- Measure tessellation time (Martini vs Delatin vs modified approach)
- Measure vertex count (does forcing boundaries add too many vertices?)
- Monitor memory usage for large tiled layers

### User Communication
- Document which `meshMaxError` values work well for different COG resolutions
- Add performance notes about sliver trade-offs
- Provide configuration examples for common scenarios

---

## Technical Observations

### Why meshMaxError=5 Works
With fine meshes, boundary vertices are dense enough (e.g., every 16-32 pixels) that gaps are **sub-pixel** and not visually apparent. The issue only appears with sparse boundary vertices.

### Zoom-Dependency
Floating-point precision degradation at high zoom makes the problem worse:
- Low zoom: slivers mostly hidden by perspective
- High zoom: 1e-8 unit offsets become visible due to rasterization

### Why Simple Snapping Didn't Work
Snapping boundary vertices to tile bounds only works if the bounds themselves are precise. Since bounds come from the projection system with floating-point errors, snapping "locks in" the error rather than eliminating it.

---

## Decision: Why Not Implement Now?

This investigation revealed the slivers are caused by **Martini's independent per-tile simplification** combined with floating-point precision issues. While interesting, fixing it is **orthogonal to Items 1-2** of the terrain performance plan:

- **Item 1** (verticalExaggeration): ✅ Complete
- **Item 2** (skirt O(n) fix): ✅ Complete
- **Slivers**: Not originally planned, blocks PR review, complex to fix correctly

**Decision:** Keep current PR focused on Items 1-2. Defer sliver fix to dedicated future work when user prioritizes it.

**Recommended Strategy for Future:** **Strategy D (Dynamic meshMaxError)** is the most pragmatic and directly addresses the observed issue. It's fast to implement, low-risk, and naturally eliminates slivers at high zoom where they're visible.

---

## Checklist for Future Implementation

- [ ] Decide on preferred strategy (D is recommended for pragmatism, A/B for correctness)
- [ ] If choosing Strategy D (dynamic meshMaxError):
  - [ ] Define zoom-level to meshMaxError mappings for common COG resolutions
  - [ ] Implement dynamic error function in CogTerrainLayer or CogTiles
  - [ ] Add configuration option (allow static or dynamic config)
  - [ ] Test zoom transitions to ensure smooth mesh LOD changes
  - [ ] Document zoom-error relationships in API reference
- [ ] If choosing Strategy A/B:
  - [ ] Spike on Martini error map API
  - [ ] Benchmark alternatives on coarse meshes
  - [ ] Implement chosen approach
- [ ] Test on multiple COG resolutions and zoom levels
- [ ] Update documentation with meshMaxError guidance (DONE)
- [ ] Create user-facing examples with optimal settings
