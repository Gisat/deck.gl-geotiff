# Deck.gl-GeoTIFF Library Architecture

This diagram visualizes the high-level architecture of the `deck.gl-geotiff` library, showing how data flows from the source (COG) to the rendered `deck.gl` layer.

Use this code block in [Mermaid Live Editor](https://mermaid.live/).

```mermaid
flowchart LR
    %% Define Styles
    classDef layer fill:#f9f,stroke:#333,stroke-width:2px;
    classDef core fill:#bbf,stroke:#333,stroke-width:2px;
    classDef lib fill:#bfb,stroke:#333,stroke-width:2px;
    classDef ext fill:#ddd,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5;
    classDef legend fill:#fff,stroke:#333,stroke-width:1px;

    %% --- NODES & SUBGRAPHS ---

    subgraph "User & Application"
        UserApp[User Application]
    end

    subgraph "The Layer (Public API)"
        direction TB
        BitmapLayer[CogBitmapLayer]:::layer
        TerrainLayer[CogTerrainLayer]:::layer
    end

    subgraph "Data Fetching (Orchestration)"
        direction TB
        CogTiles["CogTiles.ts"]:::core
        GeoImage["GeoImage.ts (Facade)"]:::core
        Types["types.ts"]:::core
    end

    subgraph "External Sources"
        GeoTIFF[geotiff.js]:::ext
    end

    subgraph "Processing Generators"
        direction TB
        BitmapGen["BitmapGenerator.ts"]:::lib
        TerrainGen["TerrainGenerator.ts"]:::lib
        DataUtils["DataUtils.ts"]:::lib
    end

    subgraph "Math & Meshing Libraries"
        direction TB
        Martini["Martini / Delatin"]:::ext
        Chroma[chroma-js]:::ext
    end

    %% --- DATA FLOW LINKS ---

    %% 1. Initiation
    UserApp --> BitmapLayer
    UserApp --> TerrainLayer

    %% 2. Request Data
    BitmapLayer -->|Get Tile| CogTiles
    TerrainLayer -->|Get Tile| CogTiles

    %% 3. Fetching Raw Data
    CogTiles -->|1. Fetch & Decode| GeoTIFF
    GeoTIFF -.->|Raw Rasters| CogTiles

    %% 4. Processing Request
    CogTiles -->|2. Generate Viz| GeoImage
    GeoImage -->|Delegate| BitmapGen
    GeoImage -->|Delegate| TerrainGen

    %% 5. Processing Logic & Dependencies
    TerrainGen -->|Triangulate| Martini
    BitmapGen -->|Color Scale| Chroma
    
    TerrainGen -->|Helpers| DataUtils
    BitmapGen -->|Helpers| DataUtils

    %% 6. Shared Types Usage
    CogTiles -.-> Types
    GeoImage -.-> Types
    BitmapGen -.-> Types
    TerrainGen -.-> Types

    %% 7. Return Data (The Result)
    BitmapGen -.->|Returns TileResult| GeoImage
    TerrainGen -.->|Returns TileResult| GeoImage
    
    GeoImage -.->|Returns TileResult| CogTiles
    CogTiles -.->|TileResult → tile.content| BitmapLayer
    CogTiles -.->|TileResult → tile.content| TerrainLayer

    %% --- LEGEND ---
    subgraph Legend
        msg1[Public Layer]:::layer
        msg2[Core / Facade]:::core
        msg3[Generator / Lib]:::lib
        msg4[External Dep]:::ext
    end
```

## Component Roles

1.  **Layers (`CogBitmapLayer`, `CogTerrainLayer`)**:
    *   The public interface for users.
    *   Handles `deck.gl` lifecycle (updateTriggers, rendering).
    *   Instantiates `CogTiles` to manage data fetching.

2.  **`CogTiles`**:
    *   **The Librarian**. Knows how to read a COG file structure.
    *   Handles tiling logic (XYZ -> Byte Ranges).
    *   Handles "Stitching" fetch logic (fetching 257x257 pixels).
    *   Passes raw raster data to `GeoImage`.

3.  **`GeoImage` (Facade)**:
    *   **The Orchestrator**.
    *   Receives raw data from `CogTiles`.
    *   Decides whether to generate an image or a 3D mesh based on options.
    *   Delegates work to specialized generators.

4.  **`TerrainGenerator`**:
    *   Converts raw elevation data -> 3D Mesh (Vertices + Indices).
    *   Handles **Martini / Delatin** triangulation.
    *   Handles skirts and vertical exaggeration.
    *   Returns a `TileResult` where `map` is the mesh and `raw` is the source elevation `Float32Array`.

5.  **`BitmapGenerator`**:
    *   Converts raw band data -> Visual Image (RGBA).
    *   Handles **Pixel Operations** (Contrast, Heatmaps, Classification).
    *   Produces an `ImageBitmap` for the layer to display.
    *   Returns a `TileResult` where `map` is the `ImageBitmap` and `raw` is the source raster `TypedArray`.

6.  **`TileResult` (`types.ts`)**:
    *   The shared return type from all generators: `{ map, raw, width, height }`.
    *   `map` — the visual artifact (`ImageBitmap` or mesh) sent to the GPU.
    *   `raw` — the original raster/elevation data kept on the CPU (RAM).
    *   Stored in `tile.content` by deck.gl's `TileLayer`, enabling raw value picking via `onClick`/`onHover` without additional network requests.

## AbortSignal Propagation & Tile Cancellation

### How It Works

To optimize network usage with large COGs, the library uses **AbortSignal** to cancel in-flight tile requests when the viewport changes and tiles are no longer visible.

**The control flow:**

1. **Deck.gl creates an AbortSignal** for each tile and passes it via `tile.signal`
2. **Our layers pass the signal** to `CogTiles.getTile(signal)`
3. **CogTiles propagates it** to `geotiff.js` via `readRasters({ signal })`
4. **When deck.gl prunes the tile**, it calls `signal.abort()`
5. **Geotiff.js detects the abort** and throws `AbortError`
6. **We normalize abort errors** in `getTileFromImage()` by rethrowing a standard `DOMException('AbortError')`. This ensures deck.gl treats the request as a cancellation and keeps parent tiles visible as placeholders rather than leaving holes.
7. **Result**: Network request is cancelled, WebGL resources freed, and deck.gl keeps parent tiles as placeholders ✅

### Handling Deck.gl's Internal AbortErrors

When panning and zooming rapidly with large datasets, deck.gl aggressively prunes tiles from the viewport. This triggers AbortErrors in two places:

- ✅ **In geotiff.js** (caught by our try/catch)
- ❌ **In deck.gl's `Tile2DHeader.abort()`** (deck.gl's internal error handling)

**Why deck.gl's error escapes:**

Deck.gl's abort error originates outside its promise chain that has the `.catch()` handler, causing it to escape as an "Uncaught (in promise)" rejection. This is an architectural quirk in deck.gl, not a bug in our library.

**How this library handles it:**

When you import `@gisatcz/deckgl-geolib`, the library automatically registers a single global `unhandledrejection` handler that suppresses `AbortError` events. This is:

- ✅ **Automatic** — no user configuration needed
- ✅ **Safe** — only suppresses `AbortError`, not other exceptions
- ✅ **Idempotent** — registered exactly once, even with multiple imports
- ✅ **Correct** — AbortError is control flow (normal tile cancellation), not an application error

See `geoimage/src/utils/suppressAbortErrors.ts` for the implementation.
