# Future Work: Tile-Level Caching in CogTiles Class

## Status
Documented specification for future implementation as separate PR (after current fixes).

## Why This is Needed

Investigation confirmed:
- **Deck.gl's TileLayer** has built-in HTTP-level caching via `maxCacheSize` and `maxCacheByteSize`
- **CogTiles class** has NO internal tile processing cache
- **Current fix** (instance reuse) prevents mode-switch re-fetching
- **This enhancement** prevents tile re-processing during pan/zoom

**Two caching strategies work together:**
1. **Instance caching** (current): Same CogTiles instance reused across modes
2. **Tile-level caching** (future): Individual tiles cached within an instance

## Problem This Solves

`CogTiles.getTile()` (GeoTIFF file reading + image/terrain processing) is expensive:
- Reading from GeoTIFF file: ~100-200ms per tile
- Processing (BitmapGenerator/TerrainGenerator): ~100-300ms per tile
- **Total per tile**: ~200-500ms

When user pans back to a previously-viewed area, the same tiles (same x/y/z) should NOT be re-processed.

## Objective

Implement tile-level result caching in CogTiles to provide instant (1-2ms) retrieval for previously-processed tiles.

## Implementation Specification

### Data Structure

Add to CogTiles class (after line 33):

```typescript
// Tile result cache: Maps "z/x/y" coordinate strings to processed tile results
private tileCache: Map<string, TileResult | null> = new Map();
```

### Helper Methods

#### Cache Key Generation
```typescript
/**
 * Generate a unique cache key for a tile based on its coordinates.
 * Format: "z/x/y" (e.g., "12/2048/1024")
 * Ensures fast, collision-free lookups.
 */
private getTileCacheKey(x: number, y: number, z: number): string {
  return `${z}/${x}/${y}`;
}
```

#### Cache Clearing
```typescript
/**
 * Clears all cached tile results.
 * Called when loading a new GeoTIFF URL to prevent stale data.
 */
private clearTileCache(): void {
  this.tileCache.clear();
}
```

### Modified initializeCog() Method

Update to call clearTileCache when reloading:

```typescript
async initializeCog(url: string) {
  if (this.cog) {
    this.clearTileCache();  // ← Add this line: clear cache on reload
    return;
  }
  
  try {
    // ... rest of existing initialization ...
  }
}
```

### Modified getTile() Method

Replace entire method (lines 341-364) with cache-aware version:

```typescript
async getTile(x: number, y: number, z: number, bounds: Bounds, meshMaxError: number): Promise<TileResult | null> {
  const cacheKey = this.getTileCacheKey(x, y, z);
  
  // 1. CHECK CACHE FIRST
  if (this.tileCache.has(cacheKey)) {
    // Tile was processed before - return cached result instantly
    return this.tileCache.get(cacheKey) ?? null;
  }

  // 2. FETCH & PROCESS (only if not in cache)
  let requiredSize = this.tileSize;
  if (this.options.type === 'terrain') {
    const isKernel = this.options.useSlope || this.options.useHillshade;
    requiredSize = this.tileSize + (isKernel ? 2 : 1);
  }

  // Fetch from GeoTIFF file
  const tileData = await this.getTileFromImage(x, y, z, requiredSize);
  if (!tileData) {
    this.tileCache.set(cacheKey, null);  // Cache null results too
    return null;
  }

  // Process tile (generate bitmap or terrain mesh)
  let result: TileResult | null = null;
  try {
    result = await this.geo.getMap(tileData, bounds, this.options, meshMaxError);
  } catch (error) {
    console.error(`Failed to process tile ${cacheKey}:`, error);
  }

  // 3. CACHE & RETURN
  this.tileCache.set(cacheKey, result ?? null);
  return result;
}
```

## Expected Impact

### Performance Gains
- **Pan within same zoom level**: Instant (1-2ms vs 200-500ms)
- **Zoom in/out**: Partially cached (some tiles reused)
- **Back to previous view**: Fully instant (all tiles in cache)

### Memory Impact
- **Per tile**: ~1-5 MB (bitmap) or ~2-10 MB (terrain mesh) depending on size
- **For 9 tiles visible**: ~10-50 MB typical
- **For 16 tiles visible**: ~16-80 MB typical
- **Reasonable for desktop/modern browsers** (which typically have 512MB+ available)

### Optional: Configurable Cache Limit (Future Enhancement)
If memory concerns arise, add optional cache size limit:

```typescript
constructor(options: GeoImageOptions) {
  this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };
  this.maxCacheSize = options.maxTileCacheSize ?? 50;  // Max 50 tiles
}

// In getTile(), after caching:
if (this.tileCache.size > this.maxCacheSize) {
  const firstKey = this.tileCache.keys().next().value;
  this.tileCache.delete(firstKey);  // LRU eviction (simple approach)
}
```

## Testing Strategy

### Unit Test Cases
1. **Cache hit on same tile**: Call `getTile(x, y, z)` twice, verify cache returns
2. **Cache clear on reload**: Call `initializeCog(newUrl)`, verify cache is empty
3. **Null result caching**: Ensure `null` results are cached (not re-fetched)
4. **Different tiles independent**: Tiles x/y/z and x+1/y/z have separate cache entries

### Integration Test Cases
1. **Pan and return**: Pan to new area, pan back, verify instant return
2. **Zoom level independence**: Cache separate for different zoom levels
3. **Mode switch**: Different modes (bitmap vs terrain) are separate (or shared at HTTP level)

### Performance Benchmarks
1. **Baseline** (no tile cache): Pan = 500-800ms (4-8 tiles × 100-200ms each)
2. **With tile cache**: Pan to new area = 500-800ms; pan back = <10ms

## Implementation Priority

**Phase 1 (Current)**: Instance caching + image cache + blockSize fix
**Phase 2 (Next PR)**: Tile-level caching (this spec)
**Phase 3 (Future)**: Cache size limits if memory concerns arise

## Related Documentation

- `2026-04-10-dependency-regression-investigation.md` - Root cause analysis and fixes applied
- Main branch: `fix/identify-excessive-request-regression` - All current optimizations
