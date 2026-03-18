# Copilot Instructions for `deck.gl-geotiff`

## Build, lint, and verification commands

- Install dependencies (root workspace): `yarn install`
- Build library (root): `yarn build`
- Build library directly (workspace): `yarn workspace @gisatcz/deckgl-geolib rollup`
- Lint library sources: `yarn lint`
- Lint with fixes: `yarn lintFix`
- Run example app locally: `yarn example` (or `yarn start` to build library first and then run example)
- Build example app: `yarn workspace example build`
- Type-check example app: `yarn workspace example typecheck`

### Test command note

There is no unit/integration test runner configured in this repo right now (no Jest/Vitest/Mocha scripts). Validation is done through linting, building, and exercising behavior in the `example` app.

## High-level architecture

This repository is a Yarn workspace monorepo with:

- `geoimage/`: published library package (`@gisatcz/deckgl-geolib`)
- `example/`: Vite + React app for manual verification and demos

Core flow for rendering tiles:

1. Deck.gl layer (`CogBitmapLayer` or `CogTerrainLayer`) owns/uses a `CogTiles` instance.
2. `CogTiles` loads COG metadata using `geotiff`, computes zoom/resolution lookup tables, and fetches tile rasters with edge padding logic.
3. `CogTiles` delegates raster conversion to `GeoImage.getMap(...)`.
4. `GeoImage` is a facade that routes to:
    - `BitmapGenerator.generate(...)` for 2D `ImageBitmap` output
    - `TerrainGenerator.generate(...)` for 3D mesh output
5. Deck.gl sublayers render the generated bitmap/mesh data.

Important design split:

- Rendering logic is intentionally separated into `BitmapGenerator` and `TerrainGenerator`.
- `GeoImage` should stay orchestration-focused, not absorb low-level pixel/mesh algorithms.

## Key project conventions

- COG assumptions are Web-Mercator-oriented. Inputs are expected to be web-optimized/tiled GeoTIFFs (typically 256 tile size, EPSG:3857 workflows).
- Terrain tiles use `tileSize + 1` (257) when needed to support seam stitching and skirt handling.
- Channel selection supports both 1-based (`useChannel`) and 0-based (`useChannelIndex`) options; `useChannelIndex` is derived when omitted.
- Core options are merged against `DefaultGeoImageOptions`; preserve this merge behavior when adding new options.
- For bitmap performance, keep the LUT optimization path in `BitmapGenerator` for 8-bit data.
- Library output is dual-format (ESM + CJS) via Rollup; keep external dependency handling aligned with `geoimage/rollup.config.mjs`.
- Workspace-level scripts are the source of truth; prefer running commands from repo root using `yarn workspace ...`.

## Existing repository-specific workflow rules

- Follow step-by-step execution for implementation/review tasks: one checklist item at a time, explain what changed, then wait for explicit user confirmation to continue.
- Use hierarchical numbering (`1.1`, `1.2`, ...) in plans/checklists.
- Keep plan/instruction artifacts in `.plan/` with `YYYY-MM-DD-kebab-case.md` naming.
- **Always ask for explicit user confirmation before running `git commit`.** Never commit autonomously.
- Before finalizing substantial work, prepare `PR_DESCRIPTION.md` using:
    - Base branch logic: if current branch is `dev`, use `master` as base; for all other branches, use `dev` as base.
    - `git diff <base_branch> --stat` and `git log <base_branch>..HEAD`
    - `PR_DESCRIPTION.md` is a **temporary working file** — never stage or commit it.
    - PR title format `Merge \`branch\` → \`target\`` is reserved for `dev → master` merges only. Feature branches use descriptive titles (e.g. `feat: ...`).

## deck.gl picking patterns

- To show hover tooltips with raw raster values, use `getTooltip` on the `DeckGL` component — **do not** use React `useState` inside `onHover`. State updates during hover trigger React re-renders that interfere with deck.gl tile initialization and cause `BitmapLayer` errors.
- `pickable: true` enables both click and hover simultaneously; there is no separate flag.
- `TileResult.raw` is `null` when `pickable: false` (the default) — all picking code must guard against null.
- `CogBitmapLayer` tile content: `TileResult` directly (`tile.content.raw`).
- `CogTerrainLayer` tile content: tuple `[TileResult | null, TextureSource | null]` (`tile.content[0].raw`).
