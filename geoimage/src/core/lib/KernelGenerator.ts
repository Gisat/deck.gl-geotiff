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

        const dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * cellSize);
        const dzdy = ((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) / (8 * cellSize);

        const slopeRad = Math.atan(zFactor * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        out[r * OUT + c] = slopeRad * (180 / Math.PI);
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

        const dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * cellSize);
        // dzdy: north minus south (geographic convention — top rows minus bottom rows in raster)
        const dzdy = ((z1 + 2 * z2 + z3) - (z7 + 2 * z8 + z9)) / (8 * cellSize);

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
}
