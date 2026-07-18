const sha256Pattern = /^[0-9a-f]{64}$/;

export const WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256 =
  "dd3034623c9c3f6b623a4105e234966756866028f6ee8498ca49b39e417ff5e7";
export const WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256 =
  "6bae6074fc50f0002eabc766796340eae1228fb01abeb75a585ad2ed7acafd4a";

export function readSha256(value, label) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    throw new Error(`${label} must be a lowercase 64-character SHA-256.`);
  }
  return value;
}

export function assertRegistryArtifactPolicy({
  version,
  canonicalSha256,
  marketplaceSha256,
  openVsxSha256,
}) {
  const canonical = readSha256(canonicalSha256, "canonical VSIX SHA-256");
  const marketplace = readSha256(
    marketplaceSha256,
    "Marketplace VSIX SHA-256",
  );
  const openVsx = readSha256(openVsxSha256, "Open VSX VSIX SHA-256");

  if (version === "0.1.15") {
    if (
      canonical !== WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256 ||
      openVsx !== WAITSPIN_VSCODE_0_1_15_CANONICAL_SHA256 ||
      marketplace !== WAITSPIN_VSCODE_0_1_15_MARKETPLACE_SHA256
    ) {
      throw new Error(
        "WaitSpin VS Code 0.1.15 must retain its exact historical Marketplace and canonical/Open VSX hashes.",
      );
    }
  } else if (marketplace !== canonical || openVsx !== canonical) {
    throw new Error(
      `WaitSpin VS Code ${version} must use one byte-identical canonical VSIX in Marketplace and Open VSX.`,
    );
  }

  return {
    marketplace: {
      vsix_sha256: marketplace,
      matches_canonical: marketplace === canonical,
    },
    open_vsx: {
      vsix_sha256: openVsx,
      matches_canonical: openVsx === canonical,
    },
  };
}
