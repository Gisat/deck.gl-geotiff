import React, { useState, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { CogBitmapLayer, GeoImageOptions } from '@gisatcz/deckgl-geolib';
import { COG_BITMAP_EXAMPLES } from './dataSources';

function CogMultibandExample() {
  const [useChannel16, setUseChannel16] = useState(false);

  const initialViewState = {
    longitude: 34.25,
    latitude: 1,
    zoom: 10,
  };

  const layers = useMemo(() => {
    const cogLayer = new CogBitmapLayer({
      id: 'CogBitmapLayer',
      rasterData: COG_BITMAP_EXAMPLES.UGANDA_MULTIBAND.url,
      isTiled: true,
      cogBitmapOptions: {
        ...(COG_BITMAP_EXAMPLES.UGANDA_MULTIBAND.defaultOptions as GeoImageOptions),
        useChannel: useChannel16 ? 16 : 15,
      },
      pickable: true,
      onClick: (info: any) => {
        const uv = info.uv || (info.bitmap && info.bitmap.uv);
        if (info.tile && info.tile.content && info.tile.content.raw && uv) {
          const { raw, width, height } = info.tile.content;
          const [u, v] = uv;
          const x = Math.floor(u * width);
          const y = Math.floor(v * height);
          const channels = raw.length / (width * height);
          const pixelIndex = Math.floor((y * width + x) * channels);
          const rawValues = raw.slice(pixelIndex, pixelIndex + channels);
          console.log("Raw COG values at click:", rawValues);
        }
      }
    });

    const tileLayer = new TileLayer({
      data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      id: 'standard-tile-layer',
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
    });

    return [
      tileLayer,
      cogLayer,
    ];
  }, [useChannel16]);

  return (
    <div>
      <DeckGL
        getCursor={() => 'inherit'}
        initialViewState={initialViewState as any}
        controller
        layers={layers}
        views={[
          new MapView({
            controller: true,
            id: 'map',
          }),
        ]}
      />
      <div style={{ position: 'absolute', bottom: 0, right: 0, padding: '10px', background: 'white', width: '50%' }}>
        <label>
          <input
            type="checkbox"
            checked={useChannel16}
            onChange={(e) => setUseChannel16(e.currentTarget.checked)}
          />
          Change band
        </label>
      </div>
    </div>
  );
}

export { CogMultibandExample };
