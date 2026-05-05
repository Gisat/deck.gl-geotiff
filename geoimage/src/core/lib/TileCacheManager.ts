import type { GeoTIFFImage } from 'geotiff';
import type { TileResult, TypedArray } from '../types';

export type TileResultCacheEntry = {
  promise: Promise<TileResult | null>;
  controller: AbortController;
  callerCount: number;
  settled: boolean;
};

export default class TileCacheManager {
  private tileResultCache: Map<string, TileResultCacheEntry> = new Map();
  private readonly tileResultCacheMaxSize: number;

  private rasterCache: Map<string, Promise<TypedArray[]>> = new Map();
  private readonly rasterCacheMaxSize: number;

  private reliefMaskCache: Map<string, Promise<Uint8ClampedArray>> = new Map();
  private readonly reliefMaskCacheMaxSize: number;

  private imageCache: Map<number, Promise<GeoTIFFImage>> = new Map();

  constructor(opts?: { tileResultCacheMaxSize?: number; rasterCacheMaxSize?: number; reliefMaskCacheMaxSize?: number }) {
    this.tileResultCacheMaxSize = opts?.tileResultCacheMaxSize ?? 32;
    this.rasterCacheMaxSize = opts?.rasterCacheMaxSize ?? 64;
    this.reliefMaskCacheMaxSize = opts?.reliefMaskCacheMaxSize ?? 64;
  }

  getTileResultCacheKey(x: number, y: number, z: number, meshMaxError: number, skipTexture: boolean): string {
    return `${z}/${x}/${y}/${meshMaxError}/${skipTexture ? '1' : '0'}`;
  }

  getTileCacheKey(x: number, y: number, z: number): string {
    return `${z}/${x}/${y}`;
  }

  // TileResult cache methods
  getTileResult(key: string): TileResultCacheEntry | undefined {
    const entry = this.tileResultCache.get(key);
    if (!entry) return undefined;
    // LRU touch
    this.tileResultCache.delete(key);
    this.tileResultCache.set(key, entry);
    return entry;
  }

  setTileResult(key: string, entry: TileResultCacheEntry): void {
    this.tileResultCache.set(key, entry);
    if (this.tileResultCache.size > this.tileResultCacheMaxSize) {
      const oldestKey = this.tileResultCache.keys().next().value as string | undefined;
      if (oldestKey) {
        const evicted = this.tileResultCache.get(oldestKey);
        if (evicted && !evicted.settled) evicted.controller.abort();
        this.tileResultCache.delete(oldestKey);
      }
    }
  }

  deleteTileResult(key: string): boolean {
    return this.tileResultCache.delete(key);
  }

  clearTileResultCache(): void {
    for (const entry of this.tileResultCache.values()) {
      if (!entry.settled) entry.controller.abort();
    }
    this.tileResultCache.clear();
  }

  // Raster cache methods
  getRaster(key: string): Promise<TypedArray[]> | undefined {
    const p = this.rasterCache.get(key);
    if (!p) return undefined;
    // LRU touch
    this.rasterCache.delete(key);
    this.rasterCache.set(key, p);
    return p;
  }

  setRaster(key: string, p: Promise<TypedArray[]>): void {
    this.rasterCache.set(key, p);
    p.catch(() => this.rasterCache.delete(key));
    if (this.rasterCache.size > this.rasterCacheMaxSize) {
      const oldestKey = this.rasterCache.keys().next().value as string | undefined;
      if (oldestKey) this.rasterCache.delete(oldestKey);
    }
  }

  deleteRaster(key: string): boolean {
    return this.rasterCache.delete(key);
  }

  clearRasterCache(): void {
    this.rasterCache.clear();
  }

  // Relief mask cache methods
  getReliefMask(key: string): Promise<Uint8ClampedArray> | undefined {
    const p = this.reliefMaskCache.get(key);
    if (!p) return undefined;
    // LRU touch
    this.reliefMaskCache.delete(key);
    this.reliefMaskCache.set(key, p);
    return p;
  }

  setReliefMask(key: string, p: Promise<Uint8ClampedArray>): void {
    this.reliefMaskCache.set(key, p);
    p.catch(() => this.reliefMaskCache.delete(key));
    if (this.reliefMaskCache.size > this.reliefMaskCacheMaxSize) {
      const oldestKey = this.reliefMaskCache.keys().next().value as string | undefined;
      if (oldestKey) this.reliefMaskCache.delete(oldestKey);
    }
  }

  deleteReliefMask(key: string): boolean {
    return this.reliefMaskCache.delete(key);
  }

  clearReliefMaskCache(): void {
    this.reliefMaskCache.clear();
  }

  // Image cache methods
  getImage(index: number): Promise<GeoTIFFImage> | undefined {
    return this.imageCache.get(index);
  }

  setImage(index: number, p: Promise<GeoTIFFImage>): void {
    this.imageCache.set(index, p);
  }

  deleteImage(index: number): boolean {
    return this.imageCache.delete(index);
  }

  clearImageCache(): void {
    this.imageCache.clear();
  }

  // Clear everything
  clearAll(): void {
    this.clearTileResultCache();
    this.clearRasterCache();
    this.clearReliefMaskCache();
    this.clearImageCache();
  }
}
