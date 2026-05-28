import * as THREE from "three";
import type { VRM, VRMSpringBoneManager } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BodyAssetManifest,
  CharacterAssemblyState,
  HeadAssetManifest,
  MaterialLightingSettings,
  PreviewLightState,
} from "../data/sampleScene";
import {
  createSekaiBodyMaterial,
  updateSekaiBodyCamera,
  updateSekaiBodyMaterial,
} from "../materials/sekaiBodyMaterial";
import {
  createSekaiFaceMaterial,
  updateSekaiFaceBasis,
  updateSekaiFaceMaterial,
} from "../materials/sekaiFaceMaterial";
import {
  createSekaiLayerMaterial,
  type SekaiLayerAtlas,
} from "../materials/sekaiLayerMaterial";
import { loadGltfAnimations, loadGltfPart } from "./loadGltfPart";

export type PartImportMode = "glb" | "proxy";
export type CompositionMode =
  | "separate_parts"
  | "node_attached"
  | "bone_linked"
  | "combined_glb";

export type PartImportStatus = {
  assetId: string;
  displayName: string;
  sourceMode: PartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  error?: string;
};

export type CompositionStatus = {
  mode: CompositionMode;
  linkedBoneCount: number;
  missingBodyBones: string[];
  missingHeadBones: string[];
  usingFallbackAttach: boolean;
};

export type MaterialBindingMode = "manifest" | "glb";

export type BodyAnimationSelection = {
  motionUrl: string | null;
  loopUrl: string | null;
};

export type RuntimeMaterialDebug = {
  meshName: string;
  sourceMaterialName: string;
  resolvedKey: string | null;
  resolvedKind: string | null;
  usedOriginalMap: boolean;
  boundMainTex: string | null;
  boundShadowTex: string | null;
  boundValueTex: string | null;
  boundFaceShadowTex: string | null;
  finalMaterialType: string;
  shaderHasMainTex?: number | null;
  shaderHasShadowTex?: number | null;
  shaderHasFaceShadowTex?: number | null;
  shaderHasValueTex?: number | null;
  shaderLightDirectionX?: number | null;
  shaderLightDirectionY?: number | null;
  shaderLightDirectionZ?: number | null;
  shaderShadowThreshold?: number | null;
  shaderShadowWeight?: number | null;
  shaderSpecularPower?: number | null;
  shaderRimThreshold?: number | null;
  shaderControllerRimThreshold?: number | null;
  shaderRimIntensity?: number | null;
  shaderRimDirectionality?: number | null;
  shaderCharacterAmbient?: number | null;
  shaderShadowTexWeight?: number | null;
  shaderSaturation?: number | null;
  shaderSkinTintEnabled?: number | null;
  shaderSkinColorDefault?: string | null;
  shaderSkinColor1?: string | null;
  shaderFaceSoftness?: number | null;
  shaderAtlasTileX?: number | null;
  shaderAtlasTileY?: number | null;
  shaderAtlasSample?: number | null;
  shaderUseAtlas?: number | null;
  renderOrder?: number;
};

export type RuntimeHeadMorphDebug = {
  meshName: string;
  morphTargetCount: number;
  mappedChannelCount: number;
  sampleChannels: string[];
};

export type RuntimeDebugSnapshot = {
  materialBindingMode: MaterialBindingMode;
  body: RuntimeMaterialDebug[];
  head: RuntimeMaterialDebug[];
  headMorphs: RuntimeHeadMorphDebug[];
};

export type SpringBoneRuntimeSnapshot = {
  present: boolean;
  bodyManagerCount: number;
  bodySpringBoneCount: number;
  bodyExtraBoneCount: number;
  bodySphereColliderCount: number;
  bodyCapsuleColliderCount: number;
  bodyPanelColliderCount: number;
  headManagerCount: number;
  headSpringBoneCount: number;
  headExtraBoneCount: number;
  headSphereColliderCount: number;
  headCapsuleColliderCount: number;
  headPanelColliderCount: number;
  characterHairPresent: boolean;
  characterEyePresent: boolean;
  vrmSpringBoneManagerPresent: boolean;
  source: "PJSK_sekai_runtime" | "none";
};

export type RuntimeCombinedCharacterAsset = {
  id: string;
  displayName: string;
  meshUrl: string;
  bodyAsset: BodyAssetManifest;
  headAsset: HeadAssetManifest;
  runtimeExtension?: unknown;
};

export type AnimationPlaybackSnapshot = {
  selectedUrl: string | null;
  selectedLoopUrl: string | null;
  activeClipName: string | null;
  queuedLoopClipName: string | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  speed: number;
  faceMotionEnabled: boolean;
  bodyHeadTracksEnabled: boolean;
  bodyTrackDebug: AnimationTrackDebug | null;
  bodyLoopTrackDebug: AnimationTrackDebug | null;
  error: string | null;
};

export type AnimationTrackDebug = {
  trackCount: number;
  transformTrackCount: number;
  hairTrackCount: number;
  headTrackCount: number;
  neckTrackCount: number;
  upperBodyTrackCount: number;
  sampleHairTracks: string[];
  sampleHeadTracks: string[];
};

export type FaceMotionKeyframe = {
  time: number;
  value: number;
};

export type FaceMotionCurve = {
  curveHash: number;
  keyframes: FaceMotionKeyframe[];
};

export type FaceMotionClip = {
  name: string;
  sampleRate: number;
  duration: number;
  curves: FaceMotionCurve[];
};

export type FaceMotionSet = {
  bundlePath?: string;
  clips: FaceMotionClip[];
};

export type FaceMotionPlaybackSnapshot = {
  activeClipName: string | null;
  queuedLoopClipName: string | null;
  error: string | null;
  currentTime: number;
  mappedMeshCount: number;
  mappedCurveCount: number;
};

export type PartImportSnapshot = {
  revision: number;
  body: PartImportStatus;
  head: PartImportStatus;
  composition: CompositionStatus;
};

type LoadedPartResult = {
  root: THREE.Group | null;
  sourceMode: PartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  error?: string;
  userData?: Record<string, unknown>;
  vrm?: VRM | null;
  springBoneManager?: VRMSpringBoneManager | null;
};

type BoneLink = {
  bodyBone: THREE.Bone;
  headBone: THREE.Bone;
  bodyName: string;
  headName: string;
};

type HeadMorphRuntime = {
  mesh: THREE.Mesh;
  curveIndexByHash: Map<number, number>;
  controlledIndices: number[];
};

type CharacterEyeMaterialController = {
  lightInfluence: number | null;
  lightInfluenceForEyeHighlight: number | null;
  tintColor: string | null;
  emissionColor: string | null;
  baseTiling: SekaiLayerAtlas | null;
  highlightTiling: SekaiLayerAtlas | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeSpringBonePart(value: unknown) {
  const part = asRecord(value);
  return {
    managers: countArray(part.managers ?? part.Managers),
    bones: countArray(part.bones ?? part.Bones),
    extraBones: countArray(part.extraBones ?? part.ExtraBones),
    sphereColliders: countArray(part.sphereColliders ?? part.SphereColliders),
    capsuleColliders: countArray(part.capsuleColliders ?? part.CapsuleColliders),
    panelColliders: countArray(part.panelColliders ?? part.PanelColliders),
    characterHairPresent: Boolean(part.characterHair ?? part.CharacterHair),
    characterEyePresent: Boolean(part.characterEye ?? part.CharacterEye),
  };
}

function summarizeSpringBoneMetadata(
  runtimeExtension: unknown,
  vrmSpringBoneManagerPresent: boolean
): SpringBoneRuntimeSnapshot {
  const extension = asRecord(runtimeExtension);
  const payload = asRecord(extension.pjskSpringBone ?? extension.PjskSpringBone);
  const raw = asRecord(payload.raw ?? payload.Raw);
  const body = summarizeSpringBonePart(raw.body ?? raw.Body);
  const head = summarizeSpringBonePart(raw.head ?? raw.Head);
  const present = Boolean(raw.body ?? raw.Body ?? raw.head ?? raw.Head);
  return {
    present,
    bodyManagerCount: body.managers,
    bodySpringBoneCount: body.bones,
    bodyExtraBoneCount: body.extraBones,
    bodySphereColliderCount: body.sphereColliders,
    bodyCapsuleColliderCount: body.capsuleColliders,
    bodyPanelColliderCount: body.panelColliders,
    headManagerCount: head.managers,
    headSpringBoneCount: head.bones,
    headExtraBoneCount: head.extraBones,
    headSphereColliderCount: head.sphereColliders,
    headCapsuleColliderCount: head.capsuleColliders,
    headPanelColliderCount: head.panelColliders,
    characterHairPresent: head.characterHairPresent,
    characterEyePresent: head.characterEyePresent,
    vrmSpringBoneManagerPresent,
    source: present ? "PJSK_sekai_runtime" : "none",
  };
}

function disposeObjectGeometry(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.pjskOutlineShell) {
      mesh.geometry.dispose();
    }
  });
}

function disposeMaterial(
  material: THREE.Material | THREE.Material[],
  disposeTextures = true
) {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (disposeTextures) {
      for (const value of Object.values(item as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
    }
    item.dispose();
  }
}

function disposeReplacedMaterials(
  originalMaterials: THREE.Material[],
  reboundMaterials: THREE.Material[]
) {
  const preserved = new Set(reboundMaterials);
  for (const original of originalMaterials) {
    if (!preserved.has(original)) {
      disposeMaterial(original, false);
    }
  }
}

function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    disposeObjectGeometry(child);
    group.remove(child);
  }
}

function createOpaqueTexturedMaterial(texture: THREE.Texture | null) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    side: THREE.DoubleSide,
    color: "#ffffff",
  });
}

function getVertexColorRedMax(geometry: THREE.BufferGeometry) {
  const color = geometry.getAttribute("color");
  if (!color) {
    return null;
  }

  let max = 0;
  for (let index = 0; index < color.count; index += 1) {
    max = Math.max(max, color.getX(index));
    if (max > 0.01) {
      return max;
    }
  }
  return max;
}

function createSekaiOutlineMaterial(
  useVertexColor: boolean,
  lighting?: MaterialLightingSettings
) {
  const sourceOutlineWidth = lighting?.outlineWidth && lighting.outlineWidth > 0
    ? lighting.outlineWidth
    : 0.001;
  const outlineLightness = THREE.MathUtils.clamp(lighting?.outlineLightness ?? 0.42, 0.22, 0.62);
  const outlineColor = new THREE.Color().setHSL(0.0, 0.03, outlineLightness * 0.42);
  const material = new THREE.MeshBasicMaterial({
    color: outlineColor,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    vertexColors: useVertexColor,
  });
  material.name = "pjsk_shell_outline";
  material.userData.pjskBaseOutlineColor = `#${outlineColor.getHexString()}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidthNear = { value: sourceOutlineWidth * 0.34 };
    shader.uniforms.uOutlineWidthFar = { value: sourceOutlineWidth * 0.88 };
    shader.uniforms.uOutlineDistanceNear = { value: 1.4 };
    shader.uniforms.uOutlineDistanceFar = { value: 5.0 };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "varying float vOutlineMask;",
        "uniform float uOutlineWidthNear;",
        "uniform float uOutlineWidthFar;",
        "uniform float uOutlineDistanceNear;",
        "uniform float uOutlineDistanceFar;",
      ].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "vec4 outlineViewPosition = modelViewMatrix * vec4(position, 1.0);",
        "float outlineDistance = length(outlineViewPosition.xyz);",
        "float outlineDistanceMix = smoothstep(uOutlineDistanceNear, uOutlineDistanceFar, outlineDistance);",
        "float outlineWidth = mix(uOutlineWidthNear, uOutlineWidthFar, outlineDistanceMix);",
        "#ifdef USE_COLOR",
        "float outlineScale = clamp(color.r, 0.0, 1.0);",
        "vOutlineMask = outlineScale;",
        "#else",
        "float outlineScale = 1.0;",
        "vOutlineMask = 1.0;",
        "#endif",
        "transformed += objectNormal * outlineWidth * outlineScale;",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "varying float vOutlineMask;",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      [
        "#include <clipping_planes_fragment>",
        "if (vOutlineMask <= 0.01) discard;",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "");
  };
  return material;
}

function getSekaiPreviewRimDirection() {
  return new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(135), 0, THREE.MathUtils.degToRad(-90)))
    .normalize();
}

function cloneBodyShaderMaterial(
  source: THREE.ShaderMaterial,
  params: {
    mainTex?: THREE.Texture | null;
    shadowTex?: THREE.Texture | null;
    valueTex?: THREE.Texture | null;
    baseColor?: THREE.ColorRepresentation;
    shadowColor?: THREE.ColorRepresentation;
    lighting?: MaterialLightingSettings;
    skinTintEnabled?: boolean;
  }
) {
  const material = source.clone();
  updateSekaiBodyMaterial(material, {
    baseColor:
      params.baseColor ??
      `#${source.uniforms.uBaseColor.value.getHexString()}`,
    shadowColor:
      params.shadowColor ??
      `#${source.uniforms.uShadowColor.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    valueTex: params.valueTex ?? null,
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    shadowThreshold: source.uniforms.uShadowThreshold.value,
    shadowWeight: source.uniforms.uShadowWeight.value,
    characterAmbientIntensity:
      source.uniforms.uCharacterAmbientIntensity?.value ?? 0.3,
    rimIntensity: source.uniforms.uRimIntensity?.value ?? 0.35,
    controllerRimThreshold:
      source.uniforms.uControllerRimThreshold?.value ?? 0.18,
    rimDirectionality: source.uniforms.uRimDirectionality?.value ?? 0.85,
    rimDirection:
      source.uniforms.uRimDirection?.value.clone() ?? getSekaiPreviewRimDirection(),
    specularPower: params.lighting?.specularPower ?? source.uniforms.uSpecularPower.value,
    rimThreshold: params.lighting?.rimThreshold ?? source.uniforms.uRimThreshold.value,
    shadowTexWeight: params.lighting?.shadowTexWeight ?? source.uniforms.uShadowTexWeight.value,
    shadowWidth:
      params.lighting?.shadowWidth && params.lighting.shadowWidth > 0
        ? params.lighting.shadowWidth
        : source.uniforms.uShadowWidth.value,
    saturation: params.lighting?.saturation ?? source.uniforms.uSaturation.value,
    partsAmbientColor:
      params.lighting?.partsAmbientColor ??
      `#${source.uniforms.uPartsAmbientColor.value.getHexString()}`,
    reflectionBlendColor:
      params.lighting?.reflectionBlendColor ??
      `#${source.uniforms.uReflectionBlendColor.value.getHexString()}`,
    globalShadowColor:
      source.uniforms.uGlobalShadowColor
        ? `#${source.uniforms.uGlobalShadowColor.value.getHexString()}`
        : "#ffffff",
    controllerAmbientColor:
      source.uniforms.uControllerAmbientColor
        ? `#${source.uniforms.uControllerAmbientColor.value.getHexString()}`
        : "#ffffff",
    controllerRimColor:
      source.uniforms.uControllerRimColor
        ? `#${source.uniforms.uControllerRimColor.value.getHexString()}`
        : "#e6edf9",
    controllerShadowRimColor:
      source.uniforms.uControllerShadowRimColor
        ? `#${source.uniforms.uControllerShadowRimColor.value.getHexString()}`
        : "#ffffff",
    controllerRimColorWeight:
      source.uniforms.uControllerRimColorWeight?.value ?? 0,
    controllerShadowRimColorWeight:
      source.uniforms.uControllerShadowRimColorWeight?.value ?? 0,
    controllerRimEdgeSmoothness:
      source.uniforms.uControllerRimEdgeSmoothness?.value ?? 0.38,
    controllerRimShadowSharpness:
      source.uniforms.uControllerRimShadowSharpness?.value ?? 0,
    skinTintEnabled:
      params.skinTintEnabled ??
      ((source.uniforms.uSkinTintEnabled?.value ?? 1.0) > 0.5),
  });
  return material;
}

function cloneFaceShaderMaterial(
  source: THREE.ShaderMaterial,
  params: {
    mainTex?: THREE.Texture | null;
    shadowTex?: THREE.Texture | null;
    faceShadowTex?: THREE.Texture | null;
    baseColor?: THREE.ColorRepresentation;
    warmColor?: THREE.ColorRepresentation;
    skinColorDefault?: THREE.ColorRepresentation;
    skinColor1?: THREE.ColorRepresentation;
    skinColor2?: THREE.ColorRepresentation;
  }
) {
  const material = source.clone();
  updateSekaiFaceMaterial(material, {
    baseColor:
      params.baseColor ??
      `#${source.uniforms.uBaseColor.value.getHexString()}`,
    warmColor:
      params.warmColor ??
      `#${source.uniforms.uWarmColor.value.getHexString()}`,
    skinColorDefault:
      params.skinColorDefault ??
      `#${source.uniforms.uSkinColorDefault.value.getHexString()}`,
    skinColor1:
      params.skinColor1 ??
      `#${source.uniforms.uSkinColor1.value.getHexString()}`,
    skinColor2:
      params.skinColor2 ??
      `#${source.uniforms.uSkinColor2.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    faceShadowTex: params.faceShadowTex ?? null,
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    faceSoftness: source.uniforms.uFaceSoftness.value,
  });
  updateSekaiFaceBasis(
    material,
    source.uniforms.uFaceRight?.value ?? new THREE.Vector3(1, 0, 0),
    source.uniforms.uFaceForward?.value ?? new THREE.Vector3(0, 0, 1)
  );
  return material;
}

function isMorphMesh(node: THREE.Object3D): node is THREE.Mesh {
  const mesh = node as THREE.Mesh;
  return !!mesh.isMesh && Array.isArray(mesh.morphTargetInfluences);
}

function hasSkinnedMeshesUsingSkeleton(root: THREE.Object3D, skeletonRoot: THREE.Object3D) {
  let found = false;
  root.traverse((node) => {
    if (found) {
      return;
    }
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) {
      return;
    }
    found = mesh.skeleton.bones.some((bone) => bone === skeletonRoot);
  });
  return found;
}

function getHeadLayerRenderOrder(kind: string) {
  switch (kind) {
    case "face_sdf":
      return 10;
    case "accessory":
    case "hair":
      return 12;
    case "eyelash":
    case "eyebrow":
      return 20;
    case "eye":
      return 24;
    case "eyelight":
      return 28;
    default:
      return 0;
  }
}

function normalizeMeshSlotName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("face")) {
    return "face";
  }
  if (lower.includes("hair")) {
    return "hair";
  }
  if (lower.includes("acc")) {
    return "acc";
  }
  if (lower.includes("body")) {
    return "body";
  }
  return lower;
}

function tuneShadowTexWeight(kind: string | undefined, weight: number) {
  void kind;
  return weight;
}

function tuneLightingForPreview(
  kind: string | undefined,
  lighting: MaterialLightingSettings | undefined
) {
  return lighting
    ? {
        ...lighting,
        shadowTexWeight: tuneShadowTexWeight(kind, lighting.shadowTexWeight),
      }
    : undefined;
}

function usesSekaiSkinTint(kind: string | undefined) {
  return (kind ?? "body") === "body";
}

function asRuntimeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readRuntimeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRuntimeColor(value: unknown) {
  const record = asRuntimeRecord(value);
  const r = readRuntimeNumber(record.r ?? record.R);
  const g = readRuntimeNumber(record.g ?? record.G);
  const b = readRuntimeNumber(record.b ?? record.B);
  if (r === null || g === null || b === null) {
    return null;
  }
  return `#${new THREE.Color(r, g, b).getHexString()}`;
}

function readRuntimeTiling(value: unknown, enabled = true): SekaiLayerAtlas | null {
  const record = asRuntimeRecord(value);
  const tileX = readRuntimeNumber(record.tileX ?? record.TileX);
  const tileY = readRuntimeNumber(record.tileY ?? record.TileY);
  const sample = readRuntimeNumber(record.sample ?? record.Sample);
  return tileX && tileY && sample !== null
    ? { tileX, tileY, sample, enabled }
    : null;
}

function readCharacterEyeMaterialController(
  runtimeExtension: unknown
): CharacterEyeMaterialController | null {
  const extension = asRuntimeRecord(runtimeExtension);
  const controllers = asRuntimeRecord(
    extension.characterControllers ?? extension.CharacterControllers
  );
  const eye = asRuntimeRecord(controllers.eye ?? controllers.Eye);
  if (!Object.keys(eye).length) {
    return null;
  }
  return {
    lightInfluence: readRuntimeNumber(eye.lightInfluence ?? eye.LightInfluence),
    lightInfluenceForEyeHighlight: readRuntimeNumber(
      eye.lightInfluenceForEyeHighlight ?? eye.LightInfluenceForEyeHighlight
    ),
    tintColor: readRuntimeColor(eye.tintColor ?? eye.TintColor),
    emissionColor: readRuntimeColor(eye.emissionColor ?? eye.EmissionColor),
    // The eye mesh UV already spans the left/right eye atlas. Keep this visible in debug
    // without cropping it again unless we later confirm the exact runtime remap.
    baseTiling: readRuntimeTiling(eye.baseTiling ?? eye.BaseTiling, false),
    highlightTiling: readRuntimeTiling(eye.highlightTiling ?? eye.HighlightTiling, false),
  };
}

function isLoopClipName(name: string | undefined, url: string | null) {
  return /(?:^|[_-])loop$/i.test(name ?? "") ||
    /(?:^|[_-])loop(?:\.glb)?$/i.test(url?.split("/").pop() ?? "");
}

function valuesClose(
  values: ArrayLike<number>,
  stride: number,
  leftIndex: number,
  rightIndex: number,
  epsilon = 1e-4
) {
  const left = leftIndex * stride;
  const right = rightIndex * stride;
  for (let i = 0; i < stride; i += 1) {
    if (Math.abs(values[left + i] - values[right + i]) > epsilon) {
      return false;
    }
  }
  return true;
}

function normalizeQuaternionValue(values: number[], offset: number) {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const length = Math.hypot(x, y, z, w);
  if (length < 1e-8) {
    values[offset] = 0;
    values[offset + 1] = 0;
    values[offset + 2] = 0;
    values[offset + 3] = 1;
    return;
  }
  values[offset] = x / length;
  values[offset + 1] = y / length;
  values[offset + 2] = z / length;
  values[offset + 3] = w / length;
}

function makeQuaternionValuesContinuous(values: number[], stride: number) {
  if (stride !== 4) {
    return;
  }
  for (let offset = stride; offset < values.length; offset += stride) {
    const prev = offset - stride;
    const dot =
      values[prev] * values[offset] +
      values[prev + 1] * values[offset + 1] +
      values[prev + 2] * values[offset + 2] +
      values[prev + 3] * values[offset + 3];
    if (dot < 0) {
      values[offset] *= -1;
      values[offset + 1] *= -1;
      values[offset + 2] *= -1;
      values[offset + 3] *= -1;
    }
  }
}

function smoothSampleComponent(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number
) {
  const span = Math.max(t2 - t1, 1e-6);
  const p = THREE.MathUtils.clamp((t - t1) / span, 0, 1);
  const p2x = p * p;
  const p3x = p2x * p;
  const m1 = (p2 - p0) / Math.max(t2 - t0, 1e-6);
  const m2 = (p3 - p1) / Math.max(t3 - t1, 1e-6);
  const h00 = 2 * p3x - 3 * p2x + 1;
  const h10 = p3x - 2 * p2x + p;
  const h01 = -2 * p3x + 3 * p2x;
  const h11 = p3x - p2x;
  return h00 * p1 + h10 * span * m1 + h01 * p2 + h11 * span * m2;
}

function smoothLoopTrack(
  track: THREE.KeyframeTrack,
  duration: number,
  sampleRate: number
) {
  const isQuaternionTrack = track instanceof THREE.QuaternionKeyframeTrack;
  const isPositionTrack =
    track instanceof THREE.VectorKeyframeTrack &&
    track.name.endsWith(".position");
  if (!isQuaternionTrack && !isPositionTrack) {
    return track.clone();
  }

  const stride = track.getValueSize();
  const sourceTimes = Array.from(track.times);
  const sourceValues = Array.from(track.values);
  let sourceCount = sourceTimes.length;
  if (sourceCount < 3 || duration <= 0) {
    return track.clone();
  }

  if (
    Math.abs(sourceTimes[sourceCount - 1] - duration) < 1e-3 &&
    valuesClose(sourceValues, stride, 0, sourceCount - 1)
  ) {
    sourceCount -= 1;
  }
  if (sourceCount < 3) {
    return track.clone();
  }

  const times = sourceTimes.slice(0, sourceCount);
  const values = sourceValues.slice(0, sourceCount * stride);
  if (isQuaternionTrack) {
    makeQuaternionValuesContinuous(values, stride);
  }

  const sampleCount = Math.max(2, Math.round(duration * sampleRate));
  const targetTimes = new Float32Array(sampleCount + 1);
  const targetValues = new Float32Array((sampleCount + 1) * stride);
  let segment = 0;

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const targetOffset = sample * stride;
    const t = sample === sampleCount ? duration : (duration * sample) / sampleCount;
    targetTimes[sample] = t;
    if (sample === sampleCount) {
      for (let i = 0; i < stride; i += 1) {
        targetValues[targetOffset + i] = targetValues[i];
      }
      continue;
    }

    while (
      segment < sourceCount - 1 &&
      t > times[segment + 1]
    ) {
      segment += 1;
    }

    const i1 = segment;
    const i2 = segment + 1 < sourceCount ? segment + 1 : 0;
    const i0 = (i1 - 1 + sourceCount) % sourceCount;
    const i3 = (i2 + 1) % sourceCount;
    let t0 = times[i0];
    const t1 = times[i1];
    let t2 = times[i2];
    let t3 = times[i3];
    if (i0 >= i1) {
      t0 -= duration;
    }
    if (i2 <= i1) {
      t2 += duration;
    }
    if (i3 <= i1) {
      t3 += duration;
    }

    for (let i = 0; i < stride; i += 1) {
      targetValues[targetOffset + i] = smoothSampleComponent(
        values[i0 * stride + i],
        values[i1 * stride + i],
        values[i2 * stride + i],
        values[i3 * stride + i],
        t0,
        t1,
        t2,
        t3,
        t
      );
    }
    if (isQuaternionTrack) {
      normalizeQuaternionValue(
        targetValues as unknown as number[],
        targetOffset
      );
    }
  }

  return isQuaternionTrack
    ? new THREE.QuaternionKeyframeTrack(track.name, targetTimes, targetValues)
    : new THREE.VectorKeyframeTrack(track.name, targetTimes, targetValues);
}

function shouldSmoothLoopClip(clip: THREE.AnimationClip) {
  const animatedTracks = clip.tracks.filter((track) => track.times.length > 2);
  if (!animatedTracks.length) {
    return false;
  }
  return animatedTracks.some((track) => track.times.length < Math.max(12, clip.duration * 24));
}

function isHeadMotionTrack(track: THREE.KeyframeTrack) {
  return /^(Head|Neck)\.(position|quaternion|scale)$/.test(track.name);
}

function makeAnimationTrackDebug(clip: THREE.AnimationClip | null): AnimationTrackDebug | null {
  if (!clip) {
    return null;
  }
  const hairTracks = clip.tracks.filter((track) => /hair/i.test(track.name));
  const headTracks = clip.tracks.filter((track) => /^Head\./.test(track.name));
  const neckTracks = clip.tracks.filter((track) => /^Neck\./.test(track.name));
  const upperBodyTracks = clip.tracks.filter((track) =>
    /^(Position|Hip|Waist|Spine|Chest|Neck|Head)\./.test(track.name)
  );
  const transformTracks = clip.tracks.filter((track) =>
    /\.(position|quaternion|scale)$/.test(track.name)
  );
  return {
    trackCount: clip.tracks.length,
    transformTrackCount: transformTracks.length,
    hairTrackCount: hairTracks.length,
    headTrackCount: headTracks.length,
    neckTrackCount: neckTracks.length,
    upperBodyTrackCount: upperBodyTracks.length,
    sampleHairTracks: hairTracks.slice(0, 12).map((track) => track.name),
    sampleHeadTracks: [...headTracks, ...neckTracks].slice(0, 12).map((track) => track.name),
  };
}

function filterBodyHeadMotionTracks(clip: THREE.AnimationClip) {
  if (!clip.tracks.some(isHeadMotionTrack)) {
    return clip;
  }
  return new THREE.AnimationClip(
    `${clip.name || "motion"}_no_head_tracks`,
    clip.duration,
    clip.tracks.filter((track) => !isHeadMotionTrack(track))
  );
}

export class PjskViewerApp {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly directionalLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.AmbientLight;
  private readonly textureLoader: THREE.TextureLoader;
  private readonly bodyMaterial: THREE.ShaderMaterial;
  private readonly hairMaterial: THREE.ShaderMaterial;
  private readonly faceMaterial: THREE.ShaderMaterial;
  private readonly characterRoot: THREE.Group;
  private readonly bodySlot: THREE.Group;
  private readonly headSlot: THREE.Group;
  private readonly attachGuide: THREE.Line;
  private animationFrame = 0;
  private importRevision = 0;
  private currentBodyAsset: BodyAssetManifest | null = null;
  private currentHeadAsset: HeadAssetManifest | null = null;
  private currentImportIsCombined = false;
  private currentImportSnapshot: PartImportSnapshot | null = null;
  private currentBodyAttachNode: THREE.Object3D | null = null;
  private currentHeadAttachOriginNode: THREE.Object3D | null = null;
  private currentCompositionStatus: CompositionStatus = {
    mode: "separate_parts",
    linkedBoneCount: 0,
    missingBodyBones: [],
    missingHeadBones: [],
    usingFallbackAttach: true,
  };
  private readonly activeBoneLinks: BoneLink[] = [];
  private currentStitchMode: CharacterAssemblyState["stitchMode"] = "stitched";
  private currentBodyAnimationRoot: THREE.Object3D | null = null;
  private currentAnimationUrl: string | null = null;
  private currentAnimationLoopUrl: string | null = null;
  private currentAnimationClipName: string | null = null;
  private currentAnimationDuration = 0;
  private currentAnimationAction: THREE.AnimationAction | null = null;
  private currentLoopAction: THREE.AnimationAction | null = null;
  private currentAnimationMixer: THREE.AnimationMixer | null = null;
  private currentAnimationFinishedHandler: THREE.EventListener<any, any, any> | null = null;
  private currentAnimationError: string | null = null;
  private controllerOutlineColor: THREE.Color | null = null;
  private controllerOutlineBlending = 0;
  private queuedLoopClipName: string | null = null;
  private currentFaceMotionSet: FaceMotionSet | null = null;
  private currentFaceMotionClip: FaceMotionClip | null = null;
  private currentFaceMotionLoopClip: FaceMotionClip | null = null;
  private currentFaceMotionTime = 0;
  private currentFaceMotionError: string | null = null;
  private readonly currentHeadMorphRuntimes: HeadMorphRuntime[] = [];
  private currentRuntimeExtension: unknown = null;
  private currentVrmSpringBoneManager: VRMSpringBoneManager | null = null;
  private readonly animationClipCache = new Map<string, THREE.AnimationClip[]>();
  private readonly smoothedLoopClipCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
  private animationPlaybackSpeed = 1;
  private animationPaused = false;
  private faceMotionEnabled = true;
  private bodyHeadTracksEnabled = true;
  private animationRevision = 0;
  private characterHeight = 1;
  private readonly tempMatrixA = new THREE.Matrix4();
  private readonly tempMatrixB = new THREE.Matrix4();
  private readonly tempVector = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();
  private readonly faceRightWorld = new THREE.Vector3();
  private readonly faceForwardWorld = new THREE.Vector3();
  private readonly sideHairParentWorld = new THREE.Vector3();
  private readonly sideHairTailWorld = new THREE.Vector3();
  private readonly sideHairColliderWorld = new THREE.Vector3();
  private readonly sideHairCurrentDir = new THREE.Vector3();
  private readonly sideHairTargetDir = new THREE.Vector3();
  private readonly sideHairPush = new THREE.Vector3();
  private readonly sideHairWorldDelta = new THREE.Quaternion();
  private readonly sideHairWeightedDelta = new THREE.Quaternion();
  private readonly sideHairBoneWorldQuat = new THREE.Quaternion();
  private readonly sideHairParentWorldQuat = new THREE.Quaternion();
  private readonly sideHairTargetLocalQuat = new THREE.Quaternion();
  private readonly sideHairTargetTailWorld = new THREE.Vector3();
  private materialBindingMode: MaterialBindingMode = "manifest";
  private readonly runtimeDebug: RuntimeDebugSnapshot = {
    materialBindingMode: "manifest",
    body: [],
    head: [],
    headMorphs: [],
  };

  constructor(container: HTMLElement, initialLight: PreviewLightState) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#cfd8e0");
    this.scene.fog = new THREE.Fog("#cfd8e0", 5.5, 15);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.camera.position.set(
      0,
      1.6 * initialLight.characterHeight,
      6.4 * initialLight.characterHeight
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(90);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
    this.controls.target.set(0, 1.25 * initialLight.characterHeight, 0);
    this.controls.update();

    this.directionalLight = new THREE.DirectionalLight(
      "#fffaf2",
      initialLight.intensity
    );
    this.directionalLight.position.set(
      initialLight.x,
      initialLight.y,
      initialLight.z
    );
    this.scene.add(this.directionalLight);

    this.fillLight = new THREE.AmbientLight("#fff8f0", initialLight.ambient);
    this.scene.add(this.fillLight);
    this.textureLoader = new THREE.TextureLoader();

    this.bodyMaterial = createSekaiBodyMaterial({
      baseColor: "#f5d6d0",
      shadowColor: "#c79b95",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: initialLight.intensity,
      ambientIntensity: initialLight.ambient,
      shadowThreshold: initialLight.shadowThreshold,
      shadowWeight: initialLight.shadowWeight,
      characterAmbientIntensity: initialLight.characterAmbient,
      rimIntensity: initialLight.rimIntensity,
      controllerRimThreshold: initialLight.rimThreshold,
      rimDirectionality: initialLight.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      skinTintEnabled: true,
    });
    this.hairMaterial = createSekaiBodyMaterial({
      baseColor: "#7b5b4a",
      shadowColor: "#513d33",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: initialLight.intensity,
      ambientIntensity: initialLight.ambient,
      shadowThreshold: initialLight.shadowThreshold,
      shadowWeight: initialLight.shadowWeight,
      characterAmbientIntensity: initialLight.characterAmbient,
      rimIntensity: initialLight.rimIntensity,
      controllerRimThreshold: initialLight.rimThreshold,
      rimDirectionality: initialLight.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      skinTintEnabled: false,
    });
    this.faceMaterial = createSekaiFaceMaterial({
      baseColor: "#ffe4dc",
      warmColor: "#ffd4c8",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: initialLight.intensity,
      ambientIntensity: initialLight.ambient,
      faceSoftness: initialLight.faceSoftness,
    });

    this.characterRoot = new THREE.Group();
    this.bodySlot = new THREE.Group();
    this.headSlot = new THREE.Group();
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
    this.applyCharacterHeight(initialLight.characterHeight);
    this.scene.add(this.characterRoot);

    const guideGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.attachGuide = new THREE.Line(
      guideGeometry,
      new THREE.LineDashedMaterial({
        color: "#875c45",
        dashSize: 0.08,
        gapSize: 0.06,
      })
    );
    this.scene.add(this.attachGuide);

    this.addSceneReference();
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();
    this.render();
  }

  async importCharacterParts(
    bodyAsset: BodyAssetManifest,
    headAsset: HeadAssetManifest
  ): Promise<PartImportSnapshot> {
    const revision = ++this.importRevision;
    this.currentBodyAsset = bodyAsset;
    this.currentHeadAsset = headAsset;
    this.currentImportIsCombined = false;
    const [loadedBody, loadedHead] = await Promise.all([
      this.loadBodyAsset(bodyAsset),
      this.loadHeadAsset(headAsset),
    ]);

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(bodyAsset, loadedBody),
        head: this.makeImportStatus(headAsset, loadedHead),
        composition: this.currentCompositionStatus,
      };
    }

    const bodyMeshCount = this.applyBodyAsset(bodyAsset, loadedBody);
    const headMeshCount = this.applyHeadAsset(headAsset, loadedHead);
    const composition = this.prepareComposition();
    await this.refreshAnimationPlayback();

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(bodyAsset, loadedBody),
        head: this.makeImportStatus(headAsset, loadedHead),
        composition: this.currentCompositionStatus,
      };
    }
    const snapshot = {
      revision,
      body: {
        ...this.makeImportStatus(bodyAsset, loadedBody),
        meshCount: bodyMeshCount,
        boneCount: loadedBody.boneCount,
        skinnedMeshCount: loadedBody.skinnedMeshCount,
      },
      head: {
        ...this.makeImportStatus(headAsset, loadedHead),
        meshCount: headMeshCount,
        boneCount: loadedHead.boneCount,
        skinnedMeshCount: loadedHead.skinnedMeshCount,
      },
      composition,
    };
    this.currentImportSnapshot = snapshot;
    return snapshot;
  }

  async importCombinedCharacter(
    characterAsset: RuntimeCombinedCharacterAsset
  ): Promise<PartImportSnapshot> {
    const revision = ++this.importRevision;
    this.currentBodyAsset = characterAsset.bodyAsset;
    this.currentHeadAsset = characterAsset.headAsset;
    this.currentImportIsCombined = true;
    const loaded = await this.loadCombinedCharacterAsset(characterAsset);

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(characterAsset.bodyAsset, loaded),
        head: this.makeImportStatus(characterAsset.headAsset, loaded),
        composition: this.currentCompositionStatus,
      };
    }

    clearGroup(this.bodySlot);
    clearGroup(this.headSlot);
    this.resetSlotParents();
    this.currentRuntimeExtension = this.resolvePjskRuntimeExtension(
      loaded,
      characterAsset.runtimeExtension
    );
    this.currentVrmSpringBoneManager = loaded.springBoneManager ?? null;
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    this.currentHeadMorphRuntimes.length = 0;
    this.currentBodyAnimationRoot = null;

    if (loaded.root) {
      this.bodySlot.add(loaded.root);
      this.currentBodyAnimationRoot = loaded.root;
      const bodySkeletonRoot = this.findNodeByName(
        loaded.root,
        characterAsset.bodyAsset.skeleton.rootNodeName
      );
      const headSkeletonRoot = this.findNodeByName(
        loaded.root,
        characterAsset.headAsset.assembly.rootNodeName
      );
      this.currentBodyAttachNode = this.findNodeByName(
        bodySkeletonRoot ?? loaded.root,
        characterAsset.bodyAsset.skeleton.neckAttach.nodeName
      );
      this.currentHeadAttachOriginNode = this.findNodeByName(
        headSkeletonRoot ?? loaded.root,
        characterAsset.headAsset.assembly.attachOrigin.nodeName
      );
      this.bindHeadMorphTargets(loaded.root, characterAsset.headAsset);
      this.prepareCombinedComposition(bodySkeletonRoot, loaded.root);
    } else {
      this.currentCompositionStatus = {
        mode: "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [],
        missingHeadBones: [],
        usingFallbackAttach: true,
      };
    }
    await this.refreshAnimationPlayback();

    const bodyStatus = {
      ...this.makeImportStatus(characterAsset.bodyAsset, loaded),
      assetId: characterAsset.id,
      displayName: `${characterAsset.displayName} [combined body]`,
    };
    const headStatus = {
      ...this.makeImportStatus(characterAsset.headAsset, loaded),
      assetId: characterAsset.id,
      displayName: `${characterAsset.displayName} [combined head]`,
    };
    const snapshot = {
      revision,
      body: bodyStatus,
      head: headStatus,
      composition: this.currentCompositionStatus,
    };
    this.currentImportSnapshot = snapshot;
    return snapshot;
  }

  setMaterialBindingMode(mode: MaterialBindingMode) {
    this.materialBindingMode = mode;
    this.runtimeDebug.materialBindingMode = mode;
  }

  getRuntimeDebugSnapshot() {
    return structuredClone(this.runtimeDebug);
  }

  getSpringBoneSnapshot(): SpringBoneRuntimeSnapshot {
    return summarizeSpringBoneMetadata(
      this.currentRuntimeExtension,
      Boolean(this.currentVrmSpringBoneManager)
    );
  }

  getAnimationSnapshot(): AnimationPlaybackSnapshot {
    return {
      selectedUrl: this.currentAnimationUrl,
      selectedLoopUrl: this.currentAnimationLoopUrl,
      activeClipName: this.currentAnimationClipName,
      queuedLoopClipName: this.queuedLoopClipName,
      currentTime: this.currentAnimationAction?.time ?? 0,
      duration: this.currentAnimationDuration,
      paused: this.animationPaused,
      speed: this.animationPlaybackSpeed,
      faceMotionEnabled: this.faceMotionEnabled,
      bodyHeadTracksEnabled: this.bodyHeadTracksEnabled,
      bodyTrackDebug: makeAnimationTrackDebug(
        this.currentAnimationAction?.getClip() ?? null
      ),
      bodyLoopTrackDebug: makeAnimationTrackDebug(
        this.currentLoopAction?.getClip() ?? null
      ),
      error: this.currentAnimationError,
    };
  }

  getFaceMotionSnapshot(): FaceMotionPlaybackSnapshot {
    return {
      activeClipName: this.currentFaceMotionClip?.name ?? null,
      queuedLoopClipName: this.currentFaceMotionLoopClip?.name ?? null,
      error: this.currentFaceMotionError,
      currentTime: this.currentFaceMotionTime,
      mappedMeshCount: this.currentHeadMorphRuntimes.length,
      mappedCurveCount: this.currentHeadMorphRuntimes.reduce(
        (sum, runtime) => sum + runtime.curveIndexByHash.size,
        0
      ),
    };
  }

  setAnimationPaused(paused: boolean) {
    this.animationPaused = paused;
    this.applyAnimationPlaybackSettings();
  }

  setAnimationSpeed(speed: number) {
    this.animationPlaybackSpeed = speed;
    this.applyAnimationPlaybackSettings();
  }

  setFaceMotionEnabled(enabled: boolean) {
    this.faceMotionEnabled = enabled;
    if (enabled) {
      this.applyCurrentFaceMotionFrame();
    } else {
      this.clearFaceMotionInfluences();
    }
  }

  setBodyHeadTracksEnabled(enabled: boolean) {
    if (this.bodyHeadTracksEnabled === enabled) {
      return;
    }
    this.bodyHeadTracksEnabled = enabled;
    void this.refreshAnimationPlayback();
  }

  seekAnimation(time: number) {
    const duration = Math.max(this.currentAnimationDuration, 0);
    const nextTime = duration > 0
      ? THREE.MathUtils.clamp(time, 0, duration)
      : Math.max(time, 0);
    this.animationPaused = true;
    this.applyAnimationPlaybackSettings();
    if (this.currentAnimationAction) {
      this.currentAnimationAction.paused = false;
      this.currentAnimationAction.time = nextTime;
    }
    this.currentAnimationMixer?.update(0);
    this.currentFaceMotionTime = nextTime;
    this.applyCurrentFaceMotionFrame();
    this.syncLinkedHeadBones();
    this.applyAnimationPlaybackSettings();
  }

  setFaceMotionSet(
    data: FaceMotionSet | null,
    preferredClipName: string | null,
    preferredLoopClipName: string | null
  ) {
    this.currentFaceMotionSet = data;
    this.currentFaceMotionError = null;
    this.currentFaceMotionTime = 0;
    this.currentFaceMotionClip = null;
    this.currentFaceMotionLoopClip = null;

    if (!data || !data.clips.length) {
      this.clearFaceMotionInfluences();
      return;
    }

    const selected = data.clips.find((clip) => clip.name === preferredClipName)
      ?? data.clips[0]
      ?? null;
    this.currentFaceMotionClip = selected;
    if (!selected) {
      return;
    }

    if (preferredLoopClipName && preferredLoopClipName !== selected.name) {
      this.currentFaceMotionLoopClip =
        data.clips.find((clip) => clip.name === preferredLoopClipName) ?? null;
    }

    this.applyCurrentFaceMotionFrame();
  }

  async setAnimationSelection(selection: BodyAnimationSelection | null) {
    this.currentAnimationUrl = selection?.motionUrl ?? null;
    this.currentAnimationLoopUrl = selection?.loopUrl ?? null;
    await this.refreshAnimationPlayback();
    return this.getAnimationSnapshot();
  }

  updateAssembly(assembly: CharacterAssemblyState) {
    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      return;
    }
    if (this.currentImportIsCombined) {
      this.currentStitchMode = assembly.stitchMode;
      this.bodySlot.parent?.remove(this.bodySlot);
      this.headSlot.parent?.remove(this.headSlot);
      this.characterRoot.add(this.bodySlot);
      this.characterRoot.add(this.headSlot);
      this.bodySlot.position.set(0, 0, 0);
      this.headSlot.position.set(0, 0, 0);
      this.bodySlot.scale.setScalar(1);
      this.headSlot.scale.setScalar(1);
      this.updateAttachGuide(
        this.currentBodyAsset.skeleton.neckAttach.fallbackPosition,
        this.currentBodyAsset.skeleton.neckAttach.fallbackPosition
      );
      return;
    }

    const bodyNeckAnchor = new THREE.Vector3(
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.x,
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.y,
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.z
    );
    const rawHeadPosition = new THREE.Vector3(
      this.currentHeadAsset.rawImportOffset.x,
      this.currentHeadAsset.rawImportOffset.y,
      this.currentHeadAsset.rawImportOffset.z
    );
    const userOffset = new THREE.Vector3(
      assembly.headOffset.x,
      assembly.headOffset.y,
      assembly.headOffset.z
    );
    this.currentStitchMode = assembly.stitchMode;

    this.bodySlot.parent?.remove(this.bodySlot);
    this.headSlot.parent?.remove(this.headSlot);
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
    this.bodySlot.position.set(0, 0, 0);
    this.headSlot.position.set(0, 0, 0);
    this.headSlot.scale.setScalar(assembly.headScale);

    const headOriginOffset = this.resolveHeadOriginOffset(assembly.headScale);
    const stitchedParent = this.currentBodyAttachNode ?? this.bodySlot;
    const actualBodyAttach = new THREE.Vector3();
    if (this.currentBodyAttachNode) {
      this.currentBodyAttachNode.getWorldPosition(actualBodyAttach);
      this.characterRoot.worldToLocal(actualBodyAttach);
    } else {
      actualBodyAttach.copy(bodyNeckAnchor);
    }

    switch (assembly.stitchMode) {
      case "stitched":
        this.characterRoot.add(this.bodySlot);
        if (this.currentCompositionStatus.mode === "bone_linked") {
          this.characterRoot.add(this.headSlot);
          this.headSlot.position
            .copy(actualBodyAttach)
            .add(userOffset)
            .sub(headOriginOffset);
        } else {
          stitchedParent.add(this.headSlot);
        }
        this.bodySlot.position.set(0, 0, 0);
        if (this.currentCompositionStatus.mode === "bone_linked") {
          this.attachGuide.visible = false;
        } else if (this.currentBodyAttachNode) {
          this.headSlot.position.copy(userOffset).sub(headOriginOffset);
        } else {
          this.headSlot.position.copy(bodyNeckAnchor).add(userOffset).sub(headOriginOffset);
        }
        this.attachGuide.visible = false;
        break;
      case "manual":
        this.characterRoot.add(this.bodySlot);
        this.characterRoot.add(this.headSlot);
        this.bodySlot.position.set(0, 0, 0);
        this.headSlot.position.copy(rawHeadPosition).add(userOffset).sub(headOriginOffset);
        this.updateAttachGuide(
          this.currentBodyAsset.skeleton.neckAttach.fallbackPosition,
          {
            x: this.headSlot.position.x + headOriginOffset.x,
            y: this.headSlot.position.y + headOriginOffset.y,
            z: this.headSlot.position.z + headOriginOffset.z,
          }
        );
        break;
      case "split":
        this.characterRoot.add(this.bodySlot);
        this.characterRoot.add(this.headSlot);
        this.bodySlot.position.set(-assembly.splitDistance * 0.5, 0, 0);
        this.headSlot.position.set(
          assembly.splitDistance * 0.5 + assembly.headOffset.x - headOriginOffset.x,
          1.25 + assembly.headOffset.y - headOriginOffset.y,
          assembly.headOffset.z - headOriginOffset.z
        );
        this.updateAttachGuide(
          {
            x:
              this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.x +
              this.bodySlot.position.x,
            y: this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.y,
            z: this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.z,
          },
          {
            x: this.headSlot.position.x + headOriginOffset.x,
            y: this.headSlot.position.y + headOriginOffset.y,
            z: this.headSlot.position.z + headOriginOffset.z,
          }
        );
        break;
    }
  }

  updatePreviewLight(next: PreviewLightState) {
    this.applyCharacterHeight(next.characterHeight);
    this.directionalLight.position.set(
      next.x,
      next.y,
      next.z
    );
    this.directionalLight.intensity = next.intensity;
    this.fillLight.intensity = next.ambient;
    updateSekaiBodyMaterial(this.bodyMaterial, {
      baseColor: this.currentBodyAsset?.proxy.bodyColor ?? "#f5d6d0",
      shadowColor: this.currentBodyAsset?.proxy.shadowColor ?? "#c79b95",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: this.bodyMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.bodyMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.bodyMaterial.uniforms.uShadowTexWeight.value,
      saturation: this.bodyMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.bodyMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.bodyMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${this.bodyMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${this.bodyMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${this.bodyMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${this.bodyMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: this.bodyMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: this.bodyMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: this.bodyMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: this.bodyMaterial.uniforms.uControllerRimShadowSharpness.value,
      skinTintEnabled: true,
    });
    updateSekaiBodyMaterial(this.hairMaterial, {
      baseColor: this.currentHeadAsset?.proxy.hairColor ?? "#7b5b4a",
      shadowColor: this.currentHeadAsset?.proxy.hairShadowColor ?? "#513d33",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: this.hairMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.hairMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.hairMaterial.uniforms.uShadowTexWeight.value,
      saturation: this.hairMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.hairMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.hairMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${this.hairMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${this.hairMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${this.hairMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${this.hairMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: this.hairMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: this.hairMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: this.hairMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: this.hairMaterial.uniforms.uControllerRimShadowSharpness.value,
      skinTintEnabled: false,
    });
    updateSekaiFaceMaterial(this.faceMaterial, {
      baseColor: this.currentHeadAsset?.proxy.faceColor ?? "#ffe4dc",
      warmColor: this.currentHeadAsset?.proxy.faceShadeColor ?? "#ffd4c8",
      skinColorDefault:
        this.currentHeadAsset?.proxy.skinColorDefault ??
        this.currentHeadAsset?.proxy.faceColor ??
        "#ffe4dc",
      skinColor1:
        this.currentHeadAsset?.proxy.skinColor1 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        "#ffd4c8",
      skinColor2:
        this.currentHeadAsset?.proxy.skinColor2 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        "#ffd4c8",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      faceSoftness: next.faceSoftness,
    });
    this.updateLoadedMaterialLight(next);
  }

  updateGlobalShadowColor(color: THREE.ColorRepresentation) {
    const nextColor = new THREE.Color(color);
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      material.uniforms.uGlobalShadowColor?.value.copy(nextColor);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            material.uniforms.uGlobalShadowColor?.value.copy(nextColor);
          }
        }
      });
    }
  }

  updateLightControllerColors(colors: {
    ambientColor?: THREE.ColorRepresentation | null;
    rimColor?: THREE.ColorRepresentation | null;
    shadowRimColor?: THREE.ColorRepresentation | null;
  }) {
    const ambientColor = new THREE.Color(colors.ambientColor ?? "#ffffff");
    const rimColor = new THREE.Color(colors.rimColor ?? "#e6edf9");
    const shadowRimColor = new THREE.Color(colors.shadowRimColor ?? "#ffffff");
    const rimColorWeight = colors.rimColor ? 1.0 : 0.0;
    const shadowRimColorWeight = colors.shadowRimColor ? 1.0 : 0.0;
    const applyUniforms = (material: THREE.ShaderMaterial) => {
      material.uniforms.uControllerAmbientColor?.value.copy(ambientColor);
      material.uniforms.uControllerRimColor?.value.copy(rimColor);
      material.uniforms.uControllerShadowRimColor?.value.copy(shadowRimColor);
      if (material.uniforms.uControllerRimColorWeight) {
        material.uniforms.uControllerRimColorWeight.value = rimColorWeight;
      }
      if (material.uniforms.uControllerShadowRimColorWeight) {
        material.uniforms.uControllerShadowRimColorWeight.value = shadowRimColorWeight;
      }
    };
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      applyUniforms(material);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            applyUniforms(material);
          }
        }
      });
    }
  }

  updateLightControllerRimShape(shape: {
    edgeSmoothness?: number | null;
    shadowSharpness?: number | null;
  }) {
    const edgeSmoothness = THREE.MathUtils.clamp(
      shape.edgeSmoothness ?? 0.38,
      0.02,
      1.0
    );
    const shadowSharpness = THREE.MathUtils.clamp(
      shape.shadowSharpness ?? 0.0,
      0.0,
      1.0
    );
    const applyUniforms = (material: THREE.ShaderMaterial) => {
      if (material.uniforms.uControllerRimEdgeSmoothness) {
        material.uniforms.uControllerRimEdgeSmoothness.value = edgeSmoothness;
      }
      if (material.uniforms.uControllerRimShadowSharpness) {
        material.uniforms.uControllerRimShadowSharpness.value = shadowSharpness;
      }
    };
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      applyUniforms(material);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            applyUniforms(material);
          }
        }
      });
    }
  }

  updateLightControllerOutline(outline: {
    color?: THREE.ColorRepresentation | null;
    blending?: number | null;
  }) {
    this.controllerOutlineColor = outline.color ? new THREE.Color(outline.color) : null;
    this.controllerOutlineBlending = THREE.MathUtils.clamp(
      outline.blending ?? (this.controllerOutlineColor ? 1.0 : 0.0),
      0.0,
      1.0
    );
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.userData.pjskOutlineShell) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshBasicMaterial) {
            this.applyLightControllerOutlineMaterial(material);
          }
        }
      });
    }
  }

  private applyLightControllerOutlineMaterial(material: THREE.MeshBasicMaterial) {
    if (material.name !== "pjsk_shell_outline") {
      return;
    }
    const baseColor = new THREE.Color(
      typeof material.userData.pjskBaseOutlineColor === "string"
        ? material.userData.pjskBaseOutlineColor
        : "#1f1b1b"
    );
    if (!this.controllerOutlineColor) {
      material.color.copy(baseColor);
      return;
    }
    material.color.copy(baseColor.lerp(this.controllerOutlineColor, this.controllerOutlineBlending));
  }

  private updateLoadedMaterialLight(next: PreviewLightState) {
    const lightDirection = this.directionalLight.position.clone().normalize();
    const rimDirection = getSekaiPreviewRimDirection();
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.ShaderMaterial)) {
            continue;
          }
          const uniforms = material.uniforms;
          uniforms.uLightDirection?.value.copy(lightDirection);
          if (uniforms.uLightIntensity) {
            uniforms.uLightIntensity.value = next.intensity;
          }
          if (uniforms.uAmbientIntensity) {
            uniforms.uAmbientIntensity.value = next.ambient;
          }
          if (uniforms.uShadowThreshold) {
            uniforms.uShadowThreshold.value = next.shadowThreshold;
          }
          if (uniforms.uShadowWeight) {
            uniforms.uShadowWeight.value = next.shadowWeight;
          }
          if (uniforms.uCharacterAmbientIntensity) {
            uniforms.uCharacterAmbientIntensity.value = next.characterAmbient;
          }
          if (uniforms.uRimIntensity) {
            uniforms.uRimIntensity.value = next.rimIntensity;
          }
          if (uniforms.uControllerRimThreshold) {
            uniforms.uControllerRimThreshold.value = next.rimThreshold;
          }
          if (uniforms.uRimDirectionality) {
            uniforms.uRimDirectionality.value = next.rimDirectionality;
          }
          uniforms.uRimDirection?.value.copy(rimDirection);
          if (uniforms.uFaceSoftness) {
            uniforms.uFaceSoftness.value = next.faceSoftness;
          }
        }
      });
    }
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.stopAnimationPlayback();
    window.removeEventListener("resize", this.handleResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private addSceneReference() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshBasicMaterial({ color: "#c9bdac" })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(10, 20, "#a8957b", "#c2b19b");
    grid.position.y = -1.18;
    this.scene.add(grid);
  }

  private applyCharacterHeight(height: number) {
    const nextHeight = THREE.MathUtils.clamp(height || 1, 0.5, 2);
    if (Math.abs(nextHeight - this.characterHeight) < 0.0001) {
      return;
    }
    this.characterHeight = nextHeight;
    this.characterRoot.scale.setScalar(nextHeight);
    this.controls.target.set(0, 1.25 * nextHeight, 0);
    this.camera.position.set(0, 1.6 * nextHeight, 6.4 * nextHeight);
    this.controls.update();
  }

  private makeImportStatus(
    asset: BodyAssetManifest | HeadAssetManifest,
    loaded: LoadedPartResult
  ): PartImportStatus {
    return {
      assetId: asset.id,
      displayName: asset.displayName,
      sourceMode: loaded.sourceMode,
      requestedUrl: loaded.requestedUrl,
      meshCount: loaded.meshCount,
      boneCount: loaded.boneCount,
      skinnedMeshCount: loaded.skinnedMeshCount,
      error: loaded.error,
    };
  }

  private resetSlotParents() {
    this.bodySlot.parent?.remove(this.bodySlot);
    this.headSlot.parent?.remove(this.headSlot);
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
  }

  private findNodeByName(
    root: THREE.Object3D,
    name: string | undefined
  ): THREE.Object3D | null {
    if (!name) {
      return null;
    }
    return this.findNodeByImportedName(root, name);
  }

  private collectBones(root: THREE.Object3D) {
    const bones = new Map<string, THREE.Bone>();
    root.traverse((node) => {
      const bone = node as THREE.Bone;
      if (bone.isBone) {
        bones.set(bone.name, bone);
      }
    });
    return bones;
  }

  private findNodeByImportedName(
    root: THREE.Object3D,
    name: string
  ): THREE.Object3D | null {
    const exact = root.getObjectByName(name);
    if (exact) {
      return exact;
    }

    for (let suffix = 1; suffix <= 16; suffix++) {
      const duplicate = root.getObjectByName(`${name}_${suffix}`);
      if (duplicate) {
        return duplicate;
      }
    }

    return null;
  }

  private findBoneByImportedName(
    bones: ReadonlyMap<string, THREE.Bone>,
    name: string
  ): THREE.Bone | null {
    const exact = bones.get(name);
    if (exact) {
      return exact;
    }

    for (let suffix = 1; suffix <= 16; suffix++) {
      const duplicate = bones.get(`${name}_${suffix}`);
      if (duplicate) {
        return duplicate;
      }
    }

    return null;
  }

  private getNodeDepth(node: THREE.Object3D) {
    let depth = 0;
    let current = node.parent;
    while (current) {
      depth += 1;
      current = current.parent;
    }
    return depth;
  }

  private prepareCombinedComposition(
    bodySkeletonRoot: THREE.Object3D | null,
    combinedRoot: THREE.Object3D | null
  ): CompositionStatus {
    this.activeBoneLinks.length = 0;
    const missingBodyBones: string[] = [];
    const missingHeadBones: string[] = [];
    const usingFallbackAttach =
      !this.currentBodyAttachNode;

    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      this.currentCompositionStatus = {
        mode: "combined_glb",
        linkedBoneCount: 0,
        missingBodyBones,
        missingHeadBones,
        usingFallbackAttach,
      };
      return this.currentCompositionStatus;
    }

    if (!bodySkeletonRoot) {
      missingBodyBones.push(
        this.currentBodyAsset.skeleton.rootNodeName ?? "<body-root>"
      );
    }

    if (
      bodySkeletonRoot &&
      combinedRoot &&
      this.currentBodyAsset.skeleton.skeletonId ===
        this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      if (!hasSkinnedMeshesUsingSkeleton(combinedRoot, bodySkeletonRoot)) {
        missingBodyBones.push("Combined skin does not use body skeleton root");
      }
    } else if (
      bodySkeletonRoot &&
      this.currentBodyAsset.skeleton.skeletonId !==
        this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      missingBodyBones.push(
        `Skeleton mismatch: ${this.currentBodyAsset.skeleton.skeletonId} != ${this.currentHeadAsset.assembly.expectedSkeletonId}`
      );
    }

    this.currentCompositionStatus = {
      mode: "combined_glb",
      linkedBoneCount: this.activeBoneLinks.length,
      missingBodyBones,
      missingHeadBones,
      usingFallbackAttach,
    };
    return this.currentCompositionStatus;
  }

  private prepareComposition(): CompositionStatus {
    this.activeBoneLinks.length = 0;
    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      this.currentCompositionStatus = {
        mode: "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [],
        missingHeadBones: [],
        usingFallbackAttach: true,
      };
      return this.currentCompositionStatus;
    }

    const usingFallbackAttach =
      !this.currentBodyAttachNode || !this.currentHeadAttachOriginNode;
    const missingBodyBones: string[] = [];
    const missingHeadBones: string[] = [];

    if (
      this.currentBodyAsset.skeleton.skeletonId !==
      this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      this.currentCompositionStatus = {
        mode: this.currentBodyAttachNode ? "node_attached" : "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [
          `Skeleton mismatch: ${this.currentBodyAsset.skeleton.skeletonId} != ${this.currentHeadAsset.assembly.expectedSkeletonId}`,
        ],
        missingHeadBones,
        usingFallbackAttach,
      };
      return this.currentCompositionStatus;
    }

    const bodyBones = this.collectBones(this.bodySlot);
    const headBones = this.collectBones(this.headSlot);
    const remapEntries = Object.entries(
      this.currentHeadAsset.assembly.boneRemap ?? {}
    );

    for (const [headName, bodyName] of remapEntries) {
      const headBone = headBones.get(headName);
      if (!headBone) {
        missingHeadBones.push(headName);
        continue;
      }
      const bodyBone = bodyBones.get(bodyName);
      if (!bodyBone) {
        missingBodyBones.push(bodyName);
        continue;
      }
      this.activeBoneLinks.push({
        bodyBone,
        headBone,
        bodyName,
        headName,
      });
    }

    this.currentCompositionStatus = {
      mode: this.activeBoneLinks.length
        ? "bone_linked"
        : this.currentBodyAttachNode
          ? "node_attached"
          : "separate_parts",
      linkedBoneCount: this.activeBoneLinks.length,
      missingBodyBones,
      missingHeadBones,
      usingFallbackAttach,
    };
    return this.currentCompositionStatus;
  }

  private resolveHeadOriginOffset(headScale: number) {
    if (this.currentHeadAttachOriginNode) {
      const world = new THREE.Vector3();
      this.currentHeadAttachOriginNode.getWorldPosition(world);
      const local = this.headSlot.worldToLocal(world);
      return local.multiplyScalar(headScale);
    }
    if (!this.currentHeadAsset) {
      return new THREE.Vector3();
    }
    return new THREE.Vector3(
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.x,
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.y,
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.z
    ).multiplyScalar(headScale);
  }

  private async loadBodyAsset(
    bodyAsset: BodyAssetManifest
  ): Promise<LoadedPartResult> {
    try {
      const loaded = await loadGltfPart(bodyAsset.source.meshUrl, bodyAsset.id);
      if (this.materialBindingMode === "manifest") {
        await this.overrideBodyMaterials(loaded.root, bodyAsset);
      } else {
        this.runtimeDebug.body = [];
      }
      this.installSekaiOutlineShells(loaded.root);
      return {
        root: loaded.root,
        sourceMode: "glb",
        requestedUrl: bodyAsset.source.meshUrl,
        meshCount: loaded.meshCount,
        boneCount: loaded.boneCount,
        skinnedMeshCount: loaded.skinnedMeshCount,
        userData: loaded.userData,
        vrm: loaded.vrm,
        springBoneManager: loaded.springBoneManager,
      };
    } catch (error) {
      this.runtimeDebug.body = [
        {
          meshName: "<body-load-failed>",
          sourceMaterialName: bodyAsset.displayName,
          resolvedKey: "load_error",
          resolvedKind: "body",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: getErrorMessage(error),
        },
      ];
      return {
        root: null,
        sourceMode: "proxy",
        requestedUrl: bodyAsset.source.meshUrl,
        meshCount: 0,
        boneCount: 0,
        skinnedMeshCount: 0,
        error: getErrorMessage(error),
      };
    }
  }

  private async loadHeadAsset(
    headAsset: HeadAssetManifest
  ): Promise<LoadedPartResult> {
    try {
      const loaded = await loadGltfPart(headAsset.source.meshUrl, headAsset.id);
      if (this.materialBindingMode === "manifest") {
        await this.overrideHeadMaterials(loaded.root, headAsset);
      } else {
        this.runtimeDebug.head = [];
      }
      this.installSekaiOutlineShells(loaded.root);
      return {
        root: loaded.root,
        sourceMode: "glb",
        requestedUrl: headAsset.source.meshUrl,
        meshCount: loaded.meshCount,
        boneCount: loaded.boneCount,
        skinnedMeshCount: loaded.skinnedMeshCount,
        userData: loaded.userData,
        vrm: loaded.vrm,
        springBoneManager: loaded.springBoneManager,
      };
    } catch (error) {
      this.runtimeDebug.head = [
        {
          meshName: "<head-load-failed>",
          sourceMaterialName: headAsset.displayName,
          resolvedKey: "load_error",
          resolvedKind: "head",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: getErrorMessage(error),
        },
      ];
      return {
        root: null,
        sourceMode: "proxy",
        requestedUrl: headAsset.source.meshUrl,
        meshCount: 0,
        boneCount: 0,
        skinnedMeshCount: 0,
        error: getErrorMessage(error),
      };
    }
  }

  private async loadCombinedCharacterAsset(
    characterAsset: RuntimeCombinedCharacterAsset
  ): Promise<LoadedPartResult> {
    try {
      const loaded = await loadGltfPart(
        characterAsset.meshUrl,
        characterAsset.id
      );
      if (this.materialBindingMode === "manifest") {
        await this.overrideBodyMaterials(loaded.root, characterAsset.bodyAsset, {
          exactMaterialNameOnly: true,
        });
        await this.overrideHeadMaterials(loaded.root, characterAsset.headAsset, {
          exactMaterialNameOnly: true,
          eyeController: readCharacterEyeMaterialController(characterAsset.runtimeExtension),
        });
      } else {
        this.runtimeDebug.body = [];
        this.runtimeDebug.head = [];
      }
      this.installSekaiOutlineShells(loaded.root);
      return {
        root: loaded.root,
        sourceMode: "glb",
        requestedUrl: characterAsset.meshUrl,
        meshCount: loaded.meshCount,
        boneCount: loaded.boneCount,
        skinnedMeshCount: loaded.skinnedMeshCount,
        userData: loaded.userData,
        vrm: loaded.vrm,
        springBoneManager: loaded.springBoneManager,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      this.runtimeDebug.body = [
        {
          meshName: "<combined-load-failed>",
          sourceMaterialName: characterAsset.displayName,
          resolvedKey: "load_error",
          resolvedKind: "body",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: message,
        },
      ];
      this.runtimeDebug.head = [
        {
          meshName: "<combined-load-failed>",
          sourceMaterialName: characterAsset.displayName,
          resolvedKey: "load_error",
          resolvedKind: "head",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: message,
        },
      ];
      return {
        root: null,
        sourceMode: "proxy",
        requestedUrl: characterAsset.meshUrl,
        meshCount: 0,
        boneCount: 0,
        skinnedMeshCount: 0,
        error: message,
      };
    }
  }

  private installSekaiOutlineShells(root: THREE.Object3D) {
    const targets: THREE.Mesh[] = [];
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.pjskOutlineShell) {
        return;
      }
      targets.push(mesh);
    });

    for (const mesh of targets) {
      const vertexColorRedMax = getVertexColorRedMax(mesh.geometry);
      if (vertexColorRedMax !== null && vertexColorRedMax <= 0.01) {
        continue;
      }

      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const lighting = meshMaterials
        .map((material) => material.userData.pjskLighting as MaterialLightingSettings | undefined)
        .find(Boolean);
      const outlineMaterial = createSekaiOutlineMaterial(
        Boolean(mesh.geometry.getAttribute("color")),
        lighting
      );
      this.applyLightControllerOutlineMaterial(outlineMaterial);
      const outline = mesh instanceof THREE.SkinnedMesh
        ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial)
        : new THREE.Mesh(mesh.geometry, outlineMaterial);
      outline.name = `${mesh.name}_outline`;
      outline.renderOrder = Math.max(mesh.renderOrder - 2, 0);
      outline.frustumCulled = mesh.frustumCulled;
      outline.userData.pjskOutlineShell = true;
      outline.matrixAutoUpdate = mesh.matrixAutoUpdate;
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      if (outline instanceof THREE.SkinnedMesh && mesh instanceof THREE.SkinnedMesh) {
        outline.bind(mesh.skeleton, mesh.bindMatrix);
      }
      mesh.parent?.add(outline);
    }
  }

  private async loadTexture(
    url: string | undefined,
    colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
  ) {
    if (!url) {
      return null;
    }
    try {
      const texture = await this.textureLoader.loadAsync(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      texture.colorSpace = colorSpace;
      texture.needsUpdate = true;
      return texture;
    } catch {
      return null;
    }
  }

  private extractColorMap(material: THREE.Material) {
    const candidate = material as THREE.Material & { map?: THREE.Texture | null };
    return candidate.map ?? null;
  }

  private syncReplacementTextureFromOriginal(
    material: THREE.Material,
    originalMap: THREE.Texture | null
  ) {
    if (!originalMap) {
      return;
    }

    const sync = (texture: THREE.Texture | null | undefined) => {
      if (!texture) {
        return;
      }
      texture.wrapS = originalMap.wrapS;
      texture.wrapT = originalMap.wrapT;
      texture.offset.copy(originalMap.offset);
      texture.repeat.copy(originalMap.repeat);
      texture.center.copy(originalMap.center);
      texture.rotation = originalMap.rotation;
      texture.magFilter = originalMap.magFilter;
      texture.minFilter = originalMap.minFilter;
      texture.anisotropy = originalMap.anisotropy;
      texture.flipY = originalMap.flipY;
      texture.colorSpace = originalMap.colorSpace;
      texture.needsUpdate = true;
    };

    if (material instanceof THREE.MeshBasicMaterial) {
      sync(material.map);
      return;
    }

    if (material instanceof THREE.ShaderMaterial) {
      const mainTex = material.uniforms.uMainTex?.value as
        | THREE.Texture
        | null
        | undefined;
      sync(mainTex);
    }
  }

  private async overrideBodyMaterials(
    root: THREE.Object3D,
    bodyAsset: BodyAssetManifest,
    options: { exactMaterialNameOnly?: boolean } = {}
  ) {
    this.runtimeDebug.body = [];
    const slotEntries: Array<{
      key: string;
      meshKey: string;
      materialName: string | null;
      materialKind: string;
      mainTex: string | null;
      shadowTex: string | null;
      valueTex: string | null;
      faceShadowTex: string | null;
      material: THREE.Material;
    }> = [];
    for (const slot of bodyAsset.bodyMaterials) {
      const mainTex = await this.loadTexture(slot.mainTex);
      const shadowTex = await this.loadTexture(slot.shadowTex);
      const valueTex = await this.loadTexture(slot.valueTex, THREE.NoColorSpace);
      const materialKind = slot.materialKind ?? "body";
      const lighting = tuneLightingForPreview(slot.materialKind, slot.lighting);
      const material = cloneBodyShaderMaterial(this.bodyMaterial, {
        mainTex,
        shadowTex,
        valueTex,
        baseColor: bodyAsset.proxy.bodyColor,
        shadowColor: bodyAsset.proxy.shadowColor,
        lighting,
        skinTintEnabled: usesSekaiSkinTint(materialKind),
      });
      material.userData.pjskLighting = lighting;
      const meshKey = normalizeMeshSlotName(slot.meshName);
      slotEntries.push({
        key: slot.materialName
          ? `mat:${slot.materialName.toLowerCase()}`
          : `mesh:${meshKey}`,
        meshKey,
        materialName: slot.materialName?.toLowerCase() ?? null,
        materialKind,
        mainTex: slot.mainTex ?? null,
        shadowTex: slot.shadowTex ?? null,
        valueTex: slot.valueTex ?? null,
        faceShadowTex: null,
        material,
      });
    }

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const originalMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const meshKey = normalizeMeshSlotName(mesh.name);
      const meshSlots = slotEntries.filter((entry) => entry.meshKey === meshKey);
      const allowMeshFallback = !options.exactMaterialNameOnly;
      const rebound = originalMaterials.map((original, index) => {
        const resolvedByMaterialName = slotEntries.find(
          (entry) => entry.materialName === original.name.toLowerCase()
        );
        const resolvedEntry =
          resolvedByMaterialName ??
          (allowMeshFallback ? meshSlots[index] ?? meshSlots[0] ?? null : null);
        if (resolvedEntry) {
          const mainMap = this.extractColorMap(original);
          this.syncReplacementTextureFromOriginal(resolvedEntry.material, mainMap);
          let usedOriginalMap = false;
          if (
            resolvedEntry.material instanceof THREE.ShaderMaterial &&
            !resolvedEntry.material.uniforms.uMainTex.value &&
            mainMap
          ) {
            resolvedEntry.material.uniforms.uMainTex.value = mainMap;
            resolvedEntry.material.uniforms.uUseMainTex.value = 1.0;
            resolvedEntry.material.uniforms.uBaseColor.value.set("#ffffff");
            usedOriginalMap = true;
          }
          const shaderUniforms =
            resolvedEntry.material instanceof THREE.ShaderMaterial
              ? resolvedEntry.material.uniforms
              : null;
          this.runtimeDebug.body.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: resolvedEntry?.key ?? null,
            resolvedKind: resolvedEntry?.materialKind ?? null,
            usedOriginalMap,
            boundMainTex: resolvedEntry?.mainTex ?? null,
            boundShadowTex: resolvedEntry?.shadowTex ?? null,
            boundValueTex: resolvedEntry?.valueTex ?? null,
            boundFaceShadowTex: null,
            finalMaterialType: resolvedEntry.material.type,
            shaderHasMainTex: shaderUniforms?.uUseMainTex?.value ?? null,
            shaderHasShadowTex: shaderUniforms?.uUseShadowTex?.value ?? null,
            shaderHasValueTex: shaderUniforms?.uUseValueTex?.value ?? null,
            shaderLightDirectionX: shaderUniforms?.uLightDirection?.value?.x ?? null,
            shaderLightDirectionY: shaderUniforms?.uLightDirection?.value?.y ?? null,
            shaderLightDirectionZ: shaderUniforms?.uLightDirection?.value?.z ?? null,
            shaderShadowThreshold: shaderUniforms?.uShadowThreshold?.value ?? null,
            shaderShadowWeight: shaderUniforms?.uShadowWeight?.value ?? null,
            shaderSpecularPower: shaderUniforms?.uSpecularPower?.value ?? null,
            shaderRimThreshold: shaderUniforms?.uRimThreshold?.value ?? null,
            shaderControllerRimThreshold:
              shaderUniforms?.uControllerRimThreshold?.value ?? null,
            shaderRimIntensity: shaderUniforms?.uRimIntensity?.value ?? null,
            shaderRimDirectionality:
              shaderUniforms?.uRimDirectionality?.value ?? null,
            shaderCharacterAmbient:
              shaderUniforms?.uCharacterAmbientIntensity?.value ?? null,
            shaderShadowTexWeight: shaderUniforms?.uShadowTexWeight?.value ?? null,
            shaderSaturation: shaderUniforms?.uSaturation?.value ?? null,
            shaderSkinTintEnabled: shaderUniforms?.uSkinTintEnabled?.value ?? null,
            shaderSkinColorDefault: shaderUniforms?.uSkinColorDefault?.value
              ? `#${shaderUniforms.uSkinColorDefault.value.getHexString()}`
              : null,
            shaderSkinColor1: shaderUniforms?.uSkinColor1?.value
              ? `#${shaderUniforms.uSkinColor1.value.getHexString()}`
              : null,
          });
          return resolvedEntry.material;
        }
        if (allowMeshFallback) {
          this.runtimeDebug.body.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: null,
            resolvedKind: null,
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: original.type,
          });
        }
        return original;
      });
      disposeReplacedMaterials(originalMaterials, rebound);
      mesh.material = Array.isArray(mesh.material) ? rebound : rebound[0];
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  }

  private async overrideHeadMaterials(
    root: THREE.Object3D,
    headAsset: HeadAssetManifest,
    options: {
      exactMaterialNameOnly?: boolean;
      eyeController?: CharacterEyeMaterialController | null;
    } = {}
  ) {
    this.runtimeDebug.head = [];
    const slotEntries: Array<{
      key: string;
      meshKey: string;
      materialName: string | null;
      materialKind: string;
      mainTex: string | null;
      shadowTex: string | null;
      valueTex: string | null;
      faceShadowTex: string | null;
      material: THREE.Material;
    }> = [];
    for (const slot of headAsset.faceMaterials) {
      const mainTex = await this.loadTexture(slot.mainTex);
      const shadowTex = await this.loadTexture(slot.shadowTex);
      const faceShadowTex = await this.loadTexture(slot.faceShadowTex, THREE.NoColorSpace);
      const key = slot.meshName.toLowerCase();
      const kind = slot.materialKind ?? "face";
      const lighting = tuneLightingForPreview(kind, slot.lighting);
      let material: THREE.Material;
      if (kind === "eye") {
        material = createSekaiLayerMaterial(
          mainTex,
          "eye",
          options.eyeController?.baseTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
          }
        );
      } else if (kind === "eyelight") {
        material = createSekaiLayerMaterial(
          mainTex,
          "eyelight",
          options.eyeController?.highlightTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            highlightInfluence: options.eyeController?.lightInfluenceForEyeHighlight ?? lighting?.lightInfluenceForEyeHighlight,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
          }
        );
      } else if (kind === "eyelash" || kind === "eyebrow") {
        material = createSekaiLayerMaterial(mainTex, "alpha");
      } else if (kind === "hair") {
        material = cloneBodyShaderMaterial(this.hairMaterial, {
          mainTex,
          shadowTex,
          baseColor: headAsset.proxy.hairColor,
          shadowColor: headAsset.proxy.hairShadowColor,
          lighting,
          skinTintEnabled: false,
        });
      } else if (kind === "accessory" || kind === "body") {
        material = cloneBodyShaderMaterial(this.bodyMaterial, {
          mainTex,
          shadowTex,
          baseColor: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
          shadowColor: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
          lighting,
          skinTintEnabled: usesSekaiSkinTint(kind),
        });
      } else {
        material = cloneFaceShaderMaterial(this.faceMaterial, {
          mainTex,
          shadowTex,
          faceShadowTex,
          baseColor: headAsset.proxy.faceColor,
          warmColor: headAsset.proxy.faceShadeColor,
          skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
          skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
          skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
        });
      }
      material.userData.pjskLighting = lighting;
      slotEntries.push({
        key: slot.materialName
          ? `mat:${slot.materialName.toLowerCase()}`
          : `mesh:${key}`,
        meshKey: normalizeMeshSlotName(slot.meshName),
        materialName: slot.materialName?.toLowerCase() ?? null,
        materialKind: kind,
        mainTex: slot.mainTex ?? null,
        shadowTex: slot.shadowTex ?? null,
        valueTex: null,
        faceShadowTex: slot.faceShadowTex ?? null,
        material,
      });
    }

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const originalMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const meshKey = normalizeMeshSlotName(mesh.name);
      const meshSlots = slotEntries.filter((entry) => entry.meshKey === meshKey);
      const allowMeshFallback = !options.exactMaterialNameOnly;
      const rebound = originalMaterials.map((original, index) => {
        const resolvedByMaterialName = slotEntries.find(
          (entry) => entry.materialName === original.name.toLowerCase()
        );
        const resolvedEntry =
          resolvedByMaterialName ??
          (allowMeshFallback ? meshSlots[index] ?? meshSlots[0] ?? null : null);
        if (resolvedEntry) {
          const mainMap = this.extractColorMap(original);
          this.syncReplacementTextureFromOriginal(resolvedEntry.material, mainMap);
          let usedOriginalMap = false;
          if (resolvedEntry.material instanceof THREE.ShaderMaterial && !resolvedEntry.material.uniforms.uMainTex.value && mainMap) {
            resolvedEntry.material.uniforms.uMainTex.value = mainMap;
            resolvedEntry.material.uniforms.uUseMainTex.value = 1.0;
            if ("uBaseColor" in resolvedEntry.material.uniforms) {
              resolvedEntry.material.uniforms.uBaseColor.value.set("#ffffff");
            }
            usedOriginalMap = true;
          }
          if (resolvedEntry.material instanceof THREE.MeshBasicMaterial && !resolvedEntry.material.map && mainMap) {
            resolvedEntry.material.map = mainMap;
            resolvedEntry.material.needsUpdate = true;
            usedOriginalMap = true;
          }
          mesh.renderOrder = getHeadLayerRenderOrder(resolvedEntry.materialKind);
          const shaderUniforms =
            resolvedEntry.material instanceof THREE.ShaderMaterial
              ? resolvedEntry.material.uniforms
              : null;
          this.runtimeDebug.head.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: resolvedEntry.key,
            resolvedKind: resolvedEntry.materialKind,
            usedOriginalMap,
            boundMainTex: resolvedEntry.mainTex,
            boundShadowTex: resolvedEntry.shadowTex,
            boundValueTex: resolvedEntry.valueTex,
            boundFaceShadowTex: resolvedEntry.faceShadowTex,
            finalMaterialType: resolvedEntry.material.type,
            shaderHasMainTex: shaderUniforms?.uUseMainTex?.value ?? null,
            shaderHasShadowTex: shaderUniforms?.uUseShadowTex?.value ?? null,
            shaderHasFaceShadowTex: shaderUniforms?.uUseFaceShadowTex?.value ?? null,
            shaderHasValueTex: shaderUniforms?.uUseValueTex?.value ?? null,
            shaderLightDirectionX: shaderUniforms?.uLightDirection?.value?.x ?? null,
            shaderLightDirectionY: shaderUniforms?.uLightDirection?.value?.y ?? null,
            shaderLightDirectionZ: shaderUniforms?.uLightDirection?.value?.z ?? null,
            shaderShadowThreshold: shaderUniforms?.uShadowThreshold?.value ?? null,
            shaderShadowWeight: shaderUniforms?.uShadowWeight?.value ?? null,
            shaderSpecularPower: shaderUniforms?.uSpecularPower?.value ?? null,
            shaderRimThreshold: shaderUniforms?.uRimThreshold?.value ?? null,
            shaderControllerRimThreshold:
              shaderUniforms?.uControllerRimThreshold?.value ?? null,
            shaderRimIntensity: shaderUniforms?.uRimIntensity?.value ?? null,
            shaderRimDirectionality:
              shaderUniforms?.uRimDirectionality?.value ?? null,
            shaderCharacterAmbient:
              shaderUniforms?.uCharacterAmbientIntensity?.value ?? null,
            shaderShadowTexWeight: shaderUniforms?.uShadowTexWeight?.value ?? null,
            shaderSaturation: shaderUniforms?.uSaturation?.value ?? null,
            shaderSkinTintEnabled: shaderUniforms?.uSkinTintEnabled?.value ?? null,
            shaderFaceSoftness: shaderUniforms?.uFaceSoftness?.value ?? null,
            shaderAtlasTileX: shaderUniforms?.uAtlasTile?.value?.x ?? null,
            shaderAtlasTileY: shaderUniforms?.uAtlasTile?.value?.y ?? null,
            shaderAtlasSample: shaderUniforms?.uAtlasSample?.value ?? null,
            shaderUseAtlas: shaderUniforms?.uUseAtlas?.value ?? null,
            renderOrder: mesh.renderOrder,
          });
          return resolvedEntry.material;
        }
        if (allowMeshFallback) {
          mesh.renderOrder = mesh.name.toLowerCase().includes("face") ? 10 : 12;
          this.runtimeDebug.head.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: null,
            resolvedKind: null,
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: original.type,
          });
        }
        return original;
      });
      disposeReplacedMaterials(originalMaterials, rebound);
      mesh.material = Array.isArray(mesh.material) ? rebound : rebound[0];
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  }

  private applyBodyAsset(
    bodyAsset: BodyAssetManifest,
    loaded: LoadedPartResult
  ) {
    this.resetSlotParents();
    clearGroup(this.bodySlot);
    this.currentRuntimeExtension = null;
    this.currentVrmSpringBoneManager = loaded.springBoneManager ?? null;
    this.currentBodyAttachNode = null;
    updateSekaiBodyMaterial(this.bodyMaterial, {
      baseColor: bodyAsset.proxy.bodyColor,
      shadowColor: bodyAsset.proxy.shadowColor,
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      shadowThreshold: this.bodyMaterial.uniforms.uShadowThreshold.value,
      shadowWeight: this.bodyMaterial.uniforms.uShadowWeight.value,
      characterAmbientIntensity:
        this.bodyMaterial.uniforms.uCharacterAmbientIntensity.value,
      rimIntensity: this.bodyMaterial.uniforms.uRimIntensity.value,
      controllerRimThreshold:
        this.bodyMaterial.uniforms.uControllerRimThreshold.value,
      rimDirectionality: this.bodyMaterial.uniforms.uRimDirectionality.value,
      rimDirection: this.bodyMaterial.uniforms.uRimDirection.value.clone(),
      specularPower: this.bodyMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.bodyMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.bodyMaterial.uniforms.uShadowTexWeight.value,
      saturation: this.bodyMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.bodyMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.bodyMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      skinTintEnabled: true,
    });

    if (loaded.root) {
      this.bodySlot.add(loaded.root);
      this.currentBodyAnimationRoot = loaded.root;
      this.currentBodyAttachNode = this.findNodeByName(
        loaded.root,
        bodyAsset.skeleton.neckAttach.nodeName
      );
      return loaded.meshCount;
    }

    this.currentBodyAnimationRoot = null;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        bodyAsset.proxy.shoulderWidth * 0.34,
        bodyAsset.proxy.torsoLength,
        10,
        20
      ),
      this.bodyMaterial
    );
    body.position.y = 0.16;
    body.scale.setScalar(bodyAsset.proxy.bodyScale);
    this.bodySlot.add(body);

    const shoulderBand = new THREE.Mesh(
      new THREE.TorusGeometry(
        bodyAsset.proxy.shoulderWidth * 0.48,
        0.12,
        10,
        48
      ),
      this.bodyMaterial
    );
    shoulderBand.rotation.x = Math.PI / 2;
    shoulderBand.position.y = bodyAsset.neckAnchor.y - 0.16;
    this.bodySlot.add(shoulderBand);

    const neckMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.1, 18),
      new THREE.MeshBasicMaterial({ color: "#5d4235" })
    );
    neckMarker.position.set(
      bodyAsset.neckAnchor.x,
      bodyAsset.neckAnchor.y,
      bodyAsset.neckAnchor.z
    );
    this.bodySlot.add(neckMarker);
    return 3;
  }

  private applyHeadAsset(
    headAsset: HeadAssetManifest,
    loaded: LoadedPartResult
  ) {
    this.resetSlotParents();
    clearGroup(this.headSlot);
    this.currentVrmSpringBoneManager =
      loaded.springBoneManager ?? this.currentVrmSpringBoneManager;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    updateSekaiFaceMaterial(this.faceMaterial, {
      baseColor: headAsset.proxy.faceColor,
      warmColor: headAsset.proxy.faceShadeColor,
      skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
      skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
      skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      faceSoftness: this.faceMaterial.uniforms.uFaceSoftness.value,
    });
    updateSekaiBodyMaterial(this.hairMaterial, {
      baseColor: headAsset.proxy.hairColor,
      shadowColor: headAsset.proxy.hairShadowColor,
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      shadowThreshold: this.hairMaterial.uniforms.uShadowThreshold.value,
      shadowWeight: this.hairMaterial.uniforms.uShadowWeight.value,
      characterAmbientIntensity:
        this.hairMaterial.uniforms.uCharacterAmbientIntensity.value,
      rimIntensity: this.hairMaterial.uniforms.uRimIntensity.value,
      controllerRimThreshold:
        this.hairMaterial.uniforms.uControllerRimThreshold.value,
      rimDirectionality: this.hairMaterial.uniforms.uRimDirectionality.value,
      rimDirection: this.hairMaterial.uniforms.uRimDirection.value.clone(),
      specularPower: this.hairMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.hairMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.hairMaterial.uniforms.uShadowTexWeight.value,
      saturation: this.hairMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.hairMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.hairMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      skinTintEnabled: false,
    });

    if (loaded.root) {
      this.headSlot.add(loaded.root);
      this.bindHeadMorphTargets(loaded.root, headAsset);
      this.currentHeadAttachOriginNode = this.findNodeByName(
        loaded.root,
        headAsset.assembly.attachOrigin.nodeName
      );
      return loaded.meshCount;
    }

    const face = new THREE.Mesh(
      new THREE.SphereGeometry(headAsset.proxy.headRadius, 32, 32),
      this.faceMaterial
    );
    face.position.set(
      0,
      headAsset.proxy.headRadius * 0.92,
      headAsset.proxy.faceDepth * 0.28
    );
    face.scale.set(1.0, 0.94, headAsset.proxy.faceDepth);
    this.headSlot.add(face);

    const hair = new THREE.Mesh(
      new THREE.TorusGeometry(headAsset.proxy.hairArc, 0.14, 14, 48, Math.PI),
      this.hairMaterial
    );
    hair.rotation.x = Math.PI / 2;
    hair.position.set(0, headAsset.proxy.headRadius + 0.42, -0.08);
    this.headSlot.add(hair);

    const seam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.18, 18),
      this.faceMaterial
    );
    seam.position.set(0, 0.08, 0.02);
    seam.scale.z = 0.74;
    this.headSlot.add(seam);
    return 3;
  }

  private bindHeadMorphTargets(
    root: THREE.Object3D,
    headAsset: HeadAssetManifest
  ) {
    const manifestChannels = headAsset.morphChannels ?? [];
    const bindings = headAsset.morphChannelBindings ?? [];
    this.currentHeadMorphRuntimes.length = 0;

    root.traverse((node) => {
      if (!isMorphMesh(node)) {
        return;
      }

      const mesh = node;
      const count = mesh.morphTargetInfluences?.length ?? 0;
      if (!count) {
        return;
      }

      if (
        (!mesh.morphTargetDictionary || !Object.keys(mesh.morphTargetDictionary).length) &&
        manifestChannels.length === count
      ) {
        mesh.morphTargetDictionary = Object.fromEntries(
          manifestChannels.map((channel, index) => [channel, index])
        );
      }

      const dictionary = mesh.morphTargetDictionary ?? {};
      const curveIndexByHash = new Map<number, number>();
      const controlledIndices: number[] = [];
      for (const binding of bindings) {
        const index = dictionary[binding.name];
        if (typeof index !== 'number') {
          continue;
        }
        curveIndexByHash.set(binding.curveHash, index);
        controlledIndices.push(index);
      }

      mesh.morphTargetInfluences?.fill(0);
      this.currentHeadMorphRuntimes.push({
        mesh,
        curveIndexByHash,
        controlledIndices: [...new Set(controlledIndices)],
      });

      const channelNames = Object.entries(dictionary)
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);

      this.runtimeDebug.headMorphs.push({
        meshName: mesh.name,
        morphTargetCount: count,
        mappedChannelCount: curveIndexByHash.size,
        sampleChannels: channelNames.slice(0, 12),
      });
    });
  }

  private updateFaceMotion(delta: number) {
    if (
      this.animationPaused ||
      !this.faceMotionEnabled ||
      !this.currentFaceMotionClip ||
      this.currentHeadMorphRuntimes.length === 0
    ) {
      return;
    }

    this.currentFaceMotionTime += delta * this.animationPlaybackSpeed;
    const duration = this.currentFaceMotionClip.duration;
    if (duration > 0 && this.currentFaceMotionTime > duration) {
      if (this.currentFaceMotionLoopClip) {
        const loopTime = this.currentFaceMotionTime - duration;
        this.currentFaceMotionClip = this.currentFaceMotionLoopClip;
        this.currentFaceMotionLoopClip = null;
        this.currentFaceMotionTime = this.currentFaceMotionClip.duration > 0
          ? loopTime % this.currentFaceMotionClip.duration
          : 0;
      } else {
        this.currentFaceMotionTime %= duration;
      }
    }

    this.applyCurrentFaceMotionFrame();
  }

  private promoteFaceMotionLoop() {
    if (!this.currentFaceMotionLoopClip) {
      return;
    }

    this.currentFaceMotionClip = this.currentFaceMotionLoopClip;
    this.currentFaceMotionLoopClip = null;
    this.currentFaceMotionTime = 0;
    this.applyCurrentFaceMotionFrame();
  }

  private applyCurrentFaceMotionFrame() {
    if (!this.faceMotionEnabled || !this.currentFaceMotionClip) {
      return;
    }

    for (const runtime of this.currentHeadMorphRuntimes) {
      const influences = runtime.mesh.morphTargetInfluences;
      if (!influences) {
        continue;
      }
      for (const index of runtime.controlledIndices) {
        influences[index] = 0;
      }
      for (const curve of this.currentFaceMotionClip.curves) {
        const index = runtime.curveIndexByHash.get(curve.curveHash);
        if (index === undefined) {
          continue;
        }
        influences[index] = this.sampleFaceCurve(curve.keyframes, this.currentFaceMotionTime) / 100;
      }
    }
  }

  private clearFaceMotionInfluences() {
    for (const runtime of this.currentHeadMorphRuntimes) {
      const influences = runtime.mesh.morphTargetInfluences;
      if (!influences) {
        continue;
      }
      for (const index of runtime.controlledIndices) {
        influences[index] = 0;
      }
    }
  }

  private sampleFaceCurve(keyframes: FaceMotionKeyframe[], time: number) {
    if (!keyframes.length) {
      return 0;
    }
    if (time <= keyframes[0].time) {
      return keyframes[0].value;
    }
    for (let i = 1; i < keyframes.length; i += 1) {
      const prev = keyframes[i - 1];
      const next = keyframes[i];
      if (time <= next.time) {
        const span = next.time - prev.time;
        if (span <= 1e-6) {
          return next.value;
        }
        const t = (time - prev.time) / span;
        return prev.value + (next.value - prev.value) * t;
      }
    }
    return keyframes[keyframes.length - 1].value;
  }

  private updateAttachGuide(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number }
  ) {
    const points = [
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ];
    this.attachGuide.geometry.setFromPoints(points);
    this.attachGuide.computeLineDistances();
    this.attachGuide.visible = true;
  }

  private handleResize() {
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private updateShaderCameraPositions() {
    const cameraPosition = this.camera.position;
    updateSekaiBodyCamera(this.bodyMaterial, cameraPosition);
    updateSekaiBodyCamera(this.hairMaterial, cameraPosition);
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uCameraPosition) {
            updateSekaiBodyCamera(material, cameraPosition);
          }
        }
      });
    }
  }

  private updateShaderFaceBasis() {
    const headNode =
      this.findNodeByImportedName(this.bodySlot, "Head") ??
      this.findNodeByImportedName(this.headSlot, "Head") ??
      this.currentBodyAnimationRoot ??
      this.characterRoot;
    headNode.getWorldQuaternion(this.tempQuaternion);
    this.faceRightWorld.set(1, 0, 0).applyQuaternion(this.tempQuaternion).normalize();
    this.faceForwardWorld.set(0, 0, 1).applyQuaternion(this.tempQuaternion).normalize();
    updateSekaiFaceBasis(this.faceMaterial, this.faceRightWorld, this.faceForwardWorld);
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uFaceRight) {
            updateSekaiFaceBasis(material, this.faceRightWorld, this.faceForwardWorld);
          }
        }
      });
    }
  }

  private updateLayerMaterialTime(elapsedTime: number) {
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
            material.uniforms.uTime.value = elapsedTime;
          }
        }
      });
    }
  }

  private render() {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.elapsedTime;
    this.currentAnimationMixer?.update(delta);
    this.updateFaceMotion(delta);
    this.syncLinkedHeadBones();
    this.controls.update();
    this.updateShaderCameraPositions();
    this.updateShaderFaceBasis();
    this.updateLayerMaterialTime(elapsedTime);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  private applyAnimationPlaybackSettings() {
    const actions = [this.currentAnimationAction, this.currentLoopAction];
    for (const action of actions) {
      if (!action) {
        continue;
      }
      action.paused = this.animationPaused;
      action.enabled = true;
      action.setEffectiveTimeScale(
        this.animationPaused ? 0 : this.animationPlaybackSpeed
      );
    }
  }

  private configureAnimationAction(action: THREE.AnimationAction) {
    action.zeroSlopeAtStart = false;
    action.zeroSlopeAtEnd = false;
  }

  private getSmoothedLoopClip(
    clip: THREE.AnimationClip,
    sourceUrl: string | null
  ) {
    void sourceUrl;
    if (!shouldSmoothLoopClip(clip)) {
      return clip;
    }

    const cached = this.smoothedLoopClipCache.get(clip);
    if (cached) {
      return cached;
    }

    const smoothed = new THREE.AnimationClip(
      clip.name,
      clip.duration,
      clip.tracks.map((track) => smoothLoopTrack(track, clip.duration, 60))
    );
    this.smoothedLoopClipCache.set(clip, smoothed);
    return smoothed;
  }

  private stopAnimationPlayback() {
    if (this.currentAnimationMixer && this.currentAnimationFinishedHandler) {
      this.currentAnimationMixer.removeEventListener(
        "finished",
        this.currentAnimationFinishedHandler
      );
    }
    this.currentAnimationAction?.stop();
    this.currentLoopAction?.stop();
    this.currentAnimationMixer?.stopAllAction();
    this.currentAnimationAction = null;
    this.currentLoopAction = null;
    this.currentAnimationMixer = null;
    this.currentAnimationFinishedHandler = null;
    this.currentAnimationClipName = null;
    this.currentAnimationDuration = 0;
    this.queuedLoopClipName = null;
  }

  private async refreshAnimationPlayback() {
    const revision = ++this.animationRevision;
    this.stopAnimationPlayback();
    this.currentAnimationError = null;

    if (!this.currentAnimationUrl || !this.currentBodyAnimationRoot) {
      return;
    }

    let clips = this.animationClipCache.get(this.currentAnimationUrl);
    if (!clips) {
      try {
        const loaded = await loadGltfAnimations(
          this.currentAnimationUrl,
          this.currentAnimationUrl
        );
        clips = loaded.clips;
        this.animationClipCache.set(this.currentAnimationUrl, clips);
      } catch (error) {
        if (revision !== this.animationRevision) {
          return;
        }
        this.currentAnimationError = getErrorMessage(error);
        return;
      }
    }

    if (revision !== this.animationRevision) {
      return;
    }

    if (!clips.length) {
      this.currentAnimationError = `No clips found in ${this.currentAnimationUrl}`;
      return;
    }

    this.currentAnimationMixer = new THREE.AnimationMixer(
      this.currentBodyAnimationRoot
    );
    const sourceClip = clips.find((candidate) => !isLoopClipName(candidate.name, this.currentAnimationUrl))
      ?? clips[0];
    const clip = this.bodyHeadTracksEnabled
      ? sourceClip
      : filterBodyHeadMotionTracks(sourceClip);
    const clipName = clip.name || this.currentAnimationUrl;
    this.currentAnimationClipName = clipName;
    this.currentAnimationDuration = clip.duration;
    this.currentAnimationAction = this.currentAnimationMixer.clipAction(
      clip,
      this.currentBodyAnimationRoot
    );
    this.configureAnimationAction(this.currentAnimationAction);
    this.currentAnimationAction.reset();

    let loopClip: THREE.AnimationClip | null = null;
    const loopUrl = this.currentAnimationLoopUrl;
    if (loopUrl === this.currentAnimationUrl) {
      const sourceLoopClip = clips.find((candidate) => isLoopClipName(candidate.name, loopUrl))
        ?? clips.find((candidate) => candidate !== sourceClip)
        ?? null;
      loopClip = sourceLoopClip && this.bodyHeadTracksEnabled
        ? sourceLoopClip
        : sourceLoopClip
          ? filterBodyHeadMotionTracks(sourceLoopClip)
          : null;
    } else if (loopUrl) {
      let loopClips = this.animationClipCache.get(loopUrl);
      if (!loopClips) {
        try {
          const loaded = await loadGltfAnimations(loopUrl, loopUrl);
          loopClips = loaded.clips;
          this.animationClipCache.set(loopUrl, loopClips);
        } catch {
          loopClips = undefined;
        }
      }
      const sourceLoopClip = loopClips?.[0] ?? null;
      loopClip = sourceLoopClip && this.bodyHeadTracksEnabled
        ? sourceLoopClip
        : sourceLoopClip
          ? filterBodyHeadMotionTracks(sourceLoopClip)
          : null;
    }

    if (loopClip) {
      const playableLoopClip = this.getSmoothedLoopClip(loopClip, loopUrl);
      this.currentLoopAction = this.currentAnimationMixer.clipAction(
        playableLoopClip,
        this.currentBodyAnimationRoot
      );
      this.configureAnimationAction(this.currentLoopAction);
      this.currentLoopAction.reset();
      this.currentLoopAction.enabled = false;
      this.currentLoopAction.loop = THREE.LoopRepeat;
      this.currentLoopAction.clampWhenFinished = false;
      this.currentAnimationAction.loop = THREE.LoopOnce;
      this.currentAnimationAction.clampWhenFinished = true;
      this.queuedLoopClipName = playableLoopClip.name || loopUrl || `${clipName}_loop`;

      this.currentAnimationFinishedHandler = (event) => {
        if (
          event.action !== this.currentAnimationAction ||
          !this.currentLoopAction ||
          !this.currentAnimationMixer
        ) {
          return;
        }

        if (this.currentAnimationFinishedHandler) {
          this.currentAnimationMixer.removeEventListener(
            "finished",
            this.currentAnimationFinishedHandler
          );
          this.currentAnimationFinishedHandler = null;
        }

        this.currentAnimationAction?.stop();
        this.currentLoopAction.enabled = true;
        this.currentLoopAction.reset();
        this.currentLoopAction.play();
        this.currentAnimationAction = this.currentLoopAction;
        this.currentLoopAction = null;
        this.currentAnimationClipName = this.queuedLoopClipName;
        this.currentAnimationDuration = playableLoopClip.duration;
        this.queuedLoopClipName = null;
        this.promoteFaceMotionLoop();
        this.applyAnimationPlaybackSettings();
      };

      this.currentAnimationMixer.addEventListener(
        "finished",
        this.currentAnimationFinishedHandler
      );
      this.currentAnimationAction.play();
    } else {
      this.currentAnimationAction.loop = THREE.LoopRepeat;
      this.currentAnimationAction.clampWhenFinished = false;
      this.currentAnimationAction.play();
      this.queuedLoopClipName = null;
    }

    this.applyAnimationPlaybackSettings();
  }


  private syncLinkedHeadBones() {
    if (
      (
        this.currentCompositionStatus.mode !== "bone_linked" &&
        this.currentCompositionStatus.mode !== "combined_glb"
      ) ||
      this.currentStitchMode !== "stitched" ||
      !this.activeBoneLinks.length
    ) {
      return;
    }

    this.characterRoot.updateMatrixWorld(true);
    for (const link of this.activeBoneLinks) {
      link.bodyBone.updateMatrixWorld(true);
      const parent = link.headBone.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        this.tempMatrixA.copy(parent.matrixWorld).invert();
        this.tempMatrixB.multiplyMatrices(
          this.tempMatrixA,
          link.bodyBone.matrixWorld
        );
      } else {
        this.tempMatrixB.copy(link.bodyBone.matrixWorld);
      }
      this.tempMatrixB.decompose(
        this.tempVector,
        this.tempQuaternion,
        this.tempScale
      );
      link.headBone.position.copy(this.tempVector);
      link.headBone.quaternion.copy(this.tempQuaternion);
      link.headBone.scale.copy(this.tempScale);
      link.headBone.updateMatrix();
    }
    this.characterRoot.updateMatrixWorld(true);
  }

  private applyId273ScreenLeftSideHairProjection() {
    const runtime = this.currentRuntimeExtension as
      | {
          character?: {
            costume?: {
              character3dId?: number;
            };
          };
        }
      | null;
    if (runtime?.character?.costume?.character3dId !== 273) {
      return;
    }

    const chainNames = [
      "Right_S_hair_01_offset",
      "EX_Right_S_hair_01",
      "Right_S_hair_02_offset",
      "EX_Right_S_hair_02",
      "Right_S_hair_03_offset",
      "EX_Right_S_hair_03",
      "EX_Right_S_hair_03_spring_tail",
    ];
    const chain = chainNames
      .map((name) => this.findNodeByImportedName(this.characterRoot, name))
      .filter((node): node is THREE.Object3D => Boolean(node));
    if (chain.length !== chainNames.length) {
      return;
    }

    const colliders = [
      { name: "CL_SpineSphereCollider", radius: 0.02 },
      { name: "CL_ChestSphereCollider_Top", radius: 0.03 },
      { name: "CL_ChestSphereCollider", radius: 0.03 },
      { name: "CL_ChestSphereCollider_Center", radius: 0.03 },
      { name: "CL_ChestSphereCollider_Head", radius: 0.03 },
    ]
      .map((entry) => ({
        ...entry,
        node: this.findNodeByImportedName(this.characterRoot, entry.name),
      }))
      .filter(
        (entry): entry is {
          name: string;
          radius: number;
          node: THREE.Object3D;
        } => Boolean(entry.node)
      );
    if (!colliders.length) {
      return;
    }

    this.characterRoot.updateMatrixWorld(true);
    const restPositions = chain.map((node) =>
      node.getWorldPosition(new THREE.Vector3())
    );
    const targetPositions = restPositions.map((position) => position.clone());
    const restLengths = restPositions
      .slice(1)
      .map((position, index) => position.distanceTo(restPositions[index]));
    const hitRadii = [0, 0.02, 0, 0.015, 0, 0.015, 0];
    const collidesWithBodyUpper = [false, false, false, true, false, true, false];
    const safetyMargin = 0.008;
    const neck = this.findNodeByImportedName(this.characterRoot, "Neck");
    const spine = this.findNodeByImportedName(this.characterRoot, "Spine");
    const bodyDown = new THREE.Vector3(0, -1, 0);
    if (neck && spine) {
      bodyDown
        .copy(spine.getWorldPosition(new THREE.Vector3()))
        .sub(neck.getWorldPosition(new THREE.Vector3()));
      if (bodyDown.lengthSq() > 0.000001) {
        bodyDown.normalize();
      } else {
        bodyDown.set(0, -1, 0);
      }
    }
    const restDown = restPositions[restPositions.length - 1]
      .clone()
      .sub(restPositions[0]);
    if (restDown.lengthSq() > 0.000001) {
      restDown.normalize();
    } else {
      restDown.copy(bodyDown);
    }
    const surfaceBiasDown = bodyDown
      .clone()
      .multiplyScalar(0.6)
      .add(restDown.multiplyScalar(0.4));
    if (surfaceBiasDown.lengthSq() > 0.000001) {
      surfaceBiasDown.normalize();
    } else {
      surfaceBiasDown.set(0, -1, 0);
    }
    const slideFactors = [0, 0, 0, 0.22, 0, 0.3, 0];
    const parentResponseFactors = [0, 1.9, 1.35, 0.9, 0.5, 0.24, 0.08];
    const parentSlideFactors = [0, 0.58, 0.5, 0.42, 0.72, 0.95, 1.05];
    const collisionWeightFactors = [0, 0, 0, 0.8, 0, 0.55, 0];
    const surfaceSlide = new THREE.Vector3();
    const aggregatePush = new THREE.Vector3();
    let maxPenetration = 0;

    for (let index = 1; index < targetPositions.length; index += 1) {
      if (!collidesWithBodyUpper[index]) {
        continue;
      }
      for (const collider of colliders) {
        collider.node.getWorldPosition(this.sideHairColliderWorld);
        this.sideHairPush
          .copy(targetPositions[index])
          .sub(this.sideHairColliderWorld);
        if (this.sideHairPush.lengthSq() < 0.000001) {
          this.sideHairPush.set(-1, 0, 0);
        }
        const distance = this.sideHairPush.length();
        const penetration =
          hitRadii[index] + collider.radius + safetyMargin - distance;
        if (penetration <= 0) {
          continue;
        }
        this.sideHairPush.normalize();
        this.sideHairTargetDir
          .copy(this.sideHairPush)
          .addScaledVector(
            bodyDown,
            -this.sideHairPush.dot(bodyDown)
          );
        if (this.sideHairTargetDir.lengthSq() > 0.000001) {
          this.sideHairPush.copy(this.sideHairTargetDir.normalize());
        }
        aggregatePush.addScaledVector(
          this.sideHairPush,
          penetration * collisionWeightFactors[index]
        );
        maxPenetration = Math.max(maxPenetration, penetration);
      }
    }

    if (aggregatePush.lengthSq() > 0.000001) {
      aggregatePush.normalize();
      for (let index = 1; index < targetPositions.length; index += 1) {
        targetPositions[index].addScaledVector(
          aggregatePush,
          maxPenetration * 1.75 * parentResponseFactors[index]
        );
        targetPositions[index].addScaledVector(
          surfaceBiasDown,
          maxPenetration * 0.85 * parentSlideFactors[index]
        );
      }
    }

    const projectPoint = (
      position: THREE.Vector3,
      hitRadius: number,
      chainIndex: number
    ) => {
      let changed = false;
      for (const collider of colliders) {
        collider.node.getWorldPosition(this.sideHairColliderWorld);
        this.sideHairPush.copy(position).sub(this.sideHairColliderWorld);
        if (this.sideHairPush.lengthSq() < 0.000001) {
          this.sideHairPush.set(-1, 0, 0);
        }
        const distance = this.sideHairPush.length();
        const minimumDistance = hitRadius + collider.radius + safetyMargin;
        if (distance >= minimumDistance) {
          continue;
        }
        const penetration = minimumDistance - distance;
        this.sideHairPush.normalize();
        this.sideHairTargetDir
          .copy(this.sideHairPush)
          .addScaledVector(
            bodyDown,
            -this.sideHairPush.dot(bodyDown)
          );
        if (this.sideHairTargetDir.lengthSq() > 0.000001) {
          this.sideHairPush.copy(this.sideHairTargetDir.normalize());
        }
        position.addScaledVector(
          this.sideHairPush,
          penetration
        );
        surfaceSlide
          .copy(surfaceBiasDown)
          .addScaledVector(
            this.sideHairPush,
            -surfaceBiasDown.dot(this.sideHairPush)
          );
        if (surfaceSlide.lengthSq() > 0.000001) {
          position.addScaledVector(
            surfaceSlide.normalize(),
            penetration * slideFactors[chainIndex]
          );
        }
        changed = true;
      }
      return changed;
    };
    const preventUpwardDrift = (index: number) => {
      this.sideHairTargetDir
        .copy(targetPositions[index])
        .sub(restPositions[index]);
      const upwardAmount = this.sideHairTargetDir.dot(bodyDown);
      if (upwardAmount < 0) {
        targetPositions[index].addScaledVector(bodyDown, -upwardAmount);
      }
    };

    let hasCollision = aggregatePush.lengthSq() > 0.000001;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      for (let index = 1; index < targetPositions.length; index += 1) {
        this.sideHairTargetDir
          .copy(targetPositions[index])
          .sub(targetPositions[index - 1]);
        if (this.sideHairTargetDir.lengthSq() < 0.000001) {
          continue;
        }
        targetPositions[index]
          .copy(targetPositions[index - 1])
          .add(
            this.sideHairTargetDir
              .normalize()
              .multiplyScalar(restLengths[index - 1])
          );
      }
      for (let index = 1; index < targetPositions.length; index += 1) {
        if (!collidesWithBodyUpper[index]) {
          continue;
        }
        hasCollision =
          projectPoint(targetPositions[index], hitRadii[index], index) ||
          hasCollision;
        preventUpwardDrift(index);
      }
    }

    if (!hasCollision) {
      return;
    }

    for (let pass = 0; pass < 3; pass += 1) {
      for (let index = 0; index < chain.length - 1; index += 1) {
        const bone = chain[index];
        const end = chain[index + 1];
        if (!bone.parent) {
          continue;
        }
        this.characterRoot.updateMatrixWorld(true);
        bone.getWorldPosition(this.sideHairParentWorld);
        end.getWorldPosition(this.sideHairTailWorld);
        this.sideHairCurrentDir
          .copy(this.sideHairTailWorld)
          .sub(this.sideHairParentWorld);
        this.sideHairTargetDir
          .copy(targetPositions[index + 1])
          .sub(this.sideHairParentWorld);

        if (
          this.sideHairCurrentDir.lengthSq() < 0.0001 ||
          this.sideHairTargetDir.lengthSq() < 0.0001
        ) {
          continue;
        }

        this.sideHairCurrentDir.normalize();
        this.sideHairTargetDir.normalize();
        this.sideHairWorldDelta.setFromUnitVectors(
          this.sideHairCurrentDir,
          this.sideHairTargetDir
        );
        this.sideHairWeightedDelta.identity().slerp(
          this.sideHairWorldDelta,
          0.58
        );
        bone.getWorldQuaternion(this.sideHairBoneWorldQuat);
        bone.parent!.getWorldQuaternion(this.sideHairParentWorldQuat);
        this.sideHairTargetLocalQuat
          .copy(this.sideHairParentWorldQuat)
          .invert()
          .multiply(this.sideHairWeightedDelta)
          .multiply(this.sideHairBoneWorldQuat);

        bone.quaternion.copy(this.sideHairTargetLocalQuat);
        bone.updateMatrix();
      }
    }
    this.characterRoot.updateMatrixWorld(true);
  }

  private resolvePjskRuntimeExtension(
    loaded: LoadedPartResult,
    runtimeExtension: unknown
  ) {
    if (runtimeExtension) {
      return runtimeExtension;
    }
    const extensions = (loaded.userData?.gltfExtensions ?? null) as
      | Record<string, unknown>
      | null;
    return extensions?.PJSK_sekai_runtime ?? null;
  }
}
