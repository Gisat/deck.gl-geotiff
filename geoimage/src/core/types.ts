// types.ts
import chroma from 'chroma-js';

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
    useChannel?: Exclude<number, 0> | null,
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
    useChannelIndex: null,
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
