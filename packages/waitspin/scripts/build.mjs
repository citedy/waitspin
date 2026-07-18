#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);

export function prepareBuildDirectory(root) {
  const resolvedRoot = path.resolve(root);
  const outputDirectory = path.join(resolvedRoot, "dist");
  if (path.dirname(outputDirectory) !== resolvedRoot || path.basename(outputDirectory) !== "dist") {
    throw new Error("WaitSpin build output must be the package dist directory");
  }
  rmSync(outputDirectory, { force: true, recursive: true });
  mkdirSync(outputDirectory, { recursive: false, mode: 0o755 });
  return outputDirectory;
}

export function normalizeBinPermissions(outputDirectory, platform = process.platform) {
  for (const filename of ["cli.js", "helper.js"]) {
    const executable = path.join(outputDirectory, filename);
    if (!existsSync(executable)) {
      throw new Error(`WaitSpin build did not emit ${filename}`);
    }
    if (platform !== "win32") chmodSync(executable, 0o755);
  }
}

export function build(root = packageRoot) {
  const outputDirectory = prepareBuildDirectory(root);
  const compiler = require.resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else normalizeBinPermissions(outputDirectory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build();
}
