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
import type { TerrainMesh } from '../core/types';
import {
  TileLayer, TileLayerProps, GeoBoundingBox, _TileLoadProps as TileLoadProps,
  _Tile2DHeader as Tile2DHeader, NonGeoBoundingBox,
} from '@deck.gl/geo-layers';

import CogTiles from '../core/CogTiles';
import { GeoImageOptions, TileResult } from '../core/GeoImage';

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export type TileBoundingBox = NonGeoBoundingBox | GeoBoundingBox;

export type ZRange = [minZ: number, maxZ: number];

export type URLTemplate = string | string[] | null;

export const urlType = {
  type: 'object' as const,
  value: null as URLTemplate,
  validate: (value: any, propType: any) => (propType.optional && value === null)
    || typeof value === 'string'
    || (Array.isArray(value) && value.every((url) => typeof url === 'string')),
  equal: (value1: any, value2: any) => {
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

const meshMaxErrorValidation = {
  type: 'object' as const,
  value: 'auto' as const,
  validate: (value: any) => typeof value === 'number' || value === 'auto',
  equal: (v1: any, v2: any) => v1 === v2,
};

const DUMMY_DATA = [1];

const defaultProps: DefaultProps<_CogTerrainLayerProps> = {
  ...TileLayer.defaultProps,
  // Image url that encodes height data
  elevationData: urlType,
  // Image url to use as texture
  texture: { ...urlType, optional: true },
  // Martini error tolerance in meters, smaller number -> more detailed mesh
  // Set to a number for fixed tessellation across all zooms, or 'auto' (default)
  // for zoom-adaptive meshMaxError based on COG resolution
  meshMaxError: meshMaxErrorValidation,
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
  // Enable progressive loading by default (overview tiles first, then detail)
  enableProgressiveLoading: true,

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

  type MeshAndTexture = [TileResult | null, TextureSource | null];

/** All properties supported by CogTerrainLayer */
export type CogTerrainLayerProps = _CogTerrainLayerProps &
	TileLayerProps<MeshAndTexture | null> &
	CompositeLayerProps;


  /** Props added by the CogTerrainLayer */
  type _CogTerrainLayerProps = {
	/** Image url that encodes height data. * */
	elevationData: URLTemplate;

  isTiled?: boolean;

	/** Image url to use as texture. * */
	texture?: URLTemplate;

  /** Martini error tolerance in meters, smaller number -> more detailed mesh. Set to 'auto' for dynamic per-zoom quantization. * */
	meshMaxError?: number | 'auto';

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

  /** Pre-initialized CogTiles object for terrain */
  cogTiles?: CogTiles;

  /**
   * Override layer zoom. When set, both minZoom and maxZoom will use this value,
   * effectively locking the TileLayer to a single zoom level (used for LOD placeholder).
   */
  zoomOverride?: number;

  /**
   * When true (default), automatically loads low-resolution overview tiles first
   * before fetching high-resolution detail tiles. Prevents blank-map delays on slow connections.
   * Set to false to disable automatic LOD gate and request all visible tiles immediately.
   */
  enableProgressiveLoading?: boolean;

  /**
   * When true, suppresses any texture generated by the tile (e.g. heatmap/hillshade)
   * and renders the mesh in the plain `color` instead.
   * Useful for showing a neutral grey terrain during mode transitions.
   */
  disableTexture?: boolean;

  /**
   * Callback fired when the terrain zRange is updated.
   * Used to sync overlay TileLayer zRange for proper 3D frustum culling.
   */
  // eslint-disable-next-line no-unused-vars
  onZRangeUpdate?: (zRange: ZRange | null) => void;

	/**
	 * @deprecated Use `loadOptions.terrain.workerUrl` instead
	 */
  workerUrl?: string;
  };

// TODO remove elevationDecoder
// TODO use meshMaxError

/** Render mesh surfaces from height map images. */
export default class CogTerrainLayer<ExtraPropsT extends object = object> extends CompositeLayer<
	ExtraPropsT & Required<_CogTerrainLayerProps & Required<TileLayerProps<MeshAndTexture | null>>>
  > {
  static defaultProps = defaultProps;

  static layerName = 'CogTerrainLayer';

  // terrainCogTiles: CogTiles;

  terrainUrl: string = '';

  declare state: {
	  isTiled?: boolean;
	  terrain?: MeshAttributes;
	  zRange?: ZRange | null;
    minZoom: number;
    maxZoom: number;
    terrainCogTiles: CogTiles;
    initialized: boolean;
    overviewLoaded: boolean;
	};

  async initializeState(context: any) {
    super.initializeState(context);

    const terrainCogTiles = this.props.cogTiles || new CogTiles(this.props.terrainOptions);
    this.setState({
      terrainCogTiles,
      initialized: false,
      overviewLoaded: false,
    });

    // Only initialize if not already done (e.g., provided cogTiles instance may be pre-initialized)
    if (!terrainCogTiles.cog) {
      await this.init();
    } else {
      // CogTiles already initialized; just extract zoom range and mark ready
      const zoomRange = terrainCogTiles.getZoomRange();
      const [minZoom, maxZoom] = zoomRange;
      this.setState({ initialized: true, minZoom, maxZoom });
    }
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

    // When meshMaxError changes, cached meshes are stale — clear so new tiles are tessellated
    // at the correct error tolerance
    if (props.meshMaxError !== oldProps.meshMaxError && this.state.terrainCogTiles) {
      this.state.terrainCogTiles.clearTileResultCache();
    }

	  if (!this.state.isTiled && shouldReload) {
      // When state.isTiled, elevationData cannot be an array
      // const terrain = this.loadTerrain(props as TerrainLoadProps);
      // this.setState({ terrain });
	  }

    // Update the useChannel option for terrainCogTiles when terrainOptions.useChannel changes.
    if (props?.terrainOptions?.useChannel !== oldProps.terrainOptions?.useChannel && this.state.terrainCogTiles) {
      this.state.terrainCogTiles.options.useChannel = props.terrainOptions.useChannel;
      this.state.terrainCogTiles.options.useChannelIndex = null; // Clear derived channel index
      this.state.terrainCogTiles.clearTileResultCache(); // Invalidate cached tiles from previous channel
    }

    // Update kernel visualization options when hillshade/slope/relief settings change.
    // These affect tile texture generation — the cache must be cleared and options synced
    // so the next getTileData call uses the updated kernel settings.
    const kernelOptionsChanged =
      props?.terrainOptions?.useHillshade !== oldProps.terrainOptions?.useHillshade ||
      props?.terrainOptions?.useSlope !== oldProps.terrainOptions?.useSlope ||
      props?.terrainOptions?.useSwissRelief !== oldProps.terrainOptions?.useSwissRelief ||
      props?.terrainOptions?.hillshadeAzimuth !== oldProps.terrainOptions?.hillshadeAzimuth ||
      props?.terrainOptions?.hillshadeAltitude !== oldProps.terrainOptions?.hillshadeAltitude ||
      props?.terrainOptions?.zFactor !== oldProps.terrainOptions?.zFactor;

    if (kernelOptionsChanged && this.state.terrainCogTiles) {
      // Sync updated options into the shared CogTiles instance
      this.state.terrainCogTiles.options.useHillshade = props.terrainOptions?.useHillshade;
      this.state.terrainCogTiles.options.useSlope = props.terrainOptions?.useSlope;
      this.state.terrainCogTiles.options.useSwissRelief = props.terrainOptions?.useSwissRelief;
      this.state.terrainCogTiles.options.hillshadeAzimuth = props.terrainOptions?.hillshadeAzimuth;
      this.state.terrainCogTiles.options.hillshadeAltitude = props.terrainOptions?.hillshadeAltitude;
      this.state.terrainCogTiles.options.zFactor = props.terrainOptions?.zFactor;
      // Invalidate cached tiles — kernel output is baked into the texture
      this.state.terrainCogTiles.clearTileResultCache();
    }

    // Update skipTexture when wireframe/operation/disableTexture changes so cache keys are correct
    const newSkipTexture = !!(props?.wireframe || props?.operation === 'terrain' || props?.disableTexture);
    const oldSkipTexture = !!(oldProps?.wireframe || oldProps?.operation === 'terrain' || oldProps?.disableTexture);
    if (newSkipTexture !== oldSkipTexture && this.state.terrainCogTiles) {
      this.state.terrainCogTiles.options.skipTexture = newSkipTexture;
      this.state.terrainCogTiles.clearTileResultCache();
    }

    // When the external cogTiles instance is swapped (e.g. mode switch), update state so
    // renderLayers picks up the new reference and the TileLayer updateTrigger fires a refetch
    // while keeping old tile content visible until new tiles are ready.
    // Also reset progressive loading state for the new dataset.
    if (props.cogTiles && props.cogTiles !== oldProps.cogTiles) {
      this.setState({ terrainCogTiles: props.cogTiles, overviewLoaded: false });
    } else if (elevationDataChanged) {
      // Reset progressive loading state when dataset URL changes
      this.setState({ overviewLoaded: false });
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

  async getTiledTerrainData(tile: TileLoadProps): Promise<MeshAndTexture | null> {
	  const { viewport } = this.context;
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

    let resolvedTerrain: TileResult | null = null;
    try {
      const skipTexture = !!(this.props.wireframe || this.props.operation === 'terrain' || this.props.disableTexture);
      // Convert 'auto' to undefined so CogTiles.getTile uses the quantized meshMaxError for the zoom level
      const meshMaxErrorValue = this.props.meshMaxError === 'auto' ? undefined : (this.props.meshMaxError as number | undefined);
      resolvedTerrain = await this.state.terrainCogTiles.getTile(
        tile.index.x,
        tile.index.y,
        tile.index.z,
        bounds,
        meshMaxErrorValue,
        tile.signal,
        skipTexture,
      );
    } catch (error) {
      // Tile was cancelled (AbortError) — return null so deck.gl discards it cleanly
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }

      if (resolvedTerrain && !this.props.pickable) {
        resolvedTerrain.raw = null;
      }

      // Return a tuple [TileResult|null, Texture|null] when data is available, otherwise null
      return resolvedTerrain ? [resolvedTerrain, null] : null;
  }

  renderSubLayers(
	  props: TileLayerProps<MeshAndTexture | null> & {
		id: string;
		data: MeshAndTexture | null;
		tile: Tile2DHeader<MeshAndTexture | null>;
	  },
  ) {
	  const SubLayerClass = this.getSubLayerClass('mesh', SimpleMeshLayer);

	  const { color, wireframe, terrainOptions } = this.props;
	  const { data } = props;

	  if (!data) {
      return null;
	  }

    const [meshResult] = data;
	  const tileTexture = (!this.props.disableTexture && meshResult?.texture) ? meshResult.texture : null;

    const isSwiss = terrainOptions?.useSwissRelief;
    const disableLighting = terrainOptions?.disableLighting;
    const shouldDisableLighting = isSwiss || disableLighting;

    const lightingProps = shouldDisableLighting ? {
      material: {
        ambient: 1.0,
        diffuse: 0.0,
        shininess: 0.0,
        specularColor: [0, 0, 0]
      }
    } : {
      material: this.props.material 
    };
      
	  return new SubLayerClass({ ...props, tileSize: props.tileSize }, {
      ...lightingProps,
      data: DUMMY_DATA,
      mesh: meshResult?.map,
      texture: tileTexture,
      _instanced: false,
      pickable: props.pickable,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      // Dynamic polygon offset: pull higher zoom levels closer to camera to depth-test in front.
      // Uses tile.index.z from closure to avoid Z-fighting between ancestor tiles and high-res detail.
      // Formula: zoom 0 = offset 0, zoom 9 = offset -9000, zoom 12 = offset -12000, etc.
      // getPolygonOffset must be a function (deck.gl calls it as getPolygonOffset(uniforms)).
      // If the user supplied a custom override on the CogTerrainLayer, respect it;
      // otherwise apply the tile-zoom-based dynamic offset.
      getPolygonOffset: (this.props.getPolygonOffset !== (CogTerrainLayer.defaultProps as any).getPolygonOffset && this.props.getPolygonOffset != null)
        ? this.props.getPolygonOffset
        : () => [0, -((props.tile?.index?.z ?? 0) * 1000)],
      // getPosition: (d) => [0, 0, 0],
      getColor: tileTexture ? [255, 255, 255] : color,
      wireframe,
      
      // ADDED: Forward parameters prop down to the SimpleMeshLayer for depthRange to work
      parameters: this.props.parameters,
	  });
  }

  // Update zRange of viewport
  onViewportLoad(tiles?: Tile2DHeader<MeshAndTexture | null>[]): void {
	  if (!tiles) {
      return;
	  }

	  const { zRange } = this.state;
	  const ranges = tiles
      .map((tile) => tile.content)
      .filter((x) => !!x && !!x[0])
      .map((arr) => {
		  if (!arr || !arr[0]) return undefined;
		  const bounds = (arr[0]?.map as TerrainMesh | undefined)?.header?.boundingBox;
		  return bounds?.map((bound) => bound[2]);
      })
      .filter((x) => x !== undefined) as (number[] | undefined)[];
	  if (ranges.length === 0) {
      return;
	  }
	  const minValues = ranges
      .map((x) => x?.[0])
      .filter((n): n is number => n !== undefined && Number.isFinite(n));
	  const maxValues = ranges
      .map((x) => x?.[1])
      .filter((n): n is number => n !== undefined && Number.isFinite(n));

	  if (minValues.length === 0 || maxValues.length === 0) {
      return;
	  }

	  const minZ = Math.min(...minValues);
	  const maxZ = Math.max(...maxValues);

	  if (!zRange || minZ < zRange[0] || maxZ > zRange[1]) {
      const newZRange: ZRange = [Number.isFinite(minZ) ? minZ : 0, Number.isFinite(maxZ) ? maxZ : 0];
      this.setState({ zRange: newZRange });
      this.props.onZRangeUpdate?.(newZRange);
	  }
  }

  renderLayers(): Layer | null | LayersList {
	  const {
      elevationData,
      meshMaxError,
      elevationDecoder,
      tileSize,
      extent,
      maxRequests,
      onTileUnload,
      onTileError,
      maxCacheSize,
      maxCacheByteSize,
      refinementStrategy,
	  } = this.props;

	  if (!this.state.isTiled || !this.state.initialized) {
      return null;
    }

    // Auto-enable LOD gate: lock at minZoom until overview tile loads, then release to full range.
    // User's explicit zoomOverride takes precedence over auto-gate.
    let effectiveMinZoom = this.state.minZoom;
    let effectiveMaxZoom = this.state.maxZoom;

    if (this.props.zoomOverride !== undefined) {
      effectiveMinZoom = this.props.zoomOverride;
      effectiveMaxZoom = this.props.zoomOverride;
    } else if (this.props.enableProgressiveLoading && !this.state.overviewLoaded) {
      // Gate: lock at minZoom until the overview viewport is fully covered
      effectiveMinZoom = this.state.minZoom;
      effectiveMaxZoom = this.state.minZoom;
    }

    return new TileLayer<MeshAndTexture | null>(
      this.getSubLayerProps({ id: 'tiles' }),
      {
        getTileData: this.getTiledTerrainData.bind(this),
        renderSubLayers: this.renderSubLayers.bind(this),
        pickable: this.props.pickable,
        onClick: this.props.onClick,
        updateTriggers: {
          getTileData: {
            elevationData: urlTemplateToUpdateTrigger(elevationData),
            meshMaxError,
            elevationDecoder,
            terrainCogTiles: this.state.terrainCogTiles,
            skipTexture: !!(this.props.wireframe || this.props.operation === 'terrain' || this.props.disableTexture),
            useChannel: this.props.terrainOptions?.useChannel,
            useHillshade: this.props.terrainOptions?.useHillshade,
            useSlope: this.props.terrainOptions?.useSlope,
            useSwissRelief: this.props.terrainOptions?.useSwissRelief,
            hillshadeAzimuth: this.props.terrainOptions?.hillshadeAzimuth,
            hillshadeAltitude: this.props.terrainOptions?.hillshadeAltitude,
            zFactor: this.props.terrainOptions?.zFactor,
          },
          renderSubLayers: {
            disableTexture: this.props.disableTexture,
            terrainOptions: this.props.terrainOptions,
          },
        },
        onViewportLoad: this.onViewportLoad.bind(this),
        zRange: this.state.zRange || null,
        tileSize,
        minZoom: effectiveMinZoom,
        maxZoom: effectiveMaxZoom,
        extent,
        maxRequests,
        onTileLoad: (tile) => {
          // Release progressive loading gate as soon as any minZoom tile finishes loading.
          // This fires mid-cycle so the TileLayer immediately re-selects high-res tiles
          // for the current viewport without requiring a zoom/pan interaction.
          if (
            this.props.enableProgressiveLoading &&
            tile.index.z === this.state.minZoom &&
            !this.state.overviewLoaded
          ) {
            this.setState({ overviewLoaded: true });
          }
          this.props.onTileLoad?.(tile);
        },
        onTileUnload,
        onTileError,
        maxCacheSize,
        maxCacheByteSize,
        refinementStrategy,
      },
    );
	}
}