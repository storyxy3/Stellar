# PjskBundle2Parts

Offline converter for Project SEKAI body/head Unity bundles.

## Output

For one body bundle and one head bundle, the converter now writes a lean runtime package by default:

- `character/character.vrm`
- `character/textures/**`
- `pjsk-sekai-runtime.extension.json`
- `motion/body_motion.glb`, when `--motion` is provided

Intermediate/debug outputs are pruned by default. Use `--keep-intermediate` to retain the older full export set:

- `body/body.glb`
- `head/head.glb`
- `character/character.glb`
- `character/character.springbone.glb`
- `character/character.vrm-core.glb`
- `character/character.vrm-candidate.glb`
- `sekai-vrm-profile.json`
- `body.springbone.json`, `head.springbone.json`, and `springbone.json`
- VRM/VRMC extension JSON and resolve reports
- manifest templates, bundle inventories, and conversion plan JSON

## Usage

```bash
./scripts/dotnet.sh run --project /home/storyxy3/PjskBundle2Parts/PjskBundle2Parts.csproj -- \
  --body /mnt/z/pjskdata/AssetBundles/live_pv/model/characterv2/body/05/0001 \
  --head /mnt/z/pjskdata/AssetBundles/live_pv/model/characterv2/face/05/0001.bundle \
  --out /tmp/pjskbundle2parts-sample
```

Add `--keep-intermediate` only when debugging converter output.

The project is pinned to the user-local .NET SDK in `global.json`:

```bash
./scripts/dotnet.sh build
```

Use `./scripts/dotnet.sh` instead of the system `dotnet`; `/usr/bin/dotnet` may resolve to an older SDK.
The wrapper also redirects build intermediates to `/tmp/pjskbundle2parts-obj` and outputs to `/tmp/pjskbundle2parts-bin`, avoiding stale `bin/obj` permission issues in the repo checkout.

## Resolved Root Cause: Texture Explosion

The major render failure on May 23, 2026 was a texture-orientation bug in the converter chain, not a UV or bind-pose bug.

What happened:

- `AssetStudio`'s `ModelConverter` exports textures with `ConvertToStream(imageFormat, true)`.
- In `AssetStudioUtility/Texture2DExtensions.cs`, `flip=true` performs `Flip(FlipMode.Vertical)`.
- That means the PNG bytes produced by `ModelConverter` are vertically flipped before our viewer ever sees them.
- Viewer-side manifest binding then looked catastrophically wrong even though the exported mesh UVs, indices, and skinning were internally consistent.

What this converter now does:

- `Services/AssetStudioImportedModelFactory.cs` normalizes every `ImportedTexture` by flipping it back vertically after `ModelConverter` finishes.
- `Services/GltfEmitter.cs` exports explicit inverse bind matrices and uses non-strided vertex buffers.

Practical rule:

- If textures look exploded again, first verify that the viewer is loading a freshly regenerated converter output folder and not stale blob URLs from an older export.

## VRM Migration Staging

The converter now emits `character/character.vrm` as the lean runtime character container. It is a VRM 1.0-style GLB container with extra PJSK runtime semantics.

Current strategy:

- Standard VRM/MToon gets an approximate fallback: C texture as base color, S texture as shade, humanoid bones mapped from PJSK bone names.
- Exact PJSK rendering stays in custom metadata: C/S/H texture roles, face SDF texture role, material kinds, body/head assembly, morph hash bindings, and raw spring bone metadata.
- Generic VRM viewers should display an approximate model. This viewer should read the custom profile and restore the PJSK shader path.

## Spring Bone JSON

The converter exports raw Spring Bone data from MonoBehaviour payloads before any VRM mapping:

- `body.springbone.json`: SpringManager, manager-referenced spring bones, and body colliders from the body bundle.
- `head.springbone.json`: SpringManager and manager-referenced spring bones from the head bundle.
- `springbone.json`: combined body/head payload.

Important extraction rule:

- `SpringManager.springBones` references are authoritative.
- PJSK spring bone components may use script names like `SekaiSpringBone`, so the exporter does not depend on the script name being exactly `SpringBone`.
- Raw typetree fields are preserved under `Raw`; parsed fields like `PivotNode`, `Radius`, `StiffnessForce`, and `DragForce` are duplicated at top level for later VRM springBone mapping.

## VRM Spring Bone Candidate

The converter also writes `vrm-springbone.candidate.json`. This is not a final `VRMC_springBone` extension yet because final glTF node indices are not assigned at this stage. It mirrors the VRM 1.0 spring bone layout while preserving PJSK source names and PathIDs:

- `vrmExtensionDraft.colliders`: sphere/capsule colliders with `nodeName`, `nodePath`, and `sourcePathId`.
- `vrmExtensionDraft.colliderGroups`: collider sets referenced by spring joints.
- `vrmExtensionDraft.springs`: path-derived spring chains with joints and normalized spring parameters.
- `normalization`: documents the temporary mapping from PJSK raw values to VRM-like fields.

Current approximation rules:

- `Radius` -> `hitRadius`.
- `StiffnessForce` -> `stiffness = clamp(raw / 300, 0, 4)`.
- `DragForce` -> `dragForce = clamp(raw, 0, 1)`.
- `SpringForce` -> `gravityPower` and `gravityDir`; zero force falls back to `[0, -1, 0]`.
- `SpringCapsuleCollider.height` -> capsule `tail = [height, 0, 0]`, matching the sssekai Blender plugin's local-X capsule construction.

## Embedded VRMC Spring Bone

The converter resolves `vrm-springbone.candidate.json` against `character/character.glb` and writes:

- `vrmc-springbone.extension.json`: root-level `VRMC_springBone` payload with real glTF node indices.
- `vrmc-springbone.resolve-report.json`: source path resolution report.
- `character/character.springbone.glb`: copy of `character.glb` with `extensionsUsed += ["VRMC_springBone"]` and root `extensions.VRMC_springBone` injected.

Current limitation:

- The character GLB exports the active `body` root and `face` root. Raw `sit_body` spring data is intentionally skipped and reported as `current_character_glb_exports_body_root_not_sit_body`.
- Head spring paths are resolved by suffix because the head root is attached under the body neck in `character.glb`.

## Embedded VRMC VRM Core

The converter now resolves the humanoid map from `sekai-vrm-profile.json` against `character/character.springbone.glb` and writes:

- `vrmc-vrm.extension.json`: root-level `VRMC_vrm` payload with meta, humanoid, firstPerson, lookAt, and empty expression presets.
- `vrmc-vrm.resolve-report.json`: humanoid bone resolution report.
- `character/character.vrm-candidate.glb`: intermediate copy of `character.springbone.glb` with `extensionsUsed += ["VRMC_vrm"]` and root `extensions.VRMC_vrm` injected.
- `character/character.vrm`: final lean copy of the candidate container.

Current semantics:

- Humanoid node indices are resolved from the active body skeleton, not the attached face skeleton.
- Duplicate body/head names like `Hip`, `Spine`, `Chest`, `Neck`, and `Head` are disambiguated by preferring `body/Position/PositionOffset/Hip...` paths that do not pass through `/face/`.
- Expressions are intentionally empty placeholders. Exact PJSK face animation still uses exported morph hash/channel metadata and should later be mapped to VRM expressions or VRMA separately.
- This is a VRM container, but exact PJSK rendering still needs custom material/runtime extras.

## Embedded PJSK Runtime Extension

The final `character/character.vrm` now includes a custom root extension named `PJSK_sekai_runtime`.

Output files:

- `pjsk-sekai-runtime.extension.json`: the same payload injected into the GLB.
- `pjsk-sekai-runtime.resolve-report.json`: material/texture/morph statistics and missing-role checks.
- `character/character.vrm-core.glb`: intermediate GLB with `VRMC_springBone` and `VRMC_vrm`.
- `character/character.vrm`: final VRM container with `VRMC_springBone`, `VRMC_vrm`, and `PJSK_sekai_runtime`.

The custom extension preserves exact viewer semantics that standard VRM cannot represent by itself:

- C/S/H texture roles and face SDF role.
- Body/head assembly metadata.
- Body/head manifests after texture path rewrite.
- Character-level texture map relative to the output root.
- Material kinds, render order, shader pipeline names, and lighting profile.
- Morph hash/channel bindings for PJSK face motion.
- SpringBone source metadata pointing back to raw/candidate/VRMC outputs.

Generic VRM viewers may ignore this extension. The WebGL viewer should read it to recover the exact PJSK shader path.

## Viewer Runtime Import

The WebGL viewer can now consume the converter folder in two modes:

- Preferred: if `pjsk-sekai-runtime.extension.json` and `character/character.vrm` are present, the viewer loads the single combined VRM/GLB container and reads `PJSK_sekai_runtime` semantics from the exported JSON payload.
- Fallback: if the runtime extension is absent, the viewer still uses the older split `body/body.glb` + `head/head.glb` + body/head manifests flow.

In runtime mode the viewer:

- Builds body/head manifests from `PJSK_sekai_runtime.bodyManifest` and `.headManifest`.
- Uses `PJSK_sekai_runtime.materialSlots` so texture URIs resolve relative to the combined character GLB.
- Imports the already-stitched character once instead of loading body/head as two separate GLBs.
- Reuses the existing manifest material rebinder and head morph binding path.
