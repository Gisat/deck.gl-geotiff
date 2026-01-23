import React, { useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { InitialViewStateProps } from '@deck.gl/core/lib/deck';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { CogBitmapLayer } from '@gisatcz/deckgl-geolib/src';

const cogLayerDefinition = {
  id: 'CogBitmapLayer',
  rasterData: 'https://eu-central-1.linodeobjects.com/gisat-data/LUISA_GST-66/project/demo_data_20250507/v1/regional/UG/UG-eosd-2018-2023_cog.tif',
  cogBitmapOptions: {
    type: 'image',
    blurredTexture: false,
    clipLow: 0,
    useChannel: 1,
    useHeatMap: true,
    colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScaleValueRange: [1, 100, 200, 300, 400],
  },

  isTiled: true,
};

const getCogLayer = (opacity: number) => new CogBitmapLayer({ ...cogLayerDefinition, opacity });
const getCogLayerWithChangedOptions = (cogBitmapOptions: Object) => new CogBitmapLayer({ ...cogLayerDefinition, cogBitmapOptions });

const tileLayer = new TileLayer({
  data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  id: 'standard-tile-layer',
  minZoom: 0,
  maxZoom: 19,
  tileSize: 256,

  renderSubLayers: (props) => {
    const {
      bbox: {
        west, south, east, north,
      },
    } = props.tile;

    return new BitmapLayer(props, {
      data: null,
      image: props.data,
      bounds: [west, south, east, north],
    });
  },
});
const useInterval = (callback, delay) => {
  const [intervalId, setIntervalId] = useState(null);

  useEffect(() => {
    if (delay !== null) {
      const id = setInterval(callback, delay);
      setIntervalId(id);
      return () => clearInterval(id);
    }
  }, []);

  return intervalId;
};

function CogMultibandExample() {
  const [layer, setLayer] = useState(getCogLayer(1));
  const opacityRef = useRef(1);

  // Set true to test change opacity in interval
  if (false) {
    useInterval(() => {
      const newOpacity = opacityRef.current - 0.1;
      opacityRef.current = newOpacity;
      setLayer(getCogLayer(newOpacity));
    }, 2000);
  }

  const initialViewState: InitialViewStateProps = {
    longitude: 34.25,
    latitude: 1,
    zoom: 10,
  };

  const setBand = (isBand2: boolean)=> {
    const cogBitmapOptions: CogBitmapOptions = {
        ...cogLayerDefinition.cogBitmapOptions,
        useChannel: isBand2 ? 2 : 1,
    }
    setLayer(getCogLayerWithChangedOptions(cogBitmapOptions));
  }

  return (
      <div>
        <DeckGL
            getCursor={() => 'inherit'}
            initialViewState={initialViewState}
            controller
            layers={[tileLayer, layer]}
            views={[
              new MapView({
                controller: true,
                id: 'map',
                height: '100%',
                top: '100px',
                width: '100%',
              }),
            ]}
        />
        <div style={{position: 'absolute', bottom: 0, right: 0, padding: '10px', background: "white", width: "50%"}}>
          <label><input type="checkbox" onChange={(e) => setBand(e.currentTarget.checked)}/>Band 2</label>
        </div>
      </div>
  );
}

export { CogMultibandExample };
