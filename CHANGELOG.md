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
