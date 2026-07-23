import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import type { EditorInstallTarget } from "./extension-core";

type LockOptions = {
  now?: () => number;
  retryDelayMs?: number;
  staleAfterMs?: number;
  waitTimeoutMs?: number;
};

type OwnerRecord = {
  ownerToken: string;
  pid: number;
  createdAtMs: number;
};

type LockFileIdentity = {
  device: number;
  inode: number;
};

type LockInspection =
  | { kind: "missing" }
  | { kind: "unsafe" }
  | {
      kind: "incomplete";
      identity: LockFileIdentity;
      lastChangedAtMs: number;
    }
  | {
      kind: "owned";
      identity: LockFileIdentity;
      owner: OwnerRecord;
    };

export type EditorActivationLock = {
  release(): Promise<void>;
};

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function editorActivationLockPath(
  stateRoot: string,
  target: EditorInstallTarget,
): string {
  return path.join(stateRoot, `.${target}-activation.lock`);
}

async function ensurePrivateStateRoot(stateRoot: string): Promise<void> {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  let info = await lstat(stateRoot);
  const uid = process.getuid?.();
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (uid !== undefined && info.uid !== uid)
  ) {
    throw new Error("WaitSpin state directory ownership or mode is unsafe");
  }
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    await chmod(stateRoot, 0o700);
    info = await lstat(stateRoot);
    if ((info.mode & 0o077) !== 0) {
      throw new Error("WaitSpin state directory ownership or mode is unsafe");
    }
  }
}

function parseOwnerRecord(value: string): OwnerRecord | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.owner_token !== "string" ||
      parsed.owner_token.length < 8 ||
      !Number.isSafeInteger(parsed.pid) ||
      Number(parsed.pid) <= 0 ||
      !Number.isSafeInteger(parsed.created_at_ms) ||
      Number(parsed.created_at_ms) < 0
    ) {
      return undefined;
    }
    return {
      ownerToken: parsed.owner_token,
      pid: Number(parsed.pid),
      createdAtMs: Number(parsed.created_at_ms),
    };
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function safeLockIdentity(info: {
  dev: number;
  ino: number;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  nlink: number;
  size: number;
  uid: number;
}): LockFileIdentity | undefined {
  const uid = process.getuid?.();
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > 4_096 ||
    (uid !== undefined && info.uid !== uid) ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0)
  ) {
    return undefined;
  }
  return { device: info.dev, inode: info.ino };
}

async function inspectLock(lockPath: string): Promise<LockInspection> {
  let handle: FileHandle;
  try {
    handle = await open(
      lockPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { kind: "missing" }
      : { kind: "unsafe" };
  }
  try {
    const info = await handle.stat();
    const identity = safeLockIdentity(info);
    if (!identity) return { kind: "unsafe" };
    const owner = parseOwnerRecord(await handle.readFile({ encoding: "utf8" }));
    if (!owner) {
      return {
        kind: "incomplete",
        identity,
        lastChangedAtMs: Math.max(info.birthtimeMs, info.ctimeMs, info.mtimeMs),
      };
    }
    return { kind: "owned", identity, owner };
  } finally {
    await handle.close();
  }
}

async function unlinkMatchingSafeLock(
  lockPath: string,
  identity: LockFileIdentity,
): Promise<boolean> {
  const handle = await open(
    lockPath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  ).catch(() => undefined);
  if (!handle) return false;
  try {
    const currentIdentity = safeLockIdentity(await handle.stat());
    if (
      !currentIdentity ||
      currentIdentity.device !== identity.device ||
      currentIdentity.inode !== identity.inode
    ) {
      return false;
    }
    const pathInfo = await lstat(lockPath).catch(() => undefined);
    if (
      !pathInfo ||
      pathInfo.dev !== identity.device ||
      pathInfo.ino !== identity.inode
    ) {
      return false;
    }
    await unlink(lockPath);
    return true;
  } finally {
    await handle.close();
  }
}

async function unlinkMatchingLock(
  lockPath: string,
  identity: LockFileIdentity,
  ownerToken: string,
): Promise<boolean> {
  const current = await inspectLock(lockPath);
  if (
    current.kind !== "owned" ||
    current.identity.device !== identity.device ||
    current.identity.inode !== identity.inode ||
    current.owner.ownerToken !== ownerToken
  ) {
    return false;
  }
  return unlinkMatchingSafeLock(lockPath, identity);
}

async function unlinkMatchingIncompleteLock(
  lockPath: string,
  identity: LockFileIdentity,
  nowMs: number,
  staleAfterMs: number,
): Promise<boolean> {
  const current = await inspectLock(lockPath);
  if (
    current.kind !== "incomplete" ||
    current.identity.device !== identity.device ||
    current.identity.inode !== identity.inode ||
    nowMs - current.lastChangedAtMs < staleAfterMs
  ) {
    return false;
  }
  return unlinkMatchingSafeLock(lockPath, identity);
}

async function createLock(
  lockPath: string,
  owner: OwnerRecord,
): Promise<{ handle: FileHandle; identity: LockFileIdentity }> {
  const handle = await open(
    lockPath,
    fsConstants.O_RDWR |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_NOFOLLOW,
    0o600,
  );
  let identity: LockFileIdentity | undefined;
  try {
    const info = await handle.stat();
    identity = { device: info.dev, inode: info.ino };
    await handle.writeFile(
      JSON.stringify({
        owner_token: owner.ownerToken,
        pid: owner.pid,
        created_at_ms: owner.createdAtMs,
      }),
      "utf8",
    );
    await handle.sync();
    return { handle, identity };
  } catch (error) {
    await handle.close().catch(() => undefined);
    if (identity) {
      await unlinkMatchingSafeLock(lockPath, identity).catch(() => false);
    }
    throw error;
  }
}

export async function acquireEditorActivationLock(
  stateRoot: string,
  target: EditorInstallTarget,
  options: LockOptions = {},
): Promise<EditorActivationLock> {
  const now = options.now ?? Date.now;
  const retryDelayMs = options.retryDelayMs ?? 50;
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const waitTimeoutMs = options.waitTimeoutMs ?? 10_000;
  await ensurePrivateStateRoot(stateRoot);
  const lockPath = editorActivationLockPath(stateRoot, target);
  const owner: OwnerRecord = {
    ownerToken: randomUUID(),
    pid: process.pid,
    createdAtMs: now(),
  };
  const deadline = now() + waitTimeoutMs;

  while (true) {
    try {
      const created = await createLock(lockPath, owner);
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          await created.handle.close();
          await unlinkMatchingLock(
            lockPath,
            created.identity,
            owner.ownerToken,
          ).catch(() => false);
        },
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await inspectLock(lockPath);
      if (
        existing.kind === "owned" &&
        !isProcessAlive(existing.owner.pid) &&
        (await unlinkMatchingLock(
          lockPath,
          existing.identity,
          existing.owner.ownerToken,
        ))
      ) {
        continue;
      }
      if (
        existing.kind === "incomplete" &&
        now() - existing.lastChangedAtMs >= staleAfterMs &&
        (await unlinkMatchingIncompleteLock(
          lockPath,
          existing.identity,
          now(),
          staleAfterMs,
        ))
      ) {
        continue;
      }
      if (existing.kind === "unsafe") {
        throw new Error("WaitSpin activation lock ownership or mode is unsafe");
      }
      if (now() >= deadline) {
        throw new Error("WaitSpin activation lock is busy");
      }
      await sleep(retryDelayMs);
    }
  }
}
