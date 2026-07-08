import { useState, useEffect, useRef, useCallback } from 'react';
import { LinearInterpolator } from '@deck.gl/core';

export type Mode = '2d' | 'transitioning_to_3d' | '3d' | 'transitioning_to_2d';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export interface TransitionOptions {
  duration?: number;
  targetPitch?: number;
  zoomOffset?: number;
}

export interface TransitionState {
  mode: Mode;
  elevationScale: number;
  switchTo3D: () => void;
  switchTo2D: () => void;
}

export function calculateTerrainZOffset(
  zRange: [number, number] | null | undefined,
  elevationScale: number,
): number {
  return zRange ? zRange[1] * elevationScale : 0;
}

export function useDeckTransition(
  setViewState: React.Dispatch<React.SetStateAction<any>>,
  options: TransitionOptions = {},
): TransitionState {
  const {
    duration = 1500,
    targetPitch = 40,
    zoomOffset = 0.3,
  } = options;
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
      pitch: targetPitch,
      zoom: prev.zoom - zoomOffset,
      transitionDuration: duration,
      transitionInterpolator: new LinearInterpolator(['pitch', 'bearing', 'zoom']),
    }));

    // Animate elevationScale from 0 to 1 over `duration`ms
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
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
  }, [cleanup, setViewState, duration, targetPitch, zoomOffset]);

  const switchTo2D = useCallback(() => {
    cleanup();

    const startScale = elevationScaleRef.current;
    setMode('transitioning_to_2d');

    setViewState((prev: any) => ({
      ...prev,
      pitch: 0,
      bearing: 0,
      zoom: prev.zoom + zoomOffset,
      transitionDuration: duration,
      transitionInterpolator: new LinearInterpolator(['pitch', 'bearing', 'zoom']),
    }));

    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
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
  }, [cleanup, setViewState, duration, zoomOffset]);

  return { mode, elevationScale, switchTo3D, switchTo2D };
}
