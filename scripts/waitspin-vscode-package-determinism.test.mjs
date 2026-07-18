import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yauzl from "yauzl";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const extensionPackage = JSON.parse(
  await readFile(
    path.join(repoRoot, "extensions", "waitspin-vscode", "package.json"),
    "utf8",
  ),
);
const vsixPath = path.join(
  repoRoot,
  "dist",
  "waitspin-vscode",
  `${extensionPackage.name}-${extensionPackage.version}.vsix`,
);

test("packages one timezone-stable VSIX with no ZIP extra fields", async () => {
  const hashes = [];
  for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "waitspin-vscode-package.mjs")],
      {
        cwd: repoRoot,
        env: { ...process.env, TZ: timezone },
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    assert.equal(
      result.status,
      0,
      `packaging failed in ${timezone}: ${result.stderr || result.stdout}`,
    );
    hashes.push(
      createHash("sha256").update(await readFile(vsixPath)).digest("hex"),
    );
  }

  assert.equal(new Set(hashes).size, 1, `timezone hashes differ: ${hashes}`);
  const entries = await readZipEntries(vsixPath);
  assert.ok(entries.length > 0, "VSIX must contain entries");
  for (const entry of entries) {
    assert.equal(
      entry.extraFields.length,
      0,
      `${entry.fileName} contains a rejected ZIP extra field`,
    );
  }
});

function readZipEntries(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("Unable to open VSIX"));
        return;
      }
      const entries = [];
      zipFile.on("error", reject);
      zipFile.on("entry", (entry) => {
        entries.push(entry);
        zipFile.readEntry();
      });
      zipFile.on("end", () => resolve(entries));
      zipFile.readEntry();
    });
  });
}
