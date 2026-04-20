import { fromArrayBuffer, GeoTIFFImage, TypedArray } from 'geotiff';
import { GeoImageOptions, DefaultGeoImageOptions, Bounds, TileResult } from './types';
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
        bounds: Bounds,
        cellSizeMeters?: number,
        },
    options: GeoImageOptions,
    meshMaxError: number,
  ): Promise<TileResult | null> {
    const mergedOptions = GeoImage.resolveVisualizationMode(
      { ...DefaultGeoImageOptions, ...options },
      options,
    );

    switch (mergedOptions.type) {
      case 'image':
        return this.getBitmap(input, mergedOptions);
      case 'terrain':
        return this.getHeightmap(input, mergedOptions, meshMaxError);
      default:
        return null;
    }
  }

  /**
   * Resolves the active visualization (coloring) mode after merging user options with defaults.
   *
   * Solves three key issues:
   *
   * 1. **Mutual exclusivity**: `DefaultGeoImageOptions` sets `useHeatMap: true`. If a user
   *    explicitly enables a coloring mode without explicitly setting `useHeatMap: false`,
   *    enforce that only the explicitly-enabled modes are active (all others forced to false).
   *    This prevents the default `useHeatMap: true` from interfering with user-chosen modes.
   *
   * 2. **Bitmap default**: for `type === 'image'` with no user-specified coloring mode,
   *    keep `useHeatMap: true` from defaults. This provides sensible data-driven visualization.
   *
   * 3. **Terrain default**: for `type === 'terrain'` with no user-specified coloring mode and
   *    no kernel-texture mode (`useSwissRelief` / `useSlope` / `useHillshade`), enable
   *    `useSingleColor` with `color = terrainColor`. This renders the mesh in the documented
   *    default colour (grey) without a data-driven texture overlay. When a kernel mode IS
   *    present but no coloring mode is specified, keep `useHeatMap: true` so the kernel output
   *    is still colourised.
   */
  static resolveVisualizationMode(
    mergedOptions: GeoImageOptions,
    userOptions: GeoImageOptions,
  ): GeoImageOptions {
    const coloringModes = ['useSingleColor', 'useColorClasses', 'useColorsBasedOnValues', 'useHeatMap'] as const;

    const userExplicitColoringModes = coloringModes.filter(m => userOptions[m] === true);

    const resolved = { ...mergedOptions };

    if (userExplicitColoringModes.length > 0) {
      // Enforce mutual exclusivity: disable all coloring modes, then enable only those
      // explicitly set by the user. This prevents the default useHeatMap from interfering.
      for (const mode of coloringModes) {
        resolved[mode] = false;
      }
      for (const mode of userExplicitColoringModes) {
        resolved[mode] = true;
      }
    } else if (mergedOptions.type === 'terrain') {
      // Terrain with no explicit coloring mode.
      const hasKernelMode = userOptions.useSwissRelief || userOptions.useSlope || userOptions.useHillshade;
      if (!hasKernelMode) {
        // No kernel mode: enable useSingleColor with terrainColor as the default.
        // This renders the mesh in the documented colour without a data-driven texture.
        resolved.useHeatMap = false;
        resolved.useSingleColor = true;
        resolved.color = mergedOptions.terrainColor;
      }
      // When a kernel mode is present without an explicit coloring mode, keep
      // useHeatMap: true from defaults so the kernel output is colourised.
    }
    // For 'image' with no explicit coloring mode: keep useHeatMap: true from DefaultGeoImageOptions.

    return resolved;
  }

   // GetHeightmap uses only "useChannel" and "multiplier" options
  async getHeightmap(
    input: string | {
        bounds: Bounds,
        width: number,
        height: number,
        rasters: any[],
        cellSizeMeters?: number,
        },
    options: GeoImageOptions,
    meshMaxError: number,
  ): Promise<TileResult> {
    let rasters = [];
    let width: number;
    let height: number;
    let bounds: Bounds;
    let cellSizeMeters: number | undefined;

    if (typeof (input) === 'string') {
      // TODO not tested
      // input is type of object
      await this.setUrl(input);

      rasters = (await this.data!.readRasters()) as TypedArray[];
      width = this.data!.getWidth();
      height = this.data!.getHeight();
      bounds = this.data!.getBoundingBox() as Bounds;
    } else {
      rasters = input.rasters;
      width = input.width;
      height = input.height;
      bounds = input.bounds;
      cellSizeMeters = input.cellSizeMeters;
    }

    // Delegate to TerrainGenerator
    return await TerrainGenerator.generate({ width, height, rasters, bounds, cellSizeMeters }, options, meshMaxError);
  }

  async getBitmap(
    input: string | {
        width: number,
        height: number,
        rasters: any[],
        bounds?: Bounds,
        cellSizeMeters?: number },
    options: GeoImageOptions,
  ): Promise<TileResult> {
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
