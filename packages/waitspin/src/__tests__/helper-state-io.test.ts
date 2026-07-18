/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("WaitSpin helper state filesystem invariants", () => {
  let home: string;
  let homedirSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetModules();
    delete process.env.WAITSPIN_STATE_ROOT;
    home = await mkdtemp(path.join(os.tmpdir(), "waitspin-helper-state-"));
    homedirSpy = jest.spyOn(os, "homedir").mockReturnValue(home);
  });

  afterEach(async () => {
    delete process.env.WAITSPIN_STATE_ROOT;
    homedirSpy.mockRestore();
    await rm(home, { force: true, recursive: true });
  });

  it("uses an explicit private state root inside the current home", async () => {
    const configured = path.join(home, "Library", "Application Support", "WaitSpin-QA", "helper-state");
    process.env.WAITSPIN_STATE_ROOT = configured;

    const state = await import("../helper-state");

    expect(state.waitspinRoot).toBe(configured);
    const release = await state.acquireHelperLock();
    await release();
    await expect(stat(configured)).resolves.toMatchObject({ mode: expect.any(Number) });
  });

  it("does not release a lock after its ownership token changes", async () => {
    const state = await import("../helper-state");
    const release = await state.acquireHelperLock();
    const lockPath = path.join(state.waitspinRoot, "install-operation.lock");
    await writeFile(
      path.join(lockPath, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        token: randomUUID(),
        created_at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );

    await release();

    await expect(
      import("node:fs/promises").then((fs) => fs.stat(lockPath)),
    ).resolves.toBeDefined();
  });

  it("rejects an unsafe non-directory lock path", async () => {
    const state = await import("../helper-state");
    await mkdir(state.waitspinRoot, { mode: 0o700 });
    await writeFile(
      path.join(state.waitspinRoot, "install-operation.lock"),
      "unsafe",
      { mode: 0o600 },
    );

    await expect(state.acquireHelperLock()).rejects.toThrow("unsafe file type");
  });

  it("fails closed for a corrupt durable journal", async () => {
    const state = await import("../helper-state");
    await mkdir(state.waitspinRoot, { mode: 0o700 });
    await writeFile(
      path.join(state.waitspinRoot, "install-operation-journal.json"),
      "{not-json",
      { mode: 0o600 },
    );

    await expect(state.loadHelperJournal()).rejects.toBeInstanceOf(SyntaxError);
  });

  it("returns only validated editor bootstrap generation metadata", async () => {
    const state = await import("../helper-state");
    const descriptorDirectory = path.join(
      state.waitspinRoot,
      "bootstrap",
      "vscode",
    );
    const descriptor = {
      descriptor_schema_version: 1,
      protocol_version: 1,
      token: "wbst_unit_test",
      install_id: "wins_vscode_test",
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation: 8,
      expires_at: "2099-07-14T12:10:00.000Z",
      api_base: "https://api.waitspin.com",
    };
    const context = {
      publisherTarget: "status-bar-fallback",
      apiBase: "https://api.waitspin.com",
    };
    await state.writeEditorBootstrapDescriptor("vscode", descriptor, context);
    const fingerprint = createHash("sha256")
      .update(descriptor.token)
      .digest("hex")
      .slice(0, 16);
    let descriptorPath = path.join(
      descriptorDirectory,
      `wins_vscode_test.generation-8.${fingerprint}.json`,
    );
    await expect(stat(descriptorPath)).resolves.toBeDefined();
    await expect(
      stat(path.join(descriptorDirectory, "wins_vscode_test.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      state.editorBootstrapDescriptorGeneration("vscode", "wins_vscode_test", {
        publisherTarget: "status-bar-fallback",
        apiBase: "https://api.waitspin.com",
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).resolves.toBe(8);
    await expect(
      state.editorBootstrapDescriptorGeneration(
        "cursor",
        "wins_cursor_missing",
        {
          publisherTarget: "status-bar-fallback",
          apiBase: "https://api.waitspin.com",
        },
      ),
    ).resolves.toBeUndefined();

    await writeFile(
      descriptorPath,
      JSON.stringify({
        managed_by: "waitspin-macos",
        schema_version: 1,
        protocol_version: 1,
        token: "wbst_unit_test",
        install_id: "wins_vscode_test",
        install_target: "cursor",
        publisher_target: "status-bar-fallback",
        generation: 8,
        expires_at: "2099-07-14T12:10:00.000Z",
        api_base: "https://api.waitspin.com",
      }),
      { mode: 0o600 },
    );
    await expect(
      state.editorBootstrapDescriptorGeneration("vscode", "wins_vscode_test", {
        publisherTarget: "status-bar-fallback",
        apiBase: "https://api.waitspin.com",
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();

    await expect(
      state.writeEditorBootstrapDescriptor("vscode", descriptor, context),
    ).rejects.toThrow("fingerprint collision");
    const replacementDescriptor = {
      ...descriptor,
      token: "wbst_unit_test_replacement",
    };
    await state.writeEditorBootstrapDescriptor(
      "vscode",
      replacementDescriptor,
      context,
    );
    descriptorPath = path.join(
      descriptorDirectory,
      `wins_vscode_test.generation-8.${createHash("sha256")
        .update(replacementDescriptor.token)
        .digest("hex")
        .slice(0, 16)}.json`,
    );
    await expect(
      stat(
        path.join(
          descriptorDirectory,
          `wins_vscode_test.generation-8.${fingerprint}.json`,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await chmod(descriptorPath, 0o644);
    await expect(
      state.editorBootstrapDescriptorGeneration("vscode", "wins_vscode_test", {
        publisherTarget: "status-bar-fallback",
        apiBase: "https://api.waitspin.com",
        now: Date.parse("2026-07-14T12:00:00.000Z"),
      }),
    ).rejects.toThrow("unsafe file type");

    await expect(
      state.writeEditorBootstrapDescriptor(
        "vscode",
        { ...descriptor, token: `wbst_${"a".repeat(252)}` },
        context,
      ),
    ).rejects.toThrow("Invalid editor bootstrap descriptor");

    await expect(
      state.writeEditorBootstrapDescriptor(
        "vscode",
        {
          ...descriptor,
          expires_at: `Tue, 14 Jul 2099 12:10:00 GMT (${"a".repeat(17_000)})`,
        },
        context,
      ),
    ).rejects.toThrow("descriptor is too large");
  });

  it("reads both immutable generation descriptors and legacy install-id descriptors", async () => {
    const state = await import("../helper-state");
    const directory = path.join(state.waitspinRoot, "bootstrap", "vscode");
    const context = {
      publisherTarget: "status-bar-fallback",
      apiBase: "https://api.waitspin.com",
      now: Date.parse("2026-07-14T12:00:00.000Z"),
    };
    const persisted = {
      managed_by: "waitspin-macos",
      schema_version: 1,
      protocol_version: 1,
      token: "wbst_legacy_unit_test",
      install_id: "wins_legacy_test",
      install_target: "vscode",
      publisher_target: context.publisherTarget,
      generation: 6,
      expires_at: "2099-07-14T12:10:00.000Z",
      api_base: context.apiBase,
    };
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(directory, "wins_legacy_test.json"),
      `${JSON.stringify(persisted)}\n`,
      { mode: 0o600 },
    );

    await expect(
      state.editorBootstrapDescriptorGeneration(
        "vscode",
        "wins_legacy_test",
        context,
      ),
    ).resolves.toBe(6);

    const generationDescriptor = {
      descriptor_schema_version: 1,
      protocol_version: 1,
      token: "wbst_generation_unit_test",
      install_id: "wins_generation_test",
      install_target: "vscode",
      publisher_target: context.publisherTarget,
      generation: 7,
      expires_at: "2099-07-14T12:20:00.000Z",
      api_base: context.apiBase,
    };
    await state.writeEditorBootstrapDescriptor(
      "vscode",
      generationDescriptor,
      context,
    );
    const generationFingerprint = createHash("sha256")
      .update(generationDescriptor.token)
      .digest("hex")
      .slice(0, 16);
    const generationPath = path.join(
      directory,
      `wins_generation_test.generation-7.${generationFingerprint}.json`,
    );
    const firstIdentity = await stat(generationPath);
    await state.writeEditorBootstrapDescriptor(
      "vscode",
      generationDescriptor,
      context,
    );
    const replayIdentity = await stat(generationPath);
    expect({ dev: replayIdentity.dev, ino: replayIdentity.ino }).toEqual({
      dev: firstIdentity.dev,
      ino: firstIdentity.ino,
    });
    await expect(
      state.editorBootstrapDescriptorGeneration(
        "vscode",
        "wins_generation_test",
        context,
      ),
    ).resolves.toBe(7);
    expect(
      await readFile(path.join(directory, "wins_legacy_test.json"), "utf8"),
    ).toContain("wbst_legacy_unit_test");
  });

  it("recovers a matching helper temp hard link left after descriptor publication", async () => {
    const state = await import("../helper-state");
    const directory = path.join(state.waitspinRoot, "bootstrap", "vscode");
    const descriptor = {
      descriptor_schema_version: 1,
      protocol_version: 1,
      token: "wbst_publish_crash_replay",
      install_id: "wins_publish_crash",
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation: 11,
      expires_at: "2099-07-14T12:20:00.000Z",
      api_base: "https://api.waitspin.com",
    };
    const context = {
      publisherTarget: "status-bar-fallback",
      apiBase: "https://api.waitspin.com",
    };
    await state.writeEditorBootstrapDescriptor("vscode", descriptor, context);
    const fingerprint = createHash("sha256")
      .update(descriptor.token)
      .digest("hex")
      .slice(0, 16);
    const descriptorPath = path.join(
      directory,
      `wins_publish_crash.generation-11.${fingerprint}.json`,
    );
    const staleTempPath = path.join(
      directory,
      `.${path.basename(descriptorPath)}.${randomUUID()}.tmp`,
    );
    await link(descriptorPath, staleTempPath);
    await expect(stat(descriptorPath)).resolves.toMatchObject({ nlink: 2 });

    await state.writeEditorBootstrapDescriptor("vscode", descriptor, context);

    await expect(stat(staleTempPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(descriptorPath)).resolves.toMatchObject({ nlink: 1 });
    expect(await readFile(descriptorPath, "utf8")).toContain(
      "wbst_publish_crash_replay",
    );
  });

  it("fails closed without deleting a mismatched descriptor temp alias", async () => {
    const state = await import("../helper-state");
    const directory = path.join(state.waitspinRoot, "bootstrap", "vscode");
    const descriptor = {
      descriptor_schema_version: 1,
      protocol_version: 1,
      token: "wbst_publish_crash_mismatch",
      install_id: "wins_publish_mismatch",
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation: 12,
      expires_at: "2099-07-14T12:20:00.000Z",
      api_base: "https://api.waitspin.com",
    };
    const context = {
      publisherTarget: "status-bar-fallback",
      apiBase: "https://api.waitspin.com",
    };
    await state.writeEditorBootstrapDescriptor("vscode", descriptor, context);
    const fingerprint = createHash("sha256")
      .update(descriptor.token)
      .digest("hex")
      .slice(0, 16);
    const descriptorPath = path.join(
      directory,
      `wins_publish_mismatch.generation-12.${fingerprint}.json`,
    );
    const unexpectedLinkPath = path.join(directory, "unexpected-hard-link");
    const mismatchedTempPath = path.join(
      directory,
      `.${path.basename(descriptorPath)}.${randomUUID()}.tmp`,
    );
    await link(descriptorPath, unexpectedLinkPath);
    await writeFile(mismatchedTempPath, "different inode and content\n", {
      mode: 0o600,
    });

    await expect(
      state.writeEditorBootstrapDescriptor("vscode", descriptor, context),
    ).rejects.toThrow("unsafe file type");

    await expect(stat(descriptorPath)).resolves.toMatchObject({ nlink: 2 });
    await expect(stat(unexpectedLinkPath)).resolves.toBeDefined();
    await expect(readFile(mismatchedTempPath, "utf8")).resolves.toBe(
      "different inode and content\n",
    );
  });
});
