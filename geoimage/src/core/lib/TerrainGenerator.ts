import Martini from '@mapbox/martini';
import { getMeshBoundingBox } from '@loaders.gl/schema';
import Delatin from '../delatin';
import { addSkirt } from '../helpers/skirt';
import { GeoImageOptions, Bounds, TypedArray, TileResult } from '../types';
import { BitmapGenerator } from './BitmapGenerator';
import { KernelGenerator } from './KernelGenerator';
import { ReliefCompositor } from './ReliefCompositor';
import { isF32NoData, isStitchedGrid } from './numberUtils';

export class TerrainGenerator {
  private static isKernelMode(options: GeoImageOptions): boolean {
    return !!(options.useSlope || options.useHillshade || options.useSwissRelief);
  }

  static async generate(
    input: { width: number; height: number; rasters: TypedArray[] ; bounds: Bounds; cellSizeMeters?: number },
    options: GeoImageOptions,
    meshMaxError: number,
    workerPool?: any, // TerrainWorkerPool (optional for flexibility)
    signal?: AbortSignal,
  ): Promise<TileResult> {
    const { width, height } = input;
    const isKernel = TerrainGenerator.isKernelMode(options);
    const baseSize = isKernel ? width - 2 : width - 1;

    // 1. Compute Terrain Data (Extract Elevation)
    const terrain = this.computeTerrainData(input, options);

    // For kernel tiles, the mesh uses the inner sub-grid (rows 1–meshWidth, cols 1–meshWidth)
    // so that row 0 / col 0 (kernel padding) is dropped while the bottom/right stitching
    // overlap is preserved.
    let meshTerrain = isKernel ? this.extractMeshRaster(terrain, width) : terrain;
    const meshWidth = isKernel ? width - 1 : width;
    const meshHeight = isKernel ? height - 1 : height;

    // 2. Tesselate (Generate Mesh)
    const { terrainSkirtHeight, verticalExaggeration = 1.0 } = options;

    let mesh: { vertices: Uint16Array; triangles: Uint32Array };
    let meshTerrainForAttributes: Float32Array; // ← Will hold terrain for getMeshAttributes()

    if (workerPool) {
      // ✅ NEW: Offload to Web Worker with ZERO-COPY ROUNDTRIP
      // Transfer meshTerrain to worker; worker transfers it back alongside mesh
      // This avoids meshTerrain.slice() allocation on main thread
      const result = await workerPool.computeMesh({
        terrain: meshTerrain, // ← Transferred to worker (detached here)
        meshMaxError,
        tesselator: options.tesselator || 'martini',
        width: meshWidth,
        height: meshHeight,
        signal, // ← Thread cancellation signal to worker
      });

      mesh = { vertices: result.vertices, triangles: result.triangles };
      meshTerrainForAttributes = result.terrain; // ← Transferred back from worker
      meshTerrain = result.terrain; // ← Reassign for downstream use (tileResult.raw, etc.)
    } else {
      // ❌ FALLBACK: Synchronous (old behavior, kept for safety)
      switch (options.tesselator) {
        case 'martini':
          mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
          break;
        case 'delatin':
          mesh = this.getDelatinTileMesh(meshMaxError, meshWidth, meshHeight, meshTerrain);
          break;
        default:
          mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
          break;
      }
      meshTerrainForAttributes = meshTerrain; // ← Use original
    }

    const { vertices } = mesh;
    let { triangles } = mesh;
    let attributes = this.getMeshAttributes(vertices, meshTerrainForAttributes, meshWidth, meshHeight, input.bounds, verticalExaggeration);
    // Compute bounding box before adding skirt so that z values are not skewed
    const boundingBox = getMeshBoundingBox(attributes);

    if (terrainSkirtHeight) {
      const scaledSkirtHeight = terrainSkirtHeight * verticalExaggeration;
      // Skip skirt generation if scaled height is zero (e.g., verticalExaggeration = 0)
      if (scaledSkirtHeight > 0) {
        const { attributes: newAttributes, triangles: newTriangles } = addSkirt(
          attributes,
          triangles,
          scaledSkirtHeight,
        );
        attributes = newAttributes;
        triangles = newTriangles;
      }
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

    // For kernel tiles, raw holds the inner elevation grid (same as non-kernel).
    // gridWidth/gridHeight reflect the mesh dimensions.
    const gridWidth = meshWidth;
    const gridHeight = meshHeight;

    const tileResult: TileResult = {
      map,
      raw: meshTerrain,
      width: gridWidth,
      height: gridHeight,
    };

    // 3. Kernel path: compute slope or hillshade, store as rawDerived, generate texture
    const shouldSkipTexture = !!options.skipTexture;

    if (isKernel && options.useSwissRelief) {
      const cellSize = input.cellSizeMeters ?? ((input.bounds[2] - input.bounds[0]) / baseSize);
      
      // Build a separate raster for kernel computation that preserves noData samples.
      const kernelTerrain = this.preserveNoDataForKernel(
        terrain,
        input.rasters[0],
        options.noDataValue
      );

      // Compose Swiss relief using ReliefCompositor
      const swissReliefResult = ReliefCompositor.composeSwissRelief(
        kernelTerrain,
        options,
        cellSize,
        baseSize,
        baseSize,
      );
      tileResult.rawDerived = swissReliefResult;

      if (!shouldSkipTexture && this.hasVisualizationOptions(options)) {
        const cropped = this.cropRaster(meshTerrain, gridWidth, gridHeight, baseSize, baseSize);
        const bitmapResult = await BitmapGenerator.generate(
          { width: baseSize, height: baseSize, rasters: [cropped, swissReliefResult] },
          { ...options, type: 'image' }
        );
        tileResult.texture = bitmapResult.map as ImageBitmap;
      }
    }
    else if (isKernel && (options.useSlope || options.useHillshade)) {
      // Use pre-computed geographic cellSize (meters/pixel) from tile indices.
      // Falls back to bounds-derived estimate if not provided.
      const cellSize = input.cellSizeMeters ?? ((input.bounds[2] - input.bounds[0]) / baseSize);
      const zFactor = options.zFactor ?? 1;

      if (options.useSlope && options.useHillshade) {
        // eslint-disable-next-line no-console
        console.warn(
          '[TerrainGenerator] useSlope and useHillshade are mutually exclusive; useSlope takes precedence.'
        );
      }

      // Build a separate raster for kernel computation that preserves noData samples.
      const kernelTerrain = this.preserveNoDataForKernel(
        terrain,
        input.rasters[0],
        options.noDataValue
      );
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

      if (!shouldSkipTexture && this.hasVisualizationOptions(options)) {
        const bitmapResult = await BitmapGenerator.generate(
          { width: baseSize, height: baseSize, rasters: [kernelOutput] },
          { ...options, type: 'image' }
        );
        tileResult.texture = bitmapResult.map as ImageBitmap;
      }
    } else if (!shouldSkipTexture && this.hasVisualizationOptions(options)) {
      // 4. Non-kernel path: build texture raster from the ORIGINAL source data, preserving
      // noData sentinels so BitmapGenerator renders those pixels as transparent (via nullColor).
      // meshTerrain substitutes noData with terrainMinValue for mesh stability — we intentionally
      // avoid using it for texture generation to prevent fill values being coloured.
      const multiplier = options.multiplier ?? 1;
      const noDataValue = options.noDataValue;

      const srcRaster = input.rasters[0] as TypedArray | any;
      const srcWidth = input.width;
      const srcHeight = input.height;

      // Determine samplesPerPixel for interleaved buffers (fallback to 1)
      const samplesPerPixel = Math.max(1, Math.round((srcRaster.length) / (srcWidth * srcHeight)));

      const channelIndex = options.useChannelIndex ?? (options.useChannel != null ? options.useChannel - 1 : 0);

      const textureRaster = new Float32Array(baseSize * baseSize);
      for (let ty = 0; ty < baseSize; ty++) {
        for (let tx = 0; tx < baseSize; tx++) {
          // Guard: if srcWidth < baseSize (shouldn't happen), clamp indices
          const srcX = Math.min(tx, srcWidth - 1);
          const srcY = Math.min(ty, srcHeight - 1);
          const srcIdx = (srcY * srcWidth + srcX) * samplesPerPixel + channelIndex;
          const v = srcRaster[srcIdx];
          const isNoData = isF32NoData(v, noDataValue);
          textureRaster[ty * baseSize + tx] = isNoData ? (noDataValue as number) * multiplier : v * multiplier;
        }
      }

      const bitmapOptions: GeoImageOptions = { ...options, type: 'image', useChannelIndex: 0, numOfChannels: 1, noDataValue: noDataValue !== undefined ? (noDataValue as number) * multiplier : undefined };

      const bitmapResult = await BitmapGenerator.generate(
        { width: baseSize, height: baseSize, rasters: [textureRaster] },
        bitmapOptions
      );
      tileResult.texture = bitmapResult.map as ImageBitmap;
    }

    return tileResult;
  }

  private static extractMeshRaster(terrain: Float32Array, inWidth: number): Float32Array {
    const meshWidth = inWidth - 1;
    const out = new Float32Array(meshWidth * meshWidth);
    for (let r = 0; r < meshWidth; r++) {
      for (let c = 0; c < meshWidth; c++) {
        out[r * meshWidth + c] = terrain[(r + 1) * inWidth + (c + 1)];
      }
    }
    return out;
  }

  private static hasVisualizationOptions(options: GeoImageOptions): boolean {
    return !!(
      options.useSingleColor ||
      options.useHeatMap ||
      options.useSwissRelief ||
      options.useColorsBasedOnValues ||
      options.useColorClasses
    );
  }

  /**
   * Preserve noData values in a separate raster for kernel computation.
   * If the source raster marks a sample as noData, keep it as noData.
   * Otherwise, use the processed terrain elevation value.
   */
  private static preserveNoDataForKernel(
    terrain: Float32Array,
    sourceRaster: TypedArray | undefined,
    noDataValue: number | undefined
  ): Float32Array {
    const kernelTerrain = new Float32Array(terrain.length);

    if (
      noDataValue !== undefined &&
      noDataValue !== null &&
      sourceRaster &&
      sourceRaster.length === terrain.length
    ) {
      for (let i = 0; i < terrain.length; i++) {
        const sourceValue = (sourceRaster as any)[i];
        const isNoData = isF32NoData(sourceValue, noDataValue);

        kernelTerrain[i] = isNoData ? (noDataValue as number) : terrain[i];
      }
    } else {
      // Fallback: no usable noData metadata or mismatched lengths; mirror existing behavior.
      kernelTerrain.set(terrain);
    }

    return kernelTerrain;
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

    const isKernel = TerrainGenerator.isKernelMode(options);
    const isStitched = isStitchedGrid(width);
    // Kernel: flat array with kernel padding. Stitched: 2^n+1×2^n+1. Default: (width+1)×(height+1) with backfill.
    const outWidth = isKernel ? width : (isStitched ? width : width + 1);
    const outHeight = isKernel ? height : (isStitched ? height : height + 1);
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
          isF32NoData(channel[pixel], options.noDataValue)
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
    const gridSize = isStitchedGrid(width) ? width : width + 1;
    const martini = new Martini(gridSize);
    const tile = martini.createTile(terrain);
    const { vertices, triangles } = tile.getMesh(meshMaxError);

    return { vertices, triangles };
  }

  static getDelatinTileMesh(meshMaxError: number, width: number, height: number, terrain: Float32Array) {
    const widthPlus = isStitchedGrid(width) ? width : width + 1;
    const heightPlus = isStitchedGrid(height) ? height : height + 1;
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
    verticalExaggeration: number = 1.0,
  ) {
    const isStitchedGridFlag = isStitchedGrid(width);
    const gridSize = isStitchedGridFlag ? width : width + 1;
    const numOfVerticies = vertices.length / 2;
    // vec3. x, y in pixels, z in meters (scaled by verticalExaggeration)
    const positions = new Float32Array(numOfVerticies * 3);
    // vec2. 1 to 1 relationship with position. represents the uv on the texture image. 0,0 to 1,1.
    const texCoords = new Float32Array(numOfVerticies * 2);

    const [minX, minY, maxX, maxY] = bounds || [0, 0, width, height];
    // If stitched (2^n+1), the spatial extent covers 0..(width-1) pixels, so we divide by (width-1).
    // If standard (2^n), the spatial extent covers 0..width pixels (with backfill), so we divide by width.
    const effectiveWidth = isStitchedGridFlag ? width - 1 : width;
    const effectiveHeight = isStitchedGridFlag ? height - 1 : height;

    const xScale = (maxX - minX) / effectiveWidth;
    const yScale = (maxY - minY) / effectiveHeight;

    for (let i = 0; i < numOfVerticies; i++) {
      const x = vertices[i * 2];
      const y = vertices[i * 2 + 1];
      const pixelIdx = y * gridSize + x;

      positions[3 * i] = x * xScale + minX;
      positions[3 * i + 1] = -y * yScale + maxY;
      positions[3 * i + 2] = terrain[pixelIdx] * verticalExaggeration;

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
