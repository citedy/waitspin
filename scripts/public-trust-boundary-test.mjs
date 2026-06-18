#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const trust = await readFile(path.join(root, "TRUST.md"), "utf8");
const privacy = await readFile(path.join(root, "app/waitspin/privacy/page.tsx"), "utf8");
const publicTrustSource = await readFile(
  path.join(root, "lib/waitspin/public-trust.ts"),
  "utf8",
);

function extractConstArray(name) {
  const match = publicTrustSource.match(
    new RegExp("export const " + name + " = \\[([\\s\\S]*?)\\] as const;"),
  );
  if (!match) throw new Error("Missing canonical trust array: " + name);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const required = [
  ...extractConstArray("WAITSPIN_NEVER_SENT_DATA"),
  ...extractConstArray("WAITSPIN_SENT_PAYLOADS"),
  ...new Set([...publicTrustSource.matchAll(/target: "([^"]+)"/g)].map((item) => item[1])),
];

const searchable = (trust + "\n" + privacy + "\n" + publicTrustSource).replace(/\s+/g, " ");
for (const token of required) {
  if (!searchable.includes(token)) {
    throw new Error("Missing trust-boundary token: " + token);
  }
}

const forbiddenFiles = [];
async function visit(dir) {
  for (const child of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist"].includes(child.name)) continue;
    const absolute = path.join(dir, child.name);
    const relative = path.relative(root, absolute);
    if (child.isDirectory()) await visit(absolute);
    else if (/infra|migration|stripe-webhook|payout-risk|operator|launch-evidence/i.test(relative)) {
      forbiddenFiles.push(relative);
    }
  }
}
await visit(root);
if (forbiddenFiles.length) {
  throw new Error("Private files leaked into public repo: " + forbiddenFiles.join(", "));
}

console.log(JSON.stringify({ ok: true, checked: required.length }));
