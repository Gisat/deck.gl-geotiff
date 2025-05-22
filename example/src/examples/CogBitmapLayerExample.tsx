import React, { useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { InitialViewStateProps } from '@deck.gl/core/lib/deck';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import chroma from 'chroma-js';
import CogBitmapLayer from '@gisatcz/deckgl-geolib/src/cogbitmaplayer/CogBitmapLayer';

const cogLayerDefinition = {
  id: 'CogBitmapLayer',
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaUtepUnHabitat/rasters/global/GHS-POP/GHS_POP_E2015_COGeoN.tif',
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
  // deflate
  // rasterData: 'http://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_deflate.tif',
  // lzw
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-data/LUISA_GST-66/project/demo_data_20250507/v1/regional/UG/UG-sosd-2018-2023_cog.tif',
  // packbits
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_packbits_8.tif',
  // lerc
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_lerc_8.tif',
  // raw
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_raw.tif',
  // jpeg
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/Manila_S2_Composite_2020022_Mercator_RGB_COG_jpeg_8.tif',
  // erika test 1 co nesedi
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_1000m_web.tif',
  // erika test 2 co je ok
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_32768_COGeoN.tif',
  // gruzie
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/bsadri/test_raster/COG/LC_2021_all_Georgia_WEST3940_ZOOM6_test1_defl_COG256.tif',
  // pavel uganda bez aligned levels
  rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Pavel_Luisa/openEO_2020-01-01Z_npp_act_cog_no_aligned_levels.tif',
  cogBitmapOptions: {
    type: 'image',
    blurredTexture: false,
    // clipLow: 0,
    useChannel: 1,
    // alpha: 50,
    // useSingleColor: true,
    useHeatMap: true,
    // colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScaleValueRange: [-200, -100, 0, 100, 200],
    // nullColor: [127, 0, 255, 120],//violet
    // unidentifiedColor: [255, 192, 203, 120],//pink
    // clippedColor: [255, 255, 0, 120],//yellow
    // colorScale: ['green', 'red', 'blue'],
    // colorScaleValueRange: [0, 3],
  },

  isTiled: true,
};

const getCogLayer = (opacity: number) => new CogBitmapLayer({ ...cogLayerDefinition, opacity });

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

function CogBitmapLayerExample() {
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
    longitude: 0,
    latitude: 0,
    zoom: 1,
  };

  return (
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
  );
}

export { CogBitmapLayerExample };
