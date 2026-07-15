---
name: popopo-asset-bundle-research
description: Inspect Popopo Unity AssetBundle compatibility using an app build from the user's own device or a developer-provided APK. Use when Codex needs to document the bundle format, reproduce client-side loading behavior with Cpp2IL, verify the key material used by a local build, or validate locally accessible Windows, macOS, Linux, Android, and iOS bundles on Windows, macOS, or Linux.
---

# Popopo AssetBundle Research

Use this skill for local interoperability, backup validation, and format compatibility work on an
app copy the user is entitled to use. Use `$popopo-cli` for ordinary account, store, and live-space
operations.

## Workflow

1. Capture the package version, ABI, APK split list, and hashes before analysis.
2. Read [references/workflow.md](./references/workflow.md) for the cross-platform ADB, Cpp2IL, bundle-key verification, and local validation procedure.
3. Use [scripts/find-asset-bundle-key.ts](./scripts/find-asset-bundle-key.ts) to verify 32-byte field-RVA candidates against a locally accessible bundle.
4. Run `popopo skins decrypt-store --verify-only` before bulk decryption.
5. Treat the key, Unity version, encryption assembly, and modifier algorithm as versioned observations after every app update.

## Research Rules

- Use only an APK from the user's own installed copy or one supplied for inspection.
- Retrieve store data through the normal client APIs and existing access controls; do not bypass authentication or entitlements.
- Do not redistribute extracted APKs, key material, or third-party assets.
- Preserve package/version provenance and SHA-256 hashes so findings are reproducible.
- Do not hardcode or commit app-specific key material into this repository; supply it to the CLI through `--key-file` or `POPOPO_ASSET_BUNDLE_KEY`.
- Decrypt into a directory outside the downloaded source dataset and use `--include-plain` when a complete five-platform output is required.
