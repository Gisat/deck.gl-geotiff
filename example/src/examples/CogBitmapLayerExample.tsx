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
  // 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/Quadrants/Q3_Bolivia_ASTER_2002_RGB_COG_LZW.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/MANILA/Manila_S2_Composite_2020022_Mercator_RGB_COG_DEFLATE.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/MANILA/Manila_S2_Composite_2020022_Mercator_RGB_COG_JPEG.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint8.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint16.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint32.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_float32.tif',
  // 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_float64.tif',
  // 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_lzw_cog_uint8.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_lzw_cog_float32.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
  //   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/DEM_COP30_float32_wgs84_deflate_cog_float32.tif',

  //    heatmap
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
  // cogBitmapOptions: {
  //   type: 'image', useChannel: 30, useHeatMap: true, colorScaleValueRange: [0, 3], clipLow: 1, colorScale: chroma.brewer.Blues,
  // },
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaUtepUnHabitat/rasters/global/GHS-POP/GHS_POP_E2015_COGeoN.tif',
  // rasterData: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
  // deflate
  // rasterData: 'http://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_deflate.tif',
  // lzw
  rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_lzw.tif',
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
  // rasterData: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Pavel_Luisa/openEO_2020-01-01Z_npp_act_cog_no_aligned_levels.tif',
  cogBitmapOptions: {
    type: 'image',
    blurredTexture: false,
    // clipLow: 0,
    useChannel: 0,
    // alpha: 50,
    // useSingleColor: true,
    useHeatMap: true,
    // colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
    colorScaleValueRange: [1, 100, 200, 300, 366],
    // nullColor: [127, 0, 255, 120],//violet
    // unidentifiedColor: [255, 192, 203, 120],//pink
    // clippedColor: [255, 255, 0, 120],//yellow
    // colorScale: ['green', 'red', 'blue'],
    // colorScaleValueRange: [0, 3],
  },

  isTiled: true,
};
//     colors based on values
// 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
// {
//   type: 'image', useChannel: 5, useColorsBasedOnValues: true, clipLow: 0, colorsBasedOnValues: [[1, '#deebf7'], [2, '#9ecae1'], [3, '#3182bd']],
// },

// color classes
// 'https://gisat-gis.eu-central-1.linodeobjects.com/esaBsadri/app4ForestMonitoring/md_z1_density.tif',
// {
//   type: 'image', useColorClasses: true, colorClasses: [['pink', [-452, 633], [true, false]], ['blue', [633, 1719], [true, false]], ['orange', [1719, 2805], [true, false]], ['red', [2805, 3891], [true, true]]],
// },

// single color
// 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
// { type:"image", useChannel: 10, useSingleColor: true, clipLow: 2, clipHigh: 3, color: 'red', clippedColor:[245, 245, 220, 80]}

// Nepal snow cover
// 'https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/snow_cover_cog/SNOW_3857_2017-2021_cog_deflate.tif',
// {
//   type: 'image', useChannel: 0, useHeatMap: true, colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'], colorScaleValueRange: [1, 100, 200, 300, 366],
// },

// Nepal wet snow cover
// 'https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/snow_cover_cog/WET_SNOW_3857_2017-2021_cog_deflate.tif',
// {
//   type: 'image', useChannel: 0, useHeatMap: true, colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'], colorScaleValueRange: [1, 100, 200, 300, 366],
// },

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
