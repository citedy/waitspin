/** @jest-environment node */

import os from "node:os";
import path from "node:path";

const access = jest.fn();
const chmod = jest.fn();
const cp = jest.fn();
const mkdir = jest.fn();
const readFile = jest.fn();
const rename = jest.fn();
const rm = jest.fn();
const writeFile = jest.fn();
const execFile = jest.fn();
const fetchMock = jest.fn();

jest.mock("node:fs", () => ({
  constants: { F_OK: 0 },
  realpathSync: (value: string) => value,
}));

jest.mock("node:fs/promises", () => ({
  access: (...args: unknown[]) => access(...args),
  chmod: (...args: unknown[]) => chmod(...args),
  cp: (...args: unknown[]) => cp(...args),
  mkdir: (...args: unknown[]) => mkdir(...args),
  readFile: (...args: unknown[]) => readFile(...args),
  rename: (...args: unknown[]) => rename(...args),
  rm: (...args: unknown[]) => rm(...args),
  writeFile: (...args: unknown[]) => writeFile(...args),
}));

jest.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFile(...args),
}));

function enoent() {
  const error = new Error("ENOENT") as Error & { code: string };
  error.code = "ENOENT";
  return error;
}

describe("MiMo Code CLI commands", () => {
  const originalFetch = global.fetch;
  const statePath = path.join(
    os.homedir(),
    ".waitspin",
    "mimocode-statusline.json",
  );
  const cachePath = path.join(
    os.homedir(),
    ".waitspin",
    "mimocode-statusline-cache.json",
  );
  const runtimePath = path.join(
    os.homedir(),
    ".local",
    "bin",
    "waitspin-mimocode-runtime",
  );
  const bashrcPath = path.join(os.homedir(), ".bashrc");
  const unsafeRuntimePath = path.join(
    os.homedir(),
    ".local",
    "bin",
    "not-waitspin",
  );

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    access.mockRejectedValue(enoent());
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === bashrcPath) {
        return "";
      }
      throw enoent();
    });
    mkdir.mockResolvedValue(undefined);
    chmod.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
    rm.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          publisher_id: "wpub_test",
          install_id: "wins_test",
          target: "mimocode",
        }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("dry-run install shows planned actions without changes", async () => {
    const { runMiMoCodeInstall } = await import("../cli");
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });

    await runMiMoCodeInstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.ok).toBe(true);
    expect(output.target).toBe("mimocode");
    expect(output.dry_run).toBe(true);
    expect(output.publisher_registered).toBe(false);
    expect(output.would_write).toContain(statePath);
    expect(output.would_write).toContain(runtimePath);
  });

  it("install writes state and runtime files", async () => {
    const { runMiMoCodeInstall } = await import("../cli");
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === bashrcPath) {
        return "";
      }
      throw enoent();
    });

    await runMiMoCodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    expect(writeFile).toHaveBeenCalledWith(
      runtimePath,
      expect.stringContaining("/v1/serve/next"),
      expect.objectContaining({ mode: 0o755 }),
    );
    const runtimeWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]: [string]) => filePath === runtimePath,
    );
    expect(runtimeWrite[1]).toContain("#!/usr/bin/env node");
    expect(runtimeWrite[1]).toContain("state.cache_path");
    expect(runtimeWrite[1]).toContain("\\u001B\\[");
    expect(runtimeWrite[1]).toContain("\\u007F-\\u009F");
    expect(runtimeWrite[1]).not.toContain("python3");
    expect(runtimeWrite[1]).not.toContain("date +%s%3N");
    expect(runtimeWrite[1]).not.toContain("curl -s");
    expect(chmod).toHaveBeenCalledWith(runtimePath, 0o755);

    const registerBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { target: string };
    expect(registerBody.target).toBe("mimocode");

    const stateWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath]: [string]) => filePath === statePath,
    );
    expect(stateWrite).toBeTruthy();
    expect(JSON.parse(stateWrite[1])).toMatchObject({
      target: "mimocode",
      publisher_target: "mimocode",
      api_key: "wts_live_test_key_value_1234567890",
      cache_path: cachePath,
    });
    expect(stateWrite[2]).toEqual(
      expect.objectContaining({ encoding: "utf8", mode: 0o600 }),
    );
    expect(chmod).toHaveBeenCalledWith(statePath, 0o600);
    const bashHookWrite = (writeFile as jest.Mock).mock.calls.find(
      ([filePath, content]: [string, string]) =>
        filePath.startsWith(`${bashrcPath}.waitspin-`) &&
        content.includes("PROMPT_COMMAND"),
    );
    expect(bashHookWrite?.[1]).toContain("PROMPT_COMMAND");
    expect(bashHookWrite?.[1]).toContain(
      "# End WaitSpin MiMo Code statusline hook",
    );
    expect(rename).toHaveBeenCalledWith(
      expect.stringMatching(/\.bashrc\.waitspin-\d+\.tmp$/),
      bashrcPath,
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.publisher_registered).toBe(true);
    expect(output.target).toBe("mimocode");
  });

  it("install does not duplicate an existing bash hook", async () => {
    const { runMiMoCodeInstall } = await import("../cli");
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === bashrcPath) {
        return "# WaitSpin MiMo Code statusline hook\nexisting\n";
      }
      throw enoent();
    });

    await runMiMoCodeInstall(
      new Map<string, string[]>([
        ["api-key", ["wts_live_test_key_value_1234567890"]],
      ]),
    );

    const bashHookWrites = (writeFile as jest.Mock).mock.calls.filter(
      ([filePath, content]: [string, string]) =>
        filePath.startsWith(`${bashrcPath}.waitspin-`) &&
        String(content).includes("PROMPT_COMMAND"),
    );
    expect(bashHookWrites).toHaveLength(0);
  });

  it("uninstall removes managed files", async () => {
    const { runMiMoCodeUninstall } = await import("../cli");
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === statePath) {
        return JSON.stringify({
          target: "mimocode",
          install_id: "wins_test",
          runtime_path: runtimePath,
          cache_path: cachePath,
          bashrc_path: bashrcPath,
        });
      }
      if (filePath === bashrcPath) {
        return "# WaitSpin MiMo Code statusline hook\n__waitspin_statusline() {\n  echo test\n}\n";
      }
      throw enoent();
    });

    await runMiMoCodeUninstall(new Map<string, string[]>());

    expect(rm).toHaveBeenCalledWith(
      runtimePath,
      expect.objectContaining({ force: true }),
    );
    expect(rm).toHaveBeenCalledWith(
      statePath,
      expect.objectContaining({ force: true }),
    );
    expect(rm).toHaveBeenCalledWith(
      cachePath,
      expect.objectContaining({ force: true }),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.ok).toBe(true);
    expect(output.uninstalled).toBe(true);
  });

  it("uninstall dry-run shows what would be removed", async () => {
    const { runMiMoCodeUninstall } = await import("../cli");
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === statePath) {
        return JSON.stringify({
          target: "mimocode",
          install_id: "wins_test",
          runtime_path: runtimePath,
          cache_path: cachePath,
          bashrc_path: bashrcPath,
        });
      }
      if (filePath === bashrcPath) {
        return "# WaitSpin MiMo Code statusline hook\n";
      }
      throw enoent();
    });

    await runMiMoCodeUninstall(
      new Map<string, string[]>([["dry-run", ["true"]]]),
    );

    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.dry_run).toBe(true);
    expect(output.would_remove).toContain(statePath);
    expect(output.would_remove).toContain(runtimePath);
    expect(output.would_remove).toContain(cachePath);
  });

  it("uninstall skips unsafe state paths while removing WaitSpin-owned state", async () => {
    const { runMiMoCodeUninstall } = await import("../cli");
    const stdout: string[] = [];
    jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === statePath) {
        return JSON.stringify({
          target: "mimocode",
          install_id: "wins_test",
          runtime_path: unsafeRuntimePath,
          cache_path: "/tmp/not-waitspin-cache.json",
          bashrc_path: bashrcPath,
        });
      }
      if (filePath === bashrcPath) {
        return "";
      }
      throw enoent();
    });

    await runMiMoCodeUninstall(new Map<string, string[]>());

    expect(rm).toHaveBeenCalledWith(
      statePath,
      expect.objectContaining({ force: true }),
    );
    expect(rm).not.toHaveBeenCalledWith(
      unsafeRuntimePath,
      expect.anything(),
    );
    expect(rm).not.toHaveBeenCalledWith(
      "/tmp/not-waitspin-cache.json",
      expect.anything(),
    );
    const output = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(output.skipped_unsafe_paths).toEqual([
      unsafeRuntimePath,
      "/tmp/not-waitspin-cache.json",
    ]);
  });
});
