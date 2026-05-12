## [2.5.0](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0...v2.5.0) (2026-05-12)

### Features

* Add disableLighting support to GeoImageOptions and CogTerrainLayer ([04ba032](https://github.com/Gisat/deck.gl-geotiff/commit/04ba032be7ace89823ffe85e8b7999e818eb4095))
* Add multi-mode terrain glaze example with interactive mode switching ([4711efd](https://github.com/Gisat/deck.gl-geotiff/commit/4711efdafa5fbbbef378dc635b9f351d09556066))
* add per-type caching (raster/relief mask/TileResult), abort handling, and update plan ([9de1791](https://github.com/Gisat/deck.gl-geotiff/commit/9de1791f7a8a73b383d1135fc33f7b8407350be2))
* add raster tile caching with LRU eviction to CogTiles ([8660328](https://github.com/Gisat/deck.gl-geotiff/commit/86603281b7c50b799ff31e2e6953dadd14bb9686))
* Add Swiss relief demo & update documentation ([93febef](https://github.com/Gisat/deck.gl-geotiff/commit/93febefe861969a19175e547fff7624b86c9e8a1))
* Add Swiss relief types and multi-hillshade kernel ([297c0a8](https://github.com/Gisat/deck.gl-geotiff/commit/297c0a85fbd6019987ea29d92c4f374b9a66c512))
* add verticalExaggeration option to decouple visual exaggeration from unit conversion ([7d37465](https://github.com/Gisat/deck.gl-geotiff/commit/7d3746580d03c9a26c58e24bb0752d97638801b5))
* dynamic mesh max error based on zoom level ([83bbc79](https://github.com/Gisat/deck.gl-geotiff/commit/83bbc797fc7e461101b9f7607411b063014ab273))
* implement Item 3 - AbortSignal propagation for tile cancellation ([c288c4e](https://github.com/Gisat/deck.gl-geotiff/commit/c288c4eb6e01e93d6c831a7cac4519e54e57ed0c))
* Implement Swiss relief compositing in TerrainGenerator & BitmapGenerator ([a880677](https://github.com/Gisat/deck.gl-geotiff/commit/a8806772f171f89ed76c5df025cb8af5793d1853))
* implement visualization mode defaults, terrainColor, and LUT caching ([84db70f](https://github.com/Gisat/deck.gl-geotiff/commit/84db70f0701e1e726a36b3595a3be6045ac73f8b))
* replace raster cache with Promise-based TileResult cache in CogTiles ([2cbd850](https://github.com/Gisat/deck.gl-geotiff/commit/2cbd850ef2a1d187dfcee403bf12494430afaf4d))
* **terrain:** default noDataCheck to 'full' and document border+center caveat ([a80c29d](https://github.com/Gisat/deck.gl-geotiff/commit/a80c29d33a986a8af66d09737cfcdae99ed47562))
* **terrain:** respect skipTexture and include in TileResult cache key ([321c2ea](https://github.com/Gisat/deck.gl-geotiff/commit/321c2ea08ad373a149e685c6daee8c7428ca8c26))
* **terrain:** skip tessellation for all-noData tiles ([ff24d73](https://github.com/Gisat/deck.gl-geotiff/commit/ff24d73aea128134b6c9032cbaae4e145657d8ca))

### Bug Fixes

* add abort guard before geo.getMap() in getTile ([67527b8](https://github.com/Gisat/deck.gl-geotiff/commit/67527b861b449c6770ae6b33364c45ed8d0026e3))
* Add graceful error handling to CogBitmapLayer tile fetching ([e10cc5b](https://github.com/Gisat/deck.gl-geotiff/commit/e10cc5be93eb1be7332b49dada8d33c0a414a962))
* Address PR [#140](https://github.com/Gisat/deck.gl-geotiff/issues/140) code review comments ([b7918bf](https://github.com/Gisat/deck.gl-geotiff/commit/b7918bf6c57d5c31f61b6cf2141b34ca85916188)), closes [#98](https://github.com/Gisat/deck.gl-geotiff/issues/98)
* Address PR [#141](https://github.com/Gisat/deck.gl-geotiff/issues/141) code review comments ([fd50e3d](https://github.com/Gisat/deck.gl-geotiff/commit/fd50e3d2531d7b0296c73e1408183dbe929f6988))
* Address PR [#142](https://github.com/Gisat/deck.gl-geotiff/issues/142) code review comments ([bc44a3e](https://github.com/Gisat/deck.gl-geotiff/commit/bc44a3edddf2b00db49e5f6b162d99d89a9d227a))
* Address PR [#143](https://github.com/Gisat/deck.gl-geotiff/issues/143) code review comments ([964a69d](https://github.com/Gisat/deck.gl-geotiff/commit/964a69d26acd1847ca2a6ed701bc29d65e8b36ac))
* Address PR [#143](https://github.com/Gisat/deck.gl-geotiff/issues/143) second code review comments ([4bbc8b9](https://github.com/Gisat/deck.gl-geotiff/commit/4bbc8b97e5773715230fe24c05ca81e447fdea9f))
* Address PR [#144](https://github.com/Gisat/deck.gl-geotiff/issues/144) code review comments ([6782557](https://github.com/Gisat/deck.gl-geotiff/commit/678255749436ccebfc4567a6f17a11de9c826793))
* Address PR [#145](https://github.com/Gisat/deck.gl-geotiff/issues/145) code review comments ([e088e18](https://github.com/Gisat/deck.gl-geotiff/commit/e088e18596164a2b55997f3cc2d578d4ce91a7d2))
* Apply proper null-coalescing operators in BitmapGenerator.getColorValue ([4e20524](https://github.com/Gisat/deck.gl-geotiff/commit/4e205240e1791fd2b6d9b0fa0b325f15deb45b46))
* **cog:** explicitly enable BlockedSource to restore HTTP block caching ([48b9b6c](https://github.com/Gisat/deck.gl-geotiff/commit/48b9b6cf88f505a9e94f5dbac79f5e6c06847621))
* **cog:** fix excessive request regression with concurrent caching and BlockedSource ([59ba96a](https://github.com/Gisat/deck.gl-geotiff/commit/59ba96a4f4fc59390e2d7aba1975b3815718cb35))
* Correct rangeMax calculation in BitmapGenerator.getColorValue ([10ca22e](https://github.com/Gisat/deck.gl-geotiff/commit/10ca22e1bfae1b1f3349cf2931948490ce0b62e1))
* **example:** update meshMaxError to 'auto' ([7c02487](https://github.com/Gisat/deck.gl-geotiff/commit/7c02487017026b3e7c7e802a563400c964fc4d6a))
* fix abort signal causing tile holes on zoom ([06c5266](https://github.com/Gisat/deck.gl-geotiff/commit/06c5266ec87b6ca2160ae636472066e3bded8f44))
* remove console.log spam and add abort guard in CogTiles ([1d1cdcf](https://github.com/Gisat/deck.gl-geotiff/commit/1d1cdcf023c29411fdf12ddc014358251b174688))
* Resolve RecoilRoot TypeScript type mismatch in example app ([de245d9](https://github.com/Gisat/deck.gl-geotiff/commit/de245d99ebb3937eb0c972d0d3a951889e99e313))
* resolve TypeScript build errors in CogTiles and CogBitmapLayer ([e713078](https://github.com/Gisat/deck.gl-geotiff/commit/e71307811d6e04579a05486a8248dca915d93dbd))
* unwrap single-error AggregateErrors for clearer diagnostics in tile fetch ([a0b3ea6](https://github.com/Gisat/deck.gl-geotiff/commit/a0b3ea611822b5808be19fadea0a5da89c6feb97))
* use NaN-aware noData detection across all generators ([ad7ed95](https://github.com/Gisat/deck.gl-geotiff/commit/ad7ed9501fed3239c06df36fd7312d845577a1f0))
* wire LRU eviction, fetchSize cache key, and debug log cleanup in CogTiles ([9d55c30](https://github.com/Gisat/deck.gl-geotiff/commit/9d55c3075872fcebfb5cd602e358065cd9594ae5))

### Performance Improvements

* Cache Swiss relief color LUT in BitmapGenerator ([79a5d11](https://github.com/Gisat/deck.gl-geotiff/commit/79a5d11abde44a2c0724ff359f9c45ea251cd67d))
* **cog:** add instance and image caching for multi-mode use cases ([3b35f3c](https://github.com/Gisat/deck.gl-geotiff/commit/3b35f3cbed3446e4b7cbb656e2c8e7d7c5f5cea3))
* Extract gradient computation helper in KernelGenerator ([e6dee01](https://github.com/Gisat/deck.gl-geotiff/commit/e6dee0128762a72c69c7f865ce477339b5cfec1a))
* optimize skirt edge deduplication with integer keys and inline processing ([2716af9](https://github.com/Gisat/deck.gl-geotiff/commit/2716af95ea5932cb505a1cb50955a16d49579362))
* replace O(n log n) sort with O(n) HashMap in skirt edge deduplication ([744e1e8](https://github.com/Gisat/deck.gl-geotiff/commit/744e1e8173c77b51d6dce06a8db3056890fd7533))

## [2.5.0-dev.6](https://github.com/Gisat/deck.gl-geotiff/compare/v2.5.0-dev.5...v2.5.0-dev.6) (2026-05-11)

### Features

* add per-type caching (raster/relief mask/TileResult), abort handling, and update plan ([9de1791](https://github.com/Gisat/deck.gl-geotiff/commit/9de1791f7a8a73b383d1135fc33f7b8407350be2))
* dynamic mesh max error based on zoom level ([83bbc79](https://github.com/Gisat/deck.gl-geotiff/commit/83bbc797fc7e461101b9f7607411b063014ab273))
* replace raster cache with Promise-based TileResult cache in CogTiles ([2cbd850](https://github.com/Gisat/deck.gl-geotiff/commit/2cbd850ef2a1d187dfcee403bf12494430afaf4d))
* **terrain:** default noDataCheck to 'full' and document border+center caveat ([a80c29d](https://github.com/Gisat/deck.gl-geotiff/commit/a80c29d33a986a8af66d09737cfcdae99ed47562))
* **terrain:** respect skipTexture and include in TileResult cache key ([321c2ea](https://github.com/Gisat/deck.gl-geotiff/commit/321c2ea08ad373a149e685c6daee8c7428ca8c26))
* **terrain:** skip tessellation for all-noData tiles ([ff24d73](https://github.com/Gisat/deck.gl-geotiff/commit/ff24d73aea128134b6c9032cbaae4e145657d8ca))

### Bug Fixes

* Address PR [#145](https://github.com/Gisat/deck.gl-geotiff/issues/145) code review comments ([e088e18](https://github.com/Gisat/deck.gl-geotiff/commit/e088e18596164a2b55997f3cc2d578d4ce91a7d2))
* resolve TypeScript build errors in CogTiles and CogBitmapLayer ([e713078](https://github.com/Gisat/deck.gl-geotiff/commit/e71307811d6e04579a05486a8248dca915d93dbd))
* unwrap single-error AggregateErrors for clearer diagnostics in tile fetch ([a0b3ea6](https://github.com/Gisat/deck.gl-geotiff/commit/a0b3ea611822b5808be19fadea0a5da89c6feb97))
* use NaN-aware noData detection across all generators ([ad7ed95](https://github.com/Gisat/deck.gl-geotiff/commit/ad7ed9501fed3239c06df36fd7312d845577a1f0))

## [2.5.0-dev.5](https://github.com/Gisat/deck.gl-geotiff/compare/v2.5.0-dev.4...v2.5.0-dev.5) (2026-05-06)

### Features

* add raster tile caching with LRU eviction to CogTiles ([8660328](https://github.com/Gisat/deck.gl-geotiff/commit/86603281b7c50b799ff31e2e6953dadd14bb9686))

### Bug Fixes

* Address PR [#144](https://github.com/Gisat/deck.gl-geotiff/issues/144) code review comments ([6782557](https://github.com/Gisat/deck.gl-geotiff/commit/678255749436ccebfc4567a6f17a11de9c826793))
* remove console.log spam and add abort guard in CogTiles ([1d1cdcf](https://github.com/Gisat/deck.gl-geotiff/commit/1d1cdcf023c29411fdf12ddc014358251b174688))
* wire LRU eviction, fetchSize cache key, and debug log cleanup in CogTiles ([9d55c30](https://github.com/Gisat/deck.gl-geotiff/commit/9d55c3075872fcebfb5cd602e358065cd9594ae5))

## [2.5.0-dev.4](https://github.com/Gisat/deck.gl-geotiff/compare/v2.5.0-dev.3...v2.5.0-dev.4) (2026-04-29)

### Features

* implement Item 3 - AbortSignal propagation for tile cancellation ([c288c4e](https://github.com/Gisat/deck.gl-geotiff/commit/c288c4eb6e01e93d6c831a7cac4519e54e57ed0c))

### Bug Fixes

* add abort guard before geo.getMap() in getTile ([67527b8](https://github.com/Gisat/deck.gl-geotiff/commit/67527b861b449c6770ae6b33364c45ed8d0026e3))
* Address PR [#143](https://github.com/Gisat/deck.gl-geotiff/issues/143) code review comments ([964a69d](https://github.com/Gisat/deck.gl-geotiff/commit/964a69d26acd1847ca2a6ed701bc29d65e8b36ac))
* Address PR [#143](https://github.com/Gisat/deck.gl-geotiff/issues/143) second code review comments ([4bbc8b9](https://github.com/Gisat/deck.gl-geotiff/commit/4bbc8b97e5773715230fe24c05ca81e447fdea9f))
* fix abort signal causing tile holes on zoom ([06c5266](https://github.com/Gisat/deck.gl-geotiff/commit/06c5266ec87b6ca2160ae636472066e3bded8f44))

## [2.5.0-dev.3](https://github.com/Gisat/deck.gl-geotiff/compare/v2.5.0-dev.2...v2.5.0-dev.3) (2026-04-28)

### Features

* add verticalExaggeration option to decouple visual exaggeration from unit conversion ([7d37465](https://github.com/Gisat/deck.gl-geotiff/commit/7d3746580d03c9a26c58e24bb0752d97638801b5))

### Bug Fixes

* Address PR [#142](https://github.com/Gisat/deck.gl-geotiff/issues/142) code review comments ([bc44a3e](https://github.com/Gisat/deck.gl-geotiff/commit/bc44a3edddf2b00db49e5f6b162d99d89a9d227a))

### Performance Improvements

* optimize skirt edge deduplication with integer keys and inline processing ([2716af9](https://github.com/Gisat/deck.gl-geotiff/commit/2716af95ea5932cb505a1cb50955a16d49579362))
* replace O(n log n) sort with O(n) HashMap in skirt edge deduplication ([744e1e8](https://github.com/Gisat/deck.gl-geotiff/commit/744e1e8173c77b51d6dce06a8db3056890fd7533))

## [2.5.0-dev.2](https://github.com/Gisat/deck.gl-geotiff/compare/v2.5.0-dev.1...v2.5.0-dev.2) (2026-04-20)

### Features

* implement visualization mode defaults, terrainColor, and LUT caching ([84db70f](https://github.com/Gisat/deck.gl-geotiff/commit/84db70f0701e1e726a36b3595a3be6045ac73f8b))

### Bug Fixes

* Address PR [#141](https://github.com/Gisat/deck.gl-geotiff/issues/141) code review comments ([fd50e3d](https://github.com/Gisat/deck.gl-geotiff/commit/fd50e3d2531d7b0296c73e1408183dbe929f6988))

## [2.5.0-dev.1](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.1-dev.1...v2.5.0-dev.1) (2026-04-20)

### Features

* Add disableLighting support to GeoImageOptions and CogTerrainLayer ([04ba032](https://github.com/Gisat/deck.gl-geotiff/commit/04ba032be7ace89823ffe85e8b7999e818eb4095))
* Add multi-mode terrain glaze example with interactive mode switching ([4711efd](https://github.com/Gisat/deck.gl-geotiff/commit/4711efdafa5fbbbef378dc635b9f351d09556066))
* Add Swiss relief demo & update documentation ([93febef](https://github.com/Gisat/deck.gl-geotiff/commit/93febefe861969a19175e547fff7624b86c9e8a1))
* Add Swiss relief types and multi-hillshade kernel ([297c0a8](https://github.com/Gisat/deck.gl-geotiff/commit/297c0a85fbd6019987ea29d92c4f374b9a66c512))
* Implement Swiss relief compositing in TerrainGenerator & BitmapGenerator ([a880677](https://github.com/Gisat/deck.gl-geotiff/commit/a8806772f171f89ed76c5df025cb8af5793d1853))

### Bug Fixes

* Add graceful error handling to CogBitmapLayer tile fetching ([e10cc5b](https://github.com/Gisat/deck.gl-geotiff/commit/e10cc5be93eb1be7332b49dada8d33c0a414a962))
* Address PR [#140](https://github.com/Gisat/deck.gl-geotiff/issues/140) code review comments ([b7918bf](https://github.com/Gisat/deck.gl-geotiff/commit/b7918bf6c57d5c31f61b6cf2141b34ca85916188)), closes [#98](https://github.com/Gisat/deck.gl-geotiff/issues/98)
* Apply proper null-coalescing operators in BitmapGenerator.getColorValue ([4e20524](https://github.com/Gisat/deck.gl-geotiff/commit/4e205240e1791fd2b6d9b0fa0b325f15deb45b46))
* Correct rangeMax calculation in BitmapGenerator.getColorValue ([10ca22e](https://github.com/Gisat/deck.gl-geotiff/commit/10ca22e1bfae1b1f3349cf2931948490ce0b62e1))
* Resolve RecoilRoot TypeScript type mismatch in example app ([de245d9](https://github.com/Gisat/deck.gl-geotiff/commit/de245d99ebb3937eb0c972d0d3a951889e99e313))

### Performance Improvements

* Cache Swiss relief color LUT in BitmapGenerator ([79a5d11](https://github.com/Gisat/deck.gl-geotiff/commit/79a5d11abde44a2c0724ff359f9c45ea251cd67d))
* Extract gradient computation helper in KernelGenerator ([e6dee01](https://github.com/Gisat/deck.gl-geotiff/commit/e6dee0128762a72c69c7f865ce477339b5cfec1a))

## [2.4.1-dev.1](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0...v2.4.1-dev.1) (2026-04-17)

### Bug Fixes

* **cog:** explicitly enable BlockedSource to restore HTTP block caching ([48b9b6c](https://github.com/Gisat/deck.gl-geotiff/commit/48b9b6cf88f505a9e94f5dbac79f5e6c06847621))
* **cog:** fix excessive request regression with concurrent caching and BlockedSource ([59ba96a](https://github.com/Gisat/deck.gl-geotiff/commit/59ba96a4f4fc59390e2d7aba1975b3815718cb35))

### Performance Improvements

* **cog:** add instance and image caching for multi-mode use cases ([3b35f3c](https://github.com/Gisat/deck.gl-geotiff/commit/3b35f3cbed3446e4b7cbb656e2c8e7d7c5f5cea3))

## [2.4.0](https://github.com/Gisat/deck.gl-geotiff/compare/v2.3.0...v2.4.0) (2026-04-15)

### Features

* add type declarations for @mapbox/martini ([e007e53](https://github.com/Gisat/deck.gl-geotiff/commit/e007e534056b4f08ae181906b03287089973f651))
* **example:** add CogTerrainKernelExample with slope/hillshade mode switcher ([a682d29](https://github.com/Gisat/deck.gl-geotiff/commit/a682d29fccdd90df3a0b79774eecb4cb5df5c871))
* **terrain:** add kernel slope/hillshade analysis ([eb0193f](https://github.com/Gisat/deck.gl-geotiff/commit/eb0193fee0b939bebc00f99ba451bf6927ea062a))
* **terrain:** generate texture from elevation data in CogTerrainLayer ([0be43ea](https://github.com/Gisat/deck.gl-geotiff/commit/0be43eaf95a7789c4462890e6a8752537911406d)), closes [#91](https://github.com/Gisat/deck.gl-geotiff/issues/91)
* **types:** reorganize GeoImageOptions into groups and add TileResult.texture ([bdece6c](https://github.com/Gisat/deck.gl-geotiff/commit/bdece6cb6ed49a125df6973f812aab06beb58655))

### Bug Fixes

* add TypeScript type annotations and property initialization ([e6d6037](https://github.com/Gisat/deck.gl-geotiff/commit/e6d603722f2b1611a2f830da81936ccfb5b9f7f7))
* **bitmap:** respect useChannelIndex in 8-bit LUT loop for future multi-band support ([78ea36c](https://github.com/Gisat/deck.gl-geotiff/commit/78ea36c77cc7e4c9c1781eb34fb1600f249b9aef))
* **bitmap:** unify invalid/clipped value handling and remove obsolete debug logs ([1700e58](https://github.com/Gisat/deck.gl-geotiff/commit/1700e587cebe02eb98f4de03a26195f7c1904870))
* **CogTerrainLayer:** use props.tileSize for mesh sublayer ([d0b1e3e](https://github.com/Gisat/deck.gl-geotiff/commit/d0b1e3e882b2e4c831d9815fca0c8f66b488faab))
* **deps:** downgrade geotiff to 3.0.3 to resolve excessive request regression ([01839cf](https://github.com/Gisat/deck.gl-geotiff/commit/01839cfeb26654dc7d99ff1cd2e076d365f0bba3))
* remediate alerts 209 and 212 (brace-expansion@2.0.3, serialize-javascript@>=7.0.5) via root-level Yarn resolutions; update plan and lockfile ([d0ef4e6](https://github.com/Gisat/deck.gl-geotiff/commit/d0ef4e6e8439ccf98a9c10069dff9916e0934be5))
* remove security resolutions to debug npm publish failure ([d11e50d](https://github.com/Gisat/deck.gl-geotiff/commit/d11e50d9bfdc7b28a2f634648307a7b70f3dd01d))
* suppress intentional console.warn in TerrainGenerator ([65a7b44](https://github.com/Gisat/deck.gl-geotiff/commit/65a7b449fa12b4b98687eec88828fb38daa0066a))
* sync semantic-release OIDC updates to dev ([c71c1b1](https://github.com/Gisat/deck.gl-geotiff/commit/c71c1b17b5b884484182aa6dfe537db40fd2c580))
* **types,ts:** type fixes and param order ([ba1ec67](https://github.com/Gisat/deck.gl-geotiff/commit/ba1ec670027154dd29c557f195cdd047e35b8d3c))
* update dependency resolutions for security ([c71ee17](https://github.com/Gisat/deck.gl-geotiff/commit/c71ee171cd7c7928bd343b42f1876e2f9e425c61))
* use local semantic-release binary with explicit config flag ([fb972cd](https://github.com/Gisat/deck.gl-geotiff/commit/fb972cd21e217114e5954db1e136fda8f9e8893d))

## [2.4.0-dev.5](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0-dev.4...v2.4.0-dev.5) (2026-04-09)

### Features

* add type declarations for @mapbox/martini ([e007e53](https://github.com/Gisat/deck.gl-geotiff/commit/e007e534056b4f08ae181906b03287089973f651))

### Bug Fixes

* add TypeScript type annotations and property initialization ([e6d6037](https://github.com/Gisat/deck.gl-geotiff/commit/e6d603722f2b1611a2f830da81936ccfb5b9f7f7))
* suppress intentional console.warn in TerrainGenerator ([65a7b44](https://github.com/Gisat/deck.gl-geotiff/commit/65a7b449fa12b4b98687eec88828fb38daa0066a))

## [2.4.0-dev.4](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0-dev.3...v2.4.0-dev.4) (2026-04-02)

### Bug Fixes

* remove security resolutions to debug npm publish failure ([d11e50d](https://github.com/Gisat/deck.gl-geotiff/commit/d11e50d9bfdc7b28a2f634648307a7b70f3dd01d))

## [2.4.0-dev.3](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0-dev.2...v2.4.0-dev.3) (2026-03-31)

### Bug Fixes

* remediate alerts 209 and 212 (brace-expansion@2.0.3, serialize-javascript@>=7.0.5) via root-level Yarn resolutions; update plan and lockfile ([d0ef4e6](https://github.com/Gisat/deck.gl-geotiff/commit/d0ef4e6e8439ccf98a9c10069dff9916e0934be5))
* update dependency resolutions for security ([c71ee17](https://github.com/Gisat/deck.gl-geotiff/commit/c71ee171cd7c7928bd343b42f1876e2f9e425c61))

## [2.4.0-dev.2](https://github.com/Gisat/deck.gl-geotiff/compare/v2.4.0-dev.1...v2.4.0-dev.2) (2026-03-30)

### Bug Fixes

* **bitmap:** respect useChannelIndex in 8-bit LUT loop for future multi-band support ([78ea36c](https://github.com/Gisat/deck.gl-geotiff/commit/78ea36c77cc7e4c9c1781eb34fb1600f249b9aef))
* **bitmap:** unify invalid/clipped value handling and remove obsolete debug logs ([1700e58](https://github.com/Gisat/deck.gl-geotiff/commit/1700e587cebe02eb98f4de03a26195f7c1904870))

## [2.4.0-dev.1](https://github.com/Gisat/deck.gl-geotiff/compare/v2.3.1-dev.1...v2.4.0-dev.1) (2026-03-23)

### Features

* **example:** add CogTerrainKernelExample with slope/hillshade mode switcher ([a682d29](https://github.com/Gisat/deck.gl-geotiff/commit/a682d29fccdd90df3a0b79774eecb4cb5df5c871))
* **terrain:** add kernel slope/hillshade analysis ([eb0193f](https://github.com/Gisat/deck.gl-geotiff/commit/eb0193fee0b939bebc00f99ba451bf6927ea062a))
* **terrain:** generate texture from elevation data in CogTerrainLayer ([0be43ea](https://github.com/Gisat/deck.gl-geotiff/commit/0be43eaf95a7789c4462890e6a8752537911406d)), closes [#91](https://github.com/Gisat/deck.gl-geotiff/issues/91)
* **types:** reorganize GeoImageOptions into groups and add TileResult.texture ([bdece6c](https://github.com/Gisat/deck.gl-geotiff/commit/bdece6cb6ed49a125df6973f812aab06beb58655))

### Bug Fixes

* **CogTerrainLayer:** use props.tileSize for mesh sublayer ([d0b1e3e](https://github.com/Gisat/deck.gl-geotiff/commit/d0b1e3e882b2e4c831d9815fca0c8f66b488faab))
* **types,ts:** type fixes and param order ([ba1ec67](https://github.com/Gisat/deck.gl-geotiff/commit/ba1ec670027154dd29c557f195cdd047e35b8d3c))

## [2.3.1-dev.1](https://github.com/Gisat/deck.gl-geotiff/compare/v2.3.0...v2.3.1-dev.1) (2026-03-20)

### Bug Fixes

* sync semantic-release OIDC updates to dev ([c71c1b1](https://github.com/Gisat/deck.gl-geotiff/commit/c71c1b17b5b884484182aa6dfe537db40fd2c580))
* use local semantic-release binary with explicit config flag ([fb972cd](https://github.com/Gisat/deck.gl-geotiff/commit/fb972cd21e217114e5954db1e136fda8f9e8893d))
