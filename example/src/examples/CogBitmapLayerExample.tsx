import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { CogBitmapLayer } from '@gisatcz/deckgl-geolib';
import { COG_BITMAP_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

function CogBitmapLayerExample() {
  const initialViewState = {
    longitude: 85.481261,
    latitude: 28.11902,
    zoom: 11,
  };

  const layers = useMemo(() => {
    const cogLayer = new CogBitmapLayer({
      id: 'cogLayer_bitmap',
      rasterData: COG_BITMAP_EXAMPLES.NEPAL_SNOW.url,
      isTiled: true,
      cogBitmapOptions: {
        ...COG_BITMAP_EXAMPLES.NEPAL_SNOW.defaultOptions as GeoImageOptions,
        type: 'image',
        useChannel: 1,

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
