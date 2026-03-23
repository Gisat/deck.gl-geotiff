# Dependabot Alerts Remediation

## Problem

Three open Dependabot alerts require attention. All are transitive dependencies (not direct), so they cannot be fixed by simply upgrading a direct dependency — the upstream packages have not yet released updates that resolve the issues.

---

## Alerts

### Alert #195 — `fast-xml-parser` (Medium severity) ⚠️ New

- **CVE**: GHSA (entity expansion limits bypassed when set to zero)
- **Issue**: Entity expansion limits are bypassed when set to zero due to JavaScript falsy evaluation — incomplete fix for CVE-2026-26278.
- **Dependency chain**: `@loaders.gl/wms@4.3.4` → `@loaders.gl/xml@4.3.4` → `fast-xml-parser`
- **Fixed in**: `5.5.7`
- **Risk**: Major version bump (v4 → v5). `@loaders.gl/xml` was written for v4 API — resolution may cause runtime breakage in WMS-related functionality.

### Alert #194 — `fast-xml-parser` (High severity)

- **CVE**: CVE-2026-33036 / GHSA-8gc5-j5rx-235r
- **Issue**: Numeric XML entity references bypass all entity expansion limits, enabling DoS attacks.
- **Dependency chain**: `@loaders.gl/wms@4.3.4` → `@loaders.gl/xml@4.3.4` → `fast-xml-parser@4.5.4`
- **Current version**: `4.5.4`
- **Fixed in**: `5.5.6` (but `5.5.7` required to also cover alert #195)
- **Risk**: Same as #195 above.

### Alert #188 — `@tootallnate/once` (Low severity)

- **CVE**: CVE-2026-3449
- **Issue**: Incorrect control flow scoping vulnerability.
- **Dependency chain**: `make-fetch-happen` → `http-proxy-agent@5.0.0` → `@tootallnate/once@2.0.0`
- **Current version**: `2.0.0`
- **Fixed in**: `3.0.1`
- **Risk**: Low. `make-fetch-happen` is npm tooling — not part of the production runtime bundle.

---

## Yarn warnings (observed during `yarn start`)

- **`YN0088`**: Yarn 4.13.0 is available (currently on 4.12.0) — upgrade with `yarn set version 4.13.0` in the same fix branch.
- **`YN0002`**: `semantic-release` is declared as a peer dependency by `@semantic-release/changelog` and other plugins, but the root workspace doesn't list it as a peer. Cosmetic warning only — not a blocker. Introduced by the semantic-release workflow setup (PRs #113–#117).
- **`YN0086`**: General peer dependency noise, same root cause as `YN0002`.

---

## Plan

### 1.1 Create fix branch

```bash
git checkout dev && git pull
git checkout -b fix/dependabot-alerts
```

### 1.2 Upgrade Yarn (optional, low risk)

```bash
yarn set version 4.13.0
```

### 1.3 Fix `@tootallnate/once` (Alert #188)

Add a resolution to root `package.json`:

```json
"resolutions": {
  "tar": "^7.5.11",
  "@types/react": "^18.3.28",
  "@tootallnate/once": "^3.0.1"
}
```

### 1.4 Fix `fast-xml-parser` (Alerts #194 and #195)

Extend the resolution to also cover `fast-xml-parser` — pin to `>=5.5.7` to address both alerts at once:

```json
"resolutions": {
  "tar": "^7.5.11",
  "@types/react": "^18.3.28",
  "@tootallnate/once": "^3.0.1",
  "fast-xml-parser": ">=5.5.7"
}
```

Run `yarn install` to apply both resolutions.

> ⚠️ **After applying**: manually test any WMS-related functionality in the example app to verify `@loaders.gl/xml` is not broken by the v4→v5 API change.

### 1.5 Build and lint validation

```bash
yarn lint && yarn build
```

### 1.6 Push and open PR to `dev`

Use a `fix:` commit prefix so semantic-release triggers a patch version bump — this also serves as a test that the new semantic-release workflow is working correctly.

### 1.7 Monitor `@loaders.gl/xml` for upstream fix

The proper long-term fix is for `@loaders.gl/xml` to upgrade its `fast-xml-parser` dependency to v5. Monitor their releases and remove the resolution once they ship a fix — keeping the resolution indefinitely can mask future issues.

---

## Notes

- If `@loaders.gl/xml` breaks under `fast-xml-parser@5`, the fallback is to dismiss alerts #194 and #195 with the note: *"Upstream @loaders.gl/xml has not released a v5-compatible fix. Monitoring for upstream resolution."*
- Dependabot automatic PR generation (`.github/dependabot.yml`) was identified as a future improvement to reduce manual remediation effort.
