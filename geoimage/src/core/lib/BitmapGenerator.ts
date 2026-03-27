import chroma from 'chroma-js';
import { GeoImageOptions, TypedArray, TileResult } from '../types';
import { scale } from './DataUtils';

export class BitmapGenerator {
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

    if (optionsLocal.useChannelIndex == null) {
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

  static getColorValue(dataArray: TypedArray | any[], options: GeoImageOptions, arrayLength: number, samplesPerPixel = 1) {
    // Normalize all colorScale entries for chroma.js compatibility
const colorScale = chroma.scale(
  options.colorScale?.map(c => Array.isArray(c) ? chroma(c) : c)
).domain(options.colorScaleValueRange);
    const colorsArray = new Uint8ClampedArray(arrayLength);
    const optAlpha = Math.floor(options.alpha * 2.55);
    const rangeMin = options.colorScaleValueRange[0]!;
    const rangeMax = options.colorScaleValueRange.slice(-1)[0]!;

    const is8Bit = dataArray instanceof Uint8Array || dataArray instanceof Uint8ClampedArray;
    const isFloatOrWide = !is8Bit && (dataArray instanceof Float32Array || dataArray instanceof Uint16Array || dataArray instanceof Int16Array);

    // 1. 8-BIT COMPREHENSIVE LUT

    // Single-band 8-bit (grayscale or indexed): use LUT for fast mapping
    if (is8Bit && !options.useDataForOpacity) {
      
      const lut = new Uint8ClampedArray(256 * 4);
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
      for (let i = 0, sampleIndex = (options.useChannelIndex ?? 0); i < arrayLength; i += 4, sampleIndex += samplesPerPixel) {
        const lutIdx = dataArray[sampleIndex] * 4;
        colorsArray[i] = lut[lutIdx];
        colorsArray[i+1] = lut[lutIdx+1];
        colorsArray[i+2] = lut[lutIdx+2];
        colorsArray[i+3] = lut[lutIdx+3];
      }
      return colorsArray;
    }

    // 2. FLOAT / 16-BIT LUT (HEATMAP ONLY)
    if (isFloatOrWide && options.useHeatMap && !options.useDataForOpacity) {
      
      const LUT_SIZE = 1024;
      const lut = new Uint8ClampedArray(LUT_SIZE * 4);
      const rangeSpan = (rangeMax - rangeMin) || 1;
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
      for (let i = 0, sampleIndex = (options.useChannelIndex ?? 0); i < arrayLength; i += 4, sampleIndex += samplesPerPixel) {
        const val = dataArray[sampleIndex];
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

    // 3. FALLBACK LOOP (Categorical Float, Opacity, or Single Color)
    
    let sampleIndex = options.useChannelIndex ?? 0;
    for (let i = 0; i < arrayLength; i += 4) {
      const val = dataArray[sampleIndex];
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
      return index > -1 ? [...chroma(Array.isArray(options.colorClasses![index][0]) ? chroma(options.colorClasses![index][0]) : options.colorClasses![index][0]).rgb(), alpha] : (options.unidentifiedColor as number[]);
    } else if (options.useColorsBasedOnValues) {
      
      const match = options.colorsBasedOnValues?.find(([v]) => v === val);
      return match ? [...chroma(Array.isArray(match[1]) ? chroma(match[1]) : match[1]).rgb(), alpha] : (options.unidentifiedColor as number[]);
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
    return Number.isNaN(val) || (options.noDataValue !== undefined && val === options.noDataValue);
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
    return noData !== undefined && pixels.every(p => p === noData);
  }
}