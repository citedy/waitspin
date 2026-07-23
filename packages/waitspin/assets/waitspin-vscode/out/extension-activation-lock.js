"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editorActivationLockPath = editorActivationLockPath;
exports.acquireEditorActivationLock = acquireEditorActivationLock;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
function errorCode(error) {
    return error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
}
function editorActivationLockPath(stateRoot, target) {
    return node_path_1.default.join(stateRoot, `.${target}-activation.lock`);
}
async function ensurePrivateStateRoot(stateRoot) {
    await (0, promises_1.mkdir)(stateRoot, { recursive: true, mode: 0o700 });
    let info = await (0, promises_1.lstat)(stateRoot);
    const uid = process.getuid?.();
    if (!info.isDirectory() ||
        info.isSymbolicLink() ||
        (uid !== undefined && info.uid !== uid)) {
        throw new Error("WaitSpin state directory ownership or mode is unsafe");
    }
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        await (0, promises_1.chmod)(stateRoot, 0o700);
        info = await (0, promises_1.lstat)(stateRoot);
        if ((info.mode & 0o077) !== 0) {
            throw new Error("WaitSpin state directory ownership or mode is unsafe");
        }
    }
}
function parseOwnerRecord(value) {
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed.owner_token !== "string" ||
            parsed.owner_token.length < 8 ||
            !Number.isSafeInteger(parsed.pid) ||
            Number(parsed.pid) <= 0 ||
            !Number.isSafeInteger(parsed.created_at_ms) ||
            Number(parsed.created_at_ms) < 0) {
            return undefined;
        }
        return {
            ownerToken: parsed.owner_token,
            pid: Number(parsed.pid),
            createdAtMs: Number(parsed.created_at_ms),
        };
    }
    catch {
        return undefined;
    }
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return errorCode(error) !== "ESRCH";
    }
}
function safeLockIdentity(info) {
    const uid = process.getuid?.();
    if (!info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1 ||
        info.size > 4_096 ||
        (uid !== undefined && info.uid !== uid) ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
        return undefined;
    }
    return { device: info.dev, inode: info.ino };
}
async function inspectLock(lockPath) {
    let handle;
    try {
        handle = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    }
    catch (error) {
        return errorCode(error) === "ENOENT"
            ? { kind: "missing" }
            : { kind: "unsafe" };
    }
    try {
        const info = await handle.stat();
        const identity = safeLockIdentity(info);
        if (!identity)
            return { kind: "unsafe" };
        const owner = parseOwnerRecord(await handle.readFile({ encoding: "utf8" }));
        if (!owner) {
            return {
                kind: "incomplete",
                identity,
                lastChangedAtMs: Math.max(info.birthtimeMs, info.ctimeMs, info.mtimeMs),
            };
        }
        return { kind: "owned", identity, owner };
    }
    finally {
        await handle.close();
    }
}
async function unlinkMatchingSafeLock(lockPath, identity) {
    const handle = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW).catch(() => undefined);
    if (!handle)
        return false;
    try {
        const currentIdentity = safeLockIdentity(await handle.stat());
        if (!currentIdentity ||
            currentIdentity.device !== identity.device ||
            currentIdentity.inode !== identity.inode) {
            return false;
        }
        const pathInfo = await (0, promises_1.lstat)(lockPath).catch(() => undefined);
        if (!pathInfo ||
            pathInfo.dev !== identity.device ||
            pathInfo.ino !== identity.inode) {
            return false;
        }
        await (0, promises_1.unlink)(lockPath);
        return true;
    }
    finally {
        await handle.close();
    }
}
async function unlinkMatchingLock(lockPath, identity, ownerToken) {
    const current = await inspectLock(lockPath);
    if (current.kind !== "owned" ||
        current.identity.device !== identity.device ||
        current.identity.inode !== identity.inode ||
        current.owner.ownerToken !== ownerToken) {
        return false;
    }
    return unlinkMatchingSafeLock(lockPath, identity);
}
async function unlinkMatchingIncompleteLock(lockPath, identity, nowMs, staleAfterMs) {
    const current = await inspectLock(lockPath);
    if (current.kind !== "incomplete" ||
        current.identity.device !== identity.device ||
        current.identity.inode !== identity.inode ||
        nowMs - current.lastChangedAtMs < staleAfterMs) {
        return false;
    }
    return unlinkMatchingSafeLock(lockPath, identity);
}
async function createLock(lockPath, owner) {
    const handle = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_RDWR |
        node_fs_1.constants.O_CREAT |
        node_fs_1.constants.O_EXCL |
        node_fs_1.constants.O_NOFOLLOW, 0o600);
    let identity;
    try {
        const info = await handle.stat();
        identity = { device: info.dev, inode: info.ino };
        await handle.writeFile(JSON.stringify({
            owner_token: owner.ownerToken,
            pid: owner.pid,
            created_at_ms: owner.createdAtMs,
        }), "utf8");
        await handle.sync();
        return { handle, identity };
    }
    catch (error) {
        await handle.close().catch(() => undefined);
        if (identity) {
            await unlinkMatchingSafeLock(lockPath, identity).catch(() => false);
        }
        throw error;
    }
}
async function acquireEditorActivationLock(stateRoot, target, options = {}) {
    const now = options.now ?? Date.now;
    const retryDelayMs = options.retryDelayMs ?? 50;
    const staleAfterMs = options.staleAfterMs ?? 30_000;
    const waitTimeoutMs = options.waitTimeoutMs ?? 10_000;
    await ensurePrivateStateRoot(stateRoot);
    const lockPath = editorActivationLockPath(stateRoot, target);
    const owner = {
        ownerToken: (0, node_crypto_1.randomUUID)(),
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
                    if (released)
                        return;
                    released = true;
                    await created.handle.close();
                    await unlinkMatchingLock(lockPath, created.identity, owner.ownerToken).catch(() => false);
                },
            };
        }
        catch (error) {
            if (errorCode(error) !== "EEXIST")
                throw error;
            const existing = await inspectLock(lockPath);
            if (existing.kind === "owned" &&
                !isProcessAlive(existing.owner.pid) &&
                (await unlinkMatchingLock(lockPath, existing.identity, existing.owner.ownerToken))) {
                continue;
            }
            if (existing.kind === "incomplete" &&
                now() - existing.lastChangedAtMs >= staleAfterMs &&
                (await unlinkMatchingIncompleteLock(lockPath, existing.identity, now(), staleAfterMs))) {
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
//# sourceMappingURL=extension-activation-lock.js.map