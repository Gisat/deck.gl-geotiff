# Dependabot Alerts Remediation

## Problem

Three open Dependabot alerts require attention. All are transitive dependencies (not direct), so they cannot be fixed by simply upgrading a direct dependency — the upstream packages have not yet released updates that resolve the issues.

---

## Alerts

### Alert #202 — `handlebars` (Prototype Pollution → XSS via Partial Template Injection)

- **CVE**: Prototype Pollution Leading to XSS through Partial Template Injection
- **Dependency chain**: `semantic-release@25.0.3` → `handlebars@4.7.8`
- **Affected versions**: >= 4.0.0, < 4.7.9
- **Fixed in**: 4.7.9
- **Risk**: If Object.prototype is polluted and a partial reference matches the polluted key, unescaped content can be injected into rendered output, leading to XSS. Requires both prototype pollution and knowledge of partial names.
- **Recommended solution**: Upgrade `handlebars` to version 4.7.9 or later. As this is a transitive dependency, add a resolution in the root `package.json` and ensure all upstreams are compatible.
- **Workarounds**: Apply `Object.freeze(Object.prototype)` early in startup (may break other libraries). Use the runtime-only build to reduce attack surface.
- **References**: https://github.com/Gisat/deck.gl-geotiff/security/dependabot/202

### Alert #200 — `picomatch` (Method Injection in POSIX Character Classes)

- **CVE**: Method Injection in POSIX Character Classes causes incorrect Glob Matching
- **Dependency chain**: `@semantic-release/npm@13.1.5`, `semantic-release@25.0.3`, `typescript-eslint@8.56.1` → `picomatch@4.0.3`
- **Affected versions**: >= 4.0.0, < 4.0.4
- **Fixed in**: 4.0.4
- **Risk**: Specially crafted POSIX bracket expressions (e.g., `[[:constructor:]]`) can reference inherited method names, leading to incorrect glob matching. This can cause security-relevant logic errors in applications relying on glob patterns for filtering, validation, or access control. No remote code execution, but integrity impact.
- **Recommended solution**: Upgrade `picomatch` to version 4.0.4 or later. As this is a transitive dependency, add a resolution in the root `package.json` and ensure all upstreams are compatible.
- **Workarounds**: Avoid passing untrusted glob patterns or POSIX bracket expressions to picomatch if upgrade is not immediately possible.
- **References**: https://github.com/micromatch/picomatch/issues/144, https://github.com/micromatch/picomatch

### Alert #198 — `picomatch` (Method Injection in POSIX Character Classes)

- **CVE**: Method Injection in POSIX Character Classes causes incorrect Glob Matching
- **Dependency chain**: `@semantic-release/git@10.0.1`, `semantic-release@25.0.3` → `picomatch@2.3.1`
- **Affected versions**: < 2.3.2
- **Fixed in**: 2.3.2
- **Risk**: Same as alert #200 — method injection via POSIX bracket expressions can cause incorrect glob matching and logic errors. No remote code execution, but integrity impact.
- **Recommended solution**: Upgrade `picomatch` to version 2.3.2 or later. Add a resolution in the root `package.json` for this version line as well.
- **Workarounds**: Same as above — avoid untrusted glob patterns or POSIX bracket expressions if upgrade is not possible.
- **References**: https://github.com/micromatch/picomatch/issues/144, https://github.com/micromatch/picomatch

### Alert #196 — `flatted` (Prototype Pollution)

- **CVE**: Prototype Pollution via parse() in NodeJS flatted
- **Dependency chain**: `eslint@9.39.3` → `flatted@3.4.1`
- **Affected versions**: <= 3.4.1
- **Fixed in**: 3.4.2
- **Risk**: Prototype pollution via attacker-controlled string in `parse()`. Can pollute global prototype chain, potentially causing denial of service or code execution.
- **Recommended solution**: Upgrade `flatted` to version 3.4.2 or later. This is a transitive dependency, so ensure all upstreams (e.g., eslint) are compatible.
- **Replication steps**: See https://github.com/Gisat/deck.gl-geotiff/security/dependabot/196 for proof-of-concept and technical details.

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

### Alert #188 — `@tootallnate/once` (Incorrect Control Flow Scoping)

- **CVE**: Incorrect Control Flow Scoping in promise resolving when AbortSignal option is used
- **Dependency chain**: `make-fetch-happen` → `http-proxy-agent@5.0.0` → `@tootallnate/once@2.0.0`
- **Affected versions**: < 3.0.1
- **Fixed in**: 3.0.1
- **Risk**: When AbortSignal is used, a promise may remain pending after abort, causing hangs and degraded availability. This can lead to stalled requests or blocked workers. In this repo, the risk is low as the affected code is only used in npm tooling, not production runtime.
- **Recommended solution**: Upgrade `@tootallnate/once` to 3.0.1 or later. Add a resolution in the root `package.json` if possible, but note that upstream compatibility may block this.
- **References**: https://github.com/Gisat/deck.gl-geotiff/security/dependabot/188

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
