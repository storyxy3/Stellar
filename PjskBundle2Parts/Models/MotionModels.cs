using System.Text.Json.Serialization;

namespace PjskBundle2Parts.Models;

public sealed record MotionExportResult(
    string? SourcePath,
    string? BodyMotionGlbPath,
    PjskFaceMotionSet? FaceMotion,
    PjskLightMotionSet? LightMotion
);

public sealed record PjskFaceMotionSet(
    [property: JsonPropertyName("bundlePath")] string BundlePath,
    [property: JsonPropertyName("clips")] IReadOnlyList<PjskFaceMotionClip> Clips
);

public sealed record PjskFaceMotionClip(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("sampleRate")] float SampleRate,
    [property: JsonPropertyName("duration")] float Duration,
    [property: JsonPropertyName("curves")] IReadOnlyList<PjskFaceMotionCurve> Curves
);

public sealed record PjskFaceMotionCurve(
    [property: JsonPropertyName("curveHash")] uint CurveHash,
    [property: JsonPropertyName("keyframes")] IReadOnlyList<PjskFaceMotionKeyframe> Keyframes
);

public sealed record PjskFaceMotionKeyframe(
    [property: JsonPropertyName("time")] float Time,
    [property: JsonPropertyName("value")] float Value
);

public sealed record PjskLightMotionSet(
    [property: JsonPropertyName("bundlePath")] string BundlePath,
    [property: JsonPropertyName("clips")] IReadOnlyList<PjskLightMotionClip> Clips
);

public sealed record PjskLightMotionClip(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("sampleRate")] float SampleRate,
    [property: JsonPropertyName("duration")] float Duration,
    [property: JsonPropertyName("curves")] IReadOnlyList<PjskLightMotionCurve> Curves
);

public sealed record PjskLightMotionCurve(
    [property: JsonPropertyName("property")] string Property,
    [property: JsonPropertyName("curveHash")] uint CurveHash,
    [property: JsonPropertyName("pathHash")] uint PathHash,
    [property: JsonPropertyName("typeId")] string TypeId,
    [property: JsonPropertyName("keyframes")] IReadOnlyList<PjskFaceMotionKeyframe> Keyframes
);
