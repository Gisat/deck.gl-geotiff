import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { CogTerrainLayer, CogBitmapLayer } from "@gisatcz/deckgl-geolib";
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

function CogTerrainLayerExample() {
  const initialViewState = {
    longitude: 120.73420,
    latitude: 15.20150,
    zoom: 12,
    pitch: 60,
  };

  const layers = useMemo(() => {
    const cogLayer = new CogTerrainLayer({
      id: 'cog-terrain-layer',
      elevationData: COG_TERRAIN_EXAMPLES.PAMZAM_DEM.url,
      isTiled: true,
      tileSize: 256,
      // meshMaxError: 1,
      operation: 'terrain+draw',
      terrainOptions: {
        ...COG_TERRAIN_EXAMPLES.PAMZAM_DEM.defaultOptions as GeoImageOptions,
        type: 'terrain',
      },
    });

    const tileLayer = new TileLayer({
      data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      id: 'standard-tile-layer',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      extensions: [new TerrainExtension()],

      renderSubLayers: (props) => {
        const {
          bbox: {
            west, south, east, north,
          },
        } = props.tile as any;

        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    const heatmap = new CogBitmapLayer({
      id: 'cog-bitmap-heatmap',
      rasterData: COG_TERRAIN_EXAMPLES.PAMZAM_DEM.url,
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
  }, []);

  return (
    <DeckGL
      getCursor={() => 'inherit'}
      initialViewState={initialViewState as any}
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
