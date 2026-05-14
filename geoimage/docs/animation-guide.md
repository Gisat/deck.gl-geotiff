# Multi-Band Terrain Animation Guide

This guide covers implementing smooth, real-time terrain animation using multi-band COG data and the `cacheAllBands` option.

## What is Multi-Band Animation?

Multi-band COGs store multiple 2D rasters (bands/channels) in a single file. Common use cases:

- **Time-Series Data**: 30 daily elevation models stacked in one COG → animate month-long changes
- **Multi-Temporal Monitoring**: Seasonal snapshots of terrain (e.g., glacier retreat tracking)
- **Multi-Variable Analysis**: Different scalar fields (temperature, precipitation) in one file

The `cacheAllBands` feature lets you fetch and cache all bands **once**, then smoothly switch between them with a slider—zero additional network requests.

---

## When to Use `cacheAllBands: true`

### ✅ Good Fit
- **< 50 bands** — memory usage stays reasonable
- **Frequent band switching** — justify the upfront fetch cost
- **Interactive animations** — users expect instant response (no loading delays)
- **Fixed dataset** — bands don't change mid-session

### ❌ Poor Fit
- **100+ bands** — memory bloat and slow initial load
- **Rare band switching** — users check 1–2 bands per session
- **Limited device RAM** — mobile devices or older browsers
- **Very large tiles** (e.g., 512×512) — each band = multiple MB

---

## Architecture: How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  User Interaction: Slider Moves                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  React: useChannel prop changes (e.g., 1→5)                 │
│  updateTriggers: { getTileData: [currentBandIndex] }        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  CogTerrainLayer calls CogTiles.getTile(x, y, z)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ cacheAllBands enabled?   │
        └──┬─────────────────────┬─┘
           │ YES                 │ NO
           ▼                     ▼
    ┌─────────────────┐   ┌──────────────────┐
    │ Check Cache Key │   │ Normal Fetch     │
    │ z_x_y_band_5   │   │ (single band)    │
    └──┬──────────┬───┘   └──────────────────┘
       │          │
    HIT│          │MISS
       │          ▼
       │  ┌─────────────────────────┐
       │  │ getTileAllBands()       │
       │  │ (fetches all 30 bands)  │
       │  └─────────┬───────────────┘
       │            ▼
       │  ┌─────────────────────────┐
       │  │ Cache all bands         │
       │  │ z_x_y_band_1 → result1  │
       │  │ z_x_y_band_2 → result2  │
       │  │ ...                     │
       │  │ z_x_y_band_30 → result30│
       │  └─────────┬───────────────┘
       │            │
       └────────┬───┘
                ▼
      ┌──────────────────────┐
      │ Return Cached Band 5 │
      │ (instant!)           │
      └──────────┬───────────┘
                 ▼
        ┌──────────────────────┐
        │ deck.gl renders mesh │
        │ on GPU               │
        └──────────────────────┘
```

### Key Design Points

1. **Global Cache** — `GLOBAL_MULTI_BAND_CACHE` survives React re-renders and layer recreations
2. **Single HTTP Request** — `getTileAllBands()` fetches all 30 bands in one call, not 30 separate requests
3. **Lazy Evaluation** — First tile that needs band 5 triggers the fetch; other tiles reuse the cache
4. **Fallback** — If `getTileAllBands()` fails, seamlessly falls back to normal single-band fetch

---

## Implementation Example: React Slider

```tsx
import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView } from '@deck.gl/core';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';

const COG_URL = 'https://example.com/elevation-30-bands.tif';

function TerrainAnimationExample() {
  const [viewState, setViewState] = useState({ longitude: 0, latitude: 0, zoom: 12 });
  
  // 1. State for slider and caching
  const [currentBandIndex, setCurrentBandIndex] = useState(0);
  const [isFetched, setIsFetched] = useState(false); // Lazy-load pattern
  
  // 2. Pre-initialize CogTiles once to read metadata
  const [cogInstance, setCogInstance] = useState(null);
  useEffect(() => {
    if (!cogInstance) {
      const cog = new CogTiles({
        type: 'terrain',
        noDataValue: -32768.0,
        terrainSkirtHeight: 0,
        useChannel: 1,
        meshMaxError: 650,
        color: [0, 105, 148, 180],
        cacheAllBands: false, // Start false for lazy loading
      });
      
      cog.initializeCog(COG_URL).then(() => {
        setCogInstance(cog);
      });
    }
  }, []);

  // 3. Read total band count from COG metadata
  const totalBands = cogInstance?.getNumChannels?.() || 30;

  const layers = useMemo(() => {
    const layer = new CogTerrainLayer({
      id: 'terrain-animation',
      elevationData: COG_URL,
      isTiled: true,
      tileSize: 256,
      cogTiles: cogInstance || undefined,
      terrainOptions: {
        type: 'terrain',
        noDataValue: -32768.0,
        terrainSkirtHeight: 0,
        useChannel: currentBandIndex + 1, // 1-based
        meshMaxError: 650,
        color: [0, 105, 148, 180],
        cacheAllBands: isFetched, // Dynamic: only cache after button click
      },
      updateTriggers: {
        getTileData: [currentBandIndex, isFetched], // Re-fetch on band/cache changes
      },
    });
    return [layer];
  }, [currentBandIndex, cogInstance, isFetched]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <DeckGL viewState={viewState} onViewStateChange={({ viewState: v }) => setViewState(v)} layers={layers} />

      {/* Control Panel */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'white', padding: '16px', borderRadius: '8px' }}>
        <h3>Terrain Animation</h3>
        
        {/* Fetch Button */}
        <button
          onClick={() => setIsFetched(true)}
          disabled={isFetched}
          style={{
            width: '100%',
            padding: '8px',
            marginBottom: '12px',
            backgroundColor: isFetched ? '#e0e0e0' : '#4CAF50',
            color: isFetched ? '#999' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isFetched ? 'default' : 'pointer',
          }}
        >
          {isFetched ? '✅ Bands Cached' : '⬇️ Fetch All Bands'}
        </button>

        {/* Slider */}
        <div style={{ marginBottom: '12px' }}>
          <label>
            Band: {currentBandIndex + 1} / {totalBands}
          </label>
          <input
            type="range"
            min={0}
            max={totalBands - 1}
            value={currentBandIndex}
            disabled={!isFetched}
            onChange={(e) => setCurrentBandIndex(parseInt(e.target.value, 10))}
            style={{ width: '100%', cursor: isFetched ? 'pointer' : 'not-allowed' }}
          />
        </div>

        <p style={{ fontSize: '12px', color: '#666' }}>
          {!isFetched
            ? 'Click "Fetch All Bands" to enable smooth animation.'
            : 'Move the slider for instant animation!'}
        </p>
      </div>
    </div>
  );
}

export default TerrainAnimationExample;
```

---

## Performance Tuning

### Memory Calculation

```
Memory per tile = band_count × tile_size_float32

Example:
- 30 bands
- 256×256 tile (converted to 257×257 for Martini)
- Float32 (4 bytes per value)

Per tile: 30 × 257 × 257 × 4 = ~7.7 MB
Per viewport (4–9 visible tiles): ~31–69 MB
```

### Network Timing

```
Scenario 1: Single-band fetch (cacheAllBands: false)
- Band 1: 256 KB (1 HTTP request)
- Band 5: 256 KB (1 HTTP request)
- Band 30: 256 KB (1 HTTP request)
Total for 30 bands: 7.7 MB over 30 requests (~5–10 seconds on 4G)

Scenario 2: Multi-band cache (cacheAllBands: true)
- Initial fetch: 7.7 MB (1 HTTP request, ~2–5 seconds on 4G)
- Band 5 (after cache): 0 MB (0 requests, instant)
- Band 30 (after cache): 0 MB (0 requests, instant)
Total: 7.7 MB over 1 request
```

### Recommendations

| Scenario | cacheAllBands | Notes |
|---|---|---|
| **Mobile** | ❌ false | Avoid memory bloat on constrained devices |
| **Desktop, few bands (<20)** | ✅ true | Always cache for smooth UX |
| **Desktop, many bands (>50)** | ⚠️ lazy-load | Fetch on user demand with "Fetch All" button |
| **Low-bandwidth (slow 3G)** | ❌ false | 30-band fetch takes too long; prefer single-band |
| **High-bandwidth (fiber)** | ✅ true | Initial load is fast (~2 sec); smooth animation worth it |

---

## Troubleshooting

### "Slider is disabled or doesn't respond"

**Cause:** `isFetched` is `false`; bands haven't been cached yet.

**Fix:** Click the "Fetch All Bands" button first, or set `cacheAllBands: true` in the layer options directly (no button).

### "Band count showing as 30 instead of actual count"

**Cause:** `getNumChannels()` returns the fallback value because COG wasn't initialized.

**Fix:** Call `cogInstance.initializeCog(url)` before reading the value:

```tsx
const totalBands = cogInstance?.getNumChannels?.() || 30;
```

Use `useEffect` to wait for initialization:

```tsx
useEffect(() => {
  if (cogInstance) {
    const count = cogInstance.getNumChannels();
    console.log('Actual band count:', count);
  }
}, [cogInstance]);
```

### "Memory grows over time; animation slows down after 5 minutes"

**Cause:** Global cache accumulates all tiles × all bands; no automatic cleanup.

**Workaround:** Disable `cacheAllBands` for datasets with >50 bands and many tiles in view.

**Future improvement:** Add cache eviction policy (LRU or time-based).

### "First tile takes 3–5 seconds; then slider is instant"

**Expected behavior.** That's the `getTileAllBands()` fetch completing. Subsequent sliders are instant because they hit the cache.

**Optimization:** Show a loading indicator during the first 3–5 seconds:

```tsx
const [isLoading, setIsLoading] = useState(false);

// In layer definition:
updateTriggers: {
  getTileData: [currentBandIndex, isFetched],
  // Add a timeout to clear loading state after 5 seconds
}
```

---

## Band Descriptions (Metadata Labels)

Each band in a COG can have a description stored in GDAL metadata. This is automatically loaded during `initializeCog()` and can be displayed in your UI (e.g., to show dates, measurement years, or variable names).

### Loading Band Descriptions

Band descriptions are loaded automatically—no extra configuration needed:

```tsx
const cogInstance = new CogTiles({ type: 'terrain', /* ... */ });
await cogInstance.initializeCog(cogUrl);

// Get all band descriptions (0-based array)
const descriptions = cogInstance.getBandDescriptions();
// Result: ['20170101', '20170411', '20170720', ...]
```

### Displaying in the UI

Show the description for the current band in your slider label:

```tsx
const bandDescriptions = cogInstance?.getBandDescriptions?.() ?? [];
const currentDescription = bandDescriptions[currentBandIndex] || '';

return (
  <div>
    <label>
      Band: {currentBandIndex + 1} / {totalBands}
      {currentDescription && ` — ${currentDescription}`}
    </label>
    <input 
      type="range" 
      value={currentBandIndex} 
      onChange={(e) => setCurrentBandIndex(parseInt(e.target.value))}
    />
  </div>
);
```

### Format Flexibility

Band descriptions can contain any text—dates, years, variable names, or custom labels:
- **Time-series:** `20170101`, `2017-01-01`, or `Jan 2017`
- **Measurements:** `Temperature (°C)`, `Precipitation (mm)`, `Snow Depth`
- **Versions:** `v1.0`, `v1.1`, `final`

The library does no formatting; use the description as-is or parse/format it in your app.

### Storage in COG Files

Descriptions are stored in the GDAL metadata XML tag within the GeoTIFF. Most remote-sensing tools (GDAL, rasterio) support setting descriptions when creating COGs:

```bash
# Example: rasterio (Python)
with rasterio.open(output_path, 'w', **profile) as dst:
    dst.descriptions = ('20170101', '20170411', '20170720', ...)
    dst.write(data)
```

---

## Advanced: Custom Cache Management

The global cache lives at module scope in `CogTiles.ts`. If you need to clear it (e.g., swap datasets), you can access it like this:

```tsx
// Import the CogTiles class
import { CogTiles } from '@gisatcz/deckgl-geolib';

// To clear cache and start fresh:
const cog = new CogTiles({ /* options */ });
// Cache is global and shared; no direct API to clear yet.
// Workaround: reload the page or create a new CogTiles instance for a different COG URL.
```

**Future enhancement:** Add `clearCache()` method to CogTiles for manual cache management.

---

## See Also

- [API Reference: `cacheAllBands` Option](api-reference.md#animation--caching-options)
- [Library Architecture: Multi-Band Caching Flow](library-architecture.md#multi-band-caching-flow)
- [Example: Showcase Layers](showcase-layers.md#time-series-animation-example)
