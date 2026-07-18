#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertRegistryArtifactPolicy } from "./waitspin-vscode-artifact-policy.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = "public/export-manifest.json";
const provenancePath = "public/provenance/waitspin-vscode.json";
const manifest = JSON.parse(
  await readFile(path.join(repoRoot, manifestPath), "utf8"),
);
const provenance = JSON.parse(
  await readFile(path.join(repoRoot, provenancePath), "utf8"),
);
const extensionPackage = JSON.parse(
  await readFile(
    path.join(repoRoot, "extensions/waitspin-vscode/package.json"),
    "utf8",
  ),
);
const npmPackage = JSON.parse(
  await readFile(path.join(repoRoot, "packages/waitspin/package.json"), "utf8"),
);

if (manifest.schema_version !== 1 || !Array.isArray(manifest.files)) {
  throw new Error("public/export-manifest.json has an unsupported schema.");
}
if (provenance.source_repo !== "https://github.com/citedy/waitspin") {
  throw new Error("Public provenance must point to citedy/waitspin.");
}
if (!/^[0-9a-f]{40}$/.test(provenance.source_commit ?? "")) {
  throw new Error("Public provenance source_commit must be a full Git SHA.");
}
const expectedExtensionId =
  `${extensionPackage.publisher}.${extensionPackage.name}`;
const expectedVsixFilename =
  `${extensionPackage.name}-${extensionPackage.version}.vsix`;
const requiredProvenanceFields = new Map([
  ["extension_id", expectedExtensionId],
  ["version", extensionPackage.version],
  ["source_directory", "extensions/waitspin-vscode"],
  ["vsix_filename", expectedVsixFilename],
  ["npm_package_version", npmPackage.version],
]);
for (const [field, expected] of requiredProvenanceFields) {
  if (provenance[field] !== expected) {
    throw new Error(
      `Public provenance ${field} must be ${JSON.stringify(expected)}.`,
    );
  }
}

const actualEntries = [];
for (const entry of manifest.files) {
  if (
    !entry ||
    typeof entry.path !== "string" ||
    !/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")
  ) {
    throw new Error("Public export manifest contains an invalid file entry.");
  }
  const content = await readFile(path.join(repoRoot, entry.path));
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== entry.sha256) {
    throw new Error(`Public export file hash mismatch: ${entry.path}`);
  }
  actualEntries.push(`${entry.path}\0${sha256}\n`);
}

const treeSha256 = createHash("sha256")
  .update(actualEntries.join(""))
  .digest("hex");
if (treeSha256 !== manifest.tree_sha256) {
  throw new Error("Public export tree SHA-256 does not match its manifest.");
}

const expectedTrackedPaths = new Set([
  ...manifest.files.map((entry) => entry.path),
  manifestPath,
  provenancePath,
]);
const trackedPaths = git(["ls-files"]).split("\n").filter(Boolean);
const unexpectedPaths = trackedPaths.filter(
  (trackedPath) => !expectedTrackedPaths.has(trackedPath),
);
const missingPaths = [...expectedTrackedPaths].filter(
  (expectedPath) => !trackedPaths.includes(expectedPath),
);
if (unexpectedPaths.length > 0 || missingPaths.length > 0) {
  throw new Error(
    `Public tracked-file set differs from the export manifest: unexpected=${unexpectedPaths.join(",") || "none"}; missing=${missingPaths.join(",") || "none"}`,
  );
}

git(["merge-base", "--is-ancestor", provenance.source_commit, "HEAD"]);
const sourceManifest = git([
  "show",
  `${provenance.source_commit}:${manifestPath}`,
]);
if (`${sourceManifest}\n` !== JSON.stringify(manifest, null, 2) + "\n") {
  throw new Error(
    "Public provenance source_commit does not contain the current export manifest.",
  );
}

const canonicalVsixPath =
  "packages/waitspin/assets/waitspin-vscode/waitspin-vscode.vsix";
const canonicalVsixSha256 = createHash("sha256")
  .update(await readFile(path.join(repoRoot, canonicalVsixPath)))
  .digest("hex");
if (canonicalVsixSha256 !== provenance.vsix_sha256) {
  throw new Error("Tracked canonical VSIX does not match public provenance.");
}
assertRegistryArtifactPolicy({
  version: provenance.version,
  canonicalSha256: canonicalVsixSha256,
  marketplaceSha256:
    provenance.registry_artifacts?.marketplace?.vsix_sha256,
  openVsxSha256: provenance.registry_artifacts?.open_vsx?.vsix_sha256,
});

console.log(
  JSON.stringify({
    ok: true,
    files: manifest.files.length,
    tree_sha256: treeSha256,
    source_commit: provenance.source_commit,
    vsix_sha256: canonicalVsixSha256,
  }),
);

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}
