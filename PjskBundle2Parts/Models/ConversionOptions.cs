namespace PjskBundle2Parts.Models;

public sealed record ConversionOptions(
    string? BodyPath,
    string? HeadPath,
    string OutputDirectory,
    string? MotionPath,
    string? HeadRootName,
    bool KeepIntermediate,
    int? Character3dId,
    string? MasterDirectory,
    string? AssetRoot
);
