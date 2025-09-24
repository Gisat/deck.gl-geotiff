/* eslint 'max-len': [1, { code: 100, comments: 999, ignoreStrings: true, ignoreUrls: true }] */
// COG loading
import { Tiff, TiffImage, TiffTag } from '@cogeotiff/core';
import { SourceHttp } from '@chunkd/source-http';

// Image compression support
import { inflate } from 'pako';
import jpeg from 'jpeg-js';
import { worldToLngLat } from '@math.gl/web-mercator';
import LZWDecoder from './lzw';

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
  cog: Tiff;

  cogOrigin = [0, 0];

  zoomRange = [0, 0];

  cogZoomLookup = [0];

  cogResolutionLookup = [0];

  tileSize: number;

  bounds: Bounds;

  lowestOriginTileOffset = [0, 0];

  lowestOriginTileSize = 0;

  loaded: boolean = false;

  geo: GeoImage = new GeoImage();

  lzw: LZWDecoder = new LZWDecoder();

  options: GeoImageOptions;

  constructor(options: GeoImageOptions) {
    this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };
  }

  async initializeCog(url: string) {
    // Set native fetch instead node-fetch to SourceHttp
    SourceHttp.fetch = async (input, init) => {
      if (init && init.headers && init.headers.range) {
        const { range } = init.headers;

        // Use a regular expression to find any range ending in --2
        const match = range.match(/bytes=(\d+)--2/);

        if (match) {
          const startOffset = parseInt(match[1], 10);
          console.warn(`GENERAL PATCH: Correcting malformed range for offset ${startOffset}.`);

          // You'll need to know the next offset. For now, we can
          // assume a fixed size, but a more robust solution would
          // require parsing the TIFF directories beforehand.
          // Let's use the known size from Overview 8 to 9 (1872 bytes).
          const endOffset = startOffset + 1872 - 1; // 18250 + 1872 - 1 = 20121

          init.headers.range = `bytes=${startOffset}-${endOffset}`;
        }
      }
      const res = await fetch(input, init);
      return res;
    };

    const source = new SourceHttp(url);
    this.cog = await Tiff.create(source);

    this.cog.images.forEach((image:TiffImage) => {
      image.loadGeoTiffTags();
    });

    const baseImage = this.cog.images[0];
    this.cogOrigin = baseImage.origin;
    this.options.noDataValue ??= this.getNoDataValue(baseImage.tags);
    this.options.format ??= this.getFormat(
        baseImage.tags.get(TiffTag.SampleFormat)?.value as number[],
        baseImage.tags.get(TiffTag.BitsPerSample)?.value as number[],
    );
    this.options.numOfChannels = Number(baseImage.tags.get(TiffTag.SamplesPerPixel)?.value);
    [this.cogZoomLookup, this.cogResolutionLookup] = this.buildCogZoomResolutionLookup(this.cog.images);
    this.tileSize = baseImage.tileSize.width;
    // this.zoomRange = this.getZoomRange(this.cog);
    this.zoomRange = [this.cogZoomLookup[this.cogZoomLookup.length - 1], this.cogZoomLookup[0]];
    // TO DO do we need the bounds?
    this.bounds = this.calculateBoundsAsLatLon(baseImage);

    // TO DO do we need the lowestOriginTileOffset?
    this.lowestOriginTileOffset = this.getImageTileIndex(
      this.cog.images[this.cog.images.length - 1],
    );
    // console.log('lowest origin tile offset', this.lowestOriginTileOffset);

    return this.cog;
  }

  getTileSize(cog: Tiff) {
    return cog.images[cog.images.length - 1].tileSize.width;
  }

  buildCogZoomResolutionLookup(images) {
    // Retrieve the total number of images (overviews) in the COG.
    const imageCount = images.length;

    // Use the first image as the base reference.
    const baseResolution = images[0].resolution[0]; // Resolution (m/pixel) of the base image.
    const baseWidth = images[0].size.width;

    // Initialize arrays to store the zoom level and resolution for each image.
    const zoomLookup = [];
    const resolutionLookup = [];

    // Iterate over each image (overview) in the COG.
    for (let idx = 0; idx < imageCount; idx++) {
      const image = images[idx];
      const { width } = image.size;

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

  calculateBoundsAsLatLon(image) {
    // Use the .bbox property instead of the .getBoundingBox() method
    const { bbox } = image;

    const minX = Math.min(bbox[0], bbox[2]);
    const maxX = Math.max(bbox[0], bbox[2]);
    const minY = Math.min(bbox[1], bbox[3]);
    const maxY = Math.max(bbox[1], bbox[3]);

    // Your reprojection logic remains the same
    const minXYDeg = this.getLatLon([minX, minY]);
    const maxXYDeg = this.getLatLon([maxX, maxY]);

    return [minXYDeg[0], minXYDeg[1], maxXYDeg[0], maxXYDeg[1]] as [number, number, number, number];
  }

  getZoomRange(cog: Tiff) {
    const img = cog.images[cog.images.length - 1];

    const minZoom = this.getZoomLevelFromResolution(
      cog.images[cog.images.length - 1].tileSize.width,
      img.resolution[0],
    );
    const maxZoom = minZoom + (cog.images.length - 1);

    return [minZoom, maxZoom];
  }

  getBoundsAsLatLon(cog: Tiff) {
    const { bbox } = cog.images[cog.images.length - 1];

    const minX = Math.min(bbox[0], bbox[2]);
    const maxX = Math.max(bbox[0], bbox[2]);
    const minY = Math.min(bbox[1], bbox[3]);
    const maxY = Math.max(bbox[1], bbox[3]);

    const minXYDeg = this.getLatLon([minX, minY]);
    const maxXYDeg = this.getLatLon([maxX, maxY]);

    return [minXYDeg[0], minXYDeg[1], maxXYDeg[0], maxXYDeg[1]] as [number, number, number, number];
  }

  getOriginAsLatLon(cog: Tiff) {
    const { origin } = cog.images[cog.images.length - 1];
    return this.getLatLon(origin);
  }

  getImageTileIndex(img: TiffImage) {
    const ax = EARTH_HALF_CIRCUMFERENCE + img.origin[0];
    const ay = -(EARTH_HALF_CIRCUMFERENCE + (img.origin[1] - EARTH_CIRCUMFERENCE));
    // let mpt = img.resolution[0] * img.tileSize.width;

    const mpt = img.tileSize.width * this.getResolutionFromZoomLevel(
      img.tileSize.width,
      this.getZoomLevelFromResolution(
        img.tileSize.width,
        img.resolution[0],
      ),
    );

    const ox = Math.round(ax / mpt);
    const oy = Math.round(ay / mpt);

    const oz = this.getZoomLevelFromResolution(img.tileSize.width, img.resolution[0]);

    return [ox, oy, oz];
  }

  getResolutionFromZoomLevel(tileSize: number, z: number) {
    return (EARTH_CIRCUMFERENCE / tileSize) / (2 ** z);
  }

  getZoomLevelFromResolution(tileSize: number, resolution: number) {
    return Math.round(Math.log2(EARTH_CIRCUMFERENCE / (resolution * tileSize)));
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
   * Helper function to convert TMS tile coordinates to a Web Mercator bounding box.
   */
  tileToWebMercatorBBox(x: number, y: number, z: number) {
    const worldSize = 2 ** z;
    const tileExtent = 20037508.342789244 * 2; // Full extent of Web Mercator
    const tileSize = tileExtent / worldSize;

    const minX = -tileExtent / 2 + x * tileSize;
    const maxX = minX + tileSize;
    const minY = tileExtent / 2 - (y + 1) * tileSize;
    const maxY = minY + tileSize;

    return [minX, minY, maxX, maxY];
  }

  /**
   * Helper function to find the intersection of two bounding boxes.
   */
  getIntersection(bbox1, bbox2) {
    const minX = Math.max(bbox1[0], bbox2[0]);
    const minY = Math.max(bbox1[1], bbox2[1]);
    const maxX = Math.min(bbox1[2], bbox2[2]);
    const maxY = Math.min(bbox1[3], bbox2[3]);

    if (minX >= maxX || minY >= maxY) {
      return null; // No overlap
    }
    return [minX, minY, maxX, maxY];
  }

  /**
   * Creates a tile buffer of the specified size using a typed array corresponding to the provided data type.
   *
   * @param {string} dataType - A string specifying the data type (e.g., "Int32", "Float64", "UInt16", etc.).
   * @param {number} tileSize - The width/height of the square tile.
   * @returns {TypedArray} A typed array buffer of length tileSize * tileSize.
   */
  createTileBuffer(dataType, tileSize, numOfChannels) {
    const length = tileSize * tileSize * numOfChannels;
    switch (dataType) {
      case 'uint8':
        return new Uint8Array(length);
      case 'int8':
        return new Int8Array(length);
      case 'uint16':
        return new Uint16Array(length);
      case 'int16':
        return new Int16Array(length);
      case 'uint32':
        return new Uint32Array(length);
      case 'int32':
        return new Int32Array(length);
      case 'float32':
        return new Float32Array(length);
      case 'float64':
        return new Float64Array(length);
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  mercatorToTile(mercator, zoom) {
    const C = 40075016.68557849; // Earth's circumference in Mercator meters
    const n = 2 ** zoom;

    const tileX = Math.floor(n * ((mercator[0] + C / 2) / C));
    const tileY = Math.floor(n * ((C / 2 - mercator[1]) / C));

    return { x: tileX, y: tileY };
  }

  async getTile(x: number, y: number, z: number, bounds:Bounds, meshMaxError: number) {
    const imageIndex = this.getImageIndexForZoomLevel(z);
    const targetImage = this.cog.images[imageIndex];

    // Ensure the image is tiled
    // TO DO is it necessary if we are using COG?
    const tileWidth = targetImage.tileSize.width;
    const tileHeight = targetImage.tileSize.height;
    if (!tileWidth || !tileHeight) {
      throw new Error('The image is not tiled.');
    }

    const originTileIndex = this.mercatorToTile(targetImage.origin, z);
    // console.log('origin tile index', originTileIndex);

    // Calculate the map offset between the global Web Mercator origin and the COG's origin.
    // (Difference in map units.)
    // if X offset is large and positive (COG is far to the right of global origin)
    // if Y offset is large and positive (COG is far below global origin — expected)
    const offsetXMap = this.cogOrigin[0] - webMercatorOrigin[0];
    const offsetYMap = webMercatorOrigin[1] - this.cogOrigin[1];

    const tileResolution = (EARTH_CIRCUMFERENCE / tileWidth) / 2 ** z;
    const cogResolution = this.cogResolutionLookup[imageIndex];

    // Convert map offsets into pixel offsets.
    const offsetXPixel = Math.floor(offsetXMap / tileResolution);
    const offsetYPixel = Math.floor(offsetYMap / tileResolution);

    const imageHeight = targetImage.size.height;
    const imageWidth = targetImage.size.width;

    // approach by comparing bboxes of tile and cog image
    const tilePixelBbox = [
      x * tileWidth,
      y * tileHeight,
      (x + 1) * tileWidth,
      (y + 1) * tileHeight,
    ];

    const cogPixelBBox = [
      offsetXPixel,
      offsetYPixel,
      offsetXPixel + imageWidth,
      offsetYPixel + imageHeight,
    ];

    const intersecion = this.getIntersectionBBox(tilePixelBbox, cogPixelBBox, offsetXPixel, offsetYPixel, tileWidth);
    const [validWidth, validHeight, window, missingLeft, missingTop] = intersecion;

    // console.log('tileCount x', targetImage.tileCount.x);
    // console.log('tileCount y', targetImage.tileCount.y);
    //
    // console.log('x', x);
    // console.log('y', y);

    // 2. FIND GEOGRAPHIC INTERSECTION (same as before)
    const tileGeoBBox = this.tileToWebMercatorBBox(x, y, z);
    const cogGeoBBox = targetImage.bbox;
    const intersectionGeoBBox = this.getIntersection(tileGeoBBox, cogGeoBBox);
    if (!intersectionGeoBBox) {
      return null; // No data to render
    }

    // console.log('intersectionGeoBBox', intersectionGeoBBox);

    // 3. CONVERT INTERSECTION TO LOCAL PIXEL WINDOW (same as before)
    const [interMinX, interMinY, interMaxX, interMaxY] = intersectionGeoBBox;
    const [cogMinX, cogMinY, cogMaxX, cogMaxY] = cogGeoBBox;
    const cogResolutionNew = targetImage.resolution; // [resX, resY, resZ]

    const pixelWindow = {
      x: Math.round((interMinX - cogMinX) / cogResolutionNew[0]),
      y: Math.round((interMaxY - cogMaxY) / cogResolutionNew[1]), // Y is inverted from geo to pixel
      width: Math.round((interMaxX - interMinX) / cogResolutionNew[0]),
      height: Math.round((interMaxY - interMinY) / Math.abs(cogResolutionNew[1])),
    };

    if (pixelWindow.width <= 0 || pixelWindow.height <= 0) {
      return null;
    }

    // console.log('pixelWindow', pixelWindow);
    // console.log('window', window);
    // console.log('missingLeft', missingLeft);
    // console.log('missingTop', missingTop);

    // 4. IDENTIFY WHICH INTERNAL TILES COVER THE PIXEL WINDOW
    const { tileSize } = targetImage;
    // console.log('tileSize', tileSize);
    const tileXMin = Math.floor(pixelWindow.x / tileSize.width);
    const tileXMax = Math.floor((pixelWindow.x + pixelWindow.width - 1) / tileSize.width);
    const tileYMin = Math.floor(pixelWindow.y / tileSize.height);
    const tileYMax = Math.floor((pixelWindow.y + pixelWindow.height - 1) / tileSize.height);
    // console.log('tileXMin', tileXMin);
    // console.log('tileYMin', tileYMax);
    // console.log('tileXMax', tileXMax);
    // console.log('tileYMax', tileYMax);

    if (tileXMin !== tileXMax || tileYMin !== tileYMax) {
      // console.log('multiple tiles needed to cover the pixel window');
    }

    // 5. FETCH ALL REQUIRED TILES
    const tilePromises = [];
    const targetImageTilesCountX = targetImage.tileCount.x;
    const targetImageTilesCountY = targetImage.tileCount.y;

    if (targetImageTilesCountX === 1 && targetImageTilesCountY === 1) {
      if (x - originTileIndex.x === 0 && y - originTileIndex.y == 0) {
        // console.log('reading tile 0,0 for tiles: ', x, y, z);
        tilePromises.push(
          targetImage.getTile(0, 0).then((data) => ({
            data, index: [0, 0], window, missingLeft, missingTop,
          })),
        );
      } else if (window[1] > 0 && missingTop === 0) {
        // console.log("pokud potrebujeme jeste snimek v nahore, protoze missing top je nula, ale obrazek by zacal az od window[1")
        tilePromises.push(
          targetImage.getTile(0, 0).then((data) => ({
            data,
            index: [0, 0],
            window,
            missingLeft,
            missingTop,
          })),
        );
      } else if (window[0] > 0 && missingLeft === 0) {
        // console.log("pokud potrebujeme jeste snimek v pravo, protoze missing left je nula, ale obrazek by zacal az od window[0")
        tilePromises.push(
          targetImage.getTile(0, 0).then((data) => ({
            data,
            index: [0, 0],
            window,
            missingLeft,
            missingTop,
          })),
        );
      } else if (window[1] > 0 && missingTop === 0 && missingLeft === 0 && window[0] > 0) {
        // console.log("pokud potrebujeme jeste snimek sikmo vlevo nahore")
        tilePromises.push(
          targetImage.getTile(0, 0).then((data) => ({
            data,
            index: [0, 0],
            window,
            missingLeft,
            missingTop,
          })),
        );
      }
    }
    // for multiple tiles
    else {
      let tilesToRead = [];
      const intersectionHeight = window[3] - window[1];
      let missingLeftLocal = missingLeft;
      let missingTopLocal = missingTop;

      // by default, COG tile index which origin (upper left corner) is within the current web mercator tile.
      // since the COG does not have to be aligned with web mercator, usually this COG tile occupies lower right part of the web mercator tile
      // and then it is necessary to check/read also tiles to left and top and top left corner
      const defaultCOGTileIndex = [x - originTileIndex.x, y - originTileIndex.y];
      // check if the COG tile with this index exists. It does not have to, meaning that this web mercator tile is covered by left and/or top tile
      if (defaultCOGTileIndex[0] < targetImageTilesCountX && defaultCOGTileIndex[1] < targetImageTilesCountY) {
        // vzdy tam da dolni pravy obrazek, ale je nutne updatovat window, protoze pravy obrazek se musi nacitat od jeho horniho leveho rohu
        // takze kdyz window[0] zacina jinak nez 0, musi se to respektovat:
        const defaultTileWindow = [window[0], window[1], window[2], window[3]];

        if (window[0] > 0) {
          missingLeftLocal = tileWidth - window[0];
          defaultTileWindow[0] = 0;
          defaultTileWindow[2] = tileWidth - missingLeftLocal;
        }
        if (window[1] > 0) {
          missingTopLocal = tileHeight - window[1];
          defaultTileWindow[1] = 0;
          defaultTileWindow[3] = intersectionHeight - missingTopLocal;
        }

        tilesToRead.push({
          index: [defaultCOGTileIndex[0], defaultCOGTileIndex[1]],
          window: defaultTileWindow,
          missingLeft: missingLeftLocal,
          missingTop: missingTopLocal,
        });
      } else {
        console.log(`COG tile with index ${defaultCOGTileIndex} does not exist`);
      }

      // pokud potrebujeme jeste snimek vlevo, protoze missing left je nula, ale obrazek by zacal az od window[0
      if (window[0] > 0 && missingLeft === 0) {
        // console.log('pokud potrebujeme jeste snimek vlevo, protoze missing left je nula, ale obrazek by zacal az od window[0');
        // to do neresi kdyby ty tily byly 4, ale to by nemelo byt
        const tileToLeft = [defaultCOGTileIndex[0] - 1, defaultCOGTileIndex[1]];
        const window0 = defaultCOGTileIndex[0]==2? window[0]%tileWidth : window[0];
        const window2 = defaultCOGTileIndex[0]==2? window[2] - window[0] + window0 : window[2] - window[0];

        // const tileWindow3 = window[1] > 0 ? window[3]-window[1]-missingTopLocal : window[3];
        const tileWindow3 = window[1] > 0 ? window[1] - tileWidth%(window[1]-window[3]) : window[3];
        const missingTopForLeft = window[1] > 0 ? tileHeight - window[1] : missingTop;
        tilesToRead.push({
          index: tileToLeft,
          window: [window0, 0, window2, tileWindow3],
          missingLeft: 0,
          missingTop:missingTopForLeft,
        });
      }

      // pokud potrebujeme jeste snimek v nahore, protoze missing top je nula, ale obrazek by zacal az od window[1
      if (window[1] > 0 && missingTop === 0 && defaultCOGTileIndex[0] < targetImageTilesCountX) {
        // console.log("pokud potrebujeme jeste snimek v nahore, protoze missing top je nula, ale obrazek by zacal az od window[1")
        // to do neresi kdyby ty tily byly 4, ale to by nemelo byt
        const tileToTop = [defaultCOGTileIndex[0], defaultCOGTileIndex[1] - 1];

        if (tileToTop[1] >= 0) {
          tilesToRead.push({
            index: tileToTop,
            // tileHeight by melo jit nahradit missingTopLocal+window[1]
            window: [window[0], window[1], window[2], tileHeight],
            missingLeft,
            // missingTop: - window[1]
            missingTop: 0,
          });
        }
      }

      // pokud potrebujeme jeste snimek v sikmo vlevo nahore, protoze missing top je nula, a missing left taky w[1
      if (window[1] > 0 && missingTop === 0 && missingLeft === 0 && window[0] > 0) {
        // console.log("pokud potrebujeme jeste snimek sikmo vlevo nahore")
        const tileToTopLeft = [defaultCOGTileIndex[0] - 1, y - originTileIndex.y - 1];
        const window0 = window[0]%tileWidth
        const window2 = window0+(window[2] - window[0])%tileWidth+missingLeftLocal
        if (tileToTopLeft[1] >= 0 && tileToTopLeft[0] >= 0) {
          tilesToRead.push({
            index: tileToTopLeft,
            window: [window0, window[1], window2, tileHeight],
            // missingLeft: -window[0],
            missingLeft: 0,
            // missingTop: - window[1]
            missingTop: 0,
          });
        }
      }

      tilesToRead.forEach((tileToRead) => {
        tilePromises.push(
          targetImage.getTile(tileToRead.index[0], tileToRead.index[1]).then((data) => ({
            data, index: tileToRead.index, window: tileToRead.window, missingLeft: tileToRead.missingLeft, missingTop: tileToRead.missingTop,
          })),
        );
      });
      // for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
      //   for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
      //     // Store the promise and the tile's index for later processing
      //     // console.log(`For x: ${x} and y: ${y}, internal tileX: ${tileX}, tileY: ${tileY} `);
      //     tilePromises.push(
      //         targetImage.getTile(tileX, tileY).then(data => ({ data, tileX, tileY }))
      //     );
      //   }
      // }
    }

    const fetchedTiles = await Promise.all(tilePromises);

    // 6. DECOMPRESS, CROP, AND STITCH (CLIENT-SIDE LOGIC)
    // This part is highly dependent on the compression and your application's needs.
    // The `fetchedTiles` array now contains the raw, compressed data for every tile you need.

    // console.log(`Fetched ${fetchedTiles.length} tile(s) to construct the final image. With zoom index ${imageIndex}, zoom level ${z}.`);
    // console.log(fetchedTiles[0].data)

    // const wantedMpp = this.getResolutionFromZoomLevel(this.tileSize, z);
    // const img = this.cog.getImageByResolution(wantedMpp);
    // // await img.loadGeoTiffTags(1)
    // let offset: number[] = [0, 0];
    //
    // if (z === this.zoomRange[0]) {
    //   offset = this.lowestOriginTileOffset;
    // } else {
    //   const power = 2 ** (z - this.zoomRange[0]);
    //   offset[0] = Math.floor(this.lowestOriginTileOffset[0] * power);
    //   offset[1] = Math.floor(this.lowestOriginTileOffset[1] * power);
    // }
    // const tilesX = img.tileCount.x;
    // const tilesY = img.tileCount.y;
    // // console.log("------OFFSET IS------  " + offset[0] + " ; " + offset[1])
    //
    // const ox = offset[0];
    // const oy = offset[1];

    // console.log("Asking for " + Math.floor(x - ox) + " : " + Math.floor(y - oy))

    let decompressed: string;
    let decoded: any;
    const decodedNew = [];
    const decompressedFormattedNew = [];

    // this.options.numOfChannels = Number(img.tags.get(277).value);
    // this.options.noDataValue = this.getNoDataValue(img.tags);

    //     if (!this.options.format) {
    //       // More information about TIFF tags: https://www.awaresystems.be/imaging/tiff/tifftags.html
    //       this.options.format = this.getFormat(
    // img.tags.get(339).value as Array<number>,
    //       img.tags.get(258).value as Array<number>,
    //       );
    //     }

    // let bitsPerSample = img.tags.get(258)!.value;
    // if (Array.isArray(bitsPerSample)) {
    //   if (this.options.type === 'terrain') {
    //     let c = 0;
    //     bitsPerSample.forEach((sample) => {
    //       c += sample;
    //     });
    //     bitsPerSample = c;
    //   } else {
    //     [bitsPerSample] = bitsPerSample;
    //   }
    // }

    // const samplesPerPixel = img.tags.get(277)!.value
    // console.log("Samples per pixel:" + samplesPerPixel)
    // console.log("Bits per sample: " + bitsPerSample)
    // console.log("Single channel pixel format: " + bitsPerSample/)

    if (fetchedTiles.length > 0) {
      // console.log(`getting tile: ${[x - ox, y - oy]}`);
      // const tile = await img.getTile((x - ox), (y - oy));
      // console.time("Request to data time: ")
      // const tileNew = await targetImage.getTile(tileXMin, tileYMin);

      fetchedTiles.forEach((fetchedTile) => {
        switch (targetImage.compression) {
          case 'image/jpeg':
            // decodedNew.push(jpeg.decode(fetchedTile.data!.bytes, { useTArray: true }));
            fetchedTile.decoded = jpeg.decode(fetchedTile.data!.bytes, { useTArray: true });
            break;
          case 'application/deflate':
            // decodedNew.push(inflate(fetchedTile.data!.bytes));
            fetchedTile.decoded = inflate(fetchedTile.data!.bytes);
            break;
          case 'application/lzw':
            // decodedNew.push(this.lzw.decodeBlock(fetchedTile.data!.bytes.buffer));
            fetchedTile.decoded = this.lzw.decodeBlock(fetchedTile.data!.bytes.buffer);
            break;
          default:
            console.warn(`Unexpected compression method: ${targetImage.compression}`);
        }
      });

      // switch (img.compression) {
      //   case 'image/jpeg':
      //     decoded = jpeg.decode(tile!.bytes, { useTArray: true });
      //     break;
      //   case 'application/deflate':
      //     decoded = await inflate(tile!.bytes);
      //     break;
      //   case 'application/lzw':
      //     decoded = this.lzw.decodeBlock(tile!.bytes.buffer);
      //     break;
      //   default:
      //     console.warn(`Unexpected compression method: ${img.compression}`);
      // }
      //
      // let decompressedFormatted;

      // bitsPerSample = 8

      // switch (this.options.format) {
      //   case 'uint8':
      //     decompressedFormatted = new Uint8Array(decoded.buffer); break;
      //   case 'uint16':
      //     decompressedFormatted = new Uint16Array(decoded.buffer); break;
      //   case 'uint32':
      //     decompressedFormatted = new Uint32Array(decoded.buffer); break;
      //   case 'int8':
      //     decompressedFormatted = new Int8Array(decoded.buffer); break;
      //   case 'int16':
      //     decompressedFormatted = new Int16Array(decoded.buffer); break;
      //   case 'int32':
      //     decompressedFormatted = new Int32Array(decoded.buffer); break;
      //   case 'float32':
      //     decompressedFormatted = new Float32Array(decoded.buffer); break;
      //   case 'float64':
      //     decompressedFormatted = new Float64Array(decoded.buffer); break;
      //   default: decompressedFormatted = null;
      // }

      fetchedTiles.forEach((fetchedTile) => {
        switch (this.options.format) {
          case 'uint8':
            // decompressedFormattedNew.push(new Uint8Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Uint8Array(fetchedTile.decoded.buffer); break;
          case 'uint16':
            // decompressedFormattedNew.push(new Uint16Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Uint16Array(fetchedTile.decoded.buffer); break;
          case 'uint32':
            // decompressedFormattedNew.push(new Uint32Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Uint32Array(fetchedTile.decoded.buffer); break;
          case 'int8':
            // decompressedFormattedNew.push(new Int8Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Int8Array(fetchedTile.decoded.buffer); break;
          case 'int16':
            // decompressedFormattedNew.push(new Int16Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Int16Array(fetchedTile.decoded.buffer); break;
          case 'int32':
            // decompressedFormattedNew.push(new Int32Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Int32Array(fetchedTile.decoded.buffer); break;
          case 'float32':
            // decompressedFormattedNew.push(new Float32Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Float32Array(fetchedTile.decoded.buffer); break;
          case 'float64':
            // decompressedFormattedNew.push(new Float64Array(decodedTile.buffer)); break;
            fetchedTile.decompressed = new Float64Array(fetchedTile.decoded.buffer); break;
          default: decompressedFormattedNew.push(null);
        }
      });

      const tileBuffer = this.createTileBuffer(this.options.format, tileWidth, this.options.numOfChannels);
      // tileBuffer.fill(this.options.noDataValue);
      // const randomColor = Math.floor(Math.random() * (254 - 1 + 1) + 1)
      tileBuffer.fill(Math.floor(Math.random() * (254 - 1 + 1) + 1));

      fetchedTiles.forEach((fetchedTile) => {
        const validImageHeight = fetchedTile.window[3] - fetchedTile.window[1];
        const validImageWidth = fetchedTile.window[2] - fetchedTile.window[0];
        const randomColor = Math.floor(Math.random() * (254 - 1 + 1) + 1);

        for (let row = 0; row < validImageHeight; row++) {
          for (let col = 0; col < validImageWidth; col++) {
            // here I need to add check if the row/col value plus the missing top/left value is bigger or equal zero and smaller or equal tile width/height
            const destRow = row + fetchedTile.missingTop;
            const destCol = col + fetchedTile.missingLeft;
            // tileBuffer[destRow*tileWidth + destCol] = (row+window[0]+col+window[1])/2;
            tileBuffer[destRow * tileWidth + destCol] = fetchedTile.decompressed[(row+fetchedTile.window[1])*tileWidth + (col+fetchedTile.window[0])];
            // tileBuffer[destRow * tileWidth + destCol] = randomColor;
          }
        }
      });

      // console.log(validWidth, validHeight, window, missingLeft, missingTop)
      // for (let row = window[0]; row <= window[2]; row++) {
      //   for (let col = window[1]; col <= window[3]; col++) {
      //     // Compute the destination position in the tile buffer.
      //     // We shift by the number of missing pixels (if any) at the top/left.
      //     // const destRow = missingTop + row;
      //     const destRow =  row + missingTop;
      //     // const destCol = missingLeft+ row;
      //     const destCol =  col + missingLeft;
      //     tileBuffer[destRow * tileWidth + destCol] = decompressedFormattedNew[row * tileWidth + col];
      //   }
      // }
      // console.log(decompressedFormatted)

      // const { meshMaxError, bounds, elevationDecoder } = this.options;

      decompressed = await this.geo.getMap({
        // rasters: [decompressedFormatted],
        rasters: [tileBuffer],
        width: this.tileSize,
        height: this.tileSize,
        bounds,
      }, this.options, meshMaxError);

      // console.log(decompressed.length)

      return decompressed;
    }
    return null;
  }

  getFormat(sampleFormat: number[]|number, bitsPerSample:number[]|number) {
    // TO DO: what if there are different channels formats
    let uniqueSampleFormat = sampleFormat;
    let uniqueBitsPerSample = bitsPerSample;
    if (Array.isArray(sampleFormat)) { [uniqueSampleFormat] = sampleFormat; }
    if (Array.isArray(bitsPerSample)) { [uniqueBitsPerSample] = bitsPerSample; }

    let dataType;
    switch (uniqueSampleFormat) {
      case 1: // Unsigned integer
        switch (uniqueBitsPerSample) {
          case 8: dataType = 'uint8'; break;
          case 16: dataType = 'uint16'; break;
          case 32: dataType = 'uint32'; break;
          default: dataType = null;
        }
        break;
      case 2: // Signed integer
        switch (uniqueBitsPerSample) {
          case 8: dataType = 'int8'; break;
          case 16: dataType = 'int16'; break;
          case 32: dataType = 'int32'; break;
          default: dataType = null;
        }
        break;
      case 3: // Floating point
        switch (uniqueBitsPerSample) {
          case 32: dataType = 'float32'; break;
          case 64: dataType = 'float64'; break;
          default: dataType = null;
        }
        break;
      default:
        throw new Error('Unknown data format.');
    }
    // console.log('Data type is: ', dataType)
    return dataType;
  }

  // TO DO replace with mainImage.tags.get(TiffTag.GdalNoData).value
  getNoDataValue(tags) {
    if (tags.has(42113)) {
      const noDataValue = tags.get(42113).value;
      if (typeof noDataValue === 'string' || noDataValue instanceof String) {
        const parsedValue = noDataValue.replace(/[\0\s]/g, '');
        return Number(parsedValue);
      }
      return Number.isNaN(Number(noDataValue)) ? undefined : Number(noDataValue);
    }
    return undefined;
  }
}

export default CogTiles;
