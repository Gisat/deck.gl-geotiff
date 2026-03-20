# Kernel Calculation Implementation Checklist (Slope & Hillshade)

This document provides a step-by-step checklist for implementing kernel-based raster calculations (Slope, Hillshade) directly within the `CogTerrainLayer`.

## Phase 1: Foundation & Data Types

- [ ] 1.1. Update `GeoImageOptions` in `geoimage/src/core/types.ts`:
   - Add `useSlope?: boolean`
   - Add `useHillshade?: boolean`
   - Add `hillshadeAzimuth?: number` (default: 315)
   - Add `hillshadeAltitude?: number` (default: 45)
   - Add `zFactor?: number` (default: 1)
   - **Note**: Existing styling options (`colorScale`, `colorScaleValueRange`, `useHeatMap`, `useAutoRange`) will be reused to style the *generated texture* (whether it represents Elevation, Slope, or Hillshade).

- [ ] 1.2. Update `DefaultGeoImageOptions` in `geoimage/src/core/types.ts`:
   - Set default values for `hillshadeAzimuth` (315), `hillshadeAltitude` (45), and `zFactor` (1).
   - Set default `useSlope` and `useHillshade` to `false`.

## Phase 2: Kernel Calculation Logic

- [ ] 2.1. Create `geoimage/src/core/lib/KernelGenerator.ts`:
   - Create a new class or module for 3x3 kernel operations.

- [ ] 2.2. Implement `calculateSlope` in `KernelGenerator`:
   - Use Horn's method or similar to calculate slope from a 3x3 neighborhood.
   - Ensure handling of edge cases (borders).
   - **Output**: Float32Array of slope values (0-90 degrees).

- [ ] 2.3. Implement `calculateHillshade` in `KernelGenerator`:
   - Calculate hillshade using slope, aspect (derived from gradients), azimuth, and altitude.
   - **Output**: Uint8Array or Float32Array (0-255 grayscale).

## Phase 3: Integration in Terrain Generation

- [ ] 3.1. Update `TerrainGenerator.generate` in `geoimage/src/core/lib/TerrainGenerator.ts`:
   - Add logic to determine the **visualization mode**:
     - If `useSlope` is true -> Target Data is Slope.
     - If `useHillshade` is true -> Target Data is Hillshade.
     - Otherwise -> Target Data is Elevation (default).

- [ ] 3.2. Refactor `TerrainGenerator.generate`:
   - **Step A (Mesh)**: Always use the raw Elevation data to generate the 3D mesh (Martini/Delatin).
   - **Step B (Texture)**:
     - If `useSlope`: Call `KernelGenerator.calculateSlope`.
     - If `useHillshade`: Call `KernelGenerator.calculateHillshade`.
     - If default (Elevation): Use the raw Elevation data.
     - **Step C (Styling)**: Call `BitmapGenerator.generate` passing the **Target Data** (from Step B) and the `options` (containing `colorScale`, `colorScaleValueRange`, etc.).
   - Update the return object to include this `texture` (e.g., `loaderData.texture` or a separate property).

- [ ] 3.3. Update `GeoImage.getMap` in `geoimage/src/core/GeoImage.ts`:
   - Ensure the updated return structure from `TerrainGenerator` is correctly propagated.

## Phase 4: CogTerrainLayer Updates

- [ ] 4.1. Update `CogTerrainLayer.ts`:
   - Modify `getTiledTerrainData` to handle the new return type from `this.state.terrainCogTiles.getTile`.
   - Extract the generated `texture` from the result.

- [ ] 4.2. Update `CogTerrainLayer.renderSubLayers`:
   - Enable the `texture` prop on `SimpleMeshLayer`.
   - Pass the extracted `texture` to the `SimpleMeshLayer`.
   - **Crucial**: Ensure `color` prop of `SimpleMeshLayer` is white (or neutral) so it doesn't tint the texture.

- [ ] 4.3. Update `CogTerrainLayer` props:
   - Ensure `terrainOptions` correctly passes all styling flags (`colorScale`, etc.) down to the generator.

## Phase 5: Validation & Examples

- [ ] 5.1. Create a unit test for `KernelGenerator`:
   - Test with a known elevation grid (e.g., flat plane, 45-degree ramp) to verify slope calculations.

- [ ] 5.2. Create/Update Example:
   - Create or update `CogTerrainLayerExample.tsx`.
   - Demonstrate **Elevation Coloring**: `terrainOptions: { useHeatMap: true, colorScale: 'spectral' }`.
   - Demonstrate **Slope Coloring**: `terrainOptions: { useSlope: true, colorScale: 'RdYlGn', colorScaleValueRange: [0, 90] }`.
   - Demonstrate **Hillshade**: `terrainOptions: { useHillshade: true, colorScale: ['black', 'white'] }`.
