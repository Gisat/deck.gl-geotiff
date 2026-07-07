import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, WebMercatorViewport, FlyToInterpolator } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { useTerrainZRange } from '@gisatcz/deckgl-geolib/react';
import { COG_TERRAIN_EXAMPLES } from './dataSources';
import { GeoImageOptions } from '@gisatcz/deckgl-geolib';
import { BitmapLayer, ScatterplotLayer } from '@deck.gl/layers';

type Mode = '2d' | 'transitioning_to_3d' | '3d' | 'transitioning_to_2d';

interface TransitionState {
  mode: Mode;
  elevationScale: number;
  switchTo3D: () => void;
  switchTo2D: () => void;
}

function useMapTransition(
  setViewState: React.Dispatch<React.SetStateAction<any>>,
): TransitionState {
  const [mode, setMode] = useState<Mode>('2d');
  const [elevationScale, setElevationScale] = useState(0);
  const animFrameRef = useRef<number | null>(null);

  // ref holds latest elevationScale so switchTo2D reads current value
  // without requiring it as a useCallback dependency
  const elevationScaleRef = useRef(elevationScale);
  useEffect(() => {
    elevationScaleRef.current = elevationScale;
  }, [elevationScale]);

  const cleanup = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const switchTo3D = useCallback(() => {
    cleanup();

    setMode('transitioning_to_3d');
    setElevationScale(0);

    setViewState((prev: any) => ({
      ...prev,
      pitch: 40,
      transitionDuration: 1500,
      transitionInterpolator: new FlyToInterpolator(),
    }));

    // Animate elevationScale from 0 to 1 over 1500ms
    const start = performance.now();
    const duration = 1500;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setElevationScale(eased);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setElevationScale(1);
        setMode('3d');
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [cleanup, setViewState]);

  const switchTo2D = useCallback(() => {
    cleanup();

    const startScale = elevationScaleRef.current;
    setMode('transitioning_to_2d');

    setViewState((prev: any) => ({
      ...prev,
      pitch: 0,
      bearing: 0,
      transitionDuration: 1500,
      transitionInterpolator: new FlyToInterpolator(),
    }));

    const start = performance.now();
    const duration = 1500;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const currentScale = startScale - startScale * eased;
      setElevationScale(currentScale);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setElevationScale(0);
        setMode('2d');
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [cleanup, setViewState]);

  return { mode, elevationScale, switchTo3D, switchTo2D };
}

function generateDemoPoints(count: number, centerLon: number, centerLat: number) {
  const points: { position: [number, number, number] }[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      position: [
        centerLon + (Math.random() - 0.5) * 0.3,
        centerLat + (Math.random() - 0.5) * 0.2,
        0, // Z=0 — TerrainExtension clamps to terrain surface
      ],
    });
  }
  return points;
}

function CogTransitionExample() {
  const mainCog = COG_TERRAIN_EXAMPLES.MISICUNI;
  const [viewState, setViewState] = useState<any>(null);
  const [initializedCog, setInitializedCog] = useState<CogTiles | null>(null);
  const { zRange, onZRangeUpdate } = useTerrainZRange();

  const { mode, elevationScale, switchTo3D, switchTo2D } =
    useMapTransition(setViewState);

  const terrainOptions: GeoImageOptions = {
    ...(mainCog.defaultOptions as GeoImageOptions),
    type: 'terrain',
    disableLighting: true,
    noDataValue: 0,
    multiplier: 1,
    terrainSkirtHeight: 1,
  };

  const demoPoints = useMemo(
    () => generateDemoPoints(50, -66.33, -17.09),
    [],
  );

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

      const { longitude, latitude, zoom } = viewport.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 20 },
      );

      setViewState({
        longitude: -66.33,
        latitude: -17.09,
        zoom: Math.min(19, zoom + 3),
        pitch: 0,
        bearing: 0,
      });
    };

    init();
  }, []);

  const toggleMode = () => {
    if (mode === '2d' || mode === 'transitioning_to_2d') {
      switchTo3D();
    } else {
      switchTo2D();
    }
  };

  const layers = useMemo(() => {
    if (!viewState) return [];

    const layersArray: any[] = [];

    const minZoom = initializedCog?.getZoomRange()[0] ?? 9;
    const isPure2D = mode === '2d';

    // CogTerrainLayer — always mounted; elevationScale=0 keeps it flat in 2D
    layersArray.push(
      new CogTerrainLayer({
        id: 'cog-transition-terrain',
        elevationData: mainCog.url,
        cogTiles: initializedCog || undefined,
        isTiled: true,
        tileSize: 256,
        meshMaxError: 'auto',
        operation: 'terrain',
        terrainOptions,
        elevationScale,
        zoomOverride: isPure2D ? minZoom : undefined,
        opacity: isPure2D ? 0 : 1,
        onZRangeUpdate,
      }),
    );

    // Unified OSM basemap — single id preserves tile cache across mode switches
    layersArray.push(
      new TileLayer({
        id: 'osm-basemap',
        data: 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        zRange,
        updateTriggers: {
          renderSubLayers: [isPure2D],
        },
        renderSubLayers: (props) => {
          const { bbox } = props.tile as any;
          const { west, south, east, north } = bbox;
          return new BitmapLayer(props, {
            id: `${props.id}-${isPure2D ? 'flat' : 'draped'}`,
            data: undefined,
            image: props.data,
            bounds: [west, south, east, north],
            extensions: isPure2D ? [] : [new TerrainExtension()],
          });
        },
      }),
    );

    // Demo points — native in 2D, clamped to terrain in 3D
    layersArray.push(
      new ScatterplotLayer({
        id: `demo-points-${isPure2D ? 'flat' : 'draped'}`,
        data: demoPoints,
        getPosition: (d: any) => d.position,
        getFillColor: [255, 100, 50, 200],
        getRadius: 80,
        radiusMinPixels: 4,
        radiusMaxPixels: 20,
        updateTriggers: {
          getElevation: [isPure2D],
        },
        extensions: isPure2D ? [] : [new TerrainExtension()],
      }),
    );

    return layersArray;
  }, [
    viewState,
    elevationScale,
    initializedCog,
    mode,
    zRange,
    onZRangeUpdate,
    demoPoints,
  ]);

  const isTransitioning =
    mode === 'transitioning_to_3d' || mode === 'transitioning_to_2d';

  if (!viewState) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div>Loading AOI...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'white',
          padding: 12,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <button
          onClick={toggleMode}
          disabled={isTransitioning}
          style={{
            padding: '10px 20px',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            backgroundColor: isTransitioning
              ? '#999'
              : mode === '2d'
                ? '#4CAF50'
                : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {isTransitioning
            ? 'Transitioning...'
            : `Switch to ${mode === '2d' ? '3D' : '2D'}`}
        </button>
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
          {isTransitioning
            ? `Elevation: ${(elevationScale * 100).toFixed(0)}%`
            : `Current: ${mode === '2d' ? '2D (Flat)' : '3D (Terrain)'}`}
        </div>
      </div>
      <DeckGL
        getCursor={() => 'crosshair'}
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) =>
          setViewState(newViewState as any)
        }
        controller
        layers={layers}
        views={[
          new MapView({
            controller: true,
            id: 'map',
            height: '100%',
            width: '100%',
          }),
        ]}
      />
    </div>
  );
}

export { CogTransitionExample };
