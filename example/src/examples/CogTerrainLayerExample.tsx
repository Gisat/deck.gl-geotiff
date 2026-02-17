import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { CogTerrainLayer, CogBitmapLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

function CogTerrainLayerExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.COPERNICUS_DEM;
  const [viewState, setViewState] = useState<any>(null);
  const [initializedCog, setInitializedCog] = useState<CogTiles | null>(null);

  const terrainOptions: GeoImageOptions = {
    ...mainCog.defaultOptions as GeoImageOptions,
    type: 'terrain',
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

    const cogLayer = new CogTerrainLayer({
      id: 'cog-terrain-layer',
      elevationData: mainCog.url,
      cogTiles: initializedCog,
      isTiled: true,
      tileSize: 256,
      // meshMaxError: 1,
      operation: 'terrain+draw',
      terrainOptions,
    });

    const heatmap = new CogBitmapLayer({
      id: 'cog-bitmap-heatmap',
      rasterData: mainCog.url,
      isTiled: true,
      clampToTerrain: true,
      cogBitmapOptions: {
        type: 'image',
        useHeatMap: true,
        colorScale: [[65, 182, 196], [254, 254, 191], [215, 25, 28]] as any,
        colorScaleValueRange: [0, 800],
        useChannel: 1,
      },
    });

    return [
      // tileLayer,
      heatmap,
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
      getCursor={() => 'inherit'}
      viewState={viewState}
      onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as any)}
      controller
      layers={layers}
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
