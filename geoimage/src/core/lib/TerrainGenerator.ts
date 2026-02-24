import Martini from '@mapbox/martini';
import { getMeshBoundingBox } from '@loaders.gl/schema';
import Delatin from '../delatin';
import { addSkirt } from '../helpers/skirt';
import { GeoImageOptions, Bounds } from '../types';

export class TerrainGenerator {
  static generate(
    input: { width: number; height: number; rasters: any[] ; bounds: Bounds},
    options: GeoImageOptions,
    meshMaxError: number
  ) {
    const { width, height } = input;

    // 1. Compute Terrain Data (Extract Elevation)
    const terrain = this.computeTerrainData(input, options);

    // 2. Tesselate (Generate Mesh)
    const { terrainSkirtHeight } = options;

    let mesh;
    switch (options.tesselator) {
      case 'martini':
        mesh = this.getMartiniTileMesh(meshMaxError, width, terrain);
        break;
      case 'delatin':
        mesh = this.getDelatinTileMesh(meshMaxError, width, height, terrain);
        break;

      default:
        // Default behavior fallback
        mesh = this.getMartiniTileMesh(meshMaxError, width, terrain);
        break;
    }

    const { vertices } = mesh;
    let { triangles } = mesh;
    let attributes = this.getMeshAttributes(vertices, terrain as any, width, height, input.bounds);
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

  /**
   * Decodes raw raster data into a Float32Array of elevation values.
   * Handles channel selection, value scaling, data type validation, and border stitching.
   */
  private static computeTerrainData(
    input: { width: number; height: number; rasters: any[] },
    options: GeoImageOptions
  ): Float32Array {
    const { width, height, rasters } = input;
    const optionsLocal = { ...options };

    let channel = rasters[0];

    optionsLocal.useChannelIndex ??= optionsLocal.useChannel == null ? null : optionsLocal.useChannel - 1;
    if (options.useChannelIndex != null) {
      if (rasters[optionsLocal.useChannelIndex]) {
        channel = rasters[optionsLocal.useChannelIndex];
      }
    }

    const terrain = new Float32Array((width === 257 ? width : width + 1) * (height === 257 ? height : height + 1));

    const numOfChannels = channel.length / (width * height);

    let pixel: number = options.useChannelIndex === null ? 0 : options.useChannelIndex;

    const isStitched = width === 257;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let elevationValue = (options.noDataValue && channel[pixel] === options.noDataValue) ? options.terrainMinValue : channel[pixel] * options.multiplier!;

        // Validate that the elevation value is within the valid range for Float32.
        // Extreme values (like -1.79e308) can become -Infinity when cast, causing WebGL errors.
        if (Number.isNaN(elevationValue) || elevationValue < -3.4e38 || elevationValue > 3.4e38) {
          elevationValue = options.terrainMinValue;
        }

        // If stitched (257), fill linearly. If 256, fill with stride for padding.
        const index = isStitched ? (y * width + x) : (y * (width + 1) + x);
        terrain[index] = elevationValue;
        pixel += numOfChannels;
      }
    }

    if (!isStitched) {
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
    vertices: any,
    terrain: Uint8Array,
    width: number,
    height: number,
    bounds: number[],
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

      positions[3 * i + 0] = x * xScale + minX;
      positions[3 * i + 1] = -y * yScale + maxY;
      positions[3 * i + 2] = terrain[pixelIdx];

      texCoords[2 * i + 0] = x / effectiveWidth;
      texCoords[2 * i + 1] = y / effectiveHeight;
    }

    return {
      POSITION: { value: positions, size: 3 },
      TEXCOORD_0: { value: texCoords, size: 2 },
      // NORMAL: {}, - optional, but creates the high poly look with lighting
    };
  }
}
