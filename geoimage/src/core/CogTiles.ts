import { fromUrl, GeoTIFF, GeoTIFFImage, type BlockedSourceOptions } from 'geotiff';

// Bitmap styling
import GeoImage from './GeoImage';
import { GeoImageOptions, TileResult, TypedArray } from './types';
import { ReliefCompositor } from './lib/ReliefCompositor';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
const EARTH_HALF_CIRCUMFERENCE = EARTH_CIRCUMFERENCE / 2;
const webMercatorOrigin = [-20037508.342789244, 20037508.342789244];
const webMercatorRes0 = 156543.03125;

const CogTilesGeoImageOptionsDefaults = {
  blurredTexture: true,
};

class CogTiles {
  cog!: GeoTIFF;

  cogZoomLookup: number[] = [];
  cogResolutionLookup: number[] = [];

  cogOrigin: number[] = [0, 0];

  zoomRange: number[] = [0, 0];

  tileSize: number = 256;

  bounds: [number, number, number, number] = [0, 0, 0, 0];

  geo: GeoImage = new GeoImage();
  options: GeoImageOptions;

  // TileResult cache — keyed by z/x/y/meshMaxError.
  // Each entry owns an AbortController and a caller reference count.
  // The pipeline is aborted only when ALL callers have cancelled (ref-count → 0),
  // so concurrent deck.gl requests for the same tile share one in-flight fetch/tessellation
  // and individual tile cancellations (e.g. from panning) do not poison other callers.
  // Once the promise settles (resolved or rejected), controller/callerCount are irrelevant;
  // future cache hits just await the already-resolved promise directly.
  private tileResultCache: Map<string, {
    promise: Promise<TileResult | null>;
    controller: AbortController;
    callerCount: number;
    settled: boolean;
  }> = new Map();
  private readonly tileResultCacheMaxSize = 32;

  private getTileResultCacheKey(x: number, y: number, z: number, meshMaxError: number, skipTexture: boolean): string {
    return `${z}/${x}/${y}/${meshMaxError}/${skipTexture ? '1' : '0'}`;
  }

  /** Clears the TileResult cache. Call when the COG URL or meshMaxError changes. */
  clearTileResultCache(): void {
    // Abort any in-flight pipelines so their network requests are cancelled
    for (const entry of this.tileResultCache.values()) {
      if (!entry.settled) entry.controller.abort();
    }
    this.tileResultCache.clear();
  }

  // Raw raster cache for ordinary bitmap layers — saves network fetch + decompression on revisit.
  // BitmapGenerator is cheap to re-run from cached raster; no need to hold ImageBitmaps in memory.
  private rasterCache: Map<string, Promise<TypedArray[]>> = new Map();
  private readonly rasterCacheMaxSize = 64;

  // Relief mask cache for bitmap + glaze layers — saves network fetch + kernel convolution on revisit.
  // Stores the Float32Array output of composeSwissRelief; BitmapGenerator re-runs from it cheaply.
  private reliefMaskCache: Map<string, Promise<Uint8ClampedArray>> = new Map();
  private readonly reliefMaskCacheMaxSize = 64;

  private getTileCacheKey(x: number, y: number, z: number): string {
    return `${z}/${x}/${y}`;
  }

  // Cache GeoTIFFImage Promises by index to prevent redundant HTTP requests from geotiff 3.0.4+ eager loading
  // Stores Promises (not resolved values) so concurrent requests share the same getImage() call
  private imageCache: Map<number, Promise<GeoTIFFImage>> = new Map();

  // Store initialization promise to prevent concurrent duplicate initializations
  private initializePromise?: Promise<void>;

  // Track the last successfully initialized URL to detect URL changes
  private lastInitializedUrl?: string;

  constructor(options: GeoImageOptions) {
    this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };
  }

  async initializeCog(url: string) {
    // Return existing initialization promise if already in progress (prevents concurrent duplicates)
    if (this.initializePromise) return this.initializePromise;
    // Clear all caches only if URL changed (preserves cache on idempotent re-init)
    if (this.lastInitializedUrl !== url) {
      this.clearTileResultCache();
      this.rasterCache.clear();
      this.reliefMaskCache.clear();
    }
    if (this.cog) return;

    this.initializePromise = (async () => {
      try {
        // fromUrl's type declaration only exposes RemoteSourceOptions, but the implementation
        // also accepts BlockedSourceOptions (forwarded to makeFetchSource internally).
        // Explicitly enabling BlockedSource restores the block-level LRU cache that was
        // accidentally active in geotiff 3.0.3 (due to a null vs undefined bug there).
        // blockSize defaults to 65536 (64KB) and can be tuned via GeoImageOptions.
        const blockSize = this.options.blockSize ?? 65536;
        this.cog = await (fromUrl as any)(url, { blockSize } as BlockedSourceOptions);
        const imagePromise = this.cog.getImage();
        this.imageCache.set(0, imagePromise);  // Cache base image (index 0) to avoid re-fetching during getTileFromImage
        const image = await imagePromise;
        const fileDirectory = image.fileDirectory;

        this.cogOrigin = image.getOrigin();

        this.options.noDataValue ??= await this.getNoDataValue(image);
        this.options.format ??= await this.getDataTypeFromTags(fileDirectory) as GeoImageOptions['format'];

        this.options.numOfChannels = fileDirectory.getValue('SamplesPerPixel');
        this.options.planarConfig = fileDirectory.getValue('PlanarConfiguration');

        [this.cogZoomLookup, this.cogResolutionLookup] = await this.buildCogZoomResolutionLookup(this.cog);

        this.tileSize = image.getTileWidth();

        // 1. Validation: Ensure the image is tiled
        if (!this.tileSize || !image.getTileHeight()) {
          throw new Error(
            'GeoTIFF Error: The provided image is not tiled. '
            + 'Please use "rio cogeo create --web-optimized" to fix this.',
          );
        }

        this.zoomRange = this.calculateZoomRange(
          this.tileSize, image.getResolution()[0], await this.cog.getImageCount()
        );

        this.bounds = this.calculateBoundsAsLatLon(image.getBoundingBox());

        // Mark initialization complete for this URL (used to detect URL changes)
        this.lastInitializedUrl = url;
      } catch (error) {
        // Reset initialization promise on error so retry can be attempted
        this.initializePromise = undefined;
        /* eslint-disable no-console */
        console.error(`[CogTiles] Failed to initialize COG from ${url}:`, error);
        throw error;
      }
    })();

    return this.initializePromise;
  }

  getZoomRange() {
    return this.zoomRange;
  }

  calculateZoomRange(tileSize: number, resolution: number, imgCount: number) {
    const maxZoom = this.getZoomLevelFromResolution(tileSize, resolution);
    const minZoom = maxZoom - (imgCount - 1);

    return [minZoom, maxZoom];
  }

  calculateBoundsAsLatLon(bbox: number[]){
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
    const x = input[0];
    const y = input[1];

    const lon = (x / EARTH_HALF_CIRCUMFERENCE) * 180;
    let lat = (y / EARTH_HALF_CIRCUMFERENCE) * 180;

    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);

    return [lon, lat] as [number, number];
  }
    // return cartographicPositionAdjusted;
  // }

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
  async buildCogZoomResolutionLookup(cog: GeoTIFF) {
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
  getImageIndexForZoomLevel(zoom: number): number {
    // Retrieve the minimum and maximum zoom levels from the lookup table.
    const minZoom = this.cogZoomLookup[this.cogZoomLookup.length - 1];
    const maxZoom = this.cogZoomLookup[0];
    if (zoom > maxZoom) return 0;
    if (zoom < minZoom) return this.cogZoomLookup.length - 1;

    // For zoom levels within the available range, find the exact or closest matching index.
    const exactMatchIndex = this.cogZoomLookup.indexOf(zoom);
    if (exactMatchIndex !== -1) {
      return exactMatchIndex;
    }

    // No exact match: find the closest zoom level
    let closestIndex = 0;
    let minDistance = Math.abs(this.cogZoomLookup[0] - zoom);
    for (let i = 1; i < this.cogZoomLookup.length; i += 1) {
      const distance = Math.abs(this.cogZoomLookup[i] - zoom);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  async getTileFromImage(tileX: number, tileY: number, zoom: number, fetchSize?: number, signal?: AbortSignal) {
    // Create a fresh local AbortController for this specific fetch.
    // We do NOT pass `signal` directly to readRasters because deck.gl may reuse tile
    // objects whose signal is already aborted (same tile re-requested after viewport change).
    // An already-aborted signal passed to geotiff.js immediately cancels the fetch,
    // leaving the tile permanently empty. Instead, we only forward cancellation when
    // the signal fires WHILE the request is actually in flight.
    const controller = new AbortController();
    if (signal && !signal.aborted) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const localSignal = controller.signal;

    try {
      const imageIndex = this.getImageIndexForZoomLevel(zoom);
      
      // Cache Promises to share in-flight requests across concurrent tiles at the same overview
      let imagePromise = this.imageCache.get(imageIndex);
      if (!imagePromise) {
        imagePromise = this.cog.getImage(imageIndex);
        this.imageCache.set(imageIndex, imagePromise);
      }
      const targetImage = await imagePromise;

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
    const FETCH_SIZE = fetchSize || TILE_SIZE; // Default to 256 if not provided
    const startX = Math.round(windowMinX);
    const startY = Math.round(windowMinY);
    const endX = startX + FETCH_SIZE;
    const endY = startY + FETCH_SIZE;

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
      return [this.createEmptyTile(FETCH_SIZE)];
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
    // We strictly compare against FETCH_SIZE because that is our target buffer dimension.
    if (missingLeft > 0 || missingTop > 0 || readWidth < FETCH_SIZE || readHeight < FETCH_SIZE) {
      const numChannels = this.options.numOfChannels || 1;

      // Initialize with a TypedArray of the full target size and correct data type
      const validImageData = this.createTileBuffer(this.options.format || 'Float32', FETCH_SIZE, numChannels);
      if (this.options.noDataValue !== undefined) {
        validImageData.fill(this.options.noDataValue);
      }

      // if the valid window is smaller than the tile size, it gets the image size width and height, thus validRasterData.width must be used as below
      const validRasterData = await targetImage.readRasters({ window, signal: localSignal });

      // Place the valid pixel data into the tile buffer.
      for (let band = 0; band < validRasterData.length; band += 1) {
        // We must reset the buffer for each band, otherwise data from previous band persists in padding areas
        const tileBuffer = this.createTileBuffer(this.options.format || 'Float32', FETCH_SIZE);
        if (this.options.noDataValue !== undefined) {
          tileBuffer.fill(this.options.noDataValue);
        }

        for (let row = 0; row < readHeight; row += 1) {
          const destRow = missingTop + row;
          const destRowOffset = destRow * FETCH_SIZE;
          const srcRowOffset = row * (validRasterData as any).width;

          for (let col = 0; col < readWidth; col += 1) {
            // Compute the destination position in the tile buffer.
            const destCol = missingLeft + col;
            // Bounds Check: Ensure we don't write outside the allocated buffer
            if (destRow < FETCH_SIZE && destCol < FETCH_SIZE) {
              tileBuffer[destRowOffset + destCol] = validRasterData[band][srcRowOffset + col];
            } else {
              console.error(`[CogTiles] tile buffer bounds exceeded: destRow ${destRow}, destCol ${destCol}, FETCH_SIZE ${FETCH_SIZE}`);
            }
          }
        }
        for (let i = 0; i < tileBuffer.length; i += 1) {
          validImageData[i * numChannels + band] = tileBuffer[i];
        }
      }
      return [validImageData];
    }

    // Case B: Perfect Match (Optimization)
    // If the read window is exactly 256x256 and aligned, we can read directly interleaved.
    const tileData = await targetImage.readRasters({ window, interleave: true, signal: localSignal });
    return [tileData];
  } catch (error) {
    // If the signal was aborted (or geotiff.js threw AggregateError wrapping an abort),
    // re-throw as a standard AbortError so deck.gl handles tile cancellation gracefully
    // and suppressGlobalAbortErrors() can suppress the unhandled rejection noise.
    const isAbortRelated = localSignal.aborted
      || (error instanceof AggregateError && error.errors?.some(
        (e: any) => e?.name === 'AbortError' || e?.message?.includes('aborted') || e?.message?.includes('abort')
      ))
      || (error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.message === 'Request was aborted');

    if (isAbortRelated) {
      throw new DOMException('Tile request aborted', 'AbortError');
    }
    throw error;
  }
}

  /**
   * Creates a blank tile buffer filled with the "No Data" value.
   * @param size The width/height of the square tile (e.g., 256 or 257)
   */
  createEmptyTile(size?: number) {
    const s = size || this.tileSize; // Defaults to 256
    const channels = this.options.numOfChannels || 1;
    const totalSize = s * s * channels;

    const tileData = new Float32Array(totalSize);

    if (this.options.noDataValue !== undefined) {
      tileData.fill(this.options.noDataValue);
    }

    return tileData;
  }

  async getTile(x: number, y: number, z: number, bounds?: Bounds, meshMaxError?: number, signal?: AbortSignal, skipTexture?: boolean): Promise<TileResult | null> {
    // cellSizeMeters is derived purely from tile coordinates — compute once for all paths
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / Math.pow(2, z))));
    const tileWidthMeters = (EARTH_CIRCUMFERENCE / Math.pow(2, z)) * Math.cos(latRad);
    const cellSizeMeters = tileWidthMeters / this.tileSize;

    const isTerrain = this.options.type === 'terrain';
    const isGlaze = this.options.type === 'image' && this.options.useReliefGlaze;

    // ── PATH A: Terrain ──────────────────────────────────────────────────────────
    // Full TileResult (mesh + raw + texture) cached with ref-counted abort so that
    // panning cancels in-flight fetches only when ALL callers have cancelled.
    if (isTerrain) {
      const skipTextureFlag = skipTexture ?? this.options.skipTexture ?? false;
      const cacheKey = this.getTileResultCacheKey(x, y, z, meshMaxError ?? 4.0, skipTextureFlag);
      const existing = this.tileResultCache.get(cacheKey);

      if (existing) {
        if (existing.settled) {
          if (signal?.aborted) return null;
          return existing.promise;
        }
        existing.callerCount += 1;
        if (signal && !signal.aborted) {
          signal.addEventListener('abort', () => {
            existing.callerCount -= 1;
            if (existing.callerCount <= 0 && !existing.settled) {
              existing.controller.abort();
            }
          }, { once: true });
        }
        const result = await existing.promise;
        if (signal?.aborted) return null;
        return result;
      }

      const controller = new AbortController();
      const entry = {
        promise: null as unknown as Promise<TileResult | null>,
        controller,
        callerCount: 1,
        settled: false,
      };

      if (signal && !signal.aborted) {
        signal.addEventListener('abort', () => {
          entry.callerCount -= 1;
          if (entry.callerCount <= 0 && !entry.settled) {
            entry.controller.abort();
          }
        }, { once: true });
      }

      const pipeline: Promise<TileResult | null> = (async () => {
        const isKernel = this.options.useSlope || this.options.useHillshade || this.options.useSwissRelief;
        const requiredSize = this.tileSize + (isKernel ? 2 : 1);
        const tileData = await this.getTileFromImage(x, y, z, requiredSize, controller.signal);
        return this.geo.getMap({
          rasters: [tileData[0]],
          width: requiredSize,
          height: requiredSize,
          bounds: bounds ?? [0, 0, 0, 0],
          cellSizeMeters,
        }, this.options, meshMaxError ?? 4.0);
      })();

      entry.promise = pipeline;
      this.tileResultCache.set(cacheKey, entry);

      if (this.tileResultCache.size > this.tileResultCacheMaxSize) {
        const oldestKey = this.tileResultCache.keys().next().value;
        if (typeof oldestKey === 'string') {
          const evicted = this.tileResultCache.get(oldestKey);
          if (evicted && !evicted.settled) evicted.controller.abort();
          this.tileResultCache.delete(oldestKey);
        }
      }

      try {
        const result = await pipeline;
        entry.settled = true;
        if (signal?.aborted) return null;
        return result;
      } catch (error) {
        entry.settled = true;
        this.tileResultCache.delete(cacheKey);
        throw error;
      }
    }

    // ── PATH B: Bitmap + glaze ────────────────────────────────────────────────────
    // Relief mask (output of composeSwissRelief) cached — saves fetch + kernel on revisit.
    // BitmapGenerator re-runs cheaply from the cached Float32Array.
    // Signal is passed so cancelled tiles abort cleanly; cache entry is deleted on abort/error
    // so the next request retries fresh.
    if (isGlaze) {
      const maskKey = this.getTileCacheKey(x, y, z);
      let maskPromise = this.reliefMaskCache.get(maskKey);

      if (!maskPromise) {
        maskPromise = (async (): Promise<Uint8ClampedArray> => {
          const tileData = await this.getTileFromImage(x, y, z, this.tileSize + 2, signal);
          return ReliefCompositor.composeSwissRelief(
            tileData[0] as Float32Array,
            this.options,
            cellSizeMeters,
            this.tileSize,
            this.tileSize,
          );
        })();
        this.reliefMaskCache.set(maskKey, maskPromise);
        maskPromise.catch(() => this.reliefMaskCache.delete(maskKey));

        if (this.reliefMaskCache.size > this.reliefMaskCacheMaxSize) {
          const oldestKey = this.reliefMaskCache.keys().next().value;
          if (typeof oldestKey === 'string') this.reliefMaskCache.delete(oldestKey);
        }
      } else {
        // cache hit — mask reused, kernel computation skipped
      }

      if (signal?.aborted) return null;
      const reliefMask = await maskPromise;
      if (signal?.aborted) return null;

      return this.geo.getMap({
        rasters: [reliefMask as any],
        width: this.tileSize,
        height: this.tileSize,
        bounds: bounds ?? [0, 0, 0, 0],
        cellSizeMeters,
      }, this.options, meshMaxError ?? 4.0);
    }

    // ── PATH C: Ordinary bitmap ───────────────────────────────────────────────────
    // Raw raster cached — saves fetch + decompression on revisit.
    // BitmapGenerator re-runs cheaply from the cached TypedArray.
    // Signal is passed so cancelled tiles abort cleanly; cache entry deleted on abort/error.
    const rasterKey = this.getTileCacheKey(x, y, z);
    let rasterPromise = this.rasterCache.get(rasterKey);

    if (!rasterPromise) {
      rasterPromise = this.getTileFromImage(x, y, z, this.tileSize, signal) as Promise<TypedArray[]>;
      this.rasterCache.set(rasterKey, rasterPromise);
      rasterPromise.catch(() => this.rasterCache.delete(rasterKey));

      if (this.rasterCache.size > this.rasterCacheMaxSize) {
        const oldestKey = this.rasterCache.keys().next().value;
        if (typeof oldestKey === 'string') this.rasterCache.delete(oldestKey);
      }
    } else {
      // cache hit — raster reused, network fetch skipped
    }

    if (signal?.aborted) return null;
    const tileData = await rasterPromise;
    if (signal?.aborted) return null;

    return this.geo.getMap({
      rasters: [tileData[0]],
      width: this.tileSize,
      height: this.tileSize,
      bounds: bounds ?? [0, 0, 0, 0],
      cellSizeMeters,
    }, this.options, meshMaxError ?? 4.0);
  }


  /**
   * Determines the data type (e.g., "Int32", "Float64") of a GeoTIFF image
   * by reading its TIFF tags.
   *
   * @param {GeoTIFFImage} image - A GeoTIFF.js image.
   * @returns {Promise<string>} - A string representing the data type.
   */
 async getDataTypeFromTags(fileDirectory: any) {
    const hasSampleFormat = fileDirectory.hasTag('SampleFormat');
    const hasBitsPerSample = fileDirectory.hasTag('BitsPerSample');

    if (!hasSampleFormat || !hasBitsPerSample) {
      console.warn("Missing SampleFormat or BitsPerSample tags, defaulting to UInt8");
      return 'UInt8';
    }

    // In GeoTIFF, BitsPerSample (tag 258) and SampleFormat (tag 339) provide the type info.
    // They can be either a single number or an array if there are multiple samples.
    const sampleFormat = fileDirectory.getValue('SampleFormat');// Tag 339
    const bitsPerSample = fileDirectory.getValue('BitsPerSample');// Tag 258

    // If multiple bands exist, we assume all bands share the same type.
    const format = (sampleFormat && typeof sampleFormat.length === 'number' && sampleFormat.length > 0)
      ? sampleFormat[0]
      : sampleFormat;

    const bits = (bitsPerSample && typeof bitsPerSample.length === 'number' && bitsPerSample.length > 0)
      ? bitsPerSample[0]
      : bitsPerSample;

    let typePrefix;
    // 1 = Unsigned Integer, 2 = Signed Integer, 3 = Floating Point
    if (format === 1) {
      typePrefix = 'UInt';
    } else if (format === 2) {
      typePrefix = 'Int';
    } else if (format === 3) {
      typePrefix = 'Float';
    } else {
      typePrefix = 'Unknown';
    }

    return `${typePrefix}${bits}`;
  }

  /**
   * Extracts the noData value from a GeoTIFF.js image.
   * Returns the noData value as a number (including NaN) if available, otherwise undefined.
   *
   * @param {GeoTIFFImage} image - The GeoTIFF.js image.
   * @returns {number|undefined} The noData value, possibly NaN, or undefined if not set or invalid.
   */
  getNoDataValue(image: GeoTIFFImage) {
    const noDataRaw = image.getGDALNoData();
    if (noDataRaw === undefined || noDataRaw === null) {
      /* eslint-disable no-console */
      console.warn('No noData value defined — raster might be rendered incorrectly.');
      return undefined;
    }

    const cleaned = String(noDataRaw).replace(/\0/g, '').trim();

    if (cleaned === '') {
      /* eslint-disable no-console */
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
      /* eslint-disable no-console */
      console.warn(`Failed to parse numeric noData value: '${cleaned}'`);
      return undefined;
    }

    return parsed;
  }

  /**
   * Creates a tile buffer of the specified size using a typed array corresponding to the provided data type.
   *
   * @param {string} dataType - A string specifying the data type (e.g., "Int32", "Float64", "UInt16", etc.).
   * @param {number} tileSize - The width/height of the square tile.
   * @param {number} multiplier - Optional multiplier for interleaved buffers (e.g., numChannels).
   * @returns {TypedArray} A typed array buffer of length (tileSize * tileSize * multiplier).
   */
  createTileBuffer(dataType: string, tileSize: number, multiplier = 1) {
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
        console.warn(`Unsupported data type: ${dataType}, defaulting to Float32`);
        return new Float32Array(length);
    }
  }
}

export default CogTiles;
