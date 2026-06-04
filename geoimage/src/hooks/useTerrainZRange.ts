import { useState } from 'react';
import type { ZRange } from '../layers/CogTerrainLayer';

/**
 * React hook for syncing terrain elevation bounds to overlay TileLayer for 3D frustum culling.
 *
 * Manages the zRange state needed to prevent foreground tile clipping when viewport is tilted in 3D.
 *
 * @returns Object with zRange state and onZRangeUpdate callback
 *
 * @example
 * ```typescript
 * const { zRange, onZRangeUpdate } = useTerrainZRange();
 *
 * const layers = useMemo(() => [
 *   new TileLayer({
 *     id: 'osm',
 *     zRange: zRange,  // Pass elevation bounds to overlay
 *     // ... other props
 *   }),
 *   new CogTerrainLayer({
 *     id: 'terrain',
 *     onZRangeUpdate: onZRangeUpdate,  // Sync elevation bounds from terrain
 *     // ... other props
 *   }),
 * ], [zRange]);
 * ```
 */
export function useTerrainZRange() {
  const [zRange, setZRange] = useState<ZRange | null>(null);

  return {
    zRange,
    onZRangeUpdate: setZRange,
  };
}
