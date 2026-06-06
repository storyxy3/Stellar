using PjskBundle2Parts.Models;

namespace PjskBundle2Parts.Services;

public static class ConversionOptionsParser
{
    public static string Usage =>
        "Usage:\n" +
        "  PjskBundle2Parts --body <path> --head <path> --out <directory> [--master <master-directory>] [--motion <bundle-or-export-folder>] [--head-root <name>] [--keep-intermediate]\n" +
        "  PjskBundle2Parts --character3d-id <id> --master <master-directory> --asset-root <AssetBundles-root> --out <directory> [--motion <bundle-or-export-folder>] [--keep-intermediate]\n\n" +
        "Notes:\n" +
        "  --body accepts either a bundle file or a body directory like .../body/05/0001\n" +
        "  --head accepts either a bundle file or a head directory like .../face/05\n" +
        "  --master reads gameCharacters.json for character heights; with --character3d-id it also resolves character3ds.json and costume3dModels.json\n" +
        "  --character3d-id resolves body/hair/head from gameCharacters.json, character3ds.json, and costume3dModels.json\n" +
        "  --asset-root points at the AssetBundles root containing live_pv/model/characterv2\n" +
        "  --motion accepts a costume_setting bundle or a folder containing unity-motion.json/face_motion.json/light_motion.json\n" +
        "  --head-root selects a specific root GameObject from the head bundle, for example face or mdl_chr_IDL_A_00\n" +
        "  lean output is the default; use --keep-intermediate to keep diagnostic manifests, inventories, and reports";

    public static ParseResult Parse(string[] args)
    {
        if (args.Length == 0)
        {
            return new ParseResult(false, null, "Missing arguments.");
        }

        string? body = null;
        string? head = null;
        string? output = null;
        string? motion = null;
        string? headRoot = null;
        string? masterDirectory = null;
        string? assetRoot = null;
        int? character3dId = null;
        var keepIntermediate = false;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg is "--body" or "-b")
            {
                body = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--head" or "-h")
            {
                head = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--out" or "-o")
            {
                output = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--motion" or "-m")
            {
                motion = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--character3d-id")
            {
                var value = ReadValue(args, ref i, arg);
                if (!int.TryParse(value, out var parsed))
                {
                    return new ParseResult(false, null, $"Option {arg} must be an integer.");
                }
                character3dId = parsed;
                continue;
            }

            if (arg is "--master")
            {
                masterDirectory = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--asset-root")
            {
                assetRoot = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--head-root")
            {
                headRoot = ReadValue(args, ref i, arg);
                continue;
            }

            if (arg is "--keep-intermediate")
            {
                keepIntermediate = true;
                continue;
            }

            if (arg is "--help" or "-?")
            {
                return new ParseResult(false, null, "Help requested.");
            }

            return new ParseResult(false, null, $"Unknown argument: {arg}");
        }

        if (character3dId is not null)
        {
            if (string.IsNullOrWhiteSpace(masterDirectory))
            {
                return new ParseResult(false, null, "Missing --master for --character3d-id.");
            }

            if (string.IsNullOrWhiteSpace(assetRoot))
            {
                return new ParseResult(false, null, "Missing --asset-root for --character3d-id.");
            }
        }
        else if (string.IsNullOrWhiteSpace(body))
        {
            return new ParseResult(false, null, "Missing --body.");
        }

        if (character3dId is null && string.IsNullOrWhiteSpace(head))
        {
            return new ParseResult(false, null, "Missing --head.");
        }

        if (string.IsNullOrWhiteSpace(output))
        {
            return new ParseResult(false, null, "Missing --out.");
        }

        return new ParseResult(
            true,
            new ConversionOptions(
                body,
                head,
                output,
                motion,
                headRoot,
                keepIntermediate,
                character3dId,
                masterDirectory,
                assetRoot
            ),
            string.Empty
        );
    }

    private static string ReadValue(string[] args, ref int index, string optionName)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"Option {optionName} requires a value.");
        }
        index += 1;
        return args[index];
    }
}
