# Footprint & noData Strategies
**Date:** 2026-04-30

---

## Purpose
Collect and formalize approaches for detecting COG coverage (footprint) and handling noData values efficiently. This document gathers ideas discussed in recent work on terrain performance (tile caches, skipTexture, all-noData detection) and presents a recommended path for a robust, low-cost footprint-based short-circuit to avoid wasted tessellation and texture work.

## Context & related plans
- See: `.plan/2026-04-29-terrain-cache-and-texture-improvements.md` (Step F: all-noData tile detection)
- Relevant code: `geoimage/src/core/CogTiles.ts`, `geoimage/src/core/GeoImage.ts`, `geoimage/src/core/lib/TerrainGenerator.ts`, `geoimage/src/core/lib/BitmapGenerator.ts`

## Goals
1. Avoid expensive tessellation for tiles that are fully outside the COG footprint or entirely noData.
2. Render noData pixels as transparent in textures (avoid coloring fallback terrainMinValue).
3. Minimize per-tile overhead and avoid changing cache schemas where possible.
4. Provide a flexible strategy for different datasets (archipelagos, coastlines, high/noise rasters).

## Candidate approaches (summary)
1. Full scan (safe)
   - Scan every sample in the tile band for noData sentinel.
   - Pros: exact, no false negatives. Cons: ~65k comparisons per 256×256 tile (negligible relative to tessellation cost).

2. Border+center probes (fast heuristic)
   - Scan borders + center + a few quadrant probes.
   - Pros: very fast; Cons: can miss small islands or thin features, producing false negatives.

3. Overview-based footprint (recommended)
   - Read the lowest-resolution overview (smallest image in COG), build a validity mask, map overview pixels to web-mercator tiles at a chosen coverage zoom, classify tiles as EMPTY / PARTIAL / FULL.
   - Pros: accurate, single small read, cheap runtime checks, avoids per-tile scanning for most tiles.
   - Cons: needs overview; mapping math required.

4. Auto-selection hybrid
   - At initialize time, sample a handful of tiles and estimate if border+center produces acceptable false-negative rate; switch to border+center if safe, else use full or overview-based.

5. Server-side precompute
   - Precompute footprint (GeoJSON or tile list) during data preparation and distribute alongside COG. Best accuracy, no client compute required.

## Recommended design
Primary recommendation: implement the overview-based footprint preflight with sensible fallbacks:
- If a lowest-res overview exists, build a coverage map and classify tiles at a configured coverageZoom (or compute one that roughly maps overview pixel → 1 map tile).
- Use coverage classification in `CogTiles.getTile()` to short-circuit:
  - EMPTY → return null immediately
  - FULL → proceed with normal pipeline without additional noData scans
  - PARTIAL → perform existing border+center or full checks (configurable)
- Keep `noDataCheck` option (full | border+center) for PARTIAL tiles and for datasets w/o overviews.
- Default runtime: `noDataCheck = 'full'` to be safe; allow user to opt into border+center or auto.

## Implementation sketch (step-by-step)
1. Overview ingestion
  1.1 In `CogTiles.initializeCog()`, after loading the base image, attempt to `getImage(lastIndex)` (smallest overview).
  1.2 Read overview raster interleaved (one read). Build a boolean mask: valid = not noDataValue (handle NaN).

2. Map overview pixels → tile classification
  2.1 Pick `coverageZoom`: either a config value or computed so that one overview pixel ~= one map tile at `coverageZoom`.
  2.2 For each overview pixel, compute the WebMercator tile z/x/y at coverageZoom that covers its bbox.
  2.3 Maintain counters per tile key (z/x/y). After scan, classify tiles:
    - EMPTY: count == 0
    - FULL: count >= tilePixelCount (or >= threshold e.g., >95%)
    - PARTIAL: otherwise
  2.4 Store Map<string, 'empty'|'partial'|'full'> in `this.coverageMap` on the CogTiles instance.

3. Short-circuit in `getTile()`
  3.1 At entry to terrain path, consult `this.coverageMap` for tile key at the requested zoom. If EMPTY → return null immediately.
  3.2 If PARTIAL → follow existing border+center probes or full scan.
  3.3 If FULL or no entry → proceed as today.

4. Persistence & caching
  4.1 Optionally persist the coverage map per-COG using a local cache key (ETag, URL hash) in IndexedDB if desired.
  4.2 Keep coverageMap memory representation compact (use quadkeys or bitsets if many tiles), otherwise Map<string,uint8> is fine for moderate AOIs.

5. Edge-cases & fallbacks
  - No overviews available: fall back to existing per-tile strategies (full or border+center).
  - Multi-band/planar rasters: select channel for validity check (useChannel/useChannelIndex).
  - NaN noData handling: `Number.isNaN()` aware checks.

## Storage & encoding options
- Map key format: `${z}/${x}/${y}` or quadkey; value: 0=EMPTY,1=PARTIAL,2=FULL.
- For large coverage maps, compress into typed arrays keyed by z-blocks or persist to IndexedDB.

## Metrics & thresholds
- Default `coverageZoom` candidate: choose smallest overview width in pixels and map it to a zoom so that overview width / 256 ≈ 2^n; pick the zoom with reasonable tile count.
- Classification thresholds: FULL if coverage fraction >= 0.95, EMPTY if 0, PARTIAL otherwise.

## Todos (actionable)
1.1: `footprint-overview` — Build overview-based coverage map and store in CogTiles (pending)
1.2: `footprint-shortcircuit` — Short-circuit getTile() using coverage map (pending)
1.3: `nodat-auto-mode` — Implement auto-mode to choose full vs border+center at init (pending)
1.4: `nodat-cache` — Add small LRU cache for border-affected texture generation (optional) (pending)
1.5: `nodat-docs` — Document footprint and noData strategies in geoimage/docs and .plan (pending)

## Acceptance criteria
- COVERAGE map built successfully for COGs with overviews and consulted by `getTile()` to avoid tessellation for EMPTY tiles.
- NoData pixels render transparent in textured modes for mixed tiles (no black fill of terrainMinValue).
- Default behaviour remains safe (full scan) when overviews missing or `noDataCheck` set to 'full'.

---

## Notes
- This plan is intentionally conservative: prefer correctness (no false empties) by default. Use heuristics and caches to reduce CPU overhead only where datasets and usage patterns justify it.

Prepared for follow-up: implementation patches for `CogTiles.initializeCog()` and `getTile()` + optional persistence.
