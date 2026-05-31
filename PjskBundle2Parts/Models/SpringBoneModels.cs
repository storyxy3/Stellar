using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace PjskBundle2Parts.Models;

public sealed record SpringBoneExport(
    int Version,
    string BundlePath,
    string PartKind,
    IReadOnlyList<SpringMonoBehaviourEntry> Managers,
    IReadOnlyList<SpringBoneEntry> Bones,
    IReadOnlyList<SpringColliderEntry> SphereColliders,
    IReadOnlyList<SpringColliderEntry> CapsuleColliders,
    IReadOnlyList<SpringColliderEntry> PanelColliders,
    IReadOnlyList<SpringMonoBehaviourEntry> ForceProviders,
    IReadOnlyList<SpringExtraBoneEntry> ExtraBones,
    SpringCharacterHairEntry? CharacterHair,
    SpringCharacterEyeEntry? CharacterEye,
    IReadOnlyList<string> Warnings
);

public sealed record CombinedSpringBoneExport(
    int Version,
    SpringBoneExport Body,
    SpringBoneExport Head
);

public sealed record SpringObjectRef(
    int FileId,
    long PathId,
    string? Name,
    string? TransformPath,
    bool? ActiveSelf = null,
    bool? ActiveInHierarchy = null
);

public sealed record SpringMonoBehaviourEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    JsonObject Raw
);

public sealed record SpringBoneEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    SpringObjectRef? PivotNode,
    float? Radius,
    float? StiffnessForce,
    float? DragForce,
    float? WindInfluence,
    SpringVector3? SpringForce,
    IReadOnlyList<SpringObjectRef> LengthLimitTargets,
    IReadOnlyList<SpringObjectRef> Colliders,
    JsonObject Raw
);

public sealed record SpringColliderEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    SpringObjectRef? LinkedRenderer,
    bool? LinkedRendererEnabled,
    float? Radius,
    float? Height,
    SpringVector3? Center,
    SpringVector3? Direction,
    JsonObject Raw
);

public sealed record SpringExtraBoneEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    SpringObjectRef? ReferenceBone,
    int? RotationOrder,
    float? Coefficient,
    SpringVector3? DefaultEulerAngles,
    int? AxisX,
    int? AxisY,
    int? AxisZ,
    JsonObject Raw
);

public sealed record SpringCharacterHairEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    SpringObjectRef? HeadTransform,
    SpringVector3? Offset,
    JsonObject Raw
);

public sealed record SpringCharacterEyeEntry(
    long PathId,
    string ScriptName,
    SpringObjectRef? GameObject,
    float? LightInfluence,
    float? LightInfluenceForEyeHighlight,
    SpringColor? TintColor,
    SpringColor? EmissionColor,
    SpringTextureTiling? BaseTiling,
    SpringTextureTiling? HighlightTiling,
    float? LeftEyeCloseBlendShapeValue,
    float? RightEyeCloseBlendShapeValue,
    JsonObject Raw
);

public sealed record SpringVector3(
    float X,
    float Y,
    float Z
);

public sealed record SpringColor(
    float R,
    float G,
    float B,
    float A
);

public sealed record SpringTextureTiling(
    int TileX,
    int TileY,
    int Sample
);

public sealed record VrmSpringBoneCandidate(
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("source")] VrmSpringBoneCandidateSource Source,
    [property: JsonPropertyName("normalization")] VrmSpringBoneNormalizationProfile Normalization,
    [property: JsonPropertyName("vrmExtensionDraft")] VrmSpringBoneExtensionDraft VrmExtensionDraft,
    [property: JsonPropertyName("partSummaries")] IReadOnlyList<VrmSpringBonePartSummary> PartSummaries,
    [property: JsonPropertyName("warnings")] IReadOnlyList<string> Warnings
);

public sealed record VrmSpringBoneCandidateSource(
    [property: JsonPropertyName("bodyBundlePath")] string BodyBundlePath,
    [property: JsonPropertyName("headBundlePath")] string HeadBundlePath,
    [property: JsonPropertyName("nodeIndexStatus")] string NodeIndexStatus,
    [property: JsonPropertyName("mappingStatus")] string MappingStatus
);

public sealed record VrmSpringBoneNormalizationProfile(
    [property: JsonPropertyName("stiffnessFormula")] string StiffnessFormula,
    [property: JsonPropertyName("hitRadiusFormula")] string HitRadiusFormula,
    [property: JsonPropertyName("dragForceFormula")] string DragForceFormula,
    [property: JsonPropertyName("gravityFormula")] string GravityFormula,
    [property: JsonPropertyName("capsuleTailFormula")] string CapsuleTailFormula
);

public sealed record VrmSpringBoneExtensionDraft(
    [property: JsonPropertyName("specVersion")] string SpecVersion,
    [property: JsonPropertyName("colliders")] IReadOnlyList<VrmSpringBoneColliderCandidate> Colliders,
    [property: JsonPropertyName("colliderGroups")] IReadOnlyList<VrmSpringBoneColliderGroupCandidate> ColliderGroups,
    [property: JsonPropertyName("springs")] IReadOnlyList<VrmSpringBoneSpringCandidate> Springs
);

public sealed record VrmSpringBonePartSummary(
    [property: JsonPropertyName("partKind")] string PartKind,
    [property: JsonPropertyName("managerCount")] int ManagerCount,
    [property: JsonPropertyName("springBoneCount")] int SpringBoneCount,
    [property: JsonPropertyName("sphereColliderCount")] int SphereColliderCount,
    [property: JsonPropertyName("capsuleColliderCount")] int CapsuleColliderCount,
    [property: JsonPropertyName("panelColliderCount")] int PanelColliderCount,
    [property: JsonPropertyName("springCount")] int SpringCount
);

public sealed record VrmSpringBoneColliderCandidate(
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("partKind")] string PartKind,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("sourcePathId")] long SourcePathId,
    [property: JsonPropertyName("scriptName")] string ScriptName,
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("linkedRenderer")] VrmSpringBoneObjectRefCandidate? LinkedRenderer,
    [property: JsonPropertyName("linkedRendererEnabled")] bool? LinkedRendererEnabled,
    [property: JsonPropertyName("node")] int? Node,
    [property: JsonPropertyName("nodeName")] string? NodeName,
    [property: JsonPropertyName("nodePath")] string? NodePath,
    [property: JsonPropertyName("shape")] VrmSpringBoneColliderShapeCandidate Shape
);

public sealed record VrmSpringBoneObjectRefCandidate(
    [property: JsonPropertyName("fileId")] int FileId,
    [property: JsonPropertyName("pathId")] long PathId,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("transformPath")] string? TransformPath
);

public sealed record VrmSpringBoneColliderShapeCandidate(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("sphere")] VrmSpringBoneSphereColliderCandidate? Sphere,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("capsule")] VrmSpringBoneCapsuleColliderCandidate? Capsule,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("panel")] VrmSpringBonePanelColliderCandidate? Panel
);

public sealed record VrmSpringBoneSphereColliderCandidate(
    [property: JsonPropertyName("offset")] float[] Offset,
    [property: JsonPropertyName("radius")] float Radius
);

public sealed record VrmSpringBoneCapsuleColliderCandidate(
    [property: JsonPropertyName("offset")] float[] Offset,
    [property: JsonPropertyName("radius")] float Radius,
    [property: JsonPropertyName("tail")] float[] Tail
);

public sealed record VrmSpringBonePanelColliderCandidate(
    [property: JsonPropertyName("width")] float Width,
    [property: JsonPropertyName("height")] float Height
);

public sealed record VrmSpringBoneColliderGroupCandidate(
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("partKind")] string PartKind,
    [property: JsonPropertyName("sourceSpringBonePathId")] long SourceSpringBonePathId,
    [property: JsonPropertyName("colliders")] IReadOnlyList<int> Colliders,
    [property: JsonPropertyName("sourceColliderPathIds")] IReadOnlyList<long> SourceColliderPathIds
);

public sealed record VrmSpringBoneSpringCandidate(
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("partKind")] string PartKind,
    [property: JsonPropertyName("managerPathId")] long SourceManagerPathId,
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("automaticUpdates")] bool AutomaticUpdates,
    [property: JsonPropertyName("enableLengthLimits")] bool EnableLengthLimits,
    [property: JsonPropertyName("enableAngleLimits")] bool EnableAngleLimits,
    [property: JsonPropertyName("enableCollision")] bool EnableCollision,
    [property: JsonPropertyName("collideWithGround")] bool CollideWithGround,
    [property: JsonPropertyName("groundHeight")] float GroundHeight,
    [property: JsonPropertyName("isSumOfForcesOnBone")] bool IsSumOfForcesOnBone,
    [property: JsonPropertyName("isPaused")] bool IsPaused,
    [property: JsonPropertyName("dynamicRatio")] float DynamicRatio,
    [property: JsonPropertyName("simulationFrameRate")] int SimulationFrameRate,
    [property: JsonPropertyName("slowMotionScale")] float SlowMotionScale,
    [property: JsonPropertyName("bounce")] float Bounce,
    [property: JsonPropertyName("friction")] float Friction,
    [property: JsonPropertyName("animatedBoneNames")] IReadOnlyList<string> AnimatedBoneNames,
    [property: JsonPropertyName("rawGravity")] SpringVector3? RawGravity,
    [property: JsonPropertyName("forceProviders")] IReadOnlyList<VrmSpringBoneForceProviderCandidate> ForceProviders,
    [property: JsonPropertyName("center")] int? Center,
    [property: JsonPropertyName("centerName")] string? CenterName,
    [property: JsonPropertyName("centerPath")] string? CenterPath,
    [property: JsonPropertyName("joints")] IReadOnlyList<VrmSpringBoneJointCandidate> Joints,
    [property: JsonPropertyName("colliderGroups")] IReadOnlyList<int> ColliderGroups,
    [property: JsonPropertyName("jointColliderGroups")] IReadOnlyDictionary<long, IReadOnlyList<int>> JointColliderGroups
);

public sealed record VrmSpringBoneForceProviderCandidate(
    [property: JsonPropertyName("sourcePathId")] long SourcePathId,
    [property: JsonPropertyName("scriptName")] string ScriptName,
    [property: JsonPropertyName("nodeName")] string? NodeName,
    [property: JsonPropertyName("nodePath")] string? NodePath,
    [property: JsonPropertyName("activeSelf")] bool? ActiveSelf,
    [property: JsonPropertyName("activeInHierarchy")] bool? ActiveInHierarchy,
    [property: JsonPropertyName("raw")] JsonObject Raw
);

public sealed record VrmSpringBoneJointCandidate(
    [property: JsonPropertyName("node")] int? Node,
    [property: JsonPropertyName("nodeName")] string? NodeName,
    [property: JsonPropertyName("nodePath")] string? NodePath,
    [property: JsonPropertyName("sourcePathId")] long SourcePathId,
    [property: JsonPropertyName("pivotNodeName")] string? PivotNodeName,
    [property: JsonPropertyName("pivotNodePath")] string? PivotNodePath,
    [property: JsonPropertyName("pivotSourcePathId")] long? PivotSourcePathId,
    [property: JsonPropertyName("hitRadius")] float HitRadius,
    [property: JsonPropertyName("stiffness")] float Stiffness,
    [property: JsonPropertyName("dragForce")] float DragForce,
    [property: JsonPropertyName("gravityPower")] float GravityPower,
    [property: JsonPropertyName("gravityDir")] float[] GravityDir,
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("rawStiffnessForce")] float? RawStiffnessForce,
    [property: JsonPropertyName("rawSpringForce")] SpringVector3? RawSpringForce,
    [property: JsonPropertyName("rawWindInfluence")] float? RawWindInfluence,
    [property: JsonPropertyName("rawAngularStiffness")] float? RawAngularStiffness,
    [property: JsonPropertyName("rawSpringConstant")] float? RawSpringConstant,
    [property: JsonPropertyName("lengthLimitTargets")] IReadOnlyList<VrmSpringBoneLengthLimitTargetCandidate> LengthLimitTargets,
    [property: JsonPropertyName("rawAngleLimits")] VrmSpringBoneAngleLimitsCandidate RawAngleLimits
);

public sealed record VrmSpringBoneLengthLimitTargetCandidate(
    [property: JsonPropertyName("nodeName")] string? NodeName,
    [property: JsonPropertyName("nodePath")] string? NodePath,
    [property: JsonPropertyName("sourcePathId")] long SourcePathId
);

public sealed record VrmSpringBoneAngleLimitsCandidate(
    [property: JsonPropertyName("y")] VrmSpringBoneAxisLimitCandidate? Y,
    [property: JsonPropertyName("z")] VrmSpringBoneAxisLimitCandidate? Z
);

public sealed record VrmSpringBoneAxisLimitCandidate(
    [property: JsonPropertyName("active")] bool Active,
    [property: JsonPropertyName("min")] float? Min,
    [property: JsonPropertyName("max")] float? Max
);

public sealed record VrmcSpringBoneBuildResult(
    VrmcSpringBoneExtension Extension,
    VrmcSpringBoneResolveReport Report
);

public sealed record VrmcSpringBoneExtension(
    [property: JsonPropertyName("specVersion")] string SpecVersion,
    [property: JsonPropertyName("colliders")] IReadOnlyList<VrmcSpringBoneCollider> Colliders,
    [property: JsonPropertyName("colliderGroups")] IReadOnlyList<VrmcSpringBoneColliderGroup> ColliderGroups,
    [property: JsonPropertyName("springs")] IReadOnlyList<VrmcSpringBoneSpring> Springs
);

public sealed record VrmcSpringBoneCollider(
    [property: JsonPropertyName("node")] int Node,
    [property: JsonPropertyName("shape")] VrmcSpringBoneColliderShape Shape
);

public sealed record VrmcSpringBoneColliderShape(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("sphere")] VrmSpringBoneSphereColliderCandidate? Sphere,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("capsule")] VrmSpringBoneCapsuleColliderCandidate? Capsule
);

public sealed record VrmcSpringBoneColliderGroup(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("colliders")] IReadOnlyList<int> Colliders
);

public sealed record VrmcSpringBoneSpring(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: JsonPropertyName("center")] int? Center,
    [property: JsonPropertyName("joints")] IReadOnlyList<VrmcSpringBoneJoint> Joints,
    [property: JsonPropertyName("colliderGroups")] IReadOnlyList<int> ColliderGroups
);

public sealed record VrmcSpringBoneJoint(
    [property: JsonPropertyName("node")] int Node,
    [property: JsonPropertyName("hitRadius")] float HitRadius,
    [property: JsonPropertyName("stiffness")] float Stiffness,
    [property: JsonPropertyName("gravityPower")] float GravityPower,
    [property: JsonPropertyName("gravityDir")] float[] GravityDir,
    [property: JsonPropertyName("dragForce")] float DragForce
);

public sealed record VrmcSpringBoneResolveReport(
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("glbPath")] string GlbPath,
    [property: JsonPropertyName("nodeCount")] int NodeCount,
    [property: JsonPropertyName("candidateColliderCount")] int CandidateColliderCount,
    [property: JsonPropertyName("resolvedColliderCount")] int ResolvedColliderCount,
    [property: JsonPropertyName("candidateSpringCount")] int CandidateSpringCount,
    [property: JsonPropertyName("resolvedSpringCount")] int ResolvedSpringCount,
    [property: JsonPropertyName("candidateJointCount")] int CandidateJointCount,
    [property: JsonPropertyName("resolvedJointCount")] int ResolvedJointCount,
    [property: JsonPropertyName("skippedColliders")] IReadOnlyList<VrmcSpringBoneSkippedNode> SkippedColliders,
    [property: JsonPropertyName("skippedJoints")] IReadOnlyList<VrmcSpringBoneSkippedNode> SkippedJoints,
    [property: JsonPropertyName("pathMatches")] IReadOnlyList<VrmcSpringBonePathMatch> PathMatches,
    [property: JsonPropertyName("warnings")] IReadOnlyList<string> Warnings
);

public sealed record VrmcSpringBoneSkippedNode(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("sourceName")] string? SourceName,
    [property: JsonPropertyName("sourcePath")] string? SourcePath,
    [property: JsonPropertyName("reason")] string Reason
);

public sealed record VrmcSpringBonePathMatch(
    [property: JsonPropertyName("sourcePath")] string SourcePath,
    [property: JsonPropertyName("resolvedNode")] int ResolvedNode,
    [property: JsonPropertyName("resolvedPath")] string ResolvedPath,
    [property: JsonPropertyName("matchMode")] string MatchMode
);
