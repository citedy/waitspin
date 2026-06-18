#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  (mode === "check" ? existingManifest?.source_commit : undefined) ||
  git(["rev-parse", "HEAD"]);
const generatedAt =
  process.env.WAITSPIN_PROVENANCE_GENERATED_AT ||
  (mode === "check" ? existingManifest?.generated_at : undefined) ||
  new Date().toISOString();
const vsixSha256 = createHash("sha256")
  .update(await readFile(vsixPath))
  .digest("hex");

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
    if (isAllowedLocalHashDrift(current, serialized)) {
      console.warn(
        "WaitSpin VS Code provenance manifest matches all non-hash fields; VSIX SHA differs on this non-Linux host.",
      );
      console.warn(
        "Ubuntu CI is the canonical provenance packager and remains strict for vsix_sha256.",
      );
      process.exit(0);
    }
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

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
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
    if (currentJson[key] !== expectedJson[key]) {
      console.error(
        `  ${key}: current=${JSON.stringify(currentJson[key])} expected=${JSON.stringify(expectedJson[key])}`,
      );
    }
  }
}

function isAllowedLocalHashDrift(current, expected) {
  if (process.platform === "linux") return false;

  let currentJson;
  let expectedJson;
  try {
    currentJson = JSON.parse(current || "{}");
    expectedJson = JSON.parse(expected);
  } catch {
    return false;
  }

  const keys = new Set([
    ...Object.keys(currentJson),
    ...Object.keys(expectedJson),
  ]);
  const changedKeys = [...keys].filter((key) => currentJson[key] !== expectedJson[key]);
  return changedKeys.length === 1 && changedKeys[0] === "vsix_sha256";
}
