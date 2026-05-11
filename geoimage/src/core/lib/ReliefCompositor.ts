import { GeoImageOptions } from '../types';
import { KernelGenerator } from './KernelGenerator';

/**
 * Composes Swiss relief by combining slope and hillshade kernels via LUT.
 * Outputs a single 0-255 relief mask suitable for baking into hypsometry (terrain)
 * or creating transparent glaze overlays (bitmap).
 */
export class ReliefCompositor {
  /**
   * Precompute and cache a 256x256 LUT for Swiss relief compositing.
   * LUT[hillshade][slope] = (hillshade * (1.0 - (slope * weight)))
   * All values normalized to [0,1].
   * Only computed on first use of Swiss relief mode.
   */
  private static _swissReliefLUT: Float32Array | null = null;
  private static _lastWeight: number | null = null;

  static getSwissReliefLUT(weight: number = 0.5): Float32Array {
    // Check if LUT exists AND if the weight matches the previous calculation
    if (this._swissReliefLUT && this._lastWeight === weight) {
      return this._swissReliefLUT;
    }

    const ambient = 0.010; // 1% minimum brightness to prevent pitch black northwest slopes

    const lut = new Float32Array(256 * 256); // 65536 values
    
    for (let h = 0; h < 256; h++) {
      const hillshade = h / 255;
      for (let s = 0; s < 256; s++) {
        const slope = s / 255;

        // 1. Calculate the 'Swiss Contrast'
        const contrast = 1.0 - (slope * weight);
        
        // Swiss Formula: (Hillshade) * (1.0 - (Slope * Weight))
        // This results in 0.0 to 1.0 multiplier
        lut[(h << 8) | s] = Math.max(ambient, hillshade * contrast);
      }
    }

    this._swissReliefLUT = lut;
    this._lastWeight = weight;
    return lut;
  }

  /**
   * Compute Swiss relief compositing: slope + hillshade → 0-255 relief mask.
   *
   * @param elevation - Padded elevation raster (258×258 for kernel input)
   * @param options - GeoImageOptions (must include zFactor, noDataValue, swissSlopeWeight)
   * @param cellSize - Grid cell size in meters
   * @param width - Output width (typically 256)
   * @param height - Output height (typically 256)
   * @returns Uint8ClampedArray of 0-255 relief values
   */
  static composeSwissRelief(
    elevation: Float32Array,
    options: GeoImageOptions,
    cellSize: number,
    width: number,
    height: number,
  ): Uint8ClampedArray {
    const weight = options.swissSlopeWeight ?? 0.5;

    // 1. Compute slope and hillshade kernels
    const rawSlope = KernelGenerator.calculateSlope(elevation, cellSize, options.zFactor ?? 1, options.noDataValue);
    const rawHillshade = KernelGenerator.calculateMultiHillshade(elevation, cellSize, options.zFactor ?? 1, options.noDataValue);

    // 2. Fetch pre-computed LUT
    const lut = this.getSwissReliefLUT(weight);

    // 3. Compose relief mask: quantize slope/hillshade, apply LUT
    // reliefMask = 0 is reserved as noData sentinel → fully transparent in glaze output
    const reliefMask = new Uint8ClampedArray(width * height);
    
    // Hoist division out of loop: multiplication is faster than division
    const SLOPE_SCALE = 255 / 90; // ~2.833...

    for (let i = 0; i < width * height; i++) {
      // noData pixels: slope is NaN (set by KernelGenerator when z5 === noDataValue)
      if (isNaN(rawSlope[i])) {
        reliefMask[i] = 0; // sentinel: transparent in glaze
        continue;
      }

      // Quantize Slope: Normalize 0-90° to 0-255 integer (avoid division in loop)
      const sIdx = Math.max(0, Math.min(255, (rawSlope[i] * SLOPE_SCALE) | 0));

      // Quantize Hillshade: Ensure 0-255 integer
      const hIdx = Math.max(0, Math.min(255, rawHillshade[i])) | 0;

      // LUT Lookup: Result is 0.0 - 1.0 (float)
      // Clamp to 1 to ensure output stays in 1-255 (0 is reserved for noData)
      reliefMask[i] = Math.max(1, (lut[(hIdx << 8) | sIdx] * 255) | 0);
    }

    return reliefMask;
  }
}
