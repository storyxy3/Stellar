using System.Text.Json.Nodes;
using PjskBundle2Parts.Models;

namespace PjskBundle2Parts.Services;

public sealed class VrmSpringBoneCandidateBuilder
{
    private const float DefaultColliderRadius = 0.01f;
    private const float DefaultJointRadius = 0.02f;
    private const float DefaultCapsuleHeight = 0.05f;

    public VrmSpringBoneCandidate Build(CombinedSpringBoneExport raw)
    {
        var warnings = new List<string>();
        var colliders = new List<VrmSpringBoneColliderCandidate>();
        var colliderGroups = new List<VrmSpringBoneColliderGroupCandidate>();
        var springs = new List<VrmSpringBoneSpringCandidate>();
        var colliderIndexByKey = new Dictionary<SpringColliderKey, int>();

        AddColliders(raw.Body, colliders, colliderIndexByKey, warnings);
        AddColliders(raw.Head, colliders, colliderIndexByKey, warnings);

        var bodySpringCount = AddSprings(
            raw.Body,
            colliderIndexByKey,
            null,
            colliderGroups,
            springs,
            warnings
        );
        var headSpringCount = AddSprings(
            raw.Head,
            colliderIndexByKey,
            raw.Body,
            colliderGroups,
            springs,
            warnings
        );

        return new VrmSpringBoneCandidate(
            Version: 1,
            Source: new VrmSpringBoneCandidateSource(
                BodyBundlePath: raw.Body.BundlePath,
                HeadBundlePath: raw.Head.BundlePath,
                NodeIndexStatus: "pending_final_gltf_node_indices",
                MappingStatus: "candidate_uses_source_transform_paths_and_path_ids"
            ),
            Normalization: new VrmSpringBoneNormalizationProfile(
                StiffnessFormula: "stiffness = clamp(raw.stiffnessForce / 300, 0, 4); raw values are preserved per joint",
                HitRadiusFormula: "hitRadius = raw.radius",
                DragForceFormula: "dragForce = clamp(raw.dragForce, 0, 1)",
                GravityFormula: "gravityPower = length(raw.springForce); gravityDir = normalize(raw.springForce), fallback [0,-1,0] when zero",
                CapsuleTailFormula: "tail = [0, raw.height, 0]; AssetStudio/SharpGLTF conversion maps Sekai capsule length to GLB local Y for arm colliders"
            ),
            VrmExtensionDraft: new VrmSpringBoneExtensionDraft(
                SpecVersion: "VRMC_springBone-1.0-draft-candidate",
                Colliders: colliders,
                ColliderGroups: colliderGroups,
                Springs: springs
            ),
            PartSummaries: new[]
            {
                BuildPartSummary(raw.Body, bodySpringCount),
                BuildPartSummary(raw.Head, headSpringCount),
            },
            Warnings: warnings
        );
    }

    private static void AddColliders(
        SpringBoneExport part,
        List<VrmSpringBoneColliderCandidate> colliders,
        Dictionary<SpringColliderKey, int> colliderIndexByKey,
        List<string> warnings
    )
    {
        foreach (var collider in part.SphereColliders)
        {
            AddCollider(
                part.PartKind,
                collider,
                BuildSphereShape(collider),
                colliders,
                colliderIndexByKey
            );
        }

        foreach (var collider in part.CapsuleColliders)
        {
            AddCollider(
                part.PartKind,
                collider,
                BuildCapsuleShape(collider),
                colliders,
                colliderIndexByKey
            );
        }

        if (part.PanelColliders.Count > 0)
        {
            warnings.Add(
                $"{part.PartKind}: SpringPanelCollider is present but VRM springBone has no direct panel collider shape; panel colliders were not mapped."
            );
        }
    }

    private static void AddCollider(
        string partKind,
        SpringColliderEntry collider,
        VrmSpringBoneColliderShapeCandidate shape,
        List<VrmSpringBoneColliderCandidate> colliders,
        Dictionary<SpringColliderKey, int> colliderIndexByKey
    )
    {
        var key = new SpringColliderKey(partKind, collider.PathId);
        if (colliderIndexByKey.ContainsKey(key))
        {
            return;
        }

        var index = colliders.Count;
        var name = BuildObjectName(collider.GameObject, collider.ScriptName, collider.PathId);
        colliders.Add(new VrmSpringBoneColliderCandidate(
            Index: index,
            PartKind: partKind,
            Name: $"{partKind}:{name}",
            SourcePathId: collider.PathId,
            ScriptName: collider.ScriptName,
            Node: null,
            NodeName: collider.GameObject?.Name,
            NodePath: collider.GameObject?.TransformPath,
            Shape: shape
        ));
        colliderIndexByKey[key] = index;
    }

    private static int AddSprings(
        SpringBoneExport part,
        IReadOnlyDictionary<SpringColliderKey, int> colliderIndexByKey,
        SpringBoneExport? bodyPartForInferredColliders,
        List<VrmSpringBoneColliderGroupCandidate> colliderGroups,
        List<VrmSpringBoneSpringCandidate> springs,
        List<string> warnings
    )
    {
        var springCountBefore = springs.Count;
        var bonesByPathId = part.Bones.ToDictionary(bone => bone.PathId);

        foreach (var manager in part.Managers)
        {
            var managerBones = ReadObjectPathIds(manager.Raw, "springBones")
                .Select(pathId =>
                {
                    if (bonesByPathId.TryGetValue(pathId, out var bone))
                    {
                        return bone;
                    }
                    warnings.Add(
                        $"{part.PartKind}: SpringManager {manager.PathId} references missing SpringBone PathID {pathId}."
                    );
                    return null;
                })
                .Where(bone => bone is not null)
                .Cast<SpringBoneEntry>()
                .ToList();

            foreach (var chain in BuildChains(managerBones))
            {
                var jointColliderGroups = new Dictionary<long, IReadOnlyList<int>>();
                var springColliderGroups = new SortedSet<int>();
                var joints = new List<VrmSpringBoneJointCandidate>();

                foreach (var bone in chain.Bones)
                {
                    var colliderPathIds = ReadColliderPathIds(bone.Raw).Distinct().ToList();
                    var colliderIndexes = new List<int>();

                    foreach (var colliderPathId in colliderPathIds)
                    {
                        if (colliderIndexByKey.TryGetValue(
                                new SpringColliderKey(part.PartKind, colliderPathId),
                                out var colliderIndex))
                        {
                            colliderIndexes.Add(colliderIndex);
                        }
                        else
                        {
                            warnings.Add(
                                $"{part.PartKind}: SpringBone {BuildObjectName(bone.GameObject, bone.ScriptName, bone.PathId)} references unsupported or missing collider PathID {colliderPathId}."
                            );
                        }
                    }

                    if (colliderIndexes.Count > 0)
                    {
                        var groupIndex = colliderGroups.Count;
                        colliderGroups.Add(new VrmSpringBoneColliderGroupCandidate(
                            Index: groupIndex,
                            Name: $"{part.PartKind}:{BuildObjectName(bone.GameObject, bone.ScriptName, bone.PathId)}:colliders",
                            PartKind: part.PartKind,
                            SourceSpringBonePathId: bone.PathId,
                            Colliders: colliderIndexes,
                            SourceColliderPathIds: colliderPathIds
                        ));
                        springColliderGroups.Add(groupIndex);
                        jointColliderGroups[bone.PathId] = new[] { groupIndex };
                    }
                    else
                    {
                        jointColliderGroups[bone.PathId] = Array.Empty<int>();
                    }

                    joints.Add(BuildJoint(bone));
                }

                if (joints.Count == 0)
                {
                    continue;
                }

                var inferredColliderGroup = BuildInferredHeadHairColliderGroup(
                    part,
                    chain,
                    bodyPartForInferredColliders,
                    colliderIndexByKey,
                    colliderGroups.Count,
                    warnings
                );
                if (inferredColliderGroup is not null)
                {
                    colliderGroups.Add(inferredColliderGroup);
                    springColliderGroups.Add(inferredColliderGroup.Index);
                    foreach (var bone in chain.Bones)
                    {
                        var flag = ReadInt(bone.Raw, "colliderFlag") ?? 0;
                        if (flag == 0)
                        {
                            continue;
                        }

                        jointColliderGroups[bone.PathId] = jointColliderGroups[bone.PathId]
                            .Concat(new[] { inferredColliderGroup.Index })
                            .Distinct()
                            .ToList();
                    }
                }

                var springIndex = springs.Count;
                springs.Add(new VrmSpringBoneSpringCandidate(
                    Index: springIndex,
                    Name: $"{part.PartKind}:{chain.RootName}",
                    PartKind: part.PartKind,
                    SourceManagerPathId: manager.PathId,
                    Center: null,
                    CenterName: manager.GameObject?.Name,
                    CenterPath: manager.GameObject?.TransformPath,
                    Joints: joints,
                    ColliderGroups: springColliderGroups.ToList(),
                    JointColliderGroups: jointColliderGroups
                ));
            }
        }

        return springs.Count - springCountBefore;
    }

    private static VrmSpringBoneColliderGroupCandidate? BuildInferredHeadHairColliderGroup(
        SpringBoneExport part,
        SpringBoneChain chain,
        SpringBoneExport? bodyPart,
        IReadOnlyDictionary<SpringColliderKey, int> colliderIndexByKey,
        int groupIndex,
        List<string> warnings
    )
    {
        if (!string.Equals(part.PartKind, "Head", StringComparison.OrdinalIgnoreCase) ||
            bodyPart is null ||
            !chain.Bones.Any(IsHairSpringBone))
        {
            return null;
        }

        var colliderFlag = chain.Bones
            .Select(bone => ReadInt(bone.Raw, "colliderFlag") ?? 0)
            .Aggregate(0, (current, flag) => current | flag);
        if (colliderFlag == 0)
        {
            return null;
        }

        var sourceColliders = bodyPart.SphereColliders
            .Concat(bodyPart.CapsuleColliders)
            .Where(collider => MatchesInferredHeadHairCollider(collider, colliderFlag))
            .ToList();
        var colliderIndexes = sourceColliders
            .Select(collider => colliderIndexByKey.TryGetValue(
                new SpringColliderKey(bodyPart.PartKind, collider.PathId),
                out var index)
                    ? index
                    : (int?)null)
            .Where(index => index is not null)
            .Select(index => index!.Value)
            .Distinct()
            .ToList();

        if (colliderIndexes.Count == 0)
        {
            warnings.Add(
                $"{part.PartKind}: Spring chain {chain.RootName} has colliderFlag {colliderFlag}, but no body colliders matched the inferred upper-body collision set."
            );
            return null;
        }

        var sourcePathIds = sourceColliders
            .Select(collider => collider.PathId)
            .Distinct()
            .ToList();
        var sourceSpringBonePathId = chain.Bones
            .FirstOrDefault(bone => (ReadInt(bone.Raw, "colliderFlag") ?? 0) != 0)
            ?.PathId ?? 0;

        return new VrmSpringBoneColliderGroupCandidate(
            Index: groupIndex,
            Name: $"{part.PartKind}:{chain.RootName}:colliderFlag:{colliderFlag}:body_upper",
            PartKind: bodyPart.PartKind,
            SourceSpringBonePathId: sourceSpringBonePathId,
            Colliders: colliderIndexes,
            SourceColliderPathIds: sourcePathIds
        );
    }

    private static bool IsHairSpringBone(SpringBoneEntry bone)
    {
        return ContainsOrdinalIgnoreCase(bone.GameObject?.Name, "hair") ||
            ContainsOrdinalIgnoreCase(bone.PivotNode?.Name, "hair") ||
            ContainsOrdinalIgnoreCase(bone.GameObject?.TransformPath, "hair") ||
            ContainsOrdinalIgnoreCase(bone.PivotNode?.TransformPath, "hair");
    }

    private static bool MatchesInferredHeadHairCollider(
        SpringColliderEntry collider,
        int colliderFlag
    )
    {
        var name = collider.GameObject?.Name ?? string.Empty;
        var path = collider.GameObject?.TransformPath ?? string.Empty;
        if (!path.StartsWith("body/Position/PositionOffset/Hip/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var isCoreUpperBody =
            string.Equals(name, "CL_ChestSphereCollider", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(name, "CL_ChestSphereCollider_Top", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(name, "CL_ChestSphereCollider_Head", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(name, "CL_ChestSphereCollider_Center", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(name, "CL_SpineSphereCollider", StringComparison.OrdinalIgnoreCase);
        var isLeftUpperBody =
            ContainsOrdinalIgnoreCase(name, "CL_ChestSphereCollider_L") ||
            ContainsOrdinalIgnoreCase(name, "CL_Left_ArmCapsuleCollider") ||
            ContainsOrdinalIgnoreCase(name, "CL_Left_ElbowCapsuleCollider");
        var isRightUpperBody =
            ContainsOrdinalIgnoreCase(name, "CL_ChestSphereCollider_R") ||
            ContainsOrdinalIgnoreCase(name, "CL_Right_ArmCapsuleCollider") ||
            ContainsOrdinalIgnoreCase(name, "CL_Right_ElbowCapsuleCollider");

        return ((colliderFlag & 2) != 0 && isCoreUpperBody) ||
            ((colliderFlag & 4) != 0 && isLeftUpperBody) ||
            ((colliderFlag & 8) != 0 && isRightUpperBody);
    }

    private static VrmSpringBonePartSummary BuildPartSummary(
        SpringBoneExport part,
        int springCount
    )
    {
        return new VrmSpringBonePartSummary(
            PartKind: part.PartKind,
            ManagerCount: part.Managers.Count,
            SpringBoneCount: part.Bones.Count,
            SphereColliderCount: part.SphereColliders.Count,
            CapsuleColliderCount: part.CapsuleColliders.Count,
            PanelColliderCount: part.PanelColliders.Count,
            SpringCount: springCount
        );
    }

    private static VrmSpringBoneJointCandidate BuildJoint(SpringBoneEntry bone)
    {
        var springForce = bone.SpringForce ?? new SpringVector3(0f, 0f, 0f);
        var gravityPower = Magnitude(springForce);
        var gravityDir = gravityPower > 0.00001f
            ? new[]
            {
                springForce.X / gravityPower,
                springForce.Y / gravityPower,
                springForce.Z / gravityPower,
            }
            : new[] { 0f, -1f, 0f };

        return new VrmSpringBoneJointCandidate(
            Node: null,
            NodeName: bone.GameObject?.Name,
            NodePath: bone.GameObject?.TransformPath,
            SourcePathId: bone.PathId,
            PivotNodeName: bone.PivotNode?.Name,
            PivotNodePath: bone.PivotNode?.TransformPath,
            PivotSourcePathId: bone.PivotNode?.PathId,
            HitRadius: MathF.Max(0f, bone.Radius ?? DefaultJointRadius),
            Stiffness: Clamp((bone.StiffnessForce ?? 300f) / 300f, 0f, 4f),
            DragForce: Clamp(bone.DragForce ?? 0.4f, 0f, 1f),
            GravityPower: gravityPower,
            GravityDir: gravityDir,
            Enabled: ReadBool(bone.Raw, "m_Enabled") ?? true,
            RawStiffnessForce: bone.StiffnessForce,
            RawSpringForce: bone.SpringForce,
            RawAngularStiffness: ReadFloat(bone.Raw, "angularStiffness"),
            RawSpringConstant: ReadFloat(bone.Raw, "SpringConstant"),
            RawAngleLimits: new VrmSpringBoneAngleLimitsCandidate(
                Y: ReadAxisLimit(bone.Raw, "yAngleLimits"),
                Z: ReadAxisLimit(bone.Raw, "zAngleLimits")
            )
        );
    }

    private static IReadOnlyList<SpringBoneChain> BuildChains(
        IReadOnlyList<SpringBoneEntry> bones
    )
    {
        if (bones.Count == 0)
        {
            return Array.Empty<SpringBoneChain>();
        }

        var orderByPathId = bones
            .Select((bone, index) => new { bone.PathId, index })
            .ToDictionary(entry => entry.PathId, entry => entry.index);
        var nodePaths = bones
            .SelectMany(bone => new[] { bone.PivotNode?.TransformPath, bone.GameObject?.TransformPath })
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Cast<string>()
            .ToHashSet(StringComparer.Ordinal);
        var rootPaths = nodePaths
            .Where(path =>
            {
                var parent = ParentPath(path);
                return parent is null || !nodePaths.Contains(parent);
            })
            .OrderBy(PathDepth)
            .ThenBy(path => path, StringComparer.Ordinal)
            .ToList();

        if (rootPaths.Count == 0)
        {
            return new[]
            {
                new SpringBoneChain(
                    RootPath: "unresolved",
                    RootName: "unresolved",
                    Bones: OrderChainBones(bones, orderByPathId).ToList()
                ),
            };
        }

        var assigned = new HashSet<long>();
        var chains = new List<SpringBoneChain>();
        foreach (var rootPath in rootPaths)
        {
            var chainBones = bones
                .Where(bone => !assigned.Contains(bone.PathId))
                .Where(bone =>
                    IsSameOrDescendant(bone.GameObject?.TransformPath, rootPath) ||
                    IsSameOrDescendant(bone.PivotNode?.TransformPath, rootPath))
                .ToList();

            if (chainBones.Count == 0)
            {
                continue;
            }

            foreach (var bone in chainBones)
            {
                assigned.Add(bone.PathId);
            }

            chains.Add(new SpringBoneChain(
                RootPath: rootPath,
                RootName: Path.GetFileName(rootPath),
                Bones: OrderChainBones(chainBones, orderByPathId).ToList()
            ));
        }

        var leftovers = bones
            .Where(bone => !assigned.Contains(bone.PathId))
            .ToList();
        if (leftovers.Count > 0)
        {
            chains.Add(new SpringBoneChain(
                RootPath: "unresolved",
                RootName: "unresolved",
                Bones: OrderChainBones(leftovers, orderByPathId).ToList()
            ));
        }

        return chains;
    }

    private static IEnumerable<SpringBoneEntry> OrderChainBones(
        IEnumerable<SpringBoneEntry> bones,
        IReadOnlyDictionary<long, int> orderByPathId
    )
    {
        return bones
            .OrderBy(bone => PathDepth(bone.GameObject?.TransformPath))
            .ThenBy(bone => orderByPathId.TryGetValue(bone.PathId, out var order) ? order : int.MaxValue);
    }

    private static VrmSpringBoneColliderShapeCandidate BuildSphereShape(
        SpringColliderEntry collider
    )
    {
        return new VrmSpringBoneColliderShapeCandidate(
            Sphere: new VrmSpringBoneSphereColliderCandidate(
                Offset: ToArray(collider.Center),
                Radius: MathF.Max(0f, collider.Radius ?? DefaultColliderRadius)
            ),
            Capsule: null
        );
    }

    private static VrmSpringBoneColliderShapeCandidate BuildCapsuleShape(
        SpringColliderEntry collider
    )
    {
        var height = MathF.Max(0f, collider.Height ?? DefaultCapsuleHeight);
        return new VrmSpringBoneColliderShapeCandidate(
            Sphere: null,
            Capsule: new VrmSpringBoneCapsuleColliderCandidate(
                Offset: ToArray(collider.Center),
                Radius: MathF.Max(0f, collider.Radius ?? DefaultColliderRadius),
                Tail: new[] { 0f, height, 0f }
            )
        );
    }

    private static IEnumerable<long> ReadColliderPathIds(JsonObject raw)
    {
        foreach (var pathId in ReadObjectPathIds(raw, "colliders"))
        {
            yield return pathId;
        }
        foreach (var pathId in ReadObjectPathIds(raw, "sphereColliders"))
        {
            yield return pathId;
        }
        foreach (var pathId in ReadObjectPathIds(raw, "capsuleColliders"))
        {
            yield return pathId;
        }
        foreach (var pathId in ReadObjectPathIds(raw, "panelColliders"))
        {
            yield return pathId;
        }
    }

    private static IEnumerable<long> ReadObjectPathIds(JsonObject raw, string key)
    {
        if (!TryGetProperty(raw, key, out var value) || value is not JsonArray array)
        {
            yield break;
        }

        foreach (var item in array)
        {
            if (item is not JsonObject obj)
            {
                continue;
            }
            var pathId = ReadLong(obj, "m_PathID") ?? 0;
            if (pathId != 0)
            {
                yield return pathId;
            }
        }
    }

    private static VrmSpringBoneAxisLimitCandidate? ReadAxisLimit(
        JsonObject raw,
        string key
    )
    {
        if (!TryGetProperty(raw, key, out var value) || value is not JsonObject obj)
        {
            return null;
        }

        return new VrmSpringBoneAxisLimitCandidate(
            Active: ReadBool(obj, "active") ?? false,
            Min: ReadFloat(obj, "min"),
            Max: ReadFloat(obj, "max")
        );
    }

    private static float? ReadFloat(JsonObject obj, string key)
    {
        if (!TryGetProperty(obj, key, out var value) || value is null)
        {
            return null;
        }
        if (value.GetValueKind() == System.Text.Json.JsonValueKind.Number &&
            value.AsValue().TryGetValue<float>(out var result))
        {
            return result;
        }
        return null;
    }

    private static bool? ReadBool(JsonObject obj, string key)
    {
        if (!TryGetProperty(obj, key, out var value) || value is null)
        {
            return null;
        }

        return value.GetValueKind() switch
        {
            System.Text.Json.JsonValueKind.True => true,
            System.Text.Json.JsonValueKind.False => false,
            System.Text.Json.JsonValueKind.Number when value.AsValue().TryGetValue<int>(out var result) => result != 0,
            System.Text.Json.JsonValueKind.Number when value.AsValue().TryGetValue<long>(out var result) => result != 0,
            System.Text.Json.JsonValueKind.Number when value.AsValue().TryGetValue<float>(out var result) => MathF.Abs(result) > 0.00001f,
            _ => null,
        };
    }

    private static long? ReadLong(JsonObject obj, string key)
    {
        if (!TryGetProperty(obj, key, out var value) || value is null)
        {
            return null;
        }
        return value.GetValueKind() == System.Text.Json.JsonValueKind.Number &&
            value.AsValue().TryGetValue<long>(out var result)
                ? result
                : null;
    }

    private static bool TryGetProperty(JsonObject obj, string key, out JsonNode? value)
    {
        if (obj.TryGetPropertyValue(key, out value))
        {
            return true;
        }
        var pair = obj.FirstOrDefault(entry =>
            string.Equals(entry.Key, key, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(pair.Key))
        {
            value = pair.Value;
            return true;
        }
        value = null;
        return false;
    }

    private static int? ReadInt(JsonObject obj, string key)
    {
        if (!TryGetProperty(obj, key, out var value) || value is null)
        {
            return null;
        }
        if (value.GetValueKind() != System.Text.Json.JsonValueKind.Number)
        {
            return null;
        }

        if (value.AsValue().TryGetValue<int>(out var intResult))
        {
            return intResult;
        }
        if (value.AsValue().TryGetValue<long>(out var longResult))
        {
            return longResult >= int.MinValue && longResult <= int.MaxValue
                ? (int)longResult
                : null;
        }
        if (value.AsValue().TryGetValue<float>(out var floatResult))
        {
            return floatResult >= int.MinValue && floatResult <= int.MaxValue
                ? (int)floatResult
                : null;
        }
        return null;
    }

    private static bool ContainsOrdinalIgnoreCase(string? source, string value)
    {
        return source?.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static string? ParentPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var index = path.LastIndexOf('/');
        return index <= 0 ? null : path[..index];
    }

    private static int PathDepth(string? path)
    {
        return string.IsNullOrWhiteSpace(path)
            ? int.MaxValue
            : path.Count(character => character == '/');
    }

    private static bool IsSameOrDescendant(string? path, string rootPath)
    {
        return !string.IsNullOrWhiteSpace(path) &&
            (string.Equals(path, rootPath, StringComparison.Ordinal) ||
             path.StartsWith($"{rootPath}/", StringComparison.Ordinal));
    }

    private static string BuildObjectName(
        SpringObjectRef? reference,
        string fallbackPrefix,
        long pathId
    )
    {
        return !string.IsNullOrWhiteSpace(reference?.Name)
            ? reference.Name
            : $"{fallbackPrefix}:{pathId}";
    }

    private static float[] ToArray(SpringVector3? vector)
    {
        return vector is null
            ? new[] { 0f, 0f, 0f }
            : new[] { vector.X, vector.Y, vector.Z };
    }

    private static float Magnitude(SpringVector3 vector)
    {
        return MathF.Sqrt(
            vector.X * vector.X +
            vector.Y * vector.Y +
            vector.Z * vector.Z
        );
    }

    private static float Clamp(float value, float min, float max)
    {
        return MathF.Min(max, MathF.Max(min, value));
    }

    private sealed record SpringColliderKey(string PartKind, long PathId);

    private sealed record SpringBoneChain(
        string RootPath,
        string RootName,
        IReadOnlyList<SpringBoneEntry> Bones
    );
}
