export const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
export const EARTH_HALF_CIRCUMFERENCE = EARTH_CIRCUMFERENCE / 2;
export const webMercatorOrigin = [-20037508.342789244, 20037508.342789244];
export const webMercatorRes0 = 156543.03125;

export function getLatLon(input: number[]): [number, number] {
  const x = input[0];
  const y = input[1];

  const lon = (x / EARTH_HALF_CIRCUMFERENCE) * 180;
  let lat = (y / EARTH_HALF_CIRCUMFERENCE) * 180;

  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);

  return [lon, lat];
}

export function getZoomLevelFromResolution(tileSize: number, resolution: number): number {
  return Math.round(Math.log2(EARTH_CIRCUMFERENCE / (resolution * tileSize)));
}

export function calculateZoomRange(tileSize: number, resolution: number, imgCount: number): [number, number] {
  const maxZoom = getZoomLevelFromResolution(tileSize, resolution);
  const minZoom = maxZoom - (imgCount - 1);
  return [minZoom, maxZoom];
}

export function calculateBoundsAsLatLon(bbox: number[]): [number, number, number, number] {
  const minX = Math.min(bbox[0], bbox[2]);
  const maxX = Math.max(bbox[0], bbox[2]);
  const minY = Math.min(bbox[1], bbox[3]);
  const maxY = Math.max(bbox[1], bbox[3]);

  const minXYDeg = getLatLon([minX, minY]);
  const maxXYDeg = getLatLon([maxX, maxY]);

  return [minXYDeg[0], minXYDeg[1], maxXYDeg[0], maxXYDeg[1]];
}
