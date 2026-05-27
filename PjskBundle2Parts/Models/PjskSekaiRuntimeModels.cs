using System.Text.Json.Serialization;

namespace PjskBundle2Parts.Models;

public sealed record PjskSekaiRuntimeBuildResult(
    PjskSekaiRuntimeExtension Extension,
    PjskSekaiRuntimeResolveReport Report
);

public sealed record PjskSekaiRuntimeExtension(
    [property: JsonPropertyName("specVersion")] string SpecVersion,
    [property: JsonPropertyName("profileVersion")] int ProfileVersion,
    [property: JsonPropertyName("character")] PjskSekaiRuntimeCharacter Character,
    [property: JsonPropertyName("container")] PjskSekaiRuntimeContainer Container,
    [property: JsonPropertyName("bodyHeadAssembly")] PjskSekaiRuntimeAssembly BodyHeadAssembly,
    [property: JsonPropertyName("sekaiRuntimeMaterialProfile")] SekaiRuntimeMaterialProfile SekaiRuntimeMaterialProfile,
    [property: JsonPropertyName("bodyManifest")] BodyAssetManifest BodyManifest,
    [property: JsonPropertyName("headManifest")] HeadAssetManifest HeadManifest,
    [property: JsonPropertyName("materialSlots")] PjskSekaiRuntimeMaterialSlots MaterialSlots,
    [property: JsonPropertyName("textureRoles")] IReadOnlyList<PjskSekaiRuntimeTextureRole> TextureRoles,
    [property: JsonPropertyName("characterTextures")] IReadOnlyDictionary<string, string> CharacterTextures,
    [property: JsonPropertyName("morphChannelBindings")] IReadOnlyList<HeadMorphChannel> MorphChannelBindings,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("motionPackage")] PjskSekaiRuntimeMotionPackage? MotionPackage,
    [property: JsonPropertyName("characterControllers")] PjskSekaiRuntimeCharacterControllers CharacterControllers,
    [property: JsonPropertyName("pjskSpringBone")] PjskSekaiRuntimeSpringBonePayload PjskSpringBone,
    [property: JsonPropertyName("springBoneSourceMetadata")] PjskSekaiRuntimeSpringBoneSourceMetadata SpringBoneSourceMetadata,
    [property: JsonPropertyName("viewerHints")] PjskSekaiRuntimeViewerHints ViewerHints,
    [property: JsonPropertyName("notes")] IReadOnlyList<string> Notes
);

public sealed record PjskSekaiRuntimeCharacter(
    [property: JsonPropertyName("characterId")] string CharacterId,
    [property: JsonPropertyName("skeletonId")] string SkeletonId,
    [property: JsonPropertyName("characterHeightMeters")] float CharacterHeightMeters,
    [property: JsonPropertyName("bodyBundlePath")] string BodyBundlePath,
    [property: JsonPropertyName("headBundlePath")] string HeadBundlePath,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("costume")] PjskSekaiRuntimeCostumeMetadata? Costume
);

public sealed record PjskSekaiRuntimeCostumeMetadata(
    [property: JsonPropertyName("character3dId")] int Character3dId,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("bodyCostume3dId")] int BodyCostume3dId,
    [property: JsonPropertyName("bodyAssetbundleName")] string BodyAssetbundleName,
    [property: JsonPropertyName("hairCostume3dId")] int HairCostume3dId,
    [property: JsonPropertyName("hairAssetbundleName")] string HairAssetbundleName,
    [property: JsonPropertyName("hairBundleKind")] string HairBundleKind,
    [property: JsonPropertyName("hairVariantGroupKey")] string HairVariantGroupKey,
    [property: JsonPropertyName("headCostume3dId")] int HeadCostume3dId,
    [property: JsonPropertyName("headAssetbundleName")] string HeadAssetbundleName,
    [property: JsonPropertyName("headBundleKind")] string HeadBundleKind,
    [property: JsonPropertyName("headVariantGroupKey")] string HeadVariantGroupKey,
    [property: JsonPropertyName("headCompositionKind")] string HeadCompositionKind,
    [property: JsonPropertyName("mainHeadAssetbundleName")] string MainHeadAssetbundleName,
    [property: JsonPropertyName("mainHeadMode")] string MainHeadMode,
    [property: JsonPropertyName("mainHeadCostumeType")] string MainHeadCostumeType,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("headTextureFallbackAssetbundleName")] string? HeadTextureFallbackAssetbundleName,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("accessoryHeadAssetbundleName")] string? AccessoryHeadAssetbundleName,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("accessoryAttachNode")] string? AccessoryAttachNode,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("accessoryColorAssetbundleName")] string? AccessoryColorAssetbundleName
);

public sealed record PjskSekaiRuntimeContainer(
    [property: JsonPropertyName("sourceGlb")] string SourceGlb,
    [property: JsonPropertyName("preferredContainer")] string PreferredContainer,
    [property: JsonPropertyName("fallbackContainer")] string FallbackContainer,
    [property: JsonPropertyName("phase")] string Phase,
    [property: JsonPropertyName("requiresCustomViewerForExactRender")] bool RequiresCustomViewerForExactRender
);

public sealed record PjskSekaiRuntimeAssembly(
    [property: JsonPropertyName("bodyRootNodeName")] string? BodyRootNodeName,
    [property: JsonPropertyName("headRootNodeName")] string? HeadRootNodeName,
    [property: JsonPropertyName("bodyNeckAttach")] AssemblyAnchor BodyNeckAttach,
    [property: JsonPropertyName("headAttachOrigin")] AssemblyAnchor HeadAttachOrigin,
    [property: JsonPropertyName("boneRemap")] IReadOnlyDictionary<string, string> BoneRemap,
    [property: JsonPropertyName("stitchMode")] string StitchMode
);

public sealed record PjskSekaiRuntimeMaterialSlots(
    [property: JsonPropertyName("body")] IReadOnlyList<PjskSekaiRuntimeMaterialSlot> Body,
    [property: JsonPropertyName("head")] IReadOnlyList<PjskSekaiRuntimeMaterialSlot> Head
);

public sealed record PjskSekaiRuntimeMaterialSlot(
    [property: JsonPropertyName("part")] string Part,
    [property: JsonPropertyName("meshName")] string MeshName,
    [property: JsonPropertyName("materialName")] string? MaterialName,
    [property: JsonPropertyName("materialKind")] string MaterialKind,
    [property: JsonPropertyName("mainTex")] string? MainTex,
    [property: JsonPropertyName("shadowTex")] string? ShadowTex,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("valueTex")] string? ValueTex,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("faceShadowTex")] string? FaceShadowTex,
    [property: JsonPropertyName("renderOrder")] int RenderOrder,
    [property: JsonPropertyName("shaderPipeline")] string ShaderPipeline,
    [property: JsonPropertyName("lighting")] MaterialLightingSettings Lighting
);

public sealed record PjskSekaiRuntimeTextureRole(
    [property: JsonPropertyName("part")] string Part,
    [property: JsonPropertyName("materialName")] string? MaterialName,
    [property: JsonPropertyName("materialKind")] string MaterialKind,
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("uri")] string Uri
);

public sealed record PjskSekaiRuntimeMotionPackage(
    [property: JsonPropertyName("sourcePath")] string SourcePath,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("bodyMotionGlb")] string? BodyMotionGlb,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("faceMotion")] PjskFaceMotionSet? FaceMotion,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("lightMotion")] PjskLightMotionSet? LightMotion
);

public sealed record PjskSekaiRuntimeSpringBonePayload(
    [property: JsonPropertyName("raw")] CombinedSpringBoneExport Raw,
    [property: JsonPropertyName("vrmCandidate")] VrmSpringBoneCandidate VrmCandidate
);

public sealed record PjskSekaiRuntimeCharacterControllers(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("hair")] SpringCharacterHairEntry? Hair,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("eye")] SpringCharacterEyeEntry? Eye
);

public sealed record PjskSekaiRuntimeSpringBoneSourceMetadata(
    [property: JsonPropertyName("rawSpringBoneJson")] string RawSpringBoneJson,
    [property: JsonPropertyName("vrmSpringBoneCandidateJson")] string VrmSpringBoneCandidateJson,
    [property: JsonPropertyName("vrmcSpringBoneExtensionJson")] string VrmcSpringBoneExtensionJson,
    [property: JsonPropertyName("embeddedExtension")] string EmbeddedExtension
);

public sealed record PjskSekaiRuntimeViewerHints(
    [property: JsonPropertyName("materialBindingMode")] string MaterialBindingMode,
    [property: JsonPropertyName("faceMode")] string FaceMode,
    [property: JsonPropertyName("bodyPipeline")] string BodyPipeline,
    [property: JsonPropertyName("facePipeline")] string FacePipeline,
    [property: JsonPropertyName("layerPipeline")] string LayerPipeline,
    [property: JsonPropertyName("preserveGltfMaterialsAsFallback")] bool PreserveGltfMaterialsAsFallback
);

public sealed record PjskSekaiRuntimeResolveReport(
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("extensionName")] string ExtensionName,
    [property: JsonPropertyName("sourceGlb")] string SourceGlb,
    [property: JsonPropertyName("bodyMaterialSlotCount")] int BodyMaterialSlotCount,
    [property: JsonPropertyName("headMaterialSlotCount")] int HeadMaterialSlotCount,
    [property: JsonPropertyName("textureRoleCount")] int TextureRoleCount,
    [property: JsonPropertyName("characterTextureCount")] int CharacterTextureCount,
    [property: JsonPropertyName("morphChannelBindingCount")] int MorphChannelBindingCount,
    [property: JsonPropertyName("embeddedFaceMotionClipCount")] int EmbeddedFaceMotionClipCount,
    [property: JsonPropertyName("bodyMotionGlb")] string? BodyMotionGlb,
    [property: JsonPropertyName("missingTextureRoles")] IReadOnlyList<PjskSekaiRuntimeMissingTextureRole> MissingTextureRoles,
    [property: JsonPropertyName("warnings")] IReadOnlyList<string> Warnings
);

public sealed record PjskSekaiRuntimeMissingTextureRole(
    [property: JsonPropertyName("part")] string Part,
    [property: JsonPropertyName("meshName")] string MeshName,
    [property: JsonPropertyName("materialName")] string? MaterialName,
    [property: JsonPropertyName("materialKind")] string MaterialKind,
    [property: JsonPropertyName("role")] string Role
);
