import Martini from '@mapbox/martini';
import { getMeshBoundingBox } from '@loaders.gl/schema';
import Delatin from '../delatin';
import { addSkirt } from '../helpers/skirt';
import { GeoImageOptions, Bounds, TypedArray, TileResult } from '../types';
import { BitmapGenerator } from './BitmapGenerator';
import { KernelGenerator } from './KernelGenerator';

export class TerrainGenerator {
  static async generate(
    input: { width: number; height: number; rasters: TypedArray[] ; bounds: Bounds; cellSizeMeters?: number },
    options: GeoImageOptions,
    meshMaxError: number
  ): Promise<TileResult> {
    const { width, height } = input;
    const isKernel = width === 258;

    // 1. Compute Terrain Data (Extract Elevation)
    const terrain = this.computeTerrainData(input, options);

    // For kernel tiles, the mesh uses the inner 257×257 sub-grid (rows 1–257, cols 1–257)
    // so that row 0 / col 0 (kernel padding) is dropped while the bottom/right stitching
    // overlap is preserved.
    const meshTerrain = isKernel ? this.extractMeshRaster(terrain) : terrain;
    const meshWidth = isKernel ? 257 : width;
    const meshHeight = isKernel ? 257 : height;

    // 2. Tesselate (Generate Mesh)
    const { terrainSkirtHeight } = options;

    let mesh;
    switch (options.tesselator) {
      case 'martini':
        mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
        break;
      case 'delatin':
        mesh = this.getDelatinTileMesh(meshMaxError, meshWidth, meshHeight, meshTerrain);
        break;

      default:
        // Intentional: default to Martini for any unspecified or unrecognized tesselator.
        mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
        break;
    }

    const { vertices } = mesh;
    let { triangles } = mesh;
    let attributes = this.getMeshAttributes(vertices, meshTerrain, meshWidth, meshHeight, input.bounds);
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

    const map = {
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

    // For kernel tiles, raw holds the 257×257 mesh elevation (same as non-kernel).
    // gridWidth/gridHeight reflect the mesh dimensions.
    const gridWidth = meshWidth === 257 ? 257 : meshWidth + 1;
    const gridHeight = meshHeight === 257 ? 257 : meshHeight + 1;

    const tileResult: TileResult = {
      map,
      raw: meshTerrain,
      width: gridWidth,
      height: gridHeight,
    };

    // 3. Kernel path: compute slope or hillshade, store as rawDerived, generate texture
    if (isKernel && (options.useSlope || options.useHillshade)) {
      // Use pre-computed geographic cellSize (meters/pixel) from tile indices.
      // Falls back to bounds-derived estimate if not provided.
      const cellSize = input.cellSizeMeters ?? ((input.bounds[2] - input.bounds[0]) / 256);
      const zFactor = options.zFactor ?? 1;

      if (options.useSlope && options.useHillshade) {
        console.warn(
          '[TerrainGenerator] useSlope and useHillshade are mutually exclusive; useSlope takes precedence.'
        );
      }

      // Build a separate raster for kernel computation that preserves noData samples.
      const kernelTerrain = new Float32Array(terrain.length);
      const sourceRaster = input.rasters[0];
      const noData = options.noDataValue;
      if (
        noData !== undefined &&
        noData !== null &&
        sourceRaster &&
        sourceRaster.length === terrain.length
      ) {
        for (let i = 0; i < terrain.length; i++) {
          // If the source raster marks this sample as noData, keep it as noData for the kernel.
          // Otherwise, use the processed terrain elevation value.
          // eslint-disable-next-line eqeqeq
          kernelTerrain[i] = (sourceRaster as any)[i] == noData ? (noData as number) : terrain[i];
        }
      } else {
        // Fallback: no usable noData metadata or mismatched lengths; mirror existing behavior.
        kernelTerrain.set(terrain);
      }
      let kernelOutput: Float32Array;
      if (options.useSlope) {
        kernelOutput = KernelGenerator.calculateSlope(kernelTerrain, cellSize, zFactor, options.noDataValue);
      } else {
        kernelOutput = KernelGenerator.calculateHillshade(
          kernelTerrain,
          cellSize,
          options.hillshadeAzimuth ?? 315,
          options.hillshadeAltitude ?? 45,
          zFactor,
          options.noDataValue,
        );
      }

      tileResult.rawDerived = kernelOutput;

      if (this.hasVisualizationOptions(options)) {
        const bitmapResult = await BitmapGenerator.generate(
          { width: 256, height: 256, rasters: [kernelOutput] },
          { ...options, type: 'image' }
        );
        tileResult.texture = bitmapResult.map as ImageBitmap;
      }
    } else if (this.hasVisualizationOptions(options)) {
      // 4. Non-kernel path: crop 257→256, generate texture from elevation
      const cropped = this.cropRaster(meshTerrain, gridWidth, gridHeight, 256, 256);
      const bitmapResult = await BitmapGenerator.generate(
        { width: 256, height: 256, rasters: [cropped] },
        { ...options, type: 'image' }
      );
      tileResult.texture = bitmapResult.map as ImageBitmap;
    }

    return tileResult;
  }

  /** Extracts rows 1–257, cols 1–257 from a 258×258 terrain array → 257×257 for mesh generation. */
  private static extractMeshRaster(terrain258: Float32Array): Float32Array {
    const MESH = 257;
    const IN = 258;
    const out = new Float32Array(MESH * MESH);
    for (let r = 0; r < MESH; r++) {
      for (let c = 0; c < MESH; c++) {
        out[r * MESH + c] = terrain258[(r + 1) * IN + (c + 1)];
      }
    }
    return out;
  }

  private static hasVisualizationOptions(options: GeoImageOptions): boolean {    return !!(
      options.useHeatMap ||
      options.useSingleColor ||
      options.useColorsBasedOnValues ||
      options.useColorClasses
    );
  }

  private static cropRaster(
    src: Float32Array,
    srcWidth: number,
    _srcHeight: number,
    dstWidth: number,
    dstHeight: number
  ): Float32Array {
    const out = new Float32Array(dstWidth * dstHeight);
    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        out[y * dstWidth + x] = src[y * srcWidth + x];
      }
    }
    return out;
  }

  /**
   * Decodes raw raster data into a Float32Array of elevation values.
   * Handles channel selection, value scaling, data type validation, and border stitching.
   */
  private static computeTerrainData(
    input: { width: number; height: number; rasters: TypedArray[] },
    options: GeoImageOptions
  ): Float32Array {
    const { width, height, rasters } = input;
    const optionsLocal = { ...options };

    optionsLocal.useChannelIndex ??= optionsLocal.useChannel == null ? null : optionsLocal.useChannel - 1;

    // Detect if data is planar (multiple arrays) or interleaved (one array with multiple samples per pixel)
    const isPlanar = rasters.length > 1;
    const channel = isPlanar
      ? (rasters[optionsLocal.useChannelIndex ?? 0] ?? rasters[0])
      : rasters[0];

    const isKernel = width === 258;
    const isStitched = width === 257;
    // Kernel: 258×258 flat array. Stitched: 257×257. Default: (width+1)×(height+1) with backfill.
    const outWidth = isKernel ? 258 : (isStitched ? 257 : width + 1);
    const outHeight = isKernel ? 258 : (isStitched ? 257 : height + 1);
    const terrain = new Float32Array(outWidth * outHeight);

    const samplesPerPixel = isPlanar ? 1 : (channel.length / (width * height));

    // If planar, we already selected the correct array, so start at index 0.
    // If interleaved, start at the index of the desired channel.
    let pixel: number = isPlanar ? 0 : (optionsLocal.useChannelIndex ?? 0);

    const fallbackValue = options.terrainMinValue ?? 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const multiplier = options.multiplier ?? 1;
        let elevationValue =
          (options.noDataValue !== undefined &&
            options.noDataValue !== null &&
            channel[pixel] === options.noDataValue)
            ? fallbackValue
            : channel[pixel] * multiplier;

        // Validate that the elevation value is within the valid range for Float32.
        // Extreme values (like -1.79e308) can become -Infinity when cast, causing WebGL errors.
        if (Number.isNaN(elevationValue) || elevationValue < -3.4e38 || elevationValue > 3.4e38) {
          elevationValue = fallbackValue;
        }

        // Kernel/Stitched: fill linearly. Default (256): fill with stride for padding.
        const index = (isKernel || isStitched) ? (y * width + x) : (y * (width + 1) + x);
        terrain[index] = elevationValue;
        pixel += samplesPerPixel;
      }
    }

    if (!isKernel && !isStitched) {
      // backfill bottom border
      for (let i = (width + 1) * width, x = 0; x < width; x++, i++) {
        terrain[i] = terrain[i - width - 1];
      }
      // backfill right border
      for (let i = height, y = 0; y < height + 1; y++, i += height + 1) {
        terrain[i] = terrain[i - 1];
      }
    }

    return terrain;
  }

  static getMartiniTileMesh(meshMaxError: number, width: number, terrain: Float32Array) {
    const gridSize = width === 257 ? 257 : width + 1;
    const martini = new Martini(gridSize);
    const tile = martini.createTile(terrain);
    const { vertices, triangles } = tile.getMesh(meshMaxError);

    return { vertices, triangles };
  }

  static getDelatinTileMesh(meshMaxError: number, width: number, height: number, terrain: Float32Array) {
    const widthPlus = width === 257 ? 257 : width + 1;
    const heightPlus = height === 257 ? 257 : height + 1;
    const tin = new Delatin(terrain, widthPlus, heightPlus);
    tin.run(meshMaxError);
    // @ts-expect-error: Delatin instance properties 'coords' and 'triangles' are not explicitly typed in the library port
    const { coords, triangles } = tin;
    const vertices = coords;
    return { vertices, triangles };
  }

  static getMeshAttributes(
    vertices: Uint16Array | Uint32Array | Float32Array | Float64Array,
    terrain: Float32Array,
    width: number,
    height: number,
    bounds: Bounds | number[],
  ) {
    const gridSize = width === 257 ? 257 : width + 1;
    const numOfVerticies = vertices.length / 2;
    // vec3. x, y in pixels, z in meters
    const positions = new Float32Array(numOfVerticies * 3);
    // vec2. 1 to 1 relationship with position. represents the uv on the texture image. 0,0 to 1,1.
    const texCoords = new Float32Array(numOfVerticies * 2);

    const [minX, minY, maxX, maxY] = bounds || [0, 0, width, height];
    // If stitched (257), the spatial extent covers 0..256 pixels, so we divide by 256.
    // If standard (256), the spatial extent covers 0..256 pixels (with backfill), so we divide by 256.
    const effectiveWidth = width === 257 ? width - 1 : width;
    const effectiveHeight = height === 257 ? height - 1 : height;

    const xScale = (maxX - minX) / effectiveWidth;
    const yScale = (maxY - minY) / effectiveHeight;

    for (let i = 0; i < numOfVerticies; i++) {
      const x = vertices[i * 2];
      const y = vertices[i * 2 + 1];
      const pixelIdx = y * gridSize + x;

      positions[3 * i] = x * xScale + minX;
      positions[3 * i + 1] = -y * yScale + maxY;
      positions[3 * i + 2] = terrain[pixelIdx];

      texCoords[2 * i] = x / effectiveWidth;
      texCoords[2 * i + 1] = y / effectiveHeight;
    }

    return {
      POSITION: { value: positions, size: 3 },
      TEXCOORD_0: { value: texCoords, size: 2 },
      // NORMAL: {}, - optional, but creates the high poly look with lighting
    };
  }
}
