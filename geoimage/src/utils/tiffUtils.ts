import type { GeoTIFFImage } from 'geotiff';

/* eslint-disable no-console */

/**
 * Reads TIFF tags to determine the numeric data type (e.g. "UInt8", "Int16", "Float32").
 * The implementation mirrors the logic previously present in CogTiles.
 */
export async function getDataTypeFromTags(fileDirectory: any): Promise<string> {
  const hasSampleFormat = fileDirectory.hasTag('SampleFormat');
  const hasBitsPerSample = fileDirectory.hasTag('BitsPerSample');

  if (!hasSampleFormat || !hasBitsPerSample) {
    console.warn("Missing SampleFormat or BitsPerSample tags, defaulting to UInt8");
    return 'UInt8';
  }

  // In GeoTIFF, BitsPerSample (tag 258) and SampleFormat (tag 339) provide the type info.
  // They can be either a single number or an array if there are multiple samples.
  const sampleFormat = fileDirectory.getValue('SampleFormat'); // Tag 339
  const bitsPerSample = fileDirectory.getValue('BitsPerSample'); // Tag 258

  // If multiple bands exist, assume all bands share the same type.
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
 * Returns the numeric value, NaN, or undefined if not present/parsable.
 */
export function getNoDataValue(image: GeoTIFFImage): number | undefined {
  const noDataRaw = image.getGDALNoData();
  if (noDataRaw === undefined || noDataRaw === null) {
    console.warn('No noData value defined — raster might be rendered incorrectly.');
    return undefined;
  }

  const cleaned = String(noDataRaw).replace(/\0/g, '').trim();

  if (cleaned === '') {
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
    console.warn(`Failed to parse numeric noData value: '${cleaned}'`);
    return undefined;
  }

  return parsed;
}

/* eslint-enable no-console */
