# 2026-03-28-swiss-shaded-relief-plan.md

## 1. Problem Statement
Enhance the terrain visualization (`CogTerrainLayer`) with a Swiss-style shaded relief effect, combining hypsometric color, hillshade, and slope into a single texture for improved relief perception. The effect must be CPU-based, efficient, and utilize centralized color management.

---

## 2. Mathematical Foundation

### 2.1 Use Case 1: The "Bake-in" (Solid Map)
Used when hypsometric colors and shading are calculated together in a single pass.
$$\text{Final Pixel} = (\text{HypsoColor} \times \text{Hillshade}) \times (1.0 - (\text{Slope} \times \text{Weight}))$$

### 2.2 Use Case 2: The "Universal Glaze" (Variable Alpha)
Used when overlaying shading on top of external imagery (Satellite/OSM). To prevent "muddying" flat terrain, neutral gray (128) is mapped to transparency. Alpha is scaled by `maxGlazeAlpha` (0-255 ceiling):
$$\text{Alpha} = \text{clamp}(\text{pow}(|\text{ReliefValue} - 128| / 128, \text{bias}) \times 255 \times \text{maxGlazeAlpha} / 255, 0, 255)$$
where bias = 0.6 for shadows, 0.8 for highlights.

---

## 3. Use Case Definitions

### Use Case 1: The "Bake-in" (Single Layer)
* **Layer**: `CogTerrainLayer`
* **Operation**: `terrain+draw`
* **Logic**: `BitmapGenerator` calculates the Swiss mask and **multiplies** it by the Hypsometric color CPU-side.
* **Benefit**: Highest visual fidelity; zero "flicker" or Z-fighting between shadows and colors.

### Use Case 2: The "Universal Glaze" (Layer Sandwich)
* **Structure**: 
    1. **Bottom**: `CogTerrainLayer` (Geometry only, `operation: 'terrain'`).
    2. **Middle**: Any `TileLayer` (Satellite, OSM, Vector).
    3. **Top**: `CogBitmapLayer` (The Glaze).
* **Logic**: `{ useReliefGlaze: true, maxGlazeAlpha: UserSetting (0-255) }`.
* **Benefit**: Complete flexibility to add 3D Swiss shading to any existing 2D map imagery.

---

## 4. Implementation Roadmap

### Phase 1: Core Infrastructure
* **1.1** Add `useSwissRelief`, `useReliefGlaze` modes and `maxGlazeAlpha` parameter to `GeoImageOptions`.
* **1.2** Implement a **2D Lookup Table (LUT)** ($256 \times 256$) to optimize the Swiss formula.
* **1.3** Integrate the `hypsoColor` palette as a standard registry within `GeoImage` options.
* **1.4** Update `hasVisualizationOptions` to include `useSwissRelief` and `useReliefGlaze` as valid execution triggers.

### Phase 2: Prototype Generation (Draft Mode)
* **1.5 Implement the Pixel Loop**:
    * **Step A**: Basic multiplication (`Color * Hillshade`) for initial debugging.
    * **Step B**: Implement the "Sandwich" logic. If `useReliefGlaze` is true, populate `Uint8ClampedArray` with `RGB = ReliefValue` (black/white glaze) and `A = VariableAlpha` scaled by `maxGlazeAlpha`.
* **1.6 Data Normalization**: Map Elevation to RGB and normalize Hillshade/Slope results to $[0, 1]$.
* **1.7 Single-Raster Support**: Modify `generate()` to support Swiss relief even when only a single elevation raster is provided.

### Phase 3: Advanced Cartographic Refinement
* **1.8** Implement **Luminance-Preserving Multiplication** (e.g., Soft Light/Overlay) to prevent "muddy" valleys.
* **1.9** Implement **Slope-Based Saturation** boost to improve depth in rugged terrain.
* **1.10** Integrate a 3x3 Gaussian smoothing step before kernel operations to generalize features.

### Phase 4: Integration & Documentation
* **1.11 Example App**: Expose the `useSwissRelief` and `useReliefGlaze` toggles with UI controls.
* **1.12 Documentation**: Document LUT performance, vertical exaggeration (`zFactor`), `maxGlazeAlpha` intensity scaling (0-255 8-bit ceiling), and "Sandwich" architecture in the README.

---

## 5. Technical Notes
* **Performance**: Keep all computation CPU-side; use Typed Arrays to avoid memory allocations.
* **Kernel Padding**: Use 1-pixel edge padding to prevent artifacts at tile boundaries.
* **Compatibility**: Ensure backward compatibility for existing `image` and `terrain` modes.