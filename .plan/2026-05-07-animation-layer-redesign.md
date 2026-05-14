# CogAnimationLayer Architecture — Refined Plan (Corrected)

**Branch:** `feat/cpu-animation-rd`  
**Date:** 2026-05-07  
**Status:** Ready for implementation  
**Objective:** Multi-band terrain animation layer that reuses CogTerrainLayer patterns, lets user explicitly fetch all bands (in one HTTP request per tile), caches in React state, and scrubs via slider using SubLayer Swap pattern.

---

## Problem Statement & Architectural Corrections

Enable animation of time-series terrain data (e.g., elevation changes over time) from a multi-band COG.

**Critical fixes from Gemini's flaws review:**
1. ✅ **Flaw 1 (Network bottleneck):** Use ONE interleaved HTTP request per tile (not 30 sequential requests)
2. ✅ **Flaw 2 (Slider flicker):** Use SubLayer Swap pattern (swap mesh reference, no buffer destruction)
3. ✅ **Flaw 3 (React state destruction):** Store cache in React component state (not layer property)

---

## Architecture

### Two-Phase Visualization

**Phase 1: Normal Mode** (default, initial load)
- Use existing `CogTerrainLayer` tile system
- Single band fetched on-demand
- User can pan/zoom freely
- UI: "Fetch all bands for animation" button

**Phase 2: Multi-Band Cached Mode** (after user clicks button)
- Collect **all visible tiles** at current zoom
- For each visible (x, y, z): **ONE HTTP request fetches all bands** (interleaved read)
- Cache stored in **React component state** (survives re-renders)
- Cache key: `"${z}_${x}_${y}"` (tile coordinates)
- **SubLayer Swap pattern:** slider changes `currentBandIndex` → `renderSubLayers()` swaps mesh reference (no buffer destruction)
- Pan/zoom handling:
  - **Within cached area:** show cached multi-band data (instant mesh swap)
  - **Outside cached area:** show "New data available" → can refetch
  - **Zoomed out below cached zoom:** use closest cached zoom level (graceful degradation)
- One AOI at a time → clear cache when user fetches new area

### Cache Structure (React State)

```ts
// In CogAnimationExample.tsx (React component)
const [bandCache, setBandCache] = useState<Map<string, TileResult[]>>(new Map());
// Key: "8_142_157" (z_x_y)
// Value: [band0TileResult, band1TileResult, ..., band29TileResult]

const [currentBandIndex, setCurrentBandIndex] = useState(0);
const [isFetched, setIsFetched] = useState(false);
const [currentFetchZoom, setCurrentFetchZoom] = useState<number | null>(null);
```

### Key Design Principles

1. **One HTTP request per tile** — use `CogTiles.getTileAllBands()` (interleaved read)
2. **React state cache** — move cache out of layer lifecycle
3. **SubLayer Swap pattern** — swap mesh in `renderSubLayers()`, not `getTileData()`
4. **No `updateTriggers`** — avoid buffer destruction on slider moves
5. **Explicit data flow** — cache passed via props from React to layer
6. **Graceful degradation** — show best available data, even if from wrong zoom

---

## Implementation Steps

### 1.1 Add `getTileAllBands()` to `CogTiles`

**File:** `geoimage/src/core/CogTiles.ts`

**Signature:**
```ts
async getTileAllBands(
  x: number,
  y: number,
  z: number,
  meshMaxError?: number,
  signal?: AbortSignal
): Promise<TileResult[]>
```

**Logic:**
1. Resolve `imageIndex = this.getImageIndexForZoomLevel(z)`
2. Get image window for tile (x, y, z)
3. Call `image.readRasters({ window: [...], interleave: true, signal })` — **ONE HTTP request**
4. For each band in `rasters`:
   - Call `GeoImage.getMap({ rasters: [band], ... })` → generates `TileResult`
5. Return array of `TileResult[]` (one per band)

**Key:** The `interleave: true` parameter makes `geotiff.js` return interleaved pixels, but we still need to generate separate `TileResult` meshes (one per band).

### 1.2 Add cache storage to `CogAnimationLayer` props

**File:** `geoimage/src/layers/CogAnimationLayer.ts`

**New props:**
```ts
type CogAnimationLayerProps = CompositeLayerProps & {
  bandCache?: Map<string, TileResult[]>;      // Passed from React
  currentBandIndex: number;                    // Current band to display (0-based)
  isFetched: boolean;                          // Is multi-band mode active?
}
```

### 1.3 Modify `getTileData()` to read from cache

**File:** `geoimage/src/layers/CogAnimationLayer.ts`

```ts
async getTileData(tile: any) {
  const { x, y, z } = tile.index;
  const tileKey = `${z}_${x}_${y}`;
  
  // Multi-band mode: read from React state cache (no network)
  if (this.props.isFetched && this.props.bandCache?.has(tileKey)) {
    return this.props.bandCache.get(tileKey);  // Return ALL bands
  }
  
  // Single-band mode: fetch on-demand (before "Fetch All")
  const result = await this.cogTiles.getTile(x, y, z, this.props.currentBandIndex);
  return result ? [result] : null;
}
```

### 1.4 Implement SubLayer Swap in `renderSubLayers()`

**File:** `geoimage/src/layers/CogAnimationLayer.ts`

```ts
renderSubLayers(props: any) {
  const { allBands, currentBandIndex, ... } = props;
  
  if (!allBands || allBands.length === 0) {
    return [];
  }
  
  // SubLayer Swap: pick the mesh for current band
  const currentBandResult = allBands[currentBandIndex];
  
  if (!currentBandResult) {
    return [];
  }
  
  return [new SimpleMeshLayer({
    id: this.props.id,  // ⚠️ CRITICAL: Keep ID stable (do NOT append currentBandIndex)
    data: [1],
    mesh: currentBandResult.map,
    texture: currentBandResult.texture ?? null,
    getPosition: () => [0, 0, 0],
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getColor: [200, 200, 200, 255],
  })];
}
```

**Key:** 
- ✅ ID stays stable (`props.id`, not `props.id-band-${currentBandIndex}`)
- ✅ Only mesh reference changes → no layer destruction/recreation
- ✅ No `updateTriggers` on `currentBandIndex` → zero flicker

### 1.5 Implement "Fetch all visible tiles" in React component

**File:** `example/src/examples/CogAnimationExample.tsx`

```ts
// State management
const [bandCache, setBandCache] = useState<Map<string, TileResult[]>>(new Map());
const [currentBandIndex, setCurrentBandIndex] = useState(0);
const [isFetched, setIsFetched] = useState(false);
const [currentFetchZoom, setCurrentFetchZoom] = useState<number | null>(null);
const [loading, setLoading] = useState(false);
const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);

// When "Fetch All" button clicked
const handleFetchAll = async () => {
  setLoading(true);
  setBandCache(new Map());  // Clear old cache
  
  // Collect visible tiles (from TileLayer's getTileData calls)
  const visibleTiles = collectVisibleTiles(deckglRef);  // ← Intercept from TileLayer
  
  const newCache = new Map<string, TileResult[]>();
  const total = visibleTiles.length;
  let loaded = 0;
  
  for (const { x, y, z } of visibleTiles) {
    const tileKey = `${z}_${x}_${y}`;
    
    // ONE HTTP request for all bands (interleaved read inside)
    const bandResults = await cogTilesRef.current.getTileAllBands(x, y, z);
    
    if (bandResults.length > 0) {
      newCache.set(tileKey, bandResults);
    }
    
    loaded++;
    setLoadProgress({ loaded, total });
  }
  
  setBandCache(newCache);
  setCurrentFetchZoom(viewState.zoom);
  setIsFetched(true);
  setCurrentBandIndex(0);
  setLoading(false);
};

// Slider handler (instant, no network)
const handleBandChange = (newIndex: number) => {
  setCurrentBandIndex(newIndex);
  // ← Layer re-renders, renderSubLayers() picks new band mesh (instant swap)
};
```

### 1.6 Detect viewport changes

**File:** `example/src/examples/CogAnimationExample.tsx`

```ts
const handleViewStateChange = (newViewState: any) => {
  setViewState(newViewState);
  
  // If zoom changed significantly: offer to refetch
  if (isFetched && currentFetchZoom !== null && newViewState.zoom !== currentFetchZoom) {
    setShowNewDataAvailable(true);
  }
};
```

### 1.7 Collect visible tiles from deck.gl

**File:** `example/src/examples/CogAnimationExample.tsx`

Add a ref to the CogAnimationLayer and intercept visible tiles:

```ts
const deckglRef = useRef(null);

// In TileLayer getTileData intercept, track which tiles are visible
const visibleTiles: Array<{x: number; y: number; z: number}> = [];

const collectVisibleTiles = (deckglRef: any) => {
  // Option 1: Listen to layer's getTileData calls (requires custom getTileData wrapper)
  // Option 2: Compute visible tiles from viewport + zoom (simpler)
  const viewport = new WebMercatorViewport(viewState);
  const tileBounds = viewport.getBounds();  // [minLon, minLat, maxLon, maxLat]
  // Convert to tile coords at zoom level
  return tilesAtZoom(tileBounds, currentFetchZoom);
};
```

### 1.8 Add UI indicators

**UI Components needed in CogAnimationExample:**
1. "Fetch all bands for current view" button (disabled if loading/no cog)
2. Loading progress: `"Fetching... Band N / Total"`
3. Band counter: `"Band ${currentBandIndex + 1} / ${totalBands}"`
4. Slider: `0..totalBands-1` (onChange → `handleBandChange`)
5. Alert when new area available: `"New data available. [Fetch] [Dismiss]"`
6. Status indicator: `"Zoom ${currentFetchZoom} cached"`

---

## Implementation Files

- `geoimage/src/core/CogTiles.ts` — add `getTileAllBands()` method
- `geoimage/src/layers/CogAnimationLayer.ts` — modify `getTileData()`, `renderSubLayers()`
- `geoimage/src/layers/index.ts` — export layer (already done)
- `geoimage/src/index.ts` — export layer (already done)
- `example/src/examples/CogAnimationExample.tsx` — React component with state, "Fetch All" button, slider
- `example/src/examples/index.ts` — register example route
- `example/src/App.tsx` — route entry
- `example/src/components/SideBar.tsx` — add to sidebar menu

---

## Testing / Validation Checklist

- [ ] Load example → shows single-band terrain (normal mode, no cache)
- [ ] Click "Fetch all visible tiles" → fetches all bands for visible tiles (ONE request per tile)
- [ ] Loading indicator shows progress (Band N / Total)
- [ ] After fetch: move slider → band switches **instantly** (no lag, no buffer flicker)
- [ ] Pan/zoom within cached area → shows cached multi-band data
- [ ] Pan/zoom to new area → shows "New data available" indicator
- [ ] Click "Fetch" again → clears old cache, fetches new area
- [ ] Zoom out beyond cached level → shows gracefully degraded data (if available)
- [ ] Verify: no white screen (data is visible)
- [ ] Verify: mesh/terrain is rendered correctly
- [ ] Verify: slider response is instant (<10ms, no buffer destruction)
- [ ] Network: confirm ONE request per tile (not 30 separate requests)

---

## Key Differences from Original Plan

| Original | Corrected |
|---|---|
| Loop `getTile()` for each band (30 requests/tile) | `getTileAllBands()` (1 request/tile, interleaved) |
| Cache in layer class property | Cache in React state |
| No slider update strategy | SubLayer Swap pattern (instant mesh swap) |
| No data flow clarity | Props-based (React → Layer) |

---

## Notes

- **HTTP optimization:** The `interleave: true` parameter in `geotiff.js` makes a single Range Request, not 30 separate ones
- **SubLayer Swap:** Swapping mesh reference = O(1), no WebGL buffer destruction
- **React state:** Survives re-renders, explicit data flow
- **Future:** If needed, add multi-region cache or implement LRU eviction policy
