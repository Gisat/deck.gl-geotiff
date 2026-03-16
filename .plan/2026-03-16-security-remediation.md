# Security Remediation Instructions

This document outlines the best-practice "Clean Fix" approach to resolve vulnerabilities in `fast-xml-parser`, `tar`, and `serialize-javascript`.

## 1. Implementation Steps

### 1.1 Update Direct Dependency for `serialize-javascript`
The vulnerability in `serialize-javascript` is introduced via `@rollup/plugin-terser`. Upgrading this plugin to its latest major version is the cleanest fix.

1. Open `geoimage/package.json`.
2. Change `"@rollup/plugin-terser": "^0.4.4"` to `"@rollup/plugin-terser": "^1.0.0"`.

### 1.2 Update Transitive Dependencies in Lockfile
The vulnerabilities in `fast-xml-parser` and `tar` can be resolved by updating the lockfile, as the required secure versions are within the semver ranges already allowed by their parent packages.

Run the following commands in the project root:

```bash
# Updates fast-xml-parser to >=4.5.4 in yarn.lock
yarn up fast-xml-parser

# Updates tar to >=7.5.11 in yarn.lock
yarn up tar
```

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
