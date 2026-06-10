import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { CogBitmapLayer, CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { useTerrainZRange } from '@gisatcz/deckgl-geolib/react';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';
import { BitmapLayer } from '@deck.gl/layers';

type TerrainMode = 'lit' | 'glaze' | 'plain';

function getElevationAtInfo(info: any): number | null {
  const tileResult = info.tile?.content?.[0];
  if (!tileResult?.raw) return null;
  const { raw, width, height } = tileResult;

  let u: number | undefined, v: number | undefined;
  if (info.uv) {
    [u, v] = info.uv;
  } else if (info.coordinate && info.tile?.bbox) {
    const { west, south, east, north } = info.tile.bbox as any;
    u = (info.coordinate[0] - west) / (east - west);
    v = (north - info.coordinate[1]) / (north - south);
  }
  if (u === undefined || v === undefined) return null;

  const x = Math.min(width - 1, Math.max(0, Math.floor(u * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * (height - 1))));
  return raw[y * width + x];
}

function CogTerrainGlazeExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.COPERNICUS_NEPAL_DEM;
  const [viewState, setViewState] = useState<any>(null);
  const [mode, setMode] = useState<TerrainMode>('lit');

  const buildTerrainOptions = (m: TerrainMode): GeoImageOptions => ({
    ...mainCog.defaultOptions as GeoImageOptions,
    type: 'terrain',
    useSingleColor: true,
    disableLighting: m !== 'lit',
    noDataValue: 0,
    useChannel: 1,
  });

  const glazeOptions: GeoImageOptions = {
    ...mainCog.defaultOptions as GeoImageOptions,
    type: 'image',
    useReliefGlaze: true,
    noDataValue: 0,
    swissSlopeWeight: 0.3,
    zFactor: 20,
    useChannel: 1,
    maxGlazeAlpha: 100,
  };

  // Map of CogTiles instances, one per terrain mode, to enable caching and reuse
  const [cogTilesCache] = useState(
    new Map<TerrainMode, CogTiles>([
      ['lit', new CogTiles(buildTerrainOptions('lit'))],
      ['glaze', new CogTiles(buildTerrainOptions('glaze'))],
      ['plain', new CogTiles(buildTerrainOptions('plain'))],
    ])
  );
  // Separate glaze layer CogTiles
  const [glazeCogTiles] = useState(new CogTiles(glazeOptions));
  // cogState pairs CogTiles with the mode it was initialized for.
  const [cogState, setCogState] = useState<{ cog: CogTiles; glaze: CogTiles; mode: TerrainMode } | null>(null);
  // Sync terrain zRange to overlay TileLayer for 3D frustum culling
  const { zRange, onZRangeUpdate } = useTerrainZRange();

  // Initial load: set viewState and initialize all CogTiles instances
  useEffect(() => {
    const init = async () => {
      // Initialize all terrain and glaze CogTiles instances in parallel
      await Promise.all([
        ...Array.from(cogTilesCache.values()).map((cog) =>
          cog.initializeCog(mainCog.url)
        ),
        glazeCogTiles.initializeCog(mainCog.url),
      ]);

      const cog = cogTilesCache.get(mode)!;
      const bounds = cog.getBoundsAsLatLon();

      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });

      const {
        longitude, latitude, zoom,
      } = viewport.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 20 },
      );

      setViewState({
        longitude,
        latitude,
        zoom,
        pitch: 70,
        bearing: 0,
      });
      setCogState({ cog, glaze: glazeCogTiles, mode });
    };

    init();
  }, []);

  // Switch to the appropriate CogTiles instance on mode change.
  // Since instances are pre-initialized and cached, switching is instant with no re-fetching.
  useEffect(() => {
    if (!viewState || !cogTilesCache.has(mode)) return;
    const cog = cogTilesCache.get(mode)!;
    setCogState((prev) => ({ ...prev!, cog, mode }));
  }, [mode, viewState]);

  const layers = useMemo(() => {
    if (!viewState || !cogState) return [];

    const tileLayer = new TileLayer({
      data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      id: 'standard-tile-layer',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      zRange: zRange,
      extensions: [new TerrainExtension()],

      renderSubLayers: (props) => {
        const { bbox } = props.tile as any;
        const { west, south, east, north } = bbox;

        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    const terrainOptions = buildTerrainOptions(cogState.mode);
    const cogTerrainLayer = new CogTerrainLayer({
      id: 'cog-terrain-layer',
      elevationData: mainCog.url,
      cogTiles: cogState.cog,
      isTiled: true,
      tileSize: 256,
      operation: 'terrain',
      terrainOptions,
      onZRangeUpdate: onZRangeUpdate,
      // disableTexture: cogState.mode === 'glaze',
      pickable: false,
      onClick: (info: any) => {
        const elevation = getElevationAtInfo(info);
        if (elevation !== null) console.log('Raw elevation at click:', elevation);
      },
    });

    const layerStack: any[] = [tileLayer, cogTerrainLayer];

    if (cogState.mode === 'glaze' && cogState.glaze) {
      try {
        const cogReliefShadeLayer = new CogBitmapLayer({
          id: 'cog-relief-shade-layer',
          rasterData: mainCog.url,
          cogTiles: cogState.glaze,
          isTiled: true,
          tileSize: 256,
          clampToTerrain: true,
          extensions: [new TerrainExtension()],
          cogBitmapOptions: glazeOptions,
        });
        layerStack.push(cogReliefShadeLayer);
      } catch (e) {
        console.warn('Failed to create glaze layer:', e);
      }
    }

    return layerStack;
  }, [viewState, cogState, zRange, onZRangeUpdate]);

  if (!viewState) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <div>Loading AOI...</div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 200,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'white', padding: 12, borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 'bold' }}>Terrain Mode</div>
        {(['lit', 'glaze', 'plain'] as TerrainMode[]).map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
            {m === 'lit' ? 'Lit (with Lighting)' : m === 'glaze' ? 'Glaze (Relief Overlay)' : 'Plain (No Lighting, No Glaze)'}
          </label>
        ))}
      </div>
      <DeckGL
        getCursor={() => 'crosshair'}
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as any)}
        controller
        layers={layers}
        getTooltip={(info: any) => {
          const elevation = getElevationAtInfo(info);
          return elevation !== null ? { text: `Elevation: ${elevation.toFixed(1)} m` } : null;
        }}
        views={[
          new MapView({
            controller: true,
            id: 'map',
            height: '100%',
            width: '100%',
          }),
        ]}
      />
    </>
  );
}

export { CogTerrainGlazeExample };
