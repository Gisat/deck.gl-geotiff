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
When a `TileLayer` or `BitmapLayer` is draped over a `CogTerrainLayer` (using `TerrainExtension`), the overlay captures all picking events. Terrain picking does not work when any overlay (OSM/XYZ or `CogBitmapLayer` with `clampToTerrain`) is active.

**Status:** Confirmed broken with deck.gl 9.2.9 and still a type-system issue with 9.3.0-alpha.1.

**Fix planned in deck.gl 9.3.0:** PR [#10037](https://github.com/visgl/deck.gl/pull/10037) adds 3D picking support for `TerrainExtension`, which directly addresses this issue. It has been merged into the 9.3.0-alpha.1 release.

### 2. Upgrade tasks for when deck.gl 9.3.0 stable is released

When upgrading from 9.2.9 → 9.3.0:

1. **Upgrade both `example` and `geoimage` devDependencies** — `geoimage` has its own `@deck.gl/core: ^9.2.9` in devDependencies which creates a dual-install conflict in the monorepo. Both must be upgraded together.

2. **Update `PickingInfo` usage in examples** — In 9.3.0-alpha.1, `info.uv`, `info.bitmap`, and `info.tile` no longer exist on the base `PickingInfo` type. They have moved to specialized subtypes. The onClick handlers in all three examples currently use `(info: any)` as a workaround. These should be updated to use the proper typed picking info from the new API.

3. **Verify terrain picking with overlays** — After upgrading, test `CogTerrainLayer` with an OSM overlay and a `CogBitmapLayer` with `clampToTerrain` to confirm PR #10037 resolves the issue.

4. **Update `@luma.gl`** to `9.3.0-alpha.2` and `@loaders.gl/core` to `4.4.0-alpha.16` (or their stable equivalents) alongside the deck.gl upgrade.

---

## Performance Notes

1.  **Network**: No additional network requests are made. We use data already fetched for rendering.
2.  **GPU**: The raw data remains on the CPU (RAM). Only the visual `map` is sent to the GPU.
3.  **Memory**: 
    *   Standard 8-bit Tile: ~64 KB per tile.
    *   32-bit Float Tile: ~256 KB per tile.
    This is a negligible increase for modern browser environments.
