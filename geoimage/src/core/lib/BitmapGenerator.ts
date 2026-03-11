import chroma from 'chroma-js';
import { GeoImageOptions } from '../types';
import { scale } from './DataUtils';

export class BitmapGenerator {
  static async generate(
    input: { width: number; height: number; rasters: any[] },
    options: GeoImageOptions
  ) {
    const optionsLocal = { ...options };

    const { rasters, width, height } = input;
    const channels = rasters.length;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    const imageData: ImageData = c!.createImageData(width, height);

    let r; let g; let b; let
      a;
    const size = width * height * 4;

    optionsLocal.unidentifiedColor = this.getColorFromChromaType(optionsLocal.unidentifiedColor);
    optionsLocal.nullColor = this.getColorFromChromaType(optionsLocal.nullColor);
    optionsLocal.clippedColor = this.getColorFromChromaType(optionsLocal.clippedColor);
    optionsLocal.color = this.getColorFromChromaType(optionsLocal.color);
    optionsLocal.useChannelIndex ??= options.useChannel === null ? null : options.useChannel - 1;

    if (optionsLocal.useChannelIndex == null) {
      if (channels === 1) {
        if (rasters[0].length / (width * height) === 1) {
          const channel = rasters[0];
          // AUTO RANGE
          if (optionsLocal.useAutoRange) {
            optionsLocal.colorScaleValueRange = this.getMinMax(channel, optionsLocal);
          }
          // SINGLE CHANNEL
          const colorData = this.getColorValue(channel, optionsLocal, size);
          imageData.data.set(colorData);
        }
        // RGB values in one channel
        if (rasters[0].length / (width * height) === 3) {
          let pixel = 0;
          for (let idx = 0; idx < size; idx += 4) {
            const rgbColor = [rasters[0][pixel], rasters[0][pixel + 1], rasters[0][pixel + 2]];
            const rgbaColor = this.hasPixelsNoData(rgbColor, optionsLocal.noDataValue)
              ? optionsLocal.nullColor
              : [...rgbColor, Math.floor(optionsLocal.alpha! * 2.55)];

            [imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2], imageData.data[idx + 3]] = rgbaColor;
            pixel += 3;
          }
        }
        if (rasters[0].length / (width * height) === 4) {
          rasters[0].forEach((value, index) => {
            imageData.data[index] = value;
          });
        }
      }
      if (channels === 3) {
        // RGB
        let pixel = 0;
        for (let i = 0; i < size; i += 4) {
          r = rasters[0][pixel];
          g = rasters[1][pixel];
          b = rasters[2][pixel];
          a = Math.floor(optionsLocal.alpha! * 2.55);

          imageData.data[i] = r;
          imageData.data[i + 1] = g;
          imageData.data[i + 2] = b;
          imageData.data[i + 3] = a;

          pixel += 1;
        }
      }
      if (channels === 4) {
        // RGBA
        let pixel = 0;
        for (let i = 0; i < size; i += 4) {
          r = rasters[0][pixel];
          g = rasters[1][pixel];
          b = rasters[2][pixel];
          a = Math.floor(optionsLocal.alpha! * 2.55);

          imageData.data[i] = r;
          imageData.data[i + 1] = g;
          imageData.data[i + 2] = b;
          imageData.data[i + 3] = a;

          pixel += 1;
        }
      }
    } else if (optionsLocal.useChannelIndex < optionsLocal.numOfChannels && optionsLocal.useChannelIndex >= 0) {
      let channel = rasters[0];
      if (rasters[optionsLocal.useChannelIndex]) {
        channel = rasters[optionsLocal.useChannelIndex];
      }
      // AUTO RANGE
      if (optionsLocal.useAutoRange) {
        optionsLocal.colorScaleValueRange = this.getMinMax(channel, optionsLocal);
      }
      const colorData = this.getColorValue(channel, optionsLocal, size, optionsLocal.numOfChannels);
      imageData.data.set(colorData);
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
    return createImageBitmap(canvas);
  }

  static getMinMax(array: any, options: GeoImageOptions) {
    let maxValue = Number.MIN_VALUE; // Fixed logic: previously depended on options but let's be safer
    let minValue = Number.MAX_VALUE;
    // To respect previous logic that might have set default min/max via options if present?
    // The original code was:
    // let maxValue = options.maxValue ? options.maxValue : Number.MIN_VALUE;
    // Wait, typical GeoImageOptions doesn't have maxValue/minValue properties defined in the interface!
    // But getMinMax implementation used them. I'll stick to original logic but type options as any or use extended type if needed.
    // Looking at GeoImageOptions type definition, it doesn't have minValue/maxValue. Use "as any" for now or strict local logic.
    // Better: use the original logic.
    const opts = options as any;
    maxValue = opts.maxValue ? opts.maxValue : Number.MIN_VALUE;
    minValue = opts.minValue ? opts.minValue : Number.MAX_VALUE;

    for (let idx = 0; idx < array.length; idx += 1) {
      if (options.noDataValue === undefined || array[idx] !== options.noDataValue) {
        if (array[idx] > maxValue) maxValue = array[idx];
        if (array[idx] < minValue) minValue = array[idx];
      }
    }
    return [minValue, maxValue];
  }

  static getColorValue(dataArray: any[], options: GeoImageOptions, arrayLength: number, numOfChannels = 1) {
    const colorScale = chroma.scale(options.colorScale).domain(options.colorScaleValueRange);
    let pixel: number = options.useChannelIndex === null ? 0 : options.useChannelIndex;
    const colorsArray = new Uint8ClampedArray(arrayLength);

    const dataValues = options.colorsBasedOnValues ? options.colorsBasedOnValues.map(([first]) => first) : undefined;
    const colorValues = options.colorsBasedOnValues ? options.colorsBasedOnValues.map(([, second]) => [...chroma(second).rgb(), Math.floor(options.alpha * 2.55)]) : undefined;

    const colorClasses = options.useColorClasses ? options.colorClasses.map(([color]) => [...chroma(color).rgb(), Math.floor(options.alpha * 2.55)]) : undefined;
    const dataIntervals = options.useColorClasses ? options.colorClasses.map(([, interval]) => interval) : undefined;
    const dataIntervalBounds = options.useColorClasses ? options.colorClasses.map(([, , bounds], index) => {
      if (bounds !== undefined) return bounds;
      if (index === options.colorClasses.length - 1) return [true, true];
      return [true, false];
    }) : undefined;

    // Pre-calculate Loop Variables to avoid object lookup in loop
    const optNoData = options.noDataValue;
    const optClipLow = options.clipLow;
    const optClipHigh = options.clipHigh;
    const optClippedColor = options.clippedColor;
    const optUseHeatMap = options.useHeatMap;
    const optUseColorsBasedOnValues = options.useColorsBasedOnValues;
    const optUseColorClasses = options.useColorClasses;
    const optUseSingleColor = options.useSingleColor;
    const optUseDataForOpacity = options.useDataForOpacity;
    const optColor = options.color;
    const optUnidentifiedColor = options.unidentifiedColor;
    const optNullColor = options.nullColor;
    const optAlpha = Math.floor(options.alpha * 2.55);
    const rangeMin = options.colorScaleValueRange[0]!;
    const rangeMax = options.colorScaleValueRange.slice(-1)[0]!;

    // LOOKUP TABLE OPTIMIZATION (for 8-bit data)
    // If the data is Uint8 (0-255), we can pre-calculate the result for every possible value.
    const is8Bit = dataArray instanceof Uint8Array || dataArray instanceof Uint8ClampedArray;

    if (is8Bit && !optUseDataForOpacity) {
      // Create LUT: 256 values * 4 channels (RGBA)
      const lut = new Uint8ClampedArray(256 * 4);

      for (let i = 0; i < 256; i++) {
        let r = optNullColor[0], g = optNullColor[1], b = optNullColor[2], a = optNullColor[3];

        // Logic mirroring the pixel loop
        if (optNoData === undefined || i !== optNoData) {
          if ((optClipLow != null && i <= optClipLow) || (optClipHigh != null && i >= optClipHigh)) {
             [r, g, b, a] = optClippedColor as number[];
          } else {
             let c = [r, g, b, a];
             if (optUseHeatMap) {
               const rgb = (colorScale(i) as any).rgb();
               c = [rgb[0], rgb[1], rgb[2], optAlpha];
             }
             else if (optUseColorsBasedOnValues) {
                const index = dataValues.indexOf(i);
                c = (index > -1) ? colorValues[index] : optUnidentifiedColor as number[];
             }
             else if (optUseColorClasses) {
                const index = this.findClassIndex(i, dataIntervals, dataIntervalBounds);
                c = (index > -1) ? colorClasses[index] : optUnidentifiedColor as number[];
             }
             else if (optUseSingleColor) {
                c = optColor as number[];
             }
             [r, g, b, a] = c as number[];
          }
        }
        lut[i * 4] = r;
        lut[i * 4 + 1] = g;
        lut[i * 4 + 2] = b;
        lut[i * 4 + 3] = a;
      }

      // Fast Apply Loop
      let outIdx = 0;
      for (let i = 0; i < dataArray.length; i += numOfChannels) { // Note: arrayLength passed in is size*4, dataArray is original size
        const val = dataArray[pixel]; // 'pixel' starts at channel offset

        // Because dataArray length < arrayLength (which is rgba size), strict mapping:
        // Actually, previous code said: for (let i = 0; i < arrayLength; i += 4)
        // arrayLength is width*height*4. dataArray has length width*height*channels.
        // The loop below is safer:

        const lutIdx = val * 4;
        colorsArray[outIdx++] = lut[lutIdx];
        colorsArray[outIdx++] = lut[lutIdx + 1];
        colorsArray[outIdx++] = lut[lutIdx + 2];
        colorsArray[outIdx++] = lut[lutIdx + 3];

        pixel += numOfChannels;
        if (outIdx >= arrayLength) break;
      }
      return colorsArray;
    }

    // Standard Loop (Float or non-optimized)
    for (let i = 0; i < arrayLength; i += 4) {
      let r = optNullColor[0], g = optNullColor[1], b = optNullColor[2], a = optNullColor[3];

      const val = dataArray[pixel];

      if ((!Number.isNaN(val)) && (optNoData === undefined || val !== optNoData)) {
        if (
          (optClipLow != null && val <= optClipLow) || (optClipHigh != null && val >= optClipHigh)
        ) {
          [r, g, b, a] = optClippedColor as number[];
        } else {
          let c;
          if (optUseHeatMap) {
             const rgb = (colorScale(val) as any).rgb();
             c = [rgb[0], rgb[1], rgb[2], optAlpha];
          }
          else if (optUseColorsBasedOnValues) {
            const index = dataValues.indexOf(val);
            c = (index > -1) ? colorValues[index] : optUnidentifiedColor;
          }
          else if (optUseColorClasses) {
            const index = this.findClassIndex(val, dataIntervals, dataIntervalBounds);
            c = (index > -1) ? colorClasses[index] : optUnidentifiedColor;
          }
          else if (optUseSingleColor) {
            c = optColor;
          }

          if (c) {
             [r, g, b, a] = c;
          }

          if (optUseDataForOpacity) {
            a = scale(val, rangeMin, rangeMax, 0, 255);
          }
        }
      }

      colorsArray[i] = r;
      colorsArray[i + 1] = g;
      colorsArray[i + 2] = b;
      colorsArray[i + 3] = a;

      pixel += numOfChannels;
    }
    return colorsArray;
  }

  static findClassIndex(number: number, intervals: any, bounds: any) {
    for (let idx = 0; idx < intervals.length; idx += 1) {
      const [min, max] = intervals[idx];
      const [includeEqualMin, includeEqualMax] = bounds[idx];
      if ((includeEqualMin ? number >= min : number > min)
          && (includeEqualMax ? number <= max : number < max)) {
        return idx;
      }
    }
    return -1;
  }

  static getDefaultColor(size: number, nullColor: any) {
    const colorsArray = new Array(size);
    for (let i = 0; i < size; i += 4) {
      [colorsArray[i], colorsArray[i + 1], colorsArray[i + 2], colorsArray[i + 3]] = nullColor;
    }
    return colorsArray;
  }

  static getColorFromChromaType(colorDefinition: any) {
    if (!Array.isArray(colorDefinition) || colorDefinition.length !== 4) {
      return [...chroma(colorDefinition).rgb(), 255];
    }
    return colorDefinition;
  }

  static hasPixelsNoData(pixels: any[], noDataValue: any) {
    return noDataValue !== undefined && pixels.every((pixel) => pixel === noDataValue);
  }
}
