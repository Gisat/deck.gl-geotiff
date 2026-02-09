# COG Tiles



##### A Javascript library for easier tile functionality with COG files



### Features

Class allows using CogTiff files with Deck.gl TileLayer.

Provides extra functionality for CogTiff files









### Methods



`async initializeCog(url : string)`- returns a cog from a given URL and initializes object variables



`async getTile(x: number, y: number, z: number)` - returns a promise, when resolved returns a tile. `x, y, z ` are coordinates in tile grid



`getTileSize(CogTiff)` - returns `number` containing the width of a single tile



`getZoomRange(cog:CogTiff)` - returns` [minZoom, maxZoom]` 



`getBoundsAsLatLon(cog:CogTiff)` - returns image bounds as `[left, bottom, right, top]`



`getOriginAsLatLon(cog:CogTiff)`- returns origin of COG as `[x, y]`



`getImageTileIndex(img:CogTiffImage)` - returns index of an image from COG in tile system as`[x, y, z]`



`getResolutionFromZoomLevel`- returns `number` in meters per pixel



`getZoomLevelFromResolution(tileSize: number, resolution: number)` returns `number` zoom level calculated from `resolution` (the size of one pixel in meters) and `tileSize` (width of a tile)



`getLatLon` - returns `[latitude, longitude]` from offset in meters









