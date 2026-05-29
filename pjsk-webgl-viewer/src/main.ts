import "./styles/main.css";
import * as THREE from "three";
import {
  type BodyAssetManifest,
  type HeadAssetManifest,
  type Vec3,
  characterHeightMetersById,
  cloneAssemblyState,
  getBodyAsset,
  getHeadAsset,
  previewLightDirectionFit,
  previewLightDefaults,
  previewShadowThresholdFit,
  sampleCatalog,
} from "./data/sampleScene";
import {
  PjskViewerApp,
  type AnimationPlaybackSnapshot,
  type BodyAnimationSelection,
  type FaceMotionPlaybackSnapshot,
  type FaceMotionSet,
  type MaterialBindingMode,
  type BodyDebugMode,
  type PartImportSnapshot,
  type RuntimeDebugSnapshot,
  type RuntimeCombinedCharacterAsset,
  type FaceSdfDebugMode,
  type FaceSdfDebugLightMode,
  type RenderIsolationMode,
  type SpringBoneRuntimeSnapshot,
} from "./engine/PjskViewerApp";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

const previewState = { ...previewLightDefaults };
const assemblyState = cloneAssemblyState(sampleCatalog.defaultAssembly);
let lastImportSnapshot: PartImportSnapshot | null = null;
let importRun = 0;
let lastRuntimeDebug: RuntimeDebugSnapshot | null = null;
let lastAnimationSnapshot: AnimationPlaybackSnapshot | null = null;
let lastFaceMotionSnapshot: FaceMotionPlaybackSnapshot | null = null;
let lastSpringBoneSnapshot: SpringBoneRuntimeSnapshot | null = null;
type ToonShadowSmoothMode = "auto" | "hard" | "w003" | "w005" | "w008" | "w012";
type ValueShadowInfluenceMode = "0" | "0.25" | "0.5" | "1";
type CharacterYawMode = "0" | "45" | "-45" | "90" | "-90" | "180";
const toonShadowSmoothByMode: Record<ToonShadowSmoothMode, number | null> = {
  auto: null,
  hard: 0.001,
  w003: 0.03,
  w005: 0.05,
  w008: 0.08,
  w012: 0.12,
};
const valueShadowInfluenceByMode: Record<ValueShadowInfluenceMode, number> = {
  "0": 0,
  "0.25": 0.25,
  "0.5": 0.5,
  "1": 1,
};
const characterYawDegreesByMode: Record<CharacterYawMode, number> = {
  "0": 0,
  "45": 45,
  "-45": -45,
  "90": 90,
  "-90": -90,
  "180": 180,
};
const renderState = {
  materialBindingMode: "manifest" as MaterialBindingMode,
  bodyDebugMode: "off" as BodyDebugMode,
  toonShadowSmoothMode: "auto" as ToonShadowSmoothMode,
  valueShadowInfluenceMode: "1" as ValueShadowInfluenceMode,
  characterYawMode: "0" as CharacterYawMode,
  faceSdfDebugMode: "off" as FaceSdfDebugMode,
  faceSdfDebugLightMode: "scene" as FaceSdfDebugLightMode,
  renderIsolationMode: "normal" as RenderIsolationMode,
  faceMotionEnabled: true,
  bodyHeadTracksEnabled: true,
};
const animationState = {
  selectedMotionUrl: "",
  selectedLoopUrl: "",
  speed: 1,
  paused: false,
  seekTime: 0,
};

type UnknownRecord = Record<string, unknown>;

type LightMotionCurve = {
  property: string;
  curveHash: number;
  pathHash: number;
  typeId: string;
  keyframes: Array<{ time: number; value: number }>;
};

type LightMotionClip = {
  name: string;
  controllerKind?: string;
  sampleRate: number;
  duration: number;
  curves: LightMotionCurve[];
};

type LightMotionSet = {
  bundlePath?: string;
  clips: LightMotionClip[];
};

type LightControllerPreview = {
  ambient?: Record<string, unknown>;
  directional?: Record<string, unknown>;
  characterAmbient?: Record<string, unknown>;
  characterRim?: Record<string, unknown>;
  unknownClips: string[];
};

const localAssetState = {
  faceMotionData: null as FaceMotionSet | null,
  faceMotionError: "" as string,
  converterFiles: [] as File[],
  converterUrlByPath: new Map<string, string>(),
  converterDisplayNameByUrl: new Map<string, string>(),
  converterBodyManifest: null as BodyAssetManifest | null,
  converterHeadManifest: null as HeadAssetManifest | null,
  converterRuntimeExtension: null as UnknownRecord | null,
  converterCombinedCharacter: null as RuntimeCombinedCharacterAsset | null,
  converterCombinedFile: null as File | null,
  converterBodyMotionPath: null as string | null,
  converterBodyMotionUrl: null as string | null,
  converterEmbeddedFaceMotionData: null as FaceMotionSet | null,
  converterEmbeddedLightMotionData: null as LightMotionSet | null,
  converterLightControllerPreview: null as LightControllerPreview | null,
  converterError: "" as string,
};

root.innerHTML = `
  <div class="shell">
    <aside class="panel">
      <p class="eyebrow">Standalone Prototype</p>
      <h1>PJSK WebGL Viewer</h1>
      <p class="summary">
        Import the whole converter output folder and inspect the final runtime package.
        SpringBone data is read as metadata only.
      </p>

      <section class="group">
        <h2>Local Bundle Conversion Output</h2>
        <label>
          <span>Converter Output Folder</span>
          <input id="local-converter-folder" data-local-key="converterFolder" type="file" webkitdirectory directory multiple />
        </label>
        <div class="action-row">
          <button id="clear-local-assets" class="button-secondary" type="button">
            Clear Local Output
          </button>
        </div>
        <div class="callout">
          Required runtime import is the whole converter output folder:
          <code>character/character.vrm</code> plus <code>pjsk-sekai-runtime.extension.json</code>.
          Body motion and face clips are discovered from the runtime extension when exported.
        </div>
      </section>

      <section class="group controls">
        <h2>Material Mode</h2>
        <label>
          <span>Binding Strategy</span>
          <select data-render-key="materialBindingMode">
            <option value="manifest" selected>Manifest Rebind</option>
            <option value="glb">GLB Original</option>
          </select>
        </label>
        <label>
          <span>Body Debug</span>
          <select data-render-key="bodyDebugMode">
            <option value="off" selected>Off</option>
            <option value="skin">Skin Mask</option>
            <option value="neck">Neck Plane</option>
            <option value="contact">Contact Shadow</option>
            <option value="h_r">H.R Raw</option>
            <option value="h_g">H.G Raw</option>
            <option value="h_b">H.B Raw</option>
            <option value="h_a">H Alpha</option>
            <option value="vertex_r">Vertex R</option>
            <option value="vertex_g">Vertex G</option>
            <option value="base_shadow">Base Shadow</option>
            <option value="ndotl_raw">NdotL Raw</option>
            <option value="h_b_adjusted_shadow">H.B Adjusted Shadow</option>
            <option value="ambient_target">Ambient Target</option>
            <option value="ambient_weight">Ambient Weight</option>
            <option value="ambient_tint">Ambient Tint</option>
            <option value="specular">Specular</option>
            <option value="specular_mask">Specular Mask</option>
            <option value="specular_add">Specular Add</option>
            <option value="rim_raw">Rim Raw</option>
            <option value="rim_add">Rim Add</option>
            <option value="rim_gate">Rim Gate</option>
            <option value="rim_color">Rim Color</option>
            <option value="rim_scalar">Rim Scalar</option>
          </select>
        </label>
        <label>
          <span>Shadow Smooth</span>
          <select data-render-key="toonShadowSmoothMode">
            <option value="auto" selected>Auto</option>
            <option value="hard">Hard 0.001</option>
            <option value="w003">0.03</option>
            <option value="w005">0.05</option>
            <option value="w008">0.08</option>
            <option value="w012">0.12</option>
          </select>
        </label>
        <label>
          <span>H.B Influence</span>
          <select data-render-key="valueShadowInfluenceMode">
            <option value="0">0</option>
            <option value="0.25">0.25</option>
            <option value="0.5">0.5</option>
            <option value="1" selected>1</option>
          </select>
        </label>
        <label>
          <span>FaceSDF Debug</span>
          <select data-render-key="faceSdfDebugMode">
            <option value="off" selected>Off</option>
            <option value="sdf">Raw SDF</option>
            <option value="mask">Mask</option>
            <option value="limit">Limit</option>
            <option value="basis">Basis</option>
          </select>
        </label>
        <label>
          <span>FaceSDF Light</span>
          <select data-render-key="faceSdfDebugLightMode">
            <option value="scene" selected>Scene Light</option>
            <option value="front">Front</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="back">Back</option>
          </select>
        </label>
        <label>
          <span>Render Isolation</span>
          <select data-render-key="renderIsolationMode">
            <option value="normal" selected>Normal Preview</option>
            <option value="face_sdf">FaceSDF Shading</option>
            <option value="no_face_sdf">No FaceSDF</option>
            <option value="no_face_layers">No Face Layers</option>
            <option value="outline_only">Outline Only</option>
            <option value="no_outline">No Outline</option>
            <option value="no_body_outline">No Body Outline</option>
            <option value="no_hair_outline">No Hair Outline</option>
            <option value="no_face_outline">No Face Outline</option>
          </select>
        </label>
        <label>
          <span>Model Yaw</span>
          <select data-render-key="characterYawMode">
            <option value="0" selected>0 deg</option>
            <option value="45">+45 deg</option>
            <option value="-45">-45 deg</option>
            <option value="90">+90 deg</option>
            <option value="-90">-90 deg</option>
            <option value="180">180 deg</option>
          </select>
        </label>
        <div class="callout">
          Use this to separate two classes of bugs:
          if GLB Original looks correct, converter output is fine and runtime rebinding is wrong.
          If both look wrong, the converter material emission is wrong.
        </div>
      </section>

      <section class="group controls">
        <h2>Animation</h2>
        <label>
          <span>Body Motion</span>
          <select id="animation-select"></select>
        </label>
        <label>
          <span>Body Loop Motion</span>
          <select id="animation-loop-select"></select>
        </label>
        <label>
          <span>Playback Speed</span>
          <input id="animation-speed" type="range" min="0" max="2" step="0.01" value="1" />
        </label>
        <label>
          <span>Pause</span>
          <input id="animation-paused" type="checkbox" />
        </label>
        <label>
          <span>Face Morphs</span>
          <input id="face-motion-enabled" type="checkbox" checked />
        </label>
        <label>
          <span>Head/Neck Tracks</span>
          <input id="body-head-tracks-enabled" type="checkbox" checked />
        </label>
        <label>
          <span>Seek Time</span>
          <input id="animation-seek" type="range" min="0" max="5" step="0.01" value="0" />
        </label>
        <div id="animation-status" class="callout">
          No body animation selected.
        </div>
      </section>

      <section class="group controls">
        <h2>SpringBone Metadata</h2>
        <div id="springbone-status" class="callout">
          Waiting for PJSK springBone metadata.
        </div>
      </section>

      <section class="group foldout">
        <details open>
          <summary><h2>Active Import</h2></summary>
          <div id="import-summary" class="stack"></div>
        </details>
      </section>

      <section class="group foldout">
        <details>
          <summary><h2>Runtime State</h2></summary>
          <pre id="assembly-json"></pre>
        </details>
      </section>

      <section class="group foldout">
        <details>
          <summary><h2>Runtime Debug</h2></summary>
          <pre id="runtime-debug"></pre>
        </details>
      </section>
    </aside>

    <main class="stage-wrap">
      <div id="viewer" class="stage"></div>
      <div class="caption">
        Whole-package runtime preview. SpringBone is metadata-only in this viewer.
      </div>
    </main>
  </div>
`;

const viewerHost = document.querySelector<HTMLElement>("#viewer");

if (!viewerHost) {
  throw new Error("Missing #viewer host");
}

const viewer = new PjskViewerApp(viewerHost, previewState);
viewer.setMaterialBindingMode(renderState.materialBindingMode);
viewer.setBodyDebugMode(renderState.bodyDebugMode);
viewer.setToonShadowPreview(
  toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
  valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
);
viewer.setFaceSdfDebugMode(renderState.faceSdfDebugMode);
viewer.setFaceSdfDebugLightMode(renderState.faceSdfDebugLightMode);
viewer.setRenderIsolationMode(renderState.renderIsolationMode);
viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
viewer.onCameraDebugChange(() => {
  lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
  renderImportSummary();
});

function copyBodyAsset(base: BodyAssetManifest): BodyAssetManifest {
  return {
    ...base,
    characterId: base.characterId,
    characterHeightMeters: base.characterHeightMeters,
    source: {
      ...base.source,
      animationUrls: base.source.animationUrls
        ? [...base.source.animationUrls]
        : undefined,
    },
    neckAnchor: { ...base.neckAnchor },
    skeleton: {
      ...base.skeleton,
      neckAttach: { ...base.skeleton.neckAttach },
    },
    bodyMaterials: base.bodyMaterials.map((entry) => ({ ...entry })),
    proxy: { ...base.proxy },
  };
}

function copyHeadAsset(base: HeadAssetManifest): HeadAssetManifest {
  return {
    ...base,
    characterId: base.characterId,
    characterHeightMeters: base.characterHeightMeters,
    source: {
      ...base.source,
      animationUrls: base.source.animationUrls
        ? [...base.source.animationUrls]
        : undefined,
    },
    rawImportOffset: { ...base.rawImportOffset },
    assembly: {
      ...base.assembly,
      attachOrigin: { ...base.assembly.attachOrigin },
      boneRemap: base.assembly.boneRemap
        ? { ...base.assembly.boneRemap }
        : undefined,
    },
    faceMaterials: base.faceMaterials.map((entry) => ({ ...entry })),
    morphChannels: base.morphChannels ? [...base.morphChannels] : undefined,
    morphChannelBindings: base.morphChannelBindings
      ? base.morphChannelBindings.map((entry) => ({ ...entry }))
      : undefined,
    proxy: { ...base.proxy },
  };
}

function asRecord(value: unknown): UnknownRecord {
  return (value && typeof value === "object" ? value : {}) as UnknownRecord;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}


function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCharacterId(value: unknown) {
  const raw = readString(value).trim();
  if (!raw) {
    return undefined;
  }
  return raw.padStart(2, "0");
}

function inferCharacterIdFromText(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/characterv2[_/-](\d{1,2})\b/i)
    ?? value.match(/\b(?:body|head|face)-(\d{1,2})\b/i);
  return match ? match[1].padStart(2, "0") : undefined;
}

function resolveCharacterHeightMeters(
  explicit: unknown,
  characterId: string | undefined
) {
  const value = readNumber(explicit, Number.NaN);
  if (Number.isFinite(value) && value > 0) {
    return value > 10 ? value / 100 : value;
  }
  return characterId ? characterHeightMetersById[characterId] : undefined;
}

function applyPreviewCharacterHeightFromAssets(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const nextHeight =
    bodyAsset.characterHeightMeters ??
    headAsset.characterHeightMeters ??
    previewLightDefaults.characterHeight;
  if (Math.abs(previewState.characterHeight - nextHeight) < 0.0001) {
    return;
  }
  previewState.characterHeight = nextHeight;
  viewer.updatePreviewLight(previewState);
}

function readMaterialLighting(value: unknown) {
  const record = asRecord(value);
  return {
    specularPower: readNumber(record.specularPower ?? record.SpecularPower, 0),
    rimThreshold: readNumber(record.rimThreshold ?? record.RimThreshold, 0.2),
    shadowTexWeight: readNumber(record.shadowTexWeight ?? record.ShadowTexWeight, 1),
    saturation: readNumber(record.saturation ?? record.Saturation, 0.5),
    partsAmbientColor: readString(record.partsAmbientColor ?? record.PartsAmbientColor, "#ffffff"),
    reflectionBlendColor: readString(record.reflectionBlendColor ?? record.ReflectionBlendColor, "#ffffff"),
    outlineWidth: readNumber(record.outlineWidth ?? record.OutlineWidth, 0.001),
    outlineOffset: readNumber(record.outlineOffset ?? record.OutlineOffset, 0),
    outlineLightness: readNumber(record.outlineLightness ?? record.OutlineLightness, 0.5),
    shadowWidth: readNumber(record.shadowWidth ?? record.ShadowWidth, 0),
    useOutlineSecondNormal: readNumber(record.useOutlineSecondNormal ?? record.UseOutlineSecondNormal, 0),
    distortionFps: readNumber(record.distortionFps ?? record.DistortionFps, 12),
    distortionIntensity: readNumber(record.distortionIntensity ?? record.DistortionIntensity, 0),
    distortionIntensityX: readNumber(record.distortionIntensityX ?? record.DistortionIntensityX, 0),
    distortionIntensityY: readNumber(record.distortionIntensityY ?? record.DistortionIntensityY, 0),
    distortionOffsetX: readNumber(record.distortionOffsetX ?? record.DistortionOffsetX, 0),
    distortionOffsetY: readNumber(record.distortionOffsetY ?? record.DistortionOffsetY, 0),
    distortionScrollSpeed: readNumber(record.distortionScrollSpeed ?? record.DistortionScrollSpeed, 1),
    distortionScrollX: readNumber(record.distortionScrollX ?? record.DistortionScrollX, 0),
    distortionScrollY: readNumber(record.distortionScrollY ?? record.DistortionScrollY, 0),
    distortionTexTilingX: readNumber(record.distortionTexTilingX ?? record.DistortionTexTilingX, 1),
    distortionTexTilingY: readNumber(record.distortionTexTilingY ?? record.DistortionTexTilingY, 1),
    threshold: readNumber(record.threshold ?? record.Threshold, 0.5),
    lightInfluence: readNumber(record.lightInfluence ?? record.LightInfluence, 1),
    lightInfluenceForEyeHighlight: readNumber(record.lightInfluenceForEyeHighlight ?? record.LightInfluenceForEyeHighlight, 1),
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readVec3Record(value: unknown, fallback: Vec3): Vec3 {
  const record = asRecord(value);
  const readNumber = (camel: string, pascal: string, defaultValue: number) => {
    const next = record[camel] ?? record[pascal];
    return typeof next === "number" ? next : defaultValue;
  };
  return {
    x: readNumber("x", "X", fallback.x),
    y: readNumber("y", "Y", fallback.y),
    z: readNumber("z", "Z", fallback.z),
  };
}

function normalizeBodyManifest(raw: unknown): BodyAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const skeleton = asRecord(record.skeleton ?? record.Skeleton);
  const neckAttach = asRecord(skeleton.neckAttach ?? skeleton.NeckAttach);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const bodyMaterialsRaw: unknown[] = Array.isArray(
    record.bodyMaterials ?? record.BodyMaterials
  )
    ? ((record.bodyMaterials ?? record.BodyMaterials) as unknown[])
    : [];

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId: normalizeCharacterId(record.characterId ?? record.CharacterId)
      ?? inferCharacterIdFromText(readString(skeleton.skeletonId ?? skeleton.SkeletonId)),
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      normalizeCharacterId(record.characterId ?? record.CharacterId)
        ?? inferCharacterIdFromText(readString(skeleton.skeletonId ?? skeleton.SkeletonId))
    ),
    materialPipeline: readString(
      record.materialPipeline ?? record.MaterialPipeline,
      "embedded"
    ) as BodyAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: readString(source.meshUrl ?? source.MeshUrl),
      skeletonUrl: readString(source.skeletonUrl ?? source.SkeletonUrl) || undefined,
      animationUrls: readStringArray(source.animationUrls ?? source.AnimationUrls),
    },
    neckAnchor: readVec3Record(record.neckAnchor ?? record.NeckAnchor, {
      x: 0,
      y: 1.75,
      z: 0.15,
    }),
    skeleton: {
      skeletonId: readString(skeleton.skeletonId ?? skeleton.SkeletonId),
      rootNodeName:
        readString(skeleton.rootNodeName ?? skeleton.RootNodeName) || undefined,
      neckAttach: {
        nodeName:
          readString(neckAttach.nodeName ?? neckAttach.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          neckAttach.fallbackPosition ?? neckAttach.FallbackPosition,
          { x: 0, y: 1.75, z: 0.15 }
        ),
      },
    },
    bodyMaterials: bodyMaterialsRaw.map((entry: unknown) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName:
          readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind:
          readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: readString(slot.mainTex ?? slot.MainTex) || undefined,
        shadowTex: readString(slot.shadowTex ?? slot.ShadowTex) || undefined,
        valueTex: readString(slot.valueTex ?? slot.ValueTex) || undefined,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      bodyColor: readString(proxy.bodyColor ?? proxy.BodyColor, "#f2d0c3"),
      shadowColor: readString(proxy.shadowColor ?? proxy.ShadowColor, "#bf958a"),
      bodyScale:
        typeof (proxy.bodyScale ?? proxy.BodyScale) === "number"
          ? Number(proxy.bodyScale ?? proxy.BodyScale)
          : 1,
      torsoLength:
        typeof (proxy.torsoLength ?? proxy.TorsoLength) === "number"
          ? Number(proxy.torsoLength ?? proxy.TorsoLength)
          : 2.2,
      shoulderWidth:
        typeof (proxy.shoulderWidth ?? proxy.ShoulderWidth) === "number"
          ? Number(proxy.shoulderWidth ?? proxy.ShoulderWidth)
          : 1.1,
    },
  };
}

function normalizeHeadManifest(raw: unknown): HeadAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const assembly = asRecord(record.assembly ?? record.Assembly);
  const attachOrigin = asRecord(assembly.attachOrigin ?? assembly.AttachOrigin);
  const boneRemapRecord = asRecord(assembly.boneRemap ?? assembly.BoneRemap);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const faceMaterialsRaw: unknown[] = Array.isArray(
    record.faceMaterials ?? record.FaceMaterials
  )
    ? ((record.faceMaterials ?? record.FaceMaterials) as unknown[])
    : [];

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId: normalizeCharacterId(record.characterId ?? record.CharacterId)
      ?? inferCharacterIdFromText(readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId)),
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      normalizeCharacterId(record.characterId ?? record.CharacterId)
        ?? inferCharacterIdFromText(readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId))
    ),
    materialPipeline: readString(
      record.materialPipeline ?? record.MaterialPipeline,
      "embedded"
    ) as HeadAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: readString(source.meshUrl ?? source.MeshUrl),
      skeletonUrl: readString(source.skeletonUrl ?? source.SkeletonUrl) || undefined,
      animationUrls: readStringArray(source.animationUrls ?? source.AnimationUrls),
    },
    rawImportOffset: readVec3Record(
      record.rawImportOffset ?? record.RawImportOffset,
      { x: 0, y: 0, z: 0 }
    ),
    assembly: {
      expectedSkeletonId: readString(
        assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId
      ),
      attachOrigin: {
        nodeName:
          readString(attachOrigin.nodeName ?? attachOrigin.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          attachOrigin.fallbackPosition ?? attachOrigin.FallbackPosition,
          { x: 0, y: 0.08, z: 0.02 }
        ),
      },
      rootNodeName:
        readString(assembly.rootNodeName ?? assembly.RootNodeName) || undefined,
      boneRemap: Object.fromEntries(
        Object.entries(boneRemapRecord).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
    },
    defaultFaceMode: readString(
      record.defaultFaceMode ?? record.DefaultFaceMode,
      "clean"
    ) as HeadAssetManifest["defaultFaceMode"],
    morphChannels: readStringArray(record.morphChannels ?? record.MorphChannels),
    morphChannelBindings: Array.isArray(record.morphChannelBindings ?? record.MorphChannelBindings)
      ? ((record.morphChannelBindings ?? record.MorphChannelBindings) as unknown[])
          .map((entry) => asRecord(entry))
          .filter((entry) => typeof entry.nameHash === "number" || typeof entry.NameHash === "number")
          .map((entry) => ({
            name: readString(entry.name ?? entry.Name),
            sourceName: readString(entry.sourceName ?? entry.SourceName),
            nameHash: Number(entry.nameHash ?? entry.NameHash),
            curveHash: Number(entry.curveHash ?? entry.CurveHash),
          }))
      : undefined,
    faceMaterials: faceMaterialsRaw.map((entry: unknown) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName:
          readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind:
          readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: readString(slot.mainTex ?? slot.MainTex) || undefined,
        shadowTex: readString(slot.shadowTex ?? slot.ShadowTex) || undefined,
        faceShadowTex:
          readString(slot.faceShadowTex ?? slot.FaceShadowTex) || undefined,
        mode: readString(slot.mode ?? slot.Mode, "clean") as HeadAssetManifest["defaultFaceMode"],
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      faceColor: readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9"),
      faceShadeColor: readString(
        proxy.faceShadeColor ?? proxy.FaceShadeColor,
        "#f7cdbf"
      ),
      skinColorDefault: readString(
        proxy.skinColorDefault ?? proxy.SkinColorDefault,
        readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9")
      ),
      skinColor1: readString(
        proxy.skinColor1 ?? proxy.SkinColor1,
        readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")
      ),
      skinColor2: readString(
        proxy.skinColor2 ?? proxy.SkinColor2,
        readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")
      ),
      hairColor: readString(proxy.hairColor ?? proxy.HairColor, "#7b5b4a"),
      hairShadowColor: readString(
        proxy.hairShadowColor ?? proxy.HairShadowColor,
        "#513d33"
      ),
      headRadius:
        typeof (proxy.headRadius ?? proxy.HeadRadius) === "number"
          ? Number(proxy.headRadius ?? proxy.HeadRadius)
          : 0.74,
      faceDepth:
        typeof (proxy.faceDepth ?? proxy.FaceDepth) === "number"
          ? Number(proxy.faceDepth ?? proxy.FaceDepth)
          : 0.82,
      hairArc:
        typeof (proxy.hairArc ?? proxy.HairArc) === "number"
          ? Number(proxy.hairArc ?? proxy.HairArc)
          : 0.98,
    },
  };
}

function getNormalizedRelativePath(file: File) {
  const raw = file.webkitRelativePath || file.name;
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : normalized;
}

function findConverterUrl(path: string | undefined) {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\/g, "/");
  const exact = localAssetState.converterUrlByPath.get(normalized);
  if (exact) {
    return exact;
  }

  const basename = normalized.split("/").pop() ?? normalized;
  const byBasename = localAssetState.converterUrlByPath.get(basename);
  if (byBasename) {
    return byBasename;
  }

  for (const [candidate, url] of localAssetState.converterUrlByPath) {
    if (
      candidate === normalized ||
      candidate.endsWith(`/${normalized}`) ||
      normalized.endsWith(`/${candidate}`)
    ) {
      return url;
    }
  }
  return null;
}

function resolveConverterPath(path: string | undefined) {
  if (!path) {
    return path;
  }
  return findConverterUrl(path) ?? path;
}

function normalizeRuntimeBodyManifest(raw: unknown): BodyAssetManifest {
  const manifest = normalizeBodyManifest(raw);
  return {
    ...manifest,
    source: {
      ...manifest.source,
      meshUrl: resolveConverterPath(manifest.source.meshUrl) ?? manifest.source.meshUrl,
      skeletonUrl: resolveConverterPath(manifest.source.skeletonUrl),
      animationUrls: manifest.source.animationUrls?.map((path) => resolveConverterPath(path) ?? path),
    },
  };
}

function normalizeRuntimeHeadManifest(raw: unknown): HeadAssetManifest {
  const manifest = normalizeHeadManifest(raw);
  return {
    ...manifest,
    source: {
      ...manifest.source,
      meshUrl: resolveConverterPath(manifest.source.meshUrl) ?? manifest.source.meshUrl,
      skeletonUrl: resolveConverterPath(manifest.source.skeletonUrl),
      animationUrls: manifest.source.animationUrls?.map((path) => resolveConverterPath(path) ?? path),
    },
  };
}

function applyRuntimeMaterialSlots(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest,
  runtimeExtension: UnknownRecord
) {
  const materialSlots = asRecord(runtimeExtension.materialSlots ?? runtimeExtension.MaterialSlots);
  const bodySlots = readUnknownArray(materialSlots.body ?? materialSlots.Body);
  const headSlots = readUnknownArray(materialSlots.head ?? materialSlots.Head);

  if (bodySlots.length) {
    bodyAsset.bodyMaterials = bodySlots.map((entry) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveConverterPath(readString(slot.mainTex ?? slot.MainTex)) || undefined,
        shadowTex: resolveConverterPath(readString(slot.shadowTex ?? slot.ShadowTex)) || undefined,
        valueTex: resolveConverterPath(readString(slot.valueTex ?? slot.ValueTex)) || undefined,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    });
  }

  if (headSlots.length) {
    headAsset.faceMaterials = headSlots.map((entry) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveConverterPath(readString(slot.mainTex ?? slot.MainTex)) || undefined,
        shadowTex: resolveConverterPath(readString(slot.shadowTex ?? slot.ShadowTex)) || undefined,
        faceShadowTex:
          resolveConverterPath(readString(slot.faceShadowTex ?? slot.FaceShadowTex)) || undefined,
        mode: headAsset.defaultFaceMode,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    });
  }
}

function normalizeRuntimeExtension(raw: unknown) {
  const extension = asRecord(raw);
  const bodyAsset = normalizeRuntimeBodyManifest(extension.bodyManifest ?? extension.BodyManifest);
  const headAsset = normalizeRuntimeHeadManifest(extension.headManifest ?? extension.HeadManifest);
  applyRuntimeMaterialSlots(bodyAsset, headAsset, extension);
  return {
    extension,
    bodyAsset,
    headAsset,
  };
}

function readRuntimePreviewLight(extension: UnknownRecord) {
  const profile = asRecord(
    extension.sekaiRuntimeMaterialProfile ?? extension.SekaiRuntimeMaterialProfile
  );
  const preview = asRecord(
    profile.viewerTunedPreview ?? profile.ViewerTunedPreview
  );
  if (!Object.keys(preview).length) {
    return null;
  }
  // Keep this pass on one known candidate direction even when old imported packages
  // still carry earlier ViewerTunedPreview / PluginPreview vectors.
  const runtimeLightDirection = previewLightDirectionFit;
  return {
    x: runtimeLightDirection.x,
    y: runtimeLightDirection.y,
    z: runtimeLightDirection.z,
    intensity: readNumber(preview.intensity ?? preview.Intensity, previewState.intensity),
    ambient: readNumber(preview.ambient ?? preview.Ambient, previewState.ambient),
    shadowThreshold: previewShadowThresholdFit,
    shadowWeight: readNumber(preview.shadowWeight ?? preview.ShadowWeight, previewState.shadowWeight),
    characterAmbient: readNumber(
      preview.characterAmbient ?? preview.CharacterAmbient,
      previewState.characterAmbient
    ),
    rimIntensity: readNumber(preview.rimIntensity ?? preview.RimIntensity, previewState.rimIntensity),
    rimThreshold: readNumber(preview.rimThreshold ?? preview.RimThreshold, previewState.rimThreshold),
    rimDirectionality: readNumber(
      preview.rimDirectionality ?? preview.RimDirectionality,
      previewState.rimDirectionality
    ),
    faceSoftness: readNumber(preview.faceSoftness ?? preview.FaceSoftness, previewState.faceSoftness),
    faceSdfUseLightDirection: readNumber(
      preview.faceSdfUseLightDirection ?? preview.FaceSdfUseLightDirection,
      previewState.faceSdfUseLightDirection
    ),
    characterHeight: readNumber(
      preview.characterHeight ?? preview.CharacterHeight,
      previewState.characterHeight
    ),
  };
}

function readRuntimeMotionPackage(extension: UnknownRecord) {
  return asRecord(extension.motionPackage ?? extension.MotionPackage);
}

function readEmbeddedFaceMotion(extension: UnknownRecord): FaceMotionSet | null {
  const motionPackage = readRuntimeMotionPackage(extension);
  const faceMotion = motionPackage.faceMotion ?? motionPackage.FaceMotion;
  if (!faceMotion) {
    return null;
  }
  return faceMotion as FaceMotionSet;
}

function readEmbeddedLightMotion(extension: UnknownRecord): LightMotionSet | null {
  const motionPackage = readRuntimeMotionPackage(extension);
  const lightMotion = motionPackage.lightMotion ?? motionPackage.LightMotion;
  if (!lightMotion) {
    return null;
  }
  return lightMotion as LightMotionSet;
}

function readFirstLightValue(clip: LightMotionClip, property: string) {
  const curve = clip.curves.find((entry) => entry.property === property);
  const value = curve?.keyframes[0]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatColorChannel(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function readFirstLightColor(clip: LightMotionClip, prefix: string) {
  const r = readFirstLightValue(clip, `${prefix}.r`);
  const g = readFirstLightValue(clip, `${prefix}.g`);
  const b = readFirstLightValue(clip, `${prefix}.b`);
  if (r === null || g === null || b === null) {
    return null;
  }
  return `#${formatColorChannel(r)}${formatColorChannel(g)}${formatColorChannel(b)}`;
}

function readFirstLightVector(clip: LightMotionClip, prefix: string): Vec3 | null {
  const x = readFirstLightValue(clip, `${prefix}.x`);
  const y = readFirstLightValue(clip, `${prefix}.y`);
  const z = readFirstLightValue(clip, `${prefix}.z`);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { x, y, z };
}

function buildLightControllerPreview(lightMotion: LightMotionSet | null): LightControllerPreview | null {
  if (!lightMotion?.clips.length) {
    return null;
  }
  const preview: LightControllerPreview = { unknownClips: [] };
  for (const clip of lightMotion.clips) {
    const controllerKind = clip.controllerKind ?? "unknown";
    switch (controllerKind) {
      case "ambient":
        preview.ambient = {
          clip: clip.name,
          intensity: readFirstLightValue(clip, "intensity"),
          ambientColor: readFirstLightColor(clip, "ambientColor"),
        };
        break;
      case "directional":
        preview.directional = {
          clip: clip.name,
          shadowColor: readFirstLightColor(clip, "shadowColor"),
          outlineColor: readFirstLightColor(clip, "outlineColor"),
          outlineBlending: readFirstLightValue(clip, "outlineBlending"),
          rotationEuler: readFirstLightVector(clip, "rotationEuler"),
          faceShadowLimitRange: readFirstLightValue(clip, "faceShadowLimitRange"),
          useFaceShadowLimiter: readFirstLightValue(clip, "useFaceShadowLimiter"),
          hasRotationEuler: clip.curves.some((curve) =>
            curve.property === "rotationEuler" || curve.property.startsWith("rotationEuler.")
          ),
        };
        break;
      case "character_ambient":
        preview.characterAmbient = {
          clip: clip.name,
          intensity: readFirstLightValue(clip, "intensity"),
          ambientColor: readFirstLightColor(clip, "ambientColor"),
        };
        break;
      case "character_rim":
        preview.characterRim = {
          clip: clip.name,
          rimColor: readFirstLightColor(clip, "rimColor"),
          shadowRimColor: readFirstLightColor(clip, "shadowRimColor"),
          lightInfluence: readFirstLightValue(clip, "lightInfluence"),
          edgeSmoothness: readFirstLightValue(clip, "edgeSmoothness"),
          shadowSharpness: readFirstLightValue(clip, "shadowSharpness"),
          isUseShadowColor: readFirstLightValue(clip, "isUseShadowColor"),
        };
        break;
      default:
        preview.unknownClips.push(formatLightMotionClip(clip));
        break;
    }
  }
  return preview;
}

function readOptionalLightNumber(value: unknown) {
  const next = readNumber(value, Number.NaN);
  return Number.isFinite(next) ? next : null;
}

function clampLightControllerValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readOptionalVec3Record(value: unknown): Vec3 | null {
  const record = asRecord(value);
  const x = readOptionalLightNumber(record.x ?? record.X);
  const y = readOptionalLightNumber(record.y ?? record.Y);
  const z = readOptionalLightNumber(record.z ?? record.Z);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { x, y, z };
}

function eulerDegreesToViewerLightDirection(euler: Vec3): Vec3 {
  const direction = new THREE.Vector3(0, 0, 1)
    .applyEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(euler.x),
        THREE.MathUtils.degToRad(euler.y),
        THREE.MathUtils.degToRad(euler.z),
        "XYZ"
      )
    )
    .normalize();
  return { x: direction.x, y: direction.y, z: direction.z };
}

function applyLightControllerPreview(preview: LightControllerPreview | null) {
  const directionalShadowColor = readString(preview?.directional?.shadowColor);
  viewer.updateGlobalShadowColor(directionalShadowColor || "#ffffff");
  const ambientColor =
    readString(preview?.characterAmbient?.ambientColor) ||
    readString(preview?.ambient?.ambientColor) ||
    null;
  const isUseShadowColor = readOptionalLightNumber(preview?.characterRim?.isUseShadowColor);
  const shadowRimColor =
    isUseShadowColor === null || isUseShadowColor > 0.5
      ? readString(preview?.characterRim?.shadowRimColor) || null
      : null;
  viewer.updateLightControllerColors({
    ambientColor,
    rimColor: readString(preview?.characterRim?.rimColor) || null,
    shadowRimColor,
  });
  viewer.updateLightControllerRimShape({
    edgeSmoothness: readOptionalLightNumber(preview?.characterRim?.edgeSmoothness),
    shadowSharpness: readOptionalLightNumber(preview?.characterRim?.shadowSharpness),
  });
  viewer.updateLightControllerOutline({
    color: readString(preview?.directional?.outlineColor) || null,
    blending: readOptionalLightNumber(preview?.directional?.outlineBlending),
  });

  let previewLightChanged = false;
  const rotationEuler = readOptionalVec3Record(preview?.directional?.rotationEuler);
  if (rotationEuler) {
    const direction = eulerDegreesToViewerLightDirection(rotationEuler);
    previewState.x = direction.x;
    previewState.y = direction.y;
    previewState.z = direction.z;
    previewLightChanged = true;
  }

  const ambientIntensity = readOptionalLightNumber(preview?.ambient?.intensity);
  if (ambientIntensity !== null) {
    previewState.ambient = clampLightControllerValue(
      previewState.ambient * Math.max(ambientIntensity, 0),
      0,
      0.8
    );
    previewLightChanged = true;
  }

  const characterAmbientIntensity = readOptionalLightNumber(
    preview?.characterAmbient?.intensity
  );
  if (characterAmbientIntensity !== null) {
    previewState.characterAmbient = clampLightControllerValue(
      previewState.characterAmbient * Math.max(characterAmbientIntensity, 0),
      0,
      1
    );
    previewLightChanged = true;
  }

  const rimLightInfluence = readOptionalLightNumber(
    preview?.characterRim?.lightInfluence
  );
  if (rimLightInfluence !== null) {
    previewState.rimIntensity = clampLightControllerValue(
      previewState.rimIntensity * Math.max(rimLightInfluence, 0),
      0,
      1.5
    );
    previewLightChanged = true;
  }

  const faceShadowLimitRange = readOptionalLightNumber(
    preview?.directional?.faceShadowLimitRange
  );
  const useFaceShadowLimiter = readOptionalLightNumber(
    preview?.directional?.useFaceShadowLimiter
  );
  if (
    faceShadowLimitRange !== null &&
    (useFaceShadowLimiter === null || useFaceShadowLimiter > 0.5)
  ) {
    previewState.faceSdfUseLightDirection = clampLightControllerValue(
      faceShadowLimitRange,
      0,
      1
    );
    previewLightChanged = true;
  }

  if (previewLightChanged) {
    viewer.updatePreviewLight(previewState);
  }
}

function readEmbeddedBodyMotionPath(extension: UnknownRecord) {
  const motionPackage = readRuntimeMotionPackage(extension);
  return readString(motionPackage.bodyMotionGlb ?? motionPackage.BodyMotionGlb) || null;
}

function findRuntimeExtensionCandidate(files: File[]) {
  return files.find((file) => /pjsk-sekai-runtime\.extension\.json$/i.test(file.name)) ?? null;
}

function findCombinedCharacterFile(files: File[]) {
  return files.find((file) => /character\.vrm$/i.test(file.name))
    ?? files.find((file) => /character\.vrm-candidate\.glb$/i.test(file.name))
    ?? files.find((file) => /character\.vrm-core\.glb$/i.test(file.name))
    ?? files.find((file) => /character\.springbone\.glb$/i.test(file.name))
    ?? files.find((file) => /character\.glb$/i.test(file.name))
    ?? null;
}

async function parseConverterFolder(files: File[]) {
  localAssetState.converterFiles = files;
  for (const url of new Set(localAssetState.converterUrlByPath.values())) {
    URL.revokeObjectURL(url);
  }
  localAssetState.converterUrlByPath.clear();
  localAssetState.converterDisplayNameByUrl.clear();
  localAssetState.converterBodyManifest = null;
  localAssetState.converterHeadManifest = null;
  localAssetState.converterRuntimeExtension = null;
  localAssetState.converterCombinedCharacter = null;
  localAssetState.converterCombinedFile = null;
  localAssetState.converterBodyMotionPath = null;
  localAssetState.converterBodyMotionUrl = null;
  localAssetState.converterEmbeddedFaceMotionData = null;
  localAssetState.converterEmbeddedLightMotionData = null;
  localAssetState.converterLightControllerPreview = null;
  applyLightControllerPreview(null);
  localAssetState.converterError = "";

  for (const file of files) {
    const relativePath = getNormalizedRelativePath(file);
    const url = URL.createObjectURL(file);
    localAssetState.converterUrlByPath.set(relativePath, url);
    localAssetState.converterUrlByPath.set(file.name, url);
    localAssetState.converterDisplayNameByUrl.set(url, relativePath.split('/').pop() ?? file.name);
  }

  const runtimeExtensionFile = findRuntimeExtensionCandidate(files);
  const combinedCharacterFile = findCombinedCharacterFile(files);

  if (!runtimeExtensionFile || !combinedCharacterFile) {
    localAssetState.converterError =
      "Converter output must contain character/character.vrm and pjsk-sekai-runtime.extension.json.";
    return;
  }

  try {
    const runtime = normalizeRuntimeExtension(
      JSON.parse(await runtimeExtensionFile.text())
    );
    const relativePath = getNormalizedRelativePath(combinedCharacterFile);
    const meshUrl =
      localAssetState.converterUrlByPath.get(relativePath) ??
      localAssetState.converterUrlByPath.get(combinedCharacterFile.name) ??
      URL.createObjectURL(combinedCharacterFile);
    localAssetState.converterRuntimeExtension = runtime.extension;
    localAssetState.converterCombinedFile = combinedCharacterFile;
    const runtimePreview = readRuntimePreviewLight(runtime.extension);
    if (runtimePreview) {
      Object.assign(previewState, runtimePreview);
      viewer.updatePreviewLight(previewState);
    }
    const bodyMotionPath = readEmbeddedBodyMotionPath(runtime.extension);
    const bodyMotionUrl = bodyMotionPath
      ? findConverterUrl(bodyMotionPath)
      : null;
    localAssetState.converterBodyMotionPath = bodyMotionPath;
    localAssetState.converterBodyMotionUrl = bodyMotionUrl;
    const embeddedFaceMotion = readEmbeddedFaceMotion(runtime.extension);
    localAssetState.converterEmbeddedFaceMotionData = embeddedFaceMotion;
    localAssetState.converterEmbeddedLightMotionData =
      readEmbeddedLightMotion(runtime.extension);
    localAssetState.converterLightControllerPreview =
      buildLightControllerPreview(localAssetState.converterEmbeddedLightMotionData);
    applyLightControllerPreview(localAssetState.converterLightControllerPreview);
    if (embeddedFaceMotion) {
      localAssetState.faceMotionData = embeddedFaceMotion;
      localAssetState.faceMotionError = "";
    }
    localAssetState.converterCombinedCharacter = {
      id: `runtime-${runtime.bodyAsset.characterId ?? "unknown"}-${combinedCharacterFile.name}`,
      displayName: `Runtime ${combinedCharacterFile.name}`,
      meshUrl,
      bodyAsset: runtime.bodyAsset,
      headAsset: runtime.headAsset,
      runtimeExtension: runtime.extension,
    };
    localAssetState.converterBodyManifest = runtime.bodyAsset;
    localAssetState.converterHeadManifest = runtime.headAsset;
    if (bodyMotionUrl) {
      localAssetState.converterBodyManifest = {
        ...localAssetState.converterBodyManifest,
        source: {
          ...localAssetState.converterBodyManifest.source,
          animationUrls: [bodyMotionUrl],
        },
      };
      localAssetState.converterCombinedCharacter.bodyAsset =
        localAssetState.converterBodyManifest;
    }
    return;
  } catch (error) {
    localAssetState.converterError =
      error instanceof Error ? error.message : String(error);
  }
}

function buildActiveBodyAsset() {
  const base = localAssetState.converterBodyManifest
    ? copyBodyAsset(localAssetState.converterBodyManifest)
    : copyBodyAsset(getBodyAsset(sampleCatalog, assemblyState.bodyAssetId));
  base.characterId ??= inferCharacterIdFromText(base.skeleton.skeletonId)
    ?? inferCharacterIdFromText(base.id)
    ?? inferCharacterIdFromText(base.source.bundleRoot);
  base.characterHeightMeters ??= base.characterId
    ? characterHeightMetersById[base.characterId]
    : undefined;
  return base;
}

function buildActiveHeadAsset() {
  if (localAssetState.converterHeadManifest) {
    return copyHeadAsset(localAssetState.converterHeadManifest);
  }
  const base = copyHeadAsset(getHeadAsset(sampleCatalog, assemblyState.headAssetId));
  base.characterId ??= inferCharacterIdFromText(base.assembly.expectedSkeletonId)
    ?? inferCharacterIdFromText(base.id)
    ?? inferCharacterIdFromText(base.source.bundleRoot);
  base.characterHeightMeters ??= base.characterId
    ? characterHeightMetersById[base.characterId]
    : undefined;
  base.proxy.skinColorDefault ??= base.proxy.faceColor;
  base.proxy.skinColor1 ??= base.proxy.faceShadeColor;
  base.proxy.skinColor2 ??= base.proxy.faceShadeColor;
  return base;
}

function resolveAnimationDisplayName(url: string) {
  return localAssetState.converterDisplayNameByUrl.get(url)
    ?? (url.split("/").pop() ?? url);
}

function formatAnimationLabel(url: string) {
  const basename = resolveAnimationDisplayName(url);
  return basename.replace(/\.[^.]+$/, "");
}

function getAnimationBasename(url: string) {
  return formatAnimationLabel(url);
}

function isFaceAnimationUrl(url: string) {
  return /^face(?:_loop)?$/i.test(getAnimationBasename(url));
}

function isLoopAnimationUrl(url: string) {
  return /(?:^|[_-])loop$/i.test(getAnimationBasename(url));
}

function isMergedBodyMotionUrl(url: string) {
  return /body[_-]?motion/i.test(getAnimationBasename(url));
}

function getAnimationOptions(bodyAsset: BodyAssetManifest) {
  return (bodyAsset.source.animationUrls ?? [])
    .filter((url) => !isFaceAnimationUrl(url))
    .map((url) => ({
      url,
      label: formatAnimationLabel(url),
      isLoop: isLoopAnimationUrl(url),
    }));
}

function syncAnimationSelection(bodyAsset: BodyAssetManifest) {
  const options = getAnimationOptions(bodyAsset);
  const loopOptions = options.filter((option) => option.isLoop);
  if (!options.length) {
    animationState.selectedMotionUrl = "";
    animationState.selectedLoopUrl = "";
    return options;
  }
  if (!options.some((option) => option.url === animationState.selectedMotionUrl)) {
    animationState.selectedMotionUrl =
      options.find((option) => !option.isLoop)?.url ?? options[0].url;
  }
  if (
    animationState.selectedLoopUrl &&
    !loopOptions.some((option) => option.url === animationState.selectedLoopUrl)
  ) {
    animationState.selectedLoopUrl = "";
  }
  if (
    !animationState.selectedLoopUrl &&
    options.length === 1 &&
    isMergedBodyMotionUrl(options[0].url)
  ) {
    animationState.selectedLoopUrl = options[0].url;
  }
  return options;
}

function buildBodyAnimationSelection(
  bodyAsset: BodyAssetManifest
): BodyAnimationSelection | null {
  const options = syncAnimationSelection(bodyAsset);
  if (!options.length || !animationState.selectedMotionUrl) {
    return null;
  }
  return {
    motionUrl: animationState.selectedMotionUrl,
    loopUrl: animationState.selectedLoopUrl || null,
  };
}

function renderAnimationStatus(
  status: HTMLElement,
  options: { url: string; label: string; isLoop: boolean }[],
  loading = false
) {
  if (loading) {
    status.textContent = "Refreshing import and animation state...";
    return;
  }

  if (!options.length) {
    status.textContent = "No animation URLs declared on the active runtime package.";
    return;
  }

  if (lastAnimationSnapshot?.error) {
    status.textContent = `Animation error: ${lastAnimationSnapshot.error}`;
    return;
  }

  if (lastFaceMotionSnapshot?.error) {
    status.textContent = `Face motion error: ${lastFaceMotionSnapshot.error}`;
    return;
  }

  const configuredLoopInfo = animationState.selectedLoopUrl
    ? ` | Configured Loop: ${formatAnimationLabel(animationState.selectedLoopUrl)}`
    : " | Configured Loop: <none>";
  const trackDebug = lastAnimationSnapshot?.bodyTrackDebug;
  const loopDebug = lastAnimationSnapshot?.bodyLoopTrackDebug;
  const debugInfo = trackDebug
    ? ` | Body Tracks: ${trackDebug.trackCount}, Hair: ${trackDebug.hairTrackCount}, Head/Neck: ${trackDebug.headTrackCount + trackDebug.neckTrackCount}, Upper: ${trackDebug.upperBodyTrackCount}`
    : "";
  const loopDebugInfo = loopDebug
    ? ` | Loop Tracks: ${loopDebug.trackCount}, Hair: ${loopDebug.hairTrackCount}, Head/Neck: ${loopDebug.headTrackCount + loopDebug.neckTrackCount}`
    : "";
  const togglesInfo = lastAnimationSnapshot
    ? ` | Face Morphs: ${lastAnimationSnapshot.faceMotionEnabled ? "on" : "off"} | Head Tracks: ${lastAnimationSnapshot.bodyHeadTracksEnabled ? "on" : "off"}`
    : "";

  if (lastAnimationSnapshot?.activeClipName) {
    const faceInfo = lastFaceMotionSnapshot?.activeClipName
      ? ` | Face: ${lastFaceMotionSnapshot.activeClipName}${lastFaceMotionSnapshot.queuedLoopClipName ? ` -> Loop: ${lastFaceMotionSnapshot.queuedLoopClipName}` : ""} | Morph Maps: ${lastFaceMotionSnapshot.mappedCurveCount} | Face Meshes: ${lastFaceMotionSnapshot.mappedMeshCount}`
      : "";
    const timeInfo =
      lastAnimationSnapshot.duration > 0
        ? ` | Time: ${lastAnimationSnapshot.currentTime.toFixed(2)} / ${lastAnimationSnapshot.duration.toFixed(2)}`
        : "";
    status.textContent = `Active clip: ${lastAnimationSnapshot.activeClipName}${lastAnimationSnapshot.queuedLoopClipName ? ` -> Loop: ${lastAnimationSnapshot.queuedLoopClipName}` : ""}${configuredLoopInfo}${faceInfo} | Speed: ${animationState.speed.toFixed(2)}${animationState.paused ? " | Paused" : ""}${timeInfo}${togglesInfo}${debugInfo}${loopDebugInfo}`;
    return;
  }

  status.textContent = `Selected clip: ${formatAnimationLabel(animationState.selectedMotionUrl)}${configuredLoopInfo}${animationState.paused ? " | Paused" : ""}${togglesInfo}${debugInfo}${loopDebugInfo}`;
}

function getConfiguredFaceMotionSelection() {
  if (!localAssetState.faceMotionData?.clips.length) {
    return {
      clipName: null,
      loopClipName: null,
    };
  }

  if (isLoopAnimationUrl(animationState.selectedMotionUrl)) {
    return {
      clipName: "face_loop",
      loopClipName: null,
    };
  }

  return {
    clipName: "face",
    loopClipName: animationState.selectedLoopUrl ? "face_loop" : null,
  };
}

function renderAnimationControls(loading = false) {
  const { bodyAsset } = getActiveAssets();
  const options = syncAnimationSelection(bodyAsset);
  const select = document.querySelector<HTMLSelectElement>("#animation-select");
  const loopSelect = document.querySelector<HTMLSelectElement>("#animation-loop-select");
  const speed = document.querySelector<HTMLInputElement>("#animation-speed");
  const paused = document.querySelector<HTMLInputElement>("#animation-paused");
  const faceMotionEnabled = document.querySelector<HTMLInputElement>("#face-motion-enabled");
  const bodyHeadTracksEnabled = document.querySelector<HTMLInputElement>(
    "#body-head-tracks-enabled"
  );
  const seek = document.querySelector<HTMLInputElement>("#animation-seek");
  const status = document.querySelector<HTMLElement>("#animation-status");

  if (
    !select ||
    !loopSelect ||
    !speed ||
    !paused ||
    !faceMotionEnabled ||
    !bodyHeadTracksEnabled ||
    !seek ||
    !status
  ) {
    return;
  }

  select.innerHTML = options.length
    ? options
        .map(
          (option) =>
            `<option value="${option.url}" ${option.url === animationState.selectedMotionUrl ? "selected" : ""}>${option.label}</option>`
        )
        .join("")
    : '<option value="">No body animations</option>';
  const loopOptions = options.filter((option) => option.isLoop);
  const mergedLoopOption =
    !loopOptions.length && options.length === 1 && isMergedBodyMotionUrl(options[0].url)
      ? { url: options[0].url, label: "motion_loop", isLoop: true }
      : null;
  const visibleLoopOptions = mergedLoopOption ? [mergedLoopOption] : loopOptions;
  loopSelect.innerHTML = loopOptions.length
    ? [
        '<option value="">No loop handoff</option>',
        ...visibleLoopOptions.map(
          (option) =>
            `<option value="${option.url}" ${option.url === animationState.selectedLoopUrl ? "selected" : ""}>${option.label}</option>`
        ),
      ].join("")
    : mergedLoopOption
      ? [
          '<option value="">No loop handoff</option>',
          `<option value="${mergedLoopOption.url}" ${mergedLoopOption.url === animationState.selectedLoopUrl ? "selected" : ""}>${mergedLoopOption.label}</option>`,
        ].join("")
    : '<option value="">No loop motions detected</option>';
  select.disabled = !options.length || loading;
  loopSelect.disabled = !options.length || loading;
  speed.disabled = !options.length;
  paused.disabled = !options.length;
  faceMotionEnabled.disabled = !options.length;
  bodyHeadTracksEnabled.disabled = !options.length || loading;
  seek.disabled = !options.length || !lastAnimationSnapshot?.duration;
  speed.value = String(animationState.speed);
  paused.checked = animationState.paused;
  faceMotionEnabled.checked = renderState.faceMotionEnabled;
  bodyHeadTracksEnabled.checked = renderState.bodyHeadTracksEnabled;
  const duration = lastAnimationSnapshot?.duration ?? 5;
  seek.max = String(Math.max(duration, 0.01));
  seek.value = String(Math.min(animationState.seekTime, duration));

  renderAnimationStatus(status, options, loading);
}

function renderSpringBoneStatus(loading = false) {
  const status = document.querySelector<HTMLElement>("#springbone-status");
  if (!status) {
    return;
  }

  if (loading) {
    status.textContent = "Loading springBone metadata...";
    return;
  }

  const snapshot = lastSpringBoneSnapshot;
  if (!snapshot || !snapshot.present) {
    status.textContent =
      "No PJSK springBone metadata. Use character.vrm plus PJSK_sekai_runtime.";
    return;
  }

  status.textContent =
    `SpringBone metadata | Body Managers ${snapshot.bodyManagerCount}, Bones ${snapshot.bodySpringBoneCount}, ExtraBone ${snapshot.bodyExtraBoneCount}, Colliders S${snapshot.bodySphereColliderCount}/C${snapshot.bodyCapsuleColliderCount}/P${snapshot.bodyPanelColliderCount} | Head Managers ${snapshot.headManagerCount}, Bones ${snapshot.headSpringBoneCount}, ExtraBone ${snapshot.headExtraBoneCount}, Colliders S${snapshot.headSphereColliderCount}/C${snapshot.headCapsuleColliderCount}/P${snapshot.headPanelColliderCount} | CharacterHair ${snapshot.characterHairPresent ? "yes" : "no"} | CharacterEye ${snapshot.characterEyePresent ? "yes" : "no"} | VRM Manager ${snapshot.vrmSpringBoneManagerPresent ? "yes" : "no"}`;
}

async function applyBodyAnimation(bodyAsset: BodyAssetManifest) {
  viewer.setAnimationSpeed(animationState.speed);
  viewer.setAnimationPaused(animationState.paused);
  lastAnimationSnapshot = await viewer.setAnimationSelection(
    buildBodyAnimationSelection(bodyAsset)
  );
  animationState.seekTime = lastAnimationSnapshot.currentTime;
}

async function applyFaceMotion() {
  const selection = getConfiguredFaceMotionSelection();
  viewer.setFaceMotionSet(
    localAssetState.faceMotionData,
    selection.clipName,
    selection.loopClipName
  );
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
}

function getActiveAssets() {
  return {
    bodyAsset: buildActiveBodyAsset(),
    headAsset: buildActiveHeadAsset(),
    combinedAsset: localAssetState.converterCombinedCharacter,
  };
}

function getCompositionWarnings(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const warnings: string[] = [];
  if (bodyAsset.skeleton.skeletonId !== headAsset.assembly.expectedSkeletonId) {
    warnings.push(
      `Skeleton mismatch: ${bodyAsset.skeleton.skeletonId} vs ${headAsset.assembly.expectedSkeletonId}`
    );
  }
  if (!bodyAsset.skeleton.neckAttach.nodeName) {
    warnings.push(
      "Body manifest has no named neck attach node; viewer will use fallback position."
    );
  }
  if (!headAsset.assembly.attachOrigin.nodeName) {
    warnings.push(
      "Head manifest has no named attach origin node; viewer will use fallback origin."
    );
  }
  if (
    !headAsset.assembly.boneRemap ||
    !Object.keys(headAsset.assembly.boneRemap).length
  ) {
    warnings.push("Head manifest has no bone remap table.");
  }
  return warnings;
}

function clearLocalInputValues() {
  const input = document.querySelector<HTMLInputElement>("#local-converter-folder");
  if (input) {
    input.value = "";
  }
}

function resetLocalOverrides() {
  for (const url of new Set(localAssetState.converterUrlByPath.values())) {
    URL.revokeObjectURL(url);
  }
  localAssetState.converterFiles = [];
  localAssetState.converterUrlByPath.clear();
  localAssetState.converterDisplayNameByUrl.clear();
  localAssetState.converterBodyManifest = null;
  localAssetState.converterHeadManifest = null;
  localAssetState.converterRuntimeExtension = null;
  localAssetState.converterCombinedCharacter = null;
  localAssetState.converterCombinedFile = null;
  localAssetState.converterBodyMotionPath = null;
  localAssetState.converterBodyMotionUrl = null;
  localAssetState.converterEmbeddedFaceMotionData = null;
  localAssetState.converterEmbeddedLightMotionData = null;
  localAssetState.converterLightControllerPreview = null;
  applyLightControllerPreview(null);
  localAssetState.converterError = "";
  localAssetState.faceMotionData = null;
  localAssetState.faceMotionError = "";
}

function formatLightMotionClip(clip: LightMotionClip) {
  const controllerKind = clip.controllerKind ?? "unknown";
  return `${clip.name}:${controllerKind}`;
}

function renderImportSummary(loading = false) {
  const { bodyAsset, headAsset, combinedAsset } = getActiveAssets();
  const summary = document.querySelector<HTMLElement>("#import-summary");
  const assemblyJson = document.querySelector<HTMLElement>("#assembly-json");
  const runtimeDebug = document.querySelector<HTMLElement>("#runtime-debug");

  if (!summary || !assemblyJson || !runtimeDebug) {
    return;
  }

  const bodyImport = lastImportSnapshot?.body;
  const headImport = lastImportSnapshot?.head;
  const bodyStatus = loading
    ? "Loading..."
    : bodyImport?.sourceMode === "glb"
      ? "GLB Loaded"
      : bodyImport?.sourceMode === "proxy"
        ? "Proxy Fallback"
        : "Pending";
  const headStatus = loading
    ? "Loading..."
    : headImport?.sourceMode === "glb"
      ? "GLB Loaded"
      : headImport?.sourceMode === "proxy"
        ? "Proxy Fallback"
        : "Pending";
  const compositionWarnings = getCompositionWarnings(bodyAsset, headAsset);
  const runtimeComposition = lastImportSnapshot?.composition;
  const runtimeMode = loading
    ? "Preparing..."
    : runtimeComposition?.mode ?? "unknown";
  const combinedFileName =
    localAssetState.converterCombinedFile?.name ?? "character.vrm-candidate.glb";
  const runtimeBodyMotionStatus = localAssetState.converterRuntimeExtension
    ? localAssetState.converterBodyMotionPath
      ? localAssetState.converterBodyMotionUrl
        ? `found: ${localAssetState.converterBodyMotionPath}`
        : `missing file: ${localAssetState.converterBodyMotionPath}`
      : "not exported"
    : "";
  const bodySourceLines = `
    <code>Runtime GLB: ${combinedFileName}</code>
    ${bodyImport ? `<code>Combined Meshes: ${bodyImport.meshCount}</code>` : ""}
    <code>Body Material Slots: ${bodyAsset.bodyMaterials.length}</code>
  `;
  const headSourceLines = `
    <code>Runtime GLB: ${combinedFileName}</code>
    ${headImport ? `<code>Combined Meshes: ${headImport.meshCount}</code>` : ""}
    <code>Head Material Slots: ${headAsset.faceMaterials.length}</code>
  `;
  const compositionDetail = `
    <code>Single combined GLB with unified body/head skeleton.</code>
    ${
      runtimeComposition
        ? `<code>Runtime Bone Links: ${runtimeComposition.linkedBoneCount}</code>`
        : ""
    }
    ${
      runtimeComposition?.missingBodyBones.length
        ? runtimeComposition.missingBodyBones
            .map((bone) => `<code>Missing body bone: ${bone}</code>`)
            .join("")
        : ""
    }
    ${
      runtimeComposition?.missingHeadBones.length
        ? runtimeComposition.missingHeadBones
            .map((bone) => `<code>Missing head bone: ${bone}</code>`)
            .join("")
        : ""
    }
  `;

  summary.innerHTML = `
    <div class="summary-card">
      <span class="status-label">Runtime Body</span>
      <strong>${bodyAsset.displayName}</strong>
      <span class="status-line">${bodyStatus}</span>
      ${
        localAssetState.converterBodyManifest
          ? `<code>Converter Folder Mode: active</code>`
          : ""
      }
      ${bodySourceLines}
      ${bodyImport?.error ? `<code>Error: ${bodyImport.error}</code>` : ""}
      <code>Skeleton: ${bodyAsset.skeleton.skeletonId}</code>
      <code>Neck Attach Node: ${bodyAsset.skeleton.neckAttach.nodeName ?? "<fallback only>"}</code>
      ${bodyImport ? `<code>Bones: ${bodyImport.boneCount}, Skinned Meshes: ${bodyImport.skinnedMeshCount}</code>` : ""}
    </div>
    <div class="summary-card">
      <span class="status-label">Runtime Head</span>
      <strong>${headAsset.displayName}</strong>
      <span class="status-line">${headStatus}</span>
      ${
        localAssetState.converterHeadManifest
          ? `<code>Converter Folder Mode: active</code>`
          : ""
      }
      ${headSourceLines}
      ${headImport?.error ? `<code>Error: ${headImport.error}</code>` : ""}
      <code>Expected Skeleton: ${headAsset.assembly.expectedSkeletonId}</code>
      <code>Head Origin Node: ${headAsset.assembly.attachOrigin.nodeName ?? "<fallback only>"}</code>
      ${headImport ? `<code>Bones: ${headImport.boneCount}, Skinned Meshes: ${headImport.skinnedMeshCount}</code>` : ""}
    </div>
    <div class="summary-card">
      <span class="status-label">Composition</span>
      <strong>${runtimeMode}</strong>
      ${compositionDetail}
      ${
        compositionWarnings.length
          ? compositionWarnings.map((warning) => `<code>${warning}</code>`).join("")
          : `<code>Body attach node, head attach origin, and skeleton identity are all present.</code>`
      }
      ${
        localAssetState.converterError
          ? `<code>Converter Error: ${localAssetState.converterError}</code>`
          : ""
      }
      ${
        localAssetState.converterCombinedCharacter
          ? `<code>Runtime GLB: ${combinedFileName}</code>`
          : ""
      }
      ${
        localAssetState.converterRuntimeExtension
          ? `<code>PJSK_sekai_runtime: active</code>`
          : ""
      }
      ${
        localAssetState.converterRuntimeExtension
          ? `<code>Motion Package Body: ${runtimeBodyMotionStatus}</code>`
          : ""
      }
      ${
        localAssetState.converterEmbeddedFaceMotionData?.clips.length
          ? `<code>Motion Package Face: ${localAssetState.converterEmbeddedFaceMotionData.clips.map((clip) => clip.name).join(" -> ")}</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Motion Package Face: <none></code>`
            : ""
      }
      ${
        localAssetState.converterEmbeddedLightMotionData?.clips.length
          ? `<code>Motion Package Light: ${localAssetState.converterEmbeddedLightMotionData.clips.map(formatLightMotionClip).join(" -> ")}</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Motion Package Light: <none></code>`
            : ""
      }
      ${
        lastAnimationSnapshot?.activeClipName
          ? `<code>Runtime Body Clip: ${lastAnimationSnapshot.activeClipName}${
              lastAnimationSnapshot.queuedLoopClipName
                ? ` -> ${lastAnimationSnapshot.queuedLoopClipName}`
                : ""
            }</code>`
          : ""
      }
      ${
        lastFaceMotionSnapshot?.activeClipName
          ? `<code>Runtime Face Clip: ${lastFaceMotionSnapshot.activeClipName}${
              lastFaceMotionSnapshot.queuedLoopClipName
                ? ` -> ${lastFaceMotionSnapshot.queuedLoopClipName}`
                : ""
            } (${lastFaceMotionSnapshot.mappedCurveCount} maps / ${lastFaceMotionSnapshot.mappedMeshCount} meshes)</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Runtime Face Clip: <none></code>`
            : ""
      }
    </div>
  `;

  assemblyJson.textContent = JSON.stringify(
    {
      bodyAssetId: assemblyState.bodyAssetId,
      headAssetId: assemblyState.headAssetId,
      previewLight: previewState,
      bodyCharacterId: bodyAsset.characterId ?? null,
      headCharacterId: headAsset.characterId ?? null,
      characterHeightMeters:
        bodyAsset.characterHeightMeters ?? headAsset.characterHeightMeters ?? null,
      stitchMode: assemblyState.stitchMode,
      bodyNeckAnchor: bodyAsset.neckAnchor,
      bodySkeleton: bodyAsset.skeleton,
      headRawImportOffset: headAsset.rawImportOffset,
      headAssembly: headAsset.assembly,
      faceMode: headAsset.defaultFaceMode,
      selectedBodyMotion: animationState.selectedMotionUrl || null,
      selectedBodyMotionLabel: animationState.selectedMotionUrl ? resolveAnimationDisplayName(animationState.selectedMotionUrl) : null,
      selectedBodyLoopMotion: animationState.selectedLoopUrl || null,
      selectedBodyLoopMotionLabel: animationState.selectedLoopUrl ? resolveAnimationDisplayName(animationState.selectedLoopUrl) : null,
      runtimeCombinedModel: localAssetState.converterCombinedFile?.name ?? null,
      runtimeExtensionLoaded: Boolean(localAssetState.converterRuntimeExtension),
      runtimeBodyMotionPath: localAssetState.converterBodyMotionPath,
      runtimeBodyMotionResolved: Boolean(localAssetState.converterBodyMotionUrl),
      embeddedFaceMotionClips:
        localAssetState.converterEmbeddedFaceMotionData?.clips.map((clip) => clip.name) ?? [],
      embeddedLightMotionClips:
        localAssetState.converterEmbeddedLightMotionData?.clips.map((clip) => ({
          name: clip.name,
          controllerKind: clip.controllerKind ?? "unknown",
          curveCount: clip.curves.length,
          properties: Array.from(new Set(clip.curves.map((curve) => curve.property))).sort(),
        })) ?? [],
      lightControllerPreview: localAssetState.converterLightControllerPreview,
      animationUrls: bodyAsset.source.animationUrls ?? [],
      headMorphChannels: headAsset.morphChannels ?? [],
      headMorphBindings: headAsset.morphChannelBindings ?? [],
      compositionWarnings,
      runtimeComposition,
      runtimeAnimation: lastAnimationSnapshot,
      runtimeFaceMotion: lastFaceMotionSnapshot,
      runtimeSpringBone: lastSpringBoneSnapshot,
    },
    null,
    2
  );

  runtimeDebug.textContent = JSON.stringify(lastRuntimeDebug, null, 2);
  renderAnimationControls(loading);
  renderSpringBoneStatus(loading);
}

async function applyCharacterImport() {
  const run = ++importRun;
  const { bodyAsset, headAsset, combinedAsset } = getActiveAssets();
  applyPreviewCharacterHeightFromAssets(bodyAsset, headAsset);
  lastImportSnapshot = null;
  lastRuntimeDebug = {
    materialBindingMode: renderState.materialBindingMode,
    body: [
      {
        meshName: "<loading>",
        sourceMaterialName: bodyAsset.displayName,
        resolvedKey: "loading",
        resolvedKind: "body",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: "pending",
      },
    ],
    head: [
      {
        meshName: "<loading>",
        sourceMaterialName: headAsset.displayName,
        resolvedKey: "loading",
        resolvedKind: "head",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: "pending",
      },
    ],
    headMorphs: [],
  };
  lastAnimationSnapshot = {
    selectedUrl: animationState.selectedMotionUrl || null,
    selectedLoopUrl: animationState.selectedLoopUrl || null,
    activeClipName: null,
    queuedLoopClipName: null,
    currentTime: 0,
    duration: 0,
    paused: animationState.paused,
    speed: animationState.speed,
    faceMotionEnabled: renderState.faceMotionEnabled,
    bodyHeadTracksEnabled: renderState.bodyHeadTracksEnabled,
    bodyTrackDebug: null,
    bodyLoopTrackDebug: null,
    error: null,
  };
  lastFaceMotionSnapshot = {
    activeClipName: null,
    queuedLoopClipName: null,
    error: null,
    currentTime: 0,
    mappedMeshCount: 0,
    mappedCurveCount: 0,
  };
  lastSpringBoneSnapshot = {
    present: false,
    bodyManagerCount: 0,
    bodySpringBoneCount: 0,
    bodyExtraBoneCount: 0,
    bodySphereColliderCount: 0,
    bodyCapsuleColliderCount: 0,
    bodyPanelColliderCount: 0,
    headManagerCount: 0,
    headSpringBoneCount: 0,
    headExtraBoneCount: 0,
    headSphereColliderCount: 0,
    headCapsuleColliderCount: 0,
    headPanelColliderCount: 0,
    characterHairPresent: false,
    characterEyePresent: false,
    vrmSpringBoneManagerPresent: false,
    source: "none",
  };
  renderImportSummary(true);
  if (!combinedAsset) {
    lastRuntimeDebug = {
      ...lastRuntimeDebug,
      body: [
        {
          meshName: "<waiting-for-runtime-package>",
          sourceMaterialName: bodyAsset.displayName,
          resolvedKey: "missing_runtime_package",
          resolvedKind: "body",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: "pending",
        },
      ],
      head: [
        {
          meshName: "<waiting-for-runtime-package>",
          sourceMaterialName: headAsset.displayName,
          resolvedKey: "missing_runtime_package",
          resolvedKind: "head",
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: "pending",
        },
      ],
    };
    renderImportSummary();
    return;
  }
  viewer.setMaterialBindingMode(renderState.materialBindingMode);
  viewer.setBodyDebugMode(renderState.bodyDebugMode);
  viewer.setToonShadowPreview(
    toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
    valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
  );
  viewer.setRenderIsolationMode(renderState.renderIsolationMode);
  viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
  const snapshot = await viewer.importCombinedCharacter(combinedAsset);
  if (run !== importRun) {
    return;
  }
  lastImportSnapshot = snapshot;
  lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  viewer.updateAssembly(assemblyState);
  viewer.setRenderIsolationMode(renderState.renderIsolationMode);
  viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
  await applyBodyAnimation(bodyAsset);
  await applyFaceMotion();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderImportSummary();
}

void applyCharacterImport();
viewer.updatePreviewLight(previewState);
renderAnimationControls();
renderSpringBoneStatus();

window.setInterval(() => {
  const status = document.querySelector<HTMLElement>("#animation-status");
  if (!status) {
    return;
  }
  const { bodyAsset } = getActiveAssets();
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderAnimationStatus(status, syncAnimationSelection(bodyAsset));
  renderSpringBoneStatus();
}, 250);

document
  .querySelectorAll<HTMLSelectElement>("select[data-render-key]")
  .forEach((select) => {
    select.addEventListener("change", () => {
      const key = select.dataset.renderKey;
      if (key === "materialBindingMode") {
        renderState.materialBindingMode = select.value as MaterialBindingMode;
        void applyCharacterImport();
      }
      if (key === "faceSdfDebugMode") {
        renderState.faceSdfDebugMode = select.value as FaceSdfDebugMode;
        viewer.setFaceSdfDebugMode(renderState.faceSdfDebugMode);
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "bodyDebugMode") {
        renderState.bodyDebugMode = select.value as BodyDebugMode;
        viewer.setBodyDebugMode(renderState.bodyDebugMode);
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "toonShadowSmoothMode") {
        renderState.toonShadowSmoothMode = select.value as ToonShadowSmoothMode;
        viewer.setToonShadowPreview(
          toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
          valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
        );
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "valueShadowInfluenceMode") {
        renderState.valueShadowInfluenceMode = select.value as ValueShadowInfluenceMode;
        viewer.setToonShadowPreview(
          toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
          valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
        );
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "faceSdfDebugLightMode") {
        renderState.faceSdfDebugLightMode = select.value as FaceSdfDebugLightMode;
        viewer.setFaceSdfDebugLightMode(renderState.faceSdfDebugLightMode);
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "renderIsolationMode") {
        renderState.renderIsolationMode = select.value as RenderIsolationMode;
        viewer.setRenderIsolationMode(renderState.renderIsolationMode);
        lastRuntimeDebug = viewer.getRuntimeDebugSnapshot();
        renderImportSummary();
      }
      if (key === "characterYawMode") {
        renderState.characterYawMode = select.value as CharacterYawMode;
        viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
      }
    });
  });

document
  .querySelectorAll<HTMLInputElement>("input[data-local-key]")
  .forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.localKey;

      if (key === "converterFolder") {
        await parseConverterFolder(Array.from(input.files ?? []));
      }

      void applyCharacterImport();
    });
  });

const clearLocalButton =
  document.querySelector<HTMLButtonElement>("#clear-local-assets");

clearLocalButton?.addEventListener("click", () => {
  resetLocalOverrides();
  clearLocalInputValues();
  void applyCharacterImport();
});

window.addEventListener("beforeunload", () => viewer.destroy());
window.addEventListener("beforeunload", () => resetLocalOverrides());

const animationSelect = document.querySelector<HTMLSelectElement>("#animation-select");
animationSelect?.addEventListener("change", () => {
  animationState.selectedMotionUrl = animationSelect.value;
  const { bodyAsset } = getActiveAssets();
  void applyBodyAnimation(bodyAsset)
    .then(() => applyFaceMotion())
    .then(() => renderImportSummary());
});

const animationLoopSelect = document.querySelector<HTMLSelectElement>("#animation-loop-select");
animationLoopSelect?.addEventListener("change", () => {
  animationState.selectedLoopUrl = animationLoopSelect.value;
  const { bodyAsset } = getActiveAssets();
  void applyBodyAnimation(bodyAsset)
    .then(() => applyFaceMotion())
    .then(() => renderImportSummary());
});

const animationSpeed = document.querySelector<HTMLInputElement>("#animation-speed");
animationSpeed?.addEventListener("input", () => {
  animationState.speed = Number(animationSpeed.value);
  viewer.setAnimationSpeed(animationState.speed);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const animationPaused = document.querySelector<HTMLInputElement>("#animation-paused");
animationPaused?.addEventListener("change", () => {
  animationState.paused = animationPaused.checked;
  viewer.setAnimationPaused(animationState.paused);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const faceMotionEnabled = document.querySelector<HTMLInputElement>("#face-motion-enabled");
faceMotionEnabled?.addEventListener("change", () => {
  renderState.faceMotionEnabled = faceMotionEnabled.checked;
  viewer.setFaceMotionEnabled(renderState.faceMotionEnabled);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const bodyHeadTracksEnabled = document.querySelector<HTMLInputElement>(
  "#body-head-tracks-enabled"
);
bodyHeadTracksEnabled?.addEventListener("change", () => {
  renderState.bodyHeadTracksEnabled = bodyHeadTracksEnabled.checked;
  viewer.setBodyHeadTracksEnabled(renderState.bodyHeadTracksEnabled);
  void applyFaceMotion().then(() => {
    lastAnimationSnapshot = viewer.getAnimationSnapshot();
    lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
    renderAnimationControls();
    renderSpringBoneStatus();
  });
});

const animationSeek = document.querySelector<HTMLInputElement>("#animation-seek");
animationSeek?.addEventListener("input", () => {
  animationState.seekTime = Number(animationSeek.value);
  viewer.seekAnimation(animationState.seekTime);
  animationState.paused = true;
  const pausedInput = document.querySelector<HTMLInputElement>("#animation-paused");
  if (pausedInput) {
    pausedInput.checked = true;
  }
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderAnimationControls();
  renderSpringBoneStatus();
});
