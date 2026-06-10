/**
 * Pool of Web Workers for parallel terrain tessellation.
 * Distributes work across multiple workers based on CPU core count.
 *
 * SINGLETON PATTERN: One global pool is shared across all CogTiles instances
 * to avoid expensive worker creation/destruction during deck.gl layer recreations.
 */

// @ts-expect-error - The import statement will be handled by both Rollup (web-worker: prefix)
// and our Vite plugin (web-worker: → ?worker conversion)
import TerrainWorker from 'web-worker:./terrain.worker.ts';

interface MeshResult {
  vertices: Uint16Array | Float64Array; // Martini → Uint16Array, Delatin → Float64Array
  triangles: Uint32Array;
  terrain: Float32Array; // ← Transferred back from worker
}

interface PendingTask {
  // eslint-disable-next-line no-unused-vars
  resolve: (result: MeshResult) => void;
  // eslint-disable-next-line no-unused-vars
  reject: (error: Error) => void;
  aborted: boolean;
  worker: Worker; // ← Track which worker owns this task for correct abort routing
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
      // Pick worker once — used for both dispatch and abort to ensure correct routing
      const worker = this.getNextWorker();
      const task: PendingTask = { resolve, reject, aborted: false, worker };
      this.pendingTasks.set(taskId, task);

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          task.aborted = true;
          this.pendingTasks.delete(taskId);

          // Send abort to the same worker that owns this task
          worker.postMessage({ type: 'abort', taskId });

          reject(new Error('Mesh computation aborted'));
        }, { once: true });
      }

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
    const { type, taskId, result, terrain, error } = e.data;

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
      // Combine result with terrain that was transferred back
      task.resolve({
        vertices: result.vertices,
        triangles: result.triangles,
        terrain, // ← Include terrain from message
      });
    } else if (type === 'error') {
      task.reject(new Error(`Worker error: ${error}`));
    }
  }

  private handleWorkerError(e: ErrorEvent) {
    // Find which worker failed (e.target is the Worker instance)
    const failedWorker = e.target as Worker;
    
    // Find all pending tasks assigned to this worker
    const failedTaskIds: string[] = [];
    this.pendingTasks.forEach((task, taskId) => {
      if (task.worker === failedWorker) {
        failedTaskIds.push(taskId);
      }
    });
    
    // Reject all tasks for the failed worker
    for (const taskId of failedTaskIds) {
      const task = this.pendingTasks.get(taskId);
      if (task) {
        this.pendingTasks.delete(taskId);
        task.reject(new Error(`Worker crashed: ${e.message || 'Unknown error'}`));
      }
    }
    
    // Respawn the failed worker to maintain pool capacity
    const workerIndex = this.workers.indexOf(failedWorker);
    if (workerIndex !== -1) {
      try {
        const newWorker = new TerrainWorker();
        newWorker.onmessage = this.handleWorkerMessage.bind(this);
        newWorker.onerror = this.handleWorkerError.bind(this);
        this.workers[workerIndex] = newWorker;
      } catch (spawnError) {
        // eslint-disable-next-line no-console
        console.error('[TerrainWorkerPool] Failed to respawn worker:', spawnError);
      }
    }
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
