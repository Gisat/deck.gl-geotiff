import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

export interface CogDataSource {
  url: string;
  name: string;
  attribution?: string;
  description?: string;
  defaultOptions?: Partial<GeoImageOptions>;
}

export const COG_BITMAP_EXAMPLES: Record<string, CogDataSource> = {
  // --- REGIONAL PROJECTS ---
  NEPAL_SNOW: {
    name: 'Nepal Snow Cover',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/esaGdaAdbNepal23/rasters/snow_cover_cog/WET_SNOW_3857_2017-2021_cog_deflate_in16_zoom16_levels8.tif',
    // attribution: '© ESA GDA / ADB Nepal, processed by Gisat',
    // description: 'Snow cover analysis in the Himalayas.'
    defaultOptions: {
      useHeatMap: true,
      colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
      colorScaleValueRange: [0, 300],
    },
  },
  UGANDA_MULTIBAND: {
    name: 'Uganda Multiband',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/Luisa_COG_testy/cog_UG_hanpp_luc_multiband.tif',
    defaultOptions: {
      noDataValue: 0,
      useChannel: 15,
      useHeatMap: true,
      colorScale: ['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'],
      colorScaleValueRange: [0, 100],
    },
  },
  GEORGIA_LC: {
    name: 'Georgia Land Cover',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/bsadri/test_raster/COG/LC_2021_all_Georgia_WEST3940_ZOOM6_test1_defl_COG256.tif',
    defaultOptions: {
      useAutoRange: true,
   },
  },

  // --- COMPRESSION & FORMAT TESTS ---
  TEST_DEFLATE: {
    name: 'Compression: Deflate ',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_deflate.tif',
  },
  TEST_LZW: {
    name: 'Compression: LZW',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_lzw.tif',
  },
  TEST_PACKBITS: {
    name: 'Compression: Packbits',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_packbits.tif',
  },
  TEST_JPEG: {
    name: 'Compression: JPEG',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/Manila_S2_Composite_2020022_Mercator_RGB_COG_jpeg.tif',
  },
  TEST_LERC: {
    name: 'Compression: LERC',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_lerc.tif',
  },

  // --- GLOBAL & LARGE DATASETS ---
  WORLD_CEREAL: {
    name: 'WorldCereal Global Map',
    url: 'https://eu-central-1.linodeobjects.com/gisat-data/WorldCereal_GST-10/project/demo/merged_cog.tif',
  },
  GHS_POPULATION: {
    name: 'Global Human Settlement Pop',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaUtepUnHabitat/rasters/global/GHS-POP/GHS_POP_E2015_COGeoN.tif',
  },

  // --- DEBUGGING ---
  TEST_ALIGNED: {
    name: 'OpenEO (Aligned to Web Mercator)',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_32768_COGeoN.tif',
  },
  TEST: {
    name: 'OpenEO (Not Aligned to Web Mercator)',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_1000m_web.tif',
  }
};

export const COG_TERRAIN_EXAMPLES: Record<string, CogDataSource> = {
  PAMZAM_DEM: {
    name: 'Pamzam DEM',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
  },
  GLOBAL_DTM_BAREEARTH: {
    name: 'Global DTM BareEarth',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/dtm.bareearth_ensemble_p10_250m_s_2018_go_epsg4326_v20230221_deflate_cog.tif',
    defaultOptions: {
      multiplier: 0.2
    }
  },
};
