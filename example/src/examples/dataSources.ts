import { GeoImageOptions } from '@gisatcz/deckgl-geolib';

export interface CogDataSource {
  url: string;
  name: string;
  attribution?: string;
  description?: string;
  defaultOptions?: Partial<GeoImageOptions>;
}

export const COG_BITMAP_EXAMPLES: Record<string, CogDataSource> = {
  NEPAL_SNOW: {
    name: 'Nepal Snow Cover',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/esaGdaAdbNepal23/rasters/snow_cover_cog/WET_SNOW_3857_2017-2021_cog_deflate_in16_zoom16_levels8.tif',
    // attribution: '© ESA GDA / ADB Nepal, processed by Gisat',
    // description: 'Snow cover analysis in the Himalayas.'
    defaultOptions: {
      type: 'image',
      blurredTexture: true,
      useChannel: 1,
      useHeatMap: true,
      colorScale: ['#fde725', '#5dc962', '#20908d', '#3a528b', '#440154'],
      colorScaleValueRange: [0, 300],
    },
  },
  WORLD_CEREAL: {
    name: 'WorldCereal Global Map',
    url: 'https://gisat-data.eu-central-1.linodeobjects.com/world_cereal/merged/merged_cog.tif',
    // attribution: '© ESA WorldCereal / Copernicus data',
    // description: '7GB Global cropland/maize/cereals dataset.'
  },
  UGANDA: {
    name: 'Uganda Multiband',
    url: 'https://eu-central-1.linodeobjects.com/gisat-gis/Luisa_COG_testy/cog_UG_hanpp_luc_multiband.tif',
    defaultOptions: {
      type: 'image',
      noDataValue: 0,
      blurredTexture: false,
      clipLow: 0,
      useChannel: 15,
      useHeatMap: true,
      colorScale: ['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'],
      colorScaleValueRange: [0,100],
    },
  }
};

export const COG_TERRAIN_EXAMPLES: Record<string, CogDataSource> = {
  PAMZAM_DEM: {
    name: 'Pamzam DEM',
    url: 'https://gisat-gis.eu-central-1.linodeobjects.com/eman/versions/v2/DEMs/pamzam_10m_Mercator_COG_DEFLATE.tif',
    defaultOptions: {
      type: 'terrain',
    },
  },
};
