import type { GeoTIFF } from 'geotiff';
import { webMercatorRes0 } from './geo';

/**
 * LOD (level-of-detail) helpers extracted from CogTiles.
 */
export function getErrorMultiplierForZoom(z: number, minZ: number, maxZ: number): number {
  if (z >= maxZ) return 0.5;
  if (z <= minZ) return 3.0;
  // Linear interpolation: 3.0 - ((z - minZ) / (maxZ - minZ)) * 2.5
  return 3.0 - ((z - minZ) / (maxZ - minZ)) * 2.5;
}

export function calculateDynamicMeshMaxError(z: number, resolution: number, minZ: number, maxZ: number): number {
  const multiplier = getErrorMultiplierForZoom(z, minZ, maxZ);
  const errorValue = resolution * multiplier;
  return Math.max(0.5, Math.min(100, errorValue));
}

export async function buildCogZoomResolutionLookup(cog: GeoTIFF): Promise<[number[], number[]]> {
  const imageCount = await cog.getImageCount();

  const baseImage = await cog.getImage(0);
  const baseResolution = baseImage.getResolution()[0];
  const baseWidth = baseImage.getWidth();

  const zoomLookup: number[] = [];
  const resolutionLookup: number[] = [];

  for (let idx = 0; idx < imageCount; idx++) {
    const image = await cog.getImage(idx);
    const width = image.getWidth();

    const scaleFactor = baseWidth / width;
    const estimatedResolution = baseResolution * scaleFactor;

    const zoomLevel = Math.round(Math.log2(webMercatorRes0 / estimatedResolution));

    zoomLookup[idx] = zoomLevel;
    resolutionLookup[idx] = estimatedResolution;
  }

  return [zoomLookup, resolutionLookup];
}

export function getImageIndexForZoomLevel(zoom: number, cogZoomLookup: number[]): number {
  const minZoom = cogZoomLookup[cogZoomLookup.length - 1];
  const maxZoom = cogZoomLookup[0];
  if (zoom > maxZoom) return 0;
  if (zoom < minZoom) return cogZoomLookup.length - 1;

  const exactMatchIndex = cogZoomLookup.indexOf(zoom);
  if (exactMatchIndex !== -1) return exactMatchIndex;

  let closestIndex = 0;
  let minDistance = Math.abs(cogZoomLookup[0] - zoom);
  for (let i = 1; i < cogZoomLookup.length; i += 1) {
    const distance = Math.abs(cogZoomLookup[i] - zoom);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}
