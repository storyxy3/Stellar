using System.Buffers.Binary;
using System.Text.Json;
using System.Text.Json.Nodes;
using AssetStudio;
using PjskBundle2Parts.Models;
using Object = AssetStudio.Object;

namespace PjskBundle2Parts.Services;

public sealed class MotionPackageExporter
{
    private const string SekaiUnityVersion = "2022.3.21f1";
    private const float BakeSampleRate = 120f;
    private const uint SekaiBlendShapeCrc = 2770785369;

    private static readonly IReadOnlyDictionary<string, string> SekaiLightCurveProperties = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["intensity"] = "intensity",
        ["ambientColor.r"] = "ambientColor.r",
        ["ambientColor.g"] = "ambientColor.g",
        ["ambientColor.b"] = "ambientColor.b",
        ["shadowColor.r"] = "shadowColor.r",
        ["shadowColor.g"] = "shadowColor.g",
        ["shadowColor.b"] = "shadowColor.b",
        ["outlineColor.r"] = "outlineColor.r",
        ["outlineColor.g"] = "outlineColor.g",
        ["outlineColor.b"] = "outlineColor.b",
        ["outlineBlending"] = "outlineBlending",
        ["rimColor.r"] = "rimColor.r",
        ["rimColor.g"] = "rimColor.g",
        ["rimColor.b"] = "rimColor.b",
        ["shadowRimColor.r"] = "shadowRimColor.r",
        ["shadowRimColor.g"] = "shadowRimColor.g",
        ["shadowRimColor.b"] = "shadowRimColor.b",
        ["range"] = "range",
        ["lightInfluence"] = "lightInfluence",
        ["emission"] = "emission",
        ["edgeSmoothness"] = "edgeSmoothness",
        ["shadowSharpness"] = "shadowSharpness",
        ["faceShadowLimitRange"] = "faceShadowLimitRange",
        ["useFaceShadowLimiter"] = "useFaceShadowLimiter",
        ["isUseShadowColor"] = "isUseShadowColor",
    };

    private static readonly Lazy<IReadOnlyDictionary<uint, string>> SekaiLightCurvePropertiesByCrc = new(
        () => SekaiLightCurveProperties.ToDictionary(
            pair => CalculateCrc32(pair.Key),
            pair => pair.Value
        )
    );

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public MotionExportResult Export(
        string? motionPath,
        string outputDirectory,
        IImported? bodyModel = null
    )
    {
        if (string.IsNullOrWhiteSpace(motionPath))
        {
            return new MotionExportResult(null, null, null, null);
        }

        var normalized = Path.GetFullPath(Environment.ExpandEnvironmentVariables(motionPath));
        Directory.CreateDirectory(outputDirectory);

        if (Directory.Exists(normalized))
        {
            return ExportFromFolder(normalized, outputDirectory);
        }

        if (!File.Exists(normalized))
        {
            throw new FileNotFoundException($"Motion input not found: {motionPath}");
        }

        if (bodyModel is null)
        {
            throw new InvalidOperationException("Direct motion bundle export requires the body model hierarchy.");
        }

        return ExportFromBundle(normalized, outputDirectory, bodyModel);
    }

    private static MotionExportResult ExportFromFolder(
        string motionFolder,
        string outputDirectory
    )
    {
        var motionGlb = FindFile(motionFolder, "motion.glb");
        var loopGlb = FindFile(motionFolder, "motion_loop.glb");
        var faceJson = FindFile(motionFolder, "face_motion.json");
        var lightJson = FindFile(motionFolder, "light_motion.json");
        var bodyMotionOutput = default(string);

        if (motionGlb is not null || loopGlb is not null)
        {
            bodyMotionOutput = Path.Combine(outputDirectory, "body_motion.glb");
            MergeBodyMotionGlbs(
                new[] { motionGlb, loopGlb }.Where(path => path is not null).Cast<string>(),
                bodyMotionOutput
            );
        }

        var faceMotion = faceJson is null
            ? null
            : JsonSerializer.Deserialize<PjskFaceMotionSet>(
                File.ReadAllText(faceJson),
                JsonOptions
            );
        var lightMotion = lightJson is null
            ? null
            : JsonSerializer.Deserialize<PjskLightMotionSet>(
                File.ReadAllText(lightJson),
                JsonOptions
            );

        return new MotionExportResult(
            SourcePath: motionFolder,
            BodyMotionGlbPath: bodyMotionOutput,
            FaceMotion: faceMotion,
            LightMotion: lightMotion
        );
    }

    private static MotionExportResult ExportFromBundle(
        string bundlePath,
        string outputDirectory,
        IImported bodyModel
    )
    {
        using var readableBundle = new SekaiBundleDecryptor().PrepareReadableBundle(bundlePath);
        var manager = new AssetsManager
        {
            MeshLazyLoad = false,
        };
        manager.Options.CustomUnityVersion = new UnityVersion(SekaiUnityVersion);
        manager.SetAssetFilter(ClassIDType.AnimationClip);
        manager.LoadFilesAndFolders(readableBundle.Path);

        var clips = manager.AssetsFileList
            .SelectMany(file => file.Objects)
            .OfType<AnimationClip>()
            .Where(IsSupportedMotionClip)
            .OrderBy(clip => clip.m_Name is "motion" ? 0
                : clip.m_Name is "motion_loop" ? 1
                : clip.m_Name is "face" ? 2
                : clip.m_Name is "face_loop" ? 3
                : 4)
            .ToList();

        if (clips.Count == 0)
        {
            throw new InvalidDataException($"No supported AnimationClip assets found in {bundlePath}");
        }

        var decodedClips = new List<DecodedUnityClip>();
        foreach (var clip in clips)
        {
            try
            {
                decodedClips.Add(DecodeUnityClip(clip));
            }
            catch (InvalidDataException ex)
            {
                Console.Error.WriteLine($"[Motion] Skipping AnimationClip {clip.m_Name}: {ex.Message}");
            }
        }
        var bodyClips = decodedClips
            .Where(clip => clip.Name is "motion" or "motion_loop")
            .ToList();
        var bodyMotionOutput = default(string);
        if (bodyClips.Count > 0)
        {
            bodyMotionOutput = Path.Combine(outputDirectory, "body_motion.glb");
            WriteBakedBodyMotionGlb(bodyClips, bodyModel.RootFrame, bodyMotionOutput);
        }

        var faceClips = decodedClips
            .Where(clip => clip.Name is "face" or "face_loop")
            .Select(BuildFaceMotionClip)
            .Where(clip => clip.Curves.Count > 0)
            .ToList();
        var faceMotion = faceClips.Count == 0
            ? null
            : new PjskFaceMotionSet(bundlePath, faceClips);
        var lightClips = decodedClips
            .Where(clip => clip.Name is not ("motion" or "motion_loop" or "face" or "face_loop"))
            .Select(BuildLightMotionClip)
            .Where(clip => clip.Curves.Count > 0)
            .ToList();
        var lightMotion = lightClips.Count == 0
            ? null
            : new PjskLightMotionSet(bundlePath, lightClips);

        return new MotionExportResult(
            SourcePath: bundlePath,
            BodyMotionGlbPath: bodyMotionOutput,
            FaceMotion: faceMotion,
            LightMotion: lightMotion
        );
    }

    private static bool IsSupportedMotionClip(AnimationClip clip)
    {
        return true;
    }

    private static DecodedUnityClip DecodeUnityClip(AnimationClip source)
    {
        if (source.m_MuscleClip?.m_Clip?.data is null)
        {
            throw new InvalidDataException($"AnimationClip {source.m_Name} does not contain post-build clip data.");
        }

        var clip = source.m_MuscleClip.m_Clip.data;
        var bindings = source.m_ClipBindingConstant ?? clip.ConvertValueArrayToGenericBinding();
        if (bindings?.genericBindings is null || bindings.genericBindings.Count == 0)
        {
            throw new InvalidDataException($"AnimationClip {source.m_Name} has no generic bindings.");
        }

        var ranges = BuildBindingRanges(bindings.genericBindings);
        var curves = new Dictionary<UnityBinding, UnityCurve>();

        UnityCurve GetCurve(GenericBinding binding)
        {
            var key = new UnityBinding(binding.path, binding.attribute, binding.typeID);
            if (!curves.TryGetValue(key, out var curve))
            {
                curve = new UnityCurve(key);
                curves[key] = curve;
            }
            return curve;
        }

        var streamedFrames = clip.m_StreamedClip.ReadData();
        RecomputeStreamedInSlopes(streamedFrames);
        foreach (var frame in streamedFrames)
        {
            for (var curveIndex = 0; curveIndex < frame.keyList.Count;)
            {
                var binding = FindBinding(ranges, frame.keyList[curveIndex].index);
                var dimension = BindingDimension(binding);
                var values = new float[dimension];
                var inSlopes = new float[dimension];
                var outSlopes = new float[dimension];
                for (var component = 0; component < dimension && curveIndex < frame.keyList.Count; component++)
                {
                    var key = frame.keyList[curveIndex++];
                    values[component] = key.value;
                    inSlopes[component] = key.inSlope;
                    outSlopes[component] = key.outSlope;
                }
                GetCurve(binding).Keys.Add(new UnityCurveKey(
                    frame.time,
                    values,
                    inSlopes,
                    outSlopes,
                    IsDense: false,
                    IsConstant: false
                ));
            }
        }

        var denseClip = clip.m_DenseClip;
        var denseCurveOffset = (int)clip.m_StreamedClip.curveCount;
        for (var frameIndex = 0; frameIndex < denseClip.m_FrameCount; frameIndex++)
        {
            var time = denseClip.m_BeginTime + frameIndex / denseClip.m_SampleRate;
            var frameOffset = frameIndex * (int)denseClip.m_CurveCount;
            for (var curveIndex = 0; curveIndex < denseClip.m_CurveCount;)
            {
                var binding = FindBinding(ranges, denseCurveOffset + (int)curveIndex);
                var dimension = BindingDimension(binding);
                var values = new float[dimension];
                for (var component = 0; component < dimension; component++)
                {
                    values[component] = denseClip.m_SampleArray[frameOffset + curveIndex++];
                }
                GetCurve(binding).Keys.Add(new UnityCurveKey(
                    time,
                    values,
                    ZeroSlopes(dimension),
                    ZeroSlopes(dimension),
                    IsDense: true,
                    IsConstant: false
                ));
            }
        }

        if (clip.m_ConstantClip?.data is { Length: > 0 } constantValues)
        {
            var constantCurveOffset = denseCurveOffset + (int)denseClip.m_CurveCount;
            foreach (var time in new[] { 0f, source.m_MuscleClip.m_StopTime })
            {
                for (var curveIndex = 0; curveIndex < constantValues.Length;)
                {
                    var binding = FindBinding(ranges, constantCurveOffset + curveIndex);
                    var dimension = BindingDimension(binding);
                    var values = new float[dimension];
                    for (var component = 0; component < dimension; component++)
                    {
                        values[component] = constantValues[curveIndex++];
                    }
                    GetCurve(binding).Keys.Add(new UnityCurveKey(
                        time,
                        values,
                        ZeroSlopes(dimension),
                        ZeroSlopes(dimension),
                        IsDense: false,
                        IsConstant: true
                    ));
                }
            }
        }

        foreach (var curve in curves.Values)
        {
            curve.Keys.Sort((a, b) => a.Time.CompareTo(b.Time));
        }

        var duration = source.m_MuscleClip.m_StopTime;
        if (duration <= 0)
        {
            duration = curves.Values
                .SelectMany(curve => curve.Keys)
                .Select(key => key.Time)
                .DefaultIfEmpty(0)
                .Max();
        }

        return new DecodedUnityClip(
            source.m_Name,
            source.m_SampleRate > 0 ? source.m_SampleRate : BakeSampleRate,
            duration,
            curves.Values.ToList()
        );
    }

    private static List<BindingRange> BuildBindingRanges(IReadOnlyList<GenericBinding> bindings)
    {
        var ranges = new List<BindingRange>(bindings.Count);
        var start = 0;
        foreach (var binding in bindings)
        {
            var dimension = BindingDimension(binding);
            ranges.Add(new BindingRange(binding, start, dimension));
            start += dimension;
        }
        return ranges;
    }

    private static GenericBinding FindBinding(IReadOnlyList<BindingRange> ranges, int curveIndex)
    {
        foreach (var range in ranges)
        {
            if (curveIndex >= range.Start && curveIndex < range.Start + range.Dimension)
            {
                return range.Binding;
            }
        }
        throw new InvalidDataException($"Animation curve index {curveIndex} has no generic binding.");
    }

    private static int BindingDimension(GenericBinding binding)
    {
        if (binding.typeID != ClassIDType.Transform)
        {
            return 1;
        }

        return binding.attribute switch
        {
            1 or 3 or 4 => 3,
            2 => 4,
            _ => 1,
        };
    }

    private static float[] ZeroSlopes(int dimension)
    {
        return new float[dimension];
    }

    private static void RecomputeStreamedInSlopes(IReadOnlyList<StreamedClip.StreamedFrame> frames)
    {
        var previousKeys = new Dictionary<int, (StreamedClip.StreamedCurveKey Key, float Time)>();
        foreach (var frame in frames)
        {
            foreach (var key in frame.keyList)
            {
                key.inSlope = float.PositiveInfinity;
                if (previousKeys.TryGetValue(key.index, out var previous))
                {
                    key.inSlope = previous.Key.CalculateNextInSlope(frame.time - previous.Time, key);
                }
                previousKeys[key.index] = (key, frame.time);
            }
        }
    }

    private static void WriteBakedBodyMotionGlb(
        IReadOnlyList<DecodedUnityClip> clips,
        ImportedFrame rootFrame,
        string outputGlbPath
    )
    {
        var crcToNodeName = BuildCrcToLeafNodeName(rootFrame);
        var bakedClips = clips
            .Select(clip => BakeBodyClip(clip, crcToNodeName))
            .Where(clip => clip.Tracks.Count > 0)
            .ToList();

        if (bakedClips.Count == 0)
        {
            throw new InvalidDataException("Motion bundle did not produce any bindable body animation tracks.");
        }

        WriteAnimationGlb(bakedClips, outputGlbPath);
    }

    private static Dictionary<uint, string> BuildCrcToLeafNodeName(ImportedFrame rootFrame)
    {
        var result = new Dictionary<uint, string>();

        void Visit(ImportedFrame frame)
        {
            var path = frame.Path;
            while (!string.IsNullOrEmpty(path))
            {
                result[CalculateCrc32(path)] = frame.Name;
                var slash = path.IndexOf('/', StringComparison.Ordinal);
                if (slash < 0)
                {
                    break;
                }
                path = path[(slash + 1)..];
            }

            for (var i = 0; i < frame.Count; i++)
            {
                Visit(frame[i]);
            }
        }

        Visit(rootFrame);
        result[0] = rootFrame.Name;
        return result;
    }

    private static BakedAnimationClip BakeBodyClip(
        DecodedUnityClip source,
        IReadOnlyDictionary<uint, string> crcToNodeName
    )
    {
        var fullTimes = BuildBakeTimes(source.Duration);
        var tracks = new List<BakedAnimationTrack>();
        var usedTargets = new HashSet<string>(StringComparer.Ordinal);

        foreach (var curve in source.Curves)
        {
            if (curve.Binding.TypeId != ClassIDType.Transform)
            {
                continue;
            }
            if (!crcToNodeName.TryGetValue(curve.Binding.Path, out var nodeName))
            {
                Console.Error.WriteLine($"[Motion] {source.Name}: unbound transform CRC {curve.Binding.Path}");
                continue;
            }

            var targetPath = curve.Binding.Attribute switch
            {
                1 => "translation",
                2 or 4 => "rotation",
                3 => "scale",
                _ => null,
            };
            if (targetPath is null)
            {
                continue;
            }

            var targetKey = $"{nodeName}.{targetPath}";
            if (!usedTargets.Add(targetKey))
            {
                Console.Error.WriteLine($"[Motion] {source.Name}: duplicate track target {targetKey}, keeping first track.");
                continue;
            }

            var componentCount = targetPath == "rotation" ? 4 : 3;
            var values = new List<float>(fullTimes.Count * componentCount);
            foreach (var time in fullTimes)
            {
                values.AddRange(ConvertBodyCurveValue(curve.Binding.Attribute, SampleCurve(curve, time)));
            }

            var trackTimes = fullTimes;
            if (CanCollapseTrack(values, componentCount))
            {
                trackTimes = new List<float> { 0f, source.Duration };
                values = values.Take(componentCount).Concat(values.Take(componentCount)).ToList();
            }

            tracks.Add(new BakedAnimationTrack(
                NodeName: nodeName,
                TargetPath: targetPath,
                ComponentCount: componentCount,
                Times: trackTimes,
                Values: values
            ));
        }

        return new BakedAnimationClip(source.Name, tracks);
    }

    private static PjskFaceMotionClip BuildFaceMotionClip(DecodedUnityClip source)
    {
        var times = BuildBakeTimes(source.Duration);
        var curves = new List<PjskFaceMotionCurve>();

        foreach (var curve in source.Curves)
        {
            if (curve.Binding.TypeId != ClassIDType.SkinnedMeshRenderer ||
                curve.Binding.Path != SekaiBlendShapeCrc)
            {
                continue;
            }

            var keyframes = times
                .Select(time => new PjskFaceMotionKeyframe(time, SampleCurve(curve, time)[0]))
                .ToList();
            if (CanCollapseScalarCurve(keyframes))
            {
                var value = keyframes[0].Value;
                keyframes = new List<PjskFaceMotionKeyframe>
                {
                    new(0f, value),
                    new(source.Duration, value),
                };
            }

            curves.Add(new PjskFaceMotionCurve(curve.Binding.Attribute, keyframes));
        }

        return new PjskFaceMotionClip(
            source.Name,
            BakeSampleRate,
            source.Duration,
            curves
        );
    }

    private static PjskLightMotionClip BuildLightMotionClip(DecodedUnityClip source)
    {
        var times = BuildBakeTimes(source.Duration);
        var curves = new List<PjskLightMotionCurve>();
        var lightPropertiesByCrc = SekaiLightCurvePropertiesByCrc.Value;

        foreach (var curve in source.Curves)
        {
            var propertyName = default(string);
            if (lightPropertiesByCrc.TryGetValue(curve.Binding.Attribute, out var scalarPropertyName))
            {
                propertyName = scalarPropertyName;
            }
            else if (curve.Binding.TypeId == ClassIDType.Transform && curve.Binding.Attribute == 4)
            {
                propertyName = "rotationEuler";
            }

            if (propertyName is null)
            {
                continue;
            }

            var keyframes = times
                .Select(time => new PjskFaceMotionKeyframe(time, SampleCurve(curve, time)[0]))
                .ToList();
            if (CanCollapseScalarCurve(keyframes))
            {
                var value = keyframes[0].Value;
                keyframes = new List<PjskFaceMotionKeyframe>
                {
                    new(0f, value),
                    new(source.Duration, value),
                };
            }

            curves.Add(new PjskLightMotionCurve(
                Property: propertyName,
                CurveHash: curve.Binding.Attribute,
                PathHash: curve.Binding.Path,
                TypeId: curve.Binding.TypeId.ToString(),
                Keyframes: keyframes
            ));
        }

        return new PjskLightMotionClip(
            source.Name,
            BakeSampleRate,
            source.Duration,
            curves
        );
    }

    private static List<float> BuildBakeTimes(float duration)
    {
        var frameCount = Math.Max(2, (int)MathF.Round(duration * BakeSampleRate) + 1);
        var times = new List<float>(frameCount);
        for (var frame = 0; frame < frameCount; frame++)
        {
            var time = frame / BakeSampleRate;
            if (frame == frameCount - 1 || time > duration)
            {
                time = duration;
            }
            times.Add(time);
        }
        return times;
    }

    private static float[] SampleCurve(UnityCurve curve, float time)
    {
        if (curve.Keys.Count == 0)
        {
            return Array.Empty<float>();
        }
        if (time <= curve.Keys[0].Time)
        {
            return CopyValues(curve.Keys[0].Values);
        }

        for (var i = 1; i < curve.Keys.Count; i++)
        {
            var lhs = curve.Keys[i - 1];
            var rhs = curve.Keys[i];
            if (time <= rhs.Time)
            {
                return InterpolateCurveValue(lhs, rhs, time);
            }
        }

        return CopyValues(curve.Keys[^1].Values);
    }

    private static float[] InterpolateCurveValue(UnityCurveKey lhs, UnityCurveKey rhs, float time)
    {
        if (lhs.IsConstant)
        {
            return CopyValues(lhs.Values);
        }

        var dx = rhs.Time - lhs.Time;
        if (dx <= 1e-6f)
        {
            return CopyValues(rhs.Values);
        }

        var t = (time - lhs.Time) / dx;
        var values = new float[lhs.Values.Length];
        for (var i = 0; i < values.Length; i++)
        {
            if (lhs.IsDense)
            {
                values[i] = Lerp(lhs.Values[i], rhs.Values[i], t);
                continue;
            }

            var outSlope = lhs.OutSlopes[i];
            var inSlope = rhs.InSlopes[i];
            if (float.IsInfinity(outSlope) || float.IsInfinity(inSlope))
            {
                values[i] = lhs.Values[i];
                continue;
            }

            values[i] = CubicHermite(
                t,
                lhs.Values[i],
                outSlope * dx,
                inSlope * dx,
                rhs.Values[i]
            );
        }
        return values;
    }

    private static float CubicHermite(float t, float p0, float m0, float m1, float p1)
    {
        var t2 = t * t;
        var t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * p0
            + (t3 - 2 * t2 + t) * m0
            + (-2 * t3 + 3 * t2) * p1
            + (t3 - t2) * m1;
    }

    private static float Lerp(float a, float b, float t)
    {
        return a + (b - a) * t;
    }

    private static float[] CopyValues(float[] values)
    {
        var copy = new float[values.Length];
        Array.Copy(values, copy, values.Length);
        return copy;
    }

    private static float[] ConvertBodyCurveValue(uint attribute, float[] values)
    {
        return attribute switch
        {
            1 => new[] { -values[0], values[1], values[2] },
            2 => NormalizeQuaternion(new[] { values[0], -values[1], -values[2], values[3] }),
            3 => new[] { values[0], values[1], values[2] },
            4 => EulerDegreesToQuaternion(values[0], -values[1], -values[2]),
            _ => values,
        };
    }

    private static float[] NormalizeQuaternion(float[] q)
    {
        var length = MathF.Sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
        if (length <= 1e-8f)
        {
            return new[] { 0f, 0f, 0f, 1f };
        }
        return new[] { q[0] / length, q[1] / length, q[2] / length, q[3] / length };
    }

    private static float[] EulerDegreesToQuaternion(float xDegrees, float yDegrees, float zDegrees)
    {
        var x = DegreesToRadians(xDegrees);
        var y = DegreesToRadians(yDegrees);
        var z = DegreesToRadians(zDegrees);
        var quaternion = System.Numerics.Quaternion.CreateFromYawPitchRoll(y, x, z);
        return NormalizeQuaternion(new[] { quaternion.X, quaternion.Y, quaternion.Z, quaternion.W });
    }

    private static float DegreesToRadians(float degrees)
    {
        return degrees * MathF.PI / 180f;
    }

    private static bool CanCollapseTrack(IReadOnlyList<float> values, int componentCount)
    {
        if (values.Count <= componentCount * 2)
        {
            return false;
        }

        for (var offset = componentCount; offset < values.Count; offset += componentCount)
        {
            for (var component = 0; component < componentCount; component++)
            {
                if (MathF.Abs(values[component] - values[offset + component]) > 1e-5f)
                {
                    return false;
                }
            }
        }
        return true;
    }

    private static bool CanCollapseScalarCurve(IReadOnlyList<PjskFaceMotionKeyframe> keyframes)
    {
        if (keyframes.Count <= 2)
        {
            return false;
        }

        var value = keyframes[0].Value;
        return keyframes.All(keyframe => MathF.Abs(keyframe.Value - value) <= 1e-5f);
    }

    private static void WriteAnimationGlb(
        IReadOnlyList<BakedAnimationClip> clips,
        string outputGlbPath
    )
    {
        var nodeIndices = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var nodeName in clips.SelectMany(clip => clip.Tracks).Select(track => track.NodeName).Distinct(StringComparer.Ordinal))
        {
            nodeIndices[nodeName] = nodeIndices.Count;
        }

        var nodes = new JsonArray(nodeIndices
            .OrderBy(pair => pair.Value)
            .Select(pair => new JsonObject { ["name"] = pair.Key })
            .Cast<JsonNode>()
            .ToArray());
        var accessors = new JsonArray();
        var bufferViews = new JsonArray();
        var binary = new List<byte>();
        var animations = new JsonArray();

        foreach (var clip in clips)
        {
            var samplers = new JsonArray();
            var channels = new JsonArray();
            var timeAccessorBySignature = new Dictionary<string, int>(StringComparer.Ordinal);

            foreach (var track in clip.Tracks)
            {
                var timeSignature = string.Join('|', track.Times.Select(time => time.ToString("R", System.Globalization.CultureInfo.InvariantCulture)));
                if (!timeAccessorBySignature.TryGetValue(timeSignature, out var inputAccessor))
                {
                    inputAccessor = AddFloatAccessor(
                        binary,
                        bufferViews,
                        accessors,
                        track.Times,
                        "SCALAR",
                        min: track.Times.Min(),
                        max: track.Times.Max()
                    );
                    timeAccessorBySignature[timeSignature] = inputAccessor;
                }

                var outputAccessor = AddFloatAccessor(
                    binary,
                    bufferViews,
                    accessors,
                    track.Values,
                    track.ComponentCount == 4 ? "VEC4" : "VEC3"
                );
                var samplerIndex = samplers.Count;
                samplers.Add(new JsonObject
                {
                    ["input"] = inputAccessor,
                    ["output"] = outputAccessor,
                    ["interpolation"] = "LINEAR",
                });
                channels.Add(new JsonObject
                {
                    ["sampler"] = samplerIndex,
                    ["target"] = new JsonObject
                    {
                        ["node"] = nodeIndices[track.NodeName],
                        ["path"] = track.TargetPath,
                    },
                });
            }

            animations.Add(new JsonObject
            {
                ["name"] = clip.Name,
                ["samplers"] = samplers,
                ["channels"] = channels,
            });
        }

        var rootNodes = new JsonArray(nodeIndices
            .OrderBy(pair => pair.Value)
            .Select(pair => (JsonNode)JsonValue.Create(pair.Value)!)
            .ToArray());
        var root = new JsonObject
        {
            ["asset"] = new JsonObject
            {
                ["version"] = "2.0",
                ["generator"] = "PjskBundle2Parts Unity Hermite motion baker",
            },
            ["scene"] = 0,
            ["scenes"] = new JsonArray(new JsonObject { ["nodes"] = rootNodes }),
            ["nodes"] = nodes,
            ["animations"] = animations,
            ["buffers"] = new JsonArray(new JsonObject { ["byteLength"] = Align4(binary.Count) }),
            ["bufferViews"] = bufferViews,
            ["accessors"] = accessors,
        };

        while ((binary.Count & 3) != 0)
        {
            binary.Add(0);
        }
        GltfJsonEditor.WriteDocumentToGlb(root, binary.ToArray(), outputGlbPath);
    }

    private static int AddFloatAccessor(
        List<byte> binary,
        JsonArray bufferViews,
        JsonArray accessors,
        IReadOnlyList<float> values,
        string type,
        float? min = null,
        float? max = null
    )
    {
        while ((binary.Count & 3) != 0)
        {
            binary.Add(0);
        }
        var byteOffset = binary.Count;
        var bytes = new byte[4];
        foreach (var value in values)
        {
            BinaryPrimitives.WriteInt32LittleEndian(bytes, BitConverter.SingleToInt32Bits(value));
            binary.AddRange(bytes);
        }

        var bufferViewIndex = bufferViews.Count;
        bufferViews.Add(new JsonObject
        {
            ["buffer"] = 0,
            ["byteOffset"] = byteOffset,
            ["byteLength"] = values.Count * sizeof(float),
        });

        var componentCount = type switch
        {
            "SCALAR" => 1,
            "VEC3" => 3,
            "VEC4" => 4,
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unsupported accessor type."),
        };
        var accessor = new JsonObject
        {
            ["bufferView"] = bufferViewIndex,
            ["componentType"] = 5126,
            ["count"] = values.Count / componentCount,
            ["type"] = type,
        };
        if (min.HasValue && max.HasValue)
        {
            accessor["min"] = new JsonArray(min.Value);
            accessor["max"] = new JsonArray(max.Value);
        }
        var accessorIndex = accessors.Count;
        accessors.Add(accessor);
        return accessorIndex;
    }

    private static uint CalculateCrc32(string value)
    {
        var crc = 0xffffffffu;
        foreach (var b in System.Text.Encoding.UTF8.GetBytes(value))
        {
            crc ^= b;
            for (var i = 0; i < 8; i++)
            {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320u : crc >> 1;
            }
        }
        return ~crc;
    }

    private sealed record BindingRange(GenericBinding Binding, int Start, int Dimension);

    private sealed record UnityBinding(uint Path, uint Attribute, ClassIDType TypeId);

    private sealed class UnityCurve
    {
        public UnityBinding Binding { get; }
        public List<UnityCurveKey> Keys { get; } = new();

        public UnityCurve(UnityBinding binding)
        {
            Binding = binding;
        }
    }

    private sealed record UnityCurveKey(
        float Time,
        float[] Values,
        float[] InSlopes,
        float[] OutSlopes,
        bool IsDense,
        bool IsConstant
    );

    private sealed record DecodedUnityClip(
        string Name,
        float SampleRate,
        float Duration,
        List<UnityCurve> Curves
    );

    private sealed record BakedAnimationClip(
        string Name,
        List<BakedAnimationTrack> Tracks
    );

    private sealed record BakedAnimationTrack(
        string NodeName,
        string TargetPath,
        int ComponentCount,
        IReadOnlyList<float> Times,
        IReadOnlyList<float> Values
    );

    private static string? FindFile(string folder, string fileName)
    {
        return Directory
            .EnumerateFiles(folder, fileName, SearchOption.AllDirectories)
            .OrderBy(path => path.Length)
            .ThenBy(path => path, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
    }

    private static void MergeBodyMotionGlbs(
        IEnumerable<string> inputGlbPaths,
        string outputGlbPath
    )
    {
        var inputs = inputGlbPaths.ToList();
        if (inputs.Count == 0)
        {
            return;
        }

        var baseDoc = GltfJsonEditor.ReadDocument(File.ReadAllBytes(inputs[0]));
        var mergedJson = baseDoc.Root;
        var mergedBin = new List<byte>(baseDoc.BinaryChunk);
        var mergedAnimations = new List<JsonNode>();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var input in inputs.Select((path, index) => new { path, index }))
        {
            var doc = GltfJsonEditor.ReadDocument(File.ReadAllBytes(input.path));
            var root = doc.Root;
            if (root["animations"] is not System.Text.Json.Nodes.JsonArray animations)
            {
                continue;
            }

            var accessorOffset = GetArrayCount(mergedJson, "accessors");
            var bufferViewOffset = GetArrayCount(mergedJson, "bufferViews");
            var binOffset = Align4(mergedBin.Count);
            while (mergedBin.Count < binOffset)
            {
                mergedBin.Add(0);
            }

            if (input.index > 0)
            {
                AppendBufferViews(mergedJson, root, binOffset);
                AppendAccessors(mergedJson, root, bufferViewOffset);
                mergedBin.AddRange(doc.BinaryChunk);
            }

            foreach (var animation in animations)
            {
                if (animation is not System.Text.Json.Nodes.JsonObject obj)
                {
                    continue;
                }

                var name = obj["name"]?.GetValue<string>() ?? Path.GetFileNameWithoutExtension(input.path);
                if (!usedNames.Add(name))
                {
                    continue;
                }

                var clone = obj.DeepClone().AsObject();
                if (input.index > 0)
                {
                    RemapAnimationAccessors(clone, accessorOffset);
                }
                mergedAnimations.Add(clone);
            }
        }

        mergedJson["animations"] = new System.Text.Json.Nodes.JsonArray(mergedAnimations.ToArray());
        if (mergedJson["buffers"] is JsonArray buffers && buffers[0] is JsonObject buffer)
        {
            buffer["byteLength"] = mergedBin.Count;
        }
        GltfJsonEditor.WriteDocumentToGlb(mergedJson, mergedBin.ToArray(), outputGlbPath);
    }

    private static int GetArrayCount(JsonObject root, string key)
    {
        return root[key] is JsonArray array ? array.Count : 0;
    }

    private static int Align4(int value)
    {
        return (value + 3) & ~3;
    }

    private static JsonArray EnsureArray(JsonObject root, string key)
    {
        if (root[key] is JsonArray array)
        {
            return array;
        }
        array = new JsonArray();
        root[key] = array;
        return array;
    }

    private static void AppendBufferViews(
        JsonObject targetRoot,
        JsonObject sourceRoot,
        int byteOffsetDelta
    )
    {
        if (sourceRoot["bufferViews"] is not JsonArray source)
        {
            return;
        }

        var target = EnsureArray(targetRoot, "bufferViews");
        foreach (var item in source)
        {
            if (item is not JsonObject sourceBufferView)
            {
                continue;
            }

            var clone = sourceBufferView.DeepClone().AsObject();
            clone["buffer"] = 0;
            var currentOffset = clone["byteOffset"]?.GetValue<int>() ?? 0;
            clone["byteOffset"] = currentOffset + byteOffsetDelta;
            target.Add(clone);
        }
    }

    private static void AppendAccessors(
        JsonObject targetRoot,
        JsonObject sourceRoot,
        int bufferViewOffset
    )
    {
        if (sourceRoot["accessors"] is not JsonArray source)
        {
            return;
        }

        var target = EnsureArray(targetRoot, "accessors");
        foreach (var item in source)
        {
            if (item is not JsonObject sourceAccessor)
            {
                continue;
            }

            var clone = sourceAccessor.DeepClone().AsObject();
            if (clone["bufferView"] is JsonValue bufferViewValue &&
                bufferViewValue.TryGetValue<int>(out var bufferView))
            {
                clone["bufferView"] = bufferView + bufferViewOffset;
            }
            target.Add(clone);
        }
    }

    private static void RemapAnimationAccessors(JsonObject animation, int accessorOffset)
    {
        if (animation["samplers"] is not JsonArray samplers)
        {
            return;
        }

        foreach (var sampler in samplers.OfType<JsonObject>())
        {
            if (sampler["input"] is JsonValue inputValue &&
                inputValue.TryGetValue<int>(out var input))
            {
                sampler["input"] = input + accessorOffset;
            }
            if (sampler["output"] is JsonValue outputValue &&
                outputValue.TryGetValue<int>(out var output))
            {
                sampler["output"] = output + accessorOffset;
            }
        }
    }
}
