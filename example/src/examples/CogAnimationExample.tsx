import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView } from '@deck.gl/core';
import { CogTerrainLayer, CogTiles } from '@gisatcz/deckgl-geolib';
import { MaskExtension } from '@deck.gl/extensions';
import { GeoJsonLayer } from '@deck.gl/layers';

import { COG_TERRAIN_EXAMPLES } from './dataSources';

const DEM_COG_URL = COG_TERRAIN_EXAMPLES.MISICUNI.url;
const animationCog = COG_TERRAIN_EXAMPLES.MULTIBAND_DAM_30;

const INITIAL_VIEW_STATE = {
  longitude: -66.33,
  latitude: -17.09,
  zoom: 12,
  pitch: 40,
  bearing: 0,
  minZoom: 8,
  maxZoom: 13.5,
  maxPitch: 60,
};

function CogAnimationExample() {
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);
  const [cogInstance, setCogInstance] = useState<CogTiles | null>(null);
  
  // 1. Simple state for the slider (0-based)
  const [currentBandIndex, setCurrentBandIndex] = useState(0);
  const [isFetched, setIsFetched] = useState(false); // Lazy-load: false until user clicks button
  const totalBands = cogInstance?.getNumChannels?.() || 30; // Dynamically read from COG, fallback to 30
  const bandDescriptions = cogInstance?.getBandDescriptions?.() ?? [];
  const currentDescription = bandDescriptions[currentBandIndex] || '';

  // RAF throttling for smooth slider animation: prevents React re-render thrashing on rapid drag events
  const rafIdRef = useRef<number | null>(null);
  const pendingIndexRef = useRef<number | null>(null);

  const scheduleBandIndexUpdate = (index: number) => {
    pendingIndexRef.current = index;
    if (rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const v = pendingIndexRef.current;
        if (v !== null && v !== undefined) {
          setCurrentBandIndex(v);
        }
      });
    }
  };

  // Cancel any pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Initialize the CogTiles instance once to read metadata
  useEffect(() => {
    if (!cogInstance) {
      const cog = new CogTiles({
        type: 'terrain',
        noDataValue: -32768.0,
        terrainSkirtHeight: 0,
        useChannel: 1,
        useSingleColor: true,
        color: [0, 105, 148, 180],
        cacheAllBands: false, // Start false for lazy loading
        disableWorkerPool: true, // Disable worker pool for smooth slider animation during rapid band changes
      });
      
      cog.initializeCog(animationCog.url).then(() => {
        setCogInstance(cog);
      });
    }
  }, []);

  const layers = useMemo(() => {
    const maskLayer = new GeoJsonLayer({
      id: 'water-mask',
      data: 'https://eu-central-1.linodeobjects.com/gisat-data/3DFlus_GST-22/app-gisat-deckglSandbox/vectors/misicuni_max_mask.geojson',
      operation: 'mask',
      maskInverted: true,
      pickable: false,
    });

    const backgroundDem = new CogTerrainLayer({
      id: 'dem-cog-layer',
      elevationData: DEM_COG_URL,
      isTiled: true,
      tileSize: 256,
      terrainOptions: {
        type: 'terrain',
        useSwissRelief: true,
        useHeatMap: true,
        useChannel: 1,
        colorScale: [
          [0, 60, 48],
          [1, 102, 94],
          [90, 180, 172],
          [128, 205, 193],
          [245, 245, 245],
          [223, 194, 125],
          [166, 97, 26],
          [140, 81, 10],
          [84, 48, 5],
        ],
        colorScaleValueRange: [2500, 5000],
      },
      pickable: false,
    });

    // 2. The Brute-Force Animated Layer
    const animatedDem = new CogTerrainLayer({
id: 'cog-animation-layer',
elevationData: animationCog.url,
isTiled: true,
tileSize: 256,
cogTiles: cogInstance || undefined, // Pass the pre-initialized instance
terrainOptions: {
  type: 'terrain',
  noDataValue: -32768.0,
  terrainSkirtHeight: 0,
  // useChannel is 1-based, so we add 1 to our 0-based index
  useChannel: currentBandIndex + 1, 
  meshMaxError: 650,
  useSingleColor: true,
  color: [0, 105, 148, 180],
  // Make cacheAllBands dynamic: only cache when user clicks the button
  cacheAllBands: isFetched,
},
pickable: true,
extensions: [new MaskExtension()],
maskId: 'water-mask',
// Force Deck.gl to re-fetch when the index or fetch state changes
updateTriggers: {
  getTileData: [currentBandIndex, isFetched]
}
    });

    return [maskLayer, backgroundDem, animatedDem];
  }, [currentBandIndex, cogInstance, isFetched]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <DeckGL
        getCursor={() => 'crosshair'}
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState)}
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
        style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
      />

      {/* Simplified Control Panel */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#333',
          width: '240px',
          zIndex: 1000,
        }}
      >
        <div style={{ marginBottom: '16px', fontWeight: 'bold', fontSize: '16px' }}>
          Multi-Band Animation
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
            Band: {currentBandIndex + 1} / {totalBands}
            {currentDescription && (
              <span style={{ marginLeft: '8px', color: '#555', fontWeight: 'normal' }}>
                — {currentDescription}
              </span>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={totalBands - 1}
            value={currentBandIndex}
            disabled={!isFetched}
            onInput={(e) => scheduleBandIndexUpdate(parseInt(e.currentTarget.value, 10))}
            onChange={(e) => scheduleBandIndexUpdate(parseInt(e.currentTarget.value, 10))}
            onMouseUp={(e) => {
              if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              setCurrentBandIndex(parseInt(e.currentTarget.value, 10));
            }}
            onTouchEnd={(e) => {
              if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              setCurrentBandIndex(parseInt(e.currentTarget.value, 10));
            }}
            style={{ width: '100%', cursor: isFetched ? 'pointer' : 'not-allowed', opacity: isFetched ? 1 : 0.5 }}
          />
        </div>

        <button
          onClick={() => setIsFetched(true)}
          disabled={isFetched}
          style={{
            width: '100%',
            padding: '8px',
            marginTop: '10px',
            cursor: isFetched ? 'default' : 'pointer',
            backgroundColor: isFetched ? '#e0e0e0' : '#4CAF50',
            color: isFetched ? '#999' : 'white',
            border: 'none',
            borderRadius: '4px',
            fontWeight: '500',
          }}
        >
          {isFetched ? '✅ All Bands Cached' : '⬇️ Fetch All Bands'}
        </button>
        
        <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
          {!isFetched ? 'Click "Fetch All Bands" to enable smooth animation.' : 'Move the slider for instant animation!'}
        </div>
      </div>
    </div>
  );
}

export { CogAnimationExample };