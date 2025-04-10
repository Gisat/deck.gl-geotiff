/* eslint 'max-len': [1, { code: 105, comments: 999, ignoreStrings: true, ignoreUrls: true }] */

// import { ExtentsLeftBottomRightTop } from '@deck.gl/core/utils/positions';
import { fromArrayBuffer, GeoTIFFImage, TypedArray } from 'geotiff';
import chroma from 'chroma-js';
import Martini from '@mapbox/martini';
import { getMeshBoundingBox } from '@loaders.gl/schema';
import { addSkirt } from './helpers/skirt.ts';
import Delatin from './delatin/index.ts';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

// FIXME - tesselator as a parameter
const tesselator = 'martini';
// const tesselator = 'delatin';
export type ClampToTerrainOptions = {
  terrainDrawMode?: string
}
export type GeoImageOptions = {
    type: 'image' | 'terrain',
    format?: 'uint8' | 'uint16' | 'uint32' |'int8' | 'int16' | 'int32' | 'float32' | 'float64'
    useHeatMap?: boolean,
    useColorsBasedOnValues? : boolean,
    useColorClasses? : boolean,
    useAutoRange?: boolean,
    useDataForOpacity?: boolean,
    useChannel?: number | null,
    useSingleColor?: boolean,
    blurredTexture? : boolean,
    clipLow?: number | null,
    clipHigh?: number | null,
    multiplier?: number,
    color?: Array<number> | chroma.Color,
    colorScale?: Array<string> | Array<chroma.Color>,
    colorScaleValueRange?: number[],
    colorsBasedOnValues? : [number|undefined, chroma.Color][],
    colorClasses? : [chroma.Color, [number, number], [boolean, boolean]?][],
    alpha?: number,
    noDataValue?: number
    numOfChannels?: number,
    nullColor?: Array<number> | chroma.Color
    unidentifiedColor?: Array<number> | chroma.Color,
    clippedColor?: Array<number> | chroma.Color,
    clampToTerrain?: ClampToTerrainOptions | boolean, // terrainDrawMode: 'drape',
    terrainColor?: Array<number> | chroma.Color,
    terrainSkirtHeight?: number,
    terrainMinValue?: number,
    planarConfig?: number,
}

export const DefaultGeoImageOptions: GeoImageOptions = {
  type: 'image',
  format: 'uint8',
  useHeatMap: true,
  useColorsBasedOnValues: false,
  useAutoRange: false,
  useDataForOpacity: false,
  useSingleColor: false,
  useColorClasses: false,
  blurredTexture: true,
  clipLow: null,
  clipHigh: null,
  multiplier: 1.0,
  color: [255, 0, 255, 255],
  colorScale: chroma.brewer.YlOrRd,
  colorScaleValueRange: [0, 255],
  colorsBasedOnValues: null,
  colorClasses: null,
  alpha: 100,
  useChannel: null,
  noDataValue: undefined,
  numOfChannels: undefined,
  nullColor: [0, 0, 0, 0],
  unidentifiedColor: [0, 0, 0, 0],
  clippedColor: [0, 0, 0, 0],
  terrainColor: [133, 133, 133, 255],
  terrainSkirtHeight: 100,
  terrainMinValue: 0,
  planarConfig: undefined,
};

export default class GeoImage {
  data: GeoTIFFImage | undefined;

  scale = (
    num: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number,
  ) => ((num - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

  async setUrl(url: string) {
    // TODO - not tested
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const tiff = await fromArrayBuffer(arrayBuffer);

    const data = await tiff.getImage(0);

    this.data = data;
  }

  async getMap(
    input: string | {
        width: number,
        height: number,
        rasters: any[],
        bounds: Bounds
        },
    options: GeoImageOptions,
    meshMaxError,
  ) {
    const mergedOptions = { ...DefaultGeoImageOptions, ...options };

    switch (mergedOptions.type) {
      case 'image':
        return this.getBitmap(input, mergedOptions);
      case 'terrain':
        return this.getHeightmap(input, mergedOptions, meshMaxError);
      default:
        return null;
    }
  }

  // GetHeightmap uses only "useChannel" and "multiplier" options
  async getHeightmap(
    input: string | {
        bounds: Bounds,
        width: number,
        height: number,
        rasters: any[] },
    options: GeoImageOptions,
    meshMaxError,
  ) {
    let rasters = [];
    let width: number;
    let height: number;

    if (typeof (input) === 'string') {
      // TODO not tested
      // input is type of object
      await this.setUrl(input);

      rasters = (await this.data!.readRasters()) as TypedArray[];
      width = this.data!.getWidth();
      height = this.data!.getHeight();
    } else {
      rasters = input.rasters;
      width = input.width;
      height = input.height;
    }

    let channel = rasters[0];

    if (options.useChannel != null) {
      if (rasters[options.useChannel]) {
        channel = rasters[options.useChannel]; // length = 65536
      }
    }

    const terrain = new Float32Array((width + 1) * (height + 1));

    const numOfChannels = channel.length / (width * height);

    let pixel:number = options.useChannel === null ? 0 : options.useChannel;

    for (let i = 0, y = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i++) {
        const elevationValue = (options.noDataValue && channel[pixel] === options.noDataValue) ? options.terrainMinValue : channel[pixel] * options.multiplier!;
        terrain[i + y] = elevationValue;
        pixel += numOfChannels;
      }
    }

    if (tesselator === 'martini') {
    // backfill bottom border
      for (let i = (width + 1) * width, x = 0; x < width; x++, i++) {
        terrain[i] = terrain[i - width - 1];
      }
      // backfill right border
      for (let i = height, y = 0; y < height + 1; y++, i += height + 1) {
        terrain[i] = terrain[i - 1];
      }
    }

    // getMesh
    const { terrainSkirtHeight } = options;

    let mesh;
    switch (tesselator) {
      case 'martini':
        mesh = getMartiniTileMesh(meshMaxError, width, terrain);

        break;
      case 'delatin':
        mesh = getDelatinTileMesh(meshMaxError, width, height, terrain);
        break;

      default:
        if (width === height && !(height && (width - 1))) {
          // fixme get terrain to separate method
          // terrain = getTerrain(data, width, height, elevationDecoder, 'martini');
          mesh = getMartiniTileMesh(meshMaxError, width, terrain);
        } else {
          // fixme get terrain to separate method
          // terrain = getTerrain(data, width, height, elevationDecoder, 'delatin');
          mesh = getDelatinTileMesh(meshMaxError, width, height, terrain);
        }
        break;
    }

    // Martini
    // Martini

    // Delatin
    // Delatin

    const { vertices } = mesh;
    let { triangles } = mesh;
    let attributes = getMeshAttributes(vertices, terrain, width, height, input.bounds);
    // Compute bounding box before adding skirt so that z values are not skewed
    const boundingBox = getMeshBoundingBox(attributes);

    if (terrainSkirtHeight) {
      const { attributes: newAttributes, triangles: newTriangles } = addSkirt(
        attributes,
        triangles,
        terrainSkirtHeight,
      );
      attributes = newAttributes;
      triangles = newTriangles;
    }

    return {
      // Data return by this loader implementation
      loaderData: {
        header: {},
      },
      header: {
        vertexCount: triangles.length,
        boundingBox,
      },
      mode: 4, // TRIANGLES
      indices: { value: Uint32Array.from(triangles), size: 1 },
      attributes,
    };
  }

  async getBitmap(
    input: string | {
        width: number,
        height: number,
        rasters: any[] },
    options: GeoImageOptions,
  ) {
    // console.time('bitmap-generated-in');
    // const optionsLocal = { ...options };
    const optionsLocal = { ...options };

    let rasters = [];
    let channels: number;
    let width: number;
    let height: number;

    if (typeof (input) === 'string') {
      // TODO not tested
      // input is type of object
      await this.setUrl(input);
      rasters = (await this.data!.readRasters()) as TypedArray[];
      channels = rasters.length;
      width = this.data!.getWidth();
      height = this.data!.getHeight();
    } else {
      rasters = input.rasters;
      channels = rasters.length;
      width = input.width;
      height = input.height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    const imageData: ImageData = c!.createImageData(width, height);

    let r; let g; let b; let
      a;
    const size = width * height * 4;
    // const size = width * height;

    if (!options.noDataValue) {
      console.log('Missing noData value. Raster might be displayed incorrectly.');
    }
    optionsLocal.unidentifiedColor = this.getColorFromChromaType(optionsLocal.unidentifiedColor);
    optionsLocal.nullColor = this.getColorFromChromaType(optionsLocal.nullColor);
    optionsLocal.clippedColor = this.getColorFromChromaType(optionsLocal.clippedColor);
    optionsLocal.color = this.getColorFromChromaType(optionsLocal.color);

    // console.log(rasters[0])
    /* console.log("raster 0 length: " + rasters[0].length)
    console.log("image width: " + width)
    console.log("channels: " + channels)
    console.log("format: " + rasters[0].length / (width * height))
    */

    if (optionsLocal.useChannel == null) {
      if (channels === 1) {
        if (rasters[0].length / (width * height) === 1) {
          const channel = rasters[0];
          // AUTO RANGE
          if (optionsLocal.useAutoRange) {
            optionsLocal.colorScaleValueRange = this.getMinMax(channel, optionsLocal);
            // console.log('data min: ' + optionsLocal.rangeMin + ', max: ' + optionsLocal.rangeMax);
          }
          // SINGLE CHANNEL
          const colorData = this.getColorValue(channel, optionsLocal, size);
          colorData.forEach((value, index) => {
            imageData.data[index] = value;
          });
        }
        // RGB values in one channel
        if (rasters[0].length / (width * height) === 3) {
          // console.log("geoImage: " + "RGB 1 array of length: " + rasters[0].length);
          let pixel = 0;
          for (let idx = 0; idx < size; idx += 4) {
            const rgbColor = [rasters[0][pixel], rasters[0][pixel + 1], rasters[0][pixel + 2]];
            const rgbaColor = this.hasPixelsNoData(rgbColor, optionsLocal.noDataValue)
              ? optionsLocal.nullColor
              : [...rgbColor, Math.floor(optionsLocal.alpha! * 2.55)];
            // eslint-disable-next-line max-len
            [imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2], imageData.data[idx + 3]] = rgbaColor;
            pixel += 3;
          }
        }
        if (rasters[0].length / (width * height) === 4) {
          // console.log("geoImage: " + "RGBA 1 array");
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
    } else if (optionsLocal.useChannel <= optionsLocal.numOfChannels) {
      let channel = rasters[0];
      if (rasters[optionsLocal.useChannel]) {
        channel = rasters[optionsLocal.useChannel];
      }
      // AUTO RANGE
      if (optionsLocal.useAutoRange) {
        optionsLocal.colorScaleValueRange = this.getMinMax(channel, optionsLocal);
        // console.log('data min: ' + optionsLocal.rangeMin + ', max: ' + optionsLocal.rangeMax);
      }
      // const numOfChannels = channel.length / (width * height);
      const colorData = this.getColorValue(channel, optionsLocal, size, optionsLocal.numOfChannels);
      colorData.forEach((value, index) => {
        imageData.data[index] = value;
      });
    } else {
      // if user defined channel does not exist --> return greyscale image
      console.log('Defined channel does not exist, displaying only grey values');
      const defaultColorData = this.getDefaultColor(size, optionsLocal.nullColor);
      defaultColorData.forEach((value, index) => {
        imageData.data[index] = value;
      });
    }
    // console.timeEnd('bitmap-generated-in');

        c!.putImageData(imageData, 0, 0);
        const imageUrl = canvas.toDataURL('image/png');
        // console.log('Bitmap generated.');
        return imageUrl;
  }

  getMinMax(array, options) {
    let maxValue = options.maxValue ? options.maxValue : Number.MIN_VALUE;
    let minValue = options.minValue ? options.minValue : Number.MAX_VALUE;
    for (let idx = 0; idx < array.length; idx += 1) {
      if (options.noDataValue === undefined || array[idx] !== options.noDataValue) {
        if (array[idx] > maxValue) maxValue = array[idx];
        if (array[idx] < minValue) minValue = array[idx];
      }
    }
    return [minValue, maxValue];
  }

  getColorValue(dataArray:[], options:GeoImageOptions, arrayLength:number, numOfChannels = 1) {
    const colorScale = chroma.scale(options.colorScale).domain(options.colorScaleValueRange);
    let pixel:number = options.useChannel === null ? 0 : options.useChannel;
    const colorsArray = new Array(arrayLength);

    // if useColorsBasedOnValues is true
    const dataValues = options.colorsBasedOnValues ? options.colorsBasedOnValues.map(([first]) => first) : undefined;
    const colorValues = options.colorsBasedOnValues ? options.colorsBasedOnValues.map(([, second]) => [...chroma(second).rgb(), Math.floor(options.alpha * 2.55)]) : undefined;

    // if useClasses is true
    const colorClasses = options.useColorClasses ? options.colorClasses.map(([color]) => [...chroma(color).rgb(), Math.floor(options.alpha * 2.55)]) : undefined;
    const dataIntervals = options.useColorClasses ? options.colorClasses.map(([, interval]) => interval) : undefined;
    const dataIntervalBounds = options.useColorClasses ? options.colorClasses.map(([, , bounds], index) => {
      if (bounds !== undefined) return bounds;
      if (index === options.colorClasses.length - 1) return [true, true];
      return [true, false];
    }) : undefined;

    for (let i = 0; i < arrayLength; i += 4) {
      let pixelColor = options.nullColor;
      // FIXME
      // eslint-disable-next-line max-len
      if ((!Number.isNaN(dataArray[pixel])) && (options.noDataValue === undefined || dataArray[pixel] !== options.noDataValue)) {
        if (
          (options.clipLow != null && dataArray[pixel] <= options.clipLow)
                || (options.clipHigh != null && dataArray[pixel] >= options.clipHigh)
        ) {
          pixelColor = options.clippedColor;
        } else {
          if (options.useHeatMap) {
            // FIXME
            // eslint-disable-next-line
            pixelColor = [...colorScale(dataArray[pixel]).rgb(), Math.floor(options.alpha * 2.55)];
          }
          if (options.useColorsBasedOnValues) {
            const index = dataValues.indexOf(dataArray[pixel]);
            if (index > -1) {
              pixelColor = colorValues[index];
            } else pixelColor = options.unidentifiedColor;
          }
          if (options.useColorClasses) {
            const index = this.findClassIndex(dataArray[pixel], dataIntervals, dataIntervalBounds);
            if (index > -1) {
              pixelColor = colorClasses[index];
            } else pixelColor = options.unidentifiedColor;
          }
          if (options.useSingleColor) {
            // FIXME - Is this compatible with chroma.color?
            pixelColor = options.color;
          }
          if (options.useDataForOpacity) {
            // eslint-disable-next-line max-len
            pixelColor[3] = this.scale(dataArray[pixel], options.colorScaleValueRange[0]!, options.colorScaleValueRange.slice(-1)[0]!, 0, 255);
          }
        }
      }
      // FIXME
      // eslint-disable-next-line
      [colorsArray[i], colorsArray[i + 1], colorsArray[i + 2], colorsArray[i + 3]] = pixelColor;

      pixel += numOfChannels;
    }
    return colorsArray;
  }

  findClassIndex(number, intervals, bounds) {
    // returns index of the first class to which the number belongs
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

  getDefaultColor(size, nullColor) {
    const colorsArray = new Array(size);
    for (let i = 0; i < size; i += 4) {
      [colorsArray[i], colorsArray[i + 1], colorsArray[i + 2], colorsArray[i + 3]] = nullColor;
    }
    return colorsArray;
  }

  getColorFromChromaType(colorDefinition) {
    if (!Array.isArray(colorDefinition) || colorDefinition.length !== 4) {
      return [...chroma(colorDefinition).rgb(), 255];
    }
    return colorDefinition;
  }

  hasPixelsNoData(pixels, noDataValue) {
    return noDataValue !== undefined && pixels.every((pixel) => pixel === noDataValue);
  }
}

//
//
//

/**
 * Get Martini generated vertices and triangles
 *
 * @param {number} meshMaxError threshold for simplifying mesh
 * @param {number} width width of the input data
 * @param {number[] | Float32Array} terrain elevation data
 * @returns {{vertices: Uint16Array, triangles: Uint32Array}} vertices and triangles data
 */
function getMartiniTileMesh(meshMaxError, width, terrain) {
  const gridSize = width + 1;
  const martini = new Martini(gridSize);
  const tile = martini.createTile(terrain);
  const { vertices, triangles } = tile.getMesh(meshMaxError);

  return { vertices, triangles };
}

function getMeshAttributes(
  vertices,
  terrain: Uint8Array,
  width: number,
  height: number,
  bounds: number[],
) {
  const gridSize = width + 1;
  const numOfVerticies = vertices.length / 2;
  // vec3. x, y in pixels, z in meters
  const positions = new Float32Array(numOfVerticies * 3);
  // vec2. 1 to 1 relationship with position. represents the uv on the texture image. 0,0 to 1,1.
  const texCoords = new Float32Array(numOfVerticies * 2);

  const [minX, minY, maxX, maxY] = bounds || [0, 0, width, height];
  const xScale = (maxX - minX) / width;
  const yScale = (maxY - minY) / height;

  for (let i = 0; i < numOfVerticies; i++) {
    const x = vertices[i * 2];
    const y = vertices[i * 2 + 1];
    const pixelIdx = y * gridSize + x;

    positions[3 * i + 0] = x * xScale + minX;
    positions[3 * i + 1] = -y * yScale + maxY;
    positions[3 * i + 2] = terrain[pixelIdx];

    texCoords[2 * i + 0] = x / width;
    texCoords[2 * i + 1] = y / height;
  }

  return {
    POSITION: { value: positions, size: 3 },
    TEXCOORD_0: { value: texCoords, size: 2 },
    // NORMAL: {}, - optional, but creates the high poly look with lighting
  };
}

/**
 * Get Delatin generated vertices and triangles
 *
 * @param {number} meshMaxError threshold for simplifying mesh
 * @param {number} width width of the input data array
 * @param {number} height height of the input data array
 * @param {number[] | Float32Array} terrain elevation data
 * @returns {{vertices: number[], triangles: number[]}} vertices and triangles data
 */
function getDelatinTileMesh(meshMaxError, width, height, terrain) {
  const tin = new Delatin(terrain, width + 1, height + 1);
  tin.run(meshMaxError);
  // @ts-expect-error
  const { coords, triangles } = tin;
  const vertices = coords;
  return { vertices, triangles };
}
