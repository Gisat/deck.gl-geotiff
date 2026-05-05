import type { TypedArray, GeoImageOptions } from '../types';

export default class TileReader {
  private options: GeoImageOptions;
  private tileSize: number;

  constructor(params: {
    options: GeoImageOptions;
    tileSize: number;
  }) {
    this.options = params.options;
    this.tileSize = params.tileSize;
  }

  createEmptyTile(size?: number) {
    const s = size || this.tileSize;
    const channels = this.options.numOfChannels || 1;
    const totalSize = s * s * channels;

    const tileData = new Float32Array(totalSize);

    if (this.options.noDataValue !== undefined) {
      tileData.fill(this.options.noDataValue as number);
    }

    return tileData;
  }

  createTileBuffer(dataType: string, tileSize: number, multiplier = 1): TypedArray {
    const length = tileSize * tileSize * multiplier;
    switch (dataType) {
      case 'UInt8':
        return new Uint8Array(length);
      case 'Int8':
        return new Int8Array(length);
      case 'UInt16':
        return new Uint16Array(length);
      case 'Int16':
        return new Int16Array(length);
      case 'UInt32':
        return new Uint32Array(length);
      case 'Int32':
        return new Int32Array(length);
      case 'Float32':
        return new Float32Array(length);
      case 'Float64':
        return new Float64Array(length);
      default:
        // eslint-disable-next-line no-console
        console.warn(`Unsupported data type: ${dataType}, defaulting to Float32`);
        return new Float32Array(length);
    }
  }
}
