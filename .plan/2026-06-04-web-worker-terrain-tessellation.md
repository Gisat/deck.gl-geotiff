# Web Worker Terrain Tessellation Implementation Plan
**Date:** 2026-06-04  
**Context:** Move Martini/Delatin tessellation off the main thread to fix Windows performance bottleneck

---

## Background

**Problem:** On Windows machines, when deck.gl requests 16+ terrain tiles simultaneously during initial map load, the synchronous Martini tessellation (~10-50ms per tile) blocks the main JavaScript thread for several seconds. Chrome DevTools shows solid yellow "Scripting" blocks. This freezes the browser, halts network requests, and creates a poor UX.

**Solution:** Move tessellation to a Web Worker pool that runs on background threads, keeping the main thread responsive.

**Related Plans:**
- [`2026-04-20-terrain-performance-plan.md`](./2026-04-20-terrain-performance-plan.md) — Item 5 (Web Workers, deferred until now)
- [`2026-04-23-terrain-perf-critical-review.md`](./2026-04-23-terrain-perf-critical-review.md) — Cache infrastructure (must integrate with)
- [`2026-04-29-terrain-cache-and-texture-improvements.md`](./2026-04-29-terrain-cache-and-texture-improvements.md) — TileResult cache + skipTexture

---

## Web Workers 101 — Quick Primer

### What is a Web Worker?

A Web Worker is a separate JavaScript thread that runs **in parallel** with the main thread. It cannot access the DOM, but it's perfect for CPU-intensive computations like mesh generation.

### Communication Pattern

```
Main Thread                          Worker Thread
    |                                      |
    |---postMessage({ terrain, ... })---->|
    |                                      | (compute mesh)
    |<--postMessage({ mesh, ... })--------|
    |                                      |
```

### Transferable Objects

When you pass a `Float32Array` normally, JavaScript **copies** the entire buffer (~500KB). With Transferable Objects, the buffer is **moved** (zero-copy):

```ts
// ❌ Slow: copies 500KB
worker.postMessage({ terrain: myFloat32Array });

// ✅ Fast: transfers ownership (zero-copy)
worker.postMessage({ terrain: myFloat32Array }, [myFloat32Array.buffer]);
```

**Caveat:** After transfer, `myFloat32Array` becomes **detached** on the main thread (length=0). You cannot reuse it.

---

## Architecture Overview

```
CogTiles.getTile()
    ↓
Check TileResult cache ────────→ HIT: return cached mesh + raw
    ↓ MISS
getTileFromImage() (fetch raster)
    ↓
TerrainWorkerPool.computeMesh(terrain, meshMaxError)
    ↓
Worker: Martini.getMesh() → postMessage(mesh)
    ↓
Main thread: getMeshAttributes() → BitmapGenerator (if !skipTexture)
    ↓
Cache TileResult → return
```

**Key insight:** Only the **tessellation** step moves to workers. Everything else (fetch, bitmap, caching) stays on main thread.

---

## Implementation Checklist

### Phase 1 — Setup & Dependencies

#### 1.1 — Install Rollup Web Worker Plugin

```bash
yarn add -D rollup-plugin-web-worker-loader
```

**Files:** `package.json`, `yarn.lock`

---

#### 1.2 — Configure Rollup to Inline Workers

Update `geoimage/rollup.config.mjs` to bundle the worker as a Blob URL inside the library.

**Files:** `geoimage/rollup.config.mjs`

**Changes:**
```js
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

const getPlugins = (isEsm) => [
  json(),
  // ⚠️ CRITICAL: webWorkerLoader must come BEFORE resolve() and typescript()
  // so it can intercept 'web-worker:' imports before resolution
  webWorkerLoader({
    targetPlatform: 'browser',
    inline: true,           // ← Inline worker as base64 Blob URL
    loadPath: '',           // ← No external .js files
    preserveSource: false,  // ← Remove source after bundling
    extensions: ['.ts'],    // ← Support TypeScript workers
  }),
  resolve({
    preferBuiltins: true,
    browser: true,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    exclude: ['**.js'],
    declaration: isEsm,
    declarationDir: isEsm ? 'dist/esm/types' : undefined,
    rootDir: 'src',
  }),
  filesize(),
];
```

**Why plugin order matters:** `rollup-plugin-web-worker-loader` needs to process `import Worker from 'web-worker:./file.ts'` imports BEFORE other plugins try to resolve them. If `resolve()` runs first, it won't find the special `web-worker:` prefix and will fail.

**Why this works:** The plugin intercepts `import Worker from 'web-worker:./file.ts'` imports, bundles the worker code (including Martini), converts it to a Blob URL, and inlines it into your library bundle. Consumers get a single `.js` file with zero configuration needed.

---

#### 1.3 — Verify Build Still Works

```bash
cd geoimage
yarn build
```

**Expected:** Build succeeds, no errors. Bundle size should be unchanged (we haven't added worker code yet).

---

### Phase 2 — Create the Worker

#### 2.1 — Create Worker File with Basic Structure

Create `geoimage/src/workers/terrain.worker.ts`.

**Files:** `geoimage/src/workers/terrain.worker.ts` (new)

**Code:**
```ts
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
        mesh = {
          vertices: tin.coords,
          triangles: Uint32Array.from(tin.triangles),
        };
      } else {
        // Martini tessellation (default)
        const gridSize = width + 1; // Martini requires gridSize, not width
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
        self.postMessage(response, [
          mesh.vertices.buffer,
          mesh.triangles.buffer,
          terrain.buffer, // ← Transfer terrain back
        ]);
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
```

**Key points:**
- `taskId`: Unique identifier per tile so we can match responses to requests
- `abortedTasks`: Prevents sending results for cancelled tiles (saves bandwidth)
- Transferable Objects: `postMessage(response, [mesh.vertices.buffer, ...])` moves buffers instead of copying
- Both Martini and Delatin supported (mirrors existing `TerrainGenerator` logic)

---

#### 2.2 — Create Worker Pool Manager (Global Singleton)

Create `geoimage/src/workers/TerrainWorkerPool.ts` to manage multiple workers.

**CRITICAL DESIGN DECISION:** This pool is a **global singleton** shared across all `CogTiles` instances. 

**Why?** Deck.gl's reactive paradigm frequently recreates layer instances on prop/state changes. If each `CogTiles` instance owned its own pool and terminated it on unmount, we'd be constantly spawning and destroying workers (expensive). A single global pool initialized once and reused is much more efficient.

**Files:** `geoimage/src/workers/TerrainWorkerPool.ts` (new)

**Code:**
```ts
/**
 * Pool of Web Workers for parallel terrain tessellation.
 * Distributes work across multiple workers based on CPU core count.
 * 
 * SINGLETON PATTERN: One global pool is shared across all CogTiles instances
 * to avoid expensive worker creation/destruction during deck.gl layer recreations.
 */

// @ts-ignore - rollup-plugin-web-worker-loader provides this special import
import TerrainWorker from 'web-worker:./terrain.worker.ts';

interface MeshResult {
  vertices: Uint16Array;
  triangles: Uint32Array;
  terrain: Float32Array; // ← Transferred back from worker
}

interface PendingTask {
  resolve: (result: MeshResult) => void;
  reject: (error: Error) => void;
  aborted: boolean;
}

export interface ComputeMeshOptions {
  terrain: Float32Array;
  meshMaxError: number;
  tesselator: 'martini' | 'delatin';
  width: number;
  height: number;
  signal?: AbortSignal;
}

/**
 * Manages a pool of terrain tessellation workers.
 * Automatically scales to CPU core count (capped at 8 for memory safety).
 */
class TerrainWorkerPool {
  private workers: Worker[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private taskCounter = 0;
  private roundRobinIndex = 0;

  constructor(poolSize?: number) {
    // Default to CPU core count, fallback to 4, cap at 8 to prevent memory exhaustion
    const defaultSize = Math.min(navigator.hardwareConcurrency || 4, 8);
    
    // On low-memory devices (<4GB), use only 2 workers to avoid OOM
    const memoryAdjustedSize = (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4
      ? 2
      : defaultSize;

    const size = poolSize ?? memoryAdjustedSize;

    for (let i = 0; i < size; i++) {
      const worker = new TerrainWorker();
      worker.onmessage = this.handleWorkerMessage.bind(this);
      worker.onerror = this.handleWorkerError.bind(this);
      this.workers.push(worker);
    }

    console.log(`[TerrainWorkerPool] Initialized with ${size} workers`);
  }

  /**
   * Compute terrain mesh using the worker pool.
   * Returns a Promise that resolves with the mesh data.
   * Supports cancellation via AbortSignal.
   */
  async computeMesh(options: ComputeMeshOptions): Promise<MeshResult> {
    const { terrain, meshMaxError, tesselator, width, height, signal } = options;

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Task aborted before dispatch');
    }

    const taskId = `task_${++this.taskCounter}`;

    return new Promise<MeshResult>((resolve, reject) => {
      const task: PendingTask = { resolve, reject, aborted: false };
      this.pendingTasks.set(taskId, task);

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          task.aborted = true;
          this.pendingTasks.delete(taskId);

          // Notify worker to stop processing (best-effort)
          const worker = this.getNextWorker();
          worker.postMessage({ type: 'abort', taskId });

          reject(new Error('Mesh computation aborted'));
        }, { once: true });
      }

      // Dispatch to next available worker (round-robin)
      const worker = this.getNextWorker();

      // Transfer terrain buffer ownership to avoid copy
      // NOTE: After this, `terrain` becomes detached on main thread
      worker.postMessage(
        {
          type: 'computeMesh',
          taskId,
          terrain,
          meshMaxError,
          tesselator,
          width,
          height,
        },
        [terrain.buffer] // ← Transferable
      );
    });
  }

  private getNextWorker(): Worker {
    const worker = this.workers[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;
    return worker;
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { type, taskId, result, error } = e.data;

    if (type === 'ready') {
      // Worker initialization complete (can be ignored)
      return;
    }

    const task = this.pendingTasks.get(taskId);
    if (!task) {
      // Task was aborted or already resolved
      return;
    }

    this.pendingTasks.delete(taskId);

    if (task.aborted) {
      // Ignore result for aborted task
      return;
    }

    if (type === 'meshResult') {
      task.resolve(result);
    } else if (type === 'error') {
      task.reject(new Error(`Worker error: ${error}`));
    }
  }

  private handleWorkerError(e: ErrorEvent) {
    console.error('[TerrainWorkerPool] Worker error:', e.message);
    // Global worker errors are rare; log for debugging
  }

  /**
   * Terminate all workers.
   * ⚠️ NOTE: Because this is a singleton, terminate() should only be called
   * on app shutdown, not on individual layer unmount.
   */
  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.pendingTasks.clear();
    console.log('[TerrainWorkerPool] Terminated');
  }
}

// ─── SINGLETON INSTANCE ───
// Lazily initialized on first use; shared across all CogTiles instances
let globalWorkerPool: TerrainWorkerPool | null = null;

/**
 * Gets the global terrain worker pool, creating it on first use.
 * All CogTiles instances share this pool to avoid expensive worker churn
 * during deck.gl layer recreations.
 */
export function getGlobalTerrainWorkerPool(): TerrainWorkerPool {
  if (!globalWorkerPool) {
    globalWorkerPool = new TerrainWorkerPool();
  }
  return globalWorkerPool;
}

/**
 * Terminates the global worker pool.
 * Only call this on app shutdown, not on layer unmount.
 */
export function terminateGlobalTerrainWorkerPool() {
  if (globalWorkerPool) {
    globalWorkerPool.terminate();
    globalWorkerPool = null;
  }
}
```

**Key features:**
- **Round-robin scheduling**: Distributes tasks evenly across workers
- **Abort handling**: Sends abort message to worker, cleans up pending promise
- **Memory detection**: Reduces pool size on low-memory devices
- **Transferable Objects**: Terrain buffer ownership transferred to worker (zero-copy)

---

### Phase 3 — Integrate with TerrainGenerator

#### 3.1 — Use Global Worker Pool in CogTiles

Modify `geoimage/src/core/CogTiles.ts` to reference the global singleton worker pool.

**Files:** `geoimage/src/core/CogTiles.ts`

**Changes:**

```ts
// Top of file, add import:
import { getGlobalTerrainWorkerPool } from '../workers/TerrainWorkerPool';
import type { TerrainWorkerPool } from '../workers/TerrainWorkerPool';

// In CogTiles class fields (around line 57):
private cache = new TileCacheManager();
private tileReader?: TileReader;
private workerPool?: TerrainWorkerPool; // ← Reference to global pool

constructor(options: GeoImageOptions) {
  this.options = { ...CogTilesGeoImageOptionsDefaults, ...options };
  
  // Get reference to global worker pool for terrain tiles
  // Do NOT create a new pool per instance — reuse the singleton
  if (options.type === 'terrain') {
    this.workerPool = getGlobalTerrainWorkerPool();
  }
}

// ⚠️ NO destroy() method needed!
// The global pool persists across layer recreations.
// Only terminate it on app shutdown (not our responsibility).
```

**Why use a singleton?**  
Deck.gl frequently recreates layer instances. If we created a new pool per instance and terminated it on unmount, we'd waste time spawning/destroying workers. The singleton persists across layer lifecycles.

---

#### 3.2 — Pass Worker Pool to TerrainGenerator

Modify `TerrainGenerator.generate()` signature to accept an optional worker pool.

**Files:** `geoimage/src/core/lib/TerrainGenerator.ts`

**Changes (line 12):**

```ts
import { TerrainWorkerPool } from '../../workers/TerrainWorkerPool';

static async generate(
  input: { width: number; height: number; rasters: TypedArray[]; bounds: Bounds; cellSizeMeters?: number },
  options: GeoImageOptions,
  meshMaxError: number,
  workerPool?: TerrainWorkerPool  // ← NEW parameter
): Promise<TileResult> {
```

---

#### 3.3 — Replace Synchronous Tessellation with Worker Call (Zero-Copy Roundtrip)

Modify `TerrainGenerator.generate()` to use workers instead of synchronous `getMartiniTileMesh()` / `getDelatinTileMesh()`.

**CRITICAL PERFORMANCE OPTIMIZATION:** We do NOT use `meshTerrain.slice()` to copy the buffer. Instead, we transfer `meshTerrain` to the worker and have the worker transfer it back alongside the mesh. This avoids a ~260KB allocation per tile on the main thread (× 16 tiles = 4MB of synchronous allocations during initial load).

**Files:** `geoimage/src/core/lib/TerrainGenerator.ts`

**Changes (around line 30-46):**

```ts
// 2. Tesselate (Generate Mesh)
const { terrainSkirtHeight, verticalExaggeration = 1.0 } = options;

let mesh: { vertices: Uint16Array; triangles: Uint32Array };
let meshTerrainForAttributes: Float32Array; // ← Will hold terrain for getMeshAttributes()

if (workerPool) {
  // ✅ NEW: Offload to Web Worker with ZERO-COPY ROUNDTRIP
  // Transfer meshTerrain to worker; worker transfers it back alongside mesh
  // This avoids meshTerrain.slice() allocation on main thread
  const result = await workerPool.computeMesh({
    terrain: meshTerrain, // ← Transferred to worker (detached here)
    meshMaxError,
    tesselator: options.tesselator || 'martini',
    width: meshWidth,
    height: meshHeight,
    // No signal here — abort is handled at getTile() level
  });

  mesh = { vertices: result.vertices, triangles: result.triangles };
  meshTerrainForAttributes = result.terrain; // ← Transferred back from worker
} else {
  // ❌ FALLBACK: Synchronous (old behavior, kept for safety)
  switch (options.tesselator) {
    case 'martini':
      mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
      break;
    case 'delatin':
      mesh = this.getDelatinTileMesh(meshMaxError, meshWidth, meshHeight, meshTerrain);
      break;
    default:
      mesh = this.getMartiniTileMesh(meshMaxError, meshWidth, meshTerrain);
      break;
  }
  meshTerrainForAttributes = meshTerrain; // ← Use original
}

const { vertices } = mesh;
let { triangles } = mesh;
let attributes = this.getMeshAttributes(vertices, meshTerrainForAttributes, meshWidth, meshHeight, input.bounds, verticalExaggeration);
// ... rest unchanged
```

**Why this is critical:**  
If we did `const terrainCopy = meshTerrain.slice()`, the main thread would synchronously allocate ~260KB per tile. During initial load with 16 tiles, that's **4MB of allocations while the main thread is already under pressure**. By transferring the buffer to the worker and back, we avoid ALL main-thread allocations.

---

#### 3.4 — Update CogTiles.getTile() to Pass Worker Pool

Modify `CogTiles.getTile()` to pass `this.workerPool` to `TerrainGenerator.generate()`.

**Files:** `geoimage/src/core/CogTiles.ts`

**Changes (around line 450-500, inside `getTile()`):**

Find the line:
```ts
const result = await this.geo.getMap({ ... }, this.options, meshMaxError ?? 4.0);
```

Update `GeoImage.getMap()` to accept and forward `workerPool`:

**Actually**, simpler approach: `GeoImage.getMap()` already calls `TerrainGenerator.generate()`. We need to thread `workerPool` through:

**Files:** `geoimage/src/core/GeoImage.ts`

**Changes:**
```ts
import { TerrainWorkerPool } from '../workers/TerrainWorkerPool';

async getMap(
  input: { width: number; height: number; rasters: TypedArray[]; bounds: Bounds; cellSizeMeters?: number },
  options: GeoImageOptions,
  meshMaxError?: number,
  workerPool?: TerrainWorkerPool  // ← NEW
): Promise<TileResult | null> {
  const mergedOptions = this.mergeOptions(options);
  
  if (mergedOptions.type === 'terrain') {
    return TerrainGenerator.generate(input, mergedOptions, meshMaxError ?? 4.0, workerPool);  // ← Pass through
  } else {
    return BitmapGenerator.generate(input, mergedOptions);
  }
}
```

**Then in `CogTiles.getTile()` (around line 480):**
```ts
const result = await this.geo.getMap({ ... }, this.options, meshMaxError ?? 4.0, this.workerPool);
```

---

#### 3.5 — Update CogTerrainLayer (No Cleanup Needed)

**Files:** `geoimage/src/layers/CogTerrainLayer.ts`

**Changes:** ⚠️ **NONE REQUIRED**

Because we're using a global singleton worker pool, we do NOT need to add any cleanup in `CogTerrainLayer`. The pool persists across layer recreations (which is the entire point of using a singleton).

**Optional (for consumers who want to terminate on app shutdown):**
Export `terminateGlobalTerrainWorkerPool()` from `geoimage/src/index.ts` so consumers can call it when their entire app unmounts:

```ts
// In geoimage/src/index.ts
export { terminateGlobalTerrainWorkerPool } from './workers/TerrainWorkerPool';

// Consumers can then:
// import { terminateGlobalTerrainWorkerPool } from '@gisatcz/deckgl-geolib';
// useEffect(() => () => terminateGlobalTerrainWorkerPool(), []); // On app unmount
```

But this is purely optional; browsers automatically terminate workers on page unload anyway.

---

### Phase 4 — Testing & Validation

#### 4.1 — Build and Test in Example App

```bash
# Build library
cd geoimage
yarn build

# Run example app
cd ..
yarn example
```

**Open Chrome DevTools:**
1. Go to **Performance** tab
2. Click **Record**
3. Load a map with terrain tiles (zoom to trigger 16+ tiles)
4. Stop recording

**What to look for:**
- **Before workers:** Solid yellow "Scripting" blocks on Main thread (100ms+)
- **After workers:** Main thread mostly idle (short green "Rendering" blocks). New "Worker" threads appear in flamegraph showing mesh computation.

**Expected improvement:** Initial load time should drop from ~2-3 seconds (blocking) to ~500ms-1s (non-blocking, tiles load progressively).

---

#### 4.2 — Test Abort Behavior

1. Load map
2. **Immediately pan/zoom** before tiles finish loading
3. Check console for worker logs
4. Verify: Old tiles are aborted (no mesh results logged for cancelled tasks)

---

#### 4.3 — Test Fallback (No Workers)

Temporarily disable worker pool in `CogTiles` constructor:
```ts
if (options.type === 'terrain') {
  // this.workerPool = new TerrainWorkerPool(); // ← Comment out
}
```

**Expected:** Map still works (falls back to synchronous tessellation). Verify no errors.

---

#### 4.4 — Cross-Browser Testing

Test in:
- ✅ Chrome (Windows & Mac)
- ✅ Firefox
- ✅ Safari (Mac)
- ✅ Edge

**Watch for:** Safari sometimes has stricter worker security policies. If issues arise, check browser console for CORS or CSP errors.

---

### Phase 5 — Additional Optimizations (Optional)

#### 5.1 — ✅ ALREADY IMPLEMENTED IN PHASE 3.3

Zero-copy roundtrip (transferring terrain to worker and back) is already part of the core implementation, not an optional optimization.

---

#### 5.2 — ✅ ALREADY IMPLEMENTED IN PHASE 2.2 / 3.1

Global singleton worker pool is already part of the core implementation, not an optional optimization.

---

#### 5.3 — Export Termination Function (Optional)

Allow consumers to manually terminate the global pool on app shutdown (though browsers do this automatically on page unload).

**Files:** `geoimage/src/index.ts`

**Changes:**
```ts
export { terminateGlobalTerrainWorkerPool } from './workers/TerrainWorkerPool';
```

**Consumer usage:**
```ts
// In app root component
import { terminateGlobalTerrainWorkerPool } from '@gisatcz/deckgl-geolib';

useEffect(() => {
  return () => {
    terminateGlobalTerrainWorkerPool(); // Clean up on app unmount
  };
}, []);
```

**Note:** This is purely optional; browsers automatically terminate workers on page unload.

---

## Summary

| Phase | What | Effort | Files Modified |
|-------|------|--------|----------------|
| 1 | Setup Rollup plugin | 30 min | `rollup.config.mjs`, `package.json` |
| 2 | Create worker + pool | 2 hours | `terrain.worker.ts`, `TerrainWorkerPool.ts` (new) |
| 3 | Integrate with pipeline | 2 hours | `CogTiles.ts`, `GeoImage.ts`, `TerrainGenerator.ts`, `CogTerrainLayer.ts` |
| 4 | Testing & validation | 1-2 hours | Example app, DevTools profiling |
| 5 | Optimization (optional) | 1 hour | `terrain.worker.ts`, `TerrainWorkerPool.ts` |

**Total:** 1-2 days of focused work.

---

## Success Criteria

✅ Chrome DevTools Performance tab shows main thread is no longer blocked during tile load  
✅ Workers appear in flamegraph with mesh computation time  
✅ Windows performance matches or exceeds macOS  
✅ Build succeeds; bundle size increases by <30KB  
✅ Example app works in Chrome, Firefox, Safari, Edge  
✅ Abort behavior works (cancelled tiles don't waste CPU)  

---

## Rollback Plan

If workers cause issues in production:

1. Add `useWorkers: boolean` flag to `GeoImageOptions` (default `true`)
2. In `CogTiles` constructor:
   ```ts
   if (options.type === 'terrain' && options.useWorkers !== false) {
     this.workerPool = new TerrainWorkerPool();
   }
   ```
3. Users can opt out: `cogBitmapOptions: { type: 'terrain', useWorkers: false }`

This keeps the synchronous fallback path alive for safety.

---

## Next Steps

Once you're ready to proceed, we'll implement this step-by-step following your strict one-item-at-a-time workflow:

1. Start with **Phase 1.1** (install plugin)
2. I'll explain what changed and why
3. You confirm to continue
4. Move to **Phase 1.2**, and so on...

**Are you ready to start with Phase 1.1 (installing the Rollup plugin)?**
