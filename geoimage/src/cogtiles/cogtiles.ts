/* eslint 'max-len': [1, { code: 100, comments: 999, ignoreStrings: true, ignoreUrls: true }] */
// COG loading
import { Tiff, TiffImage } from '@cogeotiff/core';
import { SourceHttp } from '@chunkd/source-http';
import { fromUrl, GeoTIFF, GeoTIFFImage } from 'geotiff';

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

  cogGT: GeoTIFF;

  cogZoomLookup = [0];

  cogResolutionLookup = [0];

  cogOrigin = [0, 0];

  zoomRange = [0, 0];

  tileSize: number;

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
      const res = await fetch(input, init);
      return res;
    };

    const source = new SourceHttp(url);
    this.cog = await Tiff.create(source);
    this.cogGT = await fromUrl(url);
    const imageGT = await this.cogGT.getImage(); // by default, the first image is read.
    this.cogOrigin = imageGT.getOrigin();
    this.options.noDataValue ??= this.getNoDataValueGT(imageGT);
    this.options.format ??= this.getDataTypeFromTags(imageGT);
    this.options.numOfChannels = this.getNumberOfChannels(imageGT);
    this.options.planarConfig = this.getPlanarConfiguration(imageGT);
    [this.cogZoomLookup, this.cogResolutionLookup] = await this.buildCogZoomResolutionLookup(this.cogGT);

    // Load our data tile from url, arraybuffer, or blob, so we can work with it:
    // const tiffGT = await fromUrl(url);
    // const imageCountGT = await tiffGT.getImageCount();
    // console.log(`imageCountGT: ${imageCountGT}`);
    // console.log(imageGT);

    // const lastImageGT = await tiffGT.getImage(imageCountGT - 1);
    // console.dir(lastImageGT);
    // console.log(`last tilesX: ${Math.ceil(lastImageGT.getWidth() / lastImageGT.getTileWidth())}`);
    //
    // console.log(`image 0: width: ${imageGT.getWidth()}, height: ${imageGT.getHeight()}, tileWidth: ${imageGT.getTileWidth()}, tileHeight: ${imageGT.getTileHeight()}, samplesPerPixel: ${imageGT.getSamplesPerPixel()}`);
    // console.log(`image 11: width: ${lastImageGT.getWidth()}, height: ${lastImageGT.getHeight()}, tileWidth: ${lastImageGT.getTileWidth()}, tileHeight: ${lastImageGT.getTileHeight()}, samplesPerPixel: ${lastImageGT.getSamplesPerPixel()}`);
    //
    // // when we are actually dealing with geo-data the following methods return
    // // meaningful results:
    // console.log(`image 0: origin: ${imageGT.getOrigin()}, resolution: ${imageGT.getResolution()}, bbox: ${imageGT.getBoundingBox()}`);
    // console.log(imageGT.getGeoKeys());
    // // console.log(`image 11: origin: ${lastImageGT.getOrigin()}, resolution: ${lastImageGT.getResolution()}, bbox: ${lastImageGT.getBoundingBox()}`);

    this.cog.images.forEach((image:TiffImage) => {
      image.loadGeoTiffTags();
    });

    // const targetZoomLevel = 2;
    // const imageCount = await tiffGT.getImageCount();
    // // Get the expected resolution for the target zoom level from our lookup table:
    // const expectedResolution = webMercatorResolutions[targetZoomLevel];
    //
    // // Use the first image as the base (which should have full metadata)
    // const baseImage = await tiffGT.getImage();
    // const baseResolution = baseImage.getResolution()[0]; // m/pixel at full resolution
    // const baseWidth = baseImage.getWidth();
    //
    // let bestImageIndex = 0;
    // let bestDiff = Infinity;
    //
    // for (let idx = 0; idx < imageCount; idx ++) {
    //   // eslint-disable-next-line no-await-in-loop
    //   const image = await tiffGT.getImage(idx);
    //   const width = image.getWidth();
    //
    //   // Estimate the image's resolution by comparing its width to the base image.
    //   const scaleFactor = baseWidth / width;
    //   const estimatedResolution = baseResolution * scaleFactor;
    //
    //   // Difference from the expected resolution
    //   const diff = Math.abs(estimatedResolution - expectedResolution);
    //   if (diff < bestDiff) {
    //     bestDiff = diff;
    //     bestImageIndex = idx;
    //   }
    // }
    // console.log('for zoom level ', targetZoomLevel, ' we want image index ', bestImageIndex);

    // const getImageIndexForZoomLevel = (zoom) => {
    //   const minZoom = cogZoomLookup[cogZoomLookup.length - 1];
    //   const maxZoom = cogZoomLookup[0];
    //   if (zoom > maxZoom) return 0;
    //   if (zoom < minZoom) return cogZoomLookup.length - 1;
    //   return cogZoomLookup.indexOf(zoom);
    // };

    // console.log('for zoom level ', targetZoomLevel, ' we want image index ', getImageIndexForZoomLevel(targetZoomLevel));
    //
    // const targetImage = await tiffGT.getImage(getImageIndexForZoomLevel(targetZoomLevel));
    // console.log('target image index ', targetImage);
    //
    // async function getTileFromImage(image, tileX, tileY) {
    //   // Ensure the image is tiled
    //   const tileWidth = image.getTileWidth();
    //   const tileHeight = image.getTileHeight();
    //   if (!tileWidth || !tileHeight) {
    //     throw new Error('The image is not tiled.');
    //   }

    // Calculate the pixel boundaries for the tile.
    // For example, if tile indices start at (0,0):
    // const window = [
    //   tileX * tileWidth, // startX
    //   tileY * tileHeight, // startY
    //   (tileX + 1) * tileWidth, // endX (exclusive)
    //   (tileY + 1) * tileHeight, // endY (exclusive)
    // ];

    // Now read the raster data for that tile window.
    // const tileData = await image.readRasters({ window });
    // return tileData;
    // }

    // console.log(await getTileFromImage(targetImage, 1, 1));

    // const tilesX = Math.ceil(imageGT.getWidth() / imageGT.getTileWidth());
    // console.log(`image GT tilesX: ${tilesX}`);
    // console.log(`old image tiles X: ${this.cog.images[0].tileCount.x}`);

    this.tileSize = this.getTileSize(this.cog);
    // console.log('tileSize old: ', this.tileSize);
    // console.log('tileSize new: ', imageGT.getTileWidth());
    //
    // console.log('getResolution new: ', imageGT.getResolution());
    // console.log('getResolution old: ', this.cog.images[0].resolution);

    this.lowestOriginTileOffset = this.getImageTileIndex(
      this.cog.images[this.cog.images.length - 1],
    );
    // console.log('lowestOriginTileOffset old: ', this.lowestOriginTileOffset);

    this.zoomRange = this.getZoomRange(this.cog);
    // console.log('zoomRange old: ', this.zoomRange);

    // const zoomRangeGT = this.getZoomRangeGT(imageGT, imageCountGT);
    // console.log('zoomRangeGT new: ', zoomRangeGT);

    return this.cog;
  }

  getTileSize(cog: Tiff) {
    return cog.images[cog.images.length - 1].tileSize.width;
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

  // getZoomRangeGT(img: GeoTIFFImage, imgCount: number) {
  //   const maxZoom = this.getZoomLevelFromResolution(img.getTileWidth(), img.getResolution()[0]);
  //   const minZoom = maxZoom - (imgCount - 1);
  //
  //   return [minZoom, maxZoom];
  // }

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
    const targetImage = await this.cogGT.getImage(imageIndex);

    // Ensure the image is tiled
    const tileWidth = targetImage.getTileWidth();
    const tileHeight = targetImage.getTileHeight();
    if (!tileWidth || !tileHeight) {
      throw new Error('The image is not tiled.');
    }

    // Calculate the map offset between the global Web Mercator origin and the COG's origin.
    // (Difference in map units.)
    const offsetXMap = this.cogOrigin[0] - webMercatorOrigin[0];
    const offsetYMap = this.cogOrigin[1] - webMercatorOrigin[1];

    // Convert map offsets into pixel offsets.
    const offsetXPixel = Math.floor(offsetXMap / this.cogResolutionLookup[imageIndex]);
    const offsetYPixel = Math.floor(offsetYMap / this.cogResolutionLookup[imageIndex]);

    // Calculate the pixel boundaries for the tile.
    const window = [
      tileX * tileWidth - offsetXPixel, // startX
      tileY * tileHeight - Math.abs(offsetYPixel), // startY
      (tileX + 1) * tileWidth - offsetXPixel, // endX (exclusive)
      (tileY + 1) * tileHeight - Math.abs(offsetYPixel), // endY (exclusive)
    ];

    // Get image dimensions.
    const imageWidth = targetImage.getWidth();
    const imageHeight = targetImage.getHeight();

    const [windowStartX, windowStartY, windowEndX, windowEndY] = window;

    // Determine the effective (valid) window inside the image:
    const effectiveStartX = Math.max(0, windowStartX);
    const effectiveStartY = Math.max(0, windowStartY);
    const effectiveEndX = windowEndX;
    const effectiveEndY = windowEndY;

    // Calculate how many pixels are missing from the left and top due to negative windowStart.
    const missingLeft = Math.max(0, 0 - windowStartX);
    const missingTop = Math.max(0, 0 - windowStartY);

    // Read only the valid window from the image.
    const validWindow = [effectiveStartX, effectiveStartY, effectiveEndX, effectiveEndY];

    // Read the raster data for the tile window with shifted origin.
    if (missingLeft > 0 || missingTop > 0) {
      // Prepare the final tile buffer and fill it with noDataValue.
      const tileBuffer = this.createTileBuffer(this.options.format, tileWidth);
      tileBuffer.fill(this.options.noDataValue);

      // Calculate the width of the valid window.
      const validWidth = effectiveEndX - effectiveStartX;
      const validHeight = effectiveEndY - effectiveStartY;

      // if the valid window is smaller than tile size, it gets the image size width and height, thus validRasterData.width must be used as below
      const validRasterData = await targetImage.readRasters({ window: validWindow });

      // FOR MULTI-BAND - the result is array of arrays, each band is stored in separate array
      // similar approach should be used if deck.gl-layers, but it is not compatible with the code in geoimage.ts in deck.gl-geotiff
      // let validTileData = Array(validRasterData.length);
      //
      // // Place the valid pixel data into the tile buffer.
      // for (let band = 0; band < validRasterData.length; band++) {
      //   for (let row = 0; row < validHeight; row++) {
      //     for (let col = 0; col < validWidth; col++) {
      //       // Compute the destination position in the tile buffer.
      //       // We shift by the number of missing pixels (if any) at the top/left.
      //       const destRow = Math.floor(missingTop) + row;
      //       const destCol = Math.floor(missingLeft) + col;
      //       if (destRow < tileWidth && destCol < tileWidth) {
      //         tileBuffer[destRow * tileWidth + destCol] = validRasterData[band][row * validRasterData.width + col];
      //       } else {
      //         console.log('error in assigning data to tile buffer');
      //       }
      //     }
      //   }
      //   validImageData[band] = tileBuffer;
      // }
      // return validImageData;

      // FOR MULTI-BAND - the result is one array with sequentially typed bands, firstly all data for the band 0, then for band 1
      // I think this is less practical then the commented solution above, but I do it so it works with the code in geoimage.ts in deck.gl-geoimage in function getColorValue.
      let validImageData = Array(validRasterData.length * validRasterData[0].length);
      validImageData.fill(this.options.noDataValue);

      // Place the valid pixel data into the tile buffer.
      for (let band = 0; band < validRasterData.length; band++) {
        for (let row = 0; row < validHeight; row++) {
          for (let col = 0; col < validWidth; col++) {
            // Compute the destination position in the tile buffer.
            // We shift by the number of missing pixels (if any) at the top/left.
            const destRow = Math.floor(missingTop) + row;
            const destCol = Math.floor(missingLeft) + col;
            if (destRow < tileWidth && destCol < tileWidth) {
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

      // FOR SINGLE BAND DATA ONLY
      // We assume single-band data (rasterData[0]).
      // for (let row = 0; row < validHeight; row++) {
      //   for (let col = 0; col < validWidth; col++) {
      //     // Compute the destination position in the tile buffer.
      //     // We shift by the number of missing pixels (if any) at the top/left.
      //     const destRow = Math.floor(missingTop) + row;
      //     const destCol = Math.floor(missingLeft) + col;
      //     if (destRow < tileWidth && destCol < tileWidth) {
      //       tileBuffer[destRow * tileWidth + destCol] = validRasterData[0][row * validRasterData.width + col];
      //     } else {
      //       console.log('error in assigning data to tile buffer');
      //     }
      //   }
      // }
      // return [tileBuffer];
    }

    // Read the raster data for the non shifted tile window.
    const tileData = await targetImage.readRasters({ window, interleave: true});
    return [tileData];
  }

  async getTile(x: number, y: number, z: number, bounds:Bounds, meshMaxError: number) {
    const tileData = await this.getTileFromImage(x, y, z);
    const wantedMpp = this.getResolutionFromZoomLevel(this.tileSize, z);
    // tile size can be calculated also with the geotiffjs library imageGT.getTileWidth()
    // const targetMetersPerPixel = this.getResolutionFromZoomLevel(this.tileSize, z);
    const img = this.cog.getImageByResolution(wantedMpp);
    // const img = this.cog.getImageByResolution(targetMetersPerPixel);
    // here should be get image by zoom level / resolution
    // await img.loadGeoTiffTags(1)
    // let offset: number[] = [0, 0];

    // if (z === this.zoomRange[0]) {
    //   offset = this.lowestOriginTileOffset;
    // } else {
    //   const power = 2 ** (z - this.zoomRange[0]);
    //   offset[0] = Math.floor(this.lowestOriginTileOffset[0] * power);
    //   offset[1] = Math.floor(this.lowestOriginTileOffset[1] * power);
    // }
    // const tilesX = img.tileCount.x;
    // const tilesY = img.tileCount.y;
    // console.log("------OFFSET IS------  " + offset[0] + " ; " + offset[1])

    // const ox = offset[0];
    // const oy = offset[1];

    // console.log("Asking for " + Math.floor(x - ox) + " : " + Math.floor(y - oy))

    let decompressed: string;
    let decoded: any;

    // this.options.numOfChannels = Number(img.tags.get(277).value);
    // this.options.noDataValue = this.getNoDataValue(img.tags);

    //     if (!this.options.format) {
    //       // More information about TIFF tags: https://www.awaresystems.be/imaging/tiff/tifftags.html
    //       this.options.format = this.getFormat(
    // img.tags.get(339).value as Array<number>,
    //       img.tags.get(258).value as Array<number>,
    //       );
    //     }

    let bitsPerSample = img.tags.get(258)!.value;
    if (Array.isArray(bitsPerSample)) {
      if (this.options.type === 'terrain') {
        let c = 0;
        bitsPerSample.forEach((sample) => {
          c += sample;
        });
        bitsPerSample = c;
      } else {
        [bitsPerSample] = bitsPerSample;
      }
    }

    // const samplesPerPixel = img.tags.get(277)!.value
    // console.log("Samples per pixel:" + samplesPerPixel)
    // console.log("Bits per sample: " + bitsPerSample)
    // console.log("Single channel pixel format: " + bitsPerSample/)

    // if (x - ox >= 0 && y - oy >= 0 && x - ox < tilesX && y - oy < tilesY) {
    //   // console.log(`getting tile: ${[x - ox, y - oy]}`);
    //   const tile = await img.getTile((x - ox), (y - oy));
    //   // console.time("Request to data time: ")
    //
    //   switch (img.compression) {
    //     case 'image/jpeg':
    //       decoded = jpeg.decode(tile!.bytes, { useTArray: true });
    //       break;
    //     case 'application/deflate':
    //       decoded = await inflate(tile!.bytes);
    //       break;
    //     case 'application/lzw':
    //       decoded = this.lzw.decodeBlock(tile!.bytes.buffer);
    //       break;
    //     default:
    //       console.warn(`Unexpected compression method: ${img.compression}`);
    //   }
    //
    //   let decompressedFormatted;
    //   // bitsPerSample = 8
    //
    //   switch (this.options.format) {
    //     case 'uint8':
    //       decompressedFormatted = new Uint8Array(decoded.buffer); break;
    //     case 'uint16':
    //       decompressedFormatted = new Uint16Array(decoded.buffer); break;
    //     case 'uint32':
    //       decompressedFormatted = new Uint32Array(decoded.buffer); break;
    //     case 'int8':
    //       decompressedFormatted = new Int8Array(decoded.buffer); break;
    //     case 'int16':
    //       decompressedFormatted = new Int16Array(decoded.buffer); break;
    //     case 'int32':
    //       decompressedFormatted = new Int32Array(decoded.buffer); break;
    //     case 'float32':
    //       decompressedFormatted = new Float32Array(decoded.buffer); break;
    //     case 'float64':
    //       decompressedFormatted = new Float64Array(decoded.buffer); break;
    //     default: decompressedFormatted = null;
    //   }
    //
    //   console.log(decompressedFormatted);
    //
    //   // const { meshMaxError, bounds, elevationDecoder } = this.options;
    //
    //   decompressed = await this.geo.getMap({
    //     rasters: [tileData[0]],
    //     width: this.tileSize,
    //     height: this.tileSize,
    //     bounds,
    //   }, this.options, meshMaxError);
    //
    //   // console.log(decompressed.length)
    //
    //   return decompressed;
    // }
    // return null;
    decompressed = await this.geo.getMap({
      rasters: [tileData[0]],
      width: this.tileSize,
      height: this.tileSize,
      bounds,
    }, this.options, meshMaxError);

    return decompressed;
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

  getFormat(sampleFormat: number[]|number, bitsPerSample:number[]|number) {
    // TODO: what if there are different channels formats
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

  /**
   * Extracts the noData value from a GeoTIFF.js image.
   * Returns the noData value as a number if available, otherwise undefined.
   *
   * @param {GeoTIFFImage} image - The GeoTIFF.js image.
   * @returns {number|undefined} The noData value as a number, or undefined if not available.
   */
  getNoDataValueGT(image) {
    // Attempt to retrieve the noData value via the GDAL method.
    const noDataRaw = image.getGDALNoData();

    if (noDataRaw === undefined || noDataRaw === null) {
      console.log('noDataValue is undefined or null,raster might be displayed incorrectly.');
      // No noData value is defined
      return undefined;
    }

    // In geotiff.js, the noData value is typically returned as a string.
    // Clean up the string by removing any null characters or extra whitespace.
    const cleanedValue = String(noDataRaw).replace(/\0/g, '').trim();

    const parsedValue = Number(cleanedValue);
    return Number.isNaN(parsedValue) ? undefined : parsedValue;
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
