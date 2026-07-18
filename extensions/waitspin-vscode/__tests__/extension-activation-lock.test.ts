/** @jest-environment node */

import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acquireEditorActivationLock,
  editorActivationLockPath,
} from "../src/extension-activation-lock";
import {
  createOrReusePendingCredential,
  type SecretStorageLike,
} from "../src/extension-activation-state";

class SharedSecrets implements SecretStorageLike {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key);
  }
  async store(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

describe("editor activation lock", () => {
  it.each(["writeFile", "sync"] as const)(
    "removes its exclusive inode when %s fails",
    async (operation) => {
      const stateRoot = path.join(
        os.tmpdir(),
        `waitspin-failed-lock-${operation}-${process.pid}-${Date.now()}`,
      );
      await mkdir(stateRoot, { recursive: true, mode: 0o700 });
      const probe = await open(path.join(stateRoot, ".probe"), "w", 0o600);
      const fileHandlePrototype = Object.getPrototypeOf(probe) as {
        writeFile: typeof probe.writeFile;
        sync: typeof probe.sync;
      };
      await probe.close();
      const failure = Object.assign(new Error(`forced ${operation} failure`), {
        code: "EIO",
      });
      const failureSpy = jest
        .spyOn(fileHandlePrototype, operation)
        .mockRejectedValueOnce(failure);
      const lockPath = editorActivationLockPath(stateRoot, "vscode");

      try {
        await expect(
          acquireEditorActivationLock(stateRoot, "vscode", {
            waitTimeoutMs: 0,
          }),
        ).rejects.toBe(failure);
      } finally {
        failureSpy.mockRestore();
      }

      await expect(lstat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("recovers only a bounded-stale private incomplete lock", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-incomplete-lock-${process.pid}-${Date.now()}`,
    );
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    const lockPath = editorActivationLockPath(stateRoot, "cursor");
    await writeFile(lockPath, "", { mode: 0o600 });
    const info = await lstat(lockPath);
    const lastChangedAtMs = Math.max(
      info.birthtimeMs,
      info.ctimeMs,
      info.mtimeMs,
    );

    await expect(
      acquireEditorActivationLock(stateRoot, "cursor", {
        now: () => lastChangedAtMs + 59_999,
        staleAfterMs: 60_000,
        waitTimeoutMs: 0,
      }),
    ).rejects.toThrow("activation lock is busy");
    expect((await lstat(lockPath)).ino).toBe(info.ino);

    const recovered = await acquireEditorActivationLock(stateRoot, "cursor", {
      now: () => lastChangedAtMs + 60_001,
      staleAfterMs: 60_000,
      waitTimeoutMs: 0,
    });
    await recovered.release();
  });

  it("never unlinks an incomplete lock replaced before inode revalidation", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-replaced-lock-${process.pid}-${Date.now()}`,
    );
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    const lockPath = editorActivationLockPath(stateRoot, "devin");
    const replacementPath = path.join(stateRoot, ".replacement");
    await writeFile(lockPath, "", { mode: 0o600 });
    await writeFile(replacementPath, "replacement", { mode: 0o600 });
    const info = await lstat(lockPath);
    const lastChangedAtMs = Math.max(
      info.birthtimeMs,
      info.ctimeMs,
      info.mtimeMs,
    );
    const fsPromises =
      require("node:fs/promises") as typeof import("node:fs/promises");
    const realLstat = fsPromises.lstat.bind(fsPromises);
    let replaced = false;
    const lstatSpy = jest
      .spyOn(fsPromises, "lstat")
      .mockImplementation(async (candidatePath, options) => {
        if (!replaced && candidatePath === lockPath) {
          replaced = true;
          await rename(replacementPath, lockPath);
        }
        return realLstat(candidatePath, options as never);
      });

    try {
      await expect(
        acquireEditorActivationLock(stateRoot, "devin", {
          now: () => lastChangedAtMs + 60_001,
          staleAfterMs: 60_000,
          waitTimeoutMs: 0,
        }),
      ).rejects.toThrow("activation lock is busy");
    } finally {
      lstatSpy.mockRestore();
    }

    expect(replaced).toBe(true);
    await expect(readFile(lockPath, "utf8")).resolves.toBe("replacement");
  });

  it("never recovers an incomplete lock with unsafe permissions", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-unsafe-lock-${process.pid}-${Date.now()}`,
    );
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    const lockPath = editorActivationLockPath(stateRoot, "vscode");
    await writeFile(lockPath, "", { mode: 0o600 });
    await chmod(lockPath, 0o644);
    const info = await lstat(lockPath);

    await expect(
      acquireEditorActivationLock(stateRoot, "vscode", {
        now: () =>
          Math.max(info.birthtimeMs, info.ctimeMs, info.mtimeMs) + 60_001,
        staleAfterMs: 60_000,
        waitTimeoutMs: 0,
      }),
    ).rejects.toThrow("ownership or mode is unsafe");
    expect((await lstat(lockPath)).ino).toBe(info.ino);
  });

  it("serializes hosts and keeps credentials out of the owner-only lock", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-lock-${process.pid}-${Date.now()}`,
    );
    const first = await acquireEditorActivationLock(stateRoot, "vscode", {
      waitTimeoutMs: 10,
      retryDelayMs: 1,
    });
    await expect(
      acquireEditorActivationLock(stateRoot, "vscode", {
        waitTimeoutMs: 2,
        retryDelayMs: 1,
      }),
    ).rejects.toThrow("activation lock is busy");
    const contents = await readFile(
      editorActivationLockPath(stateRoot, "vscode"),
      "utf8",
    );
    expect(contents).not.toMatch(/wts_live_|wbst_/);
    await first.release();
    const second = await acquireEditorActivationLock(stateRoot, "vscode", {
      waitTimeoutMs: 10,
      retryDelayMs: 1,
    });
    await second.release();
  });

  it("takes over a stale lock only after validating its inode and owner record", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-stale-lock-${process.pid}-${Date.now()}`,
    );
    const initial = await acquireEditorActivationLock(stateRoot, "cursor", {
      waitTimeoutMs: 10,
      retryDelayMs: 1,
    });
    const lockPath = editorActivationLockPath(stateRoot, "cursor");
    await writeFile(
      lockPath,
      JSON.stringify({
        owner_token: "stale-owner",
        pid: 999_999,
        created_at_ms: 1,
      }),
      { mode: 0o600 },
    );
    await expect(initial.release()).resolves.toBeUndefined();
    const replacement = await acquireEditorActivationLock(stateRoot, "cursor", {
      now: () => 60_001,
      staleAfterMs: 60_000,
      waitTimeoutMs: 10,
      retryDelayMs: 1,
    });
    await replacement.release();
  });

  it("makes two hosts converge on the pending key stored by the lock winner", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-race-lock-${process.pid}-${Date.now()}`,
    );
    const secrets = new SharedSecrets();
    const activationDescriptor = {
      token: `wbst_${"a".repeat(43)}`,
      installId: "wins_lock_race",
      installTarget: "vscode" as const,
      publisherTarget: "status-bar-fallback" as const,
      generation: 1,
      expiresAt: "2026-07-16T00:00:00.000Z",
      apiBase: "https://api.waitspin.com",
    };
    const firstLock = await acquireEditorActivationLock(stateRoot, "vscode");
    const first = await createOrReusePendingCredential(
      secrets,
      activationDescriptor,
    );
    await firstLock.release();
    const secondLock = await acquireEditorActivationLock(stateRoot, "vscode");
    const second = await createOrReusePendingCredential(
      secrets,
      activationDescriptor,
    );
    await secondLock.release();
    expect(second.apiKey).toBe(first.apiKey);
  });

  it("does not take over a stale timestamp owned by a live process", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-live-lock-${process.pid}-${Date.now()}`,
    );
    const held = await acquireEditorActivationLock(stateRoot, "devin");
    const lockPath = editorActivationLockPath(stateRoot, "devin");
    const owner = JSON.parse(await readFile(lockPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(lockPath, JSON.stringify({ ...owner, created_at_ms: 1 }), {
      mode: 0o600,
    });
    await expect(
      acquireEditorActivationLock(stateRoot, "devin", {
        now: () => 60_001,
        staleAfterMs: 60_000,
        waitTimeoutMs: 0,
      }),
    ).rejects.toThrow("activation lock is busy");
    await held.release();
  });
});
