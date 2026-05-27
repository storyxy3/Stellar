# PJSK WebGL Viewer

Standalone Project SEKAI character viewer for converter outputs.

## Why this exists

The Blender exploration already established the important boundary:

- body, hair, and accessories can share a toon-lit path
- face must remain a separate shader path
- preview lighting should be external state
- the browser runtime should prefer stable converted packages over raw Unity bundle parsing

This project hardcodes those constraints into a WebGL runtime instead of extending the existing `sekai-viewer` frontend.

## Current scope

- Vite + TypeScript + Three.js standalone app
- converter-folder import for lean `character/character.vrm` packages
- legacy separate import slots for body and head
- switchable assembly modes: stitched, manual, split
- separate material functions for body and face
- GLTF loader path with automatic proxy fallback
- local asset picker entry for converted `.bundle -> .vrm/.glb` outputs
- complete model composition based on `skeletonId`, neck attach node, and head attach origin
- adjustable preview directional light
- runtime import from `PJSK_sekai_runtime` custom metadata
- PJSK springbone runtime from exported raw spring metadata, with VRM springbone fallback
- VRM migration profile debug payload for preserving PJSK-specific runtime semantics

## Expected asset pipeline

Browser code should not parse raw Unity bundles directly.

Target flow:

1. Offline converter reads Unity bundles.
2. Converter exports web-consumable model, skeleton, texture, and animation data.
3. Viewer loads only converted outputs.

VRM is treated as a transport/container upgrade, not as a shader replacement. Standard VRM/MToon is the compatibility fallback; exact PJSK rendering depends on custom extras carrying the same C/S/H, face SDF, material-kind, morph-binding, springbone, and assembly metadata used by this viewer.

The type definitions in `src/data/sampleScene.ts` show the intended runtime boundary:

- body asset manifest
- head asset manifest
- skeleton compatibility metadata
- assembly state
- animation URLs owned by the body import side

## Resolved Issue: Texture Explosion

The May 23, 2026 render failure was not caused by GLB skinning or viewer-side material slot matching.

Root cause:

- `AssetStudio`'s `ModelConverter` exports textures through `ConvertToStream(imageFormat, true)`.
- That `true` performs a vertical flip during PNG export.
- The viewer then received texture files that were already upside down, so manifest-bound textures looked exploded even when UVs, indices, and bind poses were correct.

Final fix:

- `PjskBundle2Parts` now normalizes every `ImportedTexture` back to glTF-facing orientation in `Services/AssetStudioImportedModelFactory.cs`.
- The viewer still loads manifest textures with `flipY = false`, which is correct for glTF UV conventions.
- When testing a new converter build, re-import the whole converter output folder so the browser gets fresh blob URLs.

## Development

```bash
npm install
npm run dev
```

## Current Gaps

1. Implement a browser equivalent of `SekaiBoneBasisDriver` for closer face SDF parity.
2. Map PJSK face motion to portable VRM expressions or VRMA if external VRM tools need animation.
3. Keep shader/material tuning aligned with current converter output instead of old split GLB samples.
