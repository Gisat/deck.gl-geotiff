import { fromArrayBuffer, GeoTIFFImage, TypedArray } from 'geotiff';
import { GeoImageOptions, DefaultGeoImageOptions, Bounds } from './types';
import { TerrainGenerator } from './lib/TerrainGenerator';
import { BitmapGenerator } from './lib/BitmapGenerator';

// Re-export types for backward compatibility
export * from './types';

export default class GeoImage {
  data: GeoTIFFImage | undefined;

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

    // Delegate to TerrainGenerator
    return TerrainGenerator.generate({ width, height, rasters, bounds: (input as any).bounds }, options, meshMaxError);
  }

  async getBitmap(
    input: string | {
        width: number,
        height: number,
        rasters: any[] },
    options: GeoImageOptions,
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

    // Delegate to BitmapGenerator
    return BitmapGenerator.generate({ width, height, rasters }, options);
  }
}
