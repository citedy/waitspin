#!/usr/bin/env node

import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yauzl = require("yauzl");
const yazl = require("yazl");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(repoRoot, "extensions", "waitspin-vscode");
const outputDir = path.join(repoRoot, "dist", "waitspin-vscode");
const extensionPackageJson = JSON.parse(
  readFileSync(path.join(extensionDir, "package.json"), "utf8"),
);
const vsixFilename = `${extensionPackageJson.name}-${extensionPackageJson.version}.vsix`;
const vsixPath = path.join(outputDir, vsixFilename);
const expectedNodeVersion = "22.14.0";
const expectedNpmVersion = "10.9.2";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, SOURCE_DATE_EPOCH: "946684800" },
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

assertReleaseToolchain();
await mkdir(outputDir, { recursive: true });
await rm(vsixPath, { force: true });
const tmpDir = await mkdtemp(path.join(os.tmpdir(), "waitspin-vscode-"));
const tmpVsixPath = path.join(tmpDir, vsixFilename);
const normalizedVsixPath = path.join(tmpDir, `normalized-${vsixFilename}`);

run("npm", ["run", "waitspin:extension:build"]);
await normalizePackageMtimes();
run("npm", [
  "exec",
  "--",
  "vsce",
  "package",
  "--no-dependencies",
  "--skip-license",
  "--out",
  tmpVsixPath,
], { cwd: extensionDir });

await normalizeVsix(tmpVsixPath, normalizedVsixPath);
await assertNoZipExtraFields(normalizedVsixPath);
await copyFile(normalizedVsixPath, vsixPath);
await rm(tmpDir, { force: true, recursive: true });

console.log(`Packaged ${path.relative(repoRoot, vsixPath)}`);

function assertReleaseToolchain() {
  if (process.versions.node !== expectedNodeVersion) {
    throw new Error(
      `WaitSpin VSIX packaging requires Node ${expectedNodeVersion}; received ${process.versions.node}.`,
    );
  }
  const npmVersion = spawnSync("npm", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (npmVersion.status !== 0 || npmVersion.stdout.trim() !== expectedNpmVersion) {
    throw new Error(
      `WaitSpin VSIX packaging requires npm ${expectedNpmVersion}; received ${npmVersion.stdout.trim() || "unavailable"}.`,
    );
  }
}

async function normalizePackageMtimes() {
  const epoch = new Date("2000-01-01T00:00:00.000Z");
  const files = [
    path.join(extensionDir, "package.json"),
    path.join(extensionDir, ".vscodeignore"),
  ];
  const outDir = path.join(extensionDir, "out");
  for (const entry of await readdir(outDir)) {
    files.push(path.join(outDir, entry));
  }
  for (const file of files) {
    await utimes(file, epoch, epoch);
  }
}

async function normalizeVsix(inputPath, outputPath) {
  const entries = await readZipEntries(inputPath);
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const zipFile = new yazl.ZipFile();
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    zipFile.outputStream.on("data", (chunk) => chunks.push(chunk));
    zipFile.outputStream.on("end", resolve);
    zipFile.outputStream.on("error", reject);
  });
  // yazl serializes DOS timestamps from local calendar fields. Constructing a
  // local midnight keeps those fields identical in every release-host timezone
  // while forceDosTimestamp suppresses the rejected extended timestamp field.
  const mtime = new Date(2000, 0, 1, 0, 0, 0, 0);
  for (const entry of entries) {
    zipFile.addBuffer(entry.buffer, entry.name, {
      mtime,
      mode: 0o100644,
      compress: true,
      forceDosTimestamp: true,
    });
  }
  zipFile.end();
  await output;
  await writeFile(outputPath, Buffer.concat(chunks));
}

async function assertNoZipExtraFields(zipPath) {
  const entries = await readZipEntries(zipPath);
  const incompatibleEntries = entries
    .filter((entry) => entry.extraFieldLength !== 0)
    .map((entry) => entry.name);
  if (incompatibleEntries.length > 0) {
    throw new Error(
      `VSIX contains ZIP extra fields rejected by Open VSX: ${incompatibleEntries.join(", ")}`,
    );
  }
}

function readZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            entries.push({
              name: entry.fileName,
              buffer: Buffer.concat(chunks),
              extraFieldLength: entry.extraFieldLength,
            });
            zipFile.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zipFile.on("end", () => resolve(entries));
      zipFile.on("error", reject);
    });
  });
}
