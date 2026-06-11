# Hillshade / Slope Dynamic Switching — Update Triggers Fix

**Date:** 2026-06-11  
**Status:** Planned

---

## Problem

When `terrainOptions.useHillshade`, `terrainOptions.useSlope`, or `terrainOptions.useSwissRelief` change at runtime (e.g. user toggles hillshade mode), the TileLayer does not refetch tiles. Stale tiles from the previous mode remain on screen.

Two root causes in `geoimage/src/layers/CogTerrainLayer.ts`:

1. **`updateTriggers.getTileData` is incomplete** — it does not include `useHillshade`, `useSlope`, or `useSwissRelief`. The TileLayer uses `updateTriggers` to decide when to call `getTileData` again. Without these keys, a hillshade toggle is invisible to the TileLayer.

2. **`updateState()` has no handler for kernel option changes** — it handles `useChannel` and `skipTexture` changes (sync to `terrainCogTiles.options` + cache clear), but not `useHillshade`, `useSlope`, `useSwissRelief`, `zFactor`, or `hillshadeAzimuth`/`hillshadeAltitude`. So the tile result cache is not invalidated, and `terrainCogTiles.options` stays out of sync.

---

## Scope

**File:** `geoimage/src/layers/CogTerrainLayer.ts` only — no other files need changes.  
**Methods:** `updateState()` and `renderLayers()` (the `updateTriggers` block inside it).

---

## Implementation

### Step 1 — Add kernel options to `updateTriggers.getTileData` in `renderLayers()`

Find the `updateTriggers` block inside the `TileLayer` props in `renderLayers()`:

```typescript
updateTriggers: {
  getTileData: {
    elevationData: urlTemplateToUpdateTrigger(elevationData),
    meshMaxError,
    elevationDecoder,
    terrainCogTiles: this.state.terrainCogTiles,
    skipTexture: !!(this.props.wireframe || this.props.operation === 'terrain' || this.props.disableTexture),
    useChannel: this.props.terrainOptions?.useChannel,
  },
```

Replace with (add the four new keys):

```typescript
updateTriggers: {
  getTileData: {
    elevationData: urlTemplateToUpdateTrigger(elevationData),
    meshMaxError,
    elevationDecoder,
    terrainCogTiles: this.state.terrainCogTiles,
    skipTexture: !!(this.props.wireframe || this.props.operation === 'terrain' || this.props.disableTexture),
    useChannel: this.props.terrainOptions?.useChannel,
    useHillshade: this.props.terrainOptions?.useHillshade,
    useSlope: this.props.terrainOptions?.useSlope,
    useSwissRelief: this.props.terrainOptions?.useSwissRelief,
    hillshadeAzimuth: this.props.terrainOptions?.hillshadeAzimuth,
    hillshadeAltitude: this.props.terrainOptions?.hillshadeAltitude,
    zFactor: this.props.terrainOptions?.zFactor,
  },
```

### Step 2 — Add kernel option change handler in `updateState()`

Find this existing block in `updateState()`:

```typescript
// Update the useChannel option for terrainCogTiles when terrainOptions.useChannel changes.
if (props?.terrainOptions?.useChannel !== oldProps.terrainOptions?.useChannel && this.state.terrainCogTiles) {
  this.state.terrainCogTiles.options.useChannel = props.terrainOptions.useChannel;
  this.state.terrainCogTiles.options.useChannelIndex = null; // Clear derived channel index
  this.state.terrainCogTiles.clearTileResultCache(); // Invalidate cached tiles from previous channel
}
```

Add a new block immediately after it:

```typescript
// Update kernel visualization options when hillshade/slope/relief settings change.
// These affect tile texture generation — the cache must be cleared and options synced
// so the next getTileData call uses the updated kernel settings.
const kernelOptionsChanged =
  props?.terrainOptions?.useHillshade !== oldProps.terrainOptions?.useHillshade ||
  props?.terrainOptions?.useSlope !== oldProps.terrainOptions?.useSlope ||
  props?.terrainOptions?.useSwissRelief !== oldProps.terrainOptions?.useSwissRelief ||
  props?.terrainOptions?.hillshadeAzimuth !== oldProps.terrainOptions?.hillshadeAzimuth ||
  props?.terrainOptions?.hillshadeAltitude !== oldProps.terrainOptions?.hillshadeAltitude ||
  props?.terrainOptions?.zFactor !== oldProps.terrainOptions?.zFactor;

if (kernelOptionsChanged && this.state.terrainCogTiles) {
  // Sync updated options into the shared CogTiles instance
  this.state.terrainCogTiles.options.useHillshade = props.terrainOptions?.useHillshade;
  this.state.terrainCogTiles.options.useSlope = props.terrainOptions?.useSlope;
  this.state.terrainCogTiles.options.useSwissRelief = props.terrainOptions?.useSwissRelief;
  this.state.terrainCogTiles.options.hillshadeAzimuth = props.terrainOptions?.hillshadeAzimuth;
  this.state.terrainCogTiles.options.hillshadeAltitude = props.terrainOptions?.hillshadeAltitude;
  this.state.terrainCogTiles.options.zFactor = props.terrainOptions?.zFactor;
  // Invalidate cached tiles — kernel output is baked into the texture
  this.state.terrainCogTiles.clearTileResultCache();
}
```

---

## Notes

- `overviewLoaded` does **not** need to reset on kernel option changes. The gate is only relevant for the initial load; after that it is permanently `true` and re-gating is not needed for mode switches.
- The `updateTriggers.renderSubLayers` block already includes the full `terrainOptions` object reference, so `renderSubLayers` re-runs automatically when `terrainOptions` changes. No change needed there.
- If `zFactor`, `hillshadeAzimuth`, or `hillshadeAltitude` change, the tile result cache must be cleared because the kernel output (hillshade/slope texture) is different per parameter value. The cache key in `CogTiles` does not include these parameters.

---

## Testing

1. Load terrain with hillshade enabled → tiles render with hillshade texture ✅
2. Toggle `useHillshade: false` at runtime → tiles refetch, show plain mesh ✅
3. Toggle `useHillshade: true` again → tiles refetch, show hillshade texture ✅
4. Switch from `useHillshade` to `useSlope` → tiles refetch with slope texture ✅
5. Change `hillshadeAzimuth` (e.g. sun direction) → tiles refetch with updated lighting ✅
6. Change `zFactor` → tiles refetch with updated slope exaggeration ✅
7. No regression: changing `useChannel` still triggers cache clear and refetch ✅
