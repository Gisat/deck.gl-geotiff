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
