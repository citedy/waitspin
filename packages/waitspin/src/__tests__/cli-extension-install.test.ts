/** @jest-environment node */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const access = jest.fn();
const chmod = jest.fn();
const cp = jest.fn();
const execFile = jest.fn();
const fetchMock = jest.fn();
const readdir = jest.fn();
const rename = jest.fn();
const rm = jest.fn();
const stat = jest.fn();
const statSync = jest.fn();
const realpathSync = jest.fn((value: string) => value);

jest.mock("node:fs", () => ({
  constants: { F_OK: 0, R_OK: 4, X_OK: 1 },
  realpathSync: (...args: unknown[]) => realpathSync(...(args as [string])),
  statSync: (...args: unknown[]) => statSync(...args),
}));

jest.mock("node:fs/promises", () => ({
  access: (...args: unknown[]) => access(...args),
  chmod: (...args: unknown[]) => chmod(...args),
  cp: (...args: unknown[]) => cp(...args),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  readdir: (...args: unknown[]) => readdir(...args),
  rename: (...args: unknown[]) => rename(...args),
  rm: (...args: unknown[]) => rm(...args),
  stat: (...args: unknown[]) => stat(...args),
  writeFile: jest.fn(),
}));

jest.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFile(...args),
}));

function withJsonFlag(flags: Map<string, string[]> = new Map()): Map<string, string[]> {
  const next = new Map(flags);
  next.set("json", ["true"]);
  return next;
}

describe("waitspin extension install", () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.WAITSPIN_BASE_URL;
  const originalDevApiBase = process.env.WAITSPIN_ALLOW_DEV_API_BASE;
  const originalDevExtensionAssets =
    process.env.WAITSPIN_ALLOW_DEV_EXTENSION_ASSETS;
  const experimentalEnvNames = [
    "WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE",
    "WAITSPIN_GROK_PATCH_FILE",
    "WAITSPIN_CLINE_PATCH_FILE",
    "WAITSPIN_KILO_PATCH_FILE",
    "WAITSPIN_KIMI_PATCH_FILE",
    "WAITSPIN_MMX_PATCH_FILE",
    "WAITSPIN_GROK_BIN",
    "WAITSPIN_CLINE_BIN",
    "WAITSPIN_KILO_BIN",
    "WAITSPIN_KIMI_BIN",
    "WAITSPIN_MMX_BIN",
    "WAITSPIN_COPILOT_BIN",
    "WAITSPIN_ANTIGRAVITY_BIN",
    "WAITSPIN_QODER_BIN",
    "COPILOT_HOME",
  ] as const;
  const originalExperimentalEnv = Object.fromEntries(
    experimentalEnvNames.map((name) => [name, process.env[name]]),
  );
  const statePath = path.join(os.homedir(), ".waitspin", "vscode-install.json");
  const markerPath = path.join(
    os.homedir(),
    ".vscode",
    "extensions",
    ".waitspin-install.json",
  );
  const installedPath = path.join(
    os.homedir(),
    ".vscode",
    "extensions",
    "waitspin.waitspin-vscode-0.1.3",
  );
  const claudeStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "claude-code-install.json",
  );
  const claudeRuntimePath = path.join(
    os.homedir(),
    ".waitspin",
    "claude-code-statusline.mjs",
  );
  const claudeCachePath = path.join(
    os.homedir(),
    ".waitspin",
    "claude-code-statusline-cache.json",
  );
  const claudeSettingsPath = path.join(
    os.homedir(),
    ".claude",
    "settings.json",
  );
  const opencodeStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "opencode-install.json",
  );
  const opencodeRuntimePath = path.join(
    os.homedir(),
    ".waitspin",
    "opencode-statusline.mjs",
  );
  const opencodeCachePath = path.join(
    os.homedir(),
    ".waitspin",
    "opencode-statusline-cache.json",
  );
  const opencodePluginDestPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "plugins",
    "waitspin-opencode.plugin.tsx",
  );
  const opencodeTuiConfigPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "tui.json",
  );
  const opencodeTuiPluginEntry = "./plugins/waitspin-opencode.plugin.tsx";
  const copilotStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "copilot-install.json",
  );
  const copilotSettingsPath = path.join(
    os.homedir(),
    ".copilot",
    "settings.json",
  );
  const antigravityStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "antigravity-install.json",
  );
  const antigravitySettingsPath = path.join(
    os.homedir(),
    ".gemini",
    "antigravity-cli",
    "settings.json",
  );
  const qoderStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "qoder-install.json",
  );
  const qoderRuntimePath = path.join(
    os.homedir(),
    ".waitspin",
    "qoder-hook-runtime.mjs",
  );
  const qoderCachePath = path.join(
    os.homedir(),
    ".waitspin",
    "qoder-hook-cache.json",
  );
  const qoderApiKeyPath = path.join(
    os.homedir(),
    ".waitspin",
    "qoder-api-key.secret",
  );
  const qoderSettingsPath = path.join(
    os.homedir(),
    ".qoder",
    "settings.json",
  );
  const mimocodeStatePath = path.join(
    os.homedir(),
    ".waitspin",
    "mimocode-statusline.json",
  );
  const mimocodeRuntimePath = path.join(
    os.homedir(),
    ".local",
    "bin",
    "waitspin-mimocode-runtime",
  );
  const mimocodeCachePath = path.join(
    os.homedir(),
    ".waitspin",
    "mimocode-statusline-cache.json",
  );
  const mimocodeBashrcPath = path.join(os.homedir(), ".bashrc");
  const experimentalPatchPaths = {
    grok: path.join(os.tmpdir(), "waitspin-grok-app.tsx"),
    cline: path.join(os.tmpdir(), "waitspin-cline-status-bar.tsx"),
    kilo: path.join(os.tmpdir(), "waitspin-kilo-footer.tsx"),
    kimi: path.join(os.tmpdir(), "waitspin-kimi-footer.ts"),
    mmx: path.join(os.tmpdir(), "waitspin-mmx-status-bar.ts"),
  };
  const experimentalStatePaths = {
    grok: path.join(os.homedir(), ".waitspin", "grok-install.json"),
    cline: path.join(os.homedir(), ".waitspin", "cline-install.json"),
    kilo: path.join(os.homedir(), ".waitspin", "kilo-install.json"),
    kimi: path.join(os.homedir(), ".waitspin", "kimi-install.json"),
    mmx: path.join(os.homedir(), ".waitspin", "mmx-install.json"),
  };

  function experimentalFixture(filePath: string): string | null {
    if (filePath === experimentalPatchPaths.grok) {
      return '<text fg={t.textDim}>{agent.getCwd().replace(os.homedir(), "~")}</text>';
    }
    if (filePath === experimentalPatchPaths.cline) {
      return '<text fg={defaultFg}>{truncatedPath}</text>';
    }
    if (filePath === experimentalPatchPaths.kimi) {
      return "    if (cwd) left.push(chalk.hex(colors.textDim)(cwd));";
    }
    if (filePath === experimentalPatchPaths.mmx) {
      return [
        "  process.stderr.write(",
        "    `${bold}${mmBlue}MINIMAX${reset} ` +",
        "    `${dim}${filePath}${reset} ` +",
        "    `${dim}|${reset} ` +",
        "    `${dim}URL:${reset} ${mmCyan}${baseUrlStr}${reset} ` +",
        "    `${dim}|${reset} ` +",
        "    `${dim}Key:${reset} ${mmPink}${maskedKey}${reset} ${dim}${keySrc}${reset}` +",
        "    `${modelStr}\\n`,",
        "  );",
      ].join("\n");
    }
    return null;
  }

  function enableExperimentalPatchEnv() {
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;
    process.env.WAITSPIN_CLINE_PATCH_FILE = experimentalPatchPaths.cline;
    process.env.WAITSPIN_KILO_PATCH_FILE = experimentalPatchPaths.kilo;
    process.env.WAITSPIN_KIMI_PATCH_FILE = experimentalPatchPaths.kimi;
    process.env.WAITSPIN_MMX_PATCH_FILE = experimentalPatchPaths.mmx;
  }

  function enableGrokPatchEnv() {
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;
  }

  function isProjectClaudeSettingsPath(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    const projectSettingsSuffix = path.join(".claude", "settings.json");
    const localSettingsSuffix = path.join(".claude", "settings.local.json");
    return (
      normalized !== claudeSettingsPath &&
      (normalized.endsWith(projectSettingsSuffix) ||
        normalized.endsWith(localSettingsSuffix))
    );
  }

  function enoent(): Error & { code: string } {
    return Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }

  function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WAITSPIN_BASE_URL;
    delete process.env.WAITSPIN_ALLOW_DEV_API_BASE;
    delete process.env.WAITSPIN_ALLOW_DEV_EXTENSION_ASSETS;
    for (const name of experimentalEnvNames) {
      delete process.env[name];
    }
    global.fetch = fetchMock as typeof fetch;
    access.mockResolvedValue(undefined);
    chmod.mockResolvedValue(undefined);
    readdir.mockResolvedValue([]);
    rename.mockResolvedValue(undefined);
    stat.mockResolvedValue({ mode: 0o755 });
    realpathSync.mockImplementation((value: string) => value);
    statSync.mockImplementation(() => {
      throw enoent();
    });
    execFile.mockImplementation((file, _args, _options, callback) => {
      callback(
        null,
        file === "qodercli" ? "1.0.31\n" : "2.1.152 (Claude Code)\n",
        "",
      );
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath.endsWith("package.json")) {
        return JSON.stringify({
          name: "waitspin-vscode",
          publisher: "waitspin",
          version: "0.1.3",
        });
      }
      if (filePath.endsWith("waitspin-opencode.plugin.tsx")) {
        return [
          'const INSTALL_CONFIG = {',
          '  statePath: "__WAITSPIN_STATE_PATH__",',
          '}',
        ].join("\n");
      }
      const fixture = experimentalFixture(filePath);
      if (fixture !== null) {
        return fixture;
      }
      if (filePath === opencodeTuiConfigPath) {
        throw enoent();
      }
      if (
        filePath === claudeSettingsPath ||
        filePath === claudeStatePath ||
        filePath === copilotSettingsPath ||
        filePath === copilotStatePath ||
        filePath === antigravitySettingsPath ||
        filePath === antigravityStatePath ||
        filePath === qoderSettingsPath ||
        filePath === qoderStatePath
      ) {
        throw enoent();
      }
      if (filePath === opencodeStatePath || filePath === mimocodeStatePath) {
        throw enoent();
      }
      if (Object.values(experimentalStatePaths).includes(filePath)) {
        throw enoent();
      }
      if (filePath === statePath) {
        throw new Error("ENOENT");
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    fetchMock.mockImplementation(async (_url, init) => {
      const payload = JSON.parse((init as RequestInit).body as string) as {
        install_id: string;
        target: string;
      };
      return {
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            publisher_id: "wpub_test",
            install_id: payload.install_id,
            target: payload.target,
          }),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.WAITSPIN_BASE_URL;
    } else {
      process.env.WAITSPIN_BASE_URL = originalBaseUrl;
    }
    if (originalDevApiBase === undefined) {
      delete process.env.WAITSPIN_ALLOW_DEV_API_BASE;
    } else {
      process.env.WAITSPIN_ALLOW_DEV_API_BASE = originalDevApiBase;
    }
    if (originalDevExtensionAssets === undefined) {
      delete process.env.WAITSPIN_ALLOW_DEV_EXTENSION_ASSETS;
    } else {
      process.env.WAITSPIN_ALLOW_DEV_EXTENSION_ASSETS =
        originalDevExtensionAssets;
    }
    for (const name of experimentalEnvNames) {
      const value = originalExperimentalEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("lists public user install paths including install-all", async () => {
    const { usageText } = await import("../cli");
    const text = usageText();
    expect(text).toContain("waitspin install --all");
    expect(text).toContain("waitspin status --all");
    expect(text).toContain("waitspin extension install [--target vscode]");
    expect(text).toContain("waitspin extension status [--target vscode]");
    expect(text).toContain("waitspin extension uninstall [--target vscode]");
    expect(text).toContain("waitspin claude-code install");
    expect(text).toContain("waitspin claude-code status");
    expect(text).toContain("waitspin claude-code uninstall");
    expect(text).toContain("waitspin opencode install");
    expect(text).toContain("waitspin opencode status");
    expect(text).toContain("waitspin grok install");
    expect(text).toContain("waitspin grok status");
    expect(text).toContain("waitspin antigravity install");
    expect(text).toContain("waitspin antigravity status");
    expect(text).toContain("waitspin copilot install");
    expect(text).toContain("waitspin copilot status");
    expect(text).toContain("waitspin qoder install");
    expect(text).toContain("waitspin qoder status");
    expect(text).toContain("mimocode");
    expect(text).not.toContain("--include-experimental");
    expect(text).not.toContain("waitspin kilo");
    expect(text).not.toContain("cline|kimi|mmx");
    expect(text).not.toContain("Hidden experimental targets");
    expect(text).not.toContain("codex");
  });

  it("rejects unsupported wallet connect countries before network calls", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);

    await expect(
      main([
        "wallet",
        "connect",
        "--country",
        "ZZ",
        "--api-key",
        "wts_live_test",
      ]),
    ).rejects.toThrow("--country ZZ is not a supported payout country");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prints the exact next command after requesting a publisher-extension email code", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          delivery: "email",
          expires_in_seconds: 900,
        }),
    });

    await main([
      "init",
      "--email",
      "you@example.com",
      "--key-profile",
      "publisher-extension",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.waitspin.com/v1/keys/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "you@example.com",
          intended_use: "key_profile:publisher_extension",
        }),
      }),
    );
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      ok: true,
      next: "enter_email_code",
      email: "you@example.com",
      expires_in_seconds: 900,
      next_command:
        "waitspin init --email you@example.com --code CODE_FROM_EMAIL --key-profile publisher-extension",
    });
    expect(output).not.toHaveProperty("debug_code_available");
  });

  it("prints safe user install next commands after OTP verification", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          account_id: "wacct_test",
          api_key: "wts_live_test_key_value_1234567890",
          scopes: ["publishers:write", "serve:read", "events:write"],
          trust_level: "email_verified",
          key_profile: "publisher_extension",
        }),
    });

    await main([
      "init",
      "--email",
      "you@example.com",
      "--code",
      "123456",
      "--key-profile",
      "publisher-extension",
    ]);

    const output = JSON.parse(stdout.join("")) as {
      next: string;
      next_commands: string[];
      human_message: string;
    };
    expect(output.next).toBe("install_publisher_target");
    expect(output.next_commands).toEqual([
      "export WAITSPIN_API_KEY='PASTE_KEY_HERE'",
      "waitspin install --all --dry-run --compose-existing",
      "waitspin install --all --compose-existing",
      "waitspin status --all",
    ]);
    expect(output.human_message).toContain("extension API key");
    expect(output.human_message).toContain("user install setup");
    expect(JSON.stringify(output.next_commands)).not.toContain(
      "wts_live_test_key_value_1234567890",
    );
    expect(JSON.stringify(output.next_commands)).not.toContain("<");
  });

  it("maps the public extension target to the publisher fallback surface", async () => {
    const { publisherTargetForExtension } = await import("../cli");
    expect(publisherTargetForExtension("vscode")).toBe("status-bar-fallback");
  });

  it("dry-runs install-all as a structured advanced agent command", async () => {
    enableGrokPatchEnv();
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["install", "--all", "--dry-run", "--compose-existing"]);

    const output = JSON.parse(stdout.join("")) as {
      ok: boolean;
      command: string;
      dry_run: boolean;
      installed: unknown[];
      would_install: Array<{ target: string; result: { dry_run: boolean } }>;
      skipped_not_detected: unknown[];
      skipped_conflict: unknown[];
      failed_rollback: unknown[];
    };
    expect(output).toMatchObject({
      ok: true,
      command: "install --all",
      dry_run: true,
      installed: [],
      skipped_not_detected: [],
      skipped_conflict: [],
      failed_rollback: [],
      next_command: "waitspin status --all",
    });
    expect(output.would_install.map((item) => item.target)).toEqual([
      "vscode",
      "claude-code",
      "mimocode",
      "opencode",
      "grok",
      "antigravity",
      "copilot",
      "qoder",
    ]);
    expect(output.would_install.every((item) => item.result.dry_run)).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips unsupported Grok layouts during install-all dry-run", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["install", "--all", "--dry-run", "--compose-existing"]);

    const output = JSON.parse(stdout.join("")) as {
      ok: boolean;
      would_install: Array<{ target: string }>;
      skipped_conflict: Array<{ target: string; reason: string }>;
      failed_rollback: unknown[];
    };
    expect(output.ok).toBe(true);
    expect(output.failed_rollback).toEqual([]);
    expect(output.would_install.map((item) => item.target)).toEqual([
      "vscode",
      "claude-code",
      "mimocode",
      "opencode",
      "antigravity",
      "copilot",
      "qoder",
    ]);
    expect(output.skipped_conflict).toEqual([
      expect.objectContaining({
        target: "grok",
        reason: expect.stringContaining("No verified JS/TS patch anchor"),
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unexpected install-all preflight failures without treating them as not detected", async () => {
    enableGrokPatchEnv();
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    access.mockImplementation(async (filePath: string) => {
      if (filePath.includes("assets/waitspin-vscode/package.json")) {
        throw new Error("packaged asset missing");
      }
      return undefined;
    });

    await main(["install", "--all", "--dry-run", "--compose-existing"]);

    const output = JSON.parse(stdout.join("")) as {
      ok: boolean;
      would_install: Array<{ target: string }>;
      skipped_not_detected: Array<{ target: string }>;
      failed_rollback: Array<{ target: string; reason: string }>;
    };
    expect(output.ok).toBe(false);
    expect(output.failed_rollback).toEqual([
      expect.objectContaining({
        target: "vscode",
        reason: expect.stringContaining("WaitSpin extension package not found"),
      }),
    ]);
    expect(output.skipped_not_detected).toEqual([]);
    expect(output.would_install.map((item) => item.target)).toEqual([
      "claude-code",
      "mimocode",
      "opencode",
      "grok",
      "antigravity",
      "copilot",
      "qoder",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aggregates status-all without running target installs", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["status", "--all"]);

    const output = JSON.parse(stdout.join("")) as {
      ok: boolean;
      command: string;
      installed: unknown[];
      statuses: Array<{ target: string; result: { installed: boolean } }>;
      failed_status: unknown[];
    };
    expect(output).toMatchObject({
      ok: true,
      command: "status --all",
      installed: [],
      failed_status: [],
    });
    expect(output.statuses.map((item) => item.target)).toEqual([
      "vscode",
      "claude-code",
      "mimocode",
      "opencode",
      "grok",
      "antigravity",
      "copilot",
      "qoder",
    ]);
    expect(output.statuses.every((item) => item.result.installed === false)).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes hidden experimental targets only when install-all opts in", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    enableExperimentalPatchEnv();
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main([
      "install",
      "--all",
      "--include-experimental",
      "--dry-run",
      "--compose-existing",
    ]);

    const output = JSON.parse(stdout.join("")) as {
      ok: boolean;
      include_experimental: boolean;
      next_command: string;
      would_install: Array<{ target: string; result: { experimental?: boolean } }>;
      skipped_conflict: Array<{
        target: string;
        reason: string;
        result?: { failure_kind?: string; experimental?: boolean };
      }>;
      failed_rollback: unknown[];
    };
    expect(output.ok).toBe(true);
    expect(output.include_experimental).toBe(true);
    expect(output.next_command).toBe(
      "waitspin status --all --include-experimental",
    );
    expect(output.would_install.map((item) => item.target)).toEqual([
      "vscode",
      "claude-code",
      "mimocode",
      "opencode",
      "grok",
      "antigravity",
      "copilot",
      "qoder",
      "cline",
      "kimi",
      "mmx",
    ]);
    expect(
      output.would_install
        .filter((item) =>
          [
            "grok",
            "cline",
            "kimi",
            "mmx",
          ].includes(item.target),
        )
        .every((item) => item.result.experimental === true),
    ).toBe(true);
    expect(output.skipped_conflict).toEqual([
      expect.objectContaining({
        target: "kilo",
        reason: expect.stringContaining(
          "private TUI slot runtime is not exposed to external plugins",
        ),
        result: expect.objectContaining({
          experimental: true,
          failure_kind: "unsupported_native_cli",
        }),
      }),
    ]);
    expect(execFile).toHaveBeenCalledWith(
      "cline",
      ["version"],
      expect.objectContaining({ timeout: 5_000 }),
      expect.any(Function),
    );
    expect(output.failed_rollback).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-dry-run install-all with hidden experimental targets", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);

    await expect(
      main(["install", "--all", "--include-experimental"]),
    ).rejects.toThrow(/only available with install --all --dry-run/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("installs a hidden experimental patch target without printing the API key", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    enableExperimentalPatchEnv();
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main([
      "grok",
      "install",
      "--api-key",
      "wts_live_test_key_value_1234567890",
    ]);

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { target: string };
    const outputText = stdout.join("");
    const output = JSON.parse(outputText) as {
      target: string;
      experimental: boolean;
      publisher_registered: boolean;
      api_key_present: boolean;
      patch_file: string;
    };
    const patchedWrite = (writeFile as jest.Mock).mock.calls.find((call) =>
      String(call[1]).includes("waitspin:experimental-runtime:start"),
    );
    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("grok-runtime.mjs"),
    );
    const stateWriteIndexes = (writeFile as jest.Mock).mock.calls
      .map((call, index) => [call, index] as const)
      .filter(([call]) => String(call[0]).includes("grok-install.json"));
    const firstRegisterOrder = fetchMock.mock.invocationCallOrder[0];

    expect(registerBody.target).toBe("grok");
    expect(output).toMatchObject({
      target: "grok",
      experimental: true,
      publisher_registered: true,
      api_key_present: true,
      patch_file: experimentalPatchPaths.grok,
    });
    expect(outputText).not.toContain("wts_live_test_key_value_1234567890");
    expect(patchedWrite?.[1]).toContain("__waitspinSponsoredLine");
    expect(patchedWrite?.[1]).toContain("getBuiltinModule");
    expect(patchedWrite?.[1]).toContain("node:crypto");
    expect(patchedWrite?.[1]).toContain("__waitspinRuntimeHashMatches");
    expect(patchedWrite?.[1]).toContain("__waitspinReadCachedLine");
    expect(patchedWrite?.[1]).toContain("__waitspinStartRefresh");
    expect(patchedWrite?.[1]).toContain("--mark-shown");
    expect(patchedWrite?.[1]).toContain("const __waitspinSpawn");
    expect(patchedWrite?.[1]).toContain('stdio: "ignore"');
    expect(patchedWrite?.[1]).toContain("runtime_hash");
    expect(patchedWrite?.[1]).toContain("WAITSPIN_HEARTBEAT_PATH");
    expect(patchedWrite?.[1]).toContain('process.pid + ".heartbeat"');
    expect(patchedWrite?.[1]).toContain("__waitspinCachedAt = Date.now();");
    expect(patchedWrite?.[1]).toContain("__waitspinCachedLine");
    expect(patchedWrite?.[1]).not.toContain("...process.env");
    const syncExecName = ["exec", "File", "Sync"].join("");
    expect(patchedWrite?.[1]).not.toContain(syncExecName);
    expect(patchedWrite?.[1]).not.toContain(["timeout", "3500"].join(": "));
    expect(runtimeWrite?.[1]).toContain("--impression-tick");
    expect(runtimeWrite?.[1]).toContain("--mark-shown");
    expect(runtimeWrite?.[1]).toContain("async function markShown()");
    expect(runtimeWrite?.[1]).toContain("shownHeartbeatPath");
    expect(runtimeWrite?.[1]).toContain("serve.shownHeartbeatPath = heartbeatPath");
    expect(runtimeWrite?.[1]).toContain(
      "serve.shownHeartbeatPath !== heartbeatPath",
    );
    expect(runtimeWrite?.[1]).toContain("fetchedAt: Date.now()");
    expect(runtimeWrite?.[1]).toContain("shownAt: 0");
    expect(runtimeWrite?.[1]).toContain(
      "serve.impressionRecorded || !serve.shownAt",
    );
    expect(runtimeWrite?.[1]).toContain("heartbeatAlive");
    expect(runtimeWrite?.[1]).toContain("allowedBaseUrl");
    expect(runtimeWrite?.[1]).toContain("PRODUCTION_API_ORIGIN");
    expect(runtimeWrite?.[1]).toContain(
      'import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";',
    );
    expect(runtimeWrite?.[1]).toContain("await chmod(filePath, 0o600);");
    expect(runtimeWrite?.[1]).toContain("cache.uninstalling === true");
    expect(runtimeWrite?.[1]).toContain("recordForegroundImpression");
    expect(runtimeWrite?.[1]).toContain(
      "cache.impressionTickHeartbeatPath !== heartbeatPath",
    );
    expect(runtimeWrite?.[1]).toContain("clearInactiveOwnedServe");
    expect(runtimeWrite?.[1]).toContain(
      "if (!Number.isFinite(pid) || pid <= 0) return false;",
    );
    expect(runtimeWrite?.[1]).toContain("env: {");
    expect(stateWriteIndexes).toHaveLength(2);
    for (const [call] of stateWriteIndexes) {
      expect(call[2]).toMatchObject({ mode: 0o600 });
      expect(JSON.parse(String(call[1]))).toHaveProperty("runtime_hash");
    }
    expect(firstRegisterOrder).toBeGreaterThan(
      (writeFile as jest.Mock).mock.invocationCallOrder[stateWriteIndexes[0][1]],
    );
    expect(firstRegisterOrder).toBeLessThan(
      (writeFile as jest.Mock).mock.invocationCallOrder[stateWriteIndexes[1][1]],
    );
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining(experimentalPatchPaths.grok),
      experimentalPatchPaths.grok,
    );
  });

  it("requires explicit opt-in for hidden experimental patch-file overrides", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;

    await expect(main(["grok", "install", "--dry-run"])).rejects.toThrow(
      /WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE=1/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalledWith(experimentalPatchPaths.grok);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("confines hidden experimental patch-file overrides to local roots", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const outsidePath = path.join(
      path.parse(os.homedir()).root,
      "usr",
      "local",
      "waitspin-grok-app.tsx",
    );
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = outsidePath;

    await expect(main(["grok", "install", "--dry-run"])).rejects.toThrow(
      /current working directory, HOME, or TMPDIR/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalledWith(outsidePath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects symlinked hidden experimental patch-file overrides outside local roots", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const symlinkPath = path.join(os.tmpdir(), "waitspin-grok-symlink.tsx");
    const outsideRealPath = path.join(
      path.parse(os.homedir()).root,
      "usr",
      "local",
      "waitspin-grok-real.tsx",
    );
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = symlinkPath;
    realpathSync.mockImplementation((filePath: string) =>
      filePath === symlinkPath ? outsideRealPath : filePath,
    );

    await expect(main(["grok", "install", "--dry-run"])).rejects.toThrow(
      /current working directory, HOME, or TMPDIR/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalledWith(symlinkPath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not treat filesystem root cwd as an experimental patch override sandbox", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const originalCwd = process.cwd;
    const outsidePath = path.join(
      path.parse(os.homedir()).root,
      "usr",
      "local",
      "waitspin-grok-root-cwd.tsx",
    );
    process.cwd = jest.fn(() => path.parse(os.homedir()).root);
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = outsidePath;

    try {
      await expect(main(["grok", "install", "--dry-run"])).rejects.toThrow(
        /current working directory, HOME, or TMPDIR/,
      );
    } finally {
      process.cwd = originalCwd;
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalledWith(outsidePath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("dry-runs unsupported experimental layouts without registering a publisher", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const unsupportedPath = path.join(os.tmpdir(), "waitspin-grok-unsupported.ts");
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = unsupportedPath;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === unsupportedPath) return "console.log('no anchor');";
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "install", "--dry-run"]);

    const output = JSON.parse(stdout.join("")) as {
      would_fail: boolean;
      failure_kind: string;
      patch_supported: boolean;
    };
    expect(output).toMatchObject({
      would_fail: true,
      failure_kind: "unsupported_patch_layout",
      patch_supported: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("explains standalone Cline CLI native-layout support instead of generic patch failure", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["cline", "install", "--dry-run"]);
    await main(["cline", "status"]);

    const [installOutput, statusOutput] = stdout
      .join("")
      .trim()
      .split(/\n(?=\{)/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(installOutput).toMatchObject({
      target: "cline",
      dry_run: true,
      would_fail: true,
      failure_kind: "unsupported_native_cli",
    });
    expect(String(installOutput.human_message)).toContain(
      "waitspin extension install --target vscode",
    );
    expect(String(installOutput.human_message)).toContain(
      "official statusline/plugin support",
    );
    expect(statusOutput).toMatchObject({
      target: "cline",
      installed: false,
      unsupported_reason: "unsupported_native_cli",
      fallback_target: "vscode",
      fallback_command: "waitspin extension install --target vscode",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("keeps Kilo CLI hidden and fail-closed until external footer slots are stable", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    execFile.mockImplementation((_file, args, _options, callback) => {
      if (Array.isArray(args) && args[0] === "--version") {
        callback(null, "7.3.54\n", "");
        return;
      }
      callback(null, "2.1.152 (Claude Code)\n", "");
    });

    await main(["kilo", "install", "--dry-run"]);
    await main(["kilo", "status"]);

    const [installOutput, statusOutput] = stdout
      .join("")
      .trim()
      .split(/\n(?=\{)/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(installOutput).toMatchObject({
      target: "kilo",
      experimental: true,
      hidden_until_accepted: true,
      public_support: false,
      dry_run: true,
      target_version: "7.3.54",
      would_fail: true,
      failure_kind: "unsupported_native_cli",
      patch_supported: false,
    });
    expect(String(installOutput.human_message)).toContain(
      "private TUI slot runtime is not exposed to external plugins",
    );
    expect(statusOutput).toMatchObject({
      target: "kilo",
      installed: false,
      unsupported_reason: "unsupported_native_cli",
    });
    expect(String(statusOutput.human_message)).toContain(
      "stable footer/status plugin surface",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("fails closed on ambiguous experimental patch anchors", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const ambiguousPath = path.join(os.tmpdir(), "waitspin-grok-ambiguous.js");
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = ambiguousPath;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === ambiguousPath) {
        return [
          '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })',
          '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })',
        ].join("\n");
      }
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "install", "--dry-run"]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      would_fail: true,
      failure_kind: "ambiguous_patch_anchor",
      patch_supported: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("recognizes the compiled Grok OpenTUI footer anchor", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const compiledGrokPath = path.join(os.tmpdir(), "waitspin-grok-app.js");
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = compiledGrokPath;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === compiledGrokPath) {
        return '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })';
      }
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "install", "--dry-run"]);

    const output = JSON.parse(stdout.join("")) as {
      patch_supported: boolean;
      patch_anchor: string;
      would_patch: string;
    };
    expect(output).toMatchObject({
      patch_supported: true,
      patch_anchor: "grok-open-tui-compiled-cwd-footer",
      would_patch: "grok-open-tui-compiled-cwd-footer",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the correct npm scope path for Cline platform package discovery", () => {
    const { readFileSync } =
      jest.requireActual<typeof import("node:fs")>("node:fs");
    const source = readFileSync(
      path.join(
        process.cwd(),
        "packages",
        "waitspin",
        "src",
        "targets",
        "experimental-cli.ts",
      ),
      "utf8",
    );

    expect(source).toContain('path.join(current, "@cline",');
    const invalidScopeSegment = [`"`, " ", "@cline", `"`].join("");
    expect(source).not.toContain(invalidScopeSegment);
  });

  it("resolves Windows npm cmd shims that target package node_modules", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    const npmPrefix = path.join(os.tmpdir(), "waitspin-npm-prefix");
    const cmdShimPath = path.join(npmPrefix, "grok.cmd");
    const packageRoot = path.join(npmPrefix, "node_modules", "grok-cli");
    const targetPath = path.join(packageRoot, "dist", "ui", "app.js");
    execFile.mockImplementation((file, args, _options, callback) => {
      const command = Array.isArray(args) ? String(args.at(-1) || "") : "";
      if (file === "cmd.exe" && command === "where grok") {
        callback(null, `${cmdShimPath}\r\n`, "");
        return;
      }
      if (file === "cmd.exe" && command === "grok --version") {
        callback(null, "grok 1.0.0\n", "");
        return;
      }
      callback(new Error(`unexpected execFile: ${file} ${command}`), "", "");
    });
    statSync.mockImplementation((filePath: string) => {
      if (filePath === path.join(packageRoot, "package.json")) return {};
      throw enoent();
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === cmdShimPath) {
        return [
          "@ECHO off",
          `"%dp0%\\node_modules\\grok-cli\\dist\\ui\\app.js" %*`,
        ].join("\r\n");
      }
      if (filePath === targetPath) {
        return '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })';
      }
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    try {
      await main(["grok", "install", "--dry-run"]);
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }

    const output = JSON.parse(stdout.join("")) as {
      patch_supported: boolean;
      patch_file: string;
    };
    expect(output.patch_supported).toBe(true);
    expect(output.patch_file).toBe(targetPath);
    expect(execFile).toHaveBeenCalledWith(
      "cmd.exe",
      expect.arrayContaining(["/d", "/s", "/c"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("preserves compiled directive prologues when injecting the helper", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const compiledGrokPath = path.join(os.tmpdir(), "waitspin-grok-strict.js");
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = compiledGrokPath;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === compiledGrokPath) {
        return [
          '"use strict";',
          '_jsx("text", { fg: t.textDim, children: agent.getCwd().replace(os.homedir(), "~") })',
        ].join("\n");
      }
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await main([
      "grok",
      "install",
      "--api-key",
      "wts_live_test_key_value_1234567890",
    ]);

    const patchedWrite = (writeFile as jest.Mock).mock.calls.find(
      (call) =>
        String(call[0]).startsWith(`${compiledGrokPath}.`) &&
        String(call[1]).includes("waitspin:experimental-runtime:start"),
    );
    expect(String(patchedWrite?.[1])).toMatch(
      /^"use strict";\n\/\* waitspin:experimental-runtime:start \*\//,
    );
  });

  it("preserves the original backup path when reinstalling an already managed experimental target", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const previousBackupPath = path.join(
      os.homedir(),
      ".waitspin",
      "backups",
      "grok-original.bak",
    );
    const state = {
      target: "grok",
      install_id: "wins_grok_existing",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.homedir(), ".waitspin", "grok-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "originalhash",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: previousBackupPath,
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === experimentalPatchPaths.grok) {
        return [
          "/* waitspin:experimental-runtime:start */",
          "function __waitspinSponsoredLine() { return ''; }",
          "/* waitspin:experimental-runtime:end */",
        ].join("\n");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main([
      "grok",
      "install",
      "--api-key",
      "wts_live_test_key_value_1234567890",
    ]);

    const output = JSON.parse(stdout.join("")) as {
      backup_path: string;
      patch_anchor: string;
    };
    expect(output.patch_anchor).toBe("already-managed");
    expect(output.backup_path).toBe(previousBackupPath);
  });

  it("rolls back the previous experimental runtime when reinstall registration fails", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const previousBackupPath = path.join(
      os.homedir(),
      ".waitspin",
      "backups",
      "grok-original.bak",
    );
    const previousRuntimePath = path.join(
      os.homedir(),
      ".waitspin",
      "grok-runtime.mjs",
    );
    const previousRuntimeSource = "console.log('old runtime');\n";
    const state = {
      target: "grok",
      install_id: "wins_grok_existing",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: previousRuntimePath,
      runtime_hash: "old-runtime-hash",
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "originalhash",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: previousBackupPath,
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === previousRuntimePath) return previousRuntimeSource;
      if (filePath === experimentalPatchPaths.grok) {
        return [
          "/* waitspin:experimental-runtime:start */",
          "function __waitspinSponsoredLine() { return ''; }",
          "/* waitspin:experimental-runtime:end */",
        ].join("\n");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid" }),
    });

    await expect(
      main([
        "grok",
        "install",
        "--api-key",
        "wts_live_test_key_value_1234567890",
      ]),
    ).rejects.toThrow(/HTTP 401/);

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`${previousRuntimePath}.`),
      previousRuntimeSource,
      expect.objectContaining({ mode: 0o755 }),
    );
    const restoredStateWrite = (writeFile as jest.Mock).mock.calls.find(
      (call) =>
        String(call[0]).startsWith(`${experimentalStatePaths.grok}.`) &&
        String(call[1]).includes('"runtime_hash": "old-runtime-hash"'),
    );
    expect(restoredStateWrite).toBeTruthy();
  });

  it("refuses orphaned experimental managed patches without existing state", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = experimentalPatchPaths.grok;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) throw enoent();
      if (filePath === experimentalPatchPaths.grok) {
        return [
          "/* waitspin:experimental-runtime:start */",
          "function __waitspinSponsoredLine() { return ''; }",
          "/* waitspin:experimental-runtime:end */",
        ].join("\n");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "install", "--dry-run"]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      would_fail: true,
      failure_kind: "orphaned_managed_patch",
      patch_supported: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast and rolls back unsupported experimental non-dry-run installs before registration", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const unsupportedPath = path.join(os.tmpdir(), "waitspin-grok-unsupported.ts");
    process.env.WAITSPIN_ALLOW_EXPERIMENTAL_PATCH_FILE = "1";
    process.env.WAITSPIN_GROK_PATCH_FILE = unsupportedPath;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === unsupportedPath) return "console.log('no anchor');";
      if (filePath === experimentalStatePaths.grok) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      main([
        "grok",
        "install",
        "--api-key",
        "wts_live_test_key_value_1234567890",
      ]),
    ).rejects.toThrow(/unsupported_patch_layout/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("reports and dry-runs uninstall for hidden experimental managed state", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const state = {
      target: "grok",
      install_id: "wins_grok",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.homedir(), ".waitspin", "grok-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "abc123",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: path.join(os.homedir(), ".waitspin", "backups", "grok-abc123.bak"),
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === experimentalPatchPaths.grok) {
        return [
          "/* waitspin:experimental-runtime:start */",
          "function __waitspinSponsoredLine() { return ''; }",
          "/* waitspin:experimental-runtime:end */",
        ].join("\n");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "status"]);
    await main(["grok", "uninstall", "--dry-run"]);

    const [statusOutput, uninstallOutput] = stdout
      .join("")
      .trim()
      .split(/\n(?=\{)/)
      .map((chunk) => JSON.parse(chunk));
    expect(statusOutput).toMatchObject({
      target: "grok",
      installed: true,
      publisher_registered: true,
      patch_installed: true,
    });
    expect(uninstallOutput).toMatchObject({
      target: "grok",
      dry_run: true,
      would_restore: experimentalPatchPaths.grok,
      backup_available: true,
    });
  });

  it("reports corrupted hidden experimental state as not installed", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) {
        return JSON.stringify({ target: "grok", install_id: "wins_grok" });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "status"]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "grok",
      installed: false,
      publisher_registered: false,
    });
  });

  it("reports unsafe experimental status paths as not installed", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const state = {
      target: "grok",
      install_id: "wins_grok",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.tmpdir(), "unexpected-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "abc123",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: path.join(os.homedir(), ".waitspin", "backups", "grok-abc123.bak"),
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "status"]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "grok",
      installed: false,
      status_invalid_reason: expect.stringContaining("runtime"),
    });
  });

  it("reports corrupted experimental managed patches as not installed", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const state = {
      target: "grok",
      install_id: "wins_grok",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.homedir(), ".waitspin", "grok-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "abc123",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: path.join(os.homedir(), ".waitspin", "backups", "grok-abc123.bak"),
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === experimentalPatchPaths.grok) {
        return "/* waitspin:experimental-runtime:start */broken";
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "status"]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "grok",
      installed: false,
      patch_installed: false,
      patch_invalid_reason: expect.stringContaining("missing end marker"),
    });
  });

  it("skips restore when the experimental target file no longer has the managed patch", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const backupPath = path.join(
      os.homedir(),
      ".waitspin",
      "backups",
      "grok-abc123.bak",
    );
    const state = {
      target: "grok",
      install_id: "wins_grok",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.homedir(), ".waitspin", "grok-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "abc123",
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: backupPath,
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === state.cache_path) {
        return JSON.stringify({ activeServe: { serveId: "wss_test" } });
      }
      if (filePath === experimentalPatchPaths.grok) return "console.log('upgraded');";
      if (filePath === backupPath) return "console.log('old');";
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "uninstall"]);

    const output = JSON.parse(stdout.join("")) as { restored: boolean };
    const sentinelWrite = (writeFile as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes(state.cache_path),
    );
    expect(output.restored).toBe(false);
    expect(sentinelWrite?.[1]).toContain('"uninstalling": true');
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining(experimentalPatchPaths.grok),
      expect.any(String),
      expect.anything(),
    );
    expect(rm).toHaveBeenCalledWith(experimentalStatePaths.grok, {
      force: true,
      recursive: true,
    });
  });

  it("skips restore when the experimental target file changes during restore", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const backupPath = path.join(
      os.homedir(),
      ".waitspin",
      "backups",
      "grok-abc123.bak",
    );
    const firstPatchedSource = [
      "/* waitspin:experimental-runtime:start */",
      "const line = __waitspinSponsoredLine();",
      "/* waitspin:experimental-runtime:end */",
    ].join("\n");
    const changedPatchedSource = `${firstPatchedSource}\nconsole.log('package update');`;
    const state = {
      target: "grok",
      install_id: "wins_grok",
      publisher_id: "wpub_grok",
      publisher_target: "grok",
      base_url: "https://api.waitspin.com",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: path.join(os.homedir(), ".waitspin", "grok-runtime.mjs"),
      cache_path: path.join(os.homedir(), ".waitspin", "grok-statusline-cache.json"),
      state_path: experimentalStatePaths.grok,
      target_version: "grok 1.0.0",
      install_path: path.dirname(experimentalPatchPaths.grok),
      patch_file: experimentalPatchPaths.grok,
      patch_hash: "abc123",
      patched_hash: sha256(firstPatchedSource),
      patch_anchor: "grok-open-tui-cwd-footer",
      backup_path: backupPath,
      installed_at: "2026-06-17T00:00:00.000Z",
    };
    let patchReadCount = 0;
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === experimentalStatePaths.grok) return JSON.stringify(state);
      if (filePath === state.cache_path) return JSON.stringify({});
      if (filePath === experimentalPatchPaths.grok) {
        patchReadCount += 1;
        return patchReadCount === 1 ? firstPatchedSource : changedPatchedSource;
      }
      if (filePath === backupPath) return "console.log('old');";
      throw new Error(`unexpected read: ${filePath}`);
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["grok", "uninstall"]);

    const output = JSON.parse(stdout.join("")) as {
      restored: boolean;
      manual_recovery_required: boolean;
      removed: string[];
    };
    expect(output.restored).toBe(false);
    expect(output.manual_recovery_required).toBe(true);
    expect(output.removed).toEqual([]);
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining(experimentalPatchPaths.grok),
      expect.any(String),
      expect.anything(),
    );
  });

  it("rejects deferred native Claude/Codex patch targets", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));

    await expect(
      runExtensionInstall(
        new Map<string, string[]>([
          ["target", ["codex"]],
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow(/support --target vscode only/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails closed before sending credentials to non-production API origins", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);

    await expect(
      main([
        "bids",
        "list",
        "--base-url",
        "https://collector.example",
        "--api-key",
        "wts_live_test_key_value_1234567890",
      ]),
    ).rejects.toThrow(/Refusing to send WaitSpin credentials/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows credentialed loopback API origins only with explicit dev opt-in", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ campaigns: [] }),
    });

    await main([
      "bids",
      "list",
      "--base-url",
      "http://127.0.0.1:8787",
      "--api-key",
      "wts_live_test_key_value_1234567890",
      "--allow-dev-api-base",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/campaigns",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer wts_live_test_key_value_1234567890",
        },
      }),
    );
    expect(JSON.parse(stdout.join(""))).toEqual({
      ok: true,
      campaigns: [],
    });

    fetchMock.mockClear();
    await expect(
      main([
        "bids",
        "list",
        "--base-url",
        "https://collector.example",
        "--api-key",
        "wts_live_test_key_value_1234567890",
        "--allow-dev-api-base",
      ]),
    ).rejects.toThrow(/Refusing to send WaitSpin credentials/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves packaged extension assets by default instead of checkout cwd", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    const repoRoot = process.cwd();
    const originalArgv = process.argv;
    process.argv = [
      originalArgv[0] || "node",
      path.join(repoRoot, "packages/waitspin/dist/cli.js"),
    ];
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    try {
      await runExtensionInstall(
        new Map<string, string[]>([
          ["base-url", ["https://api.waitspin.com"]],
          ["dry-run", ["true"]],
        ]),
      );
    } finally {
      process.argv = originalArgv;
    }

    const packagedManifest = path.join(
      repoRoot,
      "packages/waitspin/assets/waitspin-vscode/package.json",
    );
    const checkoutManifest = path.join(
      repoRoot,
      "extensions/waitspin-vscode/package.json",
    );
    expect(access).toHaveBeenCalledWith(packagedManifest, 0);
    expect(access).not.toHaveBeenCalledWith(checkoutManifest, 0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      dry_run: true,
      source: path.join(repoRoot, "packages/waitspin/assets/waitspin-vscode"),
    });
  });

  it("requires explicit dev opt-in before using checkout extension assets", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    const repoRoot = process.cwd();
    const originalArgv = process.argv;
    process.argv = [
      originalArgv[0] || "node",
      path.join(repoRoot, "packages/waitspin/dist/cli.js"),
    ];
    const packagedManifest = path.join(
      repoRoot,
      "packages/waitspin/assets/waitspin-vscode/package.json",
    );
    const checkoutManifest = path.join(
      repoRoot,
      "extensions/waitspin-vscode/package.json",
    );
    access.mockImplementation(async (filePath: string) => {
      if (filePath === packagedManifest) {
        throw new Error("missing packaged asset");
      }
      return undefined;
    });

    try {
      await expect(
        runExtensionInstall(
          new Map<string, string[]>([
            ["base-url", ["https://api.waitspin.com"]],
            ["dry-run", ["true"]],
          ]),
        ),
      ).rejects.toThrow(/extension package not found/i);
      expect(access).not.toHaveBeenCalledWith(checkoutManifest, 0);

      jest.clearAllMocks();
      access.mockImplementation(async (filePath: string) => {
        if (filePath === packagedManifest) {
          throw new Error("missing packaged asset");
        }
        return undefined;
      });
      const stdout: string[] = [];
      jest
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          stdout.push(String(chunk));
          return true;
        });

      await runExtensionInstall(
        new Map<string, string[]>([
          ["base-url", ["https://api.waitspin.com"]],
          ["dry-run", ["true"]],
          ["allow-dev-extension-assets", ["true"]],
        ]),
      );

      expect(access).toHaveBeenCalledWith(checkoutManifest, 0);
      expect(JSON.parse(stdout.join(""))).toMatchObject({
        dry_run: true,
        source: path.join(repoRoot, "extensions/waitspin-vscode"),
      });
    } finally {
      process.argv = originalArgv;
    }
  });

  it("validates packaged extension manifest identity before installing", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath.endsWith("package.json")) {
        return JSON.stringify({
          name: "../waitspin-vscode",
          publisher: "waitspin",
          version: "0.1.3",
        });
      }
      if (filePath === statePath) {
        throw new Error("ENOENT");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      runExtensionInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow(/Unexpected WaitSpin VS Code extension manifest/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
  });

  it("defaults extension install to the VS Code fallback", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await runExtensionInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { target: string };
    expect(body.target).toBe("status-bar-fallback");
    const output = JSON.parse(stdout.join("")) as {
      extension_installed: boolean;
      publisher_registered: boolean;
    };
    expect(output.publisher_registered).toBe(true);
    expect(output.extension_installed).toBe(true);
    expect(cp).toHaveBeenCalled();
  });

  it("registers the publisher and installs the VS Code extension runtime", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await runExtensionInstall(
      new Map<string, string[]>([
        ["target", ["vscode"]],
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.waitspin.com/v1/publishers/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer wts_live_test_key_value_1234567890",
        }),
      }),
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { install_id: string; target: string };
    expect(body.target).toBe("status-bar-fallback");
    expect(body.install_id).toMatch(/^wins_[a-f0-9]{32}$/);

    expect(writeFile).toHaveBeenCalledWith(
      statePath,
      expect.stringContaining(body.install_id),
      "utf8",
    );
    expect(cp).toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      expect.stringContaining(
        path.join(".vscode", "extensions", "waitspin.waitspin-vscode-0.1.3"),
      ),
      { force: true },
    );
    expect(cp).toHaveBeenCalledWith(
      expect.stringContaining("out"),
      expect.stringContaining(
        path.join(
          ".vscode",
          "extensions",
          "waitspin.waitspin-vscode-0.1.3",
          "out",
        ),
      ),
      { recursive: true, force: true },
    );
    expect(cp).toHaveBeenCalledWith(
      expect.stringContaining("media"),
      expect.stringContaining(
        path.join(
          ".vscode",
          "extensions",
          "waitspin.waitspin-vscode-0.1.3",
          "media",
        ),
      ),
      { recursive: true, force: true },
    );

    const output = JSON.parse(stdout.join("")) as {
      install_id: string;
      publisher_id: string;
      publisher_registered: boolean;
      extension_installed: boolean;
      installed_extension_path: string;
      next: {
        create_publisher_key: string;
        set_vscode_settings: Record<string, string>;
        credential_storage: string;
        optional_bootstrap_env: Record<string, string>;
      };
    };
    expect(output.publisher_registered).toBe(true);
    expect(output.extension_installed).toBe(true);
    expect(output.installed_extension_path).toContain(
      path.join(".vscode", "extensions", "waitspin.waitspin-vscode-0.1.3"),
    );
    expect(output.publisher_id).toBe("wpub_test");
    expect(output.install_id).toBe(body.install_id);
    expect(output.next.create_publisher_key).toContain(
      "--key-profile publisher-extension",
    );
    expect(output.next.set_vscode_settings).toEqual({
      "waitspin.installId": body.install_id,
    });
    expect(output.next.credential_storage).toContain("SecretStorage");
    expect(output.next.optional_bootstrap_env).toEqual({
      WAITSPIN_INSTALL_ID: body.install_id,
    });
    expect(JSON.stringify(output.next)).not.toContain("WAITSPIN_API_KEY");
  });

  it("validates VS Code media assets before publisher registration", async () => {
    const { runExtensionInstall: rawrunExtensionInstall } = await import("../cli");
    const runExtensionInstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionInstall(withJsonFlag(flags));
    access.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith(path.join("media", "waitspin-icon.png"))) {
        throw enoent();
      }
      return undefined;
    });

    await expect(
      runExtensionInstall(
        new Map<string, string[]>([
          ["target", ["vscode"]],
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow("extension marketplace icon missing");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
  });

  it("reports VS Code fallback lifecycle status from managed state", async () => {
    const { runExtensionStatus: rawrunExtensionStatus } = await import("../cli");
    const runExtensionStatus = (flags: Map<string, string[]> = new Map()) => rawrunExtensionStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === statePath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_id: "wpub_test",
          publisher_target: "status-bar-fallback",
        });
      }
      if (filePath === markerPath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_id: "wpub_test",
          publisher_target: "status-bar-fallback",
          extension: "waitspin-vscode",
          version: "0.1.3",
          installed_extension_path: installedPath,
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runExtensionStatus(new Map<string, string[]>());

    expect(access).toHaveBeenCalledWith(
      path.join(installedPath, "package.json"),
      0,
    );
    const output = JSON.parse(stdout.join("")) as {
      installed: boolean;
      mode: string;
      install_id: string;
      publisher_registered: boolean;
      installed_extension_path: string;
    };
    expect(output.installed).toBe(true);
    expect(output.mode).toBe("status-bar-fallback");
    expect(output.install_id).toBe("wins_existing");
    expect(output.publisher_registered).toBe(true);
    expect(output.installed_extension_path).toBe(installedPath);
  });

  it("reports degraded status instead of throwing on a corrupted install marker", async () => {
    const { runExtensionStatus: rawrunExtensionStatus } = await import("../cli");
    const runExtensionStatus = (flags: Map<string, string[]> = new Map()) => rawrunExtensionStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === statePath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_id: "wpub_test",
          publisher_target: "status-bar-fallback",
        });
      }
      if (filePath === markerPath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_target: "status-bar-fallback",
          installed_extension_path: "/tmp/not-managed-by-waitspin",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runExtensionStatus(new Map<string, string[]>());

    const output = JSON.parse(stdout.join("")) as {
      installed: boolean;
      installed_extension_path: string | null;
      install_marker_error: string | null;
    };
    expect(output.installed).toBe(false);
    expect(output.installed_extension_path).toBeNull();
    expect(output.install_marker_error).toBe("invalid_managed_extension_path");
    expect(access).not.toHaveBeenCalledWith(
      path.join("/tmp/not-managed-by-waitspin", "package.json"),
      0,
    );
  });

  it("uninstalls only the managed VS Code fallback runtime and local state", async () => {
    const { runExtensionUninstall: rawrunExtensionUninstall } = await import("../cli");
    const runExtensionUninstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === markerPath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_target: "status-bar-fallback",
          installed_extension_path: installedPath,
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runExtensionUninstall(new Map<string, string[]>());

    expect(rm).toHaveBeenCalledWith(installedPath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(statePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(markerPath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as {
      uninstalled: boolean;
      removed: string[];
    };
    expect(output.uninstalled).toBe(true);
    expect(output.removed).toEqual([installedPath, statePath, markerPath]);
  });

  it("uninstalls local state instead of throwing on a corrupted install marker", async () => {
    const { runExtensionUninstall: rawrunExtensionUninstall } = await import("../cli");
    const runExtensionUninstall = (flags: Map<string, string[]> = new Map()) => rawrunExtensionUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === markerPath) {
        return JSON.stringify({
          install_id: "wins_existing",
          publisher_target: "status-bar-fallback",
          installed_extension_path: "/tmp/not-managed-by-waitspin",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runExtensionUninstall(new Map<string, string[]>());

    expect(rm).not.toHaveBeenCalledWith(
      "/tmp/not-managed-by-waitspin",
      expect.anything(),
    );
    expect(rm).toHaveBeenCalledWith(statePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(markerPath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as {
      uninstalled: boolean;
      removed: string[];
      install_marker_error: string | null;
    };
    expect(output.uninstalled).toBe(true);
    expect(output.removed).toEqual([statePath, markerPath]);
    expect(output.install_marker_error).toBe("invalid_managed_extension_path");
  });

  it("installs Claude Code statusline support without writing secrets to Claude settings", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    expect(execFile).toHaveBeenCalledWith(
      "claude",
      ["--version"],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    );
    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { install_id: string; target: string };
    expect(registerBody.target).toBe("claude-code");

    expect(writeFile).toHaveBeenCalledWith(
      claudeRuntimePath,
      expect.stringContaining("/v1/serve/next"),
      expect.objectContaining({ mode: 0o755 }),
    );
    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeRuntimePath,
    );
    expect(runtimeWrite?.[1]).toContain("async function withCacheLock");
    expect(runtimeWrite?.[1]).toContain("await mkdir(lockPath)");
    expect(runtimeWrite?.[1]).toContain("renderedSession = await withCacheLock");
    expect(runtimeWrite?.[1]).toContain("child.stdout.destroy()");
    expect(runtimeWrite?.[1]).toContain('child.kill("SIGKILL")');
    expect(runtimeWrite?.[1]).toContain("child.unref?.()");
    expect(runtimeWrite?.[1]).toContain("expiresAtMs");
    expect(runtimeWrite?.[1]).toContain("function serveIsExpired");
    expect(runtimeWrite?.[1]).toContain("--impression-tick");
    expect(runtimeWrite?.[1]).toContain("heartbeatPathFor");
    expect(runtimeWrite?.[1]).toContain("heartbeatAlive");
    expect(runtimeWrite?.[1]).toContain("async function markShown");
    expect(runtimeWrite?.[1]).toContain("shownHeartbeatPath");
    expect(runtimeWrite?.[1]).toContain("serve.shownHeartbeatPath !== heartbeatPath");
    expect(runtimeWrite?.[1]).toContain("recordForegroundImpression");
    expect(runtimeWrite?.[1]).toContain("recordDelayedImpression");
    expect(runtimeWrite?.[1]).toContain("const lockedServe = lockedSession.activeServe");
    expect(runtimeWrite?.[1]).toContain("!serveIsExpired(lockedServe)");
    expect(runtimeWrite?.[1]).toContain("HEARTBEAT_IMPRESSION_FRESH_MS");
    expect(runtimeWrite?.[1]).toContain("waitForHeartbeatVisibleAfter");
    expect(runtimeWrite?.[1]).toContain(
      "const visibleAt = serve.shownAt + Math.max(serve.minVisibleMs || 5000, 5000)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "await waitForHeartbeatVisibleAfter(heartbeatPath, visibleAt)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "const lockedVisibleAt = lockedServe?.shownAt",
    );
    expect(runtimeWrite?.[1]).toContain(
      "await heartbeatVisibleAfter(heartbeatPath, lockedVisibleAt)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "await recordImpression(runtimeState, lockedSession);",
    );
    expect(runtimeWrite?.[1]).toContain("function safeSessionKey");
    expect(runtimeWrite?.[1]).toContain("await pruneSessions(state.cache_path, cache)");
    expect(runtimeWrite?.[1]).toContain("fetchedAt: Date.now()");
    expect(runtimeWrite?.[1]).toContain("shownAt: 0");
    expect(runtimeWrite?.[1]).toContain(
      "session.impressionTickHeartbeatPath === heartbeatPath",
    );
    expect(runtimeWrite?.[1]).toContain("const shouldFetchNext");
    expect(runtimeWrite?.[1]).toContain(
      "Date.now() - (session.lastFetchAt || 0) >= FETCH_INTERVAL_MS",
    );
    expect(runtimeWrite?.[1]).toContain(
      "session.activeServe.impressionRecorded",
    );
    expect(chmod).toHaveBeenCalledWith(claudeRuntimePath, 0o755);

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeStatePath,
    );
    expect(stateWrite).toBeTruthy();
    expect(JSON.parse(stateWrite[1])).toMatchObject({
      target: "claude-code",
      install_id: registerBody.install_id,
      publisher_target: "claude-code",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: claudeRuntimePath,
      cache_path: claudeCachePath,
    });
    expect(stateWrite[2]).toEqual(
      expect.objectContaining({ encoding: "utf8", mode: 0o600 }),
    );
    expect(chmod).toHaveBeenCalledWith(claudeStatePath, 0o600);

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeSettingsPath,
    );
    expect(settingsWrite).toBeTruthy();
    const settings = JSON.parse(settingsWrite[1]) as {
      statusLine: { command: string; refreshInterval: number };
    };
    expect(settings.statusLine.command).toContain(claudeRuntimePath);
    expect(settings.statusLine.command).toContain(claudeStatePath);
    expect(settings.statusLine.command).not.toContain(
      "wts_live_test_key_value_1234567890",
    );
    expect(settings.statusLine.refreshInterval).toBe(5);

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.publisher_registered).toBe(true);
    expect(output.publisher_target).toBe("claude-code");
    expect(output.api_key).toBeUndefined();
    expect(output.api_key_present).toBe(true);
  });

  it("installs MiMo Code statusline support with heartbeat-gated impressions", async () => {
    const { runMiMoCodeInstall: rawrunMiMoCodeInstall } = await import("../cli");
    const runMiMoCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunMiMoCodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await runMiMoCodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { install_id: string; target: string };
    expect(registerBody.target).toBe("mimocode");

    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === mimocodeRuntimePath,
    );
    expect(runtimeWrite?.[1]).toContain("/v1/serve/next");
    expect(runtimeWrite?.[1]).toContain("--impression-tick");
    expect(runtimeWrite?.[1]).toContain("heartbeatPathFor");
    expect(runtimeWrite?.[1]).toContain("heartbeatAlive");
    expect(runtimeWrite?.[1]).toContain("async function markShown");
    expect(runtimeWrite?.[1]).toContain("shownHeartbeatPath");
    expect(runtimeWrite?.[1]).toContain("serve.shownHeartbeatPath !== heartbeatPath");
    expect(runtimeWrite?.[1]).toContain("recordForegroundImpression");
    expect(runtimeWrite?.[1]).toContain("recordDelayedImpression");
    expect(runtimeWrite?.[1]).toContain("!serveIsExpired(cache.activeServe)");
    expect(runtimeWrite?.[1]).toContain("HEARTBEAT_IMPRESSION_FRESH_MS");
    expect(runtimeWrite?.[1]).toContain("waitForHeartbeatVisibleAfter");
    expect(runtimeWrite?.[1]).toContain(
      "const visibleAt = serve.shownAt + Math.max(serve.minVisibleMs || 5000, 5000)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "await waitForHeartbeatVisibleAfter(heartbeatPath, visibleAt)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "const activeVisibleAt = cache.activeServe?.shownAt",
    );
    expect(runtimeWrite?.[1]).toContain(
      "await heartbeatVisibleAfter(heartbeatPath, activeVisibleAt)",
    );
    expect(runtimeWrite?.[1]).toContain("await recordImpression(state, cache);");
    expect(runtimeWrite?.[1]).toContain("fetchedAt: Date.now()");
    expect(runtimeWrite?.[1]).toContain("shownAt: 0");
    expect(runtimeWrite?.[1]).toContain(
      "cache.impressionTickHeartbeatPath === heartbeatPath",
    );
    expect(runtimeWrite?.[2]).toEqual(
      expect.objectContaining({ encoding: "utf8", mode: 0o755 }),
    );
    expect(chmod).toHaveBeenCalledWith(mimocodeRuntimePath, 0o755);

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === mimocodeStatePath,
    );
    expect(stateWrite).toBeTruthy();
    expect(JSON.parse(stateWrite[1])).toMatchObject({
      target: "mimocode",
      install_id: registerBody.install_id,
      publisher_target: "mimocode",
      api_key: "wts_live_test_key_value_1234567890",
      runtime_path: mimocodeRuntimePath,
      cache_path: mimocodeCachePath,
      bashrc_path: mimocodeBashrcPath,
    });

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.publisher_registered).toBe(true);
    expect(output.publisher_target).toBe("mimocode");
    expect(output.api_key).toBeUndefined();
    expect(output.api_key_present).toBe(true);
  });

  it("generates a PowerShell-safe Claude Code statusline command on Windows", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    try {
      await runClaudeCodeInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      );
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeSettingsPath,
    );
    expect(settingsWrite).toBeTruthy();
    const settings = JSON.parse(settingsWrite[1]) as {
      statusLine: { command: string };
    };
    expect(settings.statusLine.command).toContain(
      "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command",
    );
    expect(settings.statusLine.command).toContain("& '");
    expect(settings.statusLine.command).toContain("--state '");
    expect(settings.statusLine.command).toContain(
      claudeRuntimePath.replace(/\\/g, "/"),
    );
    expect(settings.statusLine.command).toContain(
      claudeStatePath.replace(/\\/g, "/"),
    );
  });

  it("fails fast when Claude Code already has a non-managed statusline", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "custom-statusline" },
        });
      }
      if (filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      runClaudeCodeInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow(/already has a statusLine configured/);

    expect(execFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("dry-runs Claude Code install statusline conflicts without throwing", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "custom-statusline" },
        });
      }
      if (filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeInstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      dry_run: true,
      publisher_registered: false,
      has_existing_status_line: true,
      settings_action: "blocked",
      would_fail: true,
      next: "resolve_status_line_conflict",
      next_command: "waitspin claude-code install --compose-existing",
    });
    expect(String(output.settings_blocked_reason)).toContain(
      "already has a statusLine configured",
    );
    expect(execFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("explains production API mismatch when claude-code target is not deployed", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: "Validation error",
          details: [
            {
              path: ["target"],
              message: 'Invalid input: expected "status-bar-fallback"',
            },
          ],
        }),
    });

    await expect(
      runClaudeCodeInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
          ["compose-existing", ["true"]],
        ]),
      ),
    ).rejects.toThrow(
      /selected API base does not[\s\S]*waitspin claude-code install --compose-existing/,
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("reports the next install command when Claude Code status is not installed", async () => {
    const { runClaudeCodeStatus: rawrunClaudeCodeStatus } = await import("../cli");
    const runClaudeCodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeStatus();

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      installed: false,
      next: "install_claude_code",
      next_command: "waitspin claude-code install --compose-existing",
    });
  });

  it("composes and records an existing Claude Code command statusline explicitly", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: {
            type: "command",
            command: "ANTHROPIC_API_KEY=secret-token custom-statusline",
          },
        });
      }
      if (filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
        ["compose-existing", ["true"]],
      ]),
    );

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeStatePath,
    );
    expect(JSON.parse(stateWrite[1])).toMatchObject({
      previous_status_line: {
        type: "command",
        command: "ANTHROPIC_API_KEY=secret-token custom-statusline",
      },
      composed_existing_status_line: true,
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.has_previous_status_line).toBe(true);
    expect(output.previous_status_line).toBeUndefined();
    expect(output.managed_status_line).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain("secret-token");
    expect(JSON.stringify(output)).not.toContain("custom-statusline");
  });

  it("rolls back fresh Claude Code install state when settings write fails", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
    (writeFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath) {
        throw new Error("settings unwritable");
      }
      return undefined;
    });

    try {
      await expect(
        runClaudeCodeInstall(
          new Map<string, string[]>([
            ["api-key", ["wts_live_test_key_value_1234567890"]],
          ]),
        ),
      ).rejects.toThrow(/settings unwritable/);
    } finally {
      (writeFile as jest.Mock).mockImplementation(async () => undefined);
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      claudeStatePath,
      expect.stringContaining("wts_live_test_key_value_1234567890"),
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(rm).toHaveBeenCalledWith(claudeStatePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(claudeRuntimePath, {
      force: true,
      recursive: true,
    });
  });

  it("rolls back Claude Code install before writes when the version is unsupported", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    execFile.mockImplementationOnce((_file, _args, _options, callback) => {
      callback(null, "2.1.80 (Claude Code)\n", "");
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      runClaudeCodeInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow(/Unsupported Claude Code version/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("reports Claude Code status from managed runtime and settings", async () => {
    const { runClaudeCodeStatus: rawrunClaudeCodeStatus } = await import("../cli");
    const runClaudeCodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeStatus(withJsonFlag(flags));
    const managed = {
      type: "command",
      command: `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`,
      padding: 2,
      refreshInterval: 5,
    };
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: claudeRuntimePath,
          cache_path: claudeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({ statusLine: managed });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeStatus();

    expect(access).toHaveBeenCalledWith(claudeRuntimePath, 0);
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(true);
    expect(output.publisher_target).toBe("claude-code");
    expect(output.status_line_configured).toBe(true);
    expect(JSON.stringify(output)).not.toContain("wts_live_secret");
  });

  it("matches managed Claude Code statusline semantically when JSON key order differs", async () => {
    const { runClaudeCodeStatus: rawrunClaudeCodeStatus } = await import("../cli");
    const runClaudeCodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeStatus(withJsonFlag(flags));
    const command = `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`;
    const managed = {
      type: "command",
      command,
      padding: 2,
      refreshInterval: 5,
    };
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: claudeRuntimePath,
          cache_path: claudeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: {
            command,
            refreshInterval: 5,
            padding: 2,
            type: "command",
          },
        });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(true);
    expect(output.status_line_configured).toBe(true);
    expect(output.effective_status_line_configured).toBe(true);
  });

  it("reports a higher-priority Claude Code project statusline override", async () => {
    const { runClaudeCodeStatus: rawrunClaudeCodeStatus } = await import("../cli");
    const runClaudeCodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeStatus(withJsonFlag(flags));
    const managed = {
      type: "command",
      command: `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`,
      padding: 2,
      refreshInterval: 5,
    };
    const projectLocalSettingsPath = path.join(
      process.cwd(),
      ".claude",
      "settings.local.json",
    );
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: claudeRuntimePath,
          cache_path: claudeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({ statusLine: managed });
      }
      if (filePath === projectLocalSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "project-statusline" },
        });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(false);
    expect(output.status_line_configured).toBe(true);
    expect(output.effective_status_line_configured).toBe(false);
    expect(output.status_line_overridden).toBe(true);
    expect(output.status_line_override_scope).toBe("local");
    expect(output.status_line_override_path).toBe(projectLocalSettingsPath);
  });

  it("fails fast when current Claude Code project settings override user statusline", async () => {
    const { runClaudeCodeInstall: rawrunClaudeCodeInstall } = await import("../cli");
    const runClaudeCodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeInstall(withJsonFlag(flags));
    const projectLocalSettingsPath = path.join(
      process.cwd(),
      ".claude",
      "settings.local.json",
    );
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeSettingsPath || filePath === claudeStatePath) {
        throw enoent();
      }
      if (filePath === projectLocalSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "project-statusline" },
        });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      runClaudeCodeInstall(
        new Map<string, string[]>([
          ["api-key", ["wts_live_test_key_value_1234567890"]],
        ]),
      ),
    ).rejects.toThrow(/higher-priority statusLine/);

    expect(execFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("dry-runs Claude Code uninstall without validating destructive paths", async () => {
    const { runClaudeCodeUninstall: rawrunClaudeCodeUninstall } = await import("../cli");
    const runClaudeCodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeUninstall(withJsonFlag(flags));
    const managed = {
      type: "command",
      command: `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`,
      padding: 2,
      refreshInterval: 5,
    };
    const unsafeRuntimePath = "/tmp/not-waitspin-runtime.mjs";
    const unsafeCachePath = "/tmp/not-waitspin-cache.json";
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: unsafeRuntimePath,
          cache_path: unsafeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "user-edited-statusline" },
        });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeUninstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      dry_run: true,
      installed: true,
      settings_action: "skip-user-settings",
      path_validation: "deferred_until_apply",
    });
    expect(output.would_remove).toEqual([
      unsafeRuntimePath,
      unsafeCachePath,
      claudeStatePath,
      `${unsafeCachePath}.*.heartbeat`,
    ]);
    expect(String(output.settings_warning)).toContain(
      "leaving user settings unchanged",
    );
    expect(writeFile).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it("removes WaitSpin-managed Claude Code files when user settings changed before uninstall", async () => {
    const { runClaudeCodeUninstall: rawrunClaudeCodeUninstall } = await import("../cli");
    const runClaudeCodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeUninstall(withJsonFlag(flags));
    const managed = {
      type: "command",
      command: `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`,
      padding: 2,
      refreshInterval: 5,
    };
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: claudeRuntimePath,
          cache_path: claudeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "user-edited-statusline" },
        });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeUninstall(new Map<string, string[]>());

    expect(writeFile).not.toHaveBeenCalledWith(
      claudeSettingsPath,
      expect.anything(),
      expect.anything(),
    );
    expect(rm).toHaveBeenCalledWith(claudeRuntimePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(claudeCachePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(claudeStatePath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.settings_action).toBe("skip-user-settings");
    expect(String(output.settings_warning)).toContain(
      "leaving user settings unchanged",
    );
  });

  it("restores the previous Claude Code statusline on uninstall", async () => {
    const { runClaudeCodeUninstall: rawrunClaudeCodeUninstall } = await import("../cli");
    const runClaudeCodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunClaudeCodeUninstall(withJsonFlag(flags));
    const previous = { type: "command", command: "custom-statusline" };
    const managed = {
      type: "command",
      command: `'${process.execPath}' '${claudeRuntimePath}' --state '${claudeStatePath}'`,
      padding: 2,
      refreshInterval: 5,
    };
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === claudeStatePath) {
        return JSON.stringify({
          target: "claude-code",
          install_id: "wins_claude",
          publisher_id: "wpub_claude",
          publisher_target: "claude-code",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: claudeRuntimePath,
          cache_path: claudeCachePath,
          settings_path: claudeSettingsPath,
          managed_status_line: managed,
          previous_status_line: previous,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === claudeSettingsPath) {
        return JSON.stringify({ statusLine: managed, theme: "dark" });
      }
      if (isProjectClaudeSettingsPath(filePath)) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runClaudeCodeUninstall(new Map<string, string[]>());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === claudeSettingsPath,
    );
    expect(JSON.parse(settingsWrite[1])).toEqual({
      statusLine: previous,
      theme: "dark",
    });
    expect(rm).toHaveBeenCalledWith(claudeRuntimePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(claudeCachePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(claudeStatePath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.settings_action).toBe("restore-previous");
  });

  it("installs Qoder UserPromptSubmit hook support without exposing secrets", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const stdout: string[] = [];
    const testKey = "test_waitspin_publisher_extension_key";
    const previousReadFile = (readFile as jest.Mock).getMockImplementation();
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "existing-qoder-hook",
                    timeout: 9,
                    statusMessage: "Existing hook",
                  },
                ],
              },
            ],
          },
        });
      }
      return previousReadFile?.(filePath);
    });
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await main(["qoder", "install", "--api-key", testKey]);

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { target: string };
    const outputText = stdout.join("");
    const output = JSON.parse(outputText) as Record<string, unknown>;
    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderRuntimePath,
    );
    const secretWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderApiKeyPath,
    );
    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderStatePath,
    );
    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderSettingsPath,
    );
    const state = JSON.parse(String(stateWrite?.[1])) as Record<string, unknown>;
    const settings = JSON.parse(String(settingsWrite?.[1])) as {
      hooks: {
        Stop: Array<{ hooks: Array<Record<string, unknown>> }>;
        UserPromptSubmit: Array<{ hooks: Array<Record<string, unknown>> }>;
      };
    };
    const managedHook = settings.hooks.UserPromptSubmit[1].hooks[0];
    const managedStopHook = settings.hooks.Stop[0].hooks[0];

    expect(registerBody.target).toBe("qoder");
    expect(output).toMatchObject({
      target: "qoder",
      mode: "qoder-hook-system-message",
      publisher_registered: true,
      hook_events: ["UserPromptSubmit", "Stop"],
      hook_status_message: "WaitSpin sponsor check",
      qoder_version: "1.0.31",
      next_command: "qodercli",
    });
    expect(outputText).not.toContain(testKey);
    expect(secretWrite?.[1]).toBe(`${testKey}\n`);
    expect(secretWrite?.[2]).toMatchObject({ mode: 0o600 });
    expect(chmod).toHaveBeenCalledWith(qoderApiKeyPath, 0o600);
    expect(state).toMatchObject({
      target: "qoder",
      publisher_target: "qoder",
      api_key_path: qoderApiKeyPath,
      runtime_path: qoderRuntimePath,
      cache_path: qoderCachePath,
      settings_path: qoderSettingsPath,
    });
    expect(JSON.stringify(state)).not.toContain(testKey);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
      "existing-qoder-hook",
    );
    expect(managedHook).toMatchObject({
      type: "command",
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    });
    expect(managedStopHook).toMatchObject(managedHook);
    expect(String(managedHook.command)).toContain(qoderRuntimePath);
    expect(String(managedHook.command)).toContain(qoderStatePath);
    expect(JSON.stringify(settings)).not.toContain(testKey);
    expect(runtimeWrite?.[1]).toContain("/v1/serve/next");
    expect(runtimeWrite?.[1]).toContain("/v1/events/impression");
    expect(runtimeWrite?.[1]).toContain("systemMessage");
    expect(runtimeWrite?.[1]).toContain("Sponsored: ");
    expect(runtimeWrite?.[1]).toContain("UserPromptSubmit");
    expect(runtimeWrite?.[1]).toContain("sanitizeQoderHookInput");
    expect(runtimeWrite?.[1]).toContain("parseQoderHookInput");
    expect(runtimeWrite?.[1]).toContain("delete sanitized.prompt");
    expect(runtimeWrite?.[1]).toContain("delete sanitized.last_assistant_message");
    expect(runtimeWrite?.[1]).toContain("readJsonc");
    expect(runtimeWrite?.[1]).toContain("stripJsoncComments");
    expect(runtimeWrite?.[1]).toContain('createHash("sha256")');
    expect(runtimeWrite?.[1]).toContain("SHELL_PROCESS_NAMES");
    expect(runtimeWrite?.[1]).toContain("processInfo");
    expect(runtimeWrite?.[1]).toContain("isQoderProcess");
    expect(runtimeWrite?.[1]).toContain("detectOwnerPid");
    expect(runtimeWrite?.[1]).toContain("powershell.exe");
    expect(runtimeWrite?.[1]).toContain("process.kill(pid, 0)");
    expect(runtimeWrite?.[1]).toContain("recordVisibleImpressionFromHook");
    expect(runtimeWrite?.[1]).toContain("scheduleVisibleImpressionRetry");
    expect(runtimeWrite?.[1]).toContain('"--record-visible"');
    expect(runtimeWrite?.[1]).toContain('"--session-key"');
    expect(runtimeWrite?.[1]).toContain("env: { ...process.env }");
    expect(runtimeWrite?.[1]).toContain(
      'allowRetry: inputJson.hook_event_name === "Stop"',
    );
    expect(runtimeWrite?.[1]).toContain('hook_event_name !== "UserPromptSubmit"');
    expect(runtimeWrite?.[1]).toContain("systemMessage: \"Sponsored: \" + serve.line");
    expect(runtimeWrite?.[1]).toContain("function visibleImpressionCheckDelayMs");
    expect(runtimeWrite?.[1]).toContain(
      "Math.max(MAX_ACTIVE_AGE_MS - LOCK_RETRY_MS, 0)",
    );
    expect(runtimeWrite?.[1]).toContain(
      "Math.min(minVisibleMs, maxVisibleDelayMs) + LOCK_RETRY_MS",
    );
    expect(runtimeWrite?.[1]).toContain("sessionKeyValue: key");
    expect(runtimeWrite?.[1]).toContain("delayMs: visibleImpressionCheckDelayMs(serve)");
    expect(runtimeWrite?.[1]).toContain("installedSurfaceStillConfigured");
    expect(runtimeWrite?.[1]).not.toContain("--impression-tick");
    expect(runtimeWrite?.[1]).not.toContain(testKey);
  });

  it("restores the previous Qoder secret when settings write fails during refresh", async () => {
    const { main: rawMain } = await import("../cli");
    const main = (args: string[]) => rawMain([...args, "--json"]);
    const oldKey = "old_waitspin_publisher_extension_key";
    const newKey = "new_waitspin_publisher_extension_key";
    const oldRuntimeSource = "#!/usr/bin/env node\n// old qoder runtime\n";
    const managedHook = {
      type: "command",
      command: `'${process.execPath}' '${qoderRuntimePath}' --state '${qoderStatePath}'`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    const existingState = {
      target: "qoder",
      install_id: "wins_qoder_existing",
      publisher_id: "wpub_qoder_existing",
      publisher_target: "qoder",
      registered_at: "2026-06-26T00:00:00.000Z",
      base_url: "https://api.waitspin.com",
      api_key_path: qoderApiKeyPath,
      runtime_path: qoderRuntimePath,
      cache_path: qoderCachePath,
      settings_path: qoderSettingsPath,
      managed_hook: managedHook,
      qoder_version: "1.0.31",
      installed_at: "2026-06-26T00:00:00.000Z",
    };
    const existingSettings = {
      hooks: {
        Stop: [{ hooks: [managedHook] }],
        UserPromptSubmit: [{ hooks: [managedHook] }],
      },
    };
    const previousReadFile = (readFile as jest.Mock).getMockImplementation();
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) return JSON.stringify(existingState);
      if (filePath === qoderSettingsPath) return JSON.stringify(existingSettings);
      if (filePath === qoderApiKeyPath) return `${oldKey}\n`;
      if (filePath === qoderRuntimePath) return oldRuntimeSource;
      return previousReadFile?.(filePath);
    });
    let qoderSettingsWrites = 0;
    (writeFile as jest.Mock).mockImplementation(
      async (filePath: string, _value: unknown) => {
        if (filePath === qoderSettingsPath) {
          qoderSettingsWrites += 1;
          if (qoderSettingsWrites === 1) {
            throw new Error("settings write failed");
          }
        }
      },
    );

    await expect(main(["qoder", "install", "--api-key", newKey])).rejects.toThrow(
      "settings write failed",
    );

    const secretWrites = (writeFile as jest.Mock).mock.calls
      .filter(([filePath]) => filePath === qoderApiKeyPath)
      .map(([, value]) => value);
    expect(secretWrites).toEqual([`${newKey}\n`, `${oldKey}\n`]);
    const runtimeWrites = (writeFile as jest.Mock).mock.calls
      .filter(([filePath]) => filePath === qoderRuntimePath)
      .map(([, value]) => String(value));
    expect(runtimeWrites[0]).toContain("scheduleVisibleImpressionRetry");
    expect(runtimeWrites.at(-1)).toBe(oldRuntimeSource);
    const stateWrites = (writeFile as jest.Mock).mock.calls
      .filter(([filePath]) => filePath === qoderStatePath)
      .map(([, value]) => JSON.parse(String(value)) as Record<string, unknown>);
    expect(stateWrites.at(-1)).toMatchObject({
      install_id: "wins_qoder_existing",
      publisher_id: "wpub_qoder_existing",
    });
    const settingsWrites = (writeFile as jest.Mock).mock.calls
      .filter(([filePath]) => filePath === qoderSettingsPath)
      .map(([, value]) => JSON.parse(String(value)) as Record<string, unknown>);
    expect(settingsWrites.at(-1)).toEqual(existingSettings);
  });

  it("reports Qoder status from readable managed files and hook settings", async () => {
    const { runQoderStatus: rawRunQoderStatus } = await import("../cli");
    const runQoderStatus = (flags: Map<string, string[]> = new Map()) =>
      rawRunQoderStatus(withJsonFlag(flags));
    process.env.WAITSPIN_QODER_BIN = "/opt/qoder/bin/qodercli";
    const stdout: string[] = [];
    const managedHook = {
      type: "command",
      command: `'${process.execPath}' '${qoderRuntimePath}' --state '${qoderStatePath}'`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) {
        return JSON.stringify({
          target: "qoder",
          install_id: "wins_qoder",
          publisher_id: "wpub_qoder",
          publisher_target: "qoder",
          base_url: "https://api.waitspin.com",
          api_key_path: qoderApiKeyPath,
          runtime_path: qoderRuntimePath,
          cache_path: qoderCachePath,
          settings_path: qoderSettingsPath,
          managed_hook: managedHook,
          qoder_version: "1.0.31",
          installed_at: "2026-06-26T00:00:00.000Z",
        });
      }
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            Stop: [{ hooks: [managedHook] }],
            UserPromptSubmit: [{ hooks: [managedHook] }],
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runQoderStatus();

    expect(access).toHaveBeenCalledWith(qoderRuntimePath, 4);
    expect(access).toHaveBeenCalledWith(qoderStatePath, 4);
    expect(access).toHaveBeenCalledWith(qoderApiKeyPath, 4);
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "qoder",
      mode: "qoder-hook-system-message",
      installed: true,
      hook_configured: true,
      expected_managed_hook_count: 2,
      managed_hook_count: 2,
      runtime_readable: true,
      state_readable: true,
      api_key_readable: true,
      next: "launch_qoder",
      next_command: "/opt/qoder/bin/qodercli",
    });
  });

  it("reports Qoder status as degraded when the managed hook is missing", async () => {
    const { runQoderStatus: rawRunQoderStatus } = await import("../cli");
    const runQoderStatus = (flags: Map<string, string[]> = new Map()) =>
      rawRunQoderStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    const managedHook = {
      type: "command",
      command: `${process.execPath} ${qoderRuntimePath} --state ${qoderStatePath}`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) {
        return JSON.stringify({
          target: "qoder",
          install_id: "wins_qoder",
          publisher_id: "wpub_qoder",
          publisher_target: "qoder",
          base_url: "https://api.waitspin.com",
          api_key_path: qoderApiKeyPath,
          runtime_path: qoderRuntimePath,
          cache_path: qoderCachePath,
          settings_path: qoderSettingsPath,
          managed_hook: managedHook,
          installed_at: "2026-06-26T00:00:00.000Z",
        });
      }
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: "command", command: "existing-qoder-hook" }] },
            ],
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runQoderStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "qoder",
      installed: false,
      hook_configured: false,
      managed_hook_count: 0,
      next: "install_qoder",
    });
  });

  it("reports Qoder status as degraded when managed hooks are duplicated in one event", async () => {
    const { runQoderStatus: rawRunQoderStatus } = await import("../cli");
    const runQoderStatus = (flags: Map<string, string[]> = new Map()) =>
      rawRunQoderStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    const managedHook = {
      type: "command",
      command: `${process.execPath} ${qoderRuntimePath} --state ${qoderStatePath}`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) {
        return JSON.stringify({
          target: "qoder",
          install_id: "wins_qoder",
          publisher_id: "wpub_qoder",
          publisher_target: "qoder",
          base_url: "https://api.waitspin.com",
          api_key_path: qoderApiKeyPath,
          runtime_path: qoderRuntimePath,
          cache_path: qoderCachePath,
          settings_path: qoderSettingsPath,
          managed_hook: managedHook,
          installed_at: "2026-06-26T00:00:00.000Z",
        });
      }
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            UserPromptSubmit: [{ hooks: [managedHook, managedHook] }],
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runQoderStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "qoder",
      installed: false,
      hook_configured: false,
      managed_hook_count: 2,
      next: "install_qoder",
    });
  });

  it("uninstalls only the managed Qoder hook and local state", async () => {
    const { runQoderUninstall: rawRunQoderUninstall } = await import("../cli");
    const runQoderUninstall = (flags: Map<string, string[]> = new Map()) =>
      rawRunQoderUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    const managedHook = {
      type: "command",
      command: `${process.execPath} ${qoderRuntimePath} --state ${qoderStatePath}`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    const existingHook = {
      type: "command",
      command: "existing-qoder-hook",
      timeout: 9,
      statusMessage: "Existing hook",
    };
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) {
        return JSON.stringify({
          target: "qoder",
          install_id: "wins_qoder",
          publisher_id: "wpub_qoder",
          publisher_target: "qoder",
          base_url: "https://api.waitspin.com",
          api_key_path: qoderApiKeyPath,
          runtime_path: qoderRuntimePath,
          cache_path: qoderCachePath,
          settings_path: qoderSettingsPath,
          managed_hook: managedHook,
          installed_at: "2026-06-26T00:00:00.000Z",
        });
      }
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            Stop: [{ hooks: [managedHook] }],
            UserPromptSubmit: [
              { hooks: [existingHook] },
              { hooks: [managedHook] },
            ],
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runQoderUninstall();

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderSettingsPath,
    );
    const settings = JSON.parse(String(settingsWrite?.[1])) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<Record<string, unknown>> }> };
    };
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject(
      existingHook,
    );
    expect(rm).toHaveBeenCalledWith(qoderRuntimePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderCachePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderApiKeyPath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderStatePath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "qoder",
      uninstalled: true,
      settings_action: "remove-managed",
      removed_hooks: 2,
    });
  });

  it("removes orphaned Qoder hooks when managed state is missing", async () => {
    const { runQoderUninstall: rawRunQoderUninstall } = await import("../cli");
    const runQoderUninstall = (flags: Map<string, string[]> = new Map()) =>
      rawRunQoderUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    const managedHook = {
      type: "command",
      command: `'${process.execPath}' '${qoderRuntimePath}' --state '${qoderStatePath}'`,
      timeout: 15,
      statusMessage: "WaitSpin sponsor check",
    };
    const existingHook = {
      type: "command",
      command: "existing-qoder-hook",
      timeout: 9,
      statusMessage: "Existing hook",
    };
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === qoderStatePath) throw enoent();
      if (filePath === qoderSettingsPath) {
        return JSON.stringify({
          hooks: {
            Stop: [{ hooks: [managedHook] }],
            UserPromptSubmit: [
              { hooks: [existingHook] },
              { hooks: [managedHook] },
            ],
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runQoderUninstall();

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === qoderSettingsPath,
    );
    const settings = JSON.parse(String(settingsWrite?.[1])) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<Record<string, unknown>> }> };
    };
    expect(settings.hooks).not.toHaveProperty("Stop");
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject(
      existingHook,
    );
    expect(rm).toHaveBeenCalledWith(qoderRuntimePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderCachePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderApiKeyPath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(qoderStatePath, {
      force: true,
      recursive: true,
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "qoder",
      uninstalled: true,
      settings_action: "remove-managed",
      removed_hooks: 2,
    });
  });

  // ─── OpenCode ────────────────────────────────────────────

  it("installs OpenCode TUI plugin support without writing secrets to log output", async () => {
    const { runOpencodeInstall: rawrunOpencodeInstall } = await import("../cli");
    const runOpencodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        throw enoent();
      }
      if (filePath === opencodeTuiConfigPath) {
        return JSON.stringify({
          $schema: "https://opencode.ai/tui.json",
          plugin: ["./plugins/other.tsx"],
        });
      }
      if (filePath.endsWith("waitspin-opencode.plugin.tsx")) {
        return [
          'const INSTALL_CONFIG = {',
          '  statePath: "__WAITSPIN_STATE_PATH__",',
          '}',
        ].join("\n");
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { install_id: string; target: string };
    expect(registerBody.target).toBe("opencode");

    expect(cp).toHaveBeenCalledWith(
      expect.stringContaining("opencode-statusline.mjs"),
      opencodeRuntimePath,
      { force: true },
    );
    expect(chmod).toHaveBeenCalledWith(opencodeRuntimePath, 0o755);
    expect(chmod).toHaveBeenCalledWith(opencodePluginDestPath, 0o600);
    const pluginWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === opencodePluginDestPath,
    );
    expect(pluginWrite).toBeTruthy();
    expect(pluginWrite[1]).toContain(`statePath: "${opencodeStatePath}"`);
    expect(pluginWrite[1]).not.toContain("wts_live_test_key_value_1234567890");
    expect(pluginWrite[1]).not.toContain(registerBody.install_id);
    expect(pluginWrite[2]).toEqual(
      expect.objectContaining({ encoding: "utf8", mode: 0o600 }),
    );

    const tuiConfigWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === opencodeTuiConfigPath,
    );
    expect(tuiConfigWrite).toBeTruthy();
    expect(JSON.parse(tuiConfigWrite[1])).toMatchObject({
      $schema: "https://opencode.ai/tui.json",
      plugin: ["./plugins/other.tsx", opencodeTuiPluginEntry],
    });

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === opencodeStatePath,
    );
    expect(stateWrite).toBeTruthy();
    expect(JSON.parse(stateWrite[1])).toMatchObject({
      target: "opencode",
      install_id: registerBody.install_id,
      publisher_target: "opencode",
      api_key: "wts_live_test_key_value_1234567890",
      base_url: "https://api.waitspin.com",
      runtime_path: opencodeRuntimePath,
      cache_path: opencodeCachePath,
      plugin_path: opencodePluginDestPath,
      tui_config_path: opencodeTuiConfigPath,
      tui_plugin_entry: opencodeTuiPluginEntry,
    });
    expect(stateWrite[2]).toEqual(
      expect.objectContaining({ encoding: "utf8", mode: 0o600 }),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.publisher_registered).toBe(true);
    expect(output.publisher_target).toBe("opencode");
    expect(output.tui_config_path).toBe(opencodeTuiConfigPath);
    expect(output.tui_plugin_entry).toBe(opencodeTuiPluginEntry);
    expect(output.api_key).toBeUndefined();
    expect(output.api_key_present).toBe(true);
  });

  it("dry-runs OpenCode install without side effects", async () => {
    const { runOpencodeInstall: rawrunOpencodeInstall } = await import("../cli");
    const runOpencodeInstall = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeInstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeInstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(chmod).not.toHaveBeenCalled();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      dry_run: true,
      publisher_registered: false,
      target: "opencode",
    });
  });

  it("reports OpenCode status from managed state, runtime, and plugin files", async () => {
    const { runOpencodeStatus: rawrunOpencodeStatus } = await import("../cli");
    const runOpencodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        return JSON.stringify({
          target: "opencode",
          install_id: "wins_opencode",
          publisher_id: "wpub_opencode",
          publisher_target: "opencode",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: opencodeRuntimePath,
          cache_path: opencodeCachePath,
          plugin_path: opencodePluginDestPath,
          tui_config_path: opencodeTuiConfigPath,
          tui_plugin_entry: opencodeTuiPluginEntry,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === opencodeTuiConfigPath) {
        return JSON.stringify({ plugin: [opencodeTuiPluginEntry] });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeStatus();

    expect(access).toHaveBeenCalledWith(opencodeRuntimePath, 0);
    expect(access).toHaveBeenCalledWith(opencodePluginDestPath, 0);
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(true);
    expect(output.publisher_target).toBe("opencode");
    expect(output.publisher_registered).toBe(true);
    expect(output.mode).toBe("tui-plugin-slot");
    expect(output.runtime_installed).toBe(true);
    expect(output.plugin_installed).toBe(true);
    expect(output.tui_plugin_configured).toBe(true);
    expect(JSON.stringify(output)).not.toContain("wts_live_secret");
  });

  it("reports OpenCode status as degraded when the TUI plugin entry is missing", async () => {
    const { runOpencodeStatus: rawrunOpencodeStatus } = await import("../cli");
    const runOpencodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        return JSON.stringify({
          target: "opencode",
          install_id: "wins_opencode",
          publisher_id: "wpub_opencode",
          publisher_target: "opencode",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: opencodeRuntimePath,
          cache_path: opencodeCachePath,
          plugin_path: opencodePluginDestPath,
          tui_config_path: opencodeTuiConfigPath,
          tui_plugin_entry: opencodeTuiPluginEntry,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === opencodeTuiConfigPath) {
        return JSON.stringify({ plugin: ["./plugins/other.tsx"] });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(false);
    expect(output.runtime_installed).toBe(true);
    expect(output.plugin_installed).toBe(true);
    expect(output.tui_plugin_configured).toBe(false);
    expect(output.next).toBe("install_opencode");
  });

  it("reports OpenCode status as not installed when state file is missing", async () => {
    const { runOpencodeStatus: rawrunOpencodeStatus } = await import("../cli");
    const runOpencodeStatus = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeStatus(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeStatus();

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.installed).toBe(false);
    expect(output.next).toBe("install_opencode");
    expect(output.next_command).toBe("waitspin opencode install");
  });

  it("uninstalls OpenCode runtime, cache, state, and plugin files", async () => {
    const { runOpencodeUninstall: rawrunOpencodeUninstall } = await import("../cli");
    const runOpencodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        return JSON.stringify({
          target: "opencode",
          install_id: "wins_opencode",
          publisher_id: "wpub_opencode",
          publisher_target: "opencode",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: opencodeRuntimePath,
          cache_path: opencodeCachePath,
          plugin_path: opencodePluginDestPath,
          tui_config_path: opencodeTuiConfigPath,
          tui_plugin_entry: opencodeTuiPluginEntry,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      if (filePath === opencodeTuiConfigPath) {
        return JSON.stringify({
          plugin: ["./plugins/other.tsx", opencodeTuiPluginEntry],
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeUninstall(new Map<string, string[]>());

    expect(rm).toHaveBeenCalledWith(opencodeRuntimePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(opencodeCachePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(opencodeStatePath, {
      force: true,
      recursive: true,
    });
    expect(rm).toHaveBeenCalledWith(opencodePluginDestPath, {
      force: true,
      recursive: true,
    });
    const tuiConfigWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === opencodeTuiConfigPath,
    );
    expect(tuiConfigWrite).toBeTruthy();
    expect(JSON.parse(tuiConfigWrite[1])).toEqual({
      plugin: ["./plugins/other.tsx"],
    });
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.uninstalled).toBe(true);
    expect(output.tui_config_updated).toBe(true);
    expect(output.tui_plugin_configured_before).toBe(true);
    expect(output.removed).toEqual([
      opencodeRuntimePath,
      opencodeCachePath,
      opencodeStatePath,
      opencodePluginDestPath,
    ]);
  });

  it("dry-runs OpenCode uninstall without destructive side effects", async () => {
    const { runOpencodeUninstall: rawrunOpencodeUninstall } = await import("../cli");
    const runOpencodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        return JSON.stringify({
          target: "opencode",
          install_id: "wins_opencode",
          publisher_id: "wpub_opencode",
          publisher_target: "opencode",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: opencodeRuntimePath,
          cache_path: opencodeCachePath,
          plugin_path: opencodePluginDestPath,
          tui_config_path: opencodeTuiConfigPath,
          tui_plugin_entry: opencodeTuiPluginEntry,
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeUninstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    expect(rm).not.toHaveBeenCalled();
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.dry_run).toBe(true);
    expect(output.installed).toBe(true);
    expect(output.would_remove).toEqual([
      opencodeRuntimePath,
      opencodeCachePath,
      opencodeStatePath,
      opencodePluginDestPath,
    ]);
    expect(output.would_update).toEqual([opencodeTuiConfigPath]);
  });

  it("skips unsafe OpenCode state paths while removing managed state", async () => {
    const { runOpencodeUninstall: rawrunOpencodeUninstall } = await import("../cli");
    const runOpencodeUninstall = (flags: Map<string, string[]> = new Map()) => rawrunOpencodeUninstall(withJsonFlag(flags));
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === opencodeStatePath) {
        return JSON.stringify({
          target: "opencode",
          install_id: "wins_opencode",
          publisher_id: "wpub_opencode",
          publisher_target: "opencode",
          base_url: "https://api.waitspin.com",
          api_key: "wts_live_secret",
          runtime_path: "/tmp/not-waitspin-opencode.mjs",
          cache_path: "/tmp/not-waitspin-cache.json",
          plugin_path: path.join(
            os.homedir(),
            ".config",
            "opencode",
            "plugins",
            "not-waitspin.plugin.tsx",
          ),
          installed_at: "2026-06-16T00:00:00.000Z",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await runOpencodeUninstall(new Map<string, string[]>());

    expect(rm).toHaveBeenCalledWith(opencodeStatePath, {
      force: true,
      recursive: true,
    });
    expect(rm).not.toHaveBeenCalledWith(
      "/tmp/not-waitspin-opencode.mjs",
      expect.anything(),
    );
    expect(rm).not.toHaveBeenCalledWith(
      "/tmp/not-waitspin-cache.json",
      expect.anything(),
    );
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.skipped_unsafe_paths).toEqual([
      "/tmp/not-waitspin-opencode.mjs",
      "/tmp/not-waitspin-cache.json",
      path.join(
        os.homedir(),
        ".config",
        "opencode",
        "plugins",
        "not-waitspin.plugin.tsx",
      ),
    ]);
  });
});
