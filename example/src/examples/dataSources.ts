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
      clipLow: 0
   },
  },
  INDIA: {
    name: 'Georgia Land Cover',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/3dflus/Indie_cog.tif',
  },
  // 512 blocksize not supported yet
  WSF_EVOLUTION_512: {
    name: 'WSF Evolution',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaUtepUnHabitat/rasters/global/WSFevolution/WSF2019evolution_zoom0_nearest_COG.tif',

  },
  WSF_EVOLUTION_256: {
    name: 'WSF Evolution 2',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaUtepUnHabitat/rasters/global/wsf/WSF2019_zoom2_2-2_nearest_COGeo.tif',

  },
  MANILA_RGB: {
    name: 'Manila RGB Imagery',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/MANILA/Manila_S2_Composite_2020022_Mercator_RGB_COG_DEFLATE.tif',
    defaultOptions: {
      useChannel: null
    }
  },
  MANILA_SURFACE_WATER: {
    name: 'Manila Global Surface Water',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/Manila/jrc_gsw_mercator_comp_cog_deflate_float32.tif',
    defaultOptions:{
      useChannel: 3,
      clipLow: 0,
      colorScaleValueRange: [0,3],
      colorScale: ['blue', 'red', 'green']
    }
  },
  NEPAL_SLOPE: {
    name: 'Nepal Slope',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/copdem_cog/copdem_slope_cog_deflate_float32_zoom16_levels8.tif',
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
  TEST_RAW: {
    name: 'Compression: Raw',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/compressions/SNOW_3857_2017-2021_cog_int16_raw.tif',
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
  },
  OPENEO_ALIGNED: {
    name: 'OpenEO Aligned',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_32768_web.tif',
  },
  OPENEO_NOT_ALIGNED: {
    name: 'OpenEO Not Aligned',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/COG_testy/openEO_2010-01-01Z_3857_1000m_web.tif',
  },

  // --- RESAMPLING METHODS ---
  RESAMPLE_AVERAGE: {
      name: 'Resampling: Average',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_average.tif',
  },
  RESAMPLE_BILINEAR: {
      name: 'Resampling: Bilinear',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_bilinear.tif',
  },
   RESAMPLE_CUBIC_SPLINE: {
      name: 'Resampling: Cubic Spline',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_cubic_spline.tif',
  },
  RESAMPLE_CUBIC: {
      name: 'Resampling: Cubic',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_cubic.tif',
  },
  RESAMPLE_GAUSS: {
      name: 'Resampling: Gauss',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_gauss.tif',
  },
  RESAMPLE_LANCZOS: {
      name: 'Resampling: Lanczos',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_lanczos.tif',
  },
  RESAMPLE_MODE: {
      name: 'Resampling: Mode',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_mode.tif',
  },
  RESAMPLE_NEAREST: {
      name: 'Resampling: Nearest',
      url: 'https://eu-central-1.linodeobjects.com/gisat-gis/COG_testy/Resampling_samples/openEO_2020-01-01Z_hanpp_luc_cog_3_nearest.tif',
  },
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
  COPERNICUS_DEM: {
    name: 'Copernicus DEM',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/esaGdaAdbNepal23/rasters/copdem_cog/copdem_cog_deflate_float32_levels8.tif',
  },
  NEPAL_COP30: {
    name: 'Nepal Copernicus 30m DEM',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/DEM_COP30_float32_wgs84_deflate_cog_float32.tif',
  },

  // --- LUZON DEM - different data types ---
  LUZON_UINT8: {
    name: 'Luzon DEM: UInt8',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint8.tif',
    defaultOptions: {
      clipLow: 0
    }
  },
  LUZON_UINT16: {
    name: 'Luzon DEM: UInt16',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint16.tif',
    defaultOptions: {
      clipLow: 0
    }
  },
  LUZON_UINT32: {
    name: 'Luzon DEM: UInt32',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_uint32.tif',
    defaultOptions: {
      clipLow: 0
    }
  },
  LUZON_FLOAT32: {
    name: 'Luzon DEM: Float32',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_float32.tif',
    defaultOptions: {
      clipLow: 0
    }
  },
  LUZON_FLOAT64: {
    name: 'Luzon DEM: Float64',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v3/DEM/luzon_dem_deflate_cog_float64.tif',
    defaultOptions: {
      clipLow: 0
    }
  },
};
