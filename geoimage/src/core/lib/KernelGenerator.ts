/**
 * KernelGenerator — 3×3 neighborhood kernel calculations on elevation rasters.
 *
 * Input contract: a Float32Array of 258×258 elevation values (row-major).
 * Edge pixels (row/col 0 and 257) are used only as kernel neighbors and do
 * not appear in the output.
 * Output: Float32Array of 256×256 computed values.
 */
export class KernelGenerator {
  /**
   * Compute terrain gradients (dzdx, dzdy) using Horn's method.
   * @param z1-z9 - 3×3 neighborhood elevation values (z5 is center)
   * @param cellSizeFactor - Pre-computed 1 / (8 * cellSize)
   * @param geographicConvention - If true, use north-minus-south for dzdy (hillshade). If false, use south-minus-north (slope).
   */
  private static computeGradients(
    z1: number, z2: number, z3: number,
    z4: number, /* z5 not needed */ z6: number,
    z7: number, z8: number, z9: number,
    cellSizeFactor: number,
    geographicConvention: boolean = true
  ): { dzdx: number; dzdy: number } {
    const dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) * cellSizeFactor;
    
    // Geographic convention (hillshade): north minus south (top rows minus bottom rows)
    // Slope convention: south minus north (reversed)
    const dzdy = geographicConvention
      ? ((z1 + 2 * z2 + z3) - (z7 + 2 * z8 + z9)) * cellSizeFactor
      : ((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) * cellSizeFactor;
    
    return { dzdx, dzdy };
  }

  /**
   * Calculates slope (0–90 degrees) for each pixel using Horn's method.
   *
   * @param src         Float32Array of 258×258 elevation values (row-major)
   * @param cellSize    Cell size in meters per pixel
   * @param zFactor     Vertical exaggeration factor (default 1)
   * @param noDataValue Elevation value treated as noData; output is NaN for those pixels
   */
  static calculateSlope(
    src: Float32Array,
    cellSize: number,
    zFactor: number = 1,
    noDataValue?: number,
  ): Float32Array {
    const OUT = 256;
    const IN = 258;
    const out = new Float32Array(OUT * OUT);
    
    // Hoist division out of loop: multiplication is ~2-3x faster than division
    const cellSizeFactor = 1 / (8 * cellSize);
    // Cache constant for radians to degrees conversion
    const RAD_TO_DEG = 180 / Math.PI;

    for (let r = 0; r < OUT; r++) {
      for (let c = 0; c < OUT; c++) {
        // 3×3 neighborhood in the 258×258 input, centered at (r+1, c+1)
        const base = r * IN + c;
        const z5 = src[base + IN + 1]; // center pixel

        if (noDataValue !== undefined && z5 === noDataValue) {
          out[r * OUT + c] = NaN;
          continue;
        }

        const z1 = src[base];               // nw
        const z2 = src[base + 1];           // n
        const z3 = src[base + 2];           // ne
        const z4 = src[base + IN];          // w
        const z6 = src[base + IN + 2];      // e
        const z7 = src[base + 2 * IN];      // sw
        const z8 = src[base + 2 * IN + 1];  // s
        const z9 = src[base + 2 * IN + 2];  // se

        const { dzdx, dzdy } = this.computeGradients(z1, z2, z3, z4, z6, z7, z8, z9, cellSizeFactor, false);

        const slopeRad = Math.atan(zFactor * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        out[r * OUT + c] = slopeRad * RAD_TO_DEG;
      }
    }

    return out;
  }

  /**
   * Calculates hillshade (0–255 grayscale) for each pixel.
   * Follows the ESRI hillshade algorithm convention.
   *
   * @param src         Float32Array of 258×258 elevation values (row-major)
   * @param azimuth     Sun azimuth in degrees (default 315 = NW)
   * @param altitude    Sun altitude above horizon in degrees (default 45)
   * @param cellSize    Cell size in meters per pixel
   * @param zFactor     Vertical exaggeration factor (default 1)
   * @param noDataValue Elevation value treated as noData; output is NaN for those pixels
   */
  static calculateHillshade(
    src: Float32Array,
    cellSize: number,
    azimuth: number = 315,
    altitude: number = 45,
    zFactor: number = 1,
    noDataValue?: number,
  ): Float32Array {
    const OUT = 256;
    const IN = 258;
    const out = new Float32Array(OUT * OUT);

    const zenithRad = (90 - altitude) * (Math.PI / 180);
    let azimuthMath = 360 - azimuth + 90;
    if (azimuthMath >= 360) azimuthMath -= 360;
    const azimuthRad = azimuthMath * (Math.PI / 180);
    
    // Hoist division out of loop: multiplication is ~2-3x faster than division
    const cellSizeFactor = 1 / (8 * cellSize);

    for (let r = 0; r < OUT; r++) {
      for (let c = 0; c < OUT; c++) {
        const base = r * IN + c;
        const z5 = src[base + IN + 1]; // center pixel

        if (noDataValue !== undefined && z5 === noDataValue) {
          out[r * OUT + c] = NaN;
          continue;
        }

        const z1 = src[base];               // nw
        const z2 = src[base + 1];           // n
        const z3 = src[base + 2];           // ne
        const z4 = src[base + IN];          // w
        const z6 = src[base + IN + 2];      // e
        const z7 = src[base + 2 * IN];      // sw
        const z8 = src[base + 2 * IN + 1];  // s
        const z9 = src[base + 2 * IN + 2];  // se

        const { dzdx, dzdy } = this.computeGradients(z1, z2, z3, z4, z6, z7, z8, z9, cellSizeFactor, true);

        const slopeRad = Math.atan(zFactor * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        const aspectRad = Math.atan2(dzdy, -dzdx);

        const hillshade = 255 * (
          Math.cos(zenithRad) * Math.cos(slopeRad) +
          Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - aspectRad)
        );

        out[r * OUT + c] = Math.max(0, Math.min(255, hillshade));
      }
    }

    return out;
  }

  /**
   * Calculates a weighted multi-directional hillshade (0–255).
   * Combines three light sources to reveal structure in shadows.
   */
  static calculateMultiHillshade(
    src: Float32Array,
    cellSize: number,
    zFactor: number = 1,
    noDataValue?: number,
  ): Float32Array {
    const OUT = 256;
    const IN = 258;
    const out = new Float32Array(OUT * OUT);
    
    // Hoist division out of loop: multiplication is ~2-3x faster than division
    const cellSizeFactor = 1 / (8 * cellSize);

    // Setup 3 light sources: NW (Main), W (Fill), N (Fill)
    const lights = [
      { az: 315, alt: 45, weight: 0.60 }, // Primary NW
      { az: 225, alt: 35, weight: 0.25 }, // Secondary West/SW
      { az: 0,   alt: 35, weight: 0.15 }  // Secondary North
    ].map(l => {
      const zenithRad = (90 - l.alt) * (Math.PI / 180);
      let azMath = 360 - l.az + 90;
      if (azMath >= 360) azMath -= 360;
      return { 
        zCos: Math.cos(zenithRad), 
        zSin: Math.sin(zenithRad), 
        aRad: azMath * (Math.PI / 180),
        w: l.weight 
      };
    });

    for (let r = 0; r < OUT; r++) {
      for (let c = 0; c < OUT; c++) {
        const base = r * IN + c;
        if (noDataValue !== undefined && src[base + IN + 1] === noDataValue) {
          out[r * OUT + c] = NaN;
          continue;
        }

        // Neighbors
        const z1 = src[base], z2 = src[base + 1], z3 = src[base + 2];
        const z4 = src[base + IN], z6 = src[base + IN + 2];
        const z7 = src[base + 2 * IN], z8 = src[base + 2 * IN + 1], z9 = src[base + 2 * IN + 2];

        const { dzdx, dzdy } = this.computeGradients(z1, z2, z3, z4, z6, z7, z8, z9, cellSizeFactor, true);

        const slopeRad = Math.atan(zFactor * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        const aspectRad = Math.atan2(dzdy, -dzdx);
        
        const cosSlope = Math.cos(slopeRad);
        const sinSlope = Math.sin(slopeRad);

        // Accumulate light from all three directions
        let multiHillshade = 0;
        for (const L of lights) {
          const intensity = L.zCos * cosSlope + L.zSin * sinSlope * Math.cos(L.aRad - aspectRad);
          multiHillshade += Math.max(0, intensity) * L.w;
        }

        out[r * OUT + c] = Math.min(255, multiHillshade * 255);
      }
    }
    return out;
  }
}
