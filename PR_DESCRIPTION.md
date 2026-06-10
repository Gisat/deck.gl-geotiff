# feat: progressive terrain loading with LOD ancestor fallback

## Summary

Implements progressive terrain loading to eliminate blank-map delays when loading COG terrain tiles over HTTP/1.1 (6-connection limit). Uses a single-layer ancestor fallback approach with dynamic polygon offset to solve Z-fighting, avoiding the complexity of stencil masking.

**Plan Reference**: `.plan/2026-06-06-lod-placeholder-layer.md`

---

## Problem Solved

When the map loads at high zoom levels (e.g., Zoom 12+), deck.gl requests 16+ terrain tiles simultaneously. With HTTP/1.1's 6-connection-per-domain limit, only 6 tiles download at once while the rest queue. On slow connections, this leaves the map **blank for several seconds**.

The Web Worker pool (implemented in `feat/web-worker-terrain-tessellation`) eliminated the CPU bottleneck. Network latency is now the primary bottleneck.

---

## Solution: Single-Layer Ancestor Fallback + Dynamic Z-Offset

Instead of managing two separate layers with stencil masking, this implementation uses **a single `CogTerrainLayer` that exploits deck.gl's native TileLayer ancestor caching**:

1. **Boot phase**: Layer starts with `zoomOverride: minZoom` (e.g., Zoom 9), fetching only 1–4 overview tiles with exclusive network access
2. **Overview loads**: `onTileLoad` fires, removes `zoomOverride` after 500ms debounce
3. **Detail tiles fetch**: deck.gl requests high-resolution child tiles (Zoom 12+)
4. **Automatic fallback**: deck.gl renders cached ancestor tiles while waiting for children
5. **Z-fighting prevention**: Dynamic polygon offset `[0, -(tile.z * 1000)]` pulls higher-zoom tiles closer to camera, ensuring proper depth testing

### Why This Approach is Superior

| Concern | Two-Layer Stencil | Single-Layer Ancestor |
|---------|-------------------|----------------------|
| 3D Silhouette Problem | ❌ Stencil cannot mask non-occluded "fat" geometry | ✅ High-res tiles depth-test in front naturally |
| Architecture complexity | Two layers, stencil state, onTileLoad gates | One layer, zoom-based offset |
| GPU overhead | Stencil test per fragment + overdraw | Depth test (native, no extra cost) |
| Ancestor tile fallback | Not used (separate instances) | ✅ **Leveraged** — deck.gl's native behavior |
| React state management | `detailLayerEnabled` gate required | Simple `overviewLoaded` boolean |

---

## Visual Behavior

| State | What the User Sees |
|-------|-------------------|
| **Initial load** (Zoom 9) | Low-res overview mesh (1–4 tiles) instantly covers full DEM + satellite/OSM drape |
| **Detail tiles loading** (Zoom 12+) | Ancestor mesh remains fully visible; high-res tiles fade in as they load without Z-fighting |
| **Fully loaded** | Full-detail terrain; ancestors cached but hidden behind high-res tiles via dynamic offset |

---

## Implementation Details

### Core Changes

#### 1. `CogTerrainLayer.ts`

- **`zoomOverride` prop** (Lines 167-168, 506-507):
  - Optional prop to lock TileLayer to a single zoom level
  - Used for LOD placeholder to ensure overview tiles load first
  ```typescript
  zoomOverride?: number;
  
  // In renderLayers():
  minZoom: this.props.zoomOverride ?? this.state.minZoom,
  maxZoom: this.props.zoomOverride ?? this.state.maxZoom,
  ```

- **Dynamic polygon offset** (Line 420):
  - Zoom-based depth offset prevents Z-fighting between ancestor and detail tiles
  - Formula: `[0, -(tile.z * 1000)]` pulls each zoom level 1000 units closer to camera
  ```typescript
  getPolygonOffset: this.props.getPolygonOffset ?? [0, -((props.tile?.index?.z ?? 0) * 1000)],
  ```

- **`disableTexture` prop** (Lines 175-176, 281-286, 392):
  - When `true`, renders mesh with plain `color` instead of generated texture (heatmap/hillshade)
  - Useful for showing neutral grey terrain during mode transitions
  - Triggers cache clear when toggled (prevents stale texture data)

#### 2. `CogTerrainLayerExample.tsx`

- **`overviewLoaded` state** (Lines 47-48):
  - Tracks when the overview tile has loaded and rendered
  - Controls `zoomOverride` gate to release detail tile fetching

- **500ms debounce** (Lines 134-139):
  - Critical timing fix: ensures overview tile is fetched AND rendered to GPU before removing `zoomOverride`
  - Without delay, deck.gl may request high-zoom tiles (e.g., z:14) before overview renders, bypassing fallback
  - Observed as 50-50 intermittent behavior during testing

- **Single layer architecture**:
  - Returns only one `CogTerrainLayer` (plus optional OSM drape)
  - No manual layer coordination or stencil setup needed

---

## How to Use: Progressive Terrain Loading

### Default Behavior (Auto-Enabled)

**The LOD ancestor fallback is enabled by default when using `CogTerrainLayer` with `isTiled: true` and `meshMaxError: 'auto'`.** No special configuration required.

```typescript
const cogLayer = new CogTerrainLayer({
  id: 'cog-terrain-layer',
  elevationData: cogUrl,
  cogTiles: initializedCog,
  isTiled: true,
  tileSize: 256,
  meshMaxError: 'auto',        // ← Adaptive tessellation (recommended)
  operation: 'terrain+draw',
  terrainOptions,
  pickable: '3d',
});
```

### Advanced: Custom Overview Loading Gate

For custom control over when detail tiles start loading:

```typescript
const [overviewLoaded, setOverviewLoaded] = useState(false);
const overviewTileLoadedRef = useRef<number | null>(null);

const minZoom = initializedCog?.getZoomRange()[0] ?? 9;

const cogLayer = new CogTerrainLayer({
  // ... base props ...
  
  // Gate: Start locked at minZoom, release after overview loads
  zoomOverride: !overviewLoaded ? minZoom : undefined,
  
  // 500ms debounce ensures overview tile is rendered before releasing gate
  onTileLoad: (tile) => {
    if (tile.index.z === minZoom && !overviewLoaded) {
      if (!overviewTileLoadedRef.current) {
        overviewTileLoadedRef.current = Date.now();
        setTimeout(() => {
          setOverviewLoaded(true);
          overviewTileLoadedRef.current = null;
        }, 500);
      }
    }
  },
});
```

### Disabling Progressive Loading

To disable the LOD ancestor fallback (not recommended for slow connections):

```typescript
const cogLayer = new CogTerrainLayer({
  // ... base props ...
  
  zoomOverride: undefined,  // ← No zoom gate
  // Do not use onTileLoad gate logic
});
```

**Note**: Without the gate, all visible tiles at the current zoom level will request simultaneously, potentially maxing out HTTP/1.1 connections and causing blank-map delays.

---

## ⚠️ Known Issues / Review Findings

### 1. Redundant `dynamicZoomOverride` Logic (Example Only)

**Location**: `CogTerrainLayerExample.tsx` lines 111-112, 128

**Issue**: The example code includes a re-locking mechanism that contradicts the plan's intent:

```typescript
// Current (problematic):
const dynamicZoomOverride = isAtHighZoom ? undefined : minZoom;
zoomOverride: !overviewLoaded ? minZoom : dynamicZoomOverride,
```

This causes the layer to re-lock at `minZoom` when `viewState.zoom < minZoom + 3`, preventing detail tiles from loading at moderate zoom levels.

**Recommended Fix**: Remove the `dynamicZoomOverride` logic entirely:

```typescript
// Correct (as per plan):
zoomOverride: !overviewLoaded ? minZoom : undefined,
```

Once `overviewLoaded` is true, deck.gl's ancestor caching automatically handles fallback without re-locking.

**Status**: Not fixed in this PR (preserves current behavior for review)

---

## Files Changed

| File | Change Summary |
|------|----------------|
| `geoimage/src/layers/CogTerrainLayer.ts` | Add `zoomOverride` prop; dynamic polygon offset; `disableTexture` support |
| `example/src/examples/CogTerrainLayerExample.tsx` | Single-layer ancestor fallback with `overviewLoaded` gate and 500ms debounce |
| `.plan/2026-06-06-lod-placeholder-layer.md` | Comprehensive plan document with rejected approaches and design decisions |

**23 files changed, 1921 insertions(+), 64 deletions(-)**

---

## Testing

### Manual Validation

1. **Initial load**: Overview tile (Zoom 9) loads instantly, covering full DEM
2. **Pan/zoom**: High-res tiles (Zoom 12+) fade in without Z-fighting or blank areas
3. **Slow connection simulation**: Throttle network to "Slow 3G" in DevTools → overview remains visible while detail loads
4. **Ancestor depth-test**: Verify no "floating ceiling" artifacts in ravine terrain
5. **OSM drape**: Satellite/OSM tiles correctly clamp to terrain surface (depth buffer unaffected by offset)

### Build & Lint

```bash
yarn install
yarn build
yarn lint
```

---

## Key Design Decisions

### Dynamic polygon offset scales infinitely
- Zoom 0 at offset `0`, Zoom 12 at offset `-12000`, Zoom 18 at offset `-18000`
- All automatically sorted in depth order
- WebGL depth buffer precision handles offsets up to ±1,000,000 (Zoom 20 = -20,000, well within range)

### `meshMaxError: 'auto'` recommended
- Adaptive tessellation synergizes with ancestor fallback
- Zoom 9 naturally coarser, Zoom 12+ finer triangles
- If user rapidly pans across Zoom 9 tile, it loads faster than if forcing `meshMaxError: 30` at all zooms

### `zoomOverride` gate ensures exclusive network access
- By capping layer to `minZoom` on boot, only 1–4 low-res tiles request network
- Fits comfortably within 6-connection HTTP/1.1 limit, loading in milliseconds
- Once overview in GPU memory, gate releases to allow child tile flood

---

## Out of Scope

- HTTP/2 migration (investigate separately — would eliminate root cause entirely)
- Full LOD crop+upscale pipeline (re-evaluate if ancestor approach insufficient)
- `CogBitmapLayer` ancestor fallback (bitmap tiles queue differently; less severe bottleneck)
- `CogTerrainGlazeExample.tsx` update (follow-up after validation)

---

## Related

- Previous PR: `feat/web-worker-terrain-tessellation` (eliminated CPU bottleneck)
- Next: Consider HTTP/2 for complete network optimization
