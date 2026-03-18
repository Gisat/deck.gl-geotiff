# Implementation Guide: Raw COG Value Picking

This document describes the steps required to implement functionality for retrieving exact, raw Cloud Optimized GeoTIFF (COG) pixel values (including multiband support) when interacting with the map.

## Overview

The current architecture fetches raw raster data but discards it after generating the visual representation (`ImageBitmap` or `Mesh`). To enable picking, we will modify the data pipeline to "bundle" the raw data alongside the visual map, making it accessible via deck.gl's picking engine.

---

## Step 1: Update Data Generators

We need to modify the generators to return both the visual output and the source data.

### 1.1 `BitmapGenerator.ts`
Modify `BitmapGenerator.generate` to return an object instead of just the `ImageBitmap`.

**Current:**
```typescript
return createImageBitmap(canvas);
```

**Proposed Change:**
```typescript
const map = await createImageBitmap(canvas);
return {
  map,
  raw: rasters[0], // Or a combined buffer for multiband
  width,
  height
};
```

### 1.2 `TerrainGenerator.ts`
Add the `raw` elevation data to the returned mesh object in `TerrainGenerator.generate`.

**Proposed Change:**
```typescript
return {
  // ... existing properties (indices, attributes, header)
  raw: terrain, // The Float32Array containing elevation values
  width,
  height
};
```

---

## Step 2: Update Core Orchestration

### 2.1 `GeoImage.ts`
Update the `getMap`, `getBitmap`, and `getHeightmap` methods to reflect the new return types.

### 2.2 `CogTiles.ts`
The `getTile` method should pass this bundled object through.

---

## Step 3: Update Layer Logic

Deck.gl's `TileLayer` stores whatever is returned by `getTileData` in the `tile.content` property. We must update the layers to handle the new bundled object.

### 3.1 `CogBitmapLayer.ts` & `CogTerrainLayer.ts`
1.  Update `getTiledBitmapData` / `getTiledTerrainData` to return the new bundled object.
2.  Update `renderSubLayers` to access the visual component from the `data` prop.

**Example for `CogBitmapLayer`:**
```typescript
renderSubLayers(props) {
  const { data } = props; // This is now { map, raw, width, height }
  if (!data) return null;

  return new SubLayerClass(props, {
    image: data.map, // Use the visual component
    // ... rest of props
  });
}
```

---

## Step 4: Expose to Application Code

Once the internal plumbing is updated, users can retrieve values in their application via the `onClick` or `onHover` events.

### Implementation Example (User Side)

```javascript
const onClick = (info) => {
  if (info.tile && info.tile.content) {
    const { raw, width, height } = info.tile.content;
    const [u, v] = info.uv; // Local coordinates within the tile (0.0 to 1.0)
    
    // Map UV to pixel coordinates
    const x = Math.floor(u * width);
    const y = Math.floor(v * height);
    
    // Calculate index based on channels
    const channels = 4; // Example for 4-band data
    const pixelIndex = (y * width + x) * channels;
    
    // Extract raw values
    const rawValues = raw.slice(pixelIndex, pixelIndex + channels);
    console.log("Raw Pixel Values:", rawValues);
  }
};

// In your DeckGL component:
<CogBitmapLayer id="my-cog" onClick={onClick} pickable={true} ... />
```

---

## Known Issues & Troubleshooting

### 1. Terrain Picking with Overlays
When a `TileLayer` or `BitmapLayer` is draped over a `CogTerrainLayer` (using `TerrainExtension`), the overlay layer may capture or block the picking events, even if `pickable: false` is set.

**Current Observation:**
Picking the `CogTerrainLayer` works perfectly when no visual overlays are present, but may stop responding when a base map (like OSM) is draped on top.

**Future Work / Potential Solutions:**
- **Polygon Offset**: Apply a small `getPolygonOffset` to the overlay layers to ensure the terrain mesh remains "closer" to the camera in the picking buffer.
- **Top-layer Data Sourcing**: Since visual overlays (Heatmaps, Base Maps) often share the same spatial grid as the terrain, they can be made `pickable: true` and used as the primary source for `onClick` events to retrieve elevation from their own `raw` buffer.
- **Custom Picking Buffer**: Investigate deck.gl's internal picking buffer prioritization to ensure 3D meshes remain interactive when draped with 2D textures.

---

## Performance Notes

1.  **Network**: No additional network requests are made. We use data already fetched for rendering.
2.  **GPU**: The raw data remains on the CPU (RAM). Only the visual `map` is sent to the GPU.
3.  **Memory**: 
    *   Standard 8-bit Tile: ~64 KB per tile.
    *   32-bit Float Tile: ~256 KB per tile.
    This is a negligible increase for modern browser environments.
