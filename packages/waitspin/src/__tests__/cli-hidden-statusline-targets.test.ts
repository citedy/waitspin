/** @jest-environment node */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const access = jest.fn();
const chmod = jest.fn();
const cp = jest.fn();
const execFile = jest.fn();
const fetchMock = jest.fn();
const mkdir = jest.fn();
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
  mkdir: (...args: unknown[]) => mkdir(...args),
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

function enoent(): Error & { code: string } {
  return Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

describe("statusline CLI targets", () => {
  const TEST_PUBLISHER_EXTENSION_TOKEN = "test-publisher-extension-token";
  const originalFetch = global.fetch;
  const originalCopilotHome = process.env.COPILOT_HOME;
  const originalCopilotBin = process.env.WAITSPIN_COPILOT_BIN;
  const originalAntigravityBin = process.env.WAITSPIN_ANTIGRAVITY_BIN;

  const copilotStatePath = path.join(os.homedir(), ".waitspin", "copilot-install.json");
  const copilotRuntimePath = path.join(os.homedir(), ".waitspin", "copilot-statusline.mjs");
  const copilotCommandPath = path.join(os.homedir(), ".waitspin", "copilot-statusline-command");
  const copilotCachePath = path.join(os.homedir(), ".waitspin", "copilot-statusline-cache.json");
  const copilotApiKeyPath = path.join(os.homedir(), ".waitspin", "copilot-api-key.secret");
  const copilotSettingsPath = path.join(os.homedir(), ".copilot", "settings.json");

  const antigravityStatePath = path.join(os.homedir(), ".waitspin", "antigravity-install.json");
  const antigravityRuntimePath = path.join(os.homedir(), ".waitspin", "antigravity-statusline.mjs");
  const antigravityCommandPath = path.join(os.homedir(), ".waitspin", "antigravity-statusline-command");
  const antigravityCachePath = path.join(os.homedir(), ".waitspin", "antigravity-statusline-cache.json");
  const antigravityApiKeyPath = path.join(os.homedir(), ".waitspin", "antigravity-api-key.secret");
  const antigravitySettingsPath = path.join(
    os.homedir(),
    ".gemini",
    "antigravity-cli",
    "settings.json",
  );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.COPILOT_HOME;
    delete process.env.WAITSPIN_COPILOT_BIN;
    delete process.env.WAITSPIN_ANTIGRAVITY_BIN;
    global.fetch = fetchMock as typeof fetch;
    access.mockResolvedValue(undefined);
    chmod.mockResolvedValue(undefined);
    cp.mockResolvedValue(undefined);
    mkdir.mockResolvedValue(undefined);
    readdir.mockResolvedValue([]);
    rename.mockResolvedValue(undefined);
    rm.mockResolvedValue(undefined);
    stat.mockResolvedValue({ mode: 0o755 });
    statSync.mockImplementation(() => {
      throw enoent();
    });
    realpathSync.mockImplementation((value: string) => value);
    execFile.mockImplementation((file, _args, _options, callback) => {
      callback(null, file === "agy" ? "1.0.10\n" : "GitHub Copilot CLI 1.0.64\n", "");
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
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (
        filePath === copilotSettingsPath ||
        filePath === copilotStatePath ||
        filePath === antigravitySettingsPath ||
        filePath === antigravityStatePath
      ) {
        throw enoent();
      }
      throw new Error(`unexpected read: ${filePath}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalCopilotHome === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = originalCopilotHome;
    if (originalCopilotBin === undefined) delete process.env.WAITSPIN_COPILOT_BIN;
    else process.env.WAITSPIN_COPILOT_BIN = originalCopilotBin;
    if (originalAntigravityBin === undefined) {
      delete process.env.WAITSPIN_ANTIGRAVITY_BIN;
    } else {
      process.env.WAITSPIN_ANTIGRAVITY_BIN = originalAntigravityBin;
    }
  });

  it("installs Copilot CLI support with a wrapper executable and no raw key in state", async () => {
    const { runCopilotInstall: rawRunCopilotInstall } = await import("../cli");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotSettingsPath) {
        return [
          "{",
          "  // Copilot settings are JSONC",
          '  "theme": "dark",',
          '  "footer": { "showCustom": false },',
          "}",
        ].join("\n");
      }
      if (filePath === copilotStatePath) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotInstall(
      withJsonFlag(new Map([["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]]])),
    );

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { install_id: string; target: string };
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(registerBody.target).toBe("copilot");

    const commandWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotCommandPath,
    );
    expect(commandWrite?.[1]).toContain(copilotRuntimePath);
    expect(commandWrite?.[1]).toContain(copilotStatePath);
    expect(commandWrite?.[1]).not.toContain(TEST_PUBLISHER_EXTENSION_TOKEN);

    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotRuntimePath,
    );
    expect(runtimeWrite?.[1]).toContain("detectOwnerPid");
    expect(runtimeWrite?.[1]).toContain("ownerAliveAfterVisible");
    expect(runtimeWrite?.[1]).toContain("installedSurfaceStillConfigured");
    expect(runtimeWrite?.[1]).toContain("function stripJsoncSyntax(raw)");
    expect(runtimeWrite?.[1]).toContain("function stripTrailingJsonCommas(raw)");
    expect(runtimeWrite?.[1]).toContain("? await readJsonc(state.settings_path, null)");
    expect(runtimeWrite?.[1]).toContain(": await readJson(state.settings_path, null)");
    expect(runtimeWrite?.[1]).toContain("const hasValueBeforeComma");
    expect(runtimeWrite?.[1]).toContain('state.target === "copilot" || state.target === "antigravity"');
    expect(runtimeWrite?.[1]).toContain('output += " "');
    expect(runtimeWrite?.[1]).toContain("Get-CimInstance Win32_Process");
    expect(runtimeWrite?.[1]).toContain("powershell.exe");
    expect(runtimeWrite?.[1]).toContain("SHELL_PROCESS_NAMES");

    const secretWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotApiKeyPath,
    );
    expect(secretWrite?.[1]).toBe(`${TEST_PUBLISHER_EXTENSION_TOKEN}\n`);
    expect(secretWrite?.[2]).toMatchObject({ mode: 0o600 });
    expect(chmod).toHaveBeenCalledWith(copilotApiKeyPath, 0o600);

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotStatePath,
    );
    const state = JSON.parse(stateWrite[1]) as Record<string, unknown>;
    expect(state).toMatchObject({
      target: "copilot",
      install_id: registerBody.install_id,
      publisher_target: "copilot",
      api_key_path: copilotApiKeyPath,
      command_path: copilotCommandPath,
      had_previous_footer_show_custom: true,
      previous_footer_show_custom: false,
    });
    expect(state.api_key).toBeUndefined();

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotSettingsPath,
    );
    const settings = JSON.parse(settingsWrite[1]) as {
      footer: { showCustom: boolean };
      statusLine: { type: string; command: string; padding: number };
    };
    expect(settings.footer.showCustom).toBe(true);
    expect(settings.statusLine).toEqual({
      type: "command",
      command: copilotCommandPath,
      padding: 0,
    });

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output).toMatchObject({
      target: "copilot",
      publisher_registered: true,
      api_key_present: true,
    });
    expect(output).not.toHaveProperty("experimental");
    expect(JSON.stringify(output)).not.toContain(TEST_PUBLISHER_EXTENSION_TOKEN);
  });

  it("rejects malformed Copilot JSONC settings before side effects", async () => {
    const { runCopilotInstall: rawRunCopilotInstall } = await import("../cli");
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotSettingsPath) {
        return "{\n  /* unterminated comment\n  \"theme\": \"dark\"\n}";
      }
      if (filePath === copilotStatePath) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      rawRunCopilotInstall(
        withJsonFlag(new Map([["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]]])),
      ),
    ).rejects.toThrow(/invalid JSONC/);
    expect(execFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("refuses to refresh Copilot support across COPILOT_HOME settings paths", async () => {
    const { runCopilotInstall: rawRunCopilotInstall } = await import("../cli");
    process.env.COPILOT_HOME = path.join(os.tmpdir(), "waitspin-copilot-other-home");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: copilotSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await expect(
      rawRunCopilotInstall(
        withJsonFlag(new Map([["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]]])),
      ),
    ).rejects.toThrow(/original COPILOT_HOME|another Copilot config home/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("records composed Copilot statusline commands as executable paths", async () => {
    const { runCopilotInstall: rawRunCopilotInstall } = await import("../cli");
    const previousCommandPath = path.join(
      os.tmpdir(),
      "WaitSpin Test App",
      "R&D ! ^ tools",
      "custom statusline.cmd",
    );
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotSettingsPath) {
        return JSON.stringify({
          footer: { showCustom: true },
          statusLine: { type: "command", command: previousCommandPath },
        });
      }
      if (filePath === copilotStatePath) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotInstall(
      withJsonFlag(
        new Map([
          ["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]],
          ["compose-existing", ["true"]],
        ]),
      ),
    );

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotStatePath,
    );
    const state = JSON.parse(stateWrite[1]) as Record<string, unknown>;
    expect(state).toMatchObject({
      previous_status_line: { type: "command", command: previousCommandPath },
      previous_status_line_command_mode: "exec-path",
      composed_existing_status_line: true,
    });

    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === copilotRuntimePath,
    );
    expect(runtimeWrite?.[1]).toContain("function expandExecutablePath(command)");
    expect(runtimeWrite?.[1]).toContain(".replace(/\\$\\{HOME\\}/g, home)");
    expect(runtimeWrite?.[1]).toContain("function spawnResolvedCommandPath(commandPath)");
    expect(runtimeWrite?.[1]).toContain("function unsafeWindowsCommandScriptPath(commandPath)");
    expect(runtimeWrite?.[1]).toContain("/\\.(?:cmd|bat)$/i");
    expect(runtimeWrite?.[1]).toContain('process.env.ComSpec || "cmd.exe"');
    expect(runtimeWrite?.[1]).toContain('"/d"');
    expect(runtimeWrite?.[1]).toContain('"/v:off"');
    expect(runtimeWrite?.[1]).not.toContain('"/s"');
    expect(runtimeWrite?.[1]).toContain('"/c"');
    expect(runtimeWrite?.[1]).toContain("WAITSPIN_PREVIOUS_STATUSLINE_CMD");
    expect(runtimeWrite?.[1]).toContain('call "%\' + previousCommandEnv + \'%"');
    expect(runtimeWrite?.[1]).toContain("env: { ...process.env, [previousCommandEnv]: commandPath }");
    expect(runtimeWrite?.[1]).toContain("windowsVerbatimArguments: true");
    expect(runtimeWrite?.[1]).toContain("const expandedCommand =");
    expect(runtimeWrite?.[1]).toContain('mode === "exec-path" && !expandedCommand');
    expect(runtimeWrite?.[1]).toContain("spawnResolvedCommandPath(expandedCommand)");
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "copilot",
      settings_action: "compose-existing",
      composed_existing_status_line: true,
    });
  });

  it("reports Copilot status only when runtime, wrapper, secret, footer, and settings are healthy", async () => {
    const { runCopilotStatus: rawRunCopilotStatus } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const configured = { ...managed, refreshInterval: 5 };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: copilotSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === copilotSettingsPath) {
        return JSON.stringify({
          footer: { showCustom: true },
          statusLine: configured,
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotStatus(withJsonFlag());

    expect(access).toHaveBeenCalledWith(copilotRuntimePath, 4);
    expect(access).toHaveBeenCalledWith(copilotCommandPath, 1);
    expect(access).toHaveBeenCalledWith(copilotApiKeyPath, 4);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "copilot",
      installed: true,
      api_key_installed: true,
      command_installed: true,
      footer_custom_enabled: true,
      status_line_configured: true,
    });
  });

  it("reports Copilot as not installed when the wrapper is not executable", async () => {
    const { runCopilotStatus: rawRunCopilotStatus } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    access.mockImplementation(async (filePath: string, mode: number) => {
      if (filePath === copilotCommandPath && mode === 1) throw enoent();
      return undefined;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: copilotSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === copilotSettingsPath) {
        return JSON.stringify({ footer: { showCustom: true }, statusLine: managed });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotStatus(withJsonFlag());

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "copilot",
      installed: false,
      api_key_installed: true,
      command_installed: false,
      footer_custom_enabled: true,
      status_line_configured: true,
    });
  });

  it("reports Copilot as not installed when the runtime is not readable", async () => {
    const { runCopilotStatus: rawRunCopilotStatus } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    access.mockImplementation(async (filePath: string, mode: number) => {
      if (filePath === copilotRuntimePath && mode === 4) throw enoent();
      return undefined;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: copilotSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === copilotSettingsPath) {
        return JSON.stringify({ footer: { showCustom: true }, statusLine: managed });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotStatus(withJsonFlag());

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "copilot",
      installed: false,
      runtime_installed: false,
      api_key_installed: true,
      command_installed: true,
      footer_custom_enabled: true,
      status_line_configured: true,
    });
  });

  it("reports Copilot as not installed when the secret file is missing", async () => {
    const { runCopilotStatus: rawRunCopilotStatus } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    access.mockImplementation(async (filePath: string) => {
      if (filePath === copilotApiKeyPath) throw enoent();
      return undefined;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: copilotSettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === copilotSettingsPath) {
        return JSON.stringify({ footer: { showCustom: true }, statusLine: managed });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotStatus(withJsonFlag());

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "copilot",
      installed: false,
      api_key_installed: false,
      command_installed: true,
      footer_custom_enabled: true,
      status_line_configured: true,
    });
  });

  it("restores Copilot statusline and footer visibility on uninstall", async () => {
    const { runCopilotUninstall: rawRunCopilotUninstall } = await import("../cli");
    const previous = { type: "command", command: "custom-copilot-statusline" };
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const installedSettingsPath = path.join(os.tmpdir(), "waitspin-copilot-home", "settings.json");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: installedSettingsPath,
          managed_status_line: managed,
          previous_status_line: previous,
          had_previous_footer_show_custom: true,
          previous_footer_show_custom: false,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === installedSettingsPath) {
        return JSON.stringify({
          footer: { showCustom: true, showDirectory: true },
          statusLine: managed,
          theme: "dark",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotUninstall(withJsonFlag());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === installedSettingsPath,
    );
    expect(JSON.parse(settingsWrite[1])).toEqual({
      footer: { showCustom: false, showDirectory: true },
      statusLine: previous,
      theme: "dark",
    });
    for (const filePath of [
      copilotCommandPath,
      copilotRuntimePath,
      copilotCachePath,
      copilotApiKeyPath,
      copilotStatePath,
    ]) {
      expect(rm).toHaveBeenCalledWith(filePath, { force: true, recursive: true });
    }
    expect(JSON.parse(stdout.join(""))).toMatchObject({ settings_action: "restore-previous" });
  });

  it("cleans Copilot settings on uninstall when only managed statusline metadata changed", async () => {
    const { runCopilotUninstall: rawRunCopilotUninstall } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const drifted = { ...managed, padding: 1, refreshInterval: 5 };
    const installedSettingsPath = path.join(os.tmpdir(), "waitspin-copilot-home", "settings.json");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: installedSettingsPath,
          managed_status_line: managed,
          had_previous_footer_show_custom: false,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === installedSettingsPath) {
        return JSON.stringify({
          footer: { showCustom: true, showDirectory: true },
          statusLine: drifted,
          theme: "dark",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotUninstall(withJsonFlag());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === installedSettingsPath,
    );
    expect(settingsWrite).toBeDefined();
    expect(JSON.parse(settingsWrite[1])).toEqual({
      footer: { showDirectory: true },
      theme: "dark",
    });
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      settings_action: "remove-managed",
    });
    expect(JSON.parse(stdout.join(""))).not.toHaveProperty("settings_warning");
    expect(rm).toHaveBeenCalledWith(copilotCommandPath, {
      force: true,
      recursive: true,
    });
  });

  it("preserves Copilot settings on uninstall when custom footer was disabled", async () => {
    const { runCopilotUninstall: rawRunCopilotUninstall } = await import("../cli");
    const managed = { type: "command", command: copilotCommandPath, padding: 0 };
    const drifted = { ...managed, padding: 1, refreshInterval: 5 };
    const installedSettingsPath = path.join(os.tmpdir(), "waitspin-copilot-home", "settings.json");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === copilotStatePath) {
        return JSON.stringify({
          target: "copilot",
          install_id: "wins_copilot",
          publisher_id: "wpub_copilot",
          publisher_target: "copilot",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: copilotApiKeyPath,
          command_path: copilotCommandPath,
          runtime_path: copilotRuntimePath,
          cache_path: copilotCachePath,
          settings_path: installedSettingsPath,
          managed_status_line: managed,
          had_previous_footer_show_custom: false,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === installedSettingsPath) {
        return JSON.stringify({
          footer: { showCustom: false, showDirectory: true },
          statusLine: drifted,
          theme: "dark",
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunCopilotUninstall(withJsonFlag());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === installedSettingsPath,
    );
    expect(settingsWrite).toBeUndefined();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      settings_action: "skip-user-settings",
      settings_warning:
        "GitHub Copilot CLI statusLine is no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.",
    });
    expect(rm).toHaveBeenCalledWith(copilotCommandPath, {
      force: true,
      recursive: true,
    });
  });

  it("installs Antigravity support with command statusline type and no raw key in state", async () => {
    const { runAntigravityInstall: rawRunAntigravityInstall } = await import("../cli");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });

    await rawRunAntigravityInstall(
      withJsonFlag(new Map([["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]]])),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravityStatePath,
    );
    const state = JSON.parse(stateWrite[1]) as Record<string, unknown>;
    expect(state).toMatchObject({
      target: "antigravity",
      publisher_target: "antigravity",
      api_key_path: antigravityApiKeyPath,
      command_path: antigravityCommandPath,
      runtime_path: antigravityRuntimePath,
      cache_path: antigravityCachePath,
      settings_path: antigravitySettingsPath,
    });
    expect(state.api_key).toBeUndefined();

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravitySettingsPath,
    );
    const settings = JSON.parse(settingsWrite[1]) as {
      statusLine: { type: string; command: string; enabled: boolean };
    };
    expect(settings.statusLine).toMatchObject({
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    });

    const commandWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravityCommandPath,
    );
    expect(commandWrite?.[1]).toContain(antigravityRuntimePath);
    expect(commandWrite?.[1]).toContain(antigravityStatePath);
    expect(commandWrite?.[1]).not.toContain(TEST_PUBLISHER_EXTENSION_TOKEN);

    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravityRuntimePath,
    );
    expect(runtimeWrite?.[1]).toContain("detectOwnerPid");
    expect(runtimeWrite?.[1]).toContain("ownerAliveAfterVisible");
    expect(runtimeWrite?.[1]).toContain("installedSurfaceStillConfigured");
    expect(runtimeWrite?.[1]).toContain("function stripJsoncSyntax(raw)");
    expect(runtimeWrite?.[1]).toContain('output += " "');
    expect(runtimeWrite?.[1]).toContain("? await readJsonc(state.settings_path, null)");
    expect(runtimeWrite?.[1]).toContain(": await readJson(state.settings_path, null)");
    expect(runtimeWrite?.[1]).toContain("const hasValueBeforeComma");
    expect(runtimeWrite?.[1]).toContain('state.target === "copilot" || state.target === "antigravity"');
    expect(runtimeWrite?.[1]).toContain("Get-CimInstance Win32_Process");
    expect(runtimeWrite?.[1]).toContain("powershell.exe");
    expect(runtimeWrite?.[1]).toContain("SHELL_PROCESS_NAMES");

    const secretWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravityApiKeyPath,
    );
    expect(secretWrite?.[1]).toBe(`${TEST_PUBLISHER_EXTENSION_TOKEN}\n`);
    expect(secretWrite?.[2]).toMatchObject({ mode: 0o600 });
    expect(chmod).toHaveBeenCalledWith(antigravityApiKeyPath, 0o600);
    expect(JSON.stringify(JSON.parse(stdout.join("")))).not.toContain(
      TEST_PUBLISHER_EXTENSION_TOKEN,
    );
    expect(JSON.parse(stdout.join(""))).not.toHaveProperty("experimental");
  });

  it("treats Antigravity empty command statusLine as unset", async () => {
    const { runAntigravityInstall: rawRunAntigravityInstall } = await import("../cli");
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravitySettingsPath) {
        return JSON.stringify({
          statusLine: { type: "command", command: "", enabled: true },
        });
      }
      if (filePath === antigravityStatePath) throw enoent();
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityInstall(
      withJsonFlag(new Map([["api-key", [TEST_PUBLISHER_EXTENSION_TOKEN]]])),
    );

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravityStatePath,
    );
    const state = JSON.parse(stateWrite[1]) as Record<string, unknown>;
    expect(state.previous_status_line).toBeUndefined();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "antigravity",
      settings_action: "install",
      composed_existing_status_line: false,
    });
  });

  it("reports Antigravity status from managed runtime and settings", async () => {
    const { runAntigravityStatus: rawRunAntigravityStatus } = await import("../cli");
    const managed = {
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravityStatePath) {
        return JSON.stringify({
          target: "antigravity",
          install_id: "wins_antigravity",
          publisher_id: "wpub_antigravity",
          publisher_target: "antigravity",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: antigravityApiKeyPath,
          command_path: antigravityCommandPath,
          runtime_path: antigravityRuntimePath,
          cache_path: antigravityCachePath,
          settings_path: antigravitySettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === antigravitySettingsPath) return JSON.stringify({ statusLine: managed });
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityStatus(withJsonFlag());

    expect(access).toHaveBeenCalledWith(antigravityRuntimePath, 4);
    expect(access).toHaveBeenCalledWith(antigravityCommandPath, 1);
    expect(access).toHaveBeenCalledWith(antigravityApiKeyPath, 4);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "antigravity",
      installed: true,
      api_key_installed: true,
      command_installed: true,
      runtime_installed: true,
      status_line_configured: true,
    });
  });

  it("reports Antigravity as not installed when the runtime is not readable", async () => {
    const { runAntigravityStatus: rawRunAntigravityStatus } = await import("../cli");
    const managed = {
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    access.mockImplementation(async (filePath: string, mode: number) => {
      if (filePath === antigravityRuntimePath && mode === 4) throw enoent();
      return undefined;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravityStatePath) {
        return JSON.stringify({
          target: "antigravity",
          install_id: "wins_antigravity",
          publisher_id: "wpub_antigravity",
          publisher_target: "antigravity",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: antigravityApiKeyPath,
          command_path: antigravityCommandPath,
          runtime_path: antigravityRuntimePath,
          cache_path: antigravityCachePath,
          settings_path: antigravitySettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === antigravitySettingsPath) return JSON.stringify({ statusLine: managed });
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityStatus(withJsonFlag());

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "antigravity",
      installed: false,
      api_key_installed: true,
      command_installed: true,
      runtime_installed: false,
      status_line_configured: true,
    });
  });

  it("reports Antigravity as not installed when the secret file is missing", async () => {
    const { runAntigravityStatus: rawRunAntigravityStatus } = await import("../cli");
    const managed = {
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    access.mockImplementation(async (filePath: string) => {
      if (filePath === antigravityApiKeyPath) throw enoent();
      return undefined;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravityStatePath) {
        return JSON.stringify({
          target: "antigravity",
          install_id: "wins_antigravity",
          publisher_id: "wpub_antigravity",
          publisher_target: "antigravity",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: antigravityApiKeyPath,
          command_path: antigravityCommandPath,
          runtime_path: antigravityRuntimePath,
          cache_path: antigravityCachePath,
          settings_path: antigravitySettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === antigravitySettingsPath) return JSON.stringify({ statusLine: managed });
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityStatus(withJsonFlag());

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      target: "antigravity",
      installed: false,
      api_key_installed: false,
      command_installed: true,
      runtime_installed: true,
      status_line_configured: true,
    });
  });

  it("restores Antigravity statusline on uninstall", async () => {
    const { runAntigravityUninstall: rawRunAntigravityUninstall } = await import("../cli");
    const previous = { type: "command", command: "custom-agy-statusline", enabled: true };
    const managed = {
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravityStatePath) {
        return JSON.stringify({
          target: "antigravity",
          install_id: "wins_antigravity",
          publisher_id: "wpub_antigravity",
          publisher_target: "antigravity",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: antigravityApiKeyPath,
          command_path: antigravityCommandPath,
          runtime_path: antigravityRuntimePath,
          cache_path: antigravityCachePath,
          settings_path: antigravitySettingsPath,
          managed_status_line: managed,
          previous_status_line: previous,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === antigravitySettingsPath) {
        return JSON.stringify({ statusLine: managed, colorScheme: "terminal" });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityUninstall(withJsonFlag());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravitySettingsPath,
    );
    expect(JSON.parse(settingsWrite[1])).toEqual({
      statusLine: previous,
      colorScheme: "terminal",
    });
    for (const filePath of [
      antigravityCommandPath,
      antigravityRuntimePath,
      antigravityCachePath,
      antigravityApiKeyPath,
      antigravityStatePath,
    ]) {
      expect(rm).toHaveBeenCalledWith(filePath, { force: true, recursive: true });
    }
    expect(JSON.parse(stdout.join(""))).toMatchObject({ settings_action: "restore-previous" });
  });

  it("preserves disabled Antigravity statusline metadata on uninstall", async () => {
    const { runAntigravityUninstall: rawRunAntigravityUninstall } = await import("../cli");
    const managed = {
      type: "command",
      command: antigravityCommandPath,
      enabled: true,
    };
    const disabled = { ...managed, enabled: false };
    const stdout: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    (readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (filePath === antigravityStatePath) {
        return JSON.stringify({
          target: "antigravity",
          install_id: "wins_antigravity",
          publisher_id: "wpub_antigravity",
          publisher_target: "antigravity",
          registered_at: "2026-06-23T00:00:00.000Z",
          base_url: "https://api.waitspin.com",
          api_key_path: antigravityApiKeyPath,
          command_path: antigravityCommandPath,
          runtime_path: antigravityRuntimePath,
          cache_path: antigravityCachePath,
          settings_path: antigravitySettingsPath,
          managed_status_line: managed,
          installed_at: "2026-06-23T00:00:00.000Z",
        });
      }
      if (filePath === antigravitySettingsPath) {
        return JSON.stringify({ statusLine: disabled, colorScheme: "terminal" });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    await rawRunAntigravityUninstall(withJsonFlag());

    const settingsWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]) => filePath === antigravitySettingsPath,
    );
    expect(settingsWrite).toBeUndefined();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      settings_action: "skip-user-settings",
      settings_warning:
        "Antigravity statusLine is no longer the WaitSpin managed command; leaving user settings unchanged while removing WaitSpin-managed files.",
    });
    expect(rm).toHaveBeenCalledWith(antigravityCommandPath, {
      force: true,
      recursive: true,
    });
  });
});
