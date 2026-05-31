# PjskBundle2Parts

Offline converter for Project SEKAI character bundles.

The converter reads Unity AssetBundles with AssetStudio and writes a browser-friendly runtime package for `pjsk-webgl-viewer`.

## Quick Start

Use the repository wrapper, not system `dotnet`:

```bash
./scripts/dotnet.sh run -- \
  --character3d-id 5 \
  --master <master-data-directory> \
  --asset-root <assetbundle-root> \
  --out <output-directory>
```

The wrapper uses the SDK pinned by `global.json` and redirects build intermediates away from the checkout.

Direct bundle mode is also available:

```bash
./scripts/dotnet.sh run -- \
  --body /path/to/body.bundle-or-directory \
  --head /path/to/head.bundle \
  --out /path/to/output-directory
```

## Inputs

Preferred input:

- `--character3d-id <id>`
- `--master <master-directory>`
- `--asset-root <AssetBundles-root>`
- `--out <directory>`

The character3d resolver uses master data to pick body, head, hair/head composition, and accessory head data when needed.

Motion input:

- Explicit: `--motion <costume_setting.bundle-or-export-folder>`
- Automatic for character3d mode:
  - `character/motion/costume_setting/<characterId>_00.bundle`
  - `motion/costume_setting/<characterId>_00.bundle`
  - `costume_setting/<characterId>_00.bundle`

An exported motion folder may contain:

- `motion.glb`
- `motion_loop.glb`
- `face_motion.json`
- `light_motion.json`

## Lean Output

By default the converter writes the runtime package and prunes intermediate/debug files:

```text
character/character.vrm
character/textures/**
pjsk-sekai-runtime.extension.json
motion/body_motion.glb                # when motion is resolved
body.springbone.json
head.springbone.json
springbone.json
vrm-springbone.candidate.json
vrmc-springbone.extension.json
vrmc-springbone.resolve-report.json
```

`character/character.vrm` is a VRM-style GLB container with extra PJSK runtime semantics. Generic VRM viewers may show an approximate model, but exact rendering requires `PJSK_sekai_runtime` and the WebGL viewer.

## Debug Output

Use `--keep-intermediate` when debugging converter internals:

```bash
./scripts/dotnet.sh run -- \
  --character3d-id 5 \
  --master <master-data-directory> \
  --asset-root <assetbundle-root> \
  --out <debug-output-directory> \
  --keep-intermediate
```

This keeps older full export artifacts such as:

- split `body/body.glb` and `head/head.glb`
- intermediate character GLBs
- VRM/VRMC extension JSONs
- manifest templates
- bundle inventories
- conversion plan JSON
- resolve reports

## Runtime Extension

The final package contains `PJSK_sekai_runtime`, written both into `character/character.vrm` and as `pjsk-sekai-runtime.extension.json`.

It preserves PJSK-specific data that standard VRM cannot represent cleanly:

- C/S/H texture roles
- face SDF texture role
- material kinds and render order
- body/head assembly metadata
- body/head manifests after texture path rewrite
- character texture map relative to output root
- morph hash/channel bindings
- embedded face and light motion
- raw SpringBone metadata
- VRM SpringBone candidate data

## SpringBone State

The converter exports SpringBone metadata, but the current viewer disables UTJ runtime simulation by default.

Important SpringBone facts:

- `SpringManager.springBones` references are authoritative.
- PJSK SpringBone components may be named `SekaiSpringBone`.
- `SekaiSpringBone.colliderFlag` is required to reproduce runtime body-collider binding.
- `ModelUtility.SpringBoneSetup` appends body colliders by `CL_*` name prefixes at runtime.
- Raw, candidate, and VRMC springbone files are retained for reverse-engineering and future runtime work.

## Build

```bash
./scripts/dotnet.sh build
```

If textures look wrong after converter changes, regenerate the output folder and re-import the whole folder in the viewer. Browser blob URLs can otherwise keep stale files alive.
