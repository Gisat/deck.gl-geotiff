# Float LUT Optimization for BitmapGenerator

**GitHub Issue:** #130  
**Branch:** `feature/float-lut-optimization` (create from `dev`)

## Problem

In `BitmapGenerator.getColorValue()`, the `useHeatMap` branch calls `colorScale(val).rgb()` (chroma.js) once per pixel in the standard loop. For a 256×256 tile this is **65,536 chroma calls per tile** — each involves color-space math and object allocation.

The existing 8-bit LUT (lines 207–258) avoids this for `Uint8Array` / `Uint8ClampedArray` by pre-computing 256 RGBA entries. But **`Float32Array`** (kernel outputs: slope 0–90°, hillshade 0–255; float elevation heatmaps) and **`Int16Array` / `Uint16Array`** (16-bit DEMs) fall through to the slow standard loop.

## Proposed Solution

Add a second LUT branch for float/16-bit data using **N = 1000 fixed buckets** that cover `colorScaleValueRange` linearly. Only `useHeatMap` benefits (the other modes — categorical, classes, single color — don't call chroma per pixel).

### Why N = 1000

- Screen output is `Uint8ClampedArray` (0–255 per channel). Any two buckets that differ by less than `1/255` of the gradient are indistinguishable on screen.
- For slope (0–90°): each bucket = 0.09° — imperceptible.
- For hillshade (0–255): each bucket = 0.255 units — output is already integer, so effectively lossless.
- 1000 chroma calls per tile load is trivial vs 65,536.
- No `lutSize` option — 1000 is the right constant for all practical cases.

## Implementation

### File: `geoimage/src/core/lib/BitmapGenerator.ts`

**One change only.** Insert a new branch between the existing 8-bit LUT block (ends line ~259) and the standard loop (starts line ~261).

#### Exact insertion point

```typescript
    }  // ← end of is8Bit block (line 259)

    // ↓ INSERT HERE — Float / 16-bit LUT for useHeatMap

    // Standard Loop (Float or non-optimized)  ← line 261
```

#### Code to insert

```typescript
    // LOOKUP TABLE OPTIMIZATION (for float and 16-bit heatmap data)
    // useHeatMap is the only mode that calls chroma per pixel for non-8-bit data.
    // Pre-compute N=1000 RGBA buckets covering colorScaleValueRange, then use a
    // normalise+clamp index lookup instead of chroma per pixel.
    // NaN pixels (e.g. noData from KernelGenerator) map to optNullColor via the isNaN guard.
    const isFloatOrWide =
      dataArray instanceof Float32Array ||
      dataArray instanceof Float64Array ||
      dataArray instanceof Int16Array ||
      dataArray instanceof Uint16Array ||
      dataArray instanceof Int32Array ||
      dataArray instanceof Uint32Array;

    if (isFloatOrWide && optUseHeatMap && !optUseDataForOpacity) {
      const N = 1000;
      const lut = new Uint8ClampedArray(N * 4);
      const rangeSpan = rangeMax - rangeMin || 1; // guard against zero-span

      for (let i = 0; i < N; i++) {
        const domainVal = rangeMin + (i / (N - 1)) * rangeSpan;
        const rgb = (colorScale(domainVal) as any).rgb();
        lut[i * 4]     = rgb[0];
        lut[i * 4 + 1] = rgb[1];
        lut[i * 4 + 2] = rgb[2];
        lut[i * 4 + 3] = optAlpha;
      }

      // Fast Apply Loop
      let outIdx = 0;
      const numPixels = arrayLength / 4;
      for (let i = 0; i < numPixels; i++) {
        const val = dataArray[pixel];

        let r = optNullColor[0], g = optNullColor[1], b = optNullColor[2], a = optNullColor[3];

        if (!Number.isNaN(val) && (optNoData === undefined || val !== optNoData)) {
          if ((optClipLow != null && val <= optClipLow) || (optClipHigh != null && val >= optClipHigh)) {
            [r, g, b, a] = optClippedColor as number[];
          } else {
            const t = (val - rangeMin) / rangeSpan;
            const idx = Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))));
            const lutIdx = idx * 4;
            r = lut[lutIdx];
            g = lut[lutIdx + 1];
            b = lut[lutIdx + 2];
            a = lut[lutIdx + 3];
          }
        }

        colorsArray[outIdx++] = r;
        colorsArray[outIdx++] = g;
        colorsArray[outIdx++] = b;
        colorsArray[outIdx++] = a;
        pixel += samplesPerPixel;
      }
      return colorsArray;
    }

    // Standard Loop (Float or non-optimized — handles remaining cases:
    // useColorsBasedOnValues, useColorClasses, useSingleColor, useDataForOpacity)
```

### What is NOT changed

- The 8-bit LUT block — untouched.
- The standard loop — kept as fallback for: `useColorsBasedOnValues`, `useColorClasses`, `useSingleColor`, `useDataForOpacity`. These don't call chroma per pixel anyway (except `useDataForOpacity`, which needs the raw value for opacity — correctly excluded).
- `KernelGenerator`, `TerrainGenerator`, `GeoImage` — no changes needed.
- Types — no new options.

## Validation

1. **Build**: `yarn build` — no errors
2. **Visual check in example app**:
   - `CogTerrainKernelExample`: slope and hillshade should look identical to before
   - `CogTerrainLayerExample`: elevation heatmap should look identical
   - `CogBitmapLayer` with float data (if available) — should look identical
3. **Edge cases to verify**:
   - `noDataValue: 0` → those pixels transparent (NaN guard + noData guard)
   - `clipLow` / `clipHigh` → clipped pixels still use `clippedColor`
   - `colorScaleValueRange` with equal min/max (zero-span guard: `rangeSpan = rangeMax - rangeMin || 1`)

## Docs to update

- `geoimage/docs/generators.md` — update BitmapGenerator "Performance Optimizations" bullet to mention Float32/16-bit LUT
- `geoimage/docs/api-reference.md` — memory trade-off note (Float32 tile cost stays same; picking cost same)

## Commit message

```
perf(bitmap): add float/16-bit LUT for useHeatMap colorization

Pre-compute N=1000 RGBA buckets over colorScaleValueRange instead of
calling chroma.js per pixel. Reduces chroma calls from 65,536 to 1,000
per 256×256 tile for Float32 and Int16/Uint16 data.

NaN (noData from KernelGenerator) and clipLow/clipHigh handling
preserved. Standard loop kept as fallback for categorical modes and
useDataForOpacity.

Closes #130

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
