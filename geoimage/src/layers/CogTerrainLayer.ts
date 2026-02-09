import {
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  log,
  Material,
  TextureSource,
  UpdateParameters,
  COORDINATE_SYSTEM,
} from '@deck.gl/core';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { MeshAttributes } from '@loaders.gl/schema';
import {
  TileLayer, TileLayerProps, GeoBoundingBox, _TileLoadProps as TileLoadProps,
  _Tile2DHeader as Tile2DHeader, NonGeoBoundingBox,
} from '@deck.gl/geo-layers';

import CogTiles from '../core/CogTiles';
import { GeoImageOptions } from '../core/GeoImage';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export type TileBoundingBox = NonGeoBoundingBox | GeoBoundingBox;

export type ZRange = [minZ: number, maxZ: number];

export type URLTemplate = string | string[] | null;

export const urlType = {
  type: 'object' as const,
  value: null as URLTemplate,
  validate: (value, propType) => (propType.optional && value === null)
    || typeof value === 'string'
    || (Array.isArray(value) && value.every((url) => typeof url === 'string')),
  equal: (value1, value2) => {
    if (value1 === value2) {
      return true;
    }
    if (!Array.isArray(value1) || !Array.isArray(value2)) {
      return false;
    }
    const len = value1.length;
    if (len !== value2.length) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (value1[i] !== value2[i]) {
        return false;
      }
    }
    return true;
  },
};

const DUMMY_DATA = [1];

const defaultProps: DefaultProps<_CogTerrainLayerProps> = {
  ...TileLayer.defaultProps,
  // Image url that encodes height data
  elevationData: urlType,
  // Image url to use as texture
  texture: { ...urlType, optional: true },
  // Martini error tolerance in meters, smaller number -> more detailed mesh
  meshMaxError: { type: 'number', value: 4.0 },
  // Bounding box of the terrain image, [minX, minY, maxX, maxY] in world coordinates
  bounds: {
    type: 'array', value: null, optional: true, compare: true,
  },
  // Color to use if texture is unavailable
  color: { type: 'color', value: [255, 255, 255] },
  // Object to decode height data, from (r, g, b) to height in meters
  elevationDecoder: {
	  type: 'object',
	  value: {
      rScaler: 1,
      gScaler: 0,
      bScaler: 0,
      offset: 0,
	  },
  },
  // Supply url to local terrain worker bundle. Only required if running offline and cannot access CDN.
  workerUrl: '',
  // Same as SimpleMeshLayer wireframe
  wireframe: false,
  material: true,

  // loaders: [TerrainLoader],
};

// Turns array of templates into a single string to work around shallow change
function urlTemplateToUpdateTrigger(template: URLTemplate): string {
  if (Array.isArray(template)) {
	  return template.join(';');
  }
  return template || '';
}

  type ElevationDecoder = {rScaler: number; gScaler: number; bScaler: number; offset: number};
  type TerrainLoadProps = {
	bounds: Bounds;
	elevationData: string | null;
	elevationDecoder: ElevationDecoder;
	meshMaxError: number;
	signal?: AbortSignal;
  };

  type MeshAndTexture = [MeshAttributes | null, TextureSource | null];

/** All properties supported by CogTerrainLayer */
export type CogTerrainLayerProps = _CogTerrainLayerProps &
	TileLayerProps<MeshAndTexture> &
	CompositeLayerProps;

  /** Props added by the CogTerrainLayer */
  type _CogTerrainLayerProps = {
	/** Image url that encodes height data. * */
	elevationData: URLTemplate;

  isTiled?: boolean;

	/** Image url to use as texture. * */
	texture?: URLTemplate;

	/** Martini error tolerance in meters, smaller number -> more detailed mesh. * */
	meshMaxError?: number;

	/** Bounding box of the terrain image, [minX, minY, maxX, maxY] in world coordinates. * */
	bounds?: Bounds | null;

	/** Color to use if texture is unavailable. * */
	color?: Color;

	/** Object to decode height data, from (r, g, b) to height in meters. * */
	elevationDecoder?: ElevationDecoder;

	/** Whether to render the mesh in wireframe mode. * */
	wireframe?: boolean;

	/** Material props for lighting effect. * */
	material?: Material;

  /**
   * TODO
   */
  terrainOptions: GeoImageOptions;

	/**
	 * @deprecated Use `loadOptions.terrain.workerUrl` instead
	 */
  workerUrl?: string;
  };

// TODO remove elevationDecoder
// TODO use meshMaxError
// TODO - pass signal to getTile

/** Render mesh surfaces from height map images. */
export default class CogTerrainLayer<ExtraPropsT extends object = object> extends CompositeLayer<
	ExtraPropsT & Required<_CogTerrainLayerProps & Required<TileLayerProps<MeshAndTexture>>>
  > {
  static defaultProps = defaultProps;

  static layerName = 'CogTerrainLayer';

  // terrainCogTiles: CogTiles;

  terrainUrl: string;

  declare state: {
	  isTiled?: boolean;
	  terrain?: MeshAttributes;
	  zRange?: ZRange | null;
    minZoom: number;
    maxZoom: number;
    terrainCogTiles: CogTiles;
    initialized: boolean;
	};

  async initializeState(context: any) {
    super.initializeState(context);

    this.setState({
      terrainCogTiles: new CogTiles(this.props.terrainOptions),
      initialized: false,
    });

    await (this as any).init(this.terrainUrl);
  }

  async init() {
    await this.state.terrainCogTiles.initializeCog(this.props.elevationData as any);
    // this.tileSize = this.terrainCogTiles.getTileSize(cog);

    const zoomRange = this.state.terrainCogTiles.getZoomRange();

    const [minZoom, maxZoom] = zoomRange;

    this.setState({ initialized: true, minZoom, maxZoom });
  }

  updateState({ props, oldProps }: UpdateParameters<this>): void {
	  const elevationDataChanged = props.elevationData !== oldProps.elevationData;
	  if (elevationDataChanged) {
      const { elevationData } = props;
      const isTiled = elevationData
		  && (Array.isArray(elevationData)
			|| (elevationData.includes('{x}') && elevationData.includes('{y}'))) || this.props.isTiled;
      this.setState({ isTiled });
	  }

	  // Reloading for single terrain mesh
	  const shouldReload = elevationDataChanged
		|| props.meshMaxError !== oldProps.meshMaxError
		|| props.elevationDecoder !== oldProps.elevationDecoder
		|| props.bounds !== oldProps.bounds;

	  if (!this.state.isTiled && shouldReload) {
      // When state.isTiled, elevationData cannot be an array
      // const terrain = this.loadTerrain(props as TerrainLoadProps);
      // this.setState({ terrain });
	  }

	  if (props.workerUrl) {
      log.removed('workerUrl', 'loadOptions.terrain.workerUrl')();
	  }
  }

  loadTerrain({
	  elevationData,
	  bounds,
	  elevationDecoder,
	  meshMaxError,
	  signal,
  }: TerrainLoadProps): Promise<MeshAttributes> | null {
	  if (!elevationData) {
      return null;
	  }
	  let loadOptions = this.getLoadOptions();
	  loadOptions = {
      ...loadOptions,
      _workerType: 'test',
      terrain: {
		  skirtHeight: this.state.isTiled ? meshMaxError * 2 : 0,
		  ...loadOptions?.terrain,
		  bounds,
		  meshMaxError,
		  elevationDecoder,
      },
	  };
	  const { fetch } = this.props;

	  return fetch(elevationData, {
      propName: 'elevationData', layer: this, loadOptions, signal, loaders: [],
    });
  }

  async getTiledTerrainData(tile: TileLoadProps): Promise<MeshAndTexture> {
	  // const {
    //   elevationData, fetch, texture, elevationDecoder, meshMaxError,
    // } = this.props;
	  const { viewport } = this.context;
	  // const dataUrl = getURLFromTemplate(elevationData, tile);
	  // const textureUrl = texture && getURLFromTemplate(texture, tile);

	  // const { signal } = tile;
	  let bottomLeft = [0, 0] as [number, number];
	  let topRight = [0, 0] as [number, number];
	  if (viewport.isGeospatial) {
      const bbox = tile.bbox as GeoBoundingBox;

      bottomLeft = viewport.projectFlat([bbox.west, bbox.south]);
      topRight = viewport.projectFlat([bbox.east, bbox.north]);
	  } else {
      const bbox = tile.bbox as Exclude<TileBoundingBox, GeoBoundingBox>;
      bottomLeft = [bbox.left, bbox.bottom];
      topRight = [bbox.right, bbox.top];
	  }
	  const bounds: Bounds = [bottomLeft[0], bottomLeft[1], topRight[0], topRight[1]];

    // TODO - pass signal to getTile
    // abort request if signal is aborted
    const terrain = await this.state.terrainCogTiles.getTile(
      tile.index.x,
      tile.index.y,
      tile.index.z,
      bounds,
      this.props.meshMaxError,
    );

    return Promise.all([terrain, null]) as unknown as Promise<MeshAndTexture>;
  }

  renderSubLayers(
	  props: TileLayerProps<MeshAndTexture> & {
		id: string;
		data: MeshAndTexture;
		tile: Tile2DHeader<MeshAndTexture>;
	  },
  ) {
	  const SubLayerClass = this.getSubLayerClass('mesh', SimpleMeshLayer);

	  const { color, wireframe, material } = this.props;
	  const { data } = props;

	  if (!data) {
      return null;
	  }

	  // const [mesh, texture] = data;
	  const [mesh] = data;

	  return new SubLayerClass({ ...props, tileSize: 256 }, {
      data: DUMMY_DATA,
      mesh,
      // texture,
      _instanced: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      // getPosition: (d) => [0, 0, 0],
      getColor: color,
      wireframe,
      material,
	  });
  }

  // Update zRange of viewport
  onViewportLoad(tiles?: Tile2DHeader<MeshAndTexture>[]): void {
	  if (!tiles) {
      return;
	  }

	  const { zRange } = this.state;
	  const ranges = tiles
      .map((tile) => tile.content)
      .filter((x) => x && x[0])
      .map((arr) => {
        // @ts-expect-error: Tile content structure is not fully typed in the source layer
		  const bounds = arr[0]?.header?.boundingBox;
		  return bounds?.map((bound) => bound[2]);
      });
	  if (ranges.length === 0) {
      return;
	  }
	  const minZ = Math.min(...ranges.map((x) => x[0]));
	  const maxZ = Math.max(...ranges.map((x) => x[1]));

	  if (!zRange || minZ < zRange[0] || maxZ > zRange[1]) {
      this.setState({ zRange: [Number.isFinite(minZ) ? minZ : 0, Number.isFinite(maxZ) ? maxZ : 0] });
	  }
  }

  renderLayers(): Layer | null | LayersList {
	  const {
      // color,
      // material,
      elevationData,
      // texture,
      // wireframe,
      meshMaxError,
      elevationDecoder,
      tileSize,
      extent,
      maxRequests,
      onTileLoad,
      onTileUnload,
      onTileError,
      maxCacheSize,
      maxCacheByteSize,
      refinementStrategy,
	  } = this.props;

	  if (this.state.isTiled && this.state.initialized) {
      return new TileLayer<MeshAndTexture>(
		  this.getSubLayerProps({
          id: 'tiles',
		  }),
		  {
          getTileData: this.getTiledTerrainData.bind(this),
          renderSubLayers: this.renderSubLayers.bind(this),
          updateTriggers: {
			      getTileData: {
              elevationData: urlTemplateToUpdateTrigger(elevationData),
              // texture: urlTemplateToUpdateTrigger(texture),
              meshMaxError,
              elevationDecoder,
			      },
          },
          onViewportLoad: this.onViewportLoad.bind(this),
          zRange: this.state.zRange || null,
          tileSize,
          minZoom: this.state.minZoom,
          maxZoom: this.state.maxZoom,
          extent,
          maxRequests,
          onTileLoad,
          onTileUnload,
          onTileError,
          maxCacheSize,
          maxCacheByteSize,
          refinementStrategy,
		  },
      );
	  }

	  // if (!elevationData) {
    //   return null;
	  // }

	  // const SubLayerClass = this.getSubLayerClass('mesh', SimpleMeshLayer);
	  // return new SubLayerClass(
    //   this.getSubLayerProps({
    //   id: 'mesh',
    //   }),
    //   {
    //   data: DUMMY_DATA,
    //   mesh: this.state.terrain,
    //   texture,
    //   _instanced: false,
    //   getPosition: (d) => [0, 0, 0],
    //   getColor: color,
    //   material,
    //   wireframe,
    //   },
	  // );
  }
}
