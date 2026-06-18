import { access, copyFile, cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const extensionSource = path.resolve(
  packageRoot,
  "../../extensions/waitspin-vscode",
);
const destination = path.join(packageRoot, "assets", "waitspin-vscode");

async function ensureExtensionCompiled() {
  try {
    await access(path.join(extensionSource, "node_modules", "typescript"));
  } catch {
    await execFileAsync("npm", ["install", "--ignore-scripts"], {
      cwd: extensionSource,
    });
  }

  await execFileAsync("npm", ["run", "compile"], { cwd: extensionSource });

  await access(path.join(extensionSource, "out", "extension.js"));
}

await ensureExtensionCompiled();
await mkdir(destination, { recursive: true });
for (const child of ["src", "out", "media"]) {
  await rm(path.join(destination, child), { recursive: true, force: true });
  await mkdir(path.join(destination, child), { recursive: true });
}
await copyFile(
  path.join(extensionSource, "package.json"),
  path.join(destination, "package.json"),
);
await copyFile(
  path.join(extensionSource, "package-lock.json"),
  path.join(destination, "package-lock.json"),
);
await copyFile(
  path.join(extensionSource, "tsconfig.json"),
  path.join(destination, "tsconfig.json"),
);
await cp(path.join(extensionSource, "src"), path.join(destination, "src"), {
  recursive: true,
  force: true,
});
await cp(path.join(extensionSource, "out"), path.join(destination, "out"), {
  recursive: true,
  force: true,
});
await cp(path.join(extensionSource, "media"), path.join(destination, "media"), {
  recursive: true,
  force: true,
});
await access(path.join(destination, "out", "extension.js"));
