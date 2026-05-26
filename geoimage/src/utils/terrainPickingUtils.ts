/**
 * Terrain coordinate extraction utility for CogTerrainLayer
 * Enables precise lat/lon/elevation extraction from 3D terrain picks
 */

/**
 * Represents a geographic coordinate with elevation from terrain picking
 */
export interface TerrainCoordinate {
  /** Longitude in degrees */
  longitude: number;
  /** Latitude in degrees */
  latitude: number;
  /** Elevation in meters */
  elevation: number;
}

/**
 * Extracts precise geographic coordinates and elevation from a CogTerrainLayer pick result
 *
 * @param pickResult - DeckGL pickObject result from terrain-layer pick
 * @returns TerrainCoordinate with lon/lat/elevation, or null if extraction fails
 *
 * @requires deck.gl >=9.3.0 (for `pickable: '3d'` support)
 * @note Requires `pickable: '3d'` on CogTerrainLayer. With 3D picking enabled,
 * deck.gl's terrain layer provides info.coordinate as a 3-element array [lon, lat, elevation]
 * where elevation is read directly from the terrain mesh at the picked point.
 * This gives accurate 3D coordinates regardless of camera pitch or bearing.
 *
 * @example
 * ```ts
 * const cogLayer = new CogTerrainLayer({
 *   // ...
 *   pickable: '3d',  // Requires deck.gl >=9.3.0
 *   onClick: (info) => {
 *     const coord = extractTerrainCoordinate(info);
 *     if (coord) {
 *       console.log(`Clicked at ${coord.latitude}, ${coord.longitude}, elevation: ${coord.elevation}m`);
 *     }
 *   }
 * });
 * ```
 */
export function extractTerrainCoordinate(pickResult: any): TerrainCoordinate | null {
  try {
    // With pickable: '3d', info.coordinate is a 3-element array [lon, lat, elevation]
    if (!pickResult?.coordinate || pickResult.coordinate.length < 3) {
      return null;
    }

    const [longitude, latitude, elevation] = pickResult.coordinate;

    if (longitude === undefined || latitude === undefined || elevation === undefined) {
      return null;
    }

    return {
      longitude,
      latitude,
      elevation,
    };
  } catch {
    // Silently return null on any error
    return null;
  }
}

/**
 * Samples terrain coordinates in a grid around a pick point for debugging
 * Useful for understanding terrain data layout and accuracy
 *
 * @param pickResult - DeckGL pickObject result from terrain-layer pick
 * @param gridSize - Odd number for grid dimensions (default: 3 for 3x3 grid).
 *                   gridSize=3 → 3×3 grid (offset±1), gridSize=5 → 5×5 grid (offset±2).
 *                   Uses WebMercator projection for accurate latitude mapping.
 * @returns Array of TerrainCoordinate samples, or empty array if extraction fails
 *
 * @example
 * ```ts
 * const samples = sampleTerrainTileCoordinates(info, 5); // 5x5 grid around click
 * samples.forEach(coord => {
 *   console.log(`Sample: ${coord.latitude}, ${coord.longitude}, elev: ${coord.elevation}m`);
 * });
 * ```
 */
export function sampleTerrainTileCoordinates(
  pickResult: any,
  gridSize: number = 3
): TerrainCoordinate[] {
  try {
    // Validate input has required structure
    if (!pickResult?.tile?.content) {
      return [];
    }

    const tileResult = pickResult.tile.content[0];
    if (!tileResult?.raw) {
      return [];
    }

    const { raw, width, height } = tileResult;
    const bbox = pickResult.tile.bbox;

    if (!bbox) {
      return [];
    }

    const west = bbox.west ?? bbox[0];
    const south = bbox.south ?? bbox[1];
    const east = bbox.east ?? bbox[2];
    const north = bbox.north ?? bbox[3];

    if (west === undefined || south === undefined || east === undefined || north === undefined) {
      return [];
    }

    const coordinate = pickResult.coordinate;

    if (!coordinate || coordinate.length < 2) {
      return [];
    }

    const [centerLon, centerLat] = coordinate;

    // Calculate grid offset (in pixels): gridSize must be odd; gridSize=3 → offset=1, gridSize=5 → offset=2
    const offset = Math.floor(gridSize / 2);

    // Get center pixel from clicked coordinate using WebMercator projection
    const centerNormX = (centerLon - west) / (east - west);
    
    // WebMercator non-linear latitude projection
    const centerLatRad = centerLat * Math.PI / 180;
    const northRad = north * Math.PI / 180;
    const southRad = south * Math.PI / 180;
    const mercatorCenterY = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2));
    const mercatorNorth = Math.log(Math.tan(Math.PI / 4 + northRad / 2));
    const mercatorSouth = Math.log(Math.tan(Math.PI / 4 + southRad / 2));
    const centerNormY = (mercatorNorth - mercatorCenterY) / (mercatorNorth - mercatorSouth);
    
    const centerPixelX = Math.floor(centerNormX * (width - 1));
    const centerPixelY = Math.floor(centerNormY * (height - 1));

    const samples: TerrainCoordinate[] = [];

    // Sample grid around clicked point
    for (let dy = -offset; dy <= offset; dy++) {
      for (let dx = -offset; dx <= offset; dx++) {
        const pixelX = centerPixelX + dx;
        const pixelY = centerPixelY + dy;

        // Stay within tile bounds
        if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
          continue;
        }

        const pixelIndex = pixelY * width + pixelX;
        const elevation = raw[pixelIndex];

        if (elevation === undefined || elevation === null) {
          continue;
        }

        // Convert pixel to geographic coordinates using WebMercator projection
        const lon = west + (pixelX / (width - 1)) * (east - west);
        
        // Inverse WebMercator transform for latitude
        const normV = pixelY / (height - 1);
        const mercatorY = mercatorNorth - normV * (mercatorNorth - mercatorSouth);
        const lat = (2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2) * 180 / Math.PI;

        samples.push({
          longitude: lon,
          latitude: lat,
          elevation,
        });
      }
    }

    return samples;
  } catch {
    return [];
  }
}
