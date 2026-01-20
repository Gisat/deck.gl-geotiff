# CogTerrainLayer

A Deck.gl-compatible layer for loading and displaying tiled COG height data

## Features

### Tiled terrain rendering
- Dynamically load and render tiled COG height data
- Overlay another COG as a bitmap, or supply a tile service template url.
### Data visualization
- Multiply terrain height
- Clamp COG data on top of generated terrain
- Set visualization styling, colors, use heatmap, set data bounds, and more

## Usage
### Initialize the layer
To create CogTerrainLayer, you need an URL of your COG and also an object containing [geoimage](architecture-geoimage.md) options for data processing.
For this layer, only needed terrain options are `type`, and optionally `multiplier`, `terrainSkirtHeight`, `terrainMinValue`.

You can also specify another COG as an overlay, and it's corresponding options, or just supply a tile service template url. Overlay options use all of [geoimage](architecture-geoimage.md) options and work only with COG

### Example
Import package into project and create terrain layer

```typescript
import geolib from '@gisatcz/deckgl-geolib';

const CogTerrainLayer = geolib.CogTerrainLayer;
```
Display simple terrain
```typescript
const cogLayer = new CogTerrainLayer(
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
        type: 'terrain', 
    }
);
```

<img src = "/geoimage/docs/images/cogTerrainLayer.jpg" width = "50%" alt="COG terrain visualization.">

Display multiplied terrain with custom skirt height 
(height of individual tiles edges, so there are no white spaces between individual 3D tiles) and defined minimal terrain value.
```typescript
const cogLayer = new CogTerrainLayer(
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  isTiled: true,
  tileSize: 256,
  operation: 'terrain+draw',
  terrainOptions: {
        type: 'terrain', 
        multiplier: 1,
        terrainSkirtHeight: 1,
        terrainMinValue: 200,
    }
);
```
Adjust `meshMaxError`: Martini error tolerance in meters, smaller number -> more detailed mesh, **(default 4.0)**.
```typescript
const cogLayer = new CogTerrainLayer(
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  isTiled: true,
  useChannel: null,
  tileSize: 256,
  meshMaxError: 1,
  operation: 'terrain+draw',
  terrainOptions: {
        type: 'terrain', 
    }
);
```

[//]: # (TODO check if useChannel works properly)
Adjust `opacity` and display second channel.
```typescript
const cogLayer = new CogTerrainLayer(
  id: 'cog_terrain_name',
  elevationData:  'cog_terrain_data_url.tif',
  opacity: 0.5,
  isTiled: true,
  useChannel: 1,
  tileSize: 256,
  meshMaxError: 1,
  operation: 'terrain+draw',
  terrainOptions: {
        type: 'terrain', 
    }
);
```

[//]: # (TODO update overlay generation)

Display terrain with tile service overlay
```typescript
const cogLayer = new CogTerrainLayer(
    'cog_data_url.tif',
    {type:'terrain'},
    'tile-service.com/{z}/{x}/{y}.png'
)
```

<img src = "/geoimage/docs/images/cogTerrainLayer_overlay.jpg" width = "50%"  alt="COG terrain visualization with satellite imagery overlay.">

Display terrain with stylized COG overlay
```typescript
const cogLayer = new CogTerrainLayer(
    'cog.tif',
    {type:'terrain'},
    'cog-overlay.tif',
    {type:'image', useHeatMap:true, useChannel:2}
)
```
