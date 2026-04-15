import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';
import { BitmapLayer } from '@deck.gl/layers';

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

function CogTerrainLayerExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.COPERNICUS_PHILIPPINES_DEM;
  const [viewState, setViewState] = useState<any>(null);
  const [initializedCog, setInitializedCog] = useState<CogTiles | null>(null);

  const terrainOptions: GeoImageOptions = {
    ...mainCog.defaultOptions as GeoImageOptions,
    type: 'terrain',
    useHeatMap: true,
    colorScale: [[65, 182, 196], [254, 254, 191], [215, 25, 28]] as any,
    colorScaleValueRange: [0, 255],
    useChannel: 1,
  };

  useEffect(() => {
    const init = async () => {
      const cog = new CogTiles(terrainOptions);

      await cog.initializeCog(mainCog.url);
      setInitializedCog(cog);
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
        pitch: 60,
        bearing: 0,
      });
    };

    init();
  }, []);

  const layers = useMemo(() => {
    if (!viewState || !initializedCog) return [];

    const tileLayer = new TileLayer({
      data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      id: 'standard-tile-layer',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
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
    })

    const cogLayer = new CogTerrainLayer({
      id: 'cog-terrain-layer',
      elevationData: mainCog.url,
      cogTiles: initializedCog,
      isTiled: true,
      tileSize: 256,
      // meshMaxError: 1,
      operation: 'terrain+draw',
      terrainOptions,
      pickable: true,
      onClick: (info: any) => {
        const elevation = getElevationAtInfo(info);
        if (elevation !== null) console.log('Raw elevation at click:', elevation);
      },

    });

    return [
      // tileLayer,
      cogLayer,
    ];
  }, [viewState, initializedCog]);

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
  );
}

export { CogTerrainLayerExample };
