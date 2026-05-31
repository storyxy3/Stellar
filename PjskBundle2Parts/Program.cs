using System.Reflection;
using System.Text;
using System.Text.Json;
using AssetStudio;
using PjskBundle2Parts.Models;
using PjskBundle2Parts.Services;

Logger.Default = new AssetStudioConsoleLogger();

var parseResult = ConversionOptionsParser.Parse(args);

if (!parseResult.IsSuccess || parseResult.Options is null)
{
    Console.Error.WriteLine(parseResult.ErrorMessage);
    Console.Error.WriteLine();
    Console.Error.WriteLine(ConversionOptionsParser.Usage);
    return 1;
}

var options = parseResult.Options;
var resolver = new BundleInputResolver();
var character3dCostumeResolver = new Character3dCostumeResolver();
var parser = new AssetStudioBundleParser();
var modelFactory = new AssetStudioImportedModelFactory();
var emitter = new GltfEmitter();
var springBoneExporter = new SpringBoneExporter();
var vrmSpringBoneCandidateBuilder = new VrmSpringBoneCandidateBuilder();
var vrmcSpringBoneExtensionBuilder = new VrmcSpringBoneExtensionBuilder();
var vrmcVrmExtensionBuilder = new VrmcVrmExtensionBuilder();
var pjskSekaiRuntimeExtensionBuilder = new PjskSekaiRuntimeExtensionBuilder();
var gltfExtensionInjector = new GltfExtensionInjector();
var motionPackageExporter = new MotionPackageExporter();
var outputPruner = new OutputPruner();
string? motionPath = options.MotionPath;
IReadOnlyDictionary<string, float>? characterHeightMetersById = null;
ResolvedBundleInput bodyInput;
ResolvedBundleInput headInput;
ResolvedBundleInput? accessoryInput = null;
BundleInventory bodyInventory;
BundleInventory headInventory;
BundleInventory? accessoryInventory = null;
ResolvedCharacter3dCostume? resolvedCharacter3dCostume = null;

try
{
    if (!string.IsNullOrWhiteSpace(options.MasterDirectory))
    {
        characterHeightMetersById = LoadCharacterHeightMetersById(options.MasterDirectory!);
    }

    if (options.Character3dId is not null)
    {
        resolvedCharacter3dCostume = character3dCostumeResolver.Resolve(
            options.Character3dId.Value,
            options.MasterDirectory!,
            options.AssetRoot!
        );
        bodyInput = resolver.ResolveBody(resolvedCharacter3dCostume.BodyPath);
        headInput = resolver.ResolveHead(resolvedCharacter3dCostume.MainHeadPath);
        var masterCharacterId = resolvedCharacter3dCostume.CharacterId.ToString("00");
        bodyInput = bodyInput with { CharacterId = masterCharacterId };
        headInput = headInput with { CharacterId = masterCharacterId };
        if (resolvedCharacter3dCostume.AccessoryHeadPath is not null)
        {
            accessoryInput = resolver.ResolveHead(resolvedCharacter3dCostume.AccessoryHeadPath);
            accessoryInput = accessoryInput with { CharacterId = masterCharacterId };
        }
        motionPath ??= ResolveDefaultCostumeSettingMotionPath(
            options.AssetRoot!,
            resolvedCharacter3dCostume.CharacterId
        );
    }
    else
    {
        bodyInput = resolver.ResolveBody(options.BodyPath!);
        headInput = resolver.ResolveHead(options.HeadPath!);
    }
    bodyInventory = parser.Parse(bodyInput);
    headInventory = parser.Parse(headInput);
    if (accessoryInput is not null)
    {
        accessoryInventory = parser.Parse(accessoryInput);
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Bundle parsing failed: {ex.Message}");
    return 2;
}

var planner = new ConversionPlanner(characterHeightMetersById);
var plan = planner.CreatePlan(
    bodyInput,
    headInput,
    options.OutputDirectory,
    bodyInventory,
    headInventory,
    options.HeadRootName
);
var bodySpringBone = springBoneExporter.Export(bodyInput);
var headSpringBone = springBoneExporter.Export(headInput);
var combinedSpringBone = new CombinedSpringBoneExport(
    Version: 1,
    Body: bodySpringBone,
    Head: headSpringBone
);
var vrmSpringBoneCandidate = vrmSpringBoneCandidateBuilder.Build(combinedSpringBone);

var importedBody = modelFactory.CreateImportedModel(bodyInput);
var importedHead = modelFactory.CreateImportedModel(headInput, plan.HeadManifestTemplate.Assembly.RootNodeName);
IImported? headTextureFallback = null;
if (resolvedCharacter3dCostume?.HeadTextureFallbackPath is not null)
{
    var fallbackInput = resolver.ResolveHead(resolvedCharacter3dCostume.HeadTextureFallbackPath)
        with { CharacterId = headInput.CharacterId };
    headTextureFallback = modelFactory.CreateImportedModel(fallbackInput);
    plan = plan with
    {
            HeadManifestTemplate = FillMissingHeadLayerTextures(
                plan.HeadManifestTemplate,
                importedHead,
                headTextureFallback
            ),
    };
}
if (HasMissingHeadLayerTextures(plan.HeadManifestTemplate))
{
    foreach (var fallbackTexturePath in ResolveDefaultHeadLayerTextureFallbackPaths(headInput.ResolvedBundlePath))
    {
        var fallbackTextures = modelFactory.CreateImportedTextures(fallbackTexturePath);
        plan = plan with
        {
            HeadManifestTemplate = FillMissingHeadLayerTexturesFromTextures(
                plan.HeadManifestTemplate,
                importedHead,
                fallbackTextures
            ),
        };

        if (!HasMissingHeadLayerTextures(plan.HeadManifestTemplate))
        {
            break;
        }
    }
}
var importedAccessory = accessoryInput is not null
    ? modelFactory.CreateImportedModel(accessoryInput, SelectAccessoryRootName(accessoryInventory))
    : null;

var bodyEmission = emitter.EmitBody(
    Path.Combine(options.OutputDirectory, "body"),
    "body.glb",
    plan.BodyManifestTemplate,
    importedBody
);
var headEmission = emitter.EmitHead(
    Path.Combine(options.OutputDirectory, "head"),
    "head.glb",
    plan.HeadManifestTemplate,
    importedHead
);
var characterEmission = emitter.EmitCharacter(
    Path.Combine(options.OutputDirectory, "character"),
    "character.glb",
    plan.BodyManifestTemplate,
    plan.HeadManifestTemplate,
    importedBody,
    importedHead,
    vrmSpringBoneCandidate,
    importedAccessory,
    resolvedCharacter3dCostume?.AccessoryAttachNode
);

var updatedBodyManifest = UpdateBodyManifest(plan.BodyManifestTemplate, bodyEmission);
var updatedHeadManifest = UpdateHeadManifest(plan.HeadManifestTemplate, headEmission, importedHead);
plan = plan with
{
    BodyManifestTemplate = updatedBodyManifest,
    HeadManifestTemplate = updatedHeadManifest,
};
var motionExport = motionPackageExporter.Export(
    motionPath,
    Path.Combine(options.OutputDirectory, "motion"),
    importedBody
);
if (motionExport.BodyMotionGlbPath is not null)
{
    plan = plan with
    {
        BodyManifestTemplate = plan.BodyManifestTemplate with
        {
            Source = plan.BodyManifestTemplate.Source with
            {
                AnimationUrls = new[]
                {
                    Path.GetRelativePath(
                        options.OutputDirectory,
                        motionExport.BodyMotionGlbPath
                    ).Replace('\\', '/')
                },
            },
        },
    };
}

vrmcSpringBoneExtensionBuilder.PrepareRuntimeGlb(
    vrmSpringBoneCandidate,
    Path.Combine(options.OutputDirectory, "character", characterEmission.RelativeGlbPath),
    plan.CharacterSpringBoneGlbPath
);
var vrmcSpringBone = vrmcSpringBoneExtensionBuilder.Build(
    vrmSpringBoneCandidate,
    plan.CharacterSpringBoneGlbPath
);
gltfExtensionInjector.InjectRootExtension(
    plan.CharacterSpringBoneGlbPath,
    plan.CharacterSpringBoneGlbPath,
    "VRMC_springBone",
    vrmcSpringBone.Extension
);
var vrmcVrm = vrmcVrmExtensionBuilder.Build(
    plan.SekaiVrmProfile,
    plan.Summary,
    plan.CharacterSpringBoneGlbPath
);
gltfExtensionInjector.InjectRootExtension(
    plan.CharacterSpringBoneGlbPath,
    plan.CharacterVrmCoreGlbPath,
    "VRMC_vrm",
    vrmcVrm.Extension
);
var pjskSekaiRuntime = pjskSekaiRuntimeExtensionBuilder.Build(
    plan,
    characterEmission.TexturePathByName,
    Path.Combine("character", Path.GetFileName(plan.CharacterVrmPath)).Replace('\\', '/'),
    combinedSpringBone,
    vrmSpringBoneCandidate,
    motionExport,
    resolvedCharacter3dCostume
);
gltfExtensionInjector.InjectRootExtension(
    plan.CharacterVrmCoreGlbPath,
    plan.CharacterVrmCandidateGlbPath,
    plan.SekaiVrmProfile.SekaiRuntimeExtras.ExtensionName,
    pjskSekaiRuntime.Extension
);
File.Copy(plan.CharacterVrmCandidateGlbPath, plan.CharacterVrmPath, overwrite: true);

Directory.CreateDirectory(options.OutputDirectory);
await WriteJsonAsync(plan.PjskSekaiRuntimeExtensionPath, pjskSekaiRuntime.Extension);
await WriteJsonAsync(plan.BodySpringBonePath, bodySpringBone);
await WriteJsonAsync(plan.HeadSpringBonePath, headSpringBone);
await WriteJsonAsync(plan.CombinedSpringBonePath, combinedSpringBone);
await WriteJsonAsync(plan.VrmSpringBoneCandidatePath, vrmSpringBoneCandidate);
await WriteJsonAsync(plan.VrmcSpringBoneExtensionPath, vrmcSpringBone.Extension);
await WriteJsonAsync(plan.VrmcSpringBoneResolveReportPath, vrmcSpringBone.Report);
if (options.KeepIntermediate)
{
    await planner.WritePlanAsync(plan);
    await planner.WriteInventoriesAsync(plan);
    await planner.WriteManifestTemplatesAsync(plan);
    await planner.WriteSekaiVrmProfileAsync(plan);
    await WriteJsonAsync(plan.VrmcVrmExtensionPath, vrmcVrm.Extension);
    await WriteJsonAsync(plan.VrmcVrmResolveReportPath, vrmcVrm.Report);
    await WriteJsonAsync(plan.PjskSekaiRuntimeResolveReportPath, pjskSekaiRuntime.Report);
}
else
{
    outputPruner.Prune(options.OutputDirectory);
}

var jsonOptions = new JsonSerializerOptions
{
    WriteIndented = true,
};

Console.WriteLine("Resolved inputs");
if (resolvedCharacter3dCostume is not null)
{
    Console.WriteLine($"  Character3D: {resolvedCharacter3dCostume.Character3dId} ({resolvedCharacter3dCostume.CharacterName})");
    Console.WriteLine($"  Body costume: {resolvedCharacter3dCostume.BodyCostume3dId} -> {resolvedCharacter3dCostume.BodyAssetbundleName}");
    Console.WriteLine($"  Hair costume: {resolvedCharacter3dCostume.HairCostume3dId} -> {resolvedCharacter3dCostume.HairAssetbundleName} ({resolvedCharacter3dCostume.HairBundleKind}, group {resolvedCharacter3dCostume.HairVariantGroupKey})");
    Console.WriteLine($"  Head costume: {resolvedCharacter3dCostume.HeadCostume3dId} -> {resolvedCharacter3dCostume.HeadAssetbundleName} ({resolvedCharacter3dCostume.HeadColorAssetbundleName ?? "default"}, {resolvedCharacter3dCostume.HeadBundleKind}, group {resolvedCharacter3dCostume.HeadVariantGroupKey})");
    Console.WriteLine($"  Head composition: {resolvedCharacter3dCostume.HeadCompositionKind}");
    Console.WriteLine($"  Main head: {resolvedCharacter3dCostume.MainHeadAssetbundleName} ({resolvedCharacter3dCostume.MainHeadMode}, {resolvedCharacter3dCostume.MainHeadCostumeType})");
    if (resolvedCharacter3dCostume.AccessoryHeadAssetbundleName is not null)
    {
        Console.WriteLine($"  Head accessory: {resolvedCharacter3dCostume.AccessoryHeadAssetbundleName} -> {resolvedCharacter3dCostume.AccessoryHeadPath ?? "<missing>"} ({resolvedCharacter3dCostume.AccessoryHeadCostumeType ?? "head_only"}, attach {resolvedCharacter3dCostume.AccessoryAttachNode ?? "<unknown>"})");
        if (resolvedCharacter3dCostume.AccessoryColorAssetbundleName is not null)
        {
            Console.WriteLine($"  Head accessory color: {resolvedCharacter3dCostume.AccessoryColorAssetbundleName} -> {resolvedCharacter3dCostume.AccessoryColorVariationPath ?? "<missing>"}");
        }
    }
}
    Console.WriteLine($"  Body: {bodyInput.ResolvedBundlePath}");
    Console.WriteLine($"  Head: {headInput.ResolvedBundlePath}");
    if (accessoryInput is not null)
    {
        Console.WriteLine($"  Accessory: {accessoryInput.ResolvedBundlePath}");
    }
    if (motionPath is not null)
    {
        Console.WriteLine($"  Motion: {motionPath}");
    }
Console.WriteLine();
Console.WriteLine("Generated files");
Console.WriteLine($"  PJSK runtime extension: {plan.PjskSekaiRuntimeExtensionPath}");
Console.WriteLine($"  PJSK springbone payload: body={pjskSekaiRuntime.Extension.PjskSpringBone.Raw.Body.Bones.Count}, head={pjskSekaiRuntime.Extension.PjskSpringBone.Raw.Head.Bones.Count}");
Console.WriteLine($"  Character VRM: {Path.GetRelativePath(options.OutputDirectory, plan.CharacterVrmPath).Replace('\\', '/')}");
if (options.KeepIntermediate)
{
    Console.WriteLine($"  Plan: {plan.PlanPath}");
    Console.WriteLine($"  Body inventory: {plan.BodyInventoryPath}");
    Console.WriteLine($"  Head inventory: {plan.HeadInventoryPath}");
    Console.WriteLine($"  Body template: {plan.BodyManifestTemplatePath}");
    Console.WriteLine($"  Head template: {plan.HeadManifestTemplatePath}");
    Console.WriteLine($"  Sekai VRM profile: {plan.SekaiVrmProfilePath}");
    Console.WriteLine($"  Body springbone: {plan.BodySpringBonePath}");
    Console.WriteLine($"  Head springbone: {plan.HeadSpringBonePath}");
    Console.WriteLine($"  Combined springbone: {plan.CombinedSpringBonePath}");
    Console.WriteLine($"  VRM springbone candidate: {plan.VrmSpringBoneCandidatePath}");
    Console.WriteLine($"  VRMC springbone extension: {plan.VrmcSpringBoneExtensionPath}");
    Console.WriteLine($"  VRMC springbone resolve report: {plan.VrmcSpringBoneResolveReportPath}");
    Console.WriteLine($"  VRMC vrm extension: {plan.VrmcVrmExtensionPath}");
    Console.WriteLine($"  VRMC vrm resolve report: {plan.VrmcVrmResolveReportPath}");
    Console.WriteLine($"  PJSK runtime resolve report: {plan.PjskSekaiRuntimeResolveReportPath}");
    Console.WriteLine($"  Body glb: body/{bodyEmission.RelativeGlbPath}");
    Console.WriteLine($"  Head glb: head/{headEmission.RelativeGlbPath}");
    Console.WriteLine($"  Character glb: character/{characterEmission.RelativeGlbPath}");
    Console.WriteLine($"  Character springbone glb: {Path.GetRelativePath(options.OutputDirectory, plan.CharacterSpringBoneGlbPath).Replace('\\', '/')}");
    Console.WriteLine($"  Character VRM core glb: {Path.GetRelativePath(options.OutputDirectory, plan.CharacterVrmCoreGlbPath).Replace('\\', '/')}");
    Console.WriteLine($"  Character VRM candidate glb: {Path.GetRelativePath(options.OutputDirectory, plan.CharacterVrmCandidateGlbPath).Replace('\\', '/')}");
}
else
{
    Console.WriteLine("  Intermediate/debug outputs: pruned; springbone metadata JSON retained for handoff");
}
if (motionExport.BodyMotionGlbPath is not null)
{
    Console.WriteLine($"  Body motion glb: {Path.GetRelativePath(options.OutputDirectory, motionExport.BodyMotionGlbPath).Replace('\\', '/')}");
}
if (motionExport.FaceMotion is not null)
{
    Console.WriteLine($"  Embedded face motion clips: {motionExport.FaceMotion.Clips.Count}");
}
Console.WriteLine();
Console.WriteLine("Plan preview");
Console.WriteLine(JsonSerializer.Serialize(plan.Summary, jsonOptions));
return 0;

static async Task WriteJsonAsync<T>(string path, T payload)
{
    await using var stream = File.Create(path);
    await JsonSerializer.SerializeAsync(
        stream,
        payload,
        new JsonSerializerOptions
        {
            WriteIndented = true,
        }
    );
}

static string? ResolveDefaultCostumeSettingMotionPath(string assetRoot, int characterId)
{
    var root = Path.GetFullPath(assetRoot);
    var fileName = $"{characterId:00}_00.bundle";
    var candidates = new[]
    {
        Path.Combine(root, "character", "motion", "costume_setting", fileName),
        Path.Combine(root, "motion", "costume_setting", fileName),
        Path.Combine(root, "costume_setting", fileName),
    };
    return candidates.FirstOrDefault(File.Exists);
}

static BodyAssetManifest UpdateBodyManifest(
    BodyAssetManifest manifest,
    GlbEmissionResult emission
)
{
    return manifest with
    {
        Source = manifest.Source with
        {
            MeshUrl = Path.Combine("body", emission.RelativeGlbPath).Replace('\\', '/'),
            SkeletonUrl = Path.Combine("body", emission.RelativeGlbPath).Replace('\\', '/'),
        },
        BodyMaterials = manifest.BodyMaterials
            .Select(slot => slot with
            {
                MainTex = RewriteTexturePath("body", slot.MainTex, emission.TexturePathByName),
                ShadowTex = RewriteTexturePath("body", slot.ShadowTex, emission.TexturePathByName),
                ValueTex = RewriteTexturePath("body", slot.ValueTex, emission.TexturePathByName),
            })
            .ToList(),
    };
}

static HeadAssetManifest FillMissingHeadLayerTextures(
    HeadAssetManifest manifest,
    IImported importedHead,
    IImported fallbackHead
)
{
    var changed = false;
    var materials = manifest.FaceMaterials
        .Select(slot =>
        {
            if (
                !string.IsNullOrWhiteSpace(slot.MainTex) ||
                slot.MaterialKind is not ("eye" or "eyelight")
            )
            {
                return slot;
            }

            var fallbackTexture = FindFallbackHeadLayerTexture(fallbackHead, slot.MaterialKind);
            if (fallbackTexture is null)
            {
                return slot;
            }

            AddImportedTextureIfMissing(importedHead.TextureList, fallbackTexture);
            changed = true;
            return slot with
            {
                MainTex = Path.GetFileNameWithoutExtension(fallbackTexture.Name),
            };
        })
        .ToList();

    return changed
        ? manifest with { FaceMaterials = materials }
        : manifest;
}

static HeadAssetManifest FillMissingHeadLayerTexturesFromTextures(
    HeadAssetManifest manifest,
    IImported importedHead,
    IReadOnlyList<ImportedTexture> fallbackTextures
)
{
    var changed = false;
    var materials = manifest.FaceMaterials
        .Select(slot =>
        {
            if (
                !string.IsNullOrWhiteSpace(slot.MainTex) ||
                slot.MaterialKind is not ("eye" or "eyelight")
            )
            {
                return slot;
            }

            var fallbackTexture = FindFallbackHeadLayerTextureFromTextures(fallbackTextures, slot.MaterialKind);
            if (fallbackTexture is null)
            {
                return slot;
            }

            AddImportedTextureIfMissing(importedHead.TextureList, fallbackTexture);
            changed = true;
            return slot with
            {
                MainTex = Path.GetFileNameWithoutExtension(fallbackTexture.Name),
            };
        })
        .ToList();

    return changed
        ? manifest with { FaceMaterials = materials }
        : manifest;
}

static ImportedTexture? FindFallbackHeadLayerTexture(
    IImported fallbackHead,
    string materialKind
)
{
    var material = fallbackHead.MaterialList.FirstOrDefault(material =>
    {
        var name = material.Name.ToLowerInvariant();
        return materialKind == "eyelight"
            ? name.Contains("_ehl_")
            : name.Contains("_eye_") && !name.Contains("eyelash");
    });

    if (material is not null)
    {
        foreach (var textureRef in material.Textures)
        {
            var texture = fallbackHead.TextureList.FirstOrDefault(candidate =>
                string.Equals(candidate.Name, textureRef.Name, StringComparison.OrdinalIgnoreCase));
            if (texture is not null)
            {
                return texture;
            }
        }
    }

    return fallbackHead.TextureList.FirstOrDefault(texture =>
    {
        var name = texture.Name.ToLowerInvariant();
        return materialKind == "eyelight"
            ? name.Contains("tex_ehl_")
            : name.Contains("tex_eye_");
    });
}

static ImportedTexture? FindFallbackHeadLayerTextureFromTextures(
    IReadOnlyList<ImportedTexture> fallbackTextures,
    string materialKind
)
{
    return fallbackTextures.FirstOrDefault(texture =>
    {
        var name = texture.Name.ToLowerInvariant();
        return materialKind == "eyelight"
            ? name.Contains("tex_ehl_")
            : name.Contains("tex_eye_");
    });
}

static void AddImportedTextureIfMissing(
    List<ImportedTexture> destination,
    ImportedTexture source
)
{
    if (destination.Any(texture =>
            string.Equals(texture.Name, source.Name, StringComparison.OrdinalIgnoreCase)))
    {
        return;
    }

    using var stream = new MemoryStream(source.Data);
    destination.Add(new ImportedTexture(stream, source.Name));
}

static bool HasMissingHeadLayerTextures(HeadAssetManifest manifest)
{
    return manifest.FaceMaterials.Any(slot =>
        string.IsNullOrWhiteSpace(slot.MainTex) &&
        slot.MaterialKind is "eye" or "eyelight");
}

static IReadOnlyList<string> ResolveDefaultHeadLayerTextureFallbackPaths(string headBundlePath)
{
    var directory = Path.GetDirectoryName(headBundlePath);
    if (string.IsNullOrWhiteSpace(directory))
    {
        return Array.Empty<string>();
    }

    return new[] { "0001.bundle", "0001_mc.bundle" }
        .Select(fileName => Path.Combine(directory, fileName))
        .Where(path =>
            File.Exists(path) &&
            !string.Equals(
                Path.GetFullPath(path),
                Path.GetFullPath(headBundlePath),
                StringComparison.OrdinalIgnoreCase
            ))
        .ToList();
}

static HeadAssetManifest UpdateHeadManifest(
    HeadAssetManifest manifest,
    GlbEmissionResult emission,
    IImported importedHead
)
{
    return manifest with
    {
        Source = manifest.Source with
        {
            MeshUrl = Path.Combine("head", emission.RelativeGlbPath).Replace('\\', '/'),
        },
        FaceMaterials = manifest.FaceMaterials
            .Select(slot => slot with
            {
                MainTex = RewriteTexturePath("head", slot.MainTex, emission.TexturePathByName),
                ShadowTex = RewriteTexturePath("head", slot.ShadowTex, emission.TexturePathByName),
                FaceShadowTex = RewriteTexturePath("head", slot.FaceShadowTex, emission.TexturePathByName),
            })
            .ToList(),
        MorphChannels = importedHead.MorphList
            .Where(morph => morph.Path.EndsWith("/Face", StringComparison.OrdinalIgnoreCase) || string.Equals(morph.Path, "face/Face", StringComparison.OrdinalIgnoreCase))
            .SelectMany(morph => morph.Channels.Select(channel => channel.Name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList(),
        MorphChannelBindings = ReadHeadMorphBindings(importedHead),
    };
}

static uint ComputeCurveHash(string sourceName)
{
    var rawName = sourceName.StartsWith("blendShape.", StringComparison.OrdinalIgnoreCase)
        ? sourceName.Substring("blendShape.".Length)
        : sourceName;
    var crc = new SevenZip.CRC();
    var bytes = Encoding.UTF8.GetBytes(rawName);
    crc.Update(bytes, 0, (uint)bytes.Length);
    return crc.GetDigest();
}

static IReadOnlyList<HeadMorphChannel> ReadHeadMorphBindings(IImported importedHead)
{
    if (importedHead is not ModelConverter converter)
    {
        return Array.Empty<HeadMorphChannel>();
    }

    var field = typeof(ModelConverter).GetField("morphChannelNames", BindingFlags.NonPublic | BindingFlags.Instance);
    if (field?.GetValue(converter) is not Dictionary<uint, string> table)
    {
        return Array.Empty<HeadMorphChannel>();
    }

    return table
        .OrderBy(pair => pair.Value, StringComparer.OrdinalIgnoreCase)
        .Select(pair => new HeadMorphChannel(
            Name: pair.Value.Split('.').Last(),
            SourceName: pair.Value,
            NameHash: pair.Key,
            CurveHash: ComputeCurveHash(pair.Value)
        ))
        .ToList();
}

static string? RewriteTexturePath(
    string partPrefix,
    string? textureName,
    IReadOnlyDictionary<string, string> textureMap
)
{
    if (string.IsNullOrWhiteSpace(textureName))
    {
        return textureName;
    }

    if (!textureMap.TryGetValue(textureName, out var relative))
    {
        var candidates = new[]
        {
            textureName,
            $"{textureName}.png",
            $"{textureName}.webp",
            $"{textureName}.jpg",
        };

        relative = candidates
            .Select(candidate => textureMap.TryGetValue(candidate, out var mapped) ? mapped : null)
            .FirstOrDefault(mapped => mapped is not null);

        if (relative is null)
        {
            return textureName;
        }
    }

    return Path.Combine(partPrefix, relative).Replace('\\', '/');
}

static IReadOnlyDictionary<string, float> LoadCharacterHeightMetersById(string masterDirectory)
{
    var gameCharactersPath = Path.Combine(
        Path.GetFullPath(masterDirectory),
        "gameCharacters.json"
    );
    if (!File.Exists(gameCharactersPath))
    {
        throw new FileNotFoundException("gameCharacters.json was not found.", gameCharactersPath);
    }

    using var stream = File.OpenRead(gameCharactersPath);
    var characters = JsonSerializer.Deserialize<IReadOnlyList<GameCharacterMaster>>(
        stream,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
    ) ?? Array.Empty<GameCharacterMaster>();

    return characters.ToDictionary(
        character => character.Id.ToString("00"),
        character => character.Height > 10f ? character.Height / 100f : character.Height
    );
}

static string? SelectAccessoryRootName(BundleInventory? inventory)
{
    if (inventory is null)
    {
        return null;
    }

    return inventory.Roots.FirstOrDefault(root =>
            root.Name.StartsWith("mdl_acc_", StringComparison.OrdinalIgnoreCase))
        ?.Name
        ?? inventory.Roots.FirstOrDefault(root =>
            !string.Equals(root.Name, "optional", StringComparison.OrdinalIgnoreCase))
        ?.Name
        ?? inventory.Roots.FirstOrDefault()?.Name;
}
