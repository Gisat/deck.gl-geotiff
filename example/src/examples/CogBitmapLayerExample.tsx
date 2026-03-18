import React, { useMemo, useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { CogBitmapLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { COG_BITMAP_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

function getRawValueAtUv(info: any): number | null {
  const uv = info.uv || (info.bitmap && info.bitmap.uv);
  if (!info.tile?.content?.raw || !uv) return null;
  const { raw, width, height } = info.tile.content;
  const [u, v] = uv;
  const x = Math.floor(u * width);
  const y = Math.floor(v * height);
  const channels = raw.length / (width * height);
  const pixelIndex = Math.floor((y * width + x) * channels);
  return raw[pixelIndex];
}

function CogBitmapLayerExample() {
  const mainCog = COG_BITMAP_EXAMPLES.NEPAL_SNOW;
  const [viewState, setViewState] = useState<any>(null);
  const [initializedCog, setInitializedCog] = useState<CogTiles | null>(null);

  // Define GeoImageOptions outside to ensure consistency
  const cogBitmapOptions: GeoImageOptions = {
    useChannel: 1,
    ...(mainCog.defaultOptions as GeoImageOptions),
    // Ensure the type is 'image' for this example, overriding any default.
    type: 'image',
  };

  useEffect(() => {
    const init = async () => {
      const cog = new CogTiles(cogBitmapOptions);

      await cog.initializeCog(mainCog.url);
      setInitializedCog(cog);
      const bounds = cog.getBoundsAsLatLon();

      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });

      const { longitude, latitude, zoom } = viewport.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 20 }
      );

      setViewState({
        longitude,
        latitude,
        zoom,
      });
    };

    init();
  }, []);

  const layers = useMemo(() => {
    if (!viewState) return [];

    return [
      new TileLayer({
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
      }),
      new CogBitmapLayer({
        id: 'cogLayer_bitmap',
        rasterData: mainCog.url,
        isTiled: true,
        cogTiles: initializedCog || undefined,
        cogBitmapOptions,
        pickable: true,
        onClick: (info: any) => {
          const uv = info.uv || (info.bitmap && info.bitmap.uv);
          if (info.tile?.content?.raw && uv) {
            const { raw, width, height } = info.tile.content;
            const [u, v] = uv;
            const x = Math.floor(u * width);
            const y = Math.floor(v * height);
            const channels = raw.length / (width * height);
            const pixelIndex = Math.floor((y * width + x) * channels);
            const rawValues = Array.from(raw.slice(pixelIndex, pixelIndex + channels));
            console.log('Raw COG values at click (all bands):', rawValues);
          }
        },
      }),
    ];
  }, [viewState, initializedCog]);

  if (!viewState) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading AOI...</div>
      </div>
    );
  }

  return (
    <DeckGL
      getCursor={() => 'crosshair'}
      viewState={viewState}
      onViewStateChange={({ viewState }) => setViewState(viewState as any)}
      controller
      layers={layers}
      getTooltip={(info: any) => {
        const value = getRawValueAtUv(info);
        return value !== null ? { text: `Value: ${value.toFixed(2)}` } : null;
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

export { CogBitmapLayerExample };
