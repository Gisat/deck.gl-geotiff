// types.ts
import chroma from 'chroma-js';
import type { MeshAttributes } from '@loaders.gl/schema';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export type ClampToTerrainOptions = {
    terrainDrawMode?: string
}

export type GeoImageOptions = {
    type: 'image' | 'terrain',
    tesselator?: 'martini' | 'delatin',
    format?: 'uint8' | 'uint16' | 'uint32' |'int8' | 'int16' | 'int32' | 'float32' | 'float64'
    useHeatMap?: boolean,
    useColorsBasedOnValues? : boolean,
    useColorClasses? : boolean,
    useAutoRange?: boolean,
    useDataForOpacity?: boolean,
    /** 1-based index of the channel to visualize (e.g. 1 for the first channel). */
    useChannel?: number | null, // Note: 0 is not a valid channel; this is enforced at runtime.
    /** 0-based index of the channel to visualize (e.g. 0 for the first channel). Alternative to useChannel. */
    useChannelIndex?: number | null,
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
    tesselator: 'martini',
    format: undefined,
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
    colorsBasedOnValues: undefined,
    colorClasses: undefined,
    alpha: 100,
    useChannel: null,
    useChannelIndex: null,
    noDataValue: undefined,
    numOfChannels: undefined,
    nullColor: [0, 0, 0, 0],
    unidentifiedColor: [0, 0, 0, 0],
    clippedColor: [0, 0, 0, 0],
    terrainColor: [133, 133, 133, 255],
    terrainSkirtHeight: 100,
    // Default fallback for invalid/nodata elevations. Should be configured based on the dataset's actual range.
    terrainMinValue: 0,
    planarConfig: undefined,
};

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export type TerrainMesh = {
    loaderData?: Record<string, unknown>;
    header?: { vertexCount: number; boundingBox?: [number[], number[]] };
    mode: number;
    indices?: { value: Uint32Array; size: number };
    attributes: MeshAttributes;
};

export interface TileResult {
    map: ImageBitmap | TerrainMesh;
    raw: TypedArray | null;
    width: number;
    height: number;
}
