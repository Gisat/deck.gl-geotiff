/**
 * Web Worker for terrain mesh tessellation.
 * Runs Martini/Delatin algorithms on a background thread to avoid blocking the main thread.
 */

import Martini from '@mapbox/martini';
import Delatin from '../core/delatin';

// Message types
interface ComputeMeshRequest {
  type: 'computeMesh';
  taskId: string;
  terrain: Float32Array;
  meshMaxError: number;
  tesselator: 'martini' | 'delatin';
  width: number;
  height: number;
}

interface AbortRequest {
  type: 'abort';
  taskId: string;
}

type WorkerRequest = ComputeMeshRequest | AbortRequest;

interface MeshResult {
  vertices: Uint16Array;
  triangles: Uint32Array;
}

interface ComputeMeshResponse {
  type: 'meshResult';
  taskId: string;
  result: MeshResult;
  terrain: Float32Array; // ← Add terrain to response
}

// Track aborted tasks to avoid sending results for cancelled work
const abortedTasks = new Map<string, boolean>();

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const data = e.data;

  if (data.type === 'abort') {
    // Mark task as aborted; if it's still computing, we'll skip the response
    abortedTasks.set(data.taskId, true);
    return;
  }

  if (data.type === 'computeMesh') {
    const { taskId, terrain, meshMaxError, tesselator, width, height } = data;

    let mesh: MeshResult;

    try {
      if (tesselator === 'delatin') {
        // Delatin tessellation
        const tin = new Delatin(terrain, width, height);
        tin.run(meshMaxError);
        // @ts-expect-error: Delatin instance properties 'coords' and 'triangles' are not explicitly typed in the library port
        const { coords, triangles } = tin;
        // coords is a plain array — convert to Float64Array so it has .buffer for transfer
        const verticesTyped = Float64Array.from(coords);
        const trianglesTyped = Uint32Array.from(triangles);
        mesh = {
          vertices: verticesTyped as any,
          triangles: trianglesTyped,
        };
      } else {
        // Martini tessellation (default)
        const gridSize = width === 257 ? 257 : width + 1; // Only add 1 if width is not already 2^n+1
        const martini = new Martini(gridSize);
        const tile = martini.createTile(terrain);
        mesh = tile.getMesh(meshMaxError);
      }

      // Only send result if not aborted
      if (!abortedTasks.get(taskId)) {
        const response: ComputeMeshResponse = {
          type: 'meshResult',
          taskId,
          result: mesh,
          terrain, // ← CRITICAL: Return terrain buffer to main thread
        };

        // Transfer ownership of ALL buffers back to main thread (zero-copy roundtrip)
        // This avoids meshTerrain.slice() allocation on main thread
        self.postMessage(response, {
          transfer: [
            mesh.vertices.buffer,
            mesh.triangles.buffer,
            terrain.buffer, // ← Transfer terrain back
          ],
        } as StructuredSerializeOptions);
      }
    } catch (error) {
      // Only report errors for non-aborted tasks
      if (!abortedTasks.get(taskId)) {
        self.postMessage({
          type: 'error',
          taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      // Clean up abort tracking
      abortedTasks.delete(taskId);
    }
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
