using PjskBundle2Parts.Models;
using System.Text.Json.Nodes;

namespace PjskBundle2Parts.Services;

public sealed class PjskSekaiRuntimeExtensionBuilder
{
    public PjskSekaiRuntimeBuildResult Build(
        ConversionPlan plan,
        IReadOnlyDictionary<string, string> characterTexturePathByName,
        string sourceGlbPath,
        CombinedSpringBoneExport combinedSpringBone,
        VrmSpringBoneCandidate vrmSpringBoneCandidate,
        MotionExportResult? motionExport = null,
        ResolvedCharacter3dCostume? resolvedCharacter3dCostume = null
    )
    {
        var bodySlots = plan.BodyManifestTemplate.BodyMaterials
            .Select(slot => new PjskSekaiRuntimeMaterialSlot(
                Part: "body",
                MeshName: slot.MeshName,
                MaterialName: slot.MaterialName,
                MaterialKind: slot.MaterialKind,
                MainTex: RewriteCharacterTexturePath("body", slot.MainTex, characterTexturePathByName),
                ShadowTex: RewriteCharacterTexturePath("body", slot.ShadowTex, characterTexturePathByName),
                ValueTex: RewriteCharacterTexturePath("body", slot.ValueTex, characterTexturePathByName),
                FaceShadowTex: null,
                RenderOrder: 0,
                ShaderPipeline: plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.BodyPipeline,
                Lighting: slot.Lighting
            ))
            .ToList();
        var headSlots = plan.HeadManifestTemplate.FaceMaterials
            .Select(slot => new PjskSekaiRuntimeMaterialSlot(
                Part: "head",
                MeshName: slot.MeshName,
                MaterialName: slot.MaterialName,
                MaterialKind: slot.MaterialKind,
                MainTex: RewriteCharacterTexturePath("head", slot.MainTex, characterTexturePathByName),
                ShadowTex: RewriteCharacterTexturePath("head", slot.ShadowTex, characterTexturePathByName),
                ValueTex: null,
                FaceShadowTex: RewriteCharacterTexturePath("head", slot.FaceShadowTex, characterTexturePathByName),
                RenderOrder: GetHeadRenderOrder(slot.MaterialKind),
                ShaderPipeline: ResolveHeadShaderPipeline(plan, slot.MaterialKind),
                Lighting: slot.Lighting
            ))
            .ToList();
        var missingTextureRoles = new List<PjskSekaiRuntimeMissingTextureRole>();
        var textureRoles = new List<PjskSekaiRuntimeTextureRole>();
        foreach (var slot in bodySlots.Concat(headSlots))
        {
            AddTextureRole(textureRoles, missingTextureRoles, slot, "main", slot.MainTex);
            AddTextureRole(textureRoles, missingTextureRoles, slot, "shadow", slot.ShadowTex);
            AddTextureRole(textureRoles, missingTextureRoles, slot, "value", slot.ValueTex);
            AddTextureRole(textureRoles, missingTextureRoles, slot, "faceShadow", slot.FaceShadowTex);
        }

        var warnings = new List<string>();
        if (missingTextureRoles.Count > 0)
        {
            warnings.Add("Some optional texture roles are absent; see missingTextureRoles.");
        }

        var extension = new PjskSekaiRuntimeExtension(
            SpecVersion: "1.0",
            ProfileVersion: plan.SekaiVrmProfile.Version,
            Character: new PjskSekaiRuntimeCharacter(
                CharacterId: plan.Summary.CharacterId,
                SkeletonId: plan.Summary.SkeletonId,
                CharacterHeightMeters: plan.BodyManifestTemplate.CharacterHeightMeters,
                BodyBundlePath: plan.Summary.ResolvedBodyBundlePath,
                HeadBundlePath: plan.Summary.ResolvedHeadBundlePath,
                Costume: BuildCostumeMetadata(resolvedCharacter3dCostume)
            ),
            Container: new PjskSekaiRuntimeContainer(
                SourceGlb: sourceGlbPath,
                PreferredContainer: plan.SekaiVrmProfile.TargetContainer.Preferred,
                FallbackContainer: plan.SekaiVrmProfile.TargetContainer.Fallback,
                Phase: plan.SekaiVrmProfile.TargetContainer.CurrentPhase,
                RequiresCustomViewerForExactRender: plan.SekaiVrmProfile.SekaiRuntimeExtras.RequiredForExactViewerRender
            ),
            BodyHeadAssembly: new PjskSekaiRuntimeAssembly(
                BodyRootNodeName: plan.BodyManifestTemplate.Skeleton.RootNodeName,
                HeadRootNodeName: plan.HeadManifestTemplate.Assembly.RootNodeName,
                BodyNeckAttach: plan.BodyManifestTemplate.Skeleton.NeckAttach,
                HeadAttachOrigin: plan.HeadManifestTemplate.Assembly.AttachOrigin,
                BoneRemap: plan.HeadManifestTemplate.Assembly.BoneRemap,
                StitchMode: "bone_linked"
            ),
            SekaiRuntimeMaterialProfile: plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile,
            BodyManifest: plan.BodyManifestTemplate,
            HeadManifest: plan.HeadManifestTemplate,
            MaterialSlots: new PjskSekaiRuntimeMaterialSlots(
                Body: bodySlots,
                Head: headSlots
            ),
            TextureRoles: textureRoles,
            CharacterTextures: characterTexturePathByName
                .OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    pair => pair.Key,
                    pair => ToOutputRootTexturePath(pair.Value),
                    StringComparer.OrdinalIgnoreCase
                ),
            MorphChannelBindings: plan.HeadManifestTemplate.MorphChannelBindings,
            MotionPackage: motionExport?.SourcePath is null
                ? null
                : new PjskSekaiRuntimeMotionPackage(
                    SourcePath: motionExport.SourcePath,
                    BodyMotionGlb: motionExport.BodyMotionGlbPath is null
                        ? null
                        : Path.GetRelativePath(
                            plan.Summary.OutputDirectory,
                            motionExport.BodyMotionGlbPath
                        ).Replace('\\', '/'),
                    FaceMotion: motionExport.FaceMotion,
                    LightMotion: motionExport.LightMotion
                ),
            CharacterControllers: new PjskSekaiRuntimeCharacterControllers(
                Hair: combinedSpringBone.Head.CharacterHair,
                Eye: combinedSpringBone.Head.CharacterEye
            ),
            PjskSpringBone: new PjskSekaiRuntimeSpringBonePayload(
                Raw: combinedSpringBone,
                VrmCandidate: vrmSpringBoneCandidate,
                RuntimeUnitySetup: BuildRuntimeUnitySetup(combinedSpringBone, vrmSpringBoneCandidate)
            ),
            SpringBoneSourceMetadata: new PjskSekaiRuntimeSpringBoneSourceMetadata(
                RawSpringBoneJson: Path.GetFileName(plan.CombinedSpringBonePath),
                VrmSpringBoneCandidateJson: Path.GetFileName(plan.VrmSpringBoneCandidatePath),
                VrmcSpringBoneExtensionJson: Path.GetFileName(plan.VrmcSpringBoneExtensionPath),
                EmbeddedExtension: "VRMC_springBone"
            ),
            ViewerHints: new PjskSekaiRuntimeViewerHints(
                MaterialBindingMode: "manifest",
                FaceMode: plan.HeadManifestTemplate.DefaultFaceMode,
                BodyPipeline: plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.BodyPipeline,
                FacePipeline: plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.FacePipeline,
                LayerPipeline: plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.LayerPipeline,
                PreserveGltfMaterialsAsFallback: true
            ),
            Notes: new[]
            {
                "VRM is used as a container; exact PJSK rendering requires this extension.",
                "Standard VRM/MToon fallback is intentionally separate from PJSK shader semantics.",
                "Face expressions are still driven by PJSK morph hash/channel bindings until VRM expression mapping is implemented.",
            }
        );

        var report = new PjskSekaiRuntimeResolveReport(
            Version: 1,
            ExtensionName: plan.SekaiVrmProfile.SekaiRuntimeExtras.ExtensionName,
            SourceGlb: sourceGlbPath,
            BodyMaterialSlotCount: bodySlots.Count,
            HeadMaterialSlotCount: headSlots.Count,
            TextureRoleCount: textureRoles.Count,
            CharacterTextureCount: characterTexturePathByName.Count,
            MorphChannelBindingCount: plan.HeadManifestTemplate.MorphChannelBindings.Count,
            EmbeddedFaceMotionClipCount: motionExport?.FaceMotion?.Clips.Count ?? 0,
            BodyMotionGlb: motionExport?.BodyMotionGlbPath is null
                ? null
                : Path.GetRelativePath(
                    plan.Summary.OutputDirectory,
                    motionExport.BodyMotionGlbPath
                ).Replace('\\', '/'),
            MissingTextureRoles: missingTextureRoles,
            Warnings: warnings
        );

        return new PjskSekaiRuntimeBuildResult(extension, report);
    }

    private static PjskSpringBoneRuntimeUnitySetup BuildRuntimeUnitySetup(
        CombinedSpringBoneExport raw,
        VrmSpringBoneCandidate candidate
    )
    {
        var managers = raw.Body.Managers.Select(manager => BuildRuntimeManager("Body", manager, raw.Body))
            .Concat(raw.Head.Managers.Select(manager => BuildRuntimeManager("Head", manager, raw.Head)))
            .ToList();
        var bones = raw.Body.Bones.Select(bone => BuildRuntimeBone("Body", bone))
            .Concat(raw.Head.Bones.Select(bone => BuildRuntimeBone("Head", bone)))
            .ToList();
        var colliders = candidate.VrmExtensionDraft.Colliders
            .Select(collider => new PjskSpringBoneRuntimeCollider(
                PartKind: collider.PartKind,
                Index: collider.Index,
                PathId: collider.SourcePathId,
                ScriptName: collider.ScriptName,
                NodeName: collider.NodeName,
                NodePath: collider.NodePath,
                PoseRoot: collider.PoseRoot,
                Enabled: collider.Enabled
            ))
            .ToList();
        var bindings = candidate.VrmExtensionDraft.ColliderGroups
            .Select(group => new PjskSpringBoneRuntimeColliderBinding(
                SourceKind: group.SourceKind ?? "direct",
                PartKind: group.PartKind,
                SourceSpringBonePathId: group.SourceSpringBonePathId,
                ColliderFlag: group.ColliderFlag,
                MatchedPrefixes: group.MatchedPrefixes,
                CollidersByRoot: group.CollidersByRoot,
                DefaultRoot: group.DefaultRoot,
                SourceColliderPathIds: group.SourceColliderPathIds,
                Colliders: group.Colliders
            ))
            .ToList();
        var bodyRoots = raw.Body.Managers
            .Select(manager => ExtractPoseRoot(manager.GameObject?.TransformPath))
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var defaultBodyRoot = bodyRoots.Contains("body", StringComparer.Ordinal)
            ? "body"
            : bodyRoots.FirstOrDefault() ?? "body";
        var prefabGraphs = new[] { raw.Body.PrefabGraph, raw.Head.PrefabGraph };
        var rootSelectionProfile = BuildRootSelectionProfile(
            defaultBodyRoot,
            managers,
            bones,
            colliders,
            prefabGraphs
        );
        var setupPlan = BuildSetupPlan(managers, bindings);
        var bindingDecisions = BuildBindingDecisions(bones, bindings);
        var activeRoots = rootSelectionProfile.RootCandidates
            .Where(candidate => candidate.StaticActive != false)
            .Select(candidate => candidate.Root)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(root => root, StringComparer.Ordinal)
            .ToList();

        return new PjskSpringBoneRuntimeUnitySetup(
            Version: 3,
            UnityVersion: "2022.3.21f1",
            PrefabGraphs: prefabGraphs,
            RootSelectionProfile: rootSelectionProfile,
            SetupPlan: setupPlan,
            BindingDecisions: bindingDecisions,
            ActiveRootProfile: new PjskSpringBoneActiveRootProfile(
                DefaultBodyRoot: defaultBodyRoot,
                ActiveRoots: activeRoots.Count == 0 ? new[] { defaultBodyRoot } : activeRoots,
                InactiveRoots: rootSelectionProfile.RootCandidates
                    .Select(candidate => candidate.Root)
                    .Distinct(StringComparer.Ordinal)
                    .Where(root => !activeRoots.Contains(root, StringComparer.Ordinal))
                    .ToList()
            ),
            ManagerColliderCaches: BuildManagerColliderCaches(managers, colliders),
            Managers: managers,
            Bones: bones,
            Colliders: colliders,
            ColliderBindings: bindings,
            Warnings: candidate.Warnings
        );
    }

    private static PjskSpringBoneRootSelectionProfile BuildRootSelectionProfile(
        string defaultBodyRoot,
        IReadOnlyList<PjskSpringBoneRuntimeManager> managers,
        IReadOnlyList<PjskSpringBoneRuntimeBone> bones,
        IReadOnlyList<PjskSpringBoneRuntimeCollider> colliders,
        IReadOnlyList<SpringPrefabGraph> prefabGraphs
    )
    {
        var roots = managers.Select(manager => manager.PoseRoot)
            .Concat(bones.Select(bone => bone.PoseRoot))
            .Concat(colliders.Select(collider => collider.PoseRoot))
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .OrderBy(root => RootPriority(root, defaultBodyRoot))
            .ThenBy(root => root, StringComparer.Ordinal)
            .ToList();
        var candidates = roots
            .Select(root =>
            {
                var rootManagers = managers
                    .Where(manager => string.Equals(manager.PoseRoot, root, StringComparison.Ordinal))
                    .ToList();
                var rootBones = bones
                    .Where(bone => string.Equals(bone.PoseRoot, root, StringComparison.Ordinal))
                    .ToList();
                var rootColliders = colliders
                    .Where(collider => string.Equals(collider.PoseRoot, root, StringComparison.Ordinal))
                    .ToList();
                var rendererPathIds = prefabGraphs
                    .SelectMany(graph => graph.Renderers)
                    .Where(renderer => string.Equals(renderer.PoseRoot, root, StringComparison.Ordinal))
                    .Select(renderer => renderer.PathId)
                    .Distinct()
                    .OrderBy(pathId => pathId)
                    .ToList();
                var staticActiveValues = rootManagers
                    .Select(manager => manager.ActiveInHierarchy)
                    .Concat(prefabGraphs
                        .SelectMany(graph => graph.GameObjects)
                        .Where(gameObject => string.Equals(ExtractPoseRoot(gameObject.TransformPath), root, StringComparison.Ordinal))
                        .Select(gameObject => gameObject.ActiveInHierarchy))
                    .Where(value => value is not null)
                    .Cast<bool>()
                    .ToList();
                return new PjskSpringBoneRootCandidate(
                    Root: root,
                    PartKind: root == "face" ? "Head" : "Body",
                    StaticActive: staticActiveValues.Count == 0 ? null : staticActiveValues.Any(value => value),
                    DefaultPriority: RootPriority(root, defaultBodyRoot),
                    ManagerPathIds: rootManagers.Select(manager => manager.PathId).OrderBy(pathId => pathId).ToList(),
                    BonePathIds: rootBones.Select(bone => bone.PathId).OrderBy(pathId => pathId).ToList(),
                    ColliderIndexes: rootColliders.Select(collider => collider.Index).OrderBy(index => index).ToList(),
                    RendererPathIds: rendererPathIds,
                    Reason: root == defaultBodyRoot
                        ? "default body root candidate; not a final runtime active decision"
                        : "prefab root candidate; runtime selection must choose one compatible root per spring bone"
                );
            })
            .ToList();

        return new PjskSpringBoneRootSelectionProfile(
            Policy: "candidates_plus_default; static active is evidence only",
            DefaultBodyRoot: defaultBodyRoot,
            RootCandidates: candidates
        );
    }

    private static int RootPriority(string root, string defaultBodyRoot)
    {
        if (string.Equals(root, defaultBodyRoot, StringComparison.Ordinal))
        {
            return 0;
        }
        return root switch
        {
            "face" => 10,
            "sit_body" => 20,
            "guitar_body" => 30,
            _ => 100,
        };
    }

    private static PjskSpringBoneSetupPlan BuildSetupPlan(
        IReadOnlyList<PjskSpringBoneRuntimeManager> managers,
        IReadOnlyList<PjskSpringBoneRuntimeColliderBinding> bindings
    )
    {
        return new PjskSpringBoneSetupPlan(
            DiscoveryMode: "Unity prefab PathID graph; SpringManager.springBones references remain authoritative",
            RootPolicy: "managerColliderCaches are the collider binding anchor; viewer/runtime must constrain colliderFlag candidates by manager cache before selecting one body/sit_body/guitar_body root",
            ManagerPathIds: managers.Select(manager => manager.PathId).OrderBy(pathId => pathId).ToList(),
            OrderedSteps: new[]
            {
                "CharacterModel.SetupSpringBone",
                "ModelUtility.SpringBoneSetup",
                "SpringManager.FindSpringBones(true)",
                "SpringManager.SetupCollider",
                "SpringBone.Initialize",
            },
            DirectBindingCount: bindings.Count(binding => binding.SourceKind == "direct"),
            ColliderFlagBindingCount: bindings.Count(binding => binding.SourceKind == "colliderFlag")
        );
    }

    private static IReadOnlyList<PjskSpringBoneBindingDecision> BuildBindingDecisions(
        IReadOnlyList<PjskSpringBoneRuntimeBone> bones,
        IReadOnlyList<PjskSpringBoneRuntimeColliderBinding> bindings
    )
    {
        var boneByPathId = bones.ToDictionary(bone => bone.PathId);
        return bindings
            .Select(binding =>
            {
                boneByPathId.TryGetValue(binding.SourceSpringBonePathId, out var bone);
                var candidateRoots = binding.CollidersByRoot is not null && binding.CollidersByRoot.Count > 0
                    ? binding.CollidersByRoot
                    : new Dictionary<string, IReadOnlyList<int>>
                    {
                        [binding.DefaultRoot ?? bone?.PoseRoot ?? "unknown"] = binding.Colliders,
                    };
                return new PjskSpringBoneBindingDecision(
                    SourceKind: binding.SourceKind,
                    PartKind: binding.PartKind,
                    SourceSpringBonePathId: binding.SourceSpringBonePathId,
                    NodePath: bone?.NodePath,
                    PoseRoot: bone?.PoseRoot,
                    ColliderFlag: binding.ColliderFlag,
                    DirectColliderPathIds: binding.SourceKind == "direct"
                        ? binding.SourceColliderPathIds
                        : Array.Empty<long>(),
                    CandidateRoots: candidateRoots,
                    DefaultRoot: binding.DefaultRoot,
                    SelectedColliderIndexes: binding.Colliders,
                    Reason: binding.SourceKind == "colliderFlag"
                        ? "colliderFlag binding exports all root candidates; viewer must constrain by managerColliderCaches before selecting one root"
                        : "direct serialized collider references"
                );
            })
            .ToList();
    }

    private static IReadOnlyList<PjskSpringBoneRuntimeManagerColliderCache> BuildManagerColliderCaches(
        IReadOnlyList<PjskSpringBoneRuntimeManager> managers,
        IReadOnlyList<PjskSpringBoneRuntimeCollider> colliders
    )
    {
        return managers
            .Select(manager =>
            {
                var cacheColliders = SelectRuntimeManagerCacheColliders(manager, colliders);
                return new PjskSpringBoneRuntimeManagerColliderCache(
                    ManagerPathId: manager.PathId,
                    PartKind: manager.PartKind,
                    SourcePoseRoot: manager.PoseRoot,
                    RuntimeRoot: "CharacterModel",
                    ManagerNodeName: manager.NodeName,
                    ManagerNodePath: manager.NodePath,
                    SpringBonePathIds: manager.BonePathIds,
                    SphereColliderIndexes: cacheColliders
                        .Where(collider => IsSpringColliderScript(collider, "SpringSphereCollider"))
                        .Select(collider => collider.Index)
                        .Distinct()
                        .OrderBy(index => index)
                        .ToList(),
                    CapsuleColliderIndexes: cacheColliders
                        .Where(collider => IsSpringColliderScript(collider, "SpringCapsuleCollider"))
                        .Select(collider => collider.Index)
                        .Distinct()
                        .OrderBy(index => index)
                        .ToList(),
                    PanelColliderIndexes: cacheColliders
                        .Where(collider => IsSpringColliderScript(collider, "SpringPanelCollider"))
                        .Select(collider => collider.Index)
                        .Distinct()
                        .OrderBy(index => index)
                        .ToList(),
                    Reason: BuildManagerColliderCacheReason(manager)
                );
            })
            .ToList();
    }

    private static IReadOnlyList<PjskSpringBoneRuntimeCollider> SelectRuntimeManagerCacheColliders(
        PjskSpringBoneRuntimeManager manager,
        IReadOnlyList<PjskSpringBoneRuntimeCollider> colliders
    )
    {
        var managerName = manager.NodeName ?? string.Empty;
        var sourceRoot = manager.PoseRoot;
        var sameRootColliders = colliders
            .Where(collider => string.Equals(collider.PoseRoot, sourceRoot, StringComparison.Ordinal))
            .Where(collider => collider.Enabled)
            .ToList();

        if (string.Equals(managerName, "Neck", StringComparison.Ordinal))
        {
            return colliders
                .Where(collider => string.Equals(collider.PoseRoot, "body", StringComparison.Ordinal))
                .Where(collider => collider.Enabled)
                .Where(IsNeckRuntimeCacheCollider)
                .ToList();
        }

        if (string.Equals(managerName, "Hip", StringComparison.Ordinal))
        {
            return sameRootColliders;
        }

        return sameRootColliders;
    }

    private static bool IsNeckRuntimeCacheCollider(PjskSpringBoneRuntimeCollider collider)
    {
        return StartsWithColliderName(collider, "CL_Chest") ||
            StartsWithColliderName(collider, "CL_Left_Arm") ||
            StartsWithColliderName(collider, "CL_Right_Arm");
    }

    private static bool StartsWithColliderName(
        PjskSpringBoneRuntimeCollider collider,
        string prefix
    )
    {
        var name = collider.NodeName ?? string.Empty;
        return name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSpringColliderScript(
        PjskSpringBoneRuntimeCollider collider,
        string scriptName
    )
    {
        return string.Equals(collider.ScriptName, scriptName, StringComparison.Ordinal) ||
            collider.ScriptName.EndsWith(scriptName, StringComparison.Ordinal);
    }

    private static string BuildManagerColliderCacheReason(PjskSpringBoneRuntimeManager manager)
    {
        return manager.NodeName switch
        {
            "Neck" => "6.5.5 Frida rootmap: Neck runtime cache resolves body CharacterModel chest/head/arm CL_* colliders for head/face spring bones.",
            "Hip" => "6.5.5 Frida rootmap: Hip runtime cache resolves active same-root body colliders; colliderFlag binding must intersect this cache before root selection.",
            _ => "Conservative fallback: active colliders under the same static pose root as the manager."
        };
    }

    private static PjskSpringBoneRuntimeManager BuildRuntimeManager(
        string partKind,
        SpringMonoBehaviourEntry manager,
        SpringBoneExport part
    )
    {
        var managerPath = manager.GameObject?.TransformPath;
        var bonePathIds = part.Bones
            .Where(bone => IsSameOrDescendant(bone.GameObject?.TransformPath, managerPath))
            .OrderBy(bone => PathDepth(bone.GameObject?.TransformPath))
            .ThenBy(bone => bone.GameObject?.TransformPath, StringComparer.Ordinal)
            .Select(bone => bone.PathId)
            .ToList();
        return new PjskSpringBoneRuntimeManager(
            PartKind: partKind,
            PathId: manager.PathId,
            NodeName: manager.GameObject?.Name,
            NodePath: managerPath,
            PoseRoot: ExtractPoseRoot(managerPath),
            ActiveSelf: manager.GameObject?.ActiveSelf,
            ActiveInHierarchy: manager.GameObject?.ActiveInHierarchy,
            Enabled: ReadBool(manager.Raw, "m_Enabled") ?? true,
            AutomaticUpdates: ReadBool(manager.Raw, "automaticUpdates") ?? true,
            BonePathIds: bonePathIds
        );
    }

    private static PjskSpringBoneRuntimeBone BuildRuntimeBone(string partKind, SpringBoneEntry bone)
    {
        return new PjskSpringBoneRuntimeBone(
            PartKind: partKind,
            PathId: bone.PathId,
            NodeName: bone.GameObject?.Name,
            NodePath: bone.GameObject?.TransformPath,
            PoseRoot: ExtractPoseRoot(bone.GameObject?.TransformPath),
            ActiveSelf: bone.GameObject?.ActiveSelf,
            ActiveInHierarchy: bone.GameObject?.ActiveInHierarchy,
            Enabled: ReadBool(bone.Raw, "m_Enabled") ?? true,
            PivotNodePath: bone.PivotNode?.TransformPath,
            DirectColliderPathIds: ReadObjectPathIds(bone.Raw, "colliders")
                .Concat(ReadObjectPathIds(bone.Raw, "sphereColliders"))
                .Concat(ReadObjectPathIds(bone.Raw, "capsuleColliders"))
                .Concat(ReadObjectPathIds(bone.Raw, "panelColliders"))
                .Distinct()
                .ToList(),
            ColliderFlag: ReadInt(bone.Raw, "colliderFlag") ?? 0
        );
    }

    private static bool IsSameOrDescendant(string? path, string? rootPath)
    {
        if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(rootPath))
        {
            return false;
        }
        return string.Equals(path, rootPath, StringComparison.Ordinal) ||
            path.StartsWith(rootPath + "/", StringComparison.Ordinal);
    }

    private static int PathDepth(string? path)
    {
        return string.IsNullOrWhiteSpace(path)
            ? int.MaxValue
            : path.Count(ch => ch == '/');
    }

    private static string? ExtractPoseRoot(string? transformPath)
    {
        if (string.IsNullOrWhiteSpace(transformPath))
        {
            return null;
        }
        var slashIndex = transformPath.IndexOf('/');
        return slashIndex < 0
            ? transformPath
            : transformPath[..slashIndex];
    }

    private static IEnumerable<long> ReadObjectPathIds(JsonObject raw, string key)
    {
        if (!raw.TryGetPropertyValue(key, out var value) || value is not JsonArray array)
        {
            return Array.Empty<long>();
        }
        return array
            .OfType<JsonObject>()
            .Select(item => ReadLong(item, "m_PathID"))
            .Where(pathId => pathId is not null && pathId.Value != 0)
            .Select(pathId => pathId!.Value);
    }

    private static bool? ReadBool(JsonObject raw, string key)
    {
        return raw.TryGetPropertyValue(key, out var value)
            ? ReadBool(value)
            : null;
    }

    private static bool? ReadBool(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }
        if (node.GetValueKind() == System.Text.Json.JsonValueKind.True)
        {
            return true;
        }
        if (node.GetValueKind() == System.Text.Json.JsonValueKind.False)
        {
            return false;
        }
        return ReadLongValue(node) switch
        {
            0 => false,
            1 => true,
            _ => null,
        };
    }

    private static int? ReadInt(JsonObject raw, string key)
    {
        if (!raw.TryGetPropertyValue(key, out var value))
        {
            return null;
        }
        var longValue = ReadLongValue(value);
        return longValue is null ? null : (int)longValue.Value;
    }

    private static long? ReadLong(JsonObject raw, string key)
    {
        return raw.TryGetPropertyValue(key, out var value)
            ? ReadLongValue(value)
            : null;
    }

    private static long? ReadLongValue(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }
        try
        {
            return node.GetValue<long>();
        }
        catch
        {
            try
            {
                return node.GetValue<int>();
            }
            catch
            {
                return null;
            }
        }
    }

    private static PjskSekaiRuntimeCostumeMetadata? BuildCostumeMetadata(
        ResolvedCharacter3dCostume? costume
    )
    {
        if (costume is null)
        {
            return null;
        }

        return new PjskSekaiRuntimeCostumeMetadata(
            Character3dId: costume.Character3dId,
            CharacterName: costume.CharacterName,
            BodyCostume3dId: costume.BodyCostume3dId,
            BodyAssetbundleName: costume.BodyAssetbundleName,
            HairCostume3dId: costume.HairCostume3dId,
            HairAssetbundleName: costume.HairAssetbundleName,
            HairBundleKind: costume.HairBundleKind,
            HairVariantGroupKey: costume.HairVariantGroupKey,
            HeadCostume3dId: costume.HeadCostume3dId,
            HeadAssetbundleName: costume.HeadAssetbundleName,
            HeadBundleKind: costume.HeadBundleKind,
            HeadVariantGroupKey: costume.HeadVariantGroupKey,
            HeadCompositionKind: costume.HeadCompositionKind,
            MainHeadAssetbundleName: costume.MainHeadAssetbundleName,
            MainHeadMode: costume.MainHeadMode,
            MainHeadCostumeType: costume.MainHeadCostumeType,
            HeadTextureFallbackAssetbundleName: costume.HeadTextureFallbackAssetbundleName,
            AccessoryHeadAssetbundleName: costume.AccessoryHeadAssetbundleName,
            AccessoryAttachNode: costume.AccessoryAttachNode,
            AccessoryColorAssetbundleName: costume.AccessoryColorAssetbundleName
        );
    }

    private static void AddTextureRole(
        List<PjskSekaiRuntimeTextureRole> textureRoles,
        List<PjskSekaiRuntimeMissingTextureRole> missingTextureRoles,
        PjskSekaiRuntimeMaterialSlot slot,
        string role,
        string? uri
    )
    {
        if (string.IsNullOrWhiteSpace(uri))
        {
            if (IsRequiredTextureRole(slot.MaterialKind, role))
            {
                missingTextureRoles.Add(new PjskSekaiRuntimeMissingTextureRole(
                    Part: slot.Part,
                    MeshName: slot.MeshName,
                    MaterialName: slot.MaterialName,
                    MaterialKind: slot.MaterialKind,
                    Role: role
                ));
            }
            return;
        }

        textureRoles.Add(new PjskSekaiRuntimeTextureRole(
            Part: slot.Part,
            MaterialName: slot.MaterialName,
            MaterialKind: slot.MaterialKind,
            Role: role,
            Uri: uri
        ));
    }

    private static bool IsRequiredTextureRole(string materialKind, string role)
    {
        return role switch
        {
            "main" => true,
            "shadow" => materialKind is "body" or "hair" or "accessory" or "face_sdf",
            "value" => materialKind is "body",
            "faceShadow" => materialKind is "face_sdf",
            _ => false,
        };
    }

    private static string ResolveHeadShaderPipeline(
        ConversionPlan plan,
        string materialKind
    )
    {
        return materialKind switch
        {
            "eye" or "eyelight" or "eyelash" or "eyebrow" => plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.LayerPipeline,
            "face_sdf" or "face" => plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.FacePipeline,
            _ => plan.SekaiVrmProfile.SekaiRuntimeMaterialProfile.BodyPipeline,
        };
    }

    private static int GetHeadRenderOrder(string materialKind)
    {
        return materialKind switch
        {
            "face_sdf" => 10,
            "accessory" or "hair" => 12,
            "eyelash" or "eyebrow" => 20,
            "eye" => 24,
            "eyelight" => 28,
            _ => 0,
        };
    }

    private static string? RewriteCharacterTexturePath(
        string part,
        string? manifestPath,
        IReadOnlyDictionary<string, string> characterTexturePathByName
    )
    {
        if (string.IsNullOrWhiteSpace(manifestPath))
        {
            return null;
        }

        var textureName = Path.GetFileName(manifestPath);
        var prefixedName = $"{part}_{textureName}";
        if (characterTexturePathByName.TryGetValue(prefixedName, out var prefixedPath))
        {
            return ToOutputRootTexturePath(prefixedPath);
        }
        if (characterTexturePathByName.TryGetValue(textureName, out var directPath))
        {
            return ToOutputRootTexturePath(directPath);
        }

        return manifestPath;
    }

    private static string ToOutputRootTexturePath(string characterRelativePath)
    {
        return Path.Combine("character", characterRelativePath).Replace('\\', '/');
    }
}
