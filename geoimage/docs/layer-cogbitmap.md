# CogBitmapLayer

A Deck.gl-compatible layer for loading and displaying tiled COG image data

## Features
### Tiled data rendering
- Dynamically load and render tiled COG image data
### Data visualization
- Set visualization styling, colors, use heatmap, set data bounds, and more
### Compression support
- Supports DEFLATE data compression methods

[//]: # (- Supports JPEG, LZW nad DEFLATE data compression methods)
## Usage
### Initialize the layer
To create CogBitmapLayer, you need an id name, URL of your COG, declare that data is tiled, 
and also an object containing [geoimage](architecture-geoimage.md) options for data processing.

### Examples
> **Note**: The examples below showcase only a subset of available rendering options. 
> To view all configurable options for `CogBitmapLayer`, 
> refer to the [geoimage](architecture-geoimage.md) library documentation.

Import package into project and create bitmap layer

```typescript
import geolib from '@gisatcz/deckgl-geolib';

const CogBitmapLayer = geolib.CogBitmapLayer;
```
Display simple rgb image. If you don't specify a channel to process, it defaults to grayscale, RGB, or RGBA depending on the channel count
```typescript
const cogLayer = new CogBitmapLayer(
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
  }
);
```

<img src = "/geoimage/docs/images/cogBitmapLayer_rgb.jpg" width = "50%" alt="COG bitmap RGB image.">

Display the second channel as a heatmap with data from 0 to 1000
- Currently, when `useAutoRange` is `true`, min and max data value for each image is calculated separately, thus it is recommended to set min and max values in `colorScaleValueRange`.

```typescript
const cogLayer = new CogBitmapLayer(
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
      type: 'image',
        // useAutoRange: true,
      colorScaleValueRange: [0,1000]
      useChannel: 1,
  }
);
```
<a name='custom-heatmap-color-scale'></a>
Display the second channel as a heatmap with data from 0 to 1000 with custom color scale 

```typescript
const cogLayer = new CogBitmapLayer(
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    colorScaleValueRange: [100, 200, 300]
    useChannel: 1,
    useHeatmap: true,
    colorScale: ['yellow', '#20908d', [68, 1, 84]]
  }
);
```
<img src = "/geoimage/docs/images/cogBitmapLayer_customColor.jpg" width = "50%" alt="COG bitmap image with custom color scale.">

Display the third channel as a green color and only show data from 100 to 200, the clipped data should be visualized with yellow color
```typescript
const cogLayer = new CogBitmapLayer(
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 2,
    useSingleColor: true,
    clipLow: 100, 
    clipHigh: 200,
    color: [32, 144, 81, 255], 
    clippedColor: 'yellow'
  }
);
```
<img src = "/geoimage/docs/images/cogBitmapLayer_clip.jpg" width = "50%" alt="COG bitmap image with clipped areas.">

<a name='assigning-color-to-specific-data-value'></a>
Assign color to specific data values 
```typescript
const cogLayer = new CogBitmapLayer(
  id: 'cog_bitmap_name',
  rasterData:  'cog_bitmap_data_url.tif',
  isTiled: true,
  cogBitmapOptions: {
    type: 'image',
    useChannel: 20,
    useColorsBasedOnValues: true,
    colorsBasedOnValues: [[1, 'red'], [2, [0, 0, 255]], [3, '#00FF00']]
  }
);
```
