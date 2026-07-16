# Popopo AssetBundle Compatibility Workflow

Commands are portable across Windows, macOS, and Linux; only executable suffixes and
package-manager installation steps differ. Use an APK from the user's own installed copy or one
provided for compatibility inspection. This workflow does not grant access to private or
otherwise unavailable store content.

## 1. Capture provenance and export the local app installation

Record the package name, version name/code, device ABI, and SHA-256 hashes. Discover every
installed split rather than assuming there is one APK:

```bash
adb devices
adb shell dumpsys package com.popopo.popopo
adb shell pm path com.popopo.popopo
adb pull /data/app/.../base.apk apk/base.apk
adb pull /data/app/.../split_config.arm64_v8a.apk apk/split_config.arm64_v8a.apk
```

Run one `adb pull` for every path returned by `pm path`. Extract with `apktool d`, `7zz x`, or
another ZIP-capable tool. The IL2CPP pair is normally:

- `assets/bin/Data/Managed/Metadata/global-metadata.dat` from the base APK
- `lib/arm64-v8a/libil2cpp.so` from the matching ABI split

## 2. Produce readable IL2CPP output

Use a cross-platform Cpp2IL release and supply the binary, metadata, and detected Unity version
explicitly. Determine the version from the captured build instead of carrying an old value forward.

```bash
Cpp2IL --force-binary-path apk/libil2cpp.so \
  --force-metadata-path apk/global-metadata.dat \
  --force-unity-version <unity-version> \
  --output-as diffable-cs \
  --output-to analysis/cpp2il-cs
```

Useful landmarks are the `AssetBundleCrypt` assembly, `Encryption.CreateStream`,
`SeekableAesStream`, and `Field RVA Decoded` data in `_PrivateImplementationDetails_`. Current
builds use a 32-byte AES key and may store it as a 33-byte null-terminated blob, but always verify
a candidate against a downloaded encrypted bundle.

## 3. Identify and verify the bundle key used by the local build

Run the bundled helper from the repository root. It scans Cpp2IL field-RVA blobs, tests only
32-byte candidates (or 33 bytes ending in NUL), requires a unique candidate that decodes the
sample to a structurally valid `UnityFS` header, and writes the verified raw key bytes to the
selected output file.

```bash
bun skills/popopo-asset-bundle-research/scripts/find-asset-bundle-key.ts \
  --cpp2il-output analysis/cpp2il-cs \
  --sample extracted/store/items/<item-id>/asset-bundle/android/main \
  --output /path/to/popopo-asset-bundle.key
```

Do not add app-specific key material or its encoded representations to source control.

## 4. Validate locally accessible bundles

Obtain bundle locations and content through the normal client APIs and existing authentication.
The commands below only transform local files; they do not change server access or entitlements.

```bash
popopo skins decrypt-store \
  --input-dir extracted/store \
  --key-file /path/to/popopo-asset-bundle.key \
  --verify-only \
  --platform all

popopo skins decrypt-store \
  --input-dir extracted/store \
  --output-dir extracted/store-decrypted \
  --key-file /path/to/popopo-asset-bundle.key \
  --platform all \
  --include-plain
```

The format is a seekable AES-256 transform: AES-ECB encrypts 16-byte counter blocks, then the
result is XORed with AssetBundle bytes. Counters start at 1, encode the block number as unsigned
big-endian in the first eight bytes, and leave the remaining eight bytes zero. The CLI implements
streaming conversion and validates the `UnityFS` signature plus the declared file size.

## Revalidation after an app update

Treat the key, Unity version, encryption assembly, and algorithm as versioned observations. Export
the new split APKs, hash them, regenerate Cpp2IL output, verify the current key file, and run
`--verify-only` over representative bundles before bulk decryption.
