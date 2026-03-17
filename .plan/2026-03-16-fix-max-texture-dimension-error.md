# Plan: Fix maxTextureDimension2D TypeError & Dependency Deduplication

This plan addresses the `TypeError: Cannot read properties of undefined (reading 'maxTextureDimension2D')` error observed in both the example application and separate sandbox environments.

## 1. Library Configuration (`geoimage`) - DONE
1.1 **Update `package.json` Peer Dependencies**: Added `@luma.gl/*`, `react`, and `react-dom` to `peerDependencies`.
1.2 **Update `rollup.config.mjs` Externalization**: Added `@luma.gl/*` to the `external` array.

## 2. Application Configuration (`example`) - DONE
2.1 **Update `vite.config.ts` Deduplication**: Added `resolve.dedupe` for critical libraries.
2.2 **Disable Strict Mode**: Permanently disabled `<React.StrictMode>` in `example/src/index.tsx` as it causes WebGL context crashes in `deck.gl v9` due to React 18's double-initialization.

## 3. Verification - DONE
3.1 **Clean Install**: Run `yarn` at the root. (Success)
3.2 **Build Library**: Verify `geoimage/dist/` does not bundle `luma.gl` or `deck.gl`. (Success)
3.3 **Run Example**: Launch the example and verify the console error is gone. (Success - Error gone with StrictMode disabled)
