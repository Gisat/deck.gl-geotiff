# Terrain Texture Wiring + Kernel Slope & Hillshade

**Date:** 2026-03-20

This document combines two sequential implementation plans:
- **Part 1** (prerequisite): Wire terrain texture generation from elevation data into `CogTerrainLayer`.
- **Part 2**: Add kernel-based raster calculations (Slope, Hillshade) on top of the wired texture pipeline.

---

# Part 1: Terrain Texture Wiring (Prerequisite)

## Problem

To color terrain in `CogTerrainLayer`, users currently must create a separate `CogBitmapLayer` pointing to the same COG URL. This is redundant — two layers fetch the same data twice and requires the user to manage two layers in sync.

`CogTerrainLayer` already has a `texture` prop, but it only accepts an external image URL, not an internally-generated bitmap from elevation data.

## Approach

Extend the terrain tile pipeline so that, when visualization options are present in `terrainOptions` (e.g. `useHeatMap`, `colorScale`, `colorScaleValueRange`), the layer automatically generates a texture `ImageBitmap` from the same elevation raster data using `BitmapGenerator.generate()`. The resulting texture is attached to `TileResult` and passed directly to `SimpleMeshLayer` in `renderSubLayers`.

This is the **prerequisite** to Part 2 — once texture generation is wired up, the kernel work will simply insert a transformation step (elevation → slope/hillshade array) before `BitmapGenerator` is called.

## Visualization Trigger

Texture generation is activated automatically when any of these options are set in `terrainOptions`:
- `useHeatMap: true`
- `colorScale` is defined
- `useSingleColor: true`
- `useColorsBasedOnValues: true`
- `useColorClasses: true`

If none are set, no texture is generated and terrain renders with the default flat `color` prop (existing behavior).

## Option Grouping: Mesh vs. Texture Options

`terrainOptions` is a single `GeoImageOptions` object. Options fall into three logical groups:

| Group | Fields | Used by |
|-------|--------|---------|
| **Shared / data** | `type`, `format`, `useChannel`, `useChannelIndex`, `noDataValue`, `multiplier`, `numOfChannels`, `planarConfig` | Both mesh and texture |
| **Mesh-only** | `tesselator`, `terrainSkirtHeight`, `terrainMinValue`, `terrainColor` | TerrainGenerator mesh path only |
| **Texture / visualization** | `useHeatMap`, `colorScale`, `colorScaleValueRange`, `useSingleColor`, `color`, `alpha`, `useColorsBasedOnValues`, `colorClasses`, `useColorClasses`, `useAutoRange`, `useDataForOpacity`, `clipLow`, `clipHigh`, `nullColor`, `unidentifiedColor`, `clippedColor`, `blurredTexture` | BitmapGenerator texture path only |

To prevent confusion, add **JSDoc `@group` comments** in `types.ts` above each field grouping the options visually. No runtime split is needed — `BitmapGenerator.generate()` ignores mesh-only fields and `TerrainGenerator.generate()` ignores visualization fields.

## Checklist

### P1-1. types.ts — Extend TileResult and Document Option Groups

- [ ] P1-1.1. Add `texture?: ImageBitmap` to the `TileResult` interface in `geoimage/src/core/types.ts`.
- [ ] P1-1.2. Add JSDoc `@group` section comments to `GeoImageOptions` fields in `types.ts`, grouping them into **Shared/Data**, **Mesh generation**, and **Texture/Visualization** so users and future devs know which options apply where.

### P1-2. TerrainGenerator.ts — Generate Texture Alongside Mesh

- [ ] P1-2.1. Make `TerrainGenerator.generate()` async (`Promise<TileResult>`).
- [ ] P1-2.2. Add a private `hasVisualizationOptions(options: GeoImageOptions): boolean` helper that returns `true` when any visualization trigger is set.
- [ ] P1-2.3. Add a private `cropRaster(rasters, srcWidth, srcHeight, dstWidth, dstHeight)` helper that extracts the inner `dstWidth × dstHeight` pixels from a `srcWidth × srcHeight` raster array (dropping the last rows/columns). Used to strip the 257→256 border stitching pixels before passing to `BitmapGenerator`.
- [ ] P1-2.4. After the mesh is built (existing logic, unchanged), if `hasVisualizationOptions(options)` is true:
  - Build a **cropped input** from `input` by calling `cropRaster` to reduce from `257×257` → `256×256`.
  - Call `await BitmapGenerator.generate(croppedInput, { ...options, type: 'image' })`.
  - Attach the returned `ImageBitmap` as `tileResult.texture`.

**Why 257→256?** Terrain tiles are fetched at `257×257` pixels for seamless mesh stitching (last row/col are shared with adjacent tiles). The texture must cover exactly the tile's own `256×256` extent — the extra border row and column must be dropped before bitmap generation.

### P1-3. GeoImage.ts — Add await to TerrainGenerator call

- [ ] P1-3.1. `getHeightmap()` in `GeoImage.ts` is already `async`. Add `await` to the `TerrainGenerator.generate()` call (currently called without `await` since `generate` is currently sync).
- [ ] P1-3.2. Verify the `texture` field propagates through `getMap()` to the caller without being dropped.

### P1-4. CogTerrainLayer.ts — Wire Up Texture in renderSubLayers

- [ ] P1-4.1. In `renderSubLayers`, `const [meshResult] = data` already destructures `tile.content` into the `TileResult`. Read `meshResult?.texture` (the `ImageBitmap` added to `TileResult` in P1-1.1).
- [ ] P1-4.2. Pass the texture to `SimpleMeshLayer` via its `texture` prop (uncomment and update the existing commented-out line).
- [ ] P1-4.3. When `texture` is present, override `color` to `[255, 255, 255]` so it does not tint the texture.

### P1-5. Example — Simplify CogTerrainLayerExample.tsx

- [ ] P1-5.1. Remove the separate `CogBitmapLayer` (`heatmap`) from the example.
- [ ] P1-5.2. Move the visualization options (`useHeatMap`, `colorScale`, `colorScaleValueRange`) into `terrainOptions`.
- [ ] P1-5.3. Verify the result visually matches the previous two-layer approach.

### P1-6. Documentation

- [ ] P1-6.1. **`api-reference.md`**: Add note that visualization options can now be passed in `terrainOptions`; add `texture?: ImageBitmap` to `TileResult` table; update bitmap options preamble to include `CogTerrainLayer`.
- [ ] P1-6.2. **`generators.md`**: Note `generate()` is now async and optionally calls `BitmapGenerator`; add `texture` to `TileResult` description.
- [ ] P1-6.3. **`CHANGELOG.md`**: Add feature entry.

## Key Files (Part 1)

| File | Change |
|------|--------|
| `geoimage/src/core/types.ts` | Add `texture?: ImageBitmap` to `TileResult`; add JSDoc grouping to `GeoImageOptions` |
| `geoimage/src/core/lib/TerrainGenerator.ts` | Make async; add private static `cropRaster` and `hasVisualizationOptions`; call `BitmapGenerator` with cropped 256×256 data |
| `geoimage/src/core/GeoImage.ts` | Add `await` to `TerrainGenerator.generate()` call in `getHeightmap()` |
| `geoimage/src/layers/CogTerrainLayer.ts` | Use `meshResult?.texture` in `renderSubLayers`; pass to `SimpleMeshLayer` |
| `example/src/examples/CogTerrainLayerExample.tsx` | Remove separate `CogBitmapLayer`, fold options into `terrainOptions` |
| `geoimage/docs/api-reference.md` | Update CogTerrainLayer section; add `texture` to TileResult; update bitmap options preamble |
| `geoimage/docs/generators.md` | Update TerrainGenerator section; add `texture` to TileResult description |
| `geoimage/CHANGELOG.md` | Add feature entry |

## Caching Notes

- The **texture ImageBitmap** (`TileResult.texture`) is cached for free via deck.gl's `TileLayer` tile content caching.
- `cropRaster` creates a temporary `Float32Array` (~256 KB) that is GC'd after `BitmapGenerator` completes.
- `BitmapGenerator.generate()` is only called when `hasVisualizationOptions` is true — zero extra cost otherwise.

---

# Part 2: Kernel Calculation Implementation (Slope & Hillshade)

**Prerequisite:** Part 1 must be completed first. It establishes `TileResult.texture`, the async `TerrainGenerator.generate`, and the `SimpleMeshLayer` texture prop wiring.

## Data-Flow Overview

### Non-kernel terrain texture (prerequisite plan)
```
CogTiles.getTile  →  fetch 257×257 pixels
TerrainGenerator  →  mesh from 257×257 (unchanged)
                  →  cropRaster(257×257 → 256×256)  →  BitmapGenerator  →  texture ImageBitmap
```

### Kernel terrain texture (this plan)
```
CogTiles.getTile  →  fetch 258×258 pixels  (1-pixel border for 3×3 kernel)
TerrainGenerator  →  mesh from rows 1–257, cols 1–257  (257×257, dropping only the top and left padding rows)
                  →  KernelGenerator(all 258×258)  →  256×256 slope/hillshade values
                                                   →  BitmapGenerator  →  texture ImageBitmap
```

### Why 258×258 and why rows 1–257 for the mesh?
A 3×3 neighborhood kernel needs 1 pixel of context **before** and **after** each row/column of the 256×256 output grid. The extra pixel is added to the **top** and **left** of the fetch window (row 0, col 0), so that:

- **KernelGenerator** can compute all 256×256 output values using input rows 0–257 and cols 0–257 (3×3 neighborhood centered on rows 1–256, cols 1–256).
- **Mesh** uses rows **1–257** and cols **1–257** (257×257) — this includes the 256 "true" tile rows/cols plus the extra overlap row/col to the **bottom and right** needed for seamless stitching with adjacent tiles.

```
        col 0        cols 1–256        col 257
row 0   [kernel pad] [kernel pad ...]  [kernel pad]
rows    [kernel pad] [true tile 256x256][mesh stitch col]
1–256
row 257 [kernel pad] [mesh stitch row] [corner]
```

### Option groups in terrainOptions
`GeoImageOptions` fields used in terrain mode fall into three groups:

| Group | Key fields | Used by |
|-------|-----------|---------|
| **Shared / data** | `type`, `format`, `useChannel`, `useChannelIndex`, `noDataValue`, `multiplier`, `numOfChannels`, `planarConfig` | Both mesh and texture paths |
| **Mesh-only** | `tesselator`, `terrainSkirtHeight`, `terrainMinValue`, `terrainColor` | `TerrainGenerator` mesh path only |
| **Texture / visualization** | `useHeatMap`, `colorScale`, `colorScaleValueRange`, `useSingleColor`, `color`, `alpha`, `useColorsBasedOnValues`, `useColorClasses`, `colorClasses`, `useAutoRange`, `useDataForOpacity`, `clipLow`, `clipHigh`, `nullColor`, `unidentifiedColor`, `clippedColor`, `blurredTexture` | `BitmapGenerator` only |
| **Kernel-specific** *(new)* | `useSlope`, `useHillshade`, `hillshadeAzimuth`, `hillshadeAltitude`, `zFactor` | `KernelGenerator` only |



## Phase P2-1: Foundation & Data Types

- [ ] P2-1.1. Update `GeoImageOptions` in `geoimage/src/core/types.ts`:
   - Add `useSlope?: boolean`
   - Add `useHillshade?: boolean`
   - Add `hillshadeAzimuth?: number` (default: 315)
   - Add `hillshadeAltitude?: number` (default: 45)
   - Add `zFactor?: number` (default: 1)
   - **Note**: Existing styling options (`colorScale`, `colorScaleValueRange`, `useHeatMap`, `useAutoRange`) will be reused to style the *generated texture* (whether it represents Elevation, Slope, or Hillshade). See the option-group table above for which options belong to which path.

- [ ] P2-1.2. Update `DefaultGeoImageOptions` in `geoimage/src/core/types.ts`:
   - Set default values for `hillshadeAzimuth` (315), `hillshadeAltitude` (45), and `zFactor` (1).
   - Set default `useSlope` and `useHillshade` to `false`.

- [ ] P2-1.3. Add `rawDerived?: TypedArray | null` to the `TileResult` interface in `geoimage/src/core/types.ts`.
   - Stores the kernel output (slope degrees or hillshade 0–255) alongside `raw` (which always holds elevation).
   - This allows picking handlers to expose **both** the raw terrain elevation and the derived display value simultaneously.
   - `rawDerived` is `null` for non-kernel terrain tiles.
   - **Memory cost**: `rawDerived` is a Float32Array of 256×256 (~256 KB) already produced by the kernel step — retaining it adds zero computation cost and ~256 KB per loaded tile in memory (~5 MB for 20 tiles in cache). This is a reasonable trade-off to support full picking coverage (both elevation and derived value).

## Phase P2-2: Tile Fetch Size

- [ ] P2-2.0. Update `CogTiles.getTile` to fetch **258×258** pixels (instead of 257×257) when kernel options are active (`useSlope || useHillshade`). Keep fetching 257×257 for non-kernel terrain (existing behavior).

## Phase P2-3: Kernel Calculation Logic

- [ ] P2-3.1. Create `geoimage/src/core/lib/KernelGenerator.ts`:
   - Create a new class or module for 3x3 kernel operations.
   - **Input contract**: receives a `Float32Array` of `258×258` elevation values (row-major), plus `width=258`, `height=258`, `cellSize` (meters per pixel), and `zFactor`.
   - **Output**: `Float32Array` of `256×256` computed values.

- [ ] P2-3.2. Implement `calculateSlope` in `KernelGenerator`:
   - Use Horn's method or similar to calculate slope from a 3x3 neighborhood.
   - Edge pixels (rows 0 and 257, cols 0 and 257 of the 258×258 input) are used only as neighbors; they do not appear in the output.
   - **Output**: Float32Array of `256×256` slope values (0–90 degrees).

- [ ] P2-3.3. Implement `calculateHillshade` in `KernelGenerator`:
   - Calculate hillshade using slope, aspect (derived from gradients), azimuth, and altitude.
   - Same 258→256 boundary contract as slope.
   - **Output**: Float32Array of `256×256` values (0–255 grayscale).

## Phase P2-4: Integration in Terrain Generation

- [ ] P2-4.1. Update `TerrainGenerator.generate` in `geoimage/src/core/lib/TerrainGenerator.ts`:
   - Add logic to determine the **visualization mode**:
     - If `useSlope` is true → Target Data is Slope.
     - If `useHillshade` is true → Target Data is Hillshade.
     - Otherwise → Target Data is Elevation (default, cropped 256×256).

- [ ] P2-4.2. Refactor `TerrainGenerator.generate` for kernel path:
   - **Step A (Mesh)**: Extract rows 1–257, cols 1–257 from the 258×258 raster (257×257 sub-grid) and generate the 3D mesh (Martini/Delatin) — same as current non-kernel mesh generation.
   - **Step B (Kernel output & caching in `rawDerived`)**: 
     - If `useSlope`: Call `KernelGenerator.calculateSlope(fullRaster258, cellSize, zFactor)` → `kernelOutput` Float32Array 256×256.
     - If `useHillshade`: Call `KernelGenerator.calculateHillshade(fullRaster258, azimuth, altitude, cellSize, zFactor)` → `kernelOutput` Float32Array 256×256.
     - Store `kernelOutput` as `tileResult.rawDerived` — a new optional field on `TileResult` (added in P2-1.3). `tileResult.raw` continues to hold raw elevation so picking can expose both the elevation and the derived value simultaneously.
     - The TileLayer caches the `TileResult`, so both `raw` and `rawDerived` are computed and stored once per tile load — no extra caching mechanism needed.
     - If default (Elevation): Use the cropped 256×256 elevation data (existing `cropRaster` helper from Part 1); `rawDerived` is `null`.
   - **Step C (Styling)**: Call `BitmapGenerator.generate({ width: 256, height: 256, rasters: [targetData] }, { ...options, type: 'image' })` to produce the `texture` ImageBitmap.

- [ ] P2-4.3. Update `GeoImage.getMap` in `geoimage/src/core/GeoImage.ts`:
   - Ensure the updated return structure from `TerrainGenerator` is correctly propagated (already handled by Part 1; verify no changes needed).

## Phase P2-5: CogTerrainLayer Updates

- [ ] P2-5.1. Verify `CogTerrainLayer.ts` correctly passes kernel options through `terrainOptions` (no change expected; already done by Part 1).

## Phase P2-6: Validation & Examples

- [ ] P2-6.1. Create a unit test for `KernelGenerator`:
   - Test with a known elevation grid (e.g., flat plane, 45-degree ramp) to verify slope calculations.
   - Confirm output dimensions are 256×256 for a 258×258 input.

- [ ] P2-6.2. Create/Update Example:
   - Create or update `CogTerrainLayerExample.tsx`.
   - Demonstrate **Elevation Coloring**: `terrainOptions: { useHeatMap: true, colorScale: 'spectral' }`.
   - Demonstrate **Slope Coloring**: `terrainOptions: { useSlope: true, colorScale: 'RdYlGn', colorScaleValueRange: [0, 90] }`.
   - Demonstrate **Hillshade**: `terrainOptions: { useHillshade: true, colorScale: ['black', 'white'] }`.
