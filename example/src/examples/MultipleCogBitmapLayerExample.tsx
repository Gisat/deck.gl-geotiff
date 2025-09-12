import React, { useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { InitialViewStateProps } from '@deck.gl/core/lib/deck';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import chroma from 'chroma-js';
import CogBitmapLayer from '@gisatcz/deckgl-geolib/src/cogbitmaplayer/CogBitmapLayer';

const s3BaseUrl = 'https://worldcereal-dev.gisat.cz/linode-proxy-http2/WorldCereal_GST-10/project/demo/';
const cogFileNames = [
  '10162_tc-maize-main_activecropland_2020-10-13_2021-05-26_classification_3857.tif',
  '12048_tc-maize-main_activecropland_2020-09-02_2021-06-09_classification_3857.tif',
  '30112_tc-maize-main_activecropland_2020-08-14_2021-05-12_classification_3857.tif',
  '31113_tc-maize-main_activecropland_2021-05-19_2021-12-07_classification_3857.tif',
  '31114_tc-maize-main_activecropland_2020-07-27_2021-01-23_classification_3857.tif',
  '32114_tc-maize-main_activecropland_2021-04-12_2021-12-09_classification_3857.tif',
  '32115_tc-maize-main_activecropland_2021-05-15_2021-11-07_classification_3857.tif',
  '32116_tc-maize-main_activecropland_2021-05-19_2021-10-27_classification_3857.tif',
  '32121_tc-maize-main_activecropland_2021-03-27_2021-11-19_classification_3857.tif',
  '34120_tc-maize-main_activecropland_2021-05-08_2021-11-12_classification_3857.tif',
  '36124_tc-maize-main_activecropland_2021-04-02_2021-12-17_classification_3857.tif',
  '38127_tc-maize-main_activecropland_2021-04-20_2021-11-06_classification_3857.tif',
  '4010_tc-maize-main_activecropland_2021-01-28_2021-08-03_classification_3857.tif',
  '43134_tc-maize-main_activecropland_2021-04-11_2021-10-22_classification_3857.tif',
  '7091_tc-maize-main_activecropland_2021-03-18_2021-10-25_classification_3857.tif',
  '9028_tc-maize-main_activecropland_2020-11-04_2021-05-06_classification_3857.tif',
  '9029_tc-maize-main_activecropland_2020-11-08_2021-05-07_classification_3857.tif',
  '9030_tc-maize-main_activecropland_2020-10-26_2021-05-29_classification_3857.tif'
];

const cogBitmapOptions = {
  type: 'image',
  blurredTexture: false,
  useChannel: 1,
  useHeatMap: true,
  colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
  colorScaleValueRange: [-200, -100, 0, 100, 200],
  isTiled: true,
};

function getCogLayerForFile(fileName: string, opacity: number = 1) {
  return new CogBitmapLayer({
    id: `CogBitmapLayer-${fileName}`,
    rasterData: s3BaseUrl + encodeURIComponent(fileName),
    cogBitmapOptions,
    opacity,
    isTiled: true,
  });
}

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

function MultipleCogBitmapLayerExample() {
  const [opacity] = useState(1);

  const cogLayers = cogFileNames.map(fileName => getCogLayerForFile(fileName, opacity));

  const initialViewState: InitialViewStateProps = {
    longitude: 0,
    latitude: 0,
    zoom: 1,
  };

  return (
    <DeckGL
      getCursor={() => 'inherit'}
      initialViewState={initialViewState}
      controller
      layers={[tileLayer, ...cogLayers]}
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
  );
}

export { MultipleCogBitmapLayerExample };
