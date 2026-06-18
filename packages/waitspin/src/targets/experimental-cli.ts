import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { access, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { experimentalRuntimeSource } from "./experimental-runtime.js";

type JsonRecord = Record<string, unknown>;

export type ExperimentalCliTargetName = "grok" | "cline" | "kimi" | "mmx";

export const EXPERIMENTAL_CLI_TARGET_NAMES = [
  "grok",
  "cline",
  "kimi",
  "mmx",
] as const satisfies readonly ExperimentalCliTargetName[];

export function isExperimentalCliTargetName(
  value: string,
): value is ExperimentalCliTargetName {
  return EXPERIMENTAL_CLI_TARGET_NAMES.includes(
    value as ExperimentalCliTargetName,
  );
}

type ExperimentalTargetConfig = {
  target: ExperimentalCliTargetName;
  label: string;
  mode: string;
  binEnv: string;
  defaultBin: string;
  versionArgs: string[];
  patchFileEnv: string;
  candidateRelativePaths: string[];
  anchors: Array<{
    id: string;
    search: string;
    replace: string;
  }>;
};

type ExperimentalInstallState = {
  install_id: string;
  publisher_id?: string;
  publisher_target: ExperimentalCliTargetName;
  registered_at?: string;
  target: ExperimentalCliTargetName;
  base_url: string;
  allow_dev_api_base?: boolean;
  api_key: string;
  runtime_path: string;
  runtime_hash?: string;
  cache_path: string;
  state_path: string;
  target_version: string;
  install_path: string;
  patch_file: string;
  patch_hash: string;
  patched_hash?: string;
  patch_anchor: string;
  patch_mode?: number;
  backup_path: string;
  installed_at: string;
};

export type ExperimentalCliDeps = {
  booleanFlag: (flags: Map<string, string[]>, name: string) => boolean;
  optionalFlag: (flags: Map<string, string[]>, name: string) => string | undefined;
  resolveCredentialedBaseUrl: (flags: Map<string, string[]>) => string;
  requireApiKey: (flags: Map<string, string[]>) => string;
  registerPublisherInstall: (input: {
    baseUrl: string;
    apiKey: string;
    installId: string;
    target: string;
  }) => Promise<{ publisher_id: string; install_id: string; target: string }>;
  generateInstallId: () => string;
  printJson: (value: unknown) => void;
};

export type ExperimentalAllInstallTarget = {
  target: ExperimentalCliTargetName;
  command: string;
  statusCommand: string;
  preflight: (flags: Map<string, string[]>) => Promise<string | null>;
  install: (flags: Map<string, string[]>) => Promise<void>;
  status: (flags: Map<string, string[]>) => Promise<void>;
};

const HELPER_START = "/* waitspin:experimental-runtime:start */";
const HELPER_END = "/* waitspin:experimental-runtime:end */";
const PATCH_FILE_OVERRIDE_OPT_IN_ENV = "WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE";
const PRODUCTION_API_ORIGIN = "https://api.waitspin.com";
const CACHE_LOCK_RETRY_MS = 40;
const CACHE_LOCK_TIMEOUT_MS = 2_000;
const CACHE_LOCK_STALE_MS = 10_000;
const PUBLIC_ACCEPTED_EXPERIMENTAL_TARGETS = new Set<ExperimentalCliTargetName>([
  "grok",
]);

const TARGETS: Record<ExperimentalCliTargetName, ExperimentalTargetConfig> = {
  grok: {
    target: "grok",
    label: "Grok CLI",
    mode: "managed-tui-footer-patch",
    binEnv: "WAITSPIN_GROK_BIN",
    defaultBin: "grok",
    versionArgs: ["--version"],
    patchFileEnv: "WAITSPIN_GROK_PATCH_FILE",
    candidateRelativePaths: ["dist/ui/app.js", "dist/index.js", "src/ui/app.tsx"],
    anchors: [
      {
        id: "grok-open-tui-cwd-footer",
        search:
          '<text fg={t.textDim}>{agent.getCwd().replace(os.homedir(), "~")}</text>',
        replace:
          '<text fg={t.textDim}>{agent.getCwd().replace(os.homedir(), "~")}{(() => { const __waitspinLine = __waitspinSponsoredLine(); return __waitspinLine ? " · " + __waitspinLine : ""; })()}</text>',
      },
      {
        id: "grok-open-tui-compiled-cwd-footer",
        search:
          '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })',
        replace:
          '_jsx("text", { fg: t.textDim, children: [agent.getCwd().replace(os.homedir(), "~"), (() => { const __waitspinLine = __waitspinSponsoredLine(); return __waitspinLine ? " · " + __waitspinLine : ""; })()] })',
      },
    ],
  },
  cline: {
    target: "cline",
    label: "Cline CLI",
    mode: "managed-statusbar-patch",
    binEnv: "WAITSPIN_CLINE_BIN",
    defaultBin: "cline",
    versionArgs: ["version"],
    patchFileEnv: "WAITSPIN_CLINE_PATCH_FILE",
    candidateRelativePaths: [
      "dist/tui/components/status-bar.js",
      "dist/status-bar.js",
      "apps/cli/src/tui/components/status-bar.tsx",
    ],
    anchors: [
      {
        id: "cline-statusbar-path-row",
        search: "{truncatedPath}",
        replace:
          '{truncatedPath}{(() => { const __waitspinLine = __waitspinSponsoredLine(); return __waitspinLine ? " | " + __waitspinLine : ""; })()}',
      },
    ],
  },
  kimi: {
    target: "kimi",
    label: "Kimi Code",
    mode: "managed-footer-patch",
    binEnv: "WAITSPIN_KIMI_BIN",
    defaultBin: "kimi",
    versionArgs: ["--version"],
    patchFileEnv: "WAITSPIN_KIMI_PATCH_FILE",
    candidateRelativePaths: [
      "dist/main.mjs",
      "apps/kimi-code/src/tui/components/chrome/footer.ts",
    ],
    anchors: [
      {
        id: "kimi-footer-left-cwd",
        search: "    if (cwd) left.push(chalk.hex(colors.textDim)(cwd));",
        replace:
          "    if (cwd) left.push(chalk.hex(colors.textDim)(cwd));\n    { const __waitspinLine = __waitspinSponsoredLine(); if (__waitspinLine) left.push(chalk.hex(colors.textDim)(__waitspinLine)); }",
      },
    ],
  },
  mmx: {
    target: "mmx",
    label: "MiniMax CLI",
    mode: "managed-cli-status-surface-patch",
    binEnv: "WAITSPIN_MMX_BIN",
    defaultBin: "mmx",
    versionArgs: ["--version"],
    patchFileEnv: "WAITSPIN_MMX_PATCH_FILE",
    candidateRelativePaths: ["dist/mmx.mjs", "src/output/status-bar.ts"],
    anchors: [
      {
        id: "mmx-statusbar-stderr-write",
        search: [
          "  process.stderr.write(",
          "    `${bold}${mmBlue}MINIMAX${reset} ` +",
          "    `${dim}${filePath}${reset} ` +",
          "    `${dim}|${reset} ` +",
          "    `${dim}URL:${reset} ${mmCyan}${baseUrlStr}${reset} ` +",
          "    `${dim}|${reset} ` +",
          "    `${dim}Key:${reset} ${mmPink}${maskedKey}${reset} ${dim}${keySrc}${reset}` +",
          "    `${modelStr}\\n`,",
          "  );",
        ].join("\n"),
        replace: [
          "  process.stderr.write(",
          "    `${bold}${mmBlue}MINIMAX${reset} ` +",
          "    `${dim}${filePath}${reset} ` +",
          "    `${dim}|${reset} ` +",
          "    `${dim}URL:${reset} ${mmCyan}${baseUrlStr}${reset} ` +",
          "    `${dim}|${reset} ` +",
          "    `${dim}Key:${reset} ${mmPink}${maskedKey}${reset} ${dim}${keySrc}${reset}` +",
          "    `${modelStr}\\n`,",
          "  );",
          "  const __waitspinLine = __waitspinSponsoredLine();",
          "  if (__waitspinLine) process.stderr.write(`${dim}${__waitspinLine}${reset}\\n`);",
        ].join("\n"),
      },
    ],
  },
};

function targetConfig(target: ExperimentalCliTargetName): ExperimentalTargetConfig {
  return TARGETS[target];
}

function isPublicAcceptedExperimentalTarget(
  target: ExperimentalCliTargetName,
): boolean {
  return PUBLIC_ACCEPTED_EXPERIMENTAL_TARGETS.has(target);
}

function unsupportedPatchFailure(target: ExperimentalCliTargetName): {
  failureKind: string;
  humanMessage: string;
} {
  if (target === "cline") {
    return {
      failureKind: "unsupported_native_cli",
      humanMessage:
        "Cline CLI is currently published as a native platform binary without an official TUI statusline/plugin slot. Use the VS Code target for the Cline extension: waitspin extension install --target vscode. Standalone Cline CLI needs official statusline/plugin support before WaitSpin can install it.",
    };
  }
  return {
    failureKind: "unsupported_patch_layout",
    humanMessage:
      "No verified JS/TS patch anchor was found for this installed package layout.",
  };
}

function installNoteForTarget(target: ExperimentalCliTargetName): string {
  if (target === "grok") {
    return "Grok Code CLI support is acceptance-proven for the managed OpenTUI footer patch path. The installer uses hash-backed text-asset patching with rollback.";
  }
  if (target === "cline") {
    return "Hidden experimental target. Cline VS Code extension support is covered by the VS Code fallback; standalone Cline CLI awaits an official statusline/plugin surface.";
  }
  return "Hidden experimental target. Not advertised publicly until real-session install, status, impression, uninstall, restore, and rollback acceptance passes.";
}

function waitspinDir(): string {
  return path.join(os.homedir(), ".waitspin");
}

function statePath(target: ExperimentalCliTargetName): string {
  return path.join(waitspinDir(), `${target}-install.json`);
}

function runtimePath(target: ExperimentalCliTargetName): string {
  return path.join(waitspinDir(), `${target}-runtime.mjs`);
}

function cachePath(target: ExperimentalCliTargetName): string {
  return path.join(waitspinDir(), `${target}-statusline-cache.json`);
}

function backupDir(): string {
  return path.join(waitspinDir(), "backups");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isPatchableTextAssetPath(filePath: string): boolean {
  return /\.(?:mjs|js|ts|tsx)$/.test(path.resolve(filePath));
}

function assertTextAssetPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!isPatchableTextAssetPath(resolved)) {
    throw new Error("unsupported_patch_layout: patch target is not a JS/TS text asset");
  }
  return resolved;
}

function pathInside(root: string, child: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  return (
    relative === "" ||
    (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertExperimentalPatchOverridePath(
  filePath: string,
  envName: string,
): string {
  const textAssetPath = assertTextAssetPath(filePath);
  let resolved: string;
  try {
    resolved = realpathSync(textAssetPath);
  } catch {
    throw new Error(
      `${envName} must point to an existing JS/TS text asset inside the current working directory, HOME, or TMPDIR.`,
    );
  }
  const candidateRoots = [os.homedir(), os.tmpdir()];
  if (process.cwd() !== path.parse(process.cwd()).root) {
    candidateRoots.push(process.cwd());
  }
  const allowedRoots = Array.from(
    new Set(
      candidateRoots.map((root) => {
        try {
          return realpathSync(root);
        } catch {
          return path.resolve(root);
        }
      }),
    ),
  );
  if (!allowedRoots.some((root) => pathInside(root, resolved))) {
    throw new Error(
      `${envName} must point inside the current working directory, HOME, or TMPDIR.`,
    );
  }
  return resolved;
}

function assertManagedPath(
  filePath: string,
  expected: string,
  label: string,
): string {
  const resolved = path.resolve(filePath);
  const expectedResolved = path.resolve(expected);
  if (resolved !== expectedResolved) {
    throw new Error(`Refusing to manage an unexpected ${label} path.`);
  }
  return expectedResolved;
}

function assertBackupPath(filePath: string, mustExist = false): string {
  const root = (() => {
    try {
      return realpathSync(backupDir());
    } catch {
      return path.resolve(backupDir());
    }
  })();
  const resolved = mustExist ? realpathSync(filePath) : path.resolve(filePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to restore a backup outside the WaitSpin backup directory.");
  }
  return resolved;
}

function windowsCmdQuote(value: string): string {
  if (!/[ \t"&<>^|()%!]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function execFileInvocation(
  file: string,
  args: string[],
): { file: string; args: string[] } {
  if (process.platform !== "win32" || file.toLowerCase() === "cmd.exe") {
    return { file, args };
  }
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", [file, ...args].map(windowsCmdQuote).join(" ")],
  };
}

function execFileText(
  file: string,
  args: string[],
  timeout = 5_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const invocation = execFileInvocation(file, args);
    execFile(
      invocation.file,
      invocation.args,
      { encoding: "utf8", timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
      },
    );
  });
}

function executableFromEnv(config: ExperimentalTargetConfig): string {
  return process.env[config.binEnv]?.trim() || config.defaultBin;
}

export async function preflightExperimentalTarget(
  target: ExperimentalCliTargetName,
): Promise<string> {
  const config = targetConfig(target);
  const binary = executableFromEnv(config);
  try {
    const result = await execFileText(binary, config.versionArgs);
    return `${result.stdout || result.stderr || config.label}`.trim();
  } catch (error) {
    throw new Error(
      `${config.label} was not detected. Install ${config.label} or set ${config.binEnv} to its executable path.`,
      { cause: error },
    );
  }
}

async function whichExecutable(config: ExperimentalTargetConfig): Promise<string | null> {
  const binary = executableFromEnv(config);
  if (binary.includes("/") || binary.includes("\\")) {
    return path.resolve(binary);
  }
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const result = await execFileText(finder, [binary]);
    return result.stdout.trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

function findPackageRoot(startPath: string): string | null {
  let current = path.dirname(path.resolve(startPath));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      statSync(path.join(current, "package.json"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function clinePlatformPackageRoot(packageRoot: string): string | null {
  let current = packageRoot;
  while (path.basename(current) !== "node_modules") {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  const platform =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  // npm scoped packages live under node_modules/@scope/name with no prefix space.
  return path.join(current, "@cline", `cli-${platform}-${arch}`);
}

async function candidatePatchFiles(
  config: ExperimentalTargetConfig,
): Promise<string[]> {
  const explicit = experimentalPatchFileOverride(config);
  if (explicit) return [explicit];

  const executablePath = await whichExecutable(config);
  if (!executablePath) return [];
  const realExecutablePath = await resolveExecutableEntrypoint(executablePath);
  const packageRoot = findPackageRoot(realExecutablePath);
  if (!packageRoot) {
    return isPatchableTextAssetPath(realExecutablePath)
      ? [path.resolve(realExecutablePath)]
      : [];
  }

  const roots = [packageRoot];
  if (config.target === "cline") {
    const platformRoot = clinePlatformPackageRoot(packageRoot);
    if (platformRoot) roots.push(platformRoot);
  }

  return Array.from(
    new Set(
      roots.flatMap((root) =>
        config.candidateRelativePaths.map((relativePath) =>
          assertTextAssetPath(path.join(root, relativePath)),
        ),
      ),
    ),
  );
}

async function resolveExecutableEntrypoint(executablePath: string): Promise<string> {
  const resolved = realpathSync(executablePath);
  if (!/\.cmd$/i.test(resolved)) return resolved;
  const shim = await readFile(resolved, "utf8").catch(() => "");
  const target = parseCmdShimTarget(shim);
  if (!target) return resolved;
  return path.resolve(path.dirname(resolved), target.replace(/\\/g, path.sep));
}

function parseCmdShimTarget(shim: string): string | null {
  const match = shim.match(
    /["']?%(?:~dp0|dp0%)\\([^"'\r\n]+?\.(?:mjs|js|ts|tsx))["']?\s+%[*]/i,
  );
  return match?.[1] ?? null;
}

function experimentalPatchFileOverride(
  config: ExperimentalTargetConfig,
): string | null {
  const explicit = process.env[config.patchFileEnv]?.trim();
  if (!explicit) return null;
  if (process.env[PATCH_FILE_OVERRIDE_OPT_IN_ENV] !== "1") {
    throw new Error(
      `${config.patchFileEnv} requires ${PATCH_FILE_OVERRIDE_OPT_IN_ENV}=1 because patch-file overrides can modify local JS/TS files.`,
    );
  }
  return assertExperimentalPatchOverridePath(explicit, config.patchFileEnv);
}

function helperSource(runtime: string, state: string): string {
  return [
    HELPER_START,
    "const __waitspinChildProcess = globalThis.process?.getBuiltinModule?.(\"node:child_process\") ?? (typeof require === \"function\" ? require(\"node:child_process\") : null);",
    "const __waitspinFs = globalThis.process?.getBuiltinModule?.(\"node:fs\") ?? (typeof require === \"function\" ? require(\"node:fs\") : null);",
    "const __waitspinCrypto = globalThis.process?.getBuiltinModule?.(\"node:crypto\") ?? (typeof require === \"function\" ? require(\"node:crypto\") : null);",
    `const __waitspinHeartbeatPath = ${JSON.stringify(state)} + "." + process.pid + ".heartbeat";`,
    "function __waitspinTouchHeartbeat() {",
    "  try { __waitspinFs?.writeFileSync(__waitspinHeartbeatPath, String(process.pid), { encoding: \"utf8\", mode: 0o600 }); } catch {}",
    "}",
    "__waitspinTouchHeartbeat();",
    "try { const __waitspinHeartbeatTimer = setInterval(__waitspinTouchHeartbeat, 1000); __waitspinHeartbeatTimer.unref?.(); } catch {}",
    "try { process.once?.(\"exit\", () => __waitspinFs?.rmSync(__waitspinHeartbeatPath, { force: true })); } catch {}",
    "let __waitspinCachedLine = \"\";",
    "let __waitspinCachedAt = 0;",
    "let __waitspinLastRefreshAt = 0;",
    "function __waitspinReadJson(filePath) {",
    "  try { return JSON.parse(__waitspinFs?.readFileSync(filePath, \"utf8\") || \"{}\"); } catch { return {}; }",
    "}",
    "function __waitspinRuntimeHashMatches() {",
    "  try {",
    `    const __waitspinState = __waitspinReadJson(${JSON.stringify(state)});`,
    "    const __waitspinExpectedHash = String(__waitspinState.runtime_hash || \"\");",
    "    if (!__waitspinExpectedHash || !__waitspinCrypto?.createHash) return false;",
    `    const __waitspinRuntimeSource = __waitspinFs?.readFileSync(${JSON.stringify(runtime)});`,
    "    const __waitspinActualHash = __waitspinCrypto.createHash(\"sha256\").update(__waitspinRuntimeSource).digest(\"hex\");",
    "    return __waitspinActualHash === __waitspinExpectedHash;",
    "  } catch {",
    "    return false;",
    "  }",
    "}",
    "function __waitspinReadCachedLine(now) {",
    `  const __waitspinState = __waitspinReadJson(${JSON.stringify(state)});`,
    "  const __waitspinCache = __waitspinReadJson(__waitspinState.cache_path || \"\");",
    "  const __waitspinServe = __waitspinCache.activeServe;",
    "  if (!__waitspinServe || __waitspinCache.uninstalling === true) return \"\";",
    "  if (now >= Number(__waitspinServe.expiresAtMs || 0)) return \"\";",
    "  const __waitspinAgeStart = Number(__waitspinServe.shownAt || __waitspinServe.fetchedAt || now);",
    "  if (now - __waitspinAgeStart > 60000) return \"\";",
    "  const __waitspinLine = String(__waitspinServe.line || \"\").replace(/[\\r\\n]+/g, \" \").trim().slice(0, 120);",
    "  if (!__waitspinLine) return \"\";",
    "  if (!Number(__waitspinServe.shownAt || 0)) {",
    "    __waitspinLastRefreshAt = 0;",
    "    __waitspinStartRefresh(now, [\"--mark-shown\", \"--serve-id\", String(__waitspinServe.serveId || \"\")]);",
    "  }",
    "  return __waitspinLine;",
    "}",
    "function __waitspinStartRefresh(now, extraArgs) {",
    "  try {",
    "    if (now - __waitspinLastRefreshAt < 5000) return;",
    "    __waitspinLastRefreshAt = now;",
    "    const __waitspinSpawn = __waitspinChildProcess?.spawn;",
    "    if (!__waitspinSpawn || !__waitspinRuntimeHashMatches()) return;",
    `    const __waitspinArgs = [${JSON.stringify(runtime)}, "--state", ${JSON.stringify(state)}].concat(Array.isArray(extraArgs) ? extraArgs : []);`,
    "    const child = __waitspinSpawn(process.execPath, __waitspinArgs, {",
    "      detached: true,",
    "      env: { HOME: process.env.HOME || \"\", PATH: process.env.PATH || \"\", TMPDIR: process.env.TMPDIR || \"\", USERPROFILE: process.env.USERPROFILE || \"\", WAITSPIN_HEARTBEAT_PATH: __waitspinHeartbeatPath },",
    '      stdio: "ignore",',
    "    });",
    "    child.unref?.();",
    "  } catch {}",
    "}",
    "function __waitspinSponsoredLine() {",
    "  try {",
    "    const __waitspinNow = Date.now();",
    "    if (__waitspinNow - __waitspinCachedAt < 1000) return __waitspinCachedLine;",
    "    __waitspinStartRefresh(__waitspinNow);",
    "    __waitspinCachedLine = __waitspinReadCachedLine(__waitspinNow);",
    "    __waitspinCachedAt = __waitspinNow;",
    "    return __waitspinCachedLine;",
    "  } catch {",
    "    __waitspinCachedLine = \"\";",
    "    __waitspinCachedAt = Date.now();",
    '    return "";',
    "  }",
    "}",
    HELPER_END,
    "",
  ].join("\n");
}

function insertHelper(source: string, helper: string): string {
  if (source.includes(HELPER_START)) return source;
  let insertAt = 0;
  if (source.startsWith("#!")) {
    const newline = source.indexOf("\n");
    if (newline >= 0) {
      insertAt = newline + 1;
    } else {
      return `${source}\n${helper}`;
    }
  }
  insertAt = directivePrologueEnd(source, insertAt);
  return `${source.slice(0, insertAt)}${helper}${source.slice(insertAt)}`;
}

function directivePrologueEnd(source: string, start: number): number {
  let offset = start;
  const directive =
    /^(?:(?:\s+)|(?:\/\/[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))*(['"])(?:[^\\\n]|\\.)*\1\s*;?/;
  while (offset < source.length) {
    const match = directive.exec(source.slice(offset));
    if (!match?.[0]) break;
    offset += match[0].length;
    const newline = source.slice(offset).match(/^\r?\n/);
    if (newline) offset += newline[0].length;
  }
  return offset;
}

function removeManagedPatch(source: string): string {
  const startCount = countOccurrences(source, HELPER_START);
  const endCount = countOccurrences(source, HELPER_END);
  if (startCount !== 1 || endCount !== 1) return source;
  const helperPattern = new RegExp(
    `\\n?${escapeRegExp(HELPER_START)}[\\s\\S]*${escapeRegExp(HELPER_END)}\\n?`,
  );
  return source.replace(helperPattern, "\n");
}

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (index < source.length) {
    const found = source.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ManagedPatchValidation =
  | { valid: true }
  | { valid: false; reason: string };

class ExperimentalPatchPlanError extends Error {
  failureKind: string;
  humanMessage: string;

  constructor(failureKind: string, humanMessage: string) {
    super(`${failureKind}: ${humanMessage}`);
    this.name = "ExperimentalPatchPlanError";
    this.failureKind = failureKind;
    this.humanMessage = humanMessage;
  }
}

function hasManagedPatchMarker(source: string): boolean {
  return source.includes(HELPER_START) || source.includes(HELPER_END);
}

function validateManagedPatch(source: string): ManagedPatchValidation {
  const startCount = countOccurrences(source, HELPER_START);
  const endCount = countOccurrences(source, HELPER_END);
  if (startCount === 0) return { valid: false, reason: "missing start marker" };
  if (endCount === 0) return { valid: false, reason: "missing end marker" };
  if (startCount !== 1) {
    return {
      valid: false,
      reason: `expected one start marker, found ${startCount}`,
    };
  }
  if (endCount !== 1) {
    return {
      valid: false,
      reason: `expected one end marker, found ${endCount}`,
    };
  }
  const startIndex = source.indexOf(HELPER_START);
  const endIndex = source.indexOf(HELPER_END);
  if (endIndex <= startIndex) {
    return { valid: false, reason: "end marker appears before start marker" };
  }
  const helperSource = source.slice(startIndex, endIndex + HELPER_END.length);
  if (!helperSource.includes("function __waitspinSponsoredLine")) {
    return { valid: false, reason: "missing sponsored helper function" };
  }
  return { valid: true };
}

type PatchPlan = {
  patchFile: string;
  originalSource: string;
  patchedSource: string;
  originalHash: string;
  originalMode?: number;
  backupPath: string;
  anchorId: string;
  alreadyPatched: boolean;
};

async function resolvePatchPlan(
  config: ExperimentalTargetConfig,
  existingState?: ExperimentalInstallState | null,
): Promise<PatchPlan | null> {
  const files = await candidatePatchFiles(config);
  for (const filePath of files) {
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const originalMode = (await stat(filePath).catch(() => null))?.mode;
    if (hasManagedPatchMarker(source)) {
      const validation = validateManagedPatch(source);
      if (!validation.valid) {
        throw new ExperimentalPatchPlanError(
          "corrupt_managed_patch",
          validation.reason,
        );
      }
      if (!existingState?.backup_path) {
        throw new ExperimentalPatchPlanError(
          "orphaned_managed_patch",
          "A WaitSpin managed patch exists, but install state is missing.",
        );
      }
      const backupPath = assertBackupPath(existingState.backup_path);
      if (!(await pathExists(backupPath))) {
        throw new ExperimentalPatchPlanError(
          "orphaned_managed_patch",
          "A WaitSpin managed patch exists, but its backup file is missing.",
        );
      }
      const originalHash = existingState.patch_hash;
      return {
        patchFile: filePath,
        originalSource: source,
        patchedSource: source,
        originalHash,
        originalMode,
        backupPath,
        anchorId: "already-managed",
        alreadyPatched: true,
      };
    }
    for (const anchor of config.anchors) {
      const matches = countOccurrences(source, anchor.search);
      if (matches === 0) continue;
      if (matches > 1) {
        throw new ExperimentalPatchPlanError(
          "ambiguous_patch_anchor",
          `Patch anchor ${anchor.id} matched ${matches} times in ${filePath}.`,
        );
      }
      const originalHash = sha256(source);
      const patchedBody = source.replace(anchor.search, anchor.replace);
      return {
        patchFile: filePath,
        originalSource: source,
        patchedSource: insertHelper(
          patchedBody,
          helperSource(runtimePath(config.target), statePath(config.target)),
        ),
        originalHash,
        originalMode,
        backupPath: path.join(backupDir(), `${config.target}-${originalHash}.bak`),
        anchorId: anchor.id,
        alreadyPatched: false,
      };
    }
  }
  return null;
}

function safeWriteMode(mode?: number): number {
  if (typeof mode !== "number") return 0o600;
  return (mode & 0o777) & 0o755;
}

async function writeAtomic(filePath: string, source: string, mode?: number): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const writeMode = safeWriteMode(mode);
  await writeFile(tmp, source, { encoding: "utf8", mode: writeMode });
  await chmod(tmp, writeMode);
  await rename(tmp, filePath);
  await chmod(filePath, writeMode);
}

async function writeJson(filePath: string, value: unknown, mode = 0o600): Promise<void> {
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, mode);
}

async function readJson(filePath: string): Promise<JsonRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : null;
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withCacheLock<T>(
  cacheFilePath: string,
  callback: () => Promise<T>,
): Promise<T | null> {
  const lockPath = `${cacheFilePath}.lock`;
  const startedAt = Date.now();
  await mkdir(path.dirname(cacheFilePath), { recursive: true });
  while (Date.now() - startedAt < CACHE_LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockPath);
    } catch {
      try {
        const current = await stat(lockPath);
        if (Date.now() - current.mtimeMs > CACHE_LOCK_STALE_MS) {
          await rm(lockPath, { recursive: true, force: true });
        }
      } catch {
        // The lock disappeared between mkdir and stat; retry normally.
      }
      await sleep(CACHE_LOCK_RETRY_MS);
      continue;
    }
    try {
      return await callback();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }
  return null;
}

async function backupAndPatch(plan: PatchPlan): Promise<void> {
  if (plan.alreadyPatched) return;
  await mkdir(path.dirname(plan.backupPath), { recursive: true });
  await writeAtomic(plan.backupPath, plan.originalSource, 0o600);
  await writeAtomic(plan.patchFile, plan.patchedSource, plan.originalMode);
}

type RestoreFromBackupResult = {
  restored: boolean;
  refused: boolean;
  reason?: string;
};

async function restoreFromBackup(
  state: ExperimentalInstallState,
): Promise<RestoreFromBackupResult> {
  const patchFile = assertTextAssetPath(state.patch_file);
  let backupPath: string;
  try {
    backupPath = assertBackupPath(state.backup_path, true);
  } catch {
    return { restored: false, refused: true, reason: "backup_unavailable" };
  }
  const currentSource = await readFile(patchFile, "utf8").catch(() => "");
  if (!hasManagedPatchMarker(currentSource)) {
    return { restored: false, refused: false, reason: "patch_not_managed" };
  }
  if (!state.patched_hash || sha256(currentSource) !== state.patched_hash) {
    return { restored: false, refused: true, reason: "patched_hash_mismatch" };
  }
  const backupSource = await readFile(backupPath, "utf8").catch(() => null);
  if (backupSource === null) {
    return { restored: false, refused: true, reason: "backup_unreadable" };
  }
  const latestSource = await readFile(patchFile, "utf8").catch(() => "");
  if (sha256(latestSource) !== state.patched_hash) {
    return { restored: false, refused: true, reason: "patch_changed_during_restore" };
  }
  await writeAtomic(patchFile, backupSource, state.patch_mode);
  return { restored: true, refused: false };
}

async function managedPatchStillPresent(
  state: ExperimentalInstallState,
): Promise<boolean> {
  try {
    const source = await readFile(assertTextAssetPath(state.patch_file), "utf8");
    return hasManagedPatchMarker(source);
  } catch {
    return false;
  }
}

async function writeUninstallSentinel(
  state: ExperimentalInstallState,
): Promise<void> {
  try {
    const targetCachePath = assertManagedPath(
      state.cache_path,
      cachePath(state.target),
      "cache",
    );
    await withCacheLock(targetCachePath, async () => {
      const existing = (await readJson(targetCachePath)) ?? {};
      await writeJson(
        targetCachePath,
        {
          ...existing,
          uninstalling: true,
          uninstalling_at: new Date().toISOString(),
        },
        0o600,
      );
    });
  } catch {
    // Best-effort guard for already detached impression ticks.
  }
}

function redactedState(
  state: ExperimentalInstallState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    target: state.target,
    install_id: state.install_id,
    publisher_id: state.publisher_id,
    publisher_target: state.publisher_target,
    registered_at: state.registered_at,
    base_url: state.base_url,
    allow_dev_api_base: state.allow_dev_api_base === true,
    runtime_path: state.runtime_path,
    runtime_hash: state.runtime_hash,
    cache_path: state.cache_path,
    state_path: state.state_path,
    target_version: state.target_version,
    install_path: state.install_path,
    patch_file: state.patch_file,
    patch_hash: state.patch_hash,
    patched_hash: state.patched_hash,
    patch_anchor: state.patch_anchor,
    patch_mode: state.patch_mode,
    backup_path: state.backup_path,
    installed_at: state.installed_at,
    api_key_present: Boolean(state.api_key),
  };
}

async function loadState(
  target: ExperimentalCliTargetName,
): Promise<ExperimentalInstallState | null> {
  const parsed = await readJson(statePath(target));
  if (!parsed || parsed.target !== target || typeof parsed.install_id !== "string") {
    return null;
  }
  const requiredStrings = [
    "publisher_target",
    "base_url",
    "api_key",
    "runtime_path",
    "cache_path",
    "state_path",
    "target_version",
    "install_path",
    "patch_file",
    "patch_hash",
    "patch_anchor",
    "backup_path",
    "installed_at",
  ];
  if (requiredStrings.some((key) => typeof parsed[key] !== "string")) {
    return null;
  }
  return parsed as ExperimentalInstallState;
}

async function writeRuntime(target: ExperimentalCliTargetName): Promise<void> {
  const filePath = runtimePath(target);
  const source = experimentalRuntimeSource(target);
  await writeAtomic(filePath, source, 0o755);
}

export async function runExperimentalCliTargetInstall(
  target: ExperimentalCliTargetName,
  flags: Map<string, string[]>,
  deps: ExperimentalCliDeps,
): Promise<void> {
  const config = targetConfig(target);
  const dryRun = deps.booleanFlag(flags, "dry-run");
  const version = await preflightExperimentalTarget(target);
  const existingState = await loadState(target);
  const installId = existingState?.install_id || deps.generateInstallId();
  let plan: PatchPlan | null = null;
  let planFailure: ExperimentalPatchPlanError | null = null;
  try {
    plan = await resolvePatchPlan(config, existingState);
  } catch (error) {
    if (error instanceof ExperimentalPatchPlanError) {
      planFailure = error;
    } else {
      throw error;
    }
  }
  const summary = {
    ok: true,
    target,
    experimental: true,
    hidden_until_accepted: !isPublicAcceptedExperimentalTarget(target),
    public_support: isPublicAcceptedExperimentalTarget(target),
    mode: config.mode,
    install_id: installId,
    publisher_target: target,
    target_version: version,
    state_path: statePath(target),
    runtime_path: runtimePath(target),
    cache_path: cachePath(target),
    patch_supported: Boolean(plan),
    patch_file: plan?.patchFile ?? null,
    patch_anchor: plan?.anchorId ?? null,
    note: installNoteForTarget(target),
    next: "check_status",
    next_command: `waitspin ${target} status`,
  };

  if (dryRun) {
    const fallbackFailure = !plan && !planFailure
      ? unsupportedPatchFailure(target)
      : null;
    deps.printJson({
      ...summary,
      dry_run: true,
      publisher_registered: false,
      would_write: [statePath(target), runtimePath(target), cachePath(target)].concat(
        plan ? [plan.backupPath, plan.patchFile] : [],
      ),
      ...(plan
        ? { would_patch: plan.alreadyPatched ? "already-managed" : plan.anchorId }
        : planFailure
          ? {
              would_fail: true,
              failure_kind: planFailure.failureKind,
              human_message: planFailure.humanMessage,
            }
        : {
            would_fail: true,
            failure_kind: fallbackFailure!.failureKind,
            human_message: fallbackFailure!.humanMessage,
          }),
    });
    return;
  }

  if (planFailure) {
    throw planFailure;
  }

  if (!plan) {
    const unsupported = unsupportedPatchFailure(target);
    throw new Error(
      `${unsupported.failureKind}: ${unsupported.humanMessage}`,
    );
  }

  const baseUrl = deps.resolveCredentialedBaseUrl(flags);
  const apiKey = deps.requireApiKey(flags);
  const installedAt = new Date().toISOString();
  let installState: ExperimentalInstallState = {
    target,
    install_id: installId,
    publisher_target: target,
    base_url: baseUrl,
    allow_dev_api_base: baseUrl !== PRODUCTION_API_ORIGIN,
    api_key: apiKey,
    runtime_path: runtimePath(target),
    runtime_hash: sha256(experimentalRuntimeSource(target)),
    cache_path: cachePath(target),
    state_path: statePath(target),
    target_version: version,
    install_path: path.dirname(plan.patchFile),
    patch_file: plan.patchFile,
    patch_hash: plan.originalHash,
    patched_hash: sha256(plan.patchedSource),
    patch_anchor: plan.anchorId,
    patch_mode: plan.originalMode,
    backup_path: plan.backupPath,
    installed_at: installedAt,
  };
  let registrationCompleted = false;
  const previousRuntimeSource = existingState
    ? await readFile(runtimePath(target), "utf8").catch(() => null)
    : null;
  const previousRuntimeMode = existingState
    ? (await stat(runtimePath(target)).catch(() => null))?.mode
    : undefined;

  try {
    await writeRuntime(target);
    await backupAndPatch(plan);
    await writeJson(statePath(target), installState, 0o600);
    const registration = await deps.registerPublisherInstall({
      baseUrl,
      apiKey,
      installId,
      target,
    });
    registrationCompleted = true;
    installState = {
      ...installState,
      install_id: registration.install_id,
      publisher_id: registration.publisher_id,
      registered_at: installedAt,
    };
    await writeJson(statePath(target), installState, 0o600);
  } catch (error) {
    if (registrationCompleted) {
      throw error;
    }
    if (!plan.alreadyPatched) {
      await writeAtomic(plan.patchFile, plan.originalSource, plan.originalMode).catch(
        () => {},
      );
    }
    if (existingState) {
      if (previousRuntimeSource !== null) {
        await writeAtomic(
          runtimePath(target),
          previousRuntimeSource,
          previousRuntimeMode,
        ).catch(() => {});
      } else {
        await rm(runtimePath(target), { force: true, recursive: true }).catch(
          () => {},
        );
      }
      await writeJson(statePath(target), existingState, 0o600).catch(() => {});
    } else {
      await rm(statePath(target), { force: true, recursive: true }).catch(() => {});
      await rm(runtimePath(target), { force: true, recursive: true }).catch(() => {});
      await rm(cachePath(target), { force: true, recursive: true }).catch(() => {});
    }
    throw error;
  }

  deps.printJson({
    ...summary,
    ...redactedState(installState),
    publisher_registered: true,
    next: `restart_${target}`,
    next_command: config.defaultBin,
    acceptance_hint:
      target === "grok"
        ? "Restart Grok Code CLI to load the managed WaitSpin footer line."
        : "Restart the target CLI and verify visible sponsored wait-state plus >=5s impression before public support claims.",
  });
}

export async function runExperimentalCliTargetStatus(
  target: ExperimentalCliTargetName,
  deps: Pick<ExperimentalCliDeps, "printJson">,
): Promise<void> {
  const state = await loadState(target);
  const configuredStatePath = state?.state_path ?? statePath(target);
  const configuredRuntimePath = state?.runtime_path ?? runtimePath(target);
  const configuredCachePath = state?.cache_path ?? cachePath(target);
  let managedPathsValid = true;
  let statusInvalidReason: string | null = null;
  let safeStatePath = statePath(target);
  let safeRuntimePath = runtimePath(target);
  let safeCachePath = cachePath(target);
  let patchFile: string | null = null;
  try {
    safeStatePath = assertManagedPath(
      configuredStatePath,
      statePath(target),
      "state",
    );
    safeRuntimePath = assertManagedPath(
      configuredRuntimePath,
      runtimePath(target),
      "runtime",
    );
    safeCachePath = assertManagedPath(
      configuredCachePath,
      cachePath(target),
      "cache",
    );
    patchFile = state?.patch_file ? assertTextAssetPath(state.patch_file) : null;
  } catch (error) {
    managedPathsValid = false;
    statusInvalidReason =
      error instanceof Error ? error.message : "Invalid managed path.";
  }

  const [stateInstalled, runtimeInstalled, cacheInstalled] = await Promise.all([
    pathExists(safeStatePath),
    pathExists(safeRuntimePath),
    pathExists(safeCachePath),
  ]);
  let patchInstalled = false;
  let patchInvalidReason: string | null = null;
  if (patchFile) {
    try {
      const source = await readFile(patchFile, "utf8");
      if (hasManagedPatchMarker(source)) {
        const validation = validateManagedPatch(source);
        patchInstalled = validation.valid;
        patchInvalidReason = validation.valid ? null : validation.reason;
      }
    } catch {
      patchInstalled = false;
      patchInvalidReason = "patch file unreadable";
    }
  }

  deps.printJson({
    ok: true,
    target,
    experimental: true,
    hidden_until_accepted: !isPublicAcceptedExperimentalTarget(target),
    public_support: isPublicAcceptedExperimentalTarget(target),
    mode: targetConfig(target).mode,
    installed: Boolean(
      state &&
        managedPathsValid &&
        stateInstalled &&
        runtimeInstalled &&
        patchInstalled,
    ),
    publisher_registered: Boolean(state?.publisher_id),
    install_id: state?.install_id ?? null,
    publisher_id: state?.publisher_id ?? null,
    publisher_target: state?.publisher_target ?? target,
    state_path: safeStatePath,
    runtime_path: safeRuntimePath,
    cache_path: safeCachePath,
    patch_file: patchFile,
    runtime_installed: runtimeInstalled,
    cache_installed: cacheInstalled,
    patch_installed: patchInstalled,
    patch_invalid_reason: patchInvalidReason,
    status_invalid_reason: statusInvalidReason,
    target_version: state?.target_version ?? null,
    ...(target === "cline" && !state
      ? {
          unsupported_reason: "unsupported_native_cli",
          fallback_target: "vscode",
          fallback_command: "waitspin extension install --target vscode",
          human_message:
            "Cline VS Code extension support is covered by the VS Code target. Standalone Cline CLI needs official statusline/plugin support before WaitSpin can install it.",
        }
      : {}),
  });
}

export async function runExperimentalCliTargetUninstall(
  target: ExperimentalCliTargetName,
  flags: Map<string, string[]>,
  deps: Pick<ExperimentalCliDeps, "booleanFlag" | "printJson">,
): Promise<void> {
  const dryRun = deps.booleanFlag(flags, "dry-run");
  const state = await loadState(target);
  const removePaths = [statePath(target), runtimePath(target), cachePath(target)];
  let restorePath: string | null = null;
  let restoreAvailable = false;

  if (state) {
    assertManagedPath(state.state_path, statePath(target), "state");
    assertManagedPath(state.runtime_path, runtimePath(target), "runtime");
    assertManagedPath(state.cache_path, cachePath(target), "cache");
    restorePath = assertTextAssetPath(state.patch_file);
    restoreAvailable = await pathExists(assertBackupPath(state.backup_path));
  }

  if (dryRun) {
    deps.printJson({
      ok: true,
      target,
      experimental: true,
      dry_run: true,
      would_restore: restorePath,
      backup_available: restoreAvailable,
      would_remove: removePaths,
    });
    return;
  }

  let restored = false;
  let restoreRefused = false;
  let restoreRefusalReason: string | null = null;
  if (state) {
    await writeUninstallSentinel(state);
  }
  if (state && restoreAvailable) {
    const restoreResult = await restoreFromBackup(state);
    restored = restoreResult.restored;
    restoreRefused = restoreResult.refused;
    restoreRefusalReason = restoreResult.reason ?? null;
  } else if (state && (await managedPatchStillPresent(state))) {
    restoreRefused = true;
    restoreRefusalReason = "backup_unavailable";
  }

  if (state && restoreRefused) {
    deps.printJson({
      ok: false,
      target,
      experimental: true,
      uninstalled: false,
      restored: false,
      restore_refused: true,
      restore_refusal_reason: restoreRefusalReason,
      manual_recovery_required: true,
      removed: [],
      restore_path: restorePath,
      state_path: statePath(target),
      human_message:
        "The target still contains a WaitSpin managed helper, but safe restore was refused. Keeping state/runtime files so backup metadata is not lost.",
    });
    return;
  }

  await Promise.all(
    removePaths.map((filePath) => rm(filePath, { force: true, recursive: true })),
  );

  deps.printJson({
    ok: true,
    target,
    experimental: true,
    uninstalled: true,
    restored,
    removed: removePaths,
    restore_path: restorePath,
  });
}

export function experimentalAllInstallTargets(
  deps: ExperimentalCliDeps,
): ExperimentalAllInstallTarget[] {
  return EXPERIMENTAL_CLI_TARGET_NAMES.map((target) =>
    experimentalInstallTarget(target, deps),
  );
}

export function experimentalInstallTarget(
  target: ExperimentalCliTargetName,
  deps: ExperimentalCliDeps,
): ExperimentalAllInstallTarget {
  return {
    target,
    command: `waitspin ${target} install`,
    statusCommand: `waitspin ${target} status`,
    preflight: () => preflightExperimentalTarget(target),
    install: (flags) => runExperimentalCliTargetInstall(target, flags, deps),
    status: () => runExperimentalCliTargetStatus(target, deps),
  };
}
