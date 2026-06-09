import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { CogTerrainLayer, CogTiles, extractTerrainCoordinate } from '@gisatcz/deckgl-geolib';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';
import { BitmapLayer } from '@deck.gl/layers';
import { useTerrainZRange } from '@gisatcz/deckgl-geolib/react';


function getElevationAtInfo(info: any): number | null {
  const tileResult = info.tile?.content?.[0];
  if (!tileResult?.raw) return null;
  const { raw, width, height } = tileResult;

  let u: number | undefined, v: number | undefined;
  if (info.uv) {
    [u, v] = info.uv;
  } else if (info.coordinate && info.tile?.bbox) {
    const { west, south, east, north } = info.tile.bbox as any;
    u = (info.coordinate[0] - west) / (east - west);
    
    // WebMercator non-linear latitude projection
    const latRad = info.coordinate[1] * Math.PI / 180;
    const northRad = north * Math.PI / 180;
    const southRad = south * Math.PI / 180;
    
    const mercatorY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const mercatorNorth = Math.log(Math.tan(Math.PI / 4 + northRad / 2));
    const mercatorSouth = Math.log(Math.tan(Math.PI / 4 + southRad / 2));
    
    v = (mercatorNorth - mercatorY) / (mercatorNorth - mercatorSouth);
  }
  if (u === undefined || v === undefined) return null;

  const x = Math.min(width - 1, Math.max(0, Math.floor(u * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * (height - 1))));
  return raw[y * width + x];
}

function CogTerrainLayerExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.MISICUNI;
  const [viewState, setViewState] = useState<any>(null);
  const [initializedCog, setInitializedCog] = useState<CogTiles | null>(null);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const overviewTileLoadedRef = useRef<number | null>(null);
  const { zRange, onZRangeUpdate } = useTerrainZRange();

  const terrainOptions: GeoImageOptions = {
    ...mainCog.defaultOptions as GeoImageOptions,
    type: 'terrain',
    useHeatMap: true,
    colorScale: [
        [75, 120, 90],    // Brightened forest green
        [100, 145, 100],  // Soft meadow green
        [130, 170, 110],  // Bright moss
        [185, 210, 145],  // Sunny sage
        [235, 235, 185],  // Pale primrose (transitional)
        [225, 195, 160],  // Sand / light terracotta (matches slope)
        [195, 160, 130],  // Warm clay brown
        [170, 155, 150],  // Warm slate grey
        [245, 245, 240],  // Bright mist
        [255, 255, 255],  // Pure peak white
      ] as any,
    colorScaleValueRange: [0, 4000],
    useChannel: 1,
  };

  useEffect(() => {
    const init = async () => {
      const cog = new CogTiles(terrainOptions);

      await cog.initializeCog(mainCog.url);
      setInitializedCog(cog);
      const bounds = cog.getBoundsAsLatLon();

      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });

      const {
        longitude, latitude, zoom,
      } = viewport.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 20 },
      );

      setViewState({
        longitude: -66.33,
        latitude: -17.09,
        zoom: Math.min(19, zoom + 3),
        pitch: 60,
        bearing: 0,
      });
    };

    init();
  }, []);

  const layers = useMemo(() => {
    if (!viewState || !initializedCog) return [];

    // Determine the minimum zoom level for the overview/ancestor tile gate
    const minZoom = initializedCog.getZoomRange()[0];

    // Dynamic zoomOverride based on viewport zoom: locked at minZoom for ancestor fallback,
    // released at high zoom to allow detail tiles to fetch without HTTP/1.1 bottleneck
    const isAtHighZoom = viewState.zoom > minZoom + 3;
    const dynamicZoomOverride = isAtHighZoom ? undefined : minZoom;

    const cogLayer = new CogTerrainLayer({
      id: 'cog-terrain-layer',
      elevationData: mainCog.url,
      cogTiles: initializedCog,
      isTiled: true,
      tileSize: 256,
      meshMaxError: 'auto', // Adaptive tessellation per zoom level
      operation: 'terrain+draw',
      terrainOptions,
      pickable: '3d',
      onZRangeUpdate: onZRangeUpdate,

      // Network gate: dynamically lock at minZoom during moderate/low zoom to ensure
      // ancestor tiles are available as fallback while panning/zooming
      zoomOverride: !overviewLoaded ? minZoom : dynamicZoomOverride,

      // 500ms debounce: ensure overview tile is fetched and rendered before releasing gate
      onTileLoad: (tile) => {
        if (tile.index.z === minZoom && !overviewLoaded) {
          if (!overviewTileLoadedRef.current) {
            overviewTileLoadedRef.current = Date.now();
            setTimeout(() => {
              setOverviewLoaded(true);
              overviewTileLoadedRef.current = null;
            }, 500);
          }
        }
      },

      onClick: (info: any) => {
        const coord = extractTerrainCoordinate(info);
        if (coord) {
          console.log('Terrain Coordinate:', {
            longitude: coord.longitude.toFixed(6),
            latitude: coord.latitude.toFixed(6),
            elevation: coord.elevation.toFixed(2),
          });
        } else {
          const elevation = getElevationAtInfo(info);
          if (elevation !== null) {
            console.log('Fallback elevation at click:', elevation);
          }
        }
      },
    });

    // OSM tile layer with TerrainExtension for 3D drape
    const tileLayer = new TileLayer({
      data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      id: 'standard-tile-layer',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      zRange: zRange,
      extensions: [new TerrainExtension()],

      renderSubLayers: (props) => {
        const { bbox } = props.tile as any;
        const { west, south, east, north } = bbox;

        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    return [
      cogLayer,
      // tileLayer  // OSM satellite drape (commented for now)
    ];
  }, [viewState, initializedCog, overviewLoaded]);

  if (!viewState) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <div>Loading AOI...</div>
      </div>
    );
  }

  return (
    <DeckGL
      getCursor={() => 'crosshair'}
      viewState={viewState}
      onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as any)}
      controller
      layers={layers}
      getTooltip={(info: any) => {
        const coord = extractTerrainCoordinate(info);
        if (coord) {
          return {
            text: `Lat: ${coord.latitude.toFixed(4)}, Lon: ${coord.longitude.toFixed(4)}, Elevation: ${coord.elevation.toFixed(1)}m`,
          };
        }
        const elevation = getElevationAtInfo(info);
        if (elevation !== null) {
          return {
            text: `Elevation: ${elevation.toFixed(1)} m`,
          };
        }
        return null;
      }}
      views={[
        new MapView({
          controller: true,
          id: 'map',
          height: '100%',
          width: '100%',
        }),
      ]}
    />
  );
}

export { CogTerrainLayerExample };