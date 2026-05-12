import chroma from 'chroma-js';
import { GeoImageOptions, TypedArray, TileResult } from '../types';
import { scale } from './DataUtils';
import { isF32NoData } from './numberUtils';

export class BitmapGenerator {
  /**
   * Cache for Swiss relief color LUTs to avoid regenerating on every tile.
   * Key: colorScale config + range, Value: pre-computed RGBA LUT
   */
  private static _swissColorLUTCache: Map<string, Uint8ClampedArray> = new Map();

  /**
   * Cache for 8-bit (256-entry) color LUTs.
   * Shared process-wide across all tiles and datasets when options are fixed (i.e. !useAutoRange).
   * Key: serialised coloring options, Value: pre-computed 256×RGBA LUT
   */
  private static _8bitLUTCache: Map<string, Uint8ClampedArray> = new Map();

  /**
   * Cache for float/16-bit (1024-entry) heatmap LUTs.
   * Shared process-wide across all tiles and datasets when !useAutoRange.
   * Key: serialised coloring options + range, Value: pre-computed 1024×RGBA LUT
   */
  private static _floatLUTCache: Map<string, Uint8ClampedArray> = new Map();

  /** Build a cache key that captures all options affecting LUT colour output. */
  private static getLUTCacheKey(options: GeoImageOptions, rangeMin: number, rangeMax: number, optAlpha: number): string {
    return `${rangeMin}_${rangeMax}_${optAlpha}_${JSON.stringify(options.colorScale)}_${options.useSingleColor}_${JSON.stringify(options.color)}_${options.useColorClasses}_${JSON.stringify(options.colorClasses)}_${options.useColorsBasedOnValues}_${JSON.stringify(options.colorsBasedOnValues)}_${options.useHeatMap}_${options.clipLow ?? ''}_${options.clipHigh ?? ''}_${JSON.stringify(options.clippedColor)}_${JSON.stringify(options.nullColor)}_${JSON.stringify(options.unidentifiedColor)}`;
  }

  /**
   * Main entry point: Generates an ImageBitmap from raw raster data.
   */
  static async generate(
    input: { width: number; height: number; rasters: TypedArray[] },
    options: GeoImageOptions
  ): Promise<TileResult> {
    
    const optionsLocal = { ...options };
    const { rasters, width, height } = input;
    // NOTE: As of 2026-03, only interleaved rasters (rasters.length === 1) are produced by the main COG tile path.
    // Planar (rasters.length > 1) is not currently supported in production, but this check is kept for future extension.
    const isInterleaved = rasters.length === 1;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    const imageData: ImageData = c!.createImageData(width, height);

    const size = width * height * 4;
    const alpha255 = Math.floor(optionsLocal.alpha! * 2.55);

    // Normalize colors using chroma
    optionsLocal.unidentifiedColor = this.getColorFromChromaType(optionsLocal.unidentifiedColor, alpha255);
    optionsLocal.nullColor = this.getColorFromChromaType(optionsLocal.nullColor, alpha255);
    optionsLocal.clippedColor = this.getColorFromChromaType(optionsLocal.clippedColor, alpha255);
    optionsLocal.color = this.getColorFromChromaType(optionsLocal.color, alpha255);
    
    optionsLocal.useChannelIndex ??= optionsLocal.useChannel == null ? null : optionsLocal.useChannel - 1;

    // Derive channel count from data if not provided
    // If planar support is added, this logic must be updated to handle both layouts correctly.
    const numAvailableChannels = optionsLocal.numOfChannels ?? 
      (rasters.length === 1 ? rasters[0].length / (width * height) : rasters.length);

    if (optionsLocal.useReliefGlaze) {
      if (rasters.length >= 1) {
        // Relief glaze: pure black/white overlay with variable alpha
        imageData.data.set(
          this.getReliefGlazeRGBA(rasters, optionsLocal, size)
        );
      } else {
        // Missing relief mask: fill with transparent
        const transparentData = new Uint8ClampedArray(size);
        transparentData.fill(0);
        imageData.data.set(transparentData);
      }
    }
    else if (optionsLocal.useSwissRelief) {
      if (rasters.length === 2) {
        // Normal Swiss relief rendering: hypsometric color × relief mask
        imageData.data.set(
          this.getColorValue(rasters, optionsLocal, size)
        );
      } else { // Missing mask: fill with null color (fully transparent or a fallback)
        const defaultColorData = this.getDefaultColor(size, optionsLocal.nullColor);
        defaultColorData.forEach((value, index) => {
          imageData.data[index] = value;
        });
      }
    }  
    else if (optionsLocal.useChannelIndex == null) {
      if (isInterleaved) {
        const ratio = rasters[0].length / (width * height);
        if (ratio === 1) {
          if (optionsLocal.useAutoRange) {
            optionsLocal.colorScaleValueRange = this.getMinMax(rasters[0], optionsLocal);
         }
          imageData.data.set(this.getColorValue(rasters[0], optionsLocal, size));
        } // 3 or 4-band RGB(A) imagery: use per-pixel loop for direct color assignment
          else if (ratio === 3 || ratio === 4) {
            
          let sampleIndex = 0;
          for (let i = 0; i < size; i += 4) {
            const rgbColor = [rasters[0][sampleIndex], rasters[0][sampleIndex + 1], rasters[0][sampleIndex + 2]];
            const isNoData = this.hasPixelsNoData(rgbColor, optionsLocal.noDataValue);
            imageData.data[i] = isNoData ? optionsLocal.nullColor[0] : rgbColor[0];
            imageData.data[i + 1] = isNoData ? optionsLocal.nullColor[1] : rgbColor[1];
            imageData.data[i + 2] = isNoData ? optionsLocal.nullColor[2] : rgbColor[2];
            imageData.data[i + 3] = isNoData ? optionsLocal.nullColor[3] : (ratio === 4 ? rasters[0][sampleIndex + 3] : alpha255);
            sampleIndex += ratio;
          }
        }
      } else {
        let sampleIndex = 0;
        for (let i = 0; i < size; i += 4) {
          imageData.data[i] = rasters[0][sampleIndex];
          imageData.data[i + 1] = rasters[1][sampleIndex];
          imageData.data[i + 2] = rasters[2][sampleIndex];
          imageData.data[i + 3] = rasters.length === 4 ? rasters[3][sampleIndex] : alpha255;
          sampleIndex++;
        }
      }
    } else if (optionsLocal.useChannelIndex < numAvailableChannels && optionsLocal.useChannelIndex >= 0) {
      const isInterleaved = rasters.length === 1 && numAvailableChannels > 1;
      const channel = isInterleaved ? rasters[0] : (rasters[optionsLocal.useChannelIndex] ?? rasters[0]);
      const samplesPerPixel = isInterleaved ? numAvailableChannels : 1;

      if (optionsLocal.useAutoRange) {
        optionsLocal.colorScaleValueRange = this.getMinMax(channel, optionsLocal, samplesPerPixel);
      }
      imageData.data.set(this.getColorValue(channel, optionsLocal, size, samplesPerPixel));
    } else {
      // if user defined channel does not exist
      /* eslint-disable no-console */
      console.log(`Defined channel(${options.useChannel}) or channel index(${options.useChannelIndex}) does not exist, choose a different channel or set the useChannel property to null if you want to visualize RGB(A) imagery`);
      const defaultColorData = this.getDefaultColor(size, optionsLocal.nullColor);
      defaultColorData.forEach((value, index) => {
        imageData.data[index] = value;
      });
    }

    // Optimization: Skip Canvas -> PNG encoding -> Base64 string
    // Return raw GPU-ready ImageBitmap directly
    // Note: createImageBitmap(imageData) is cleaner, but using the canvas ensures broad compatibility
    c!.putImageData(imageData, 0, 0);
    const map = await createImageBitmap(canvas);
    // rasters[0] is the interleaved buffer on the CogTiles path (primary use case).
    // For planar multi-band GeoTIFFs via GeoImage.getBitmap(), only the first band is exposed here.
    // Full multi-band raw picking support is tracked in https://github.com/Gisat/deck.gl-geotiff/issues/98
    return { map, raw: rasters[0], width, height };
  }

  static getColorValue(dataArray: TypedArray | TypedArray[], options: GeoImageOptions, arrayLength: number, samplesPerPixel = 1) {
    // Normalize all colorScale entries for chroma.js compatibility
    const colorScale = chroma.scale(
      options.colorScale?.map(c => Array.isArray(c) ? chroma(c as [number, number, number]) : c)
    ).domain(options.colorScaleValueRange ?? [0, 255]);
    const colorsArray = new Uint8ClampedArray(arrayLength);
    const optAlpha = Math.floor((options.alpha ?? 100) * 2.55);
    const rangeMin = options.colorScaleValueRange?.[0] ?? 0;
    const rangeMax = options.colorScaleValueRange?.[1] ?? 255;

    const isMultiRaster = Array.isArray(dataArray);
    const primaryBuffer = isMultiRaster ? dataArray[0] : dataArray as TypedArray;

    const isSwiss = options.useSwissRelief && isMultiRaster && dataArray.length >= 2;
    const is8Bit = primaryBuffer instanceof Uint8Array || primaryBuffer instanceof Uint8ClampedArray;
    const isFloatOrWide = !is8Bit && (primaryBuffer instanceof Float32Array || primaryBuffer instanceof Uint16Array || primaryBuffer instanceof Int16Array);

    // 1. SWISS MODE BRANCH
    if (isSwiss) {
      const reliefMask = (dataArray as TypedArray[])[1];
      const rangeSpan = (rangeMax - rangeMin) || 1;

      // Only use LUT optimization for useHeatMap mode; other modes use calculateSingleColor per-pixel
      let lut: Uint8ClampedArray | null = null;
      if (options.useHeatMap) {
        const LUT_SIZE = 1024;
        
        // Cache LUT: generate key from colorScale config + range + alpha
        const cacheKey = `${rangeMin}_${rangeMax}_${optAlpha}_${JSON.stringify(options.colorScale)}`;
        lut = this._swissColorLUTCache.get(cacheKey) || null;
        
        if (!lut) {
          // LUT not cached, generate it
          lut = new Uint8ClampedArray(LUT_SIZE * 4);
          for (let i = 0; i < LUT_SIZE; i++) {
            const domainVal = rangeMin + (i / (LUT_SIZE - 1)) * rangeSpan;
            const rgb = colorScale(domainVal).rgb();
            lut[i * 4] = rgb[0];
            lut[i * 4 + 1] = rgb[1];
            lut[i * 4 + 2] = rgb[2];
            lut[i * 4 + 3] = optAlpha;
          }
          this._swissColorLUTCache.set(cacheKey, lut);
        }
      }

      for (let i = 0, sampleIndex = (options.useChannelIndex ?? 0); i < arrayLength; i += 4, sampleIndex += samplesPerPixel) {
        const elevationVal = primaryBuffer[sampleIndex];
        
        // NaN-aware noData check for Swiss relief
        const isNoData = isF32NoData(elevationVal, options.noDataValue);
        if (Number.isNaN(elevationVal) || isNoData) {
          colorsArray.set(options.nullColor as number[], i);
          continue;
        }

        let baseColor: number[];
        if (lut) {
          // LUT-optimized path for useHeatMap
          const t = (elevationVal - rangeMin) / rangeSpan;
          const lutIdx = Math.min(1023, Math.max(0, Math.floor(t * 1023))) * 4;
          baseColor = [lut[lutIdx], lut[lutIdx + 1], lut[lutIdx + 2], lut[lutIdx + 3]];
        } else {
          // Per-pixel calculation for useSingleColor, useColorClasses, useColorsBasedOnValues
          baseColor = this.calculateSingleColor(elevationVal, colorScale, options, optAlpha);
        }
        
        // Apply relief mask as multiplier (Ambient Fill approach)
        const maskVal = reliefMask[sampleIndex];
        const multiplier = 0.4 + 0.6 * (maskVal / 255);

        colorsArray[i]     = Math.floor(baseColor[0] * multiplier);
        colorsArray[i + 1] = Math.floor(baseColor[1] * multiplier);
        colorsArray[i + 2] = Math.floor(baseColor[2] * multiplier);
        colorsArray[i + 3] = baseColor[3];
      }
      return colorsArray;
    }

    // 2. 8-BIT COMPREHENSIVE LUT

    // Single-band 8-bit (grayscale or indexed): use LUT for fast mapping.
    // The LUT covers all 256 possible values and is fixed for a given set of coloring options,
    // so cache it across tiles (skip cache only when useAutoRange recomputes the range per tile).
    if (is8Bit && !options.useDataForOpacity) {
      const cacheKey = !options.useAutoRange ? this.getLUTCacheKey(options, rangeMin, rangeMax, optAlpha) : null;
      let lut = cacheKey ? (this._8bitLUTCache.get(cacheKey) ?? null) : null;

      if (!lut) {
        lut = new Uint8ClampedArray(256 * 4);
        for (let i = 0; i < 256; i++) {
          if (
            (options.clipLow != null && i <= options.clipLow) ||
            (options.clipHigh != null && i >= options.clipHigh)
          ) {
            lut.set(options.clippedColor as number[], i * 4);
          } else {
            lut.set(this.calculateSingleColor(i, colorScale, options, optAlpha), i * 4);
          }
        }
        if (cacheKey) this._8bitLUTCache.set(cacheKey, lut);
      }

      for (let i = 0, sampleIndex = (options.useChannelIndex ?? 0); i < arrayLength; i += 4, sampleIndex += samplesPerPixel) {
        const lutIdx = primaryBuffer[sampleIndex] * 4;
        colorsArray[i] = lut[lutIdx];
        colorsArray[i+1] = lut[lutIdx+1];
        colorsArray[i+2] = lut[lutIdx+2];
        colorsArray[i+3] = lut[lutIdx+3];
      }
      return colorsArray;
    }

    // 3. FLOAT / 16-BIT LUT (HEATMAP ONLY)
    // Guard: only activate when heatmap is the highest-priority active mode.
    // If a more specific mode (useSingleColor, useColorClasses, useColorsBasedOnValues) is set,
    // fall through to the general loop so calculateSingleColor can honour the priority chain.
    if (isFloatOrWide && options.useHeatMap && !options.useSingleColor && !options.useColorClasses && !options.useColorsBasedOnValues && !options.useDataForOpacity) {
      
      const LUT_SIZE = 1024;
      const rangeSpan = (rangeMax - rangeMin) || 1;

      const cacheKey = !options.useAutoRange ? this.getLUTCacheKey(options, rangeMin, rangeMax, optAlpha) : null;
      let lut = cacheKey ? (this._floatLUTCache.get(cacheKey) ?? null) : null;

      if (!lut) {
        lut = new Uint8ClampedArray(LUT_SIZE * 4);
        for (let i = 0; i < LUT_SIZE; i++) {
          const domainVal = rangeMin + (i / (LUT_SIZE - 1)) * rangeSpan;
          if (
            (options.clipLow != null && domainVal <= options.clipLow) ||
            (options.clipHigh != null && domainVal >= options.clipHigh)
          ) {
            lut.set(options.clippedColor as number[], i * 4);
          } else {
            const rgb = colorScale(domainVal).rgb();
            lut[i * 4] = rgb[0];
            lut[i * 4 + 1] = rgb[1];
            lut[i * 4 + 2] = rgb[2];
            lut[i * 4 + 3] = optAlpha;
          }
        }
        if (cacheKey) this._floatLUTCache.set(cacheKey, lut);
      }

      for (let i = 0, sampleIndex = (options.useChannelIndex ?? 0); i < arrayLength; i += 4, sampleIndex += samplesPerPixel) {
        const val = primaryBuffer[sampleIndex];
        if (this.isInvalid(val, options)) {
          colorsArray.set(this.getInvalidColor(val, options), i);
        } else {
          const t = (val - rangeMin) / rangeSpan;
          const lutIdx = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(t * (LUT_SIZE - 1)))) * 4;
          colorsArray[i] = lut[lutIdx];
          colorsArray[i+1] = lut[lutIdx+1];
          colorsArray[i+2] = lut[lutIdx+2];
          colorsArray[i+3] = lut[lutIdx+3];
        }
      }
      return colorsArray;
    }

    // 4. FALLBACK LOOP (Categorical Float, Opacity, or Single Color)
    
    let sampleIndex = options.useChannelIndex ?? 0;
    for (let i = 0; i < arrayLength; i += 4) {
      const val = primaryBuffer[sampleIndex];
      let color;
      if ((options.clipLow != null && val <= options.clipLow) || (options.clipHigh != null && val >= options.clipHigh)) {
        color = options.clippedColor as number[];
      } else {
        color = this.calculateSingleColor(val, colorScale, options, optAlpha);
      }
      if (options.useDataForOpacity && !this.isInvalid(val, options)) {
        color[3] = scale(val, rangeMin, rangeMax, 0, 255);
      }
      colorsArray.set(color, i);
      sampleIndex += samplesPerPixel;
    }
    return colorsArray;
  }

  /**
   * Generate relief glaze RGBA output.
   * Maps relief mask (0-255) to pure black/white glaze with variable alpha.
   * - reliefValue < 128: Pure black (0,0,0) darkens shadows
   * - reliefValue > 128: Pure white (255,255,255) brightens highlights
   * - reliefValue == 128: Transparent (no effect)
   * 
   * High-performance implementation using pre-computed alpha LUT to avoid 65k Math.pow calls.
   *
   * @param rasters Array of [relief mask raster] (single raster expected)
   * @param options GeoImageOptions (alpha used for opacity scaling)
   * @param arrayLength Total RGBA array length
   * @returns Uint8ClampedArray of RGBA values
   */
  static getReliefGlazeRGBA(
    rasters: TypedArray[],
    options: GeoImageOptions,
    arrayLength: number,
  ): Uint8ClampedArray {
    const reliefMask = rasters[0];
    const opacityFactor = (options.maxGlazeAlpha ?? 128) / 255;
    
    // Pre-compute alpha lookup table (256 entries, one per relief value 0-255)
    const alphaLookup = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      if (v === 0) {
        alphaLookup[v] = 0; // noData: fully transparent
      } else {
        const alphaDist = Math.abs(v - 128) / 128;
        const bias = v < 128 ? 0.6 : 0.8;
        alphaLookup[v] = Math.floor(Math.pow(alphaDist, bias) * 255 * opacityFactor);
      }
    }
    
    const glazeArray = new Uint8ClampedArray(arrayLength);

    let maskIndex = 0;
    for (let i = 0; i < arrayLength; i += 4) {
      const reliefValue = reliefMask[maskIndex];
      
      // Pure black for shadows, pure white for highlights (no muddy grays)
      const glaze = reliefValue < 128 ? 0 : 255;
      const alpha = alphaLookup[reliefValue];

      glazeArray[i] = glaze;        // R
      glazeArray[i + 1] = glaze;    // G
      glazeArray[i + 2] = glaze;    // B
      glazeArray[i + 3] = alpha;    // A

      maskIndex++;
    }
    return glazeArray;
  }

  private static calculateSingleColor(val: number, colorScale: any, options: GeoImageOptions, alpha: number): number[] {
    if (this.isInvalid(val, options)) {
      return options.nullColor as number[];
    }
    
    // Color mode priority (most specific wins):
    // 1. useSingleColor
    // 2. useColorClasses
    // 3. useColorsBasedOnValues
    // 4. useHeatMap
    // Only the first enabled mode is used.
    if (options.useSingleColor) {
      return options.color as number[];
    } else if (options.useColorClasses) {
      const index = this.findClassIndex(val, options);
      return index > -1 ? [...chroma(Array.isArray(options.colorClasses![index][0]) ? chroma(options.colorClasses![index][0] as [number, number, number]) : options.colorClasses![index][0]).rgb(), alpha] : (options.unidentifiedColor as number[]);
    } else if (options.useColorsBasedOnValues) {
      
      const match = options.colorsBasedOnValues?.find(([v]) => v === val);
      return match ? [...chroma(Array.isArray(match[1]) ? chroma(match[1] as [number, number, number]) : match[1]).rgb(), alpha] : (options.unidentifiedColor as number[]);
    } else if (options.useHeatMap) {
      return [...colorScale(val).rgb(), alpha];
    }
    return options.unidentifiedColor as number[];
  }

  private static findClassIndex(val: number, options: GeoImageOptions): number {
    if (!options.colorClasses) return -1;
    for (let i = 0; i < options.colorClasses.length; i++) {
      const [, [min, max], bounds] = options.colorClasses[i];
      const [incMin, incMax] = bounds || (i === options.colorClasses.length - 1 ? [true, true] : [true, false]);
      if ((incMin ? val >= min : val > min) && (incMax ? val <= max : val < max)) return i;
    }
    return -1;
  }

  private static getDefaultColor(size: number, nullColor: number[]) {
    const colorsArray = new Uint8ClampedArray(size);
    for (let i = 0; i < size; i += 4) {
      [colorsArray[i], colorsArray[i + 1], colorsArray[i + 2], colorsArray[i + 3]] = nullColor;
    }
    return colorsArray;
  }

  private static isInvalid(val: number, options: GeoImageOptions): boolean {
    return Number.isNaN(val) || isF32NoData(val, options.noDataValue);
  }

  private static getInvalidColor(val: number, options: GeoImageOptions): number[] {
    return options.nullColor as number[];
  }

  static getMinMax(array: TypedArray, options: GeoImageOptions, samplesPerPixel = 1) {
    let max = -Infinity, min = Infinity;
    for (let i = (options.useChannelIndex ?? 0); i < array.length; i += samplesPerPixel) {
      const val = array[i];
      if (!this.isInvalid(val, options)) {
        if (val > max) max = val;
        if (val < min) min = val;
      }
    }
    return max === -Infinity ? (options.colorScaleValueRange || [0, 255]) : [min, max];
  }

  static getColorFromChromaType(color: any, alpha = 255) {
    return (!Array.isArray(color) || color.length !== 4) ? [...chroma(color).rgb(), alpha] : color;
  }

  static hasPixelsNoData(pixels: number[], noData: number | undefined) {
    return noData !== undefined && pixels.every(p => isF32NoData(p, noData));
  }
}