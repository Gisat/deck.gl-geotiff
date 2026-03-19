# Dependabot Alerts Remediation

## Problem

Two open Dependabot alerts require attention. Both are transitive dependencies (not direct), so they cannot be fixed by simply upgrading a direct dependency — the upstream packages have not yet released updates that resolve the issues.

---

## Alerts

### Alert #194 — `fast-xml-parser` (High severity)

- **CVE**: CVE-2026-33036 / GHSA-8gc5-j5rx-235r
- **Issue**: Numeric XML entity references bypass all entity expansion limits, enabling DoS attacks.
- **Dependency chain**: `@loaders.gl/wms@4.3.4` → `@loaders.gl/xml@4.3.4` → `fast-xml-parser@4.5.4`
- **Current version**: `4.5.4`
- **Fixed in**: `5.5.6`
- **Risk**: Major version bump (v4 → v5). `@loaders.gl/xml` was written for v4 API — resolution may cause runtime breakage in WMS-related functionality.

### Alert #188 — `@tootallnate/once` (Low severity)

- **CVE**: CVE-2026-3449
- **Issue**: Incorrect control flow scoping vulnerability.
- **Dependency chain**: `make-fetch-happen` → `http-proxy-agent@5.0.0` → `@tootallnate/once@2.0.0`
- **Current version**: `2.0.0`
- **Fixed in**: `3.0.1`
- **Risk**: Low. `make-fetch-happen` is npm tooling — not part of the production runtime bundle.

---

## Plan

### 1.1 Fix `@tootallnate/once` (Alert #188)

Add a resolution to `package.json` to pin `@tootallnate/once` to `>=3.0.1`:

```json
"resolutions": {
  "tar": "^7.5.11",
  "@types/react": "^18.3.28",
  "@tootallnate/once": "^3.0.1"
}
```

Run `yarn install` to apply.

### 1.2 Fix `fast-xml-parser` (Alert #194)

Add a resolution to `package.json` to pin `fast-xml-parser` to `>=5.5.6`:

```json
"resolutions": {
  "tar": "^7.5.11",
  "@types/react": "^18.3.28",
  "@tootallnate/once": "^3.0.1",
  "fast-xml-parser": ">=5.5.6"
}
```

Run `yarn install` to apply.

> ⚠️ **After applying**: manually test any WMS-related functionality to verify `@loaders.gl/xml` is not broken by the v4→v5 API change.

### 1.3 Build and lint validation

Run the full build and lint to verify nothing is broken:

```bash
yarn lint && yarn build
```

### 1.4 Monitor `@loaders.gl/xml` for upstream fix

The proper long-term fix is for `@loaders.gl/xml` to upgrade its `fast-xml-parser` dependency to v5. Monitor their releases and remove the resolution once they ship a fix — keeping the resolution indefinitely can mask future issues.

---

## Notes

- If `@loaders.gl/xml` breaks under `fast-xml-parser@5`, the fallback is to dismiss alert #194 with the note: *"Upstream @loaders.gl/xml has not released a v5-compatible fix. Monitoring for upstream resolution."*
- Dependabot automatic PR generation (`.github/dependabot.yml`) was identified as a future improvement to reduce manual remediation effort.
