// types.ts
import chroma from 'chroma-js';

export type ChromaColorInput = string | number[] | chroma.Color;
import type { MeshAttributes } from '@loaders.gl/schema';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export type ClampToTerrainOptions = {
    terrainDrawMode?: string
}

export type GeoImageOptions = {
    // --- Shared / Data ---
    type: 'image' | 'terrain',
    /**
     * Block size in bytes for the internal HTTP range-request cache (BlockedSource).
     * Increasing this reduces the number of HTTP requests at the cost of fetching more data per request.
     * Set to 0 to disable block caching entirely (not recommended for most COG servers).
     * Defaults to 65536 (64 KB) — the geotiff.js BlockedSource default.
     */
    blockSize?: number,
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
    color?: ChromaColorInput,
    colorScale?: ChromaColorInput[],
    colorScaleValueRange?: number[],
    colorsBasedOnValues?: Array<[number, ChromaColorInput]>,
    colorClasses?: Array<[ChromaColorInput, [number, number], [boolean?, boolean?]?]>,
    alpha?: number,
    nullColor?: ChromaColorInput,
    unidentifiedColor?: ChromaColorInput,
    clippedColor?: ChromaColorInput,
    clampToTerrain?: ClampToTerrainOptions | boolean, // terrainDrawMode: 'drape',

    // --- Kernel-specific (terrain only + swiss relief) ---
    useSlope?: boolean,
    useHillshade?: boolean,
    hillshadeAzimuth?: number,
    hillshadeAltitude?: number,
    zFactor?: number,
    useSwissRelief?: boolean,
    swissSlopeWeight?: number,
}

export const DefaultGeoImageOptions: GeoImageOptions = {
    // --- Shared / Data ---
    type: 'image',
    blockSize: 65536,
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
    //     colorScale: [
    //     [75, 120, 90],    // Brightened forest green
    //     [100, 145, 100],  // Soft meadow green
    //     [130, 170, 110],  // Bright moss
    //     [185, 210, 145],  // Sunny sage
    //     [235, 235, 185],  // Pale primrose (transitional)
    //     [225, 195, 160],  // Sand / light terracotta (matches slope)
    //     [195, 160, 130],  // Warm clay brown
    //     [170, 155, 150],  // Warm slate grey
    //     [245, 245, 240],  // Bright mist
    //     [255, 255, 255],  // Pure peak white
    // ],
    // colorScaleValueRange: [0, 6500],
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
    useSwissRelief: false,
    swissSlopeWeight: 0.5,
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
    /** Optional: grayscale or color bitmap for Swiss relief or other overlays */
    bitmap?: Uint8ClampedArray | ImageBitmap;
}
