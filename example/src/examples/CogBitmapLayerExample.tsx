import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { CogBitmapLayer } from '@gisatcz/deckgl-geolib';

function CogBitmapLayerExample() {
  const initialViewState = {
    longitude: 85.481261,
    latitude: 28.11902,
    zoom: 11,
  };

  const layers = useMemo(() => {
    const cogLayer = new CogBitmapLayer({
      id: 'cogLayer_bitmap',
      rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/esaGdaAdbNepal23/rasters/snow_cover_cog/WET_SNOW_3857_2017-2021_cog_deflate_in16_zoom16_levels8.tif',
      isTiled: true,
      cogBitmapOptions: {
        type: 'image',
        blurredTexture: true,
        useChannel: 1,
        // alpha: 80,
        useHeatMap: true,
        colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
        colorScaleValueRange: [0, 300],
      },
    });

    const tileLayer = new TileLayer({
      data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      id: 'standard-tile-layer',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,

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

    return [
      tileLayer,
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

export { CogBitmapLayerExample };
