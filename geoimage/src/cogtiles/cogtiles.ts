/* eslint 'max-len': [1, { code: 100, comments: 999, ignoreStrings: true, ignoreUrls: true }] */
// COG loading
import { fromUrl, GeoTIFF, GeoTIFFImage } from 'geotiff';

// Image compression support
import { worldToLngLat } from '@math.gl/web-mercator';

// Bitmap styling
import GeoImage, { GeoImageOptions } from '../geoimage/geoimage.ts';

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
    // const imageCount = await this.cog.getImageCount();

    const allIFDs = [];

    // 1. Start with the offset of the first IFD.
    let currentOffset = this.cog.firstIFDOffset;

    // 2. Loop as long as the offset is not 0 (which marks the end of the list).
    while (currentOffset !== 0) {
      const ifd = await this.cog.parseFileDirectoryAt(currentOffset);
      allIFDs.push(ifd);

      console.log(`Parsed IFD at offset ${currentOffset}. Image width: ${ifd.fileDirectory.ImageWidth}`);
      console.log(ifd)

      // 3. Get the offset for the *next* IFD for the next loop iteration.
      currentOffset = ifd.nextIFDByteOffset;
    }

    console.log(`Finished parsing. Found a total of ${allIFDs.length} IFDs.`);

    const baseIFD = allIFDs[0].fileDirectory;

    this.cogOrigin = this.getOriginFromIFD(baseIFD);
    this.options.noDataValue ??= this.getNoDataValueFromIFD(baseIFD);
    this.options.format ??= this.getDataTypeFromIFD(baseIFD);
    this.options.numOfChannels = this.getNumberOfChannelsFromIFD(baseIFD);
    this.options.planarConfig = this.getPlanarConfigurationFromIFD(baseIFD);
    [this.cogZoomLookup, this.cogResolutionLookup] = this.buildLookupsFromIFDArray(allIFDs);
    this.tileSize = this.getTileWidthFromIFD(baseIFD);
    this.zoomRange = this.calculateZoomRangeFromIFDs(allIFDs);
    this.bounds = this.calculateBoundsAsLatLonFromIFD(baseIFD, this.getLatLon.bind(this));

    // const image = await this.cog.getImage(); // by default, the first image is read.
    // this.cogOrigin = image.getOrigin();
    // this.options.noDataValue ??= this.getNoDataValue(image);
    // this.options.format ??= this.getDataTypeFromTags(image);
    // this.options.numOfChannels = this.getNumberOfChannels(image);
    // this.options.planarConfig = this.getPlanarConfiguration(image);
    // [this.cogZoomLookup, this.cogResolutionLookup] = await this.buildCogZoomResolutionLookup(this.cog);
    // this.tileSize = image.getTileWidth();
    // this.zoomRange = this.calculateZoomRange(image, await this.cog.getImageCount());
    // this.bounds = this.calculateBoundsAsLatLon(image);
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
   * Builds lookup tables for zoom levels and resolutions from a pre-parsed array of IFDs.
   * This is a synchronous function as all I/O has already been performed.
   *
   * @param {Array} allIFDs - An array of parsed IFD objects from geotiff.js.
   * @returns {[number[], number[]]} A tuple of two arrays: [zoomLookup, resolutionLookup].
   */
  buildLookupsFromIFDArray(allIFDs) {
    if (!allIFDs || allIFDs.length === 0) {
      throw new Error("Cannot build lookups from an empty IFD array.");
    }

    // --- 1. Get base information from the first IFD ---
    const baseIFD = allIFDs[0].fileDirectory;
    if (!baseIFD.ImageWidth || !baseIFD.ModelPixelScale) {
      throw new Error("Base image IFD is missing ImageWidth or ModelPixelScale tags.");
    }
    const baseWidth = baseIFD.ImageWidth;
    const baseResolution = baseIFD.ModelPixelScale[0]; // Resolution in meters/pixel

    // --- 2. Loop through the in-memory IFDs to do the calculations ---
    const zoomLookup = [];
    const resolutionLookup = [];

    for (let idx = 0; idx < allIFDs.length; idx++) {
      const width = allIFDs[idx].fileDirectory.ImageWidth;

      const scaleFactor = baseWidth / width;
      const estimatedResolution = baseResolution * scaleFactor;

      const zoomLevel = Math.round(Math.log2(webMercatorRes0 / estimatedResolution));

      zoomLookup[idx] = zoomLevel;
      resolutionLookup[idx] = estimatedResolution;
    }

    return [zoomLookup, resolutionLookup];
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
   * Manually gets the image origin (top-left corner) from the raw IFD file directory,
   * replicating the behavior of the geotiff.js getOrigin() method.
   * @param {object} fileDirectory The object containing the parsed TIFF tags.
   * @returns {Array<number>|null} The [x, y] origin coordinates or null if the tag is missing.
   */
  getOriginFromIFD(fileDirectory) {
    // Check if the required ModelTiepoint tag exists.
    if (fileDirectory.ModelTiepoint) {
      const tiepoint = fileDirectory.ModelTiepoint;

      // The getOrigin() method simply returns the X (index 3) and Y (index 4)
      // values directly from the tiepoint array.
      const originX = tiepoint[3];
      const originY = tiepoint[4];

      return [originX, originY];
    }

    console.error("Required tag (ModelTiepoint) is not present.");
    return null;
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

    // Ensure the image is tiled
    const tileWidth = targetImage.getTileWidth();
    const tileHeight = targetImage.getTileHeight();
    if (!tileWidth || !tileHeight) {
      throw new Error('The image is not tiled.');
    }

    // Calculate the map offset between the global Web Mercator origin and the COG's origin.
    // (Difference in map units.)
    // if X offset is large and positive (COG is far to the right of global origin)
    // if Y offset is large and positive (COG is far below global origin — expected)
    const offsetXMap = this.cogOrigin[0] - webMercatorOrigin[0];
    const offsetYMap = webMercatorOrigin[1] - this.cogOrigin[1];

    const tileResolution = (EARTH_CIRCUMFERENCE / tileWidth) / 2 ** zoom;
    const cogResolution = this.cogResolutionLookup[imageIndex];

    // Convert map offsets into pixel offsets.
    const offsetXPixel = Math.floor(offsetXMap / tileResolution);
    const offsetYPixel = Math.floor(offsetYMap / tileResolution);

    const imageHeight = targetImage.getHeight();
    const imageWidth = targetImage.getWidth();

    // approach by comparing bboxes of tile and cog image
    const tilePixelBbox = [
      tileX * tileWidth,
      tileY * tileHeight,
      (tileX + 1) * tileWidth,
      (tileY + 1) * tileHeight,
    ];

    const cogPixelBBox = [
      offsetXPixel,
      offsetYPixel,
      offsetXPixel + imageWidth,
      offsetYPixel + imageHeight,
    ];

    const intersecion = this.getIntersectionBBox(tilePixelBbox, cogPixelBBox, offsetXPixel, offsetYPixel, tileWidth);
    const [validWidth, validHeight, window, missingLeft, missingTop] = intersecion;



    // Read the raster data for the tile window with shifted origin.
    if (missingLeft > 0 || missingTop > 0 || validWidth < tileWidth || validHeight < tileHeight) {
      // Prepare the final tile buffer and fill it with noDataValue.
      const tileBuffer = this.createTileBuffer(this.options.format, tileWidth);
      tileBuffer.fill(this.options.noDataValue);

      // if the valid window is smaller than tile size, it gets the image size width and height, thus validRasterData.width must be used as below
      const validRasterData = await targetImage.readRasters({ window });

      // FOR MULTI-BAND - the result is one array with sequentially typed bands, firstly all data for the band 0, then for band 1
      // I think this is less practical then the commented solution above, but I do it so it works with the code in geoimage.ts in deck.gl-geoimage in function getColorValue.
      const validImageData = Array(validRasterData.length * validRasterData[0].length);
      validImageData.fill(this.options.noDataValue);

      // Place the valid pixel data into the tile buffer.
      for (let band = 0; band < validRasterData.length; band++) {
        for (let row = 0; row < validHeight; row++) {
          for (let col = 0; col < validWidth; col++) {
            // Compute the destination position in the tile buffer.
            // We shift by the number of missing pixels (if any) at the top/left.
            const destRow = missingTop + row;
            const destCol = missingLeft + col;
            if (destRow < tileWidth && destCol < tileHeight) {
              tileBuffer[destRow * tileWidth + destCol] = validRasterData[band][row * validRasterData.width + col];
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

    // Read the raster data for the non shifted tile window.
    const tileData = await targetImage.readRasters({ window, interleave: true });
    // console.log(`data that starts at the left top corner of the tile ${tileX}, ${tileY}`);
    return [tileData];
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
   * Determines the data type (e.g., "Int32", "Float64") of a GeoTIFF
   * by reading its raw IFD tags.
   *
   * @param {object} fileDirectory - The object containing the parsed TIFF tags.
   * @returns {string} - A string representing the data type (e.g., "Float64").
   */
  getDataTypeFromIFD(fileDirectory) {
    // Read the required tags directly from the fileDirectory object.
    const sampleFormat = fileDirectory.SampleFormat;
    const bitsPerSample = fileDirectory.BitsPerSample;

    // If tags are arrays (for multi-band images), we assume all bands share the same type.
    const format = (sampleFormat && sampleFormat.length > 0)
        ? sampleFormat[0]
        : sampleFormat;

    const bits = (bitsPerSample && bitsPerSample.length > 0)
        ? bitsPerSample[0]
        : bitsPerSample;

    let typePrefix;
    if (format === 1) {
      typePrefix = 'UInt';
    } else if (format === 2) {
      typePrefix = 'Int';
    } else if (format === 3) {
      typePrefix = 'Float';
    } else {
      // Return a default/unknown if the format isn't recognized.
      return 'Unknown';
    }

    return `${typePrefix}${bits}`;
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
   * Extracts the noData value from a raw IFD object, based on robust logic.
   * Returns the noData value as a number (including NaN) if available, otherwise undefined.
   *
   * @param {object} fileDirectory - The object containing the parsed TIFF tags.
   * @returns {number|undefined} The noData value, possibly NaN, or undefined if not set or invalid.
   */
  getNoDataValueFromIFD(fileDirectory) {
    // The key change: read directly from the IFD tag instead of an image method.
    const noDataRaw = fileDirectory.GDAL_NODATA;

    // --- The rest of this is your proven, robust logic ---

    if (noDataRaw === undefined || noDataRaw === null) {
      // A utility function can just return, letting the caller decide whether to warn.
      return undefined;
    }

    // Clean up the raw string value.
    const cleaned = String(noDataRaw).replace(/\0/g, '').trim();

    if (cleaned === '') {
      return undefined;
    }

    // Try to parse the cleaned string into a number.
    const parsed = Number(cleaned);

    // Explicitly allow NaN if the string was 'nan'.
    if (cleaned.toLowerCase() === 'nan') {
      return NaN;
    }

    // If the string was NOT 'nan' but still failed to parse, it's an invalid value.
    if (Number.isNaN(parsed)) {
      return undefined;
    }

    return parsed;
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
   * Retrieves the number of channels (samples per pixel) from a raw IFD object.
   *
   * @param {object} fileDirectory - The object containing the parsed TIFF tags.
   * @returns {number | undefined} The number of channels in the image, or undefined if not found.
   */
  getNumberOfChannelsFromIFD(fileDirectory) {
    // The number of channels is the value of the 'SamplesPerPixel' tag (277).
    // It's typically a single number.
    return fileDirectory.SamplesPerPixel;
  }

  /**
   * Retrieves the tile width from a raw IFD object.
   *
   * @param {object} fileDirectory - The object containing the parsed TIFF tags.
   * @returns {number | undefined} The width of the tiles in pixels, or undefined if not found.
   */
  getTileWidthFromIFD(fileDirectory) {
    // The tile width is the value of the 'TileWidth' tag.
    return fileDirectory.TileWidth;
  }

  /**
   * Manually calculates the bounding box from the raw IFD file directory.
   * @param {object} fileDirectory The object containing the parsed TIFF tags.
   * @returns {Array<number>} The bounding box as [minX, minY, maxX, maxY].
   */
  calculateBoundingBoxFromIFD(fileDirectory) {
    if (
        !fileDirectory.ModelTiepoint ||
        !fileDirectory.ModelPixelScale ||
        !fileDirectory.ImageWidth ||
        !fileDirectory.ImageLength
    ) {
      throw new Error("Cannot calculate bounding box: required tags are missing from the IFD.");
    }

    const width = fileDirectory.ImageWidth;
    const height = fileDirectory.ImageLength;

    // Top-left corner coordinate from the tiepoint
    const x_tl = fileDirectory.ModelTiepoint[3];
    const y_tl = fileDirectory.ModelTiepoint[4];

    // Pixel size from the pixel scale tag
    const x_res = fileDirectory.ModelPixelScale[0];
    const y_res = fileDirectory.ModelPixelScale[1];

    // Calculate the coordinates of the lower-right corner
    const maxX = x_tl + (width * x_res);
    const minY = y_tl - (height * y_res); // Subtract because pixel rows go down

    return [x_tl, minY, maxX, y_tl]; // [minX, minY, maxX, maxY]
  }

  /**
   * Calculates the final bounding box in Latitude/Longitude from a raw IFD object.
   *
   * @param {object} baseIFD - The fileDirectory object of the base image.
   * @param {function} getLatLonHelper - Your helper function that reprojects coordinates.
   * @returns {[number, number, number, number]|null} The final bounds as [minLon, minLat, maxLon, maxLat], or null on error.
   */
  calculateBoundsAsLatLonFromIFD(baseIFD, getLatLonHelper) {
    // --- Part 1: Manually calculate the bounding box in the native projection ---
    if (
        !baseIFD.ModelTiepoint ||
        !baseIFD.ModelPixelScale ||
        !baseIFD.ImageWidth ||
        !baseIFD.ImageLength
    ) {
      console.error("Cannot calculate bounding box: required tags are missing from the IFD.");
      return null;
    }

    const width = baseIFD.ImageWidth;
    const height = baseIFD.ImageLength;
    const x_tl = baseIFD.ModelTiepoint[3]; // Top-left X
    const y_tl = baseIFD.ModelTiepoint[4]; // Top-left Y
    const x_res = baseIFD.ModelPixelScale[0]; // Pixel width
    const y_res = baseIFD.ModelPixelScale[1]; // Pixel height

    // Calculate the four corners in the native projection
    const minX = x_tl;
    const maxY = y_tl;
    const maxX = x_tl + (width * x_res);
    const minY = y_tl - (height * y_res); // Subtract as pixel Y-axis goes down

    // --- Part 2: Your existing logic to reproject the corners to Lat/Lon ---
    const minXYDeg = getLatLonHelper([minX, minY]);
    const maxXYDeg = getLatLonHelper([maxX, maxY]);

    // Return the final bounds in [minLon, minLat, maxLon, maxLat] format
    return [minXYDeg[0], minXYDeg[1], maxXYDeg[0], maxXYDeg[1]];
  }



  /**
   * Calculates the min and max zoom levels for the COG from a pre-parsed array of IFDs.
   * @param {Array} allIFDs - An array of parsed IFD objects from geotiff.js.
   * @returns {[number, number]} A tuple containing [minZoom, maxZoom].
   */
  calculateZoomRangeFromIFDs(allIFDs) {
    if (!allIFDs || allIFDs.length === 0) {
      throw new Error("Cannot calculate zoom range from an empty IFD array.");
    }

    const baseIFD = allIFDs[0].fileDirectory;
    if (!baseIFD.ModelPixelScale) {
      throw new Error("Base image IFD is missing the ModelPixelScale tag.");
    }

    // --- 1. Get required values from the IFD data ---
    const resolution = baseIFD.ModelPixelScale[0];
    const imgCount = allIFDs.length;

    // --- 2. Calculate the zoom levels ---
    // Resolution (meters/pixel) at Web Mercator zoom level 0
    const webMercatorRes0 = 156543.03125;

    // The 'maxZoom' is the native zoom level of the highest-resolution image.
    const maxZoom = Math.round(Math.log2(webMercatorRes0 / resolution));

    // The 'minZoom' is estimated by stepping back one zoom level for each overview.
    const minZoom = maxZoom - (imgCount - 1);

    return [minZoom, maxZoom];
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
   * Retrieves the PlanarConfiguration value from a raw IFD object.
   *
   * @param {object} fileDirectory - The object containing the parsed TIFF tags.
   * @returns {number} The PlanarConfiguration value (1 for Chunky, 2 for Planar).
   */
  getPlanarConfigurationFromIFD(fileDirectory) {
    const planarConfig = fileDirectory.PlanarConfiguration;

    // The TIFF specification defaults to 1 (chunky) if the tag is not present.
    if (planarConfig === undefined) {
      return 1;
    }

    // If the tag exists but has an invalid value, it's an error.
    if (planarConfig !== 1 && planarConfig !== 2) {
      throw new Error(`Invalid PlanarConfiguration value found in IFD: ${planarConfig}`);
    }

    return planarConfig;
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
