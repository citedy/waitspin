import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "openapi");
const targetDir = path.join(repoRoot, "public", "openapi");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Missing OpenAPI source directory: ${sourceDir}`);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".openapi.json")) continue;
  fs.copyFileSync(
    path.join(sourceDir, entry.name),
    path.join(targetDir, entry.name),
  );
}
