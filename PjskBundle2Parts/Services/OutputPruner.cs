namespace PjskBundle2Parts.Services;

public sealed class OutputPruner
{
    public void Prune(string outputDirectory)
    {
        DeleteDirectory(Path.Combine(outputDirectory, "body"));
        DeleteDirectory(Path.Combine(outputDirectory, "head"));

        DeleteFile(Path.Combine(outputDirectory, "conversion-plan.json"));
        DeleteFile(Path.Combine(outputDirectory, "body.inventory.json"));
        DeleteFile(Path.Combine(outputDirectory, "head.inventory.json"));
        DeleteFile(Path.Combine(outputDirectory, "body.manifest.template.json"));
        DeleteFile(Path.Combine(outputDirectory, "head.manifest.template.json"));
        DeleteFile(Path.Combine(outputDirectory, "sekai-vrm-profile.json"));
        DeleteFile(Path.Combine(outputDirectory, "vrmc-vrm.extension.json"));
        DeleteFile(Path.Combine(outputDirectory, "vrmc-vrm.resolve-report.json"));
        DeleteFile(Path.Combine(outputDirectory, "pjsk-sekai-runtime.resolve-report.json"));

        var characterDirectory = Path.Combine(outputDirectory, "character");
        DeleteFile(Path.Combine(characterDirectory, "character.glb"));
        DeleteFile(Path.Combine(characterDirectory, "character.springbone.glb"));
        DeleteFile(Path.Combine(characterDirectory, "character.vrm-core.glb"));
        DeleteFile(Path.Combine(characterDirectory, "character.vrm-candidate.glb"));
    }

    private static void DeleteFile(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private static void DeleteDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }
    }
}
