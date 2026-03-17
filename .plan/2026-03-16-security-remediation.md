# Security Remediation Instructions

This document outlines the best-practice "Clean Fix" approach to resolve vulnerabilities in `fast-xml-parser`, `tar`, and `serialize-javascript`.

## 1. Implementation Steps

### 1.1 Update Direct Dependency for `serialize-javascript`
The vulnerability in `serialize-javascript` is introduced via `@rollup/plugin-terser`. Upgrading this plugin to its latest major version is the cleanest fix.

1. Open `geoimage/package.json`.
2. Change `"@rollup/plugin-terser": "^0.4.4"` to `"@rollup/plugin-terser": "^1.0.0"`.

### 1.2 Update Transitive Dependencies in Lockfile

#### `fast-xml-parser`
The vulnerability can be resolved purely by updating the lockfile, as the required secure version (`>=4.5.4`) is within the semver range already allowed by its parent package. Run in the project root:

```bash
# Updates fast-xml-parser to >=4.5.4 in yarn.lock
yarn up fast-xml-parser
```

#### `tar`
`yarn up tar` alone is insufficient because `tar` is a deep transitive dependency of `node-gyp`, which pins it to an older semver range. A Yarn `resolutions` override is required to force the secure version across the entire dependency tree.

1. Open the root `package.json`.
2. Add (or update) the `resolutions` block:

```json
"resolutions": {
  "tar": "^7.5.11"
}
```

3. Run `yarn install` to apply the override and update the lockfile.

### 1.3 Final Workspace Synchronization
Ensure all workspace dependencies are correctly linked and synchronized:

```bash
yarn install
```

## 2. Verification Steps

### 2.1 Verify Resolved Versions
Confirm that the lockfile reflects the secure versions:

```bash
yarn why fast-xml-parser
yarn why tar
yarn why serialize-javascript
```

### 2.2 Validate Library Integrity
Ensure the changes do not impact the build or the example application:

```bash
yarn build
yarn example
```
