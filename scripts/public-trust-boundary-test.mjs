#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "workspace files",
  "source code",
  "open editor text",
  "prompts",
  "model responses",
  "terminal output",
  "shell history",
  "repository URLs",
  "screenshots",
  "clipboard",
  "raw keystrokes",
  "status-bar-fallback",
  "claude-code",
  "mimocode",
  "opencode",
  "grok",
];

const trust = await readFile(path.join(root, "TRUST.md"), "utf8");
const privacy = await readFile(path.join(root, "app/waitspin/privacy/page.tsx"), "utf8");
const searchable = (trust + "\n" + privacy).replace(/\s+/g, " ");
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
