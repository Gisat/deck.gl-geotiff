# 2026-04-17-swiss-relief-enhancements.md

## Overview
Post-implementation refinements to Swiss relief shading based on Imhof cartographic principles and performance optimization opportunities.

---

## 1. Light Altitude Configuration (Imhof-style)

### Current Implementation
- NW (Primary): 45° altitude, weight 0.60
- SW (Fill): 35° altitude, weight 0.25
- N (Fill): 35° altitude, weight 0.15
- Result: Balanced, subtle appearance

### Proposed Imhof Dramatic Mode
- NW (Primary): 30° altitude, weight 0.60 (lower sun = longer, more descriptive shadows)
- Fills (SW + N): 60° altitude, weight 0.40 combined (higher sky light = less inky shadows)
- Result: More rugged, authentic Swiss cartographic look

### Implementation Options

**Option A: Configurable Altitude Parameters**
Add new options to `GeoImageOptions`:
```typescript
hillshadeAltitudeMain?: number;      // Default 45, allow 30-60 range
hillshadeAltitudeFill?: number;      // Default 35, allow 40-70 range
```

Benefits:
- User-controlled appearance
- Supports both subtle and dramatic styles
- No code changes to defaults needed

**Option B: Add Preset Modes**
```typescript
swissReliefStyle?: 'subtle' | 'dramatic' | 'custom';
// subtle: current (45°/35°)
// dramatic: Imhof-style (30°/60°)
// custom: user-provided altitudes
```

**Option C: Update Defaults to Dramatic**
Change line 182-184 in `KernelGenerator.ts` to use 30°/60° as defaults.

### Recommendation
Implement **Option A** (configurable) as a future enhancement. Current implementation works well; dramatic style is optional for users who prefer Imhof aesthetics.

---

## 2. Four-Directional Light Sources

### Current State
3 sources: NW (315°), SW (225°), N (0°)

### Proposed Enhancement
Add 4th cardinal/ordinal source (NE at 45°):
```typescript
const lights = [
  { az: 315, alt: 30, weight: 0.25 }, // NW
  { az: 45,  alt: 30, weight: 0.25 }, // NE
  { az: 225, alt: 60, weight: 0.25 }, // SW (Fill)
  { az: 0,   alt: 60, weight: 0.25 }  // N (Fill)
];
```

Benefits:
- Eliminates directional bias (4-fold symmetry)
- Better relief perception in all aspects
- Matches standard cartographic practice

### Implementation Notes
- Update `calculateMultiHillshade()` to loop over 4 lights
- Update PR description to state "4-directional light sources"
- Minimal performance impact (one additional light calculation per pixel)

### Recommendation
Defer to future release (post-v1.0) unless 3-light approach shows directional artifacts.

---

## 3. GPU-based Relief Calculation

### Current Approach (CPU)
- All kernel operations in JavaScript
- Per-tile computation at 256×256 resolution
- Hoisted divisions and LUT caching for optimization
- Limitations: Single-threaded, scales poorly with larger tiles/zoom levels

### Proposed GPU Path

#### Architecture
1. **Vertex Shader**: Pass elevation + neighbors to fragment shader
2. **Fragment Shader**: 
   - Compute slope & aspect (via gradients)
   - Apply 3/4 light sources
   - Blend with hypsometric color
   - Output final RGBA

#### Benefits
- Parallel computation across all pixels
- 10–50× faster on modern GPUs
- Scales to higher resolutions (512×512, 1024×1024)
- Enables real-time parameter tuning in UI

#### Challenges
- Adds shader complexity (GLSL code)
- Requires deck.gl/luma.gl integration
- Tile boundary padding must be handled in shader
- Browser compatibility (WebGL 1 vs 2)

#### Implementation Strategy
1. **Phase 1 (Short-term)**: Keep CPU path, add GPU toggle (beta)
2. **Phase 2 (Medium-term)**: Profile & optimize shader; fallback to CPU if needed
3. **Phase 3 (Long-term)**: Make GPU default with CPU fallback

#### Files Affected
- New: `geoimage/src/shaders/swissRelief.glsl`
- Modify: `BitmapGenerator.ts` (detect GPU support, choose path)
- Modify: `TerrainGenerator.ts` (pass raw rasters to shader)

### Recommendation
Add to **future roadmap** (v2.0+). Current CPU implementation is sufficient for production use at standard tile sizes (256×256). GPU path valuable only if:
- Performance benchmarks show bottleneck (unlikely)
- Higher-res tiles (512+) become standard
- Real-time UI parameter tuning needed

---

## 4. Book Reference & Standards

**Source**: Imhof cartographic relief shading principles (pages 378–380)
- Validates current multi-light approach
- Suggests altitude tuning (30°/60° for dramatic style)
- Confirms per-pixel slope/aspect calculation is correct
- Vertical exaggeration (zFactor) is key user control

---

## 5. Summary of Future Enhancements

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Configurable altitude parameters | Low | Medium (aesthetic flexibility) | Medium |
| 4-directional lights | Low | Medium (remove directional bias) | Low |
| GPU-based computation | High | Low (current CPU is fast enough) | Low |

All can be implemented without breaking current API.
