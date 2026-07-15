---
name: popopo-asset-bundle-research
description: Research Popopo Unity AssetBundles from authorized Android APKs. Use when Codex needs to pull Popopo split APKs with ADB, reconstruct an IL2CPP build with Cpp2IL, identify and verify the AssetBundle AES key, document the bundle modifier, or validate and decrypt downloaded Windows, macOS, Linux, Android, and iOS bundles on Windows, macOS, or Linux.
---

# Popopo AssetBundle Research

Use this skill for authorized local APK and AssetBundle format research. Use `$popopo-cli` for ordinary account, store, and live-space operations.

## Workflow

1. Capture the package version, ABI, APK split list, and hashes before analysis.
2. Read [references/workflow.md](./references/workflow.md) for the cross-platform ADB, Cpp2IL, key recovery, and decryption procedure.
3. Use [scripts/find-asset-bundle-key.ts](./scripts/find-asset-bundle-key.ts) to verify 32-byte field-RVA candidates against an encrypted bundle.
4. Run `popopo skins decrypt-store --verify-only` before bulk decryption.
5. Treat the key, Unity version, encryption assembly, and modifier algorithm as versioned observations after every app update.

## Research Rules

- Analyze only APKs and assets the user is authorized to access.
- Preserve package/version provenance and SHA-256 hashes so findings are reproducible.
- Do not hardcode or commit a recovered key into this repository; supply it to the CLI through `--key-file` or `POPOPO_ASSET_BUNDLE_KEY`.
- Decrypt into a directory outside the downloaded source dataset and use `--include-plain` when a complete five-platform output is required.
