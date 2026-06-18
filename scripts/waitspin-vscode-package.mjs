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
await copyFile(normalizedVsixPath, vsixPath);
await rm(tmpDir, { force: true, recursive: true });

console.log(`Packaged ${path.relative(repoRoot, vsixPath)}`);

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
  const mtime = new Date("2000-01-01T00:00:00.000Z");
  for (const entry of entries) {
    zipFile.addBuffer(entry.buffer, entry.name, {
      mtime,
      mode: 0o100644,
      compress: false,
    });
  }
  zipFile.end();
  await output;
  await writeFile(outputPath, Buffer.concat(chunks));
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
