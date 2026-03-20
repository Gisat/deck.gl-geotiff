// types.ts
import chroma from 'chroma-js';
import type { MeshAttributes } from '@loaders.gl/schema';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export type ClampToTerrainOptions = {
    terrainDrawMode?: string
}

export type GeoImageOptions = {
    // --- Shared / Data ---
    type: 'image' | 'terrain',
    format?: 'uint8' | 'uint16' | 'uint32' |'int8' | 'int16' | 'int32' | 'float32' | 'float64',
    /** 1-based index of the channel to visualize (e.g. 1 for the first channel). */
    useChannel?: number | null, // Note: 0 is not a valid channel; this is enforced at runtime.
    /** 0-based index of the channel to visualize (e.g. 0 for the first channel). Alternative to useChannel. */
    useChannelIndex?: number | null,
    noDataValue?: number,
    multiplier?: number,
    numOfChannels?: number,
    planarConfig?: number,

    // --- Mesh generation (terrain only) ---
    tesselator?: 'martini' | 'delatin',
    terrainColor?: Array<number> | chroma.Color,
    terrainSkirtHeight?: number,
    terrainMinValue?: number,

    // --- Texture / Visualization ---
    useHeatMap?: boolean,
    useColorsBasedOnValues? : boolean,
    useColorClasses? : boolean,
    useAutoRange?: boolean,
    useDataForOpacity?: boolean,
    useSingleColor?: boolean,
    blurredTexture? : boolean,
    clipLow?: number | null,
    clipHigh?: number | null,
    color?: Array<number> | chroma.Color,
    colorScale?: Array<string> | Array<chroma.Color>,
    colorScaleValueRange?: number[],
    colorsBasedOnValues? : [number|undefined, chroma.Color][],
    colorClasses? : [chroma.Color, [number, number], [boolean, boolean]?][],
    alpha?: number,
    nullColor?: Array<number> | chroma.Color,
    unidentifiedColor?: Array<number> | chroma.Color,
    clippedColor?: Array<number> | chroma.Color,
    clampToTerrain?: ClampToTerrainOptions | boolean, // terrainDrawMode: 'drape',

    // --- Kernel-specific (terrain only) ---
    useSlope?: boolean,
    useHillshade?: boolean,
    hillshadeAzimuth?: number,
    hillshadeAltitude?: number,
    zFactor?: number,
}

export const DefaultGeoImageOptions: GeoImageOptions = {
    // --- Shared / Data ---
    type: 'image',
    format: undefined,
    useChannel: null,
    useChannelIndex: null,
    noDataValue: undefined,
    multiplier: 1.0,
    numOfChannels: undefined,
    planarConfig: undefined,

    // --- Mesh generation (terrain only) ---
    tesselator: 'martini',
    terrainColor: [133, 133, 133, 255],
    terrainSkirtHeight: 100,
    // Default fallback for invalid/nodata elevations. Should be configured based on the dataset's actual range.
    terrainMinValue: 0,

    // --- Texture / Visualization ---
    useHeatMap: true,
    useColorsBasedOnValues: false,
    useColorClasses: false,
    useAutoRange: false,
    useDataForOpacity: false,
    useSingleColor: false,
    blurredTexture: true,
    clipLow: null,
    clipHigh: null,
    color: [255, 0, 255, 255],
    colorScale: chroma.brewer.YlOrRd,
    colorScaleValueRange: [0, 255],
    colorsBasedOnValues: undefined,
    colorClasses: undefined,
    alpha: 100,
    nullColor: [0, 0, 0, 0],
    unidentifiedColor: [0, 0, 0, 0],
    clippedColor: [0, 0, 0, 0],

    // --- Kernel-specific (terrain only) ---
    useSlope: false,
    useHillshade: false,
    hillshadeAzimuth: 315,
    hillshadeAltitude: 45,
    zFactor: 1,
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
    rawDerived?: TypedArray | null;
    width: number;
    height: number;
    texture?: ImageBitmap;
}
