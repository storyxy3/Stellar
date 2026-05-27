using PjskBundle2Parts.Models;

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
                VrmCandidate: vrmSpringBoneCandidate
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
