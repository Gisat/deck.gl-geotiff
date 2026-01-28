/* eslint 'max-len': [1, { code: 100, comments: 999, ignoreStrings: true, ignoreUrls: true }] */
// COG loading
import { fromUrl, GeoTIFF, GeoTIFFImage } from 'geotiff';

// Image compression support
import { worldToLngLat } from '@math.gl/web-mercator';

// Bitmap styling
import GeoImage, { GeoImageOptions } from './GeoImage.ts';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
const EARTH_HALF_CIRCUMFERENCE = EARTH_CIRCUMFERENCE / 2;
const webMercatorOrigin = [-20037508.342789244, 20037508.342789244];
const webMercatorRes0 = 156543.03125;

const CogTilesGeoImageOptionsDefaults = {
  blurredTexture: true,
};

class CogTiles {
  cog: GeoTIFF;

  cogZoomLookup = [0];

  cogResolutionLookup = [0];

  cogOrigin = [0, 0];

  zoomRange = [0, 0];

  tileSize: number;

  bounds: Bounds;

  loaded: boolean = false;

  geo: GeoImage = new GeoImage();

  options: GeoImageOptions;

  constructor(options: GeoImageOptions) {
    this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };
  }

  async initializeCog(url: string) {
    this.cog = await fromUrl(url);
    const image = await this.cog.getImage(); // by default, the first image is read.
    this.cogOrigin = image.getOrigin();
    this.options.noDataValue ??= this.getNoDataValue(image);
    this.options.format ??= this.getDataTypeFromTags(image);
    this.options.numOfChannels = this.getNumberOfChannels(image);
    this.options.planarConfig = this.getPlanarConfiguration(image);
    [this.cogZoomLookup, this.cogResolutionLookup] = await this.buildCogZoomResolutionLookup(this.cog);
    this.tileSize = image.getTileWidth();
    this.zoomRange = this.calculateZoomRange(image, await this.cog.getImageCount());
    this.bounds = this.calculateBoundsAsLatLon(image);
  }

  getZoomRange() {
    return this.zoomRange;
  }

  calculateZoomRange(img: GeoTIFFImage, imgCount: number) {
    const maxZoom = this.getZoomLevelFromResolution(img.getTileWidth(), img.getResolution()[0]);
    const minZoom = maxZoom - (imgCount - 1);

    return [minZoom, maxZoom];
  }

  calculateBoundsAsLatLon(image: GeoTIFFImage) {
    const bbox = image.getBoundingBox();

    const minX = Math.min(bbox[0], bbox[2]);
    const maxX = Math.max(bbox[0], bbox[2]);
    const minY = Math.min(bbox[1], bbox[3]);
    const maxY = Math.max(bbox[1], bbox[3]);

    const minXYDeg = this.getLatLon([minX, minY]);
    const maxXYDeg = this.getLatLon([maxX, maxY]);

    return [minXYDeg[0], minXYDeg[1], maxXYDeg[0], maxXYDeg[1]] as [number, number, number, number];
  }

  getZoomLevelFromResolution(tileSize: number, resolution: number) {
    return Math.round(Math.log2(EARTH_CIRCUMFERENCE / (resolution * tileSize)));
  }

  getBoundsAsLatLon() {
    return this.bounds;
  }

  getLatLon(input: number[]) {
    const ax = EARTH_HALF_CIRCUMFERENCE + input[0];
    const ay = -(EARTH_HALF_CIRCUMFERENCE + (input[1] - EARTH_CIRCUMFERENCE));

    const cartesianPosition = [
      ax * (512 / EARTH_CIRCUMFERENCE),
      ay * (512 / EARTH_CIRCUMFERENCE),
    ];
    const cartographicPosition = worldToLngLat(cartesianPosition);
    const cartographicPositionAdjusted = [cartographicPosition[0], -cartographicPosition[1]];

    return cartographicPositionAdjusted;
  }

  /**
   * Builds lookup tables for zoom levels and estimated resolutions from a Cloud Optimized GeoTIFF (COG) object.
   *
   * It is assumed that inn web mapping, COG data is visualized in the Web Mercator coordinate system.
   * At zoom level 0, the Web Mercator resolution is defined by the constant `webMercatorRes0`
   * (e.g., 156543.03125 m/pixel). At each subsequent zoom level, this resolution is halved.
   *
   * This function calculates, for each image (overview) in the COG, its estimated resolution and
   * corresponding zoom level based on the base image's resolution and width.
   *
   * @param {object} cog - A Cloud Optimized GeoTIFF object loaded via geotiff.js.
   * @returns {Promise<[number[], number[]]>} A promise resolving to a tuple of two arrays:
   *   - The first array (`zoomLookup`) maps each image index to its computed zoom level.
   *   - The second array (`resolutionLookup`) maps each image index to its estimated resolution (m/pixel).
   */
  async buildCogZoomResolutionLookup(cog) {
    // Retrieve the total number of images (overviews) in the COG.
    const imageCount = await cog.getImageCount();

    // Use the first image as the base reference.
    const baseImage = await cog.getImage(0);
    const baseResolution = baseImage.getResolution()[0]; // Resolution (m/pixel) of the base image.
    const baseWidth = baseImage.getWidth();

    // Initialize arrays to store the zoom level and resolution for each image.
    const zoomLookup = [];
    const resolutionLookup = [];

    // Iterate over each image (overview) in the COG.
    for (let idx = 0; idx < imageCount; idx++) {
      const image = await cog.getImage(idx);
      const width = image.getWidth();

      // Calculate the scale factor relative to the base image.
      const scaleFactor = baseWidth / width;
      const estimatedResolution = baseResolution * scaleFactor;

      // Calculate the zoom level using the Web Mercator resolution standard:
      // webMercatorRes0 is the resolution at zoom level 0; each zoom level halves the resolution.
      const zoomLevel = Math.round(Math.log2(webMercatorRes0 / estimatedResolution));
      // console.log(`buildCogZoomResolutionLookup: Image index ${idx}: Estimated Resolution = ${estimatedResolution} m/pixel, Zoom Level = ${zoomLevel}`);

      zoomLookup[idx] = zoomLevel;
      resolutionLookup[idx] = estimatedResolution;
    }

    return [zoomLookup, resolutionLookup];
  }

  /**
   * Determines the appropriate image index from the Cloud Optimized GeoTIFF (COG)
   * that best matches a given zoom level.
   *
   * This function utilizes precomputed lookup tables (`cogZoomLookup`) that map
   * each image index in the COG to its corresponding zoom level. It ensures that
   * the selected image index provides the closest resolution to the desired zoom level.
   *
   * @param {number} zoom - The target zoom level for which the image index is sought.
   * @returns {number} The index of the image in the COG that best matches the specified zoom level.
   */
  getImageIndexForZoomLevel(zoom) {
    // Retrieve the minimum and maximum zoom levels from the lookup table.
    const minZoom = this.cogZoomLookup[this.cogZoomLookup.length - 1];
    const maxZoom = this.cogZoomLookup[0];
    if (zoom > maxZoom) return 0;
    if (zoom < minZoom) return this.cogZoomLookup.length - 1;

    // For zoom levels within the available range, find the exact or closest matching index.
    const exactMatchIndex = this.cogZoomLookup.indexOf(zoom);
    if (exactMatchIndex === -1) {
      // TO DO improve the condition if the match index is not found
      console.log('getImageIndexForZoomLevel: error in retrieving image by zoom index');
    }
    return exactMatchIndex;
  }

  async getTileFromImage(tileX, tileY, zoom) {
    const imageIndex = this.getImageIndexForZoomLevel(zoom);
    const targetImage = await this.cog.getImage(imageIndex);

    // 1. Validation: Ensure the image is tiled
    const tileWidth = targetImage.getTileWidth();
    const tileHeight = targetImage.getTileHeight();
    if (!tileWidth || !tileHeight) {
      throw new Error(
        'GeoTIFF Error: The provided image is not tiled. '
        + 'Please use "rio cogeo create --web-optimized" to fix this.',
      );
    }

    // --- STEP 1: CALCULATE BOUNDS IN METERS ---

    // 2. Get COG Metadata (image = COG)
    const imageResolution = this.cogResolutionLookup[imageIndex];
    const imageHeight = targetImage.getHeight();
    const imageWidth = targetImage.getWidth();
    const [imgOriginX, imgOriginY] = this.cogOrigin;

    // 3. Define Web Mercator Constants
    // We use the class property tileSize (usually 256) as the ground truth for grid calculations
    const TILE_SIZE = this.tileSize;
    const ORIGIN_X = webMercatorOrigin[0];
    const ORIGIN_Y = webMercatorOrigin[1];

    // 4. Calculate Tile BBox in World Meters
    // This defines where the map expects the tile to be physically located
    const tileGridResolution = (EARTH_CIRCUMFERENCE / TILE_SIZE) / (2 ** zoom);

    const tileMinXMeters = ORIGIN_X + (tileX * TILE_SIZE * tileGridResolution);
    const tileMaxYMeters = ORIGIN_Y - (tileY * TILE_SIZE * tileGridResolution);
    // Note: We don't strictly need MaxX/MinY meters for the start calculation,
    // but they are useful if debugging the full meter footprint.

    // --- STEP 2: CONVERT TO PIXEL COORDINATES ---

    // 5. Calculate precise floating-point start position relative to the image
    const windowMinX = (tileMinXMeters - imgOriginX) / imageResolution;
    const windowMinY = (imgOriginY - tileMaxYMeters) / imageResolution;

    // 6. Snap to Integer Grid (The "Force 256" Fix)
    // We round the start position to align with the nearest pixel.
    // Crucially, we calculate endX/endY by adding tileSize to startX/startY.
    // This guarantees the window is exactly 256x256, preventing "off-by-one" (257px) errors.
    const startX = Math.round(windowMinX);
    const startY = Math.round(windowMinY);
    const endX = startX + TILE_SIZE;
    const endY = startY + TILE_SIZE;

    // --- STEP 3: CALCULATE INTERSECTION ---

    // 7. Clamp the read window to the actual image dimensions
    // This defines the "Safe" area we can actually read from the file.
    const validReadX = Math.max(0, startX);
    const validReadY = Math.max(0, startY);
    const validReadMaxX = Math.min(imageWidth, endX);
    const validReadMaxY = Math.min(imageHeight, endY);

    const readWidth = validReadMaxX - validReadX;
    const readHeight = validReadMaxY - validReadY;

    // CHECK: If no overlap, return empty
    if (readWidth <= 0 || readHeight <= 0) {
      return [this.createEmptyTile()];
    }

    // 8. Calculate Offsets (Padding)
    // "missingLeft" is how many blank pixels we need to insert before the image data starts.
    // Logic: If we wanted to read from -50 (startX), but clamped to 0 (validReadX),
    // we are missing the first 50 pixels.
    const missingLeft = validReadX - startX;
    const missingTop = validReadY - startY;
    const window = [validReadX, validReadY, validReadMaxX, validReadMaxY];

    // --- STEP 4: READ AND COMPOSITE ---

    // Case A: Partial Overlap (Padding or Cropping required)
    // If the tile is hanging off the edge, we need to manually reconstruct it.
    if (missingLeft > 0 || missingTop > 0 || readWidth < tileWidth || readHeight < tileHeight) {
      /// Initialize a temporary buffer for a single band (filled with NoData)
      // We will reuse this buffer for each band to save memory allocations.
      const tileBuffer = this.createTileBuffer(this.options.format, tileWidth);
      tileBuffer.fill(this.options.noDataValue);

      // if the valid window is smaller than the tile size, it gets the image size width and height, thus validRasterData.width must be used as below
      const validRasterData = await targetImage.readRasters({ window });

      // FOR MULTI-BAND - the result is one array with sequentially typed bands, firstly all data for the band 0, then for band 1
      // I think this is less practical then the commented solution above, but I do it so it works with the code in GeoImage.ts in deck.gl-geoimage in function getColorValue.
      const validImageData = Array(validRasterData.length * validRasterData[0].length);
      validImageData.fill(this.options.noDataValue);

      // Place the valid pixel data into the tile buffer.
      for (let band = 0; band < validRasterData.length; band++) {
        for (let row = 0; row < readHeight; row++) {
          const destRow = missingTop + row;
          const destRowOffset = destRow * TILE_SIZE;
          const srcRowOffset = row * validRasterData.width;

          for (let col = 0; col < readWidth; col++) {
            // Compute the destination position in the tile buffer.
            // We shift by the number of missing pixels (if any) at the top/left.
            const destCol = missingLeft + col;
            // Bounds Check: Ensure we don't write outside the 256x256 buffer
            if (destRow < tileWidth && destCol < tileHeight) {
              tileBuffer[destRowOffset + destCol] = validRasterData[band][srcRowOffset + col];
            } else {
              console.log('error in assigning data to tile buffer');
            }
          }
        }
        tileBuffer.forEach((rasterValue, index) => {
          validImageData[index * this.options.numOfChannels + band] = rasterValue;
        });
      }
      return [validImageData];
    }

    // Case B: Perfect Match (Optimization)
    // If the read window is exactly 256x256 and aligned, we can read directly interleaved.
    // console.log("Perfect aligned read");
    const tileData = await targetImage.readRasters({ window, interleave: true });
    // console.log(`data that starts at the left top corner of the tile ${tileX}, ${tileY}`);
    return [tileData];
  }

  /**
   * Creates a blank tile buffer filled with the "No Data" value.
   */
  createEmptyTile() {
    // 1. Determine the size
    // Default to 1 channel (grayscale) if not specified
    const channels = this.options.numOfChannels || 1;
    const size = this.tileSize * this.tileSize * channels;

    // 2. Create the array
    // Float32 is standard for GeoTIFF data handling in browsers
    const tileData = new Float32Array(size);

    // 3. Fill with "No Data" value
    // If noDataValue is undefined, it defaults to 0
    if (this.options.noDataValue !== undefined) {
      tileData.fill(this.options.noDataValue);
    }

    return tileData;
  }

  async getTile(x: number, y: number, z: number, bounds:Bounds, meshMaxError: number) {
    const tileData = await this.getTileFromImage(x, y, z);

    return this.geo.getMap({
      rasters: [tileData[0]],
      width: this.tileSize,
      height: this.tileSize,
      bounds,
    }, this.options, meshMaxError);
  }

  /**
   * Determines the data type (e.g., "Int32", "Float64") of a GeoTIFF image
   * by reading its TIFF tags.
   *
   * @param {GeoTIFFImage} image - A GeoTIFF.js image.
   * @returns {Promise<string>} - A string representing the data type.
   */
  getDataTypeFromTags(image) {
    // Retrieve the file directory containing TIFF tags.
    const fileDirectory = image.getFileDirectory();

    // In GeoTIFF, BitsPerSample (tag 258) and SampleFormat (tag 339) provide the type info.
    // They can be either a single number or an array if there are multiple samples.
    const sampleFormat = fileDirectory.SampleFormat; // Tag 339
    const bitsPerSample = fileDirectory.BitsPerSample; // Tag 258

    // If multiple bands exist, we assume all bands share the same type.
    const format = (sampleFormat && typeof sampleFormat.length === 'number' && sampleFormat.length > 0)
      ? sampleFormat[0]
      : sampleFormat;

    const bits = (bitsPerSample && typeof bitsPerSample.length === 'number' && bitsPerSample.length > 0)
      ? bitsPerSample[0]
      : bitsPerSample;

    // Map the sample format to its corresponding type string.
    // The common definitions are:
    //   1: Unsigned integer
    //   2: Signed integer
    //   3: Floating point
    let typePrefix;
    if (format === 1) {
      typePrefix = 'UInt';
    } else if (format === 2) {
      typePrefix = 'Int';
    } else if (format === 3) {
      typePrefix = 'Float';
    } else {
      typePrefix = 'Unknown';
    }
    // console.log(`data type ${typePrefix}${bits}`);
    return `${typePrefix}${bits}`;
  }

  /**
   * Extracts the noData value from a GeoTIFF.js image.
   * Returns the noData value as a number (including NaN) if available, otherwise undefined.
   *
   * @param {GeoTIFFImage} image - The GeoTIFF.js image.
   * @returns {number|undefined} The noData value, possibly NaN, or undefined if not set or invalid.
   */
  getNoDataValue(image) {
    const noDataRaw = image.getGDALNoData();

    if (noDataRaw === undefined || noDataRaw === null) {
      console.warn('No noData value defined — raster might be rendered incorrectly.');
      return undefined;
    }

    const cleaned = String(noDataRaw).replace(/\0/g, '').trim();

    if (cleaned === '') {
      console.warn('noData value is an empty string after cleanup.');
      return undefined;
    }

    const parsed = Number(cleaned);

    // Allow NaN if explicitly declared
    if (cleaned.toLowerCase() === 'nan') {
      return NaN;
    }

    // If not declared as "nan" and still parsed to NaN, it's an error
    if (Number.isNaN(parsed)) {
      console.warn(`Failed to parse numeric noData value: '${cleaned}'`);
      return undefined;
    }

    return parsed;
  }

  /**
   * Retrieves the number of channels (samples per pixel) in a GeoTIFF image.
   *
   * @param {GeoTIFFImage} image - A GeoTIFFImage object from which to extract the number of channels.
   * @returns {number} The number of channels in the image.
   */
  getNumberOfChannels(image) {
    return image.getSamplesPerPixel();
  }

  /**
   * Calculates the intersection between a tile bounding box and a COG bounding box,
   * returning the intersection window in image pixel space (relative to COG offsets),
   * along with how much blank space (nodata) appears on the left and top of the tile.
   *
   * @param {number[]} tileBbox - Tile bounding box: [minX, minY, maxX, maxY]
   * @param {number[]} cogBbox - COG bounding box: [minX, minY, maxX, maxY]
   * @param {number} offsetXPixel - X offset of the COG origin in pixel space
   * @param {number} offsetYPixel - Y offset of the COG origin in pixel space
   * @param {number} tileSize - Size of the tile in pixels (default: 256)
   * @returns {[number, number, number[] | null, number, number]}
   *   An array containing:
   *   - width of the intersection
   *   - height of the intersection
   *   - pixel-space window: [startX, startY, endX, endY] or null if no overlap
   *   - missingLeft: padding pixels on the left
   *   - missingTop: padding pixels on the top
   */
  getIntersectionBBox(tileBbox, cogBbox, offsetXPixel = 0, offsetYPixel = 0, tileSize = 256) {
    const interLeft = Math.max(tileBbox[0], cogBbox[0]);
    const interTop = Math.max(tileBbox[1], cogBbox[1]);
    const interRight = Math.min(tileBbox[2], cogBbox[2]);
    const interBottom = Math.min(tileBbox[3], cogBbox[3]);

    const width = Math.max(0, interRight - interLeft);
    const height = Math.max(0, interBottom - interTop);

    let window = null;
    let missingLeft = 0;
    let missingTop = 0;

    if (width > 0 && height > 0) {
      window = [
        interLeft - offsetXPixel,
        interTop - offsetYPixel,
        interRight - offsetXPixel,
        interBottom - offsetYPixel,
      ];

      // Padding from the tile origin to valid data start
      missingLeft = interLeft - tileBbox[0];
      missingTop = interTop - tileBbox[1];
    }

    return [
      width,
      height,
      window,
      missingLeft,
      missingTop,
    ];
  }

  /**
   * Retrieves the PlanarConfiguration value from a GeoTIFF image.
   *
   * @param {GeoTIFFImage} image - The GeoTIFF image object.
   * @returns {number} The PlanarConfiguration value (1 for Chunky format, 2 for Planar format).
   */
  getPlanarConfiguration(image) {
    // Access the PlanarConfiguration tag directly
    const planarConfiguration = image.fileDirectory.PlanarConfiguration;

    // If the tag is not present, default to 1 (Chunky format)
    if (planarConfiguration !== 1 && planarConfiguration !== 2) {
      throw new Error('Invalid planar configuration.');
    }
    return planarConfiguration;
  }

  /**
   * Creates a tile buffer of the specified size using a typed array corresponding to the provided data type.
   *
   * @param {string} dataType - A string specifying the data type (e.g., "Int32", "Float64", "UInt16", etc.).
   * @param {number} tileSize - The width/height of the square tile.
   * @returns {TypedArray} A typed array buffer of length tileSize * tileSize.
   */
  createTileBuffer(dataType, tileSize) {
    const length = tileSize * tileSize;
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
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }
}

export default CogTiles;
