import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeBinPermissions, prepareBuildDirectory } from "./build.mjs";

function withTemporaryPackage(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "waitspin-build-test-"));
  try {
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("prepareBuildDirectory removes stale generated output", () => {
  withTemporaryPackage((root) => {
    const dist = path.join(root, "dist");
    mkdirSync(dist);
    writeFileSync(path.join(dist, "stale.js"), "stale");

    assert.equal(prepareBuildDirectory(root), dist);
    assert.equal(statSync(dist).isDirectory(), true);
    assert.throws(() => statSync(path.join(dist, "stale.js")));
  });
});

test("normalizeBinPermissions makes both declared binaries executable", {
  skip: process.platform === "win32",
}, () => {
  withTemporaryPackage((root) => {
    const dist = path.join(root, "dist");
    mkdirSync(dist);
    for (const filename of ["cli.js", "helper.js"]) {
      const file = path.join(dist, filename);
      writeFileSync(file, "#!/usr/bin/env node\n");
      chmodSync(file, 0o644);
    }

    normalizeBinPermissions(dist);

    for (const filename of ["cli.js", "helper.js"]) {
      assert.equal(statSync(path.join(dist, filename)).mode & 0o111, 0o111);
    }
  });
});

test("normalizeBinPermissions defers to npm shims on Windows", () => {
  withTemporaryPackage((root) => {
    const dist = path.join(root, "dist");
    mkdirSync(dist);
    writeFileSync(path.join(dist, "cli.js"), "#!/usr/bin/env node\n");

    assert.throws(() => normalizeBinPermissions(dist, "win32"), /helper\.js/);
    writeFileSync(path.join(dist, "helper.js"), "#!/usr/bin/env node\n");
    assert.doesNotThrow(() => normalizeBinPermissions(dist, "win32"));
  });
});
