import { fromUrl, GeoTIFF, type BlockedSourceOptions } from 'geotiff';

// Bitmap styling
import GeoImage from './GeoImage';
import { GeoImageOptions, TileResult, TypedArray } from './types';
import { ReliefCompositor } from './lib/ReliefCompositor';
import { getGlobalTerrainWorkerPool } from '../workers/TerrainWorkerPool';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

import { EARTH_CIRCUMFERENCE, webMercatorOrigin, calculateZoomRange, calculateBoundsAsLatLon } from '../utils/geo';
import { getDataTypeFromTags, getNoDataValue } from '../utils/tiffUtils';
import { buildCogZoomResolutionLookup, calculateDynamicMeshMaxError as lodCalculateDynamicMeshMaxError, getImageIndexForZoomLevel as lodGetImageIndexForZoomLevel } from '../utils/lod';
import TileCacheManager from './lib/TileCacheManager';
import TileReader from './lib/TileReader';
import { isF32NoData } from './lib/numberUtils';

// ── Global Multi-Band Cache ──
// Survives across CogTiles instance recreations (e.g., during React re-renders).
// Keyed by ${url}_${z}_${x}_${y}_${meshMaxError}_${skipTextureFlag}_band_${channel}
// to account for dataset changes, tessellation options, and rendering modes.
// Maps to pre-computed terrain meshes (same structure as single-band cache).
const GLOBAL_MULTI_BAND_CACHE = new Map<string, TileResult>();

const CogTilesGeoImageOptionsDefaults = {
  blurredTexture: true,
  // When true, log per-tile per-band min/max values for debugging (disabled by default)
  debugTileStats: false,
};

class CogTiles {
  cog?: GeoTIFF;

  cogZoomLookup: number[] = [];
  cogResolutionLookup: number[] = [];
  cogMeshMaxErrorLookup: number[] = [];

  cogOrigin: number[] = [0, 0];

  zoomRange: number[] = [0, 0];

  tileSize: number = 256;

  bounds: [number, number, number, number] = [0, 0, 0, 0];

  bandDescriptions: string[] = [];

  geo: GeoImage = new GeoImage();
  options: GeoImageOptions;

  // TileResult cache — keyed by z/x/y/meshMaxError.
  // Each entry owns an AbortController and a caller reference count.
  // The pipeline is aborted only when ALL callers have cancelled (ref-count → 0),
  // so concurrent deck.gl requests for the same tile share one in-flight fetch/tessellation
  // and individual tile cancellations (e.g. from panning) do not poison other callers.
  // Once the promise settles (resolved or rejected), controller/callerCount are irrelevant;
  // future cache hits just await the already-resolved promise directly.
  private cache = new TileCacheManager();
  private tileReader?: TileReader;
  private workerPool?: any; // TerrainWorkerPool (for terrain tiles)

  // Store initialization promise to prevent concurrent duplicate initializations
  private initializePromise?: Promise<void>;

  // Track the last successfully initialized URL to detect URL changes
  private lastInitializedUrl?: string;

  constructor(options: GeoImageOptions) {
    this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };

    // Get reference to global worker pool for terrain tiles
    // Do NOT create a new pool per instance — reuse the singleton
    if (options.type === 'terrain') {
      this.workerPool = getGlobalTerrainWorkerPool();
    }
  }

  async initializeCog(url: string) {
    // Reuse existing initialization while it is in progress, or when the same URL
    // was already initialized on this instance.
    if (this.initializePromise && (!this.cog || this.lastInitializedUrl === url)) {
      return this.initializePromise;
    }

    // Fully reset COG-derived state when the URL changes so the instance can be
    // safely reinitialized against a different source.
    if (this.lastInitializedUrl !== undefined && this.lastInitializedUrl !== url) {
      this.cache.clearAll();
      // Clear multi-band cache entries for the old URL to prevent stale data
      const keysToDelete: string[] = [];
      GLOBAL_MULTI_BAND_CACHE.forEach((_, key) => {
        if (key.startsWith(this.lastInitializedUrl!)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => GLOBAL_MULTI_BAND_CACHE.delete(key));
      
      this.cog = undefined;
      this.cogOrigin = [0, 0];
      this.cogZoomLookup = [];
      this.cogResolutionLookup = [];
      this.cogMeshMaxErrorLookup = [];
      this.tileSize = 256;
      this.zoomRange = [0, 0];
      this.bounds = [0, 0, 0, 0];
      this.bandDescriptions = [];
      this.initializePromise = undefined;
      this.lastInitializedUrl = undefined;
    }

    // If COG already loaded and URL matches, return the existing promise
    if (this.cog && this.lastInitializedUrl === url) {
      return this.initializePromise ?? Promise.resolve();
    }

    this.initializePromise = (async () => {
      try {
        // fromUrl's type declaration only exposes RemoteSourceOptions, but the implementation
        // also accepts BlockedSourceOptions (forwarded to makeFetchSource internally).
        // Explicitly enabling BlockedSource restores the block-level LRU cache that was
        // accidentally active in geotiff 3.0.3 (due to a null vs undefined bug there).
        // blockSize defaults to 65536 (64KB) and can be tuned via GeoImageOptions.
        const blockSize = this.options.blockSize ?? 65536;
        this.cog = await (fromUrl as any)(url, { blockSize } as BlockedSourceOptions);
        const imagePromise = this.cog!.getImage();
        this.cache.setImage(0, imagePromise);  // Cache base image (index 0) to avoid re-fetching during getTileFromImage
        const image = await imagePromise;
        const fileDirectory = image.fileDirectory;

        this.cogOrigin = image.getOrigin();

        this.options.noDataValue ??= getNoDataValue(image);
        this.options.format ??= await getDataTypeFromTags(fileDirectory) as GeoImageOptions['format'];

        this.options.numOfChannels = fileDirectory.getValue('SamplesPerPixel');
        this.options.planarConfig = fileDirectory.getValue('PlanarConfiguration');

        // Load per-band descriptions from GDAL_METADATA tag
        const numBands = this.options.numOfChannels ?? 1;
        const descriptions: string[] = Array(numBands).fill('');
        
        if (image.fileDirectory.hasTag('GDAL_METADATA')) {
          const gdalMetadataStr = await image.fileDirectory.loadValue('GDAL_METADATA');
          // Parse XML GDAL metadata to extract per-band descriptions.
          // Regex is flexible with attribute order; GDAL generates items with name="DESCRIPTION"
          // before sample="N", but [^>]* allows other attributes to appear in any order.
          // Format: <Item name="DESCRIPTION" sample="0" role="description">20170101</Item>
          const bandDescRegex = /<Item[^>]*name="DESCRIPTION"[^>]*sample="(\d+)"[^>]*>([^<]*)<\/Item>/g;
          let match;
          while ((match = bandDescRegex.exec(gdalMetadataStr as string)) !== null) {
            const bandIdx = parseInt(match[1], 10);
            const desc = match[2];
            if (bandIdx < numBands) {
              descriptions[bandIdx] = desc;
            }
          }
          // Debug: Log if no descriptions were found in metadata
          if (descriptions.every(d => d === '')) {
            // eslint-disable-next-line no-console
            console.debug('[CogTiles] GDAL_METADATA present but no DESCRIPTION items found');
          }
        }
        this.bandDescriptions = descriptions;

        [this.cogZoomLookup, this.cogResolutionLookup] = await buildCogZoomResolutionLookup(this.cog!);

    // Only compute quantized meshMaxError lookup for terrain COGs
    if (this.options.type === 'terrain') {
      this.computeMeshMaxErrorLookup();
    }

        this.tileSize = image.getTileWidth();

        // 1. Validation: Ensure the image is tiled
        if (!this.tileSize || !image.getTileHeight()) {
          throw new Error(
            'GeoTIFF Error: The provided image is not tiled. '
            + 'Please use "rio cogeo create --web-optimized" to fix this.',
          );
        }

        this.zoomRange = calculateZoomRange(
          this.tileSize, image.getResolution()[0], await this.cog!.getImageCount()
        );

            this.bounds = calculateBoundsAsLatLon(image.getBoundingBox());

        // Initialize TileReader with buffer utilities
        this.tileReader = new TileReader({
          options: this.options,
          tileSize: this.tileSize,
        });

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

  getBoundsAsLatLon() {
    return this.bounds;
  }

  /**
   * Gets the number of channels/bands in the COG.
   * Returns the value from COG metadata, or 1 if not initialized.
   */
  getNumChannels(): number {
    return this.options.numOfChannels || 1;
  }

  /**
   * Returns per-band descriptions loaded from GDAL_METADATA during initialization.
   * Index is 0-based. Returns an empty string for bands without a description.
   */
  getBandDescriptions(): string[] {
    return this.bandDescriptions;
  }

  /**
    * Gets the auto meshMaxError for a given overview index.
    * Returns undefined if auto lookup has not been computed.
    */
  getMeshMaxErrorForImageIndex(imageIndex: number): number | undefined {
    return this.cogMeshMaxErrorLookup[imageIndex];
  }

  
  /**
   * Computes dynamic meshMaxError values for each overview based on COG resolution and zoom level.
   * Called only for terrain COGs after buildCogZoomResolutionLookup() completes.
   * Each overview's meshMaxError is calculated as: resolution * zoom-based multiplier, rounded to nearest integer.
   * Multiplier ranges from 3.0 at minZ (coarse meshes) to 0.5 at maxZ (fine meshes).
   */
  private computeMeshMaxErrorLookup(): void {
    const minZ = this.cogZoomLookup[this.cogZoomLookup.length - 1];
    const maxZ = this.cogZoomLookup[0];

    this.cogMeshMaxErrorLookup = this.cogResolutionLookup.map((resolution, idx) => {
      const zoom = this.cogZoomLookup[idx];
      return lodCalculateDynamicMeshMaxError(zoom, resolution, minZ, maxZ);
    });
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
    return lodGetImageIndexForZoomLevel(zoom, this.cogZoomLookup);
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
      let imagePromise = this.cache.getImage(imageIndex);
      if (!imagePromise) {
        imagePromise = this.cog!.getImage(imageIndex);
        this.cache.setImage(imageIndex, imagePromise);
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
      return [this.tileReader!.createEmptyTile(FETCH_SIZE)];
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
      const validImageData = this.tileReader!.createTileBuffer(this.options.format || 'Float32', FETCH_SIZE, numChannels);
      if (this.options.noDataValue !== undefined) {
        validImageData.fill(this.options.noDataValue);
      }

      // if the valid window is smaller than the tile size, it gets the image size width and height, thus validRasterData.width must be used as below
      const validRasterData = await targetImage.readRasters({ window, signal: localSignal });

      // Place the valid pixel data into the tile buffer.
      for (let band = 0; band < validRasterData.length; band += 1) {
        // We must reset the buffer for each band, otherwise data from previous band persists in padding areas
        const tileBuffer = this.tileReader!.createTileBuffer(this.options.format || 'Float32', FETCH_SIZE);
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
    // If it's a single-error AggregateError, unwrap to the inner error for clearer diagnostics
    if (error instanceof AggregateError && error.errors.length === 1) {
      const innerError = error.errors[0];
      
      // Check if the unwrapped error is an abort — if so, throw it as AbortError
      if (innerError instanceof DOMException && innerError.name === 'AbortError') {
        throw innerError;
      }
      if (innerError instanceof Error && innerError.message === 'Request was aborted') {
        throw new DOMException('Tile request aborted', 'AbortError');
      }
      
      // Unwrap single error for better diagnostics (throw the real error, not the wrapper)
      throw innerError;
    }

    // Handle regular abort cases
    const isAbortRelated = localSignal.aborted
      || (error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.message === 'Request was aborted');

    if (isAbortRelated) {
      throw new DOMException('Tile request aborted', 'AbortError');
    }

    // For multi-error AggregateError, check if ANY error is abort-related
    if (error instanceof AggregateError) {
      const hasAbort = error.errors.some(
        (e: any) => (e instanceof DOMException && e.name === 'AbortError') 
                  || (e instanceof Error && e.message === 'Request was aborted')
      );
      if (hasAbort) {
        throw new DOMException('Tile request aborted', 'AbortError');
      }
    }

    throw error;
  }
}

  async getTile(x: number, y: number, z: number, bounds?: Bounds, meshMaxError?: number, signal?: AbortSignal, skipTexture?: boolean): Promise<TileResult | null> {
    // cellSizeMeters is derived purely from tile coordinates — compute once for all paths
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / Math.pow(2, z))));
    const tileWidthMeters = (EARTH_CIRCUMFERENCE / Math.pow(2, z)) * Math.cos(latRad);
    const cellSizeMeters = tileWidthMeters / this.tileSize;

    const isTerrain = this.options.type === 'terrain';
    const isGlaze = this.options.type === 'image' && this.options.useReliefGlaze;

    // Resolve meshMaxError: if not provided or 0, use auto quantized value; otherwise use explicit value
    let resolvedMeshMaxError = meshMaxError;
    if (isTerrain && (!meshMaxError || meshMaxError === 0)) {
      const imageIndex = this.getImageIndexForZoomLevel(z);
      const autoMeshMaxError = this.getMeshMaxErrorForImageIndex(imageIndex);
      resolvedMeshMaxError = autoMeshMaxError ?? 4.0;
    } else {
      resolvedMeshMaxError = meshMaxError ?? 4.0;
    }

    if (isTerrain) {
      return this.getTerrainTile(x, y, z, bounds, resolvedMeshMaxError, cellSizeMeters, signal, skipTexture);
    }

    if (isGlaze) {
      return this.getGlazeTile(x, y, z, bounds, cellSizeMeters, meshMaxError, signal);
    }

    return this.getBitmapTile(x, y, z, bounds, cellSizeMeters, meshMaxError, signal);
  }

  private async getTerrainTile(x: number, y: number, z: number, bounds: Bounds | undefined, resolvedMeshMaxError: number, cellSizeMeters: number, signal?: AbortSignal, skipTexture?: boolean): Promise<TileResult | null> {
    const skipTextureFlag = skipTexture ?? this.options.skipTexture ?? false;

    // ── Multi-Band Cache Check ──
    // If cacheAllBands is enabled, check if this tile+band combination is in the cache.
    // If so, return it instantly. If not, fetch all bands and populate the cache.
    if (this.options.cacheAllBands) {
      if (signal?.aborted) {
        return null; // Early exit if already aborted
      }

      const currentChannel = this.options.useChannel || 1; // 1-based
      // Cache key includes URL, meshMaxError, and skipTexture to account for dataset/option changes
      const multiBandCacheKey = `${this.lastInitializedUrl}_${z}_${x}_${y}_${resolvedMeshMaxError}_${skipTextureFlag}_band_${currentChannel}`;

      // Check if this specific band is already cached
      if (GLOBAL_MULTI_BAND_CACHE.has(multiBandCacheKey)) {
        const cached = GLOBAL_MULTI_BAND_CACHE.get(multiBandCacheKey);
        if (cached) {
          return cached;
        }
      }

      // Not in cache — fetch all bands for this tile and populate the cache
      try {
        // Pass NO signal to getTileAllBands to avoid early abortion
        // The tile lifecycle is managed by TileLayer, we want this fetch to complete
        const allBands = await this.getTileAllBands(x, y, z, resolvedMeshMaxError, undefined, bounds);
        
        // Only cache and return if we got valid data
        if (allBands && allBands.length > 0) {
          if (signal?.aborted) {
            return null; // Check abort after fetch completes
          }

          // Cache all bands (indexed by 1-based channel: band 1, band 2, ..., band N)
          allBands.forEach((bandResult, idx) => {
            const bandChannel = idx + 1; // Convert 0-based index to 1-based channel
            const cacheKey = `${this.lastInitializedUrl}_${z}_${x}_${y}_${resolvedMeshMaxError}_${skipTextureFlag}_band_${bandChannel}`;
            GLOBAL_MULTI_BAND_CACHE.set(cacheKey, bandResult);
          });

          // Return the requested band
          const requestedBandIndex = (currentChannel || 1) - 1; // Convert 1-based to 0-based
          if (requestedBandIndex < 0 || requestedBandIndex >= allBands.length) {
             
            console.error(`[CogTiles] Requested band index ${requestedBandIndex} out of range (0-${allBands.length - 1})`);
            return null;
          }
          return allBands[requestedBandIndex];
        }
        // If getTileAllBands returned empty, fall through to normal fetch
      } catch (error) {
        // If multi-band fetch fails, fall through to normal tile fetch
         
        console.warn('[CogTiles] Multi-band fetch failed, falling back to single-band:', error);
      }
    }

    const cacheKey = this.cache.getTileResultCacheKey(x, y, z, resolvedMeshMaxError, skipTextureFlag);
    const existing = this.cache.getTileResult(cacheKey);

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

    const pipeline: Promise<TileResult | null> = (async () => {
      const isKernel = this.options.useSlope || this.options.useHillshade || this.options.useSwissRelief;
      const requiredSize = this.tileSize + (isKernel ? 2 : 1);
      const tileData = await this.getTileFromImage(x, y, z, requiredSize, controller.signal);

      // === Step F: detect all-noData tiles before tessellation ===
      const raster = tileData[0];
      const noData = this.options.noDataValue;
      if (noData !== undefined && raster) {
        const numChannels = this.options.numOfChannels || 1;
        let useChannelIndex = this.options.useChannelIndex ?? (this.options.useChannel ? (this.options.useChannel - 1) : 0);
        if (useChannelIndex == null) useChannelIndex = 0;

        const checkStrategy = this.options.noDataCheck ?? 'full';

        const width = requiredSize;
        const height = requiredSize;

        const isNoValue = (v: number) => isF32NoData(v, noData);

        let allNoData = true;

        if (checkStrategy === 'full') {
          // Full linear scan (safe)
          if (numChannels > 1) {
            for (let i = useChannelIndex; i < (raster as any).length; i += numChannels) {
              const v = (raster as any)[i];
              if (!isNoValue(v)) { allNoData = false; break; }
            }
          } else {
            for (let i = 0; i < (raster as any).length; i++) {
              const v = (raster as any)[i];
              if (!isNoValue(v)) { allNoData = false; break; }
            }
          }
        } else if (checkStrategy === 'border+center') {
          // Border scan: iterate over top/bottom rows and left/right cols
          const stepX = numChannels;
          // Top row
          for (let x = 0; x < width; x++) {
            const idx = x * stepX + useChannelIndex;
            const v = (raster as any)[idx];
            if (!isNoValue(v)) { allNoData = false; break; }
          }
          // Bottom row
          if (allNoData) {
            for (let x = 0; x < width; x++) {
              const idx = ((height - 1) * width + x) * stepX + useChannelIndex;
              const v = (raster as any)[idx];
              if (!isNoValue(v)) { allNoData = false; break; }
            }
          }
          // Left/Right cols
          if (allNoData) {
            for (let y = 1; y < height - 1; y++) {
              const leftIdx = (y * width) * stepX + useChannelIndex;
              const rightIdx = (y * width + (width - 1)) * stepX + useChannelIndex;
              const vl = (raster as any)[leftIdx];
              const vr = (raster as any)[rightIdx];
              if (!isNoValue(vl) || !isNoValue(vr)) { allNoData = false; break; }
            }
          }

          // Center probe + 4 quadrant probes
          if (allNoData) {
            const probes: [number, number][] = [
              [Math.floor(width / 2), Math.floor(height / 2)],
              [Math.floor(width / 4), Math.floor(height / 4)],
              [Math.floor((3 * width) / 4), Math.floor(height / 4)],
              [Math.floor(width / 4), Math.floor((3 * height) / 4)],
              [Math.floor((3 * width) / 4), Math.floor((3 * height) / 4)],
            ];
            for (const [px, py] of probes) {
              const idx = (py * width + px) * stepX + useChannelIndex;
              const v = (raster as any)[idx];
              if (!isNoValue(v)) { allNoData = false; break; }
            }
          }
        } else {
          // Unknown strategy — fallback to full
          for (let i = 0; i < (raster as any).length; i++) {
            const v = (raster as any)[i];
            if (!isNoValue(v)) { allNoData = false; break; }
          }
        }

        if (allNoData) {
          // Do not cache all-noData result; remove cache entry so future requests re-evaluate if COG/metadata changes.
          this.cache.deleteTileResult(cacheKey);
          return null;
        }
      }

      // Create generator options with skipTextureFlag applied (don't mutate shared this.options)
      const generatorOptions: GeoImageOptions = {
        ...this.options,
        skipTexture: skipTextureFlag,
      };

      return this.geo.getMap({
        rasters: [tileData[0]],
        width: requiredSize,
        height: requiredSize,
        bounds: bounds ?? [0, 0, 0, 0],
        cellSizeMeters,
      }, generatorOptions, resolvedMeshMaxError, this.workerPool);
    })();

    const entry = {
      promise: pipeline,
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

    entry.promise = pipeline;
    this.cache.setTileResult(cacheKey, entry);

    try {
      const result = await pipeline;
      entry.settled = true;
      if (signal?.aborted) return null;
      return result;
    } catch (error) {
      entry.settled = true;
      this.cache.deleteTileResult(cacheKey);
      throw error;
    }
  }

  private async getGlazeTile(x: number, y: number, z: number, bounds: Bounds | undefined, cellSizeMeters: number, meshMaxError?: number, signal?: AbortSignal): Promise<TileResult | null> {
    const maskKey = this.cache.getTileCacheKey(x, y, z);
    let maskPromise = this.cache.getReliefMask(maskKey);

    if (!maskPromise) {
      const controller = new AbortController();
      maskPromise = (async (): Promise<Uint8ClampedArray> => {
        const tileData = await this.getTileFromImage(x, y, z, this.tileSize + 2, controller.signal);
        return ReliefCompositor.composeSwissRelief(
          tileData[0] as Float32Array,
          this.options,
          cellSizeMeters,
          this.tileSize,
          this.tileSize,
        );
      })();
      this.cache.setReliefMask(maskKey, maskPromise);
      maskPromise.catch(() => this.cache.deleteReliefMask(maskKey));
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
    }, this.options, meshMaxError ?? 4.0, this.workerPool);
  }

  private async getBitmapTile(x: number, y: number, z: number, bounds: Bounds | undefined, cellSizeMeters: number, meshMaxError?: number, signal?: AbortSignal): Promise<TileResult | null> {
    const rasterKey = this.cache.getTileCacheKey(x, y, z);
    let rasterPromise = this.cache.getRaster(rasterKey);

    if (!rasterPromise) {
      const controller = new AbortController();
      rasterPromise = this.getTileFromImage(x, y, z, this.tileSize, controller.signal) as Promise<TypedArray[]>;
      this.cache.setRaster(rasterKey, rasterPromise);
      rasterPromise.catch(() => this.cache.deleteRaster(rasterKey));
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
    }, this.options, meshMaxError ?? 4.0, this.workerPool);
  }

  async getTileAllBands(x: number, y: number, z: number, meshMaxError?: number, signal?: AbortSignal, bounds?: Bounds): Promise<TileResult[]> {
    if (!this.cog) {
      return [];
    }

    // Compute cell size for this tile
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / Math.pow(2, z))));
    const tileWidthMeters = (EARTH_CIRCUMFERENCE / Math.pow(2, z)) * Math.cos(latRad);
    const cellSizeMeters = tileWidthMeters / this.tileSize;

    // Resolve meshMaxError
    let resolvedMeshMaxError: number;
    if (!meshMaxError || meshMaxError === 0) {
      const imageIndex = this.getImageIndexForZoomLevel(z);
      const autoMeshMaxError = this.getMeshMaxErrorForImageIndex(imageIndex);
      resolvedMeshMaxError = autoMeshMaxError ?? 4.0;
    } else {
      resolvedMeshMaxError = meshMaxError;
    }

    // Create a fresh local AbortController for this fetch
    const controller = new AbortController();
    if (signal && !signal.aborted) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const localSignal = controller.signal;

    try {
      const imageIndex = this.getImageIndexForZoomLevel(z);
      let imagePromise = this.cache.getImage(imageIndex);
      if (!imagePromise) {
        imagePromise = this.cog.getImage(imageIndex);
        this.cache.setImage(imageIndex, imagePromise);
      }
      const targetImage = await imagePromise;

      const imageResolution = this.cogResolutionLookup[imageIndex];
      const imageHeight = targetImage.getHeight();
      const imageWidth = targetImage.getWidth();
      const [imgOriginX, imgOriginY] = this.cogOrigin;

      const TILE_SIZE = this.tileSize;
      const ORIGIN_X = webMercatorOrigin[0];
      const ORIGIN_Y = webMercatorOrigin[1];

      // ── Martini Grid Size Fix ──
      // Martini requires 2^n + 1 grid (e.g., 257x257), but we fetch at TILE_SIZE (256).
      // Add padding for relief kernels (2) or just 1 for basic terrain.
      const isKernel = this.options.useSlope || this.options.useHillshade || this.options.useSwissRelief;
      const FETCH_SIZE = this.tileSize + (isKernel ? 2 : 1);

      const tileGridResolution = (EARTH_CIRCUMFERENCE / TILE_SIZE) / (2 ** z);
      const tileMinXMeters = ORIGIN_X + (x * TILE_SIZE * tileGridResolution);
      const tileMaxYMeters = ORIGIN_Y - (y * TILE_SIZE * tileGridResolution);

      const windowMinX = (tileMinXMeters - imgOriginX) / imageResolution;
      const windowMinY = (imgOriginY - tileMaxYMeters) / imageResolution;

      const startX = Math.round(windowMinX);
      const startY = Math.round(windowMinY);
      const endX = startX + FETCH_SIZE;
      const endY = startY + FETCH_SIZE;

      const validReadX = Math.max(0, startX);
      const validReadY = Math.max(0, startY);
      const validReadMaxX = Math.min(imageWidth, endX);
      const validReadMaxY = Math.min(imageHeight, endY);

      const readWidth = validReadMaxX - validReadX;
      const readHeight = validReadMaxY - validReadY;

      // If no overlap, return empty array
      if (readWidth <= 0 || readHeight <= 0) {
        return [];
      }

      const missingLeft = validReadX - startX;
      const missingTop = validReadY - startY;
      const window = [validReadX, validReadY, validReadMaxX, validReadMaxY];

      const validRasterData = await targetImage.readRasters({ window, signal: localSignal }) as TypedArray[];
      if (signal?.aborted) return [];

      const results: TileResult[] = [];
      const numBands = validRasterData.length;

      for (let bandIndex = 0; bandIndex < numBands; bandIndex += 1) {
        const sourceBandArray = validRasterData[bandIndex];
        const processedBandRaster: TypedArray = this.tileReader!.createTileBuffer(this.options.format || 'Float32', FETCH_SIZE);
        if (this.options.noDataValue !== undefined) {
          processedBandRaster.fill(this.options.noDataValue);
        }

        for (let row = 0; row < readHeight; row += 1) {
          const destRow = missingTop + row;
          const destRowOffset = destRow * FETCH_SIZE;
          const srcRowOffset = row * readWidth;

          for (let col = 0; col < readWidth; col += 1) {
            const destCol = missingLeft + col;
            if (destRow < FETCH_SIZE && destCol < FETCH_SIZE) {
              processedBandRaster[destRowOffset + destCol] = sourceBandArray[srcRowOffset + col] as any;
            }
          }
        }

        const generatorOptions = { ...this.options, useChannel: 1, useChannelIndex: 0, numOfChannels: 1 };
        const tileResult = await this.geo.getMap({
          rasters: [processedBandRaster],
          width: FETCH_SIZE,
          height: FETCH_SIZE,
          bounds: bounds ?? [0, 0, 0, 0],
          cellSizeMeters,
        }, generatorOptions, resolvedMeshMaxError, this.workerPool);

        if (tileResult) results.push(tileResult);
      }

      return results;

    } catch (error) {
      if (signal?.aborted) return [];
      console.error('[CogTiles.getTileAllBands] Error fetching all bands:', error);
      return [];
    }
  }

  // Expose legacy API for clearing tile result cache (used by external layers)
  clearTileResultCache(): void {
    this.cache.clearTileResultCache();
  }

  // getDataTypeFromTags moved to ../utils/tiffUtils

  // getNoDataValue moved to ../utils/tiffUtils
}

export default CogTiles;
