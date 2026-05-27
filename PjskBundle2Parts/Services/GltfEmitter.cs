using NumQuat = System.Numerics.Quaternion;
using NumMat4 = System.Numerics.Matrix4x4;
using NumVec2 = System.Numerics.Vector2;
using NumVec3 = System.Numerics.Vector3;
using NumVec4 = System.Numerics.Vector4;
using AssetStudio;
using System.Text.Json.Nodes;
using PjskBundle2Parts.Models;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using SharpGLTF.Schema2;
using ImageSharpImage = SixLabors.ImageSharp.Image;

namespace PjskBundle2Parts.Services;

public sealed class GltfEmitter
{
    public GlbEmissionResult EmitBody(
        string outputDirectory,
        string glbFileName,
        BodyAssetManifest manifest,
        IImported imported
    )
    {
        return EmitCommon(
            outputDirectory,
            glbFileName,
            imported,
            textureSelector: (_, importedMaterial) =>
                ResolvePreferredTextureName(
                    importedMaterial,
                    manifest.BodyMaterials.SelectMany(slot => new[] { slot.MainTex, slot.ShadowTex, slot.ValueTex })
                ),
            materialFactory: importedMaterial => CreateBodyMaterial(
                importedMaterial,
                manifest,
                imported.TextureList
            )
        );
    }

    public GlbEmissionResult EmitHead(
        string outputDirectory,
        string glbFileName,
        HeadAssetManifest manifest,
        IImported imported
    )
    {
        return EmitCommon(
            outputDirectory,
            glbFileName,
            imported,
            textureSelector: (_, importedMaterial) =>
                ResolvePreferredTextureName(
                    importedMaterial,
                    manifest.FaceMaterials.SelectMany(slot => new[] { slot.MainTex, slot.ShadowTex, slot.FaceShadowTex })
                )
        );
    }

    public GlbEmissionResult EmitCharacter(
        string outputDirectory,
        string glbFileName,
        BodyAssetManifest bodyManifest,
        HeadAssetManifest headManifest,
        IImported bodyImported,
        IImported headImported,
        IImported? accessoryImported = null,
        string? accessoryAttachNodeName = null
    )
    {
        Directory.CreateDirectory(outputDirectory);
        var bodyTextureDirectory = Path.Combine(outputDirectory, "textures", "body");
        var headTextureDirectory = Path.Combine(outputDirectory, "textures", "head");
        var accessoryTextureDirectory = Path.Combine(outputDirectory, "textures", "accessory");
        Directory.CreateDirectory(bodyTextureDirectory);
        Directory.CreateDirectory(headTextureDirectory);

        var bodyTextures = ExportTextures(bodyTextureDirectory, bodyImported.TextureList, "body", Path.Combine("textures", "body"));
        var headTextures = ExportTextures(headTextureDirectory, headImported.TextureList, "head", Path.Combine("textures", "head"));
        var mergedTextures = new Dictionary<string, string>(bodyTextures, StringComparer.OrdinalIgnoreCase);
        foreach (var pair in headTextures)
        {
            mergedTextures[pair.Key] = pair.Value;
        }
        if (accessoryImported is not null)
        {
            Directory.CreateDirectory(accessoryTextureDirectory);
            var accessoryTextures = ExportTextures(accessoryTextureDirectory, accessoryImported.TextureList, "accessory", Path.Combine("textures", "accessory"));
            foreach (var pair in accessoryTextures)
            {
                mergedTextures[pair.Key] = pair.Value;
            }
        }

        var bodyMaterialMap = bodyImported.MaterialList.ToDictionary(
            material => material.Name,
            material => CreateBodyMaterial(material, bodyManifest, bodyImported.TextureList),
            StringComparer.OrdinalIgnoreCase
        );
        var headMaterialMap = headImported.MaterialList.ToDictionary(
            material => material.Name,
            material => CreateMaterial(material, ResolvePreferredTextureName(
                    material,
                    headManifest.FaceMaterials.SelectMany(slot => new[] { slot.MainTex, slot.ShadowTex, slot.FaceShadowTex })),
                headImported.TextureList),
            StringComparer.OrdinalIgnoreCase
        );
        var accessoryMaterialMap = accessoryImported is null
            ? null
            : accessoryImported.MaterialList.ToDictionary(
                material => material.Name,
                material => CreateMaterial(
                    material,
                    ResolvePreferredTextureName(material, ResolveTextureSlots(material, "_MainTex", "_ShadowTex", "_ValueTex")),
                    accessoryImported.TextureList
                ),
                StringComparer.OrdinalIgnoreCase
            );

        var bodyRoot = BuildNodeTree(bodyImported.RootFrame, null, new Dictionary<ImportedFrame, NodeBuilder>());
        var bodyNodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(bodyRoot, bodyImported.RootFrame, bodyNodeMap);
        var bodyFrameMap = new Dictionary<string, ImportedFrame>(StringComparer.OrdinalIgnoreCase);
        CollectFrames(bodyImported.RootFrame, bodyFrameMap);
        var bodyPathByName = BuildUniqueFramePathByName(bodyImported.RootFrame);

        var bodyAttachFrame = bodyImported.RootFrame.FindFrame(bodyManifest.Skeleton.NeckAttach.NodeName ?? string.Empty);
        var bodyAttachNode = bodyAttachFrame is not null && bodyNodeMap.TryGetValue(bodyAttachFrame.Path, out var resolvedAttachNode)
            ? resolvedAttachNode
            : bodyRoot;

        var headMeshPaths = headImported.MeshList
            .Select(mesh => mesh.Path)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var headFrameNodeMap = new Dictionary<ImportedFrame, NodeBuilder>();
        var headRoot = BuildRequiredNodeTree(
            headImported.RootFrame,
            headMeshPaths,
            null,
            headFrameNodeMap
        ) ?? CloneFrameNode(headImported.RootFrame, null);
        var headNodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(headFrameNodeMap, headNodeMap);

        var headAttachFrame = headImported.RootFrame.FindFrame(headManifest.Assembly.AttachOrigin.NodeName ?? string.Empty);
        var sourceHeadTree = BuildNodeTree(headImported.RootFrame, null, new Dictionary<ImportedFrame, NodeBuilder>());
        var sourceHeadNodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(sourceHeadTree, headImported.RootFrame, sourceHeadNodeMap);
        if (headAttachFrame is not null && sourceHeadNodeMap.TryGetValue(headAttachFrame.Path, out var headAttachNode))
        {
            if (System.Numerics.Matrix4x4.Invert(headAttachNode.WorldMatrix, out var inverse))
            {
                headRoot.LocalMatrix = inverse * headRoot.LocalMatrix;
            }
        }
        headRoot.LocalMatrix *= bodyAttachNode.WorldMatrix;

        var headLogicalPathByImportedPath = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        MergeHeadSkeletonIntoBody(
            headImported,
            headManifest,
            bodyFrameMap,
            bodyPathByName,
            bodyNodeMap,
            headNodeMap,
            headLogicalPathByImportedPath
        );

        var scene = new SceneBuilder();
        scene.AddNode(bodyRoot);

        AppendModel(scene, bodyRoot, bodyNodeMap, bodyImported, bodyMaterialMap, BuildMorphMap(bodyImported.MorphList));
        scene.AddNode(headRoot);
        AppendModel(
            scene,
            headRoot,
            headNodeMap,
            headImported,
            headMaterialMap,
            BuildMorphMap(headImported.MorphList),
            allowSkinningFallback: true,
            bonePathRemap: headLogicalPathByImportedPath
        );
        if (accessoryImported is not null && accessoryMaterialMap is not null)
        {
            AppendAccessoryModel(
                scene,
                bodyRoot,
                bodyNodeMap,
                headNodeMap,
                accessoryImported,
                accessoryMaterialMap,
                accessoryAttachNodeName
            );
        }

        var model = scene.ToGltf2(new SceneBuilderSchema2Settings
        {
            UseStridedBuffers = false,
            CompactVertexWeights = false,
        });
        ApplyMorphTargetNames(model, BuildMorphNameMap(bodyImported.MorphList));
        ApplyMorphTargetNames(model, BuildMorphNameMap(headImported.MorphList));
        RebindSkinsWithImportedBindPoses(model, bodyImported);
        RebindSkinsWithImportedBindPoses(
            model,
            headImported,
            headLogicalPathByImportedPath,
            bodyImported.RootFrame.Path
        );
        if (accessoryImported is not null)
        {
            RebindSkinsWithImportedBindPoses(model, accessoryImported);
        }
        var glbPath = Path.Combine(outputDirectory, glbFileName);
        model.SaveGLB(glbPath, new WriteSettings());
        return new GlbEmissionResult(
            RelativeGlbPath: Path.GetFileName(glbPath),
            TexturePathByName: mergedTextures
        );
    }

    private GlbEmissionResult EmitCommon(
        string outputDirectory,
        string glbFileName,
        IImported imported,
        Func<string, ImportedMaterial, string?> textureSelector,
        Func<ImportedMaterial, MaterialBuilder>? materialFactory = null
    )
    {
        Directory.CreateDirectory(outputDirectory);
        var textureDirectory = Path.Combine(outputDirectory, "textures");
        Directory.CreateDirectory(textureDirectory);

        var exportedTextures = ExportTextures(textureDirectory, imported.TextureList, null, "textures");
        var materialMap = imported.MaterialList.ToDictionary(
            material => material.Name,
            material => materialFactory is not null
                ? materialFactory(material)
                : CreateMaterial(material, textureSelector(material.Name, material), imported.TextureList),
            StringComparer.OrdinalIgnoreCase
        );

        var rootNode = BuildNodeTree(imported.RootFrame, null, new Dictionary<ImportedFrame, NodeBuilder>());
        var nodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(rootNode, imported.RootFrame, nodeMap);

        var scene = new SceneBuilder();
        scene.AddNode(rootNode);

        AppendModel(scene, rootNode, nodeMap, imported, materialMap, BuildMorphMap(imported.MorphList));

        var model = scene.ToGltf2(new SceneBuilderSchema2Settings
        {
            UseStridedBuffers = false,
            CompactVertexWeights = false,
        });
        ApplyMorphTargetNames(model, BuildMorphNameMap(imported.MorphList));
        RebindSkinsWithImportedBindPoses(model, imported);
        var glbPath = Path.Combine(outputDirectory, glbFileName);
        model.SaveGLB(glbPath, new WriteSettings());
        return new GlbEmissionResult(
            RelativeGlbPath: Path.GetFileName(glbPath),
            TexturePathByName: exportedTextures
        );
    }

    private static Dictionary<string, string> ExportTextures(
        string textureDirectory,
        IReadOnlyList<ImportedTexture> textures,
        string? prefix,
        string relativeTextureDirectory
    )
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var texture in textures)
        {
            var safeName = string.IsNullOrWhiteSpace(prefix)
                ? texture.Name
                : $"{prefix}_{texture.Name}";
            var filePath = Path.Combine(textureDirectory, safeName);
            File.WriteAllBytes(filePath, texture.Data);
            result[safeName] = Path.Combine(relativeTextureDirectory, safeName).Replace('\\', '/');
            result[texture.Name] = Path.Combine(relativeTextureDirectory, safeName).Replace('\\', '/');
        }
        return result;
    }

    private static MaterialBuilder CreateMaterial(
        ImportedMaterial importedMaterial,
        string? preferredTextureName,
        IReadOnlyList<ImportedTexture> textures,
        string? skinMaskTextureName = null,
        string? skinColorHex = null
    )
    {
        var isAlphaLayer = IsAlphaLayerMaterial(importedMaterial.Name);
        var material = new MaterialBuilder(importedMaterial.Name)
            .WithUnlitShader()
            .WithDoubleSide(true);
        if (isAlphaLayer || importedMaterial.Transparency > 0.001f)
        {
            material.WithAlpha(SharpGLTF.Materials.AlphaMode.BLEND, 0.5f);
        }

        var texture = FindImportedTexture(textures, preferredTextureName);

        if (texture is not null)
        {
            var textureData = TryCreateSkinTintedTexture(texture, FindImportedTexture(textures, skinMaskTextureName), skinColorHex)
                ?? texture.Data;
            material.WithBaseColor((ImageBuilder)textureData, null);
            return material;
        }

            var fallbackColor = new NumVec4(
            importedMaterial.Diffuse.R,
            importedMaterial.Diffuse.G,
            importedMaterial.Diffuse.B,
            Math.Clamp(1.0f - importedMaterial.Transparency, 0.0f, 1.0f)
        );
        material.WithBaseColor(fallbackColor);
        return material;
    }

    private static MaterialBuilder CreateBodyMaterial(
        ImportedMaterial importedMaterial,
        BodyAssetManifest bodyManifest,
        IReadOnlyList<ImportedTexture> textures
    )
    {
        var slot = bodyManifest.BodyMaterials
            .FirstOrDefault(candidate => string.Equals(
                candidate.MaterialName,
                importedMaterial.Name,
                StringComparison.OrdinalIgnoreCase
            ));
        var preferredTextureName = ResolvePreferredTextureName(
            importedMaterial,
            slot is null
                ? ResolveTextureSlots(importedMaterial, "_MainTex", "_ShadowTex", "_ValueTex")
                : new[] { slot.MainTex, slot.ShadowTex, slot.ValueTex }
        );
        return CreateMaterial(
            importedMaterial,
            preferredTextureName,
            textures,
            skinMaskTextureName: slot?.ValueTex,
            skinColorHex: bodyManifest.Proxy.BodyColor
        );
    }

    private static byte[]? TryCreateSkinTintedTexture(
        ImportedTexture mainTexture,
        ImportedTexture? skinMaskTexture,
        string? skinColorHex
    )
    {
        if (skinMaskTexture is null || !TryParseHexColor(skinColorHex, out var skinColor))
        {
            return null;
        }

        using var main = ImageSharpImage.Load<Rgba32>(mainTexture.Data);
        using var mask = ImageSharpImage.Load<Rgba32>(skinMaskTexture.Data);
        if (main.Width != mask.Width || main.Height != mask.Height)
        {
            return null;
        }

        var touched = false;
        for (var y = 0; y < main.Height; y++)
        {
            for (var x = 0; x < main.Width; x++)
            {
                var maskPixel = mask[x, y];
                if (!IsBodySkinMaskPixel(maskPixel))
                {
                    continue;
                }

                var source = main[x, y];
                var brightness = Math.Clamp(
                    (MathF.Max(source.R, MathF.Max(source.G, source.B)) / 255f),
                    0.65f,
                    1f
                );
                main[x, y] = new Rgba32(
                    (byte)Math.Clamp(MathF.Round(skinColor.R * brightness), 0f, 255f),
                    (byte)Math.Clamp(MathF.Round(skinColor.G * brightness), 0f, 255f),
                    (byte)Math.Clamp(MathF.Round(skinColor.B * brightness), 0f, 255f),
                    source.A
                );
                touched = true;
            }
        }

        if (!touched)
        {
            return null;
        }

        using var stream = new MemoryStream();
        main.SaveAsPng(stream);
        return stream.ToArray();
    }

    private static bool IsBodySkinMaskPixel(Rgba32 pixel)
    {
        return pixel.R >= 180 && pixel.G <= 80 && pixel.B <= 180;
    }

    private static bool TryParseHexColor(string? hex, out Rgba32 color)
    {
        color = default;
        if (string.IsNullOrWhiteSpace(hex))
        {
            return false;
        }

        var normalized = hex.Trim().TrimStart('#');
        if (normalized.Length != 6)
        {
            return false;
        }

        try
        {
            color = new Rgba32(
                Convert.ToByte(normalized[..2], 16),
                Convert.ToByte(normalized[2..4], 16),
                Convert.ToByte(normalized[4..6], 16),
                255
            );
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
        catch (OverflowException)
        {
            return false;
        }
    }

    private static string? ResolvePreferredTextureName(
        ImportedMaterial importedMaterial,
        IEnumerable<string?> preferredNames
    )
    {
        var preferred = preferredNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .FirstOrDefault(name => MatchesTexture(importedMaterial, name!));

        if (preferred is not null)
        {
            return ResolveTextureName(importedMaterial, preferred);
        }

        return importedMaterial.Textures.FirstOrDefault()?.Name;
    }

    private static IEnumerable<string?> ResolveTextureSlots(
        ImportedMaterial importedMaterial,
        params string[] slotNames
    )
    {
        foreach (var slotName in slotNames)
        {
            var texture = importedMaterial.Textures.FirstOrDefault(texture =>
                string.Equals(texture.Name, slotName, StringComparison.OrdinalIgnoreCase));
            if (texture is not null)
            {
                yield return texture.Name;
            }
        }

        foreach (var texture in importedMaterial.Textures)
        {
            yield return texture.Name;
        }
    }

    private static bool IsAlphaLayerMaterial(string materialName)
    {
        var name = materialName.ToLowerInvariant();
        return name.Contains("eye")
            || name.Contains("eyelash")
            || name.Contains("eyebrow")
            || name.Contains("ehl");
    }

    private static bool MatchesTexture(ImportedMaterial importedMaterial, string preferredName)
    {
        return ResolveTextureName(importedMaterial, preferredName) is not null;
    }

    private static string? ResolveTextureName(ImportedMaterial importedMaterial, string preferredName)
    {
        var candidates = new[]
        {
            preferredName,
            $"{preferredName}.png",
            $"{preferredName}.webp",
            $"{preferredName}.jpg",
        };

        return importedMaterial.Textures
            .Select(texture => texture.Name)
            .FirstOrDefault(name => candidates.Any(candidate =>
                string.Equals(candidate, name, StringComparison.OrdinalIgnoreCase)));
    }

    private static ImportedTexture? FindImportedTexture(
        IReadOnlyList<ImportedTexture> textures,
        string? textureName
    )
    {
        if (string.IsNullOrWhiteSpace(textureName))
        {
            return null;
        }

        var normalized = textureName.Replace('\\', '/').Trim();
        var fileName = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? normalized;
        var stem = Path.GetFileNameWithoutExtension(fileName);
        var candidates = new[]
        {
            normalized,
            fileName,
            stem,
            $"{stem}.png",
            $"{stem}.webp",
            $"{stem}.jpg",
        };

        return textures.FirstOrDefault(texture =>
            candidates.Any(candidate => string.Equals(candidate, texture.Name, StringComparison.OrdinalIgnoreCase)));
    }

    private static void AppendModel(
        SceneBuilder scene,
        NodeBuilder rootNode,
        IReadOnlyDictionary<string, NodeBuilder> nodeMap,
        IImported imported,
        IReadOnlyDictionary<string, MaterialBuilder> materialMap,
        IReadOnlyDictionary<string, ImportedMorph> morphMap,
        bool allowSkinningFallback = false,
        IReadOnlyDictionary<string, string>? bonePathRemap = null
    )
    {
        foreach (var mesh in imported.MeshList)
        {
            if (mesh.SubmeshList.Count == 0)
            {
                continue;
            }

            var meshNode = ResolveMeshNode(mesh, nodeMap, rootNode);
            if (mesh.BoneList is { Count: > 0 })
            {
                try
                {
                    var gltfMesh = BuildSkinnedMesh(mesh, materialMap, morphMap);
                    var joints = mesh.BoneList
                        .Select(bone => ResolveMeshNodeByBonePath(
                            bonePathRemap is not null &&
                                bonePathRemap.TryGetValue(bone.Path, out var mappedPath)
                                    ? mappedPath
                                    : bone.Path,
                            nodeMap,
                            rootNode
                        ))
                        .ToArray();
                    scene.AddSkinnedMesh(gltfMesh, meshNode.WorldMatrix, joints);
                }
                catch (Exception ex) when (allowSkinningFallback)
                {
                    Console.Error.WriteLine($"[GltfEmitter W] Skinned mesh fallback for {mesh.Path}: {ex.GetType().Name}: {ex.Message}");
                    var rigidMesh = BuildRigidMesh(mesh, materialMap, morphMap);
                    scene.AddRigidMesh(rigidMesh, meshNode);
                }
            }
            else
            {
                var gltfMesh = BuildRigidMesh(mesh, materialMap, morphMap);
                scene.AddRigidMesh(gltfMesh, meshNode);
            }
        }
    }

    private static void AppendAccessoryModel(
        SceneBuilder scene,
        NodeBuilder bodyRoot,
        IReadOnlyDictionary<string, NodeBuilder> bodyNodeMap,
        IReadOnlyDictionary<string, NodeBuilder> headNodeMap,
        IImported accessoryImported,
        IReadOnlyDictionary<string, MaterialBuilder> materialMap,
        string? attachNodeName
    )
    {
        var accessoryMeshPaths = accessoryImported.MeshList
            .Select(mesh => mesh.Path)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var accessoryFrameNodeMap = new Dictionary<ImportedFrame, NodeBuilder>();
        var accessoryRoot = BuildRequiredNodeTree(
            accessoryImported.RootFrame,
            accessoryMeshPaths,
            null,
            accessoryFrameNodeMap
        ) ?? CloneFrameNode(accessoryImported.RootFrame, null);
        var accessoryNodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(accessoryFrameNodeMap, accessoryNodeMap);

        var attachNode = ResolveAccessoryAttachNode(attachNodeName, bodyNodeMap, headNodeMap);
        if (attachNode is null)
        {
            Console.Error.WriteLine($"[GltfEmitter W] Accessory attach node '{attachNodeName ?? "<none>"}' was not found; attaching accessory to character root.");
            attachNode = bodyRoot;
        }

        NormalizeAccessoryRootToLocalSpace(accessoryRoot, accessoryImported);
        AttachExistingNode(attachNode, accessoryRoot);
        AppendModel(
            scene,
            accessoryRoot,
            accessoryNodeMap,
            accessoryImported,
            materialMap,
            BuildMorphMap(accessoryImported.MorphList),
            allowSkinningFallback: true
        );
    }

    private static NodeBuilder? ResolveAccessoryAttachNode(
        string? attachNodeName,
        IReadOnlyDictionary<string, NodeBuilder> bodyNodeMap,
        IReadOnlyDictionary<string, NodeBuilder> headNodeMap
    )
    {
        if (!string.IsNullOrWhiteSpace(attachNodeName))
        {
            if (TryResolveNodeByNameOrPath(headNodeMap, attachNodeName!, out var headNode))
            {
                return headNode;
            }
            if (TryResolveNodeByNameOrPath(bodyNodeMap, attachNodeName!, out var bodyNode))
            {
                return bodyNode;
            }
        }

        if (TryResolveNodeByNameOrPath(headNodeMap, "Head", out var fallbackHead))
        {
            return fallbackHead;
        }
        if (TryResolveNodeByNameOrPath(bodyNodeMap, "Head", out var fallbackBodyHead))
        {
            return fallbackBodyHead;
        }
        return null;
    }

    private static bool TryResolveNodeByNameOrPath(
        IReadOnlyDictionary<string, NodeBuilder> nodeMap,
        string nameOrPath,
        out NodeBuilder node
    )
    {
        if (nodeMap.TryGetValue(nameOrPath, out node!))
        {
            return true;
        }

        var suffix = "/" + nameOrPath;
        var match = nodeMap
            .FirstOrDefault(pair =>
                pair.Key.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Path.GetFileName(pair.Key.Replace('\\', Path.DirectorySeparatorChar)), nameOrPath, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(match.Key))
        {
            node = match.Value;
            return true;
        }

        node = null!;
        return false;
    }

    private static void NormalizeAccessoryRootToLocalSpace(
        NodeBuilder accessoryRoot,
        IImported accessoryImported
    )
    {
        var attachRoot = accessoryImported.RootFrame.FindFrame("optional")
            ?? accessoryImported.RootFrame.FindFrame("mdl_acc_")
            ?? accessoryImported.RootFrame;
        var sourceTree = BuildNodeTree(accessoryImported.RootFrame, null, new Dictionary<ImportedFrame, NodeBuilder>());
        var sourceNodeMap = new Dictionary<string, NodeBuilder>(StringComparer.OrdinalIgnoreCase);
        CollectNodes(sourceTree, accessoryImported.RootFrame, sourceNodeMap);
        if (sourceNodeMap.TryGetValue(attachRoot.Path, out var attachRootNode) &&
            System.Numerics.Matrix4x4.Invert(attachRootNode.WorldMatrix, out var inverse))
        {
            accessoryRoot.LocalMatrix = inverse * accessoryRoot.LocalMatrix;
        }
    }

    private static MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexJoints4> BuildSkinnedMesh(
        ImportedMesh mesh,
        IReadOnlyDictionary<string, MaterialBuilder> materialMap,
        IReadOnlyDictionary<string, ImportedMorph> morphMap
    )
    {
        var builder = new MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexJoints4>(mesh.Path);
        foreach (var submesh in mesh.SubmeshList)
        {
            var material = materialMap[submesh.Material];
            var primitive = builder.UsePrimitive(material, 3);
            foreach (var face in submesh.FaceList)
            {
                var a = CreateSkinnedVertex(mesh, submesh.BaseVertex + face.VertexIndices[0]);
                var b = CreateSkinnedVertex(mesh, submesh.BaseVertex + face.VertexIndices[1]);
                var c = CreateSkinnedVertex(mesh, submesh.BaseVertex + face.VertexIndices[2]);
                primitive.AddTriangle(a, b, c);
            }
        }

        ApplyMorphTargets(builder, mesh, ResolveMorphTargets(mesh.Path, morphMap));
        return builder;
    }

    private static IReadOnlyList<ImportedMorph> ResolveMorphTargets(
        string meshPath,
        IReadOnlyDictionary<string, ImportedMorph> morphMap
    )
    {
        if (morphMap.TryGetValue(meshPath, out var morph))
        {
            return new[] { morph };
        }

        return morphMap
            .Where(pair => pair.Key.EndsWith(meshPath, StringComparison.OrdinalIgnoreCase))
            .Select(pair => pair.Value)
            .ToList();
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<string>> BuildMorphNameMap(
        IReadOnlyList<ImportedMorph> morphList
    )
    {
        return morphList
            .GroupBy(morph => morph.Path, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)group
                    .SelectMany(morph => morph.Channels.Select(channel => channel.Name))
                    .ToList(),
                StringComparer.OrdinalIgnoreCase
            );
    }

    private static void ApplyMorphTargetNames(
        ModelRoot model,
        IReadOnlyDictionary<string, IReadOnlyList<string>> morphNameMap
    )
    {
        if (morphNameMap.Count == 0)
        {
            return;
        }

        foreach (var logicalMesh in model.LogicalMeshes)
        {
            if (string.IsNullOrWhiteSpace(logicalMesh.Name))
            {
                continue;
            }

            if (!morphNameMap.TryGetValue(logicalMesh.Name, out var names))
            {
                var suffix = "/" + logicalMesh.Name;
                names = morphNameMap
                    .Where(pair => pair.Key.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                    .Select(pair => pair.Value)
                    .FirstOrDefault();
            }

            if (names is null || names.Count == 0)
            {
                continue;
            }

            logicalMesh.Extras = new JsonObject
            {
                ["targetNames"] = new JsonArray(names.Select(name => JsonValue.Create(name)).ToArray())
            };
        }
    }

    private static IReadOnlyDictionary<string, ImportedMorph> BuildMorphMap(
        IReadOnlyList<ImportedMorph> morphList
    )
    {
        return morphList
            .GroupBy(morph => morph.Path, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.First(),
                StringComparer.OrdinalIgnoreCase
            );
    }

    private static void ApplyMorphTargets(
        MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexJoints4> builder,
        ImportedMesh mesh,
        IReadOnlyList<ImportedMorph> morphs
    )
    {
        if (morphs.Count == 0)
        {
            return;
        }

        var baseVertices = mesh.VertexList
            .Select(CreateMorphBaseVertex)
            .ToArray();

        var targetIndex = 0;
        foreach (var morph in morphs)
        {
            foreach (var channel in morph.Channels)
            {
                var target = builder.UseMorphTarget(targetIndex++);
                var deltaByIndex = new Dictionary<uint, (NumVec3 Position, NumVec3 Normal)>();

                foreach (var keyframe in channel.KeyframeList)
                {
                    foreach (var morphVertex in keyframe.VertexList)
                    {
                        if (morphVertex.Index >= baseVertices.Length)
                        {
                            continue;
                        }

                        var baseVertex = baseVertices[morphVertex.Index];
                        var morphedPosition = ToNumerics(morphVertex.Vertex.Vertex);
                        var positionDelta = morphedPosition - baseVertex.Position;
                        var normalDelta = NumVec3.Zero;
                        if (keyframe.hasNormals)
                        {
                            normalDelta = ToNumerics(morphVertex.Vertex.Normal) - baseVertex.Normal;
                        }

                        if (deltaByIndex.TryGetValue(morphVertex.Index, out var existing))
                        {
                            deltaByIndex[morphVertex.Index] = (
                                existing.Position + positionDelta,
                                existing.Normal + normalDelta
                            );
                        }
                        else
                        {
                            deltaByIndex[morphVertex.Index] = (positionDelta, normalDelta);
                        }
                    }
                }

                foreach (var pair in deltaByIndex)
                {
                    var index = (int)pair.Key;
                    var baseVertex = baseVertices[index];
                    var delta = pair.Value;
                    var morphedVertex = new VertexPositionNormal(
                        baseVertex.Position + delta.Position,
                        baseVertex.Normal + delta.Normal
                    );
                    target.SetVertex(baseVertex, morphedVertex);
                }
            }
        }
    }

    private static void ApplyMorphTargets(
        MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexEmpty> builder,
        ImportedMesh mesh,
        IReadOnlyList<ImportedMorph> morphs
    )
    {
        if (morphs.Count == 0)
        {
            return;
        }

        var baseVertices = mesh.VertexList
            .Select(CreateMorphBaseVertex)
            .ToArray();

        var targetIndex = 0;
        foreach (var morph in morphs)
        {
            foreach (var channel in morph.Channels)
            {
                var target = builder.UseMorphTarget(targetIndex++);
                var deltaByIndex = new Dictionary<uint, (NumVec3 Position, NumVec3 Normal)>();

                foreach (var keyframe in channel.KeyframeList)
                {
                    foreach (var morphVertex in keyframe.VertexList)
                    {
                        if (morphVertex.Index >= baseVertices.Length)
                        {
                            continue;
                        }

                        var baseVertex = baseVertices[morphVertex.Index];
                        var morphedPosition = ToNumerics(morphVertex.Vertex.Vertex);
                        var positionDelta = morphedPosition - baseVertex.Position;
                        var normalDelta = NumVec3.Zero;
                        if (keyframe.hasNormals)
                        {
                            normalDelta = ToNumerics(morphVertex.Vertex.Normal) - baseVertex.Normal;
                        }

                        if (deltaByIndex.TryGetValue(morphVertex.Index, out var existing))
                        {
                            deltaByIndex[morphVertex.Index] = (
                                existing.Position + positionDelta,
                                existing.Normal + normalDelta
                            );
                        }
                        else
                        {
                            deltaByIndex[morphVertex.Index] = (positionDelta, normalDelta);
                        }
                    }
                }

                foreach (var pair in deltaByIndex)
                {
                    var index = (int)pair.Key;
                    var baseVertex = baseVertices[index];
                    var delta = pair.Value;
                    var morphedVertex = new VertexPositionNormal(
                        baseVertex.Position + delta.Position,
                        baseVertex.Normal + delta.Normal
                    );
                    target.SetVertex(baseVertex, morphedVertex);
                }
            }
        }
    }

    private static VertexPositionNormal CreateMorphBaseVertex(ImportedVertex source)
    {
        var position = ToNumerics(source.Vertex);
        var normal = source.Normal is { } ? ToNumerics(source.Normal) : NumVec3.UnitY;
        return new VertexPositionNormal(position, normal);
    }

    private static MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexEmpty> BuildRigidMesh(
        ImportedMesh mesh,
        IReadOnlyDictionary<string, MaterialBuilder> materialMap,
        IReadOnlyDictionary<string, ImportedMorph> morphMap
    )
    {
        var builder = new MeshBuilder<MaterialBuilder, VertexPositionNormal, VertexColor1Texture2, VertexEmpty>(mesh.Path);
        foreach (var submesh in mesh.SubmeshList)
        {
            var material = materialMap[submesh.Material];
            var primitive = builder.UsePrimitive(material, 3);
            foreach (var face in submesh.FaceList)
            {
                var a = CreateRigidVertex(mesh, submesh.BaseVertex + face.VertexIndices[0]);
                var b = CreateRigidVertex(mesh, submesh.BaseVertex + face.VertexIndices[1]);
                var c = CreateRigidVertex(mesh, submesh.BaseVertex + face.VertexIndices[2]);
                primitive.AddTriangle(a, b, c);
            }
        }
        ApplyMorphTargets(builder, mesh, ResolveMorphTargets(mesh.Path, morphMap));
        return builder;
    }

    private static VertexBuilder<VertexPositionNormal, VertexColor1Texture2, VertexJoints4> CreateSkinnedVertex(
        ImportedMesh mesh,
        int vertexIndex
    )
    {
        var source = mesh.VertexList[vertexIndex];
        var normal = mesh.hasNormal ? ToNumerics(source.Normal) : NumVec3.UnitY;
        var uv0 = ReadUv(source, 0);
        var uv1 = ReadUv(source, 1);
        var color = ReadColor(mesh, source);
        var skin = new VertexJoints4(BuildWeights(source));
        return new VertexBuilder<VertexPositionNormal, VertexColor1Texture2, VertexJoints4>(
            new VertexPositionNormal(ToNumerics(source.Vertex), normal),
            new VertexColor1Texture2(color, uv0, uv1),
            skin
        );
    }

    private static VertexBuilder<VertexPositionNormal, VertexColor1Texture2, VertexEmpty> CreateRigidVertex(
        ImportedMesh mesh,
        int vertexIndex
    )
    {
        var source = mesh.VertexList[vertexIndex];
        var normal = mesh.hasNormal ? ToNumerics(source.Normal) : NumVec3.UnitY;
        var uv0 = ReadUv(source, 0);
        var uv1 = ReadUv(source, 1);
        var color = ReadColor(mesh, source);
        return new VertexBuilder<VertexPositionNormal, VertexColor1Texture2, VertexEmpty>(
            new VertexPositionNormal(ToNumerics(source.Vertex), normal),
            new VertexColor1Texture2(color, uv0, uv1)
        );
    }

    private static NumVec4 ReadColor(ImportedMesh mesh, ImportedVertex source)
    {
        if (!mesh.hasColor)
        {
            return NumVec4.One;
        }

        return new NumVec4(
            source.Color.R,
            source.Color.G,
            source.Color.B,
            source.Color.A
        );
    }

    private static NumVec2 ReadUv(ImportedVertex source, int channel)
    {
        return source.UV is { Length: > 0 }
            && channel < source.UV.Length
            && source.UV[channel] is { Length: >= 2 }
                ? new NumVec2(source.UV[channel][0], source.UV[channel][1])
                : NumVec2.Zero;
    }

    private static (int, float)[] BuildWeights(ImportedVertex vertex)
    {
        if (vertex.BoneIndices is null || vertex.Weights is null)
        {
            return new[] { (0, 1.0f) };
        }

        var weights = new List<(int, float)>();
        for (var i = 0; i < Math.Min(vertex.BoneIndices.Length, vertex.Weights.Length); i++)
        {
            if (vertex.Weights[i] <= 0)
            {
                continue;
            }
            weights.Add((vertex.BoneIndices[i], vertex.Weights[i]));
        }

        return weights.Count > 0 ? weights.ToArray() : new[] { (0, 1.0f) };
    }

    private static NodeBuilder BuildNodeTree(
        ImportedFrame frame,
        NodeBuilder? parent,
        Dictionary<ImportedFrame, NodeBuilder> map
    )
    {
        var node = parent is null ? new NodeBuilder(frame.Name) : parent.CreateNode(frame.Name);
        node.WithLocalTranslation(ToNumerics(frame.LocalPosition));
        node.WithLocalScale(ToNumerics(frame.LocalScale));
        node.WithLocalRotation(ToQuaternion(frame.LocalRotation));
        map[frame] = node;
        for (var i = 0; i < frame.Count; i++)
        {
            BuildNodeTree(frame[i], node, map);
        }
        return node;
    }

    private static NodeBuilder? BuildRequiredNodeTree(
        ImportedFrame frame,
        IReadOnlySet<string> requiredFramePaths,
        NodeBuilder? parent,
        Dictionary<ImportedFrame, NodeBuilder> map
    )
    {
        var childNodes = new List<(ImportedFrame Frame, NodeBuilder Node)>();
        for (var i = 0; i < frame.Count; i++)
        {
            var child = frame[i];
            var childNode = BuildRequiredNodeTree(child, requiredFramePaths, null, map);
            if (childNode is not null)
            {
                childNodes.Add((child, childNode));
            }
        }

        if (!requiredFramePaths.Contains(frame.Path) && childNodes.Count == 0)
        {
            return null;
        }

        var node = CloneFrameNode(frame, parent);
        map[frame] = node;
        foreach (var child in childNodes)
        {
            AttachExistingNode(node, child.Node);
        }
        return node;
    }

    private static NodeBuilder CloneFrameNode(
        ImportedFrame frame,
        NodeBuilder? parent
    )
    {
        var node = parent is null ? new NodeBuilder(frame.Name) : parent.CreateNode(frame.Name);
        node.WithLocalTranslation(ToNumerics(frame.LocalPosition));
        node.WithLocalScale(ToNumerics(frame.LocalScale));
        node.WithLocalRotation(ToQuaternion(frame.LocalRotation));
        return node;
    }

    private static void AttachExistingNode(NodeBuilder parent, NodeBuilder child)
    {
        parent.AddNode(child);
    }

    private static void CollectNodes(
        NodeBuilder node,
        ImportedFrame frame,
        Dictionary<string, NodeBuilder> nodeMap
    )
    {
        nodeMap[frame.Path] = node;
        for (var i = 0; i < frame.Count; i++)
        {
            var child = frame[i];
            var childNode = node.VisualChildren[i];
            CollectNodes(childNode, child, nodeMap);
        }
    }

    private static void CollectNodes(
        IReadOnlyDictionary<ImportedFrame, NodeBuilder> frameNodeMap,
        Dictionary<string, NodeBuilder> nodeMap
    )
    {
        foreach (var pair in frameNodeMap)
        {
            nodeMap[pair.Key.Path] = pair.Value;
        }
    }

    private static void CollectFrames(
        ImportedFrame frame,
        Dictionary<string, ImportedFrame> frameMap
    )
    {
        frameMap[frame.Path] = frame;
        for (var i = 0; i < frame.Count; i++)
        {
            CollectFrames(frame[i], frameMap);
        }
    }

    private static IReadOnlyDictionary<string, string> BuildUniqueFramePathByName(ImportedFrame root)
    {
        var groups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        CollectFrameNameGroups(root, groups);
        return groups
            .Where(pair => pair.Value.Count == 1)
            .ToDictionary(pair => pair.Key, pair => pair.Value[0], StringComparer.OrdinalIgnoreCase);
    }

    private static void CollectFrameNameGroups(
        ImportedFrame frame,
        Dictionary<string, List<string>> groups
    )
    {
        if (!groups.TryGetValue(frame.Name, out var paths))
        {
            paths = new List<string>();
            groups[frame.Name] = paths;
        }
        paths.Add(frame.Path);

        for (var i = 0; i < frame.Count; i++)
        {
            CollectFrameNameGroups(frame[i], groups);
        }
    }

    private static void MergeHeadSkeletonIntoBody(
        IImported headImported,
        HeadAssetManifest headManifest,
        IReadOnlyDictionary<string, ImportedFrame> bodyFrameMap,
        IReadOnlyDictionary<string, string> bodyPathByName,
        Dictionary<string, NodeBuilder> bodyNodeMap,
        Dictionary<string, NodeBuilder> headNodeMap,
        Dictionary<string, string> headLogicalPathByImportedPath
    )
    {
        var remap = headManifest.Assembly.BoneRemap ?? new Dictionary<string, string>();
        foreach (var pair in remap)
        {
            var headFrame = headImported.RootFrame.FindFrame(pair.Key);
            if (bodyPathByName.TryGetValue(pair.Value, out var bodyPath) &&
                bodyNodeMap.ContainsKey(bodyPath))
            {
                if (headFrame is not null)
                {
                    headNodeMap[headFrame.Path] = bodyNodeMap[bodyPath];
                    headLogicalPathByImportedPath[headFrame.Path] = bodyPath;
                }
                headNodeMap[bodyPath] = bodyNodeMap[bodyPath];
                headNodeMap[pair.Key] = bodyNodeMap[bodyPath];
                headLogicalPathByImportedPath[pair.Key] = bodyPath;
            }
        }

        var bodyHeadName = remap.TryGetValue("Head", out var remappedHeadName)
            ? remappedHeadName
            : "Head";
        if (!bodyPathByName.TryGetValue(bodyHeadName, out var bodyHeadPath) ||
            !bodyFrameMap.TryGetValue(bodyHeadPath, out var bodyHeadFrame) ||
            !bodyNodeMap.TryGetValue(bodyHeadPath, out var bodyHeadNode))
        {
            return;
        }

        var headAttachFrame = headImported.RootFrame.FindFrame(headManifest.Assembly.AttachOrigin.NodeName ?? string.Empty)
            ?? headImported.RootFrame.FindFrame("Head");
        var headAttachPath = headAttachFrame?.Path;

        foreach (var mesh in headImported.MeshList)
        {
            foreach (var bone in mesh.BoneList ?? new List<ImportedBone>())
            {
                var frame = headImported.RootFrame.FindFrameByPath(bone.Path);
                if (frame is null)
                {
                    continue;
                }
                EnsureMergedHeadFrame(
                    frame,
                    headAttachPath,
                    bodyHeadPath,
                    bodyHeadNode,
                    bodyFrameMap,
                    bodyPathByName,
                    bodyNodeMap,
                    headNodeMap,
                    headLogicalPathByImportedPath,
                    remap
                );
            }
        }

        foreach (var frame in EnumerateFrames(headImported.RootFrame))
        {
            if (!IsHeadAttachmentHelperFrame(frame))
            {
                continue;
            }

            EnsureMergedHeadFrame(
                frame,
                headAttachPath,
                bodyHeadPath,
                bodyHeadNode,
                bodyFrameMap,
                bodyPathByName,
                bodyNodeMap,
                headNodeMap,
                headLogicalPathByImportedPath,
                remap
            );
        }
    }

    private static IEnumerable<ImportedFrame> EnumerateFrames(ImportedFrame frame)
    {
        yield return frame;
        for (var i = 0; i < frame.Count; i++)
        {
            foreach (var child in EnumerateFrames(frame[i]))
            {
                yield return child;
            }
        }
    }

    private static bool IsHeadAttachmentHelperFrame(ImportedFrame frame)
    {
        return frame.Name.Length == 3 &&
            (frame.Name[0] is 'a' or 'A') &&
            char.IsDigit(frame.Name[1]) &&
            char.IsDigit(frame.Name[2]);
    }

    private static bool EnsureMergedHeadFrame(
        ImportedFrame frame,
        string? headAttachPath,
        string bodyHeadPath,
        NodeBuilder bodyHeadNode,
        IReadOnlyDictionary<string, ImportedFrame> bodyFrameMap,
        IReadOnlyDictionary<string, string> bodyPathByName,
        IReadOnlyDictionary<string, NodeBuilder> bodyNodeMap,
        Dictionary<string, NodeBuilder> headNodeMap,
        Dictionary<string, string> headLogicalPathByImportedPath,
        IReadOnlyDictionary<string, string> remap
    )
    {
        if (headNodeMap.ContainsKey(frame.Path))
        {
            return true;
        }

        if (remap.TryGetValue(frame.Name, out var mappedName) &&
            bodyPathByName.TryGetValue(mappedName, out var mappedPath) &&
            bodyNodeMap.TryGetValue(mappedPath, out var mappedNode))
        {
            headNodeMap[frame.Path] = mappedNode;
            headNodeMap[mappedPath] = mappedNode;
            headNodeMap[frame.Name] = mappedNode;
            headLogicalPathByImportedPath[frame.Path] = mappedPath;
            headLogicalPathByImportedPath[frame.Name] = mappedPath;
            return true;
        }

        var parentFrame = frame.Parent;
        NodeBuilder parentNode;
        string parentLogicalPath;
        if (
            parentFrame is null ||
            (!string.IsNullOrWhiteSpace(headAttachPath) &&
                string.Equals(parentFrame.Path, headAttachPath, StringComparison.OrdinalIgnoreCase))
        )
        {
            parentNode = bodyHeadNode;
            parentLogicalPath = bodyHeadPath;
        }
        else
        {
            if (!EnsureMergedHeadFrame(
                    parentFrame,
                    headAttachPath,
                    bodyHeadPath,
                    bodyHeadNode,
                    bodyFrameMap,
                    bodyPathByName,
                    bodyNodeMap,
                    headNodeMap,
                    headLogicalPathByImportedPath,
                    remap
                ))
            {
                return false;
            }

            if (!headNodeMap.TryGetValue(parentFrame.Path, out parentNode!))
            {
                return false;
            }
            parentLogicalPath = ResolveLogicalPath(parentFrame.Path, headLogicalPathByImportedPath);
        }

        var node = CloneFrameNode(frame, null);
        AttachExistingNode(parentNode, node);
        var logicalPath = $"{parentLogicalPath}/{frame.Name}";
        headNodeMap[frame.Path] = node;
        headNodeMap[logicalPath] = node;
        headLogicalPathByImportedPath[frame.Path] = logicalPath;
        return true;
    }

    private static string ResolveLogicalPath(
        string importedPath,
        IReadOnlyDictionary<string, string> logicalPathByImportedPath
    )
    {
        return logicalPathByImportedPath.TryGetValue(importedPath, out var logicalPath)
            ? logicalPath
            : importedPath;
    }

    private static NodeBuilder ResolveMeshNode(
        ImportedMesh mesh,
        IReadOnlyDictionary<string, NodeBuilder> nodeMap,
        NodeBuilder root
    )
    {
        return nodeMap.TryGetValue(mesh.Path, out var node)
            ? node
            : root;
    }

    private static NodeBuilder ResolveMeshNodeByBonePath(
        string path,
        IReadOnlyDictionary<string, NodeBuilder> nodeMap,
        NodeBuilder root
    )
    {
        return nodeMap.TryGetValue(path, out var node)
            ? node
            : root;
    }

    private static NumVec3 ToNumerics(AssetStudio.Vector3 value)
    {
        return new NumVec3(value.X, value.Y, value.Z);
    }

    private static NumMat4 ToNumerics(AssetStudio.Matrix4x4 value)
    {
        return new NumMat4(
            value.M00, value.M01, value.M02, value.M03,
            value.M10, value.M11, value.M12, value.M13,
            value.M20, value.M21, value.M22, value.M23,
            value.M30, value.M31, value.M32, value.M33
        );
    }

    private static NumQuat ToQuaternion(AssetStudio.Vector3 eulerDegrees)
    {
        var q = Fbx.EulerToQuaternion(eulerDegrees);
        return new NumQuat(q.X, q.Y, q.Z, q.W);
    }

    private static void RebindSkinsWithImportedBindPoses(
        ModelRoot model,
        IImported imported
    )
    {
        RebindSkinsWithImportedBindPoses(
            model,
            imported,
            logicalPathByImportedPath: null,
            skeletonRootPathOverride: null
        );
    }

    private static void RebindSkinsWithImportedBindPoses(
        ModelRoot model,
        IImported imported,
        IReadOnlyDictionary<string, string>? logicalPathByImportedPath,
        string? skeletonRootPathOverride
    )
    {
        if (imported.MeshList.Count == 0 || model.LogicalSkins.Count == 0)
        {
            return;
        }

        var scene = model.DefaultScene ?? model.LogicalScenes.FirstOrDefault();
        if (scene is null)
        {
            return;
        }

        var nodePathMap = new Dictionary<string, SharpGLTF.Schema2.Node>(StringComparer.OrdinalIgnoreCase);
        foreach (var rootNode in scene.VisualChildren)
        {
            CollectLogicalNodePaths(rootNode, null, nodePathMap);
        }

        var importedMeshes = imported.MeshList
            .Where(mesh => mesh.BoneList is { Count: > 0 })
            .ToDictionary(mesh => mesh.Path, StringComparer.OrdinalIgnoreCase);

        foreach (var logicalMesh in model.LogicalMeshes)
        {
            if (string.IsNullOrWhiteSpace(logicalMesh.Name))
            {
                continue;
            }

            if (!importedMeshes.TryGetValue(logicalMesh.Name, out var importedMesh))
            {
                continue;
            }

            foreach (var meshNode in SharpGLTF.Schema2.Node.FindNodesUsingMesh(logicalMesh))
            {
                if (meshNode.Skin is null)
                {
                    continue;
                }

                var bindings = new List<(SharpGLTF.Schema2.Node Joint, NumMat4 InverseBindMatrix)>(importedMesh.BoneList.Count);
                var missingBone = false;
                foreach (var bone in importedMesh.BoneList)
                {
                    var logicalPath = logicalPathByImportedPath is not null &&
                        logicalPathByImportedPath.TryGetValue(bone.Path, out var mappedPath)
                            ? mappedPath
                            : bone.Path;
                    if (!TryResolveLogicalNodeByImportedPath(nodePathMap, logicalPath, out var jointNode))
                    {
                        missingBone = true;
                        break;
                    }

                    bindings.Add((jointNode, ToNumerics(bone.Matrix)));
                }

                if (missingBone || bindings.Count == 0)
                {
                    continue;
                }

                meshNode.Skin.BindJoints(bindings);
                var skeletonRootPath = skeletonRootPathOverride ?? imported.RootFrame.Path;
                if (TryResolveLogicalNodeByImportedPath(nodePathMap, skeletonRootPath, out var skeletonRoot))
                {
                    meshNode.Skin.Skeleton = skeletonRoot;
                }
            }
        }
    }

    private static void CollectLogicalNodePaths(
        SharpGLTF.Schema2.Node node,
        string? parentPath,
        Dictionary<string, SharpGLTF.Schema2.Node> nodePathMap
    )
    {
        var currentPath = string.IsNullOrWhiteSpace(parentPath)
            ? node.Name ?? string.Empty
            : $"{parentPath}/{node.Name}";
        if (!string.IsNullOrWhiteSpace(currentPath))
        {
            nodePathMap[currentPath] = node;
        }

        foreach (var child in node.VisualChildren)
        {
            CollectLogicalNodePaths(child, currentPath, nodePathMap);
        }
    }

    private static bool TryResolveLogicalNodeByImportedPath(
        IReadOnlyDictionary<string, SharpGLTF.Schema2.Node> nodePathMap,
        string importedPath,
        out SharpGLTF.Schema2.Node node
    )
    {
        if (nodePathMap.TryGetValue(importedPath, out node!))
        {
            return true;
        }

        var suffix = "/" + importedPath;
        var match = nodePathMap
            .FirstOrDefault(pair => pair.Key.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(match.Key))
        {
            node = match.Value;
            return true;
        }

        node = null!;
        return false;
    }
}
