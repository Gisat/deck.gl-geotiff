import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

type KernelMode = 'elevation' | 'slope' | 'hillshade';

const MODE_OPTIONS: Record<KernelMode, Partial<GeoImageOptions>> = {
  elevation: {
      useHeatMap: true,
      colorScale: [
        [75, 120, 90],    // Brightened forest green
        [100, 145, 100],  // Soft meadow green
        [130, 170, 110],  // Bright moss
        [185, 210, 145],  // Sunny sage
        [235, 235, 185],  // Pale primrose (transitional)
        [225, 195, 160],  // Sand / light terracotta (matches slope)
        [195, 160, 130],  // Warm clay brown
        [170, 155, 150],  // Warm slate grey
        [245, 245, 240],  // Bright mist
        [255, 255, 255],  // Pure peak white
      ] as any,
      colorScaleValueRange: [1000, 6500],
    },
  slope: {
    useSlope: true,
    useHeatMap: true,
    colorScale: [
      [255, 255, 255], // 0-29°: Clear / White
      [235, 200, 150], // 30°: Light warm tan (Start of danger)
      [200, 80, 50],   // 35°: Burnt Red-Orange
      [100, 40, 30],   // 45°+: Deep Red-Brown
    ] as any,
    colorScaleValueRange: [0, 90],
  },
  hillshade: {
    useHillshade: true,
    useHeatMap: true,
    colorScale: [
      [52, 38, 35],    // Shadows (Warm Charcoal)
      [255, 250, 245],  // Highlights (Warm White)
    ] as any,
    colorScaleValueRange: [0, 255],
    hillshadeAzimuth: 315,
    hillshadeAltitude: 45,
  },
};

const buildTerrainOptions = (m: KernelMode): GeoImageOptions => ({
  type: 'terrain',
  useChannel: 1,
  noDataValue: 0,
  ...MODE_OPTIONS[m],
});

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

function getDerivedAtInfo(info: any): number | null {
  const tileResult = info.tile?.content?.[0];
  if (!tileResult?.rawDerived) return null;
  const { rawDerived } = tileResult;
  const width = 256;
  const height = 256;

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
  return rawDerived[y * width + x];
}

function CogTerrainKernelExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.COPERNICUS_NEPAL_DEM;
  const [viewState, setViewState] = useState<any>(null);
  const [mode, setMode] = useState<KernelMode>('elevation');
  // cogState pairs CogTiles with the mode it was initialized for.
  // null while reinitializing — prevents layers from rendering with wrong CogTiles.
  const [cogState, setCogState] = useState<{ cog: CogTiles; mode: KernelMode } | null>(null);

  // Initial load: set viewState and first cogTiles
  useEffect(() => {
    const init = async () => {
      const cog = new CogTiles(buildTerrainOptions(mode));
      await cog.initializeCog(mainCog.url);
      const bounds = cog.getBoundsAsLatLon();

      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });

      const { longitude, latitude, zoom } = viewport.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 20 },
      );

      setViewState({ longitude, latitude, zoom, pitch: 60, bearing: 0 });
      setCogState({ cog, mode });
    };
    init();
  }, []);

  // Reinitialize CogTiles on mode change.
  // Does NOT clear cogState — old layer stays mounted so deck.gl keeps tile content visible
  // while new tiles are being computed (kernel calculation).
  useEffect(() => {
    if (!viewState) return; // Don't reinit before initial load completes
    const options = buildTerrainOptions(mode);
    const cog = new CogTiles(options);
    cog.initializeCog(mainCog.url).then(() => {
      setCogState({ cog, mode });
    });
  }, [mode]);

  const layers = useMemo(() => {
    if (!viewState || !cogState) return [];

    return [
      new TileLayer({
        id: 'osm',
        data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        pickable: false,
        renderSubLayers: (props) => {
          const { bbox } = props.tile as any;
          const { west, south, east, north } = bbox;
          return new BitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [west, south, east, north],
          });
        },
      }),
      new CogTerrainLayer({
        id: 'cog-terrain-kernel',
        elevationData: mainCog.url,
        cogTiles: cogState.cog,
        isTiled: true,
        tileSize: 256,
        operation: 'terrain+draw',
        terrainOptions: buildTerrainOptions(cogState.mode),
        pickable: true,
      }),
    ];
  }, [viewState, cogState]);

  const isTransitioning = cogState?.mode !== mode;

  if (!viewState) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading AOI...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 200,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'white', padding: 12, borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 14 }}>Kernel Mode</strong>
          {isTransitioning && (
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              border: '2px solid #ccc', borderTopColor: '#555',
              animation: 'spin 0.7s linear infinite',
            }} />
          )}
        </div>
        {(['elevation', 'slope', 'hillshade'] as KernelMode[]).map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
            {m.charAt(0).toUpperCase() + m.slice(1)}
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
          const derived = getDerivedAtInfo(info);
          if (elevation === null) return null;
          const displayMode = cogState?.mode ?? mode;
          const lines = [`Elevation: ${elevation.toFixed(1)} m`];
          if (derived !== null) {
            if (displayMode === 'slope') lines.push(`Slope: ${derived.toFixed(1)}\xB0`);
            if (displayMode === 'hillshade') lines.push(`Hillshade: ${derived.toFixed(0)}`);
          }
          return { text: lines.join('\n') };
        }}
        views={[
          new MapView({ controller: true, id: 'map', height: '100%', width: '100%' }),
        ]}
      />
    </>
  );
}

export { CogTerrainKernelExample };
