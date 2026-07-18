import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, lstatSync, type Stats } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isEditorTarget } from "./managed-install-orchestration.js";

const LOCK_TIMEOUT_MS = 15_000;
const LOCK_STALE_MS = 10 * 60_000;
const MAX_BOOTSTRAP_DESCRIPTOR_BYTES = 16 * 1024;
const MAX_BOOTSTRAP_TOKEN_CHARACTERS = 256;
const BOOTSTRAP_TOKEN_PATTERN = /^wbst_[A-Za-z0-9_-]+$/;
const DESCRIPTOR_FINGERPRINT_PATTERN = /^[a-f0-9]{16}$/;
export const PUBLISHER_INSTALL_ID_PATTERN = /^wins_[A-Za-z0-9._-]{3,123}$/;

export type HelperJournalTarget = {
  install_id: string;
  generation: number;
  state: string;
  updated_at: string;
};

export type HelperJournal = {
  schema_version: 1;
  operation_id: string;
  phase: string;
  targets: Record<string, HelperJournalTarget>;
  updated_at: string;
};

export function resolveWaitspinRoot(
  home: string,
  configured = process.env.WAITSPIN_STATE_ROOT,
): string {
  const root = configured?.trim() || path.join(home, ".waitspin");
  const relative = path.relative(home, root);
  if (
    !path.isAbsolute(root) ||
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("WaitSpin state root must be an absolute path inside the current home");
  }
  return path.normalize(root);
}

export const waitspinRoot = resolveWaitspinRoot(os.homedir());
const lockPath = path.join(waitspinRoot, "install-operation.lock");
const journalPath = path.join(waitspinRoot, "install-operation-journal.json");

function pathComponents(root: string, leaf: string): string[] {
  const relative = path.relative(root, leaf);
  let current = root;
  return relative
    .split(path.sep)
    .filter(Boolean)
    .map((component) => {
      current = path.join(current, component);
      return current;
    });
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  const relative = path.relative(waitspinRoot, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to manage a directory outside ~/.waitspin");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const candidate of [
    waitspinRoot,
    ...pathComponents(waitspinRoot, directory),
  ]) {
    const info = await stat(candidate);
    if (!info.isDirectory() || info.uid !== process.getuid?.()) {
      throw new Error("WaitSpin managed directory ownership check failed");
    }
    if (lstatSync(candidate).isSymbolicLink()) {
      throw new Error("Managed directory cannot be a symlink");
    }
    await chmod(candidate, 0o700);
  }
}

export async function atomicPrivateJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  const directory = path.dirname(filePath);
  await ensurePrivateDirectory(directory);
  const dirHandle = await open(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(
      tempPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      const existing = await stat(filePath);
      if (
        !existing.isFile() ||
        existing.uid !== process.getuid?.() ||
        existing.nlink !== 1
      ) {
        throw new Error("Managed file ownership check failed");
      }
      if (lstatSync(filePath).isSymbolicLink()) {
        throw new Error("Managed file cannot be a symlink");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(tempPath, filePath);
    await chmod(filePath, 0o600);
    await dirHandle.sync();
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
    await dirHandle.close();
  }
}

function bootstrapTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function generationDescriptorFilename(
  installId: string,
  generation: number,
  token: string,
): string {
  return `${installId}.generation-${generation}.${bootstrapTokenFingerprint(token)}.json`;
}

function unsafeEditorBootstrapDescriptor(): Error {
  return new Error("Editor bootstrap descriptor has an unsafe file type");
}

async function reconcileCrashLeftDescriptorAlias(
  filePath: string,
  currentTempPath: string,
  serialized: string,
  canonicalHandle: FileHandle,
  canonicalInfo: Stats,
  dirHandle: FileHandle,
): Promise<void> {
  if (canonicalInfo.nlink !== 2) {
    throw unsafeEditorBootstrapDescriptor();
  }
  const directory = path.dirname(filePath);
  const escapedBasename = path
    .basename(filePath)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const helperTempPattern = new RegExp(
    `^\\.${escapedBasename}\\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.tmp$`,
    "i",
  );
  const aliases = (await readdir(directory)).filter((name) => {
    const candidatePath = path.join(directory, name);
    return candidatePath !== currentTempPath && helperTempPattern.test(name);
  });
  if (aliases.length !== 1) {
    throw unsafeEditorBootstrapDescriptor();
  }

  const aliasPath = path.join(directory, aliases[0]);
  let aliasHandle: FileHandle;
  try {
    aliasHandle = await open(
      aliasPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch {
    throw unsafeEditorBootstrapDescriptor();
  }
  try {
    const aliasInfo = await aliasHandle.stat();
    if (
      !aliasInfo.isFile() ||
      aliasInfo.uid !== process.getuid?.() ||
      aliasInfo.nlink !== canonicalInfo.nlink ||
      (aliasInfo.mode & 0o077) !== 0 ||
      aliasInfo.dev !== canonicalInfo.dev ||
      aliasInfo.ino !== canonicalInfo.ino ||
      aliasInfo.size !== canonicalInfo.size ||
      (await aliasHandle.readFile({ encoding: "utf8" })) !== serialized
    ) {
      throw unsafeEditorBootstrapDescriptor();
    }
    const aliasPathInfo = await lstat(aliasPath);
    const canonicalPathInfo = await lstat(filePath);
    if (
      aliasPathInfo.isSymbolicLink() ||
      !aliasPathInfo.isFile() ||
      aliasPathInfo.dev !== aliasInfo.dev ||
      aliasPathInfo.ino !== aliasInfo.ino ||
      canonicalPathInfo.isSymbolicLink() ||
      !canonicalPathInfo.isFile() ||
      canonicalPathInfo.dev !== canonicalInfo.dev ||
      canonicalPathInfo.ino !== canonicalInfo.ino
    ) {
      throw unsafeEditorBootstrapDescriptor();
    }
    await unlink(aliasPath);
    await dirHandle.sync();
    const repairedInfo = await canonicalHandle.stat();
    const repairedPathInfo = await lstat(filePath);
    if (
      repairedInfo.nlink !== 1 ||
      repairedPathInfo.dev !== canonicalInfo.dev ||
      repairedPathInfo.ino !== canonicalInfo.ino
    ) {
      throw unsafeEditorBootstrapDescriptor();
    }
  } finally {
    await aliasHandle.close();
  }
}

async function immutablePrivateJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  const directory = path.dirname(filePath);
  await ensurePrivateDirectory(directory);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  const dirHandle = await open(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    const handle = await open(
      tempPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(tempPath, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await open(
        filePath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      try {
        const info = await existing.stat();
        if (
          !info.isFile() ||
          info.uid !== process.getuid?.() ||
          (info.mode & 0o077) !== 0 ||
          info.size < 1 ||
          info.size > MAX_BOOTSTRAP_DESCRIPTOR_BYTES
        ) {
          throw unsafeEditorBootstrapDescriptor();
        }
        if ((await existing.readFile({ encoding: "utf8" })) !== serialized) {
          throw new Error("Editor bootstrap descriptor fingerprint collision");
        }
        if (info.nlink !== 1) {
          await reconcileCrashLeftDescriptorAlias(
            filePath,
            tempPath,
            serialized,
            existing,
            info,
            dirHandle,
          );
        }
      } finally {
        await existing.close();
      }
      await unlink(tempPath);
      await dirHandle.sync();
      return;
    }
    await unlink(tempPath);
    await chmod(filePath, 0o600);
    await dirHandle.sync();
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
    await dirHandle.close();
  }
}

export async function acquireHelperLock(): Promise<() => Promise<void>> {
  await ensurePrivateDirectory(waitspinRoot);
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    const ownerToken = randomUUID();
    let createdLock = false;
    try {
      await mkdir(lockPath, { mode: 0o700 });
      createdLock = true;
      await writeFile(
        path.join(lockPath, "owner.json"),
        JSON.stringify({
          pid: process.pid,
          token: ownerToken,
          created_at: new Date().toISOString(),
        }),
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      return async () => {
        const owner = await readLockOwner().catch(() => null);
        if (owner?.token === ownerToken) {
          await rm(lockPath, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (createdLock) {
        await rm(lockPath, { recursive: true, force: true }).catch(
          () => undefined,
        );
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const info = await lstat(lockPath).catch(() => null);
      if (!info || !info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("WaitSpin helper lock has an unsafe file type");
      }
      const owner = await readLockOwner().catch(() => null);
      if (
        owner &&
        Date.now() - info.mtimeMs > LOCK_STALE_MS &&
        !processIsAlive(owner.pid)
      ) {
        const currentInfo = await lstat(lockPath).catch(() => null);
        const currentOwner = await readLockOwner().catch(() => null);
        if (
          currentInfo?.dev === info.dev &&
          currentInfo?.ino === info.ino &&
          currentOwner?.token === owner.token
        ) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Another WaitSpin install operation is active");
}

type HelperLockOwner = { pid: number; token: string; created_at: string };

async function readLockOwner(): Promise<HelperLockOwner> {
  const ownerPath = path.join(lockPath, "owner.json");
  const info = await lstat(ownerPath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.()
  ) {
    throw new Error("WaitSpin helper lock owner is invalid");
  }
  const owner = JSON.parse(
    await readFile(ownerPath, "utf8"),
  ) as Partial<HelperLockOwner>;
  if (
    !Number.isSafeInteger(owner.pid) ||
    Number(owner.pid) <= 0 ||
    typeof owner.token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      owner.token,
    ) ||
    typeof owner.created_at !== "string" ||
    !Number.isFinite(new Date(owner.created_at).getTime())
  ) {
    throw new Error("WaitSpin helper lock owner is invalid");
  }
  return owner as HelperLockOwner;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function loadHelperJournal(): Promise<HelperJournal> {
  let raw: string;
  try {
    raw = await readFile(journalPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return newHelperJournal();
  }
  const parsed = JSON.parse(raw) as Partial<HelperJournal>;
  if (!isHelperJournal(parsed)) {
    throw new Error("WaitSpin helper journal is invalid");
  }
  return parsed;
}

type EditorBootstrapDescriptorContext = {
  publisherTarget: string;
  apiBase: string;
  now?: number;
};

export async function writeEditorBootstrapDescriptor(
  target: string,
  descriptor: Record<string, unknown>,
  context: Omit<EditorBootstrapDescriptorContext, "now">,
): Promise<void> {
  const installId = descriptor.install_id;
  const generation = descriptor.generation;
  const expiresAt = descriptor.expires_at;
  if (
    !isEditorTarget(target) ||
    typeof installId !== "string" ||
    !PUBLISHER_INSTALL_ID_PATTERN.test(installId) ||
    descriptor.install_target !== target ||
    descriptor.publisher_target !== context.publisherTarget ||
    descriptor.api_base !== context.apiBase ||
    descriptor.descriptor_schema_version !== 1 ||
    descriptor.protocol_version !== 1 ||
    typeof descriptor.token !== "string" ||
    !BOOTSTRAP_TOKEN_PATTERN.test(descriptor.token) ||
    descriptor.token.length > MAX_BOOTSTRAP_TOKEN_CHARACTERS ||
    !Number.isSafeInteger(generation) ||
    (generation as number) < 1 ||
    typeof expiresAt !== "string" ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new Error("Invalid editor bootstrap descriptor");
  }
  const persistedDescriptor = {
    managed_by: "waitspin-macos",
    schema_version: descriptor.descriptor_schema_version,
    protocol_version: descriptor.protocol_version,
    token: descriptor.token,
    install_id: installId,
    install_target: target,
    publisher_target: descriptor.publisher_target,
    generation,
    expires_at: expiresAt,
    api_base: descriptor.api_base,
  };
  const serialized = `${JSON.stringify(persistedDescriptor, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_BOOTSTRAP_DESCRIPTOR_BYTES) {
    throw new Error("Editor bootstrap descriptor is too large");
  }
  const directory = path.join(waitspinRoot, "bootstrap", target);
  const filename = generationDescriptorFilename(
    installId,
    generation as number,
    descriptor.token as string,
  );
  await immutablePrivateJson(
    path.join(directory, filename),
    persistedDescriptor,
  );
  for (const candidate of await readdir(directory)) {
    const prefix = `${installId}.generation-${generation}.`;
    if (
      candidate !== filename &&
      candidate.startsWith(prefix) &&
      candidate.endsWith(".json") &&
      DESCRIPTOR_FINGERPRINT_PATTERN.test(
        candidate.slice(prefix.length, -".json".length),
      )
    ) {
      await unlink(path.join(directory, candidate)).catch(() => undefined);
    }
  }
}

export async function editorBootstrapDescriptorGeneration(
  target: string,
  installId: string,
  context: EditorBootstrapDescriptorContext,
): Promise<number | undefined> {
  if (
    !isEditorTarget(target) ||
    !PUBLISHER_INSTALL_ID_PATTERN.test(installId)
  ) {
    throw new Error("Invalid editor bootstrap descriptor identity");
  }
  const directory = path.join(waitspinRoot, "bootstrap", target);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const candidates = names.filter(
    (name) =>
      name === `${installId}.json` ||
      new RegExp(
        `^${installId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.generation-[1-9][0-9]*\\.[a-f0-9]{16}\\.json$`,
      ).test(name),
  );
  let newest:
    { generation: number; expiresAt: number; canonical: boolean } | undefined;
  for (const name of candidates) {
    const descriptorPath = path.join(directory, name);
    const handle = await open(
      descriptorPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    ).catch(() => undefined);
    if (!handle) continue;
    try {
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        info.nlink !== 1 ||
        (info.mode & 0o077) !== 0 ||
        info.size < 1 ||
        info.size > MAX_BOOTSTRAP_DESCRIPTOR_BYTES
      ) {
        throw new Error("Editor bootstrap descriptor has an unsafe file type");
      }
      let descriptor: unknown;
      try {
        const buffer = Buffer.alloc(MAX_BOOTSTRAP_DESCRIPTOR_BYTES + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_BOOTSTRAP_DESCRIPTOR_BYTES) continue;
        descriptor = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
      } catch {
        continue;
      }
      if (
        !descriptor ||
        typeof descriptor !== "object" ||
        Array.isArray(descriptor)
      ) {
        continue;
      }
      const value = descriptor as Record<string, unknown>;
      if (
        value.managed_by !== "waitspin-macos" ||
        value.schema_version !== 1 ||
        value.protocol_version !== 1 ||
        value.install_id !== installId ||
        value.install_target !== target ||
        value.publisher_target !== context.publisherTarget ||
        value.api_base !== context.apiBase ||
        typeof value.token !== "string" ||
        !BOOTSTRAP_TOKEN_PATTERN.test(value.token) ||
        value.token.length > MAX_BOOTSTRAP_TOKEN_CHARACTERS ||
        !Number.isSafeInteger(value.generation) ||
        (value.generation as number) < 1 ||
        typeof value.expires_at !== "string"
      ) {
        continue;
      }
      const now = context.now ?? Date.now();
      const expiresAt = Date.parse(value.expires_at);
      if (
        !Number.isFinite(now) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now
      ) {
        continue;
      }
      const canonicalName = generationDescriptorFilename(
        installId,
        value.generation as number,
        value.token,
      );
      if (name !== `${installId}.json` && name !== canonicalName) continue;
      const candidate = {
        generation: value.generation as number,
        expiresAt,
        canonical: name === canonicalName,
      };
      if (
        !newest ||
        candidate.generation > newest.generation ||
        (candidate.generation === newest.generation &&
          Number(candidate.canonical) > Number(newest.canonical)) ||
        (candidate.generation === newest.generation &&
          candidate.canonical === newest.canonical &&
          candidate.expiresAt > newest.expiresAt)
      ) {
        newest = candidate;
      }
    } finally {
      await handle.close();
    }
  }
  return newest?.generation;
}

function newHelperJournal(): HelperJournal {
  return {
    schema_version: 1,
    operation_id: randomUUID(),
    phase: "idle",
    targets: {},
    updated_at: new Date().toISOString(),
  };
}

function isHelperJournal(
  value: Partial<HelperJournal>,
): value is HelperJournal {
  if (
    value.schema_version !== 1 ||
    typeof value.operation_id !== "string" ||
    typeof value.phase !== "string" ||
    !value.targets ||
    typeof value.targets !== "object" ||
    Array.isArray(value.targets) ||
    typeof value.updated_at !== "string"
  ) {
    return false;
  }
  return Object.values(value.targets).every(
    (target) =>
      target &&
      typeof target.install_id === "string" &&
      Number.isSafeInteger(target.generation) &&
      target.generation >= 1 &&
      typeof target.state === "string" &&
      typeof target.updated_at === "string",
  );
}

export async function saveHelperJournal(journal: HelperJournal): Promise<void> {
  journal.updated_at = new Date().toISOString();
  await atomicPrivateJson(journalPath, journal);
}

export function markBootstrapIssued(
  journal: HelperJournal,
  input: {
    target: string;
    installId: string;
    generation: number;
    updatedAt?: string;
  },
): void {
  journal.targets[input.target] = {
    install_id: input.installId,
    generation: input.generation,
    state: "bootstrap_issued",
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
}
