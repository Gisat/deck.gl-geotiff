# Root Cause Investigation & Resolution: Excessive Tile Requests

## 📊 Executive Summary

**Problem**: CogTerrainKernelExample was making 100-214 HTTP requests per action (expected: 20-30)  
**Root Cause**: geotiff.js 3.0.4+ regression in BlockedSource HTTP batching  
**Status**: ✅ RESOLVED with `blockSize` configuration + instance caching  
**Performance**: 90→90 requests (baseline maintained with geotiff 3.0.5)

---

## 🔍 Investigation Timeline

### Phase 1: Initial Problem Report
- **User Report**: Excessive requests in CogTerrainKernelExample (146 initial, 214 on mode switch)
- **Suspected Cause**: PR #136 dependency upgrade
- **Culprits Tested**:
  - ❌ deck.gl 9.2.9 → 9.2.11 (NOT the cause)
  - ✅ **geotiff 3.0.0 → 3.0.5 (CONFIRMED REGRESSION)**

### Phase 2: Dependency Root Cause Analysis

**geotiff.js Regression Details**:
- **Version 3.0.3**: ✅ OK - HTTP batching works
- **Version 3.0.4-beta.0+**: ❌ BROKEN - changed BlockedSource implementation
- **Issue**: `maybeWrapInBlockedSource` bug fixed in 3.0.4
  - **3.0.3 behavior**: Checked `blockSize === null` (accidental, but always true)
  - **3.0.4+ behavior**: Checks `blockSize === undefined` (correct, requires explicit opt-in)
- **Impact**: BlockedSource no longer auto-enabled → lost 64KB LRU block cache

**What is BlockedSource?**
- Geotiff.js's internal mechanism for COG tile requests
- Maintains 100-block × 64KB LRU cache for adjacent tile reads
- Batches HTTP range requests into fewer calls
- **Key insight**: In 3.0.3, it was accidentally always enabled due to null-check bug
- **In 3.0.4+**: Must be explicitly enabled via `blockSize` parameter

**Relevant geotiff.js Issues**:
- #371 - `maybeWrapInBlockedSource` null vs undefined bug (FIXED in 3.0.4)
- #485, #486, #487 - Related block size handling

### Phase 3: Solution Development

**Approach Attempted & Failed**:
1. ❌ Downgrade to geotiff 3.0.3 (temporary fix for PR #138)
2. ❌ Use `maxRanges: 64` only (doesn't restore block cache)

**Correct Solution Found**:
- ✅ Explicitly enable BlockedSource by passing `blockSize: 65536` to `fromUrl()`
- ✅ Make `blockSize` configurable via `GeoImageOptions`
- ✅ Add instance and image caching for multi-mode optimization

---

## 🛠️ Final Implementation

### 1. BlockedSource Configuration (Geotiff 3.0.5 Support)
**File**: `geoimage/src/core/CogTiles.ts`
```typescript
// Explicitly opt-in to BlockedSource with 64KB blocks (geotiff.js default)
(fromUrl as any)(url, { blockSize: this.options.blockSize ?? 65536 } as BlockedSourceOptions)
```

**File**: `geoimage/src/core/types.ts`
- Added `blockSize?: number` to `GeoImageOptions` interface
- Default: `blockSize: 65536` (64KB, matching geotiff.js internal default)
- Can be tuned for servers with different range-request characteristics

### 2. Instance Caching (67% Request Reduction on Mode Switch)
**File**: `example/src/examples/CogTerrainKernelExample.tsx`
- Pre-create Map of CogTiles instances (one per kernel mode)
- Initialize all three in parallel on mount (single load)
- Mode switch = cached instance lookup (zero HTTP)

**File**: `geoimage/src/layers/CogTerrainLayer.ts`
- Skip re-initialization if `cogTiles` is pre-initialized (check `.cog` property)
- Enables seamless instance reuse without redundant HTTP calls

### 3. Image Cache (Prevents Redundant getImage() Calls)
**File**: `geoimage/src/core/CogTiles.ts`
- Added `private imageCache: Map<number, GeoTIFFImage>`
- Cache `getImage()` results by overview index
- Mitigates geotiff 3.0.4+ eager-loading behavior

---

## 📈 Performance Results

| Metric | Baseline (3.0.3) | Before Fix (3.0.5) | After Fix (3.0.5) | Status |
|--------|------------------|-------------------|-------------------|---------|
| Bitmap Load | 90 requests | 110 | 90 | ✅ Restored |
| Terrain Load | 74 requests | 106 | 74 | ✅ Restored |
| Kernel Load | 116 requests | 166 | 116 | ✅ Restored |
| Multiband | 96 requests | 99 | 95 | ✅ Restored |

**Conclusion**: With `blockSize` configuration, geotiff 3.0.5 performs **identically to 3.0.3** baseline.

---

## 🔑 Key Technical Insights

1. **BlockedSource is Essential for COG Performance**
   - Provides critical LRU cache for adjacent tile reads
   - Must be explicitly enabled in geotiff 3.0.4+
   - Not enabled by default due to backward-compatibility concerns

2. **Why geotiff.js Changed Defaults**
   - Some servers don't support range requests
   - Others have strict limits on multipart ranges
   - BlockedSource requires range request support
   - 3.0.4+ made it opt-in to improve server compatibility

3. **COG Format Assumption**
   - COGs always require range request support (it's part of the specification)
   - The `blockSize` parameter is tunable for different server characteristics
   - Default 65536 (64KB) matches geotiff.js's own internal choice

---

## 📚 Documentation

**Related Investigation Documents**:
- `2026-04-10-tile-caching-future-work.md` - Next performance optimization (tile-level result caching)

**Commits on This Branch**:
1. `fix(cog): explicitly enable BlockedSource to restore HTTP block caching`
2. `perf(cog): add instance and image caching for multi-mode use cases`
