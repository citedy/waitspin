#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageRoot = path.join(repoRoot, "packages", "waitspin");
const packageNodeModules = path.join(packageRoot, "node_modules");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "waitspin-package-smoke-"));

function run(command, args, options = {}) {
  const { env: extraEnv = {}, timeout = 60_000, ...execOptions } = options;
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      ...execOptions,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_update_notifier: "false",
        ...extraEnv,
      },
    });
  } catch (error) {
    const stdout = error?.stdout ? `\nstdout:\n${error.stdout}` : "";
    const stderr = error?.stderr ? `\nstderr:\n${error.stderr}` : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${error?.status ?? "unknown"}${stdout}${stderr}`,
    );
  }
}

function runInstalledBin(binPath, args, options = {}) {
  if (process.platform !== "win32") {
    return run(binPath, args, options);
  }
  const quotedBinPath = `"${binPath.replace(/"/g, '""')}"`;
  return run("cmd.exe", ["/d", "/s", "/c", quotedBinPath, ...args], options);
}

function ensurePackageDependencies() {
  if (existsSync(path.join(packageNodeModules, "typescript", "bin", "tsc"))) {
    return;
  }
  run("npm", ["install", "--ignore-scripts", "--no-package-lock"], {
    cwd: packageRoot,
    timeout: 120_000,
  });
}

function assertIncludes(values, required, label) {
  const missing = required.filter((value) => !values.includes(value));
  if (missing.length > 0) {
    throw new Error(`${label} missing required entries: ${missing.join(", ")}`);
  }
}

function parseSinglePackEntry(output, label) {
  const packEntries = JSON.parse(output);
  const packEntry = packEntries[0];
  if (!packEntry?.filename || !Array.isArray(packEntry.files)) {
    throw new Error(`${label} did not return the expected JSON payload`);
  }
  return packEntry;
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}`);
  }
}

function assertDemoPayload(payload, label) {
  if (payload?.ok !== true || payload?.mode !== "demo") {
    throw new Error(`${label} did not return ok=true mode=demo`);
  }
}

try {
  ensurePackageDependencies();
  run("npm", ["run", "prepack"], { cwd: packageRoot });
  const requiredPackageFiles = [
    "README.md",
    "assets/waitspin-vscode/package.json",
    "assets/waitspin-vscode/out/extension.js",
    "assets/waitspin-mimocode/mimocode-install.sh",
    "assets/waitspin-mimocode/mimocode-runtime.sh",
    "assets/waitspin-mimocode/mimocode-status.sh",
    "assets/waitspin-mimocode/mimocode-uninstall.sh",
    "assets/waitspin-opencode/opencode-statusline.mjs",
    "assets/waitspin-opencode/waitspin-opencode.plugin.tsx",
    "dist/cli.js",
  ];

  const dryRunOutput = run("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
  });
  const dryRunEntry = parseSinglePackEntry(dryRunOutput, "npm pack --dry-run");
  const dryRunPackedFiles = dryRunEntry.files.map((file) => file.path);
  assertIncludes(
    dryRunPackedFiles,
    requiredPackageFiles,
    "waitspin package dry-run",
  );

  const packOutput = run(
    "npm",
    ["pack", "--json", "--pack-destination", tempRoot],
    {
      cwd: packageRoot,
    },
  );
  const packEntry = parseSinglePackEntry(packOutput, "npm pack");

  const packedFiles = packEntry.files.map((file) => file.path);
  assertIncludes(packedFiles, requiredPackageFiles, "waitspin package");

  const tarballPath = path.join(tempRoot, packEntry.filename);
  const smokeHome = path.join(tempRoot, "home");
  const smokeCache = path.join(tempRoot, "npm-cache");
  mkdirSync(smokeHome, { recursive: true });
  mkdirSync(smokeCache, { recursive: true });

  run(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", tarballPath],
    {
      cwd: tempRoot,
      timeout: 120_000,
      env: {
        HOME: smokeHome,
        npm_config_cache: smokeCache,
      },
    },
  );

  const waitspinBin = path.join(
    tempRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "waitspin.cmd" : "waitspin",
  );
  const smokeEnv = {
    HOME: smokeHome,
    npm_config_cache: smokeCache,
    WAITSPIN_API_KEY: "",
  };
  const help = runInstalledBin(waitspinBin, ["--help"], {
    cwd: tempRoot,
    env: smokeEnv,
  });
  if (
    !help.includes(
      "waitspin extension install [--target vscode|cursor|devin]",
    ) ||
    !help.includes("waitspin install --all") ||
    !help.includes("waitspin status --all") ||
    !help.includes("waitspin claude-code install") ||
    !help.includes("waitspin mimocode install") ||
    !help.includes("waitspin opencode install") ||
    !help.includes("waitspin grok install") ||
    help.includes("codex")
  ) {
    throw new Error("clean npx help does not match verified public targets");
  }

  const statusOutput = runInstalledBin(
    waitspinBin,
    [
      "extension",
      "status",
      "--target",
      "vscode",
      "--json",
    ],
    { cwd: tempRoot, env: smokeEnv },
  );
  const status = JSON.parse(statusOutput);
  if (status.target !== "vscode" || status.mode !== "status-bar-fallback") {
    throw new Error(
      "clean npx extension status returned an unexpected payload",
    );
  }

  for (const target of ["cursor", "devin"]) {
    const editorStatusOutput = runInstalledBin(
      waitspinBin,
      ["extension", "status", "--target", target, "--json"],
      { cwd: tempRoot, env: smokeEnv },
    );
    const editorStatus = JSON.parse(editorStatusOutput);
    if (
      editorStatus.target !== target ||
      editorStatus.publisher_target !== "status-bar-fallback" ||
      typeof editorStatus.detected !== "boolean" ||
      typeof editorStatus.installed !== "boolean"
    ) {
      throw new Error(
        `clean npx ${target} extension status returned an unexpected payload`,
      );
    }
  }

  const claudeStatusOutput = runInstalledBin(
    waitspinBin,
    [
      "claude-code",
      "status",
      "--json",
    ],
    { cwd: tempRoot, env: smokeEnv },
  );
  const claudeStatus = JSON.parse(claudeStatusOutput);
  if (
    claudeStatus.target !== "claude-code" ||
    claudeStatus.mode !== "statusline-command" ||
    claudeStatus.installed !== false
  ) {
    throw new Error("clean npx Claude Code status returned an unexpected payload");
  }

  for (const target of ["antigravity", "copilot"]) {
    const statusOutput = runInstalledBin(waitspinBin, [target, "status", "--json"], {
      cwd: tempRoot,
      env: smokeEnv,
    });
    const status = JSON.parse(statusOutput);
    if (
      status.target !== target ||
      status.mode !== "statusline-command" ||
      status.installed !== false
    ) {
      throw new Error(`clean npx ${target} status returned an unexpected payload`);
    }
  }

  const qoderStatusOutput = runInstalledBin(
    waitspinBin,
    ["qoder", "status", "--json"],
    { cwd: tempRoot, env: smokeEnv },
  );
  const qoderStatus = JSON.parse(qoderStatusOutput);
  if (
    qoderStatus.target !== "qoder" ||
    qoderStatus.mode !== "qoder-hook-system-message" ||
    qoderStatus.installed !== false
  ) {
    throw new Error("clean npx qoder status returned an unexpected payload");
  }

  const allStatusOutput = runInstalledBin(
    waitspinBin,
    [
      "status",
      "--all",
      "--json",
    ],
    { cwd: tempRoot, env: smokeEnv },
  );
  const allStatus = JSON.parse(allStatusOutput);
  if (
    allStatus.command !== "status --all" ||
    !Array.isArray(allStatus.statuses) ||
    allStatus.statuses.length !== 10 ||
    ![
      "vscode",
      "cursor",
      "devin",
      "claude-code",
      "mimocode",
      "opencode",
      "grok",
      "antigravity",
      "copilot",
      "qoder",
    ].every((target) => allStatus.statuses.some((entry) => entry?.target === target)) ||
    !Array.isArray(allStatus.failed_status)
  ) {
    throw new Error("clean npx status --all returned an unexpected payload");
  }

  const demoMarket = parseJsonOutput(
    runInstalledBin(waitspinBin, ["market", "--demo", "--json"], {
      cwd: tempRoot,
      env: smokeEnv,
    }),
    "clean npx market --demo",
  );
  assertDemoPayload(demoMarket, "clean npx market --demo");
  if (demoMarket.campaigns?.[0]?.campaign_id !== "demo_campaign_001") {
    throw new Error("clean npx market --demo returned unstable campaign id");
  }

  const demoCampaign = parseJsonOutput(
    runInstalledBin(
      waitspinBin,
      [
        "bid",
        "create",
        "--demo",
        "--line",
        "Your ad",
        "--url",
        "https://example.com",
        "--price-per-block",
        "500",
        "--blocks",
        "1",
        "--json",
      ],
      { cwd: tempRoot, env: smokeEnv },
    ),
    "clean npx bid create --demo",
  );
  assertDemoPayload(demoCampaign, "clean npx bid create --demo");
  if (
    demoCampaign.campaign_id !== "demo_campaign_001" ||
    demoCampaign.block_purchase_id !== "demo_block_purchase_001"
  ) {
    throw new Error("clean npx bid create --demo returned unstable ids");
  }
  const demoCampaignText = runInstalledBin(
    waitspinBin,
    [
      "bid",
      "create",
      "--demo",
      "--line",
      "Your ad",
      "--url",
      "https://example.com",
      "--price-per-block",
      "500",
      "--blocks",
      "1",
    ],
    { cwd: tempRoot, env: smokeEnv },
  );
  if (!demoCampaignText.includes("waitspin bid checkout demo_campaign_001 --demo")) {
    throw new Error("clean npx bid create --demo omitted the demo checkout hint");
  }

  const demoCheckout = parseJsonOutput(
    runInstalledBin(
      waitspinBin,
      ["bid", "checkout", "demo_campaign_001", "--demo", "--json"],
      { cwd: tempRoot, env: smokeEnv },
    ),
    "clean npx bid checkout --demo",
  );
  assertDemoPayload(demoCheckout, "clean npx bid checkout --demo");
  if (demoCheckout.block_purchase_id !== "demo_block_purchase_001") {
    throw new Error("clean npx bid checkout --demo returned unstable id");
  }

  const demoStatusAll = parseJsonOutput(
    runInstalledBin(waitspinBin, ["status", "--all", "--demo", "--json"], {
      cwd: tempRoot,
      env: smokeEnv,
    }),
    "clean npx status --all --demo",
  );
  assertDemoPayload(demoStatusAll, "clean npx status --all --demo");
  if (
    demoStatusAll.command !== "status --all" ||
    demoStatusAll.statuses?.[0]?.result?.install_id !== "demo_install_001"
  ) {
    throw new Error("clean npx status --all --demo returned unstable status");
  }

  const uninstallOutput = runInstalledBin(
    waitspinBin,
    [
      "extension",
      "uninstall",
      "--target",
      "vscode",
      "--dry-run",
      "--json",
    ],
    { cwd: tempRoot, env: smokeEnv },
  );
  const uninstall = JSON.parse(uninstallOutput);
  if (
    uninstall.target !== "vscode" ||
    uninstall.dry_run !== true ||
    !Array.isArray(uninstall.would_remove)
  ) {
    throw new Error(
      "clean npx extension uninstall returned an unexpected payload",
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        package: "waitspin",
        version: packEntry.version,
        tarball: packEntry.filename,
        dry_run_pack: true,
        packed_files_checked: packedFiles.length,
        clean_npx_help: true,
        clean_npx_status: true,
        clean_npx_status_all: true,
        clean_npx_demo_quickstart: true,
        clean_npx_claude_code_status: true,
        clean_npx_antigravity_status: true,
        clean_npx_copilot_status: true,
        clean_npx_qoder_status: true,
        clean_npx_uninstall: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
