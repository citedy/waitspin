#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(repoRoot, "extensions", "waitspin-vscode");
const provenancePath = path.join(
  repoRoot,
  "public",
  "provenance",
  "waitspin-vscode.json",
);
const sourceRepo = "https://github.com/citedy/waitspin";
const sourceDirectory = "extensions/waitspin-vscode";

const mode = parseMode(process.argv.slice(2));
const existingManifest = await readExistingManifest();
const extensionPackageJson = await readJson(
  path.join(extensionDir, "package.json"),
);
const npmPackageJson = await readJson(
  path.join(repoRoot, "packages", "waitspin", "package.json"),
);
const vsixFilename = `${extensionPackageJson.name}-${extensionPackageJson.version}.vsix`;
const vsixPath = path.join(repoRoot, "dist", "waitspin-vscode", vsixFilename);

if (!existsSync(vsixPath)) {
  throw new Error(
    `VSIX not found at ${path.relative(
      repoRoot,
      vsixPath,
    )}. Run npm run waitspin:vscode:package first.`,
  );
}

const marketplacePublisher = extensionPackageJson.publisher;
if (!marketplacePublisher) {
  throw new Error("extensions/waitspin-vscode/package.json must declare publisher.");
}

const sourceCommit =
  process.env.WAITSPIN_SOURCE_COMMIT ||
  (mode === "check" ? existingManifest?.source_commit : undefined);
if (!sourceCommit) {
  throw new Error(
    "WAITSPIN_SOURCE_COMMIT is required when writing public provenance. It must be the exported source commit reachable in citedy/waitspin.",
  );
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error("WAITSPIN_SOURCE_COMMIT must be a full lowercase Git SHA.");
}
const generatedAt =
  process.env.WAITSPIN_PROVENANCE_GENERATED_AT ||
  (mode === "check" ? existingManifest?.generated_at : undefined) ||
  new Date().toISOString();
const vsixSha256 = createHash("sha256")
  .update(await readFile(vsixPath))
  .digest("hex");
const existingRegistryArtifacts =
  existingManifest?.version === extensionPackageJson.version
    ? existingManifest.registry_artifacts
    : undefined;
const marketplaceVsixSha256 =
  process.env.WAITSPIN_MARKETPLACE_VSIX_SHA256 ||
  existingRegistryArtifacts?.marketplace?.vsix_sha256 ||
  vsixSha256;
const openVsxVsixSha256 =
  process.env.WAITSPIN_OPEN_VSX_VSIX_SHA256 ||
  existingRegistryArtifacts?.open_vsx?.vsix_sha256 ||
  vsixSha256;

const manifest = {
  schema_version: 1,
  extension_id: `${marketplacePublisher}.${extensionPackageJson.name}`,
  version: extensionPackageJson.version,
  source_commit: sourceCommit,
  source_repo: sourceRepo,
  source_directory: sourceDirectory,
  marketplace_url: `https://marketplace.visualstudio.com/items?itemName=${marketplacePublisher}.${extensionPackageJson.name}`,
  generated_at: generatedAt,
  vsix_filename: vsixFilename,
  vsix_sha256: vsixSha256,
  registry_artifacts: {
    marketplace: {
      vsix_sha256: marketplaceVsixSha256,
      matches_canonical: marketplaceVsixSha256 === vsixSha256,
    },
    open_vsx: {
      vsix_sha256: openVsxVsixSha256,
      matches_canonical: openVsxVsixSha256 === vsixSha256,
    },
  },
  npm_package_version: npmPackageJson.version,
  npm_package_url: `https://www.npmjs.com/package/${npmPackageJson.name}/v/${npmPackageJson.version}`,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (mode === "write") {
  await mkdir(path.dirname(provenancePath), { recursive: true });
  await writeFile(provenancePath, serialized);
  console.log(`Wrote ${path.relative(repoRoot, provenancePath)}`);
} else {
  const current = await readFile(provenancePath, "utf8").catch(() => "");
  if (current !== serialized) {
    console.error("WaitSpin VS Code provenance manifest is stale.");
    console.error(`Run npm run waitspin:vscode:provenance and commit ${path.relative(repoRoot, provenancePath)}.`);
    printManifestDiff(current, serialized);
    process.exit(1);
  }
  console.log("WaitSpin VS Code provenance manifest is current.");
}

function parseMode(args) {
  if (args.includes("--write")) return "write";
  if (args.includes("--check")) return "check";
  throw new Error("Usage: waitspin-vscode-provenance.mjs --write|--check");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readExistingManifest() {
  if (!existsSync(provenancePath)) return null;
  try {
    return await readJson(provenancePath);
  } catch {
    return null;
  }
}

function printManifestDiff(current, expected) {
  let currentJson;
  let expectedJson;
  try {
    currentJson = JSON.parse(current || "{}");
    expectedJson = JSON.parse(expected);
  } catch {
    console.error("Unable to parse provenance JSON while preparing mismatch details.");
    return;
  }

  const keys = new Set([
    ...Object.keys(currentJson),
    ...Object.keys(expectedJson),
  ]);
  for (const key of [...keys].sort()) {
    if (JSON.stringify(currentJson[key]) !== JSON.stringify(expectedJson[key])) {
      console.error(
        `  ${key}: current=${JSON.stringify(currentJson[key])} expected=${JSON.stringify(expectedJson[key])}`,
      );
    }
  }
}
