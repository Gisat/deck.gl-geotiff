import React, { useCallback, useRef } from 'react';
import DeckGL from '@deck.gl/react';
// import { readPixelsToArray } from '@luma.gl/webgl-legacy';
import { InitialViewStateProps } from '@deck.gl/core/lib/deck';
// import { TerrainLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import {
  MVTLayer,
  TileLayer,
  _WMSLayer as WMSLayer,
} from '@deck.gl/geo-layers';
// import { MVTLoader } from '@loaders.gl/mvt';
import { BitmapLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
// import { AnyARecord } from 'dns';
// import CogTerrainLayer from '@gisatcz/deckgl-geolib/src/cogterrainlayer/CogTerrainLayer';
// import CogBitmapLayer from '@gisatcz/deckgl-geolib/src/cogbitmaplayer/CogBitmapLayer';
import { CogTerrainLayer as TerrainLayer } from "@gisatcz/deckgl-geolib/src";

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ];
  }
  return [];
}

const styleClasses = [
  {
    fill: '#b1001d',
    name: '< -50 (Subsidence)',
    interval: [-1000, -50],
    intervalBounds: [true, false],
  },
  {
    fill: '#ca2d2f',
    interval: [-50, -40],
    intervalBounds: [true, false],
  },
  {
    fill: '#e25b40',
    interval: [-40, -30],
    intervalBounds: [true, false],
  },
  {
    fill: '#ffaa00',
    interval: [-30, -20],
    intervalBounds: [true, false],
  },
  {
    fill: '#ffff00',
    interval: [-20, -10],
    intervalBounds: [true, false],
  },
  {
    fill: '#a0f000',
    interval: [-10, 0],
    intervalBounds: [true, false],
  },
  {
    fill: '#4ce600',
    interval: [0, 10],
    intervalBounds: [true, false],
  },
  {
    fill: '#50d48e',
    interval: [10, 20],
    intervalBounds: [true, false],
  },
  {
    fill: '#00c3ff',
    interval: [20, 30],
    intervalBounds: [true, false],
  },
  {
    fill: '#0f80d1',
    interval: [30, 40],
    intervalBounds: [true, false],
  },
  {
    fill: '#004ca8',
    interval: [40, 50],
    intervalBounds: [true, false],
  },
  {
    fill: '#003e8a',
    name: '(Uplift) 50 <',
    interval: [50, 1000],
    intervalBounds: [true, false],
  },
];

/*
  const cogLayer = new CogTerrainLayer(
    "CogTerrainLayer",
    // 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
    'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
    { type: "terrain", format: "FLOAT32", multiplier: 1.0, useChannel: null },
    'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
    { type: "image", format: "FLOAT32", multiplier: 1.0, rangeMin: -100, rangeMax: 1000 }
  )
  */

// const cogLayer = new CogTerrainLayer(
//   'CogTerrainLayer',
//   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
//   // 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
//   { type: 'terrain', multiplier: 0.1, useChannel: null },
//   'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=pk.eyJ1Ijoiam9ldmVjeiIsImEiOiJja3lpcms5N3ExZTAzMm5wbWRkeWFuNTA3In0.dHgiiwOgD-f7gD7qP084rg',
// );

const cogLayer = new TerrainLayer({
  // globální
  elevationData: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
  // minZoom: 0,
  // maxZoom: 9,
  meshMaxError: 10,

  // elevationData: 'https://gisat-gis.eu-central-1.linodeobjects.com/3dflus/d8/LITC52_53_4g_5m_4326_cog_nodata.tif',
  // elevationData: 'https://gisat-gis.eu-central-1.linodeobjects.com/3dflus/d8/DMT-Prackovice_1m-verze2_4326_cog_nodata.tif',
  // minZoom: 9,
  // maxZoom: 17,
  // meshMaxError: 1,

  // elevationData: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
  // minZoom: 0,
  // maxZoom: 9,
  // meshMaxError: 20,

  opacity: 1,
  isTiled: true,
  useChannel: null,
  tileSize: 256,

  operation: 'terrain+draw',
  // elevationData: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/terrain.png',
  terrainOptions: {
    type: 'terrain', multiplier: 0.1, useChannel: null, terrainSkirtHeight: 1,
  },
});

// const coBitmapLayer = new CogBitmapLayer(
//   'CogBitmapLayer',
//   'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
//   // 'https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/snow_cover_cog/WET_SNOW_3857_2017-2021_cog_deflate_in16_zoom16_levels8.tif',
//   {
//     type: 'image',
//     useChannel: null,
//     multiplier: 0.1,
//     useHeatMap: true,
//     terrainMinValue: 100,
//     colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
//     colorScaleValueRange: [1, 100, 200, 300, 366],
//     clampToTerrain: {
//       terrainDrawMode: 'terrain+draw',
//     },
//   },
// );

class CogTerrainLayerExample extends React.Component<{}> {
  render() {
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
        } = props.tile;

        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    const initialViewState: InitialViewStateProps = {
      longitude: 14.03014071313204,
      latitude: 50.566048665612065,
      zoom: 18,

    };
    /*
    const WMSlayerMapped = new WMSLayer({
      id: 'WMSlayerMapped',
      data: 'https://ows.terrestris.de/osm/service',
      serviceType: 'wms',
      layers: ['OSM-WMS'],
      extensions: [new TerrainExtension()],
      terrainDrawMode: 'drape',
    });
    */
    // const WMSlayer = new WMSLayer({
    //   id: 'WMSlayer',
    //   data: 'https://ows.terrestris.de/osm/service',
    //   serviceType: 'wms',
    //   layers: ['OSM-WMS'],
    //   extensions: [new TerrainExtension()],
    //   // terrainDrawMode: 'drape',
    //   terrainDrawMode: 'terrain+draw',
    // });
    /*
    const vectorLayer = new MVTLayer({
      extensions: [new TerrainExtension()],
      terrainDrawMode: 'drape',
      data: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/mvt/142_decimated_2/{z}/{x}/{y}.mvt',
      loaders: [MVTLoader],
      loadOptions: { worker: false },
      minZoom: 0,
      maxZoom: 15,
      getLineColor: [192, 192, 192],
      pointType: 'circle',
      getPointRadius: 100,
      getFillColor: (feature: Object) => {
        const styleClass = styleClasses.find((c) => {
          return (
            c.interval[0] < feature.properties.vel_avg &&
            c.interval[1] > feature.properties.vel_avg
          );
        });
        return hexToRgb(styleClass.fill);
      },
      getLineWidth: () => {
        return 6;
      },
      lineWidthMinPixels: 1,
    });
    */
    // const deckRef = useRef();
    const deckRef = React.createRef();
    const onHover = (event) => {
      const hoveredItems = deckRef?.current?.pickMultipleObjects(event);
      const item = hoveredItems?.[0];
      // existuje pouze item?.tile?.layers?.[0]?.props?.tile?.layers?.[0]?.props?.elevationData z toho by asi šla hodnota dekodovat
      // item?.tile?.layers?.[0]?.props?.tile?.layers?.[0]?.props?.image
      const image = item?.tile?.layers?.[0]?.props?.tile?.layers?.[0]?.props?.image;
      if (image) {
        console.log('xxx', image);

        // item.pixelColor = readPixelsToArray(image, {
        //   sourceX: event?.bitmap?.pixel?.[0],
        //   sourceY: event?.bitmap?.pixel?.[1],
        //   sourceWidth: 1,
        //   sourceHeight: 1,
        // });
      }

      console.log(item, image, item?.pixelColor);
    };

    return (
      <>
        {
          <DeckGL
            ref={deckRef}
            getCursor={() => 'inherit'}
            initialViewState={initialViewState}
            controller
            layers={[
              tileLayer,
              // WMSlayer,
              cogLayer,
              // coBitmapLayer,
              // WMSlayerMapped,

              // vectorLayer,
            ]}
            views={[
              new MapView({
                controller: true,
                id: 'map',
                height: '100%',
                top: '100px',
                width: '100%',
              }),
            ]}
            onHover={onHover}
          />
        }
      </>
    );
  }
}

export { CogTerrainLayerExample };
