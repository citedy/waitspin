"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY = void 0;
exports.retireManagedEditorBootstrapDescriptors = retireManagedEditorBootstrapDescriptors;
exports.runManagedEditorActivation = runManagedEditorActivation;
exports.runManualEditorActivation = runManualEditorActivation;
exports.migrateLegacyManagedActivation = migrateLegacyManagedActivation;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const extension_core_1 = require("./extension-core");
const extension_activation_state_1 = require("./extension-activation-state");
const extension_activation_lock_1 = require("./extension-activation-lock");
const extension_activation_retry_1 = require("./extension-activation-retry");
const extension_manual_activation_1 = require("./extension-manual-activation");
exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY = "waitspin.publisherBootstrapGeneration";
function expectedManagedApiBase(allowDeveloperApiBase) {
    const normalized = (0, extension_core_1.resolveWaitSpinApiBase)(undefined, process.env.WAITSPIN_BASE_URL, allowDeveloperApiBase);
    if (!normalized) {
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "configured API base is invalid");
    }
    return normalized;
}
function descriptorFingerprint(token) {
    return (0, node_crypto_1.createHash)("sha256").update(token).digest("hex").slice(0, 16);
}
function descriptorFilename(descriptor) {
    return `${descriptor.installId}.generation-${descriptor.generation}.${descriptorFingerprint(descriptor.token)}.json`;
}
async function loadEditorBootstrapDescriptors(stateRoot, installTarget, allowExpired, allowDeveloperApiBase = false) {
    const expectedApiBase = expectedManagedApiBase(allowDeveloperApiBase);
    const directory = node_path_1.default.join(stateRoot, "bootstrap", installTarget);
    let directoryInfo;
    try {
        directoryInfo = await (0, promises_1.lstat)(directory);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "bootstrap directory could not be inspected safely", { cause: error });
    }
    if (!directoryInfo.isDirectory() ||
        directoryInfo.isSymbolicLink() ||
        directoryInfo.uid !== process.getuid?.() ||
        (directoryInfo.mode & 0o077) !== 0) {
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "bootstrap directory ownership or mode is unsafe");
    }
    const candidates = (await (0, promises_1.readdir)(directory)).filter((name) => /^wins_[A-Za-z0-9._-]{3,123}(?:\.generation-[1-9][0-9]*\.[a-f0-9]{16})?\.json$/.test(name));
    const valid = [];
    const nowMs = Date.now();
    let latestExpiredAtMs;
    let unsafeCandidate = false;
    for (const name of candidates) {
        const filePath = node_path_1.default.join(directory, name);
        const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW).catch(() => undefined);
        if (!handle) {
            unsafeCandidate = true;
            continue;
        }
        try {
            const info = await handle.stat();
            if (!info.isFile() ||
                info.uid !== process.getuid?.() ||
                info.nlink !== 1 ||
                (info.mode & 0o077) !== 0 ||
                info.size > 16 * 1024) {
                unsafeCandidate = true;
                continue;
            }
            const raw = await handle.readFile({ encoding: "utf8" });
            const payload = JSON.parse(raw);
            const descriptor = (0, extension_core_1.parseEditorBootstrapDescriptor)(payload, installTarget, allowExpired ? 0 : nowMs, allowDeveloperApiBase, expectedApiBase);
            const expiredDescriptor = descriptor
                ? undefined
                : (0, extension_core_1.parseEditorBootstrapDescriptor)(payload, installTarget, 0, allowDeveloperApiBase, expectedApiBase);
            const expiresAtMs = expiredDescriptor
                ? Date.parse(expiredDescriptor.expiresAt)
                : undefined;
            if (expiresAtMs !== undefined && expiresAtMs <= nowMs) {
                latestExpiredAtMs = Math.max(latestExpiredAtMs ?? 0, expiresAtMs);
                continue;
            }
            const canonicalName = descriptor ? descriptorFilename(descriptor) : "";
            const legacyName = descriptor ? `${descriptor.installId}.json` : "";
            if (!descriptor ||
                (node_path_1.default.basename(filePath) !== canonicalName &&
                    node_path_1.default.basename(filePath) !== legacyName)) {
                unsafeCandidate = true;
                continue;
            }
            valid.push({
                filePath,
                device: info.dev,
                inode: info.ino,
                digest: (0, node_crypto_1.createHash)("sha256").update(raw).digest("hex"),
                canonical: node_path_1.default.basename(filePath) === canonicalName,
                modifiedAtMs: info.mtimeMs,
                descriptor,
            });
        }
        catch (error) {
            if (error instanceof extension_activation_retry_1.EditorActivationFailure)
                throw error;
            unsafeCandidate = true;
            continue;
        }
        finally {
            await handle.close();
        }
    }
    if (unsafeCandidate) {
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "bootstrap descriptor ownership, mode, or contents are unsafe");
    }
    if (valid.length === 0 && latestExpiredAtMs !== undefined) {
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "credential-expired", "bootstrap descriptor has expired", { expiresAtMs: latestExpiredAtMs });
    }
    return valid;
}
async function loadEditorBootstrapDescriptor(stateRoot, installTarget, expected, allowExpired = expected !== undefined, allowDeveloperApiBase = false) {
    const valid = await loadEditorBootstrapDescriptors(stateRoot, installTarget, allowExpired, allowDeveloperApiBase);
    const selected = (0, extension_core_1.selectEditorBootstrapCandidate)(valid, expected);
    if (selected.kind === "ambiguous") {
        throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "bootstrap descriptors have an ambiguous generation");
    }
    return selected.kind === "selected" ? selected.candidate : undefined;
}
function requestManagedActivation(input, pending, phase, url, init) {
    return (0, extension_activation_retry_1.requestEditorActivation)({
        phase,
        url,
        init,
        signal: input.signal,
        expiresAtMs: Date.parse(pending.descriptorExpiresAt),
        fetchWithTimeout: input.fetchWithTimeout,
    });
}
async function unlinkConsumedBootstrap(loaded, allowDeveloperApiBase = false) {
    const quarantinePath = node_path_1.default.join(node_path_1.default.dirname(loaded.filePath), `.${node_path_1.default.basename(loaded.filePath)}.${(0, node_crypto_1.randomUUID)()}.retiring`);
    try {
        await (0, promises_1.rename)(loaded.filePath, quarantinePath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
    const handle = await (0, promises_1.open)(quarantinePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const current = await handle.stat();
        if (!current.isFile() ||
            current.uid !== process.getuid?.() ||
            current.nlink !== 1 ||
            (current.mode & 0o077) !== 0 ||
            current.size < 1 ||
            current.size > 16 * 1024) {
            throw new Error("bootstrap descriptor replacement is unsafe");
        }
        const raw = await handle.readFile({ encoding: "utf8" });
        const mismatch = current.dev !== loaded.device ||
            current.ino !== loaded.inode ||
            (0, node_crypto_1.createHash)("sha256").update(raw).digest("hex") !== loaded.digest;
        if (mismatch) {
            const replacement = (0, extension_core_1.parseEditorBootstrapDescriptor)(JSON.parse(raw), loaded.descriptor.installTarget, 0, allowDeveloperApiBase);
            if (!replacement)
                throw new Error("bootstrap descriptor replacement is invalid");
            const preservedPath = node_path_1.default.join(node_path_1.default.dirname(loaded.filePath), descriptorFilename(replacement));
            try {
                await (0, promises_1.link)(quarantinePath, preservedPath);
            }
            catch (error) {
                if (error.code !== "EEXIST")
                    throw error;
                const existing = await (0, promises_1.open)(preservedPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
                try {
                    const existingRaw = await existing.readFile({ encoding: "utf8" });
                    if (existingRaw !== raw) {
                        throw new Error("bootstrap descriptor replacement could not be preserved");
                    }
                }
                finally {
                    await existing.close();
                }
            }
            await (0, promises_1.unlink)(quarantinePath);
            return false;
        }
        await (0, promises_1.unlink)(quarantinePath);
        return true;
    }
    finally {
        await handle.close();
    }
}
async function retireManagedEditorBootstrapDescriptors(input) {
    const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
    if (input.expected) {
        const loaded = await loadEditorBootstrapDescriptor(input.stateRoot, input.installTarget, input.expected, true, allowDeveloperApiBase);
        return loaded &&
            (await unlinkConsumedBootstrap(loaded, allowDeveloperApiBase))
            ? 1
            : 0;
    }
    const loaded = await loadEditorBootstrapDescriptors(input.stateRoot, input.installTarget, false, allowDeveloperApiBase);
    let retired = 0;
    for (const descriptor of loaded) {
        if (await unlinkConsumedBootstrap(descriptor, allowDeveloperApiBase))
            retired += 1;
    }
    return retired;
}
async function registerPublisher(input, pending) {
    await requestManagedActivation(input, pending, "register", `${pending.apiBase}/v1/publishers/register`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${pending.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            install_id: pending.installId,
            target: extension_core_1.VSCODE_PUBLISHER_TARGET,
        }),
    });
}
async function confirmPublisherReady(input, pending) {
    await requestManagedActivation(input, pending, "ready", `${pending.apiBase}/v1/publisher-installations/${encodeURIComponent(pending.installId)}/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pending.apiKey}` },
    });
}
async function redeemPending(input, pending) {
    const descriptor = {
        token: pending.bootstrapToken,
        installId: pending.installId,
        installTarget: pending.installTarget,
        publisherTarget: pending.publisherTarget,
        generation: pending.generation,
        expiresAt: pending.descriptorExpiresAt,
        apiBase: pending.apiBase,
    };
    const response = await requestManagedActivation(input, pending, "redeem", `${pending.apiBase}/v1/publisher-installations/bootstrap/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            redeem_protocol: 2,
            token: pending.bootstrapToken,
            api_key: pending.apiKey,
            install_id: pending.installId,
            install_target: pending.installTarget,
        }),
    });
    let payload;
    try {
        payload = await response.json();
    }
    catch (error) {
        throw new extension_activation_retry_1.EditorActivationFailure("redeem", "validation", "bootstrap credential response was not valid JSON", { expiresAtMs: Date.parse(pending.descriptorExpiresAt), cause: error });
    }
    const credential = (0, extension_core_1.parseRedeemedPublisherCredential)(payload, descriptor, pending.apiKey);
    if (!credential) {
        const record = payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : undefined;
        const bindingMismatch = record !== undefined &&
            (record.install_id !== descriptor.installId ||
                record.install_target !== descriptor.installTarget ||
                record.publisher_target !== descriptor.publisherTarget ||
                record.generation !== descriptor.generation);
        throw new extension_activation_retry_1.EditorActivationFailure("redeem", bindingMismatch ? "binding" : "validation", bindingMismatch
            ? "bootstrap credential response did not match this editor install"
            : "bootstrap credential response failed validation", { expiresAtMs: Date.parse(pending.descriptorExpiresAt) });
    }
}
async function advancePending(input, initialPending) {
    let pending = initialPending;
    if (pending.protocolState === "stored") {
        await redeemPending(input, pending);
        (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "redeem");
        pending = await (0, extension_activation_state_1.updatePendingProtocolState)(input.secrets, pending, "redeemed");
    }
    if (pending.protocolState === "redeemed") {
        await registerPublisher(input, pending);
        (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "register");
        pending = await (0, extension_activation_state_1.updatePendingProtocolState)(input.secrets, pending, "registered");
    }
    if (pending.protocolState === "registered") {
        await confirmPublisherReady(input, pending);
        (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "ready");
        pending = await (0, extension_activation_state_1.updatePendingProtocolState)(input.secrets, pending, "ready");
    }
    return pending;
}
async function completeManualActivation(input, pending) {
    const assertCurrent = () => (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    if ((0, extension_core_1.normalizeTrustedApiBase)(pending.apiBase, input.allowDeveloperApiBase === true) !== pending.apiBase) {
        throw new Error("manual credential API base is no longer trusted");
    }
    const walletReadable = await (0, extension_manual_activation_1.validateManualWallet)(input, pending);
    assertCurrent();
    await (0, extension_manual_activation_1.registerManualPublisher)(input, pending);
    assertCurrent();
    const active = await (0, extension_activation_state_1.promoteManualCredential)(input.secrets, pending, {
        assertCurrent,
        retireManagedDescriptor: async (managedPending) => {
            assertCurrent();
            if (managedPending) {
                await retireManagedEditorBootstrapDescriptors({
                    stateRoot: input.stateRoot,
                    installTarget: input.installTarget,
                    allowDeveloperApiBase: input.allowDeveloperApiBase,
                    expected: {
                        installId: managedPending.installId,
                        generation: managedPending.generation,
                        token: managedPending.bootstrapToken,
                    },
                });
                assertCurrent();
            }
            await retireManagedEditorBootstrapDescriptors({
                stateRoot: input.stateRoot,
                installTarget: input.installTarget,
                allowDeveloperApiBase: input.allowDeveloperApiBase,
            });
            assertCurrent();
        },
        clearLegacyGeneration: async () => {
            assertCurrent();
            await input.globalState.update(exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY, undefined);
            assertCurrent();
        },
        updateProjections: async (identity) => {
            assertCurrent();
            await input.updateProjections(identity);
            assertCurrent();
        },
        writeReceipt: async (identity) => {
            assertCurrent();
            await input.writeReceipt(identity);
            assertCurrent();
        },
    });
    assertCurrent();
    return { active, walletReadable };
}
async function selectPending(input) {
    const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
    let pending = await (0, extension_activation_state_1.readPendingCredential)(input.secrets);
    const renewed = pending
        ? await loadEditorBootstrapDescriptor(input.stateRoot, input.installTarget, { installId: pending.installId, generation: pending.generation }, true, allowDeveloperApiBase)
        : undefined;
    let newest;
    try {
        newest = await loadEditorBootstrapDescriptor(input.stateRoot, input.installTarget, undefined, false, allowDeveloperApiBase);
    }
    catch (error) {
        if (!pending ||
            !renewed ||
            !(error instanceof extension_activation_retry_1.EditorActivationFailure) ||
            error.phase !== "descriptor" ||
            error.reason !== "credential-expired") {
            throw error;
        }
    }
    if (!pending && newest) {
        return (0, extension_activation_state_1.createOrReusePendingCredential)(input.secrets, newest.descriptor);
    }
    if (pending && newest && newest.descriptor.generation > pending.generation) {
        pending = await (0, extension_activation_state_1.createOrReusePendingCredential)(input.secrets, newest.descriptor);
    }
    if (pending && renewed) {
        pending = await (0, extension_activation_state_1.reconcileStoredPendingDescriptor)(input.secrets, pending, renewed.descriptor);
    }
    return pending;
}
async function runManagedEditorActivation(input) {
    const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
    const assertCurrent = () => (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    const lock = await (0, extension_activation_lock_1.acquireEditorActivationLock)(input.stateRoot, input.installTarget);
    try {
        assertCurrent();
        const manualPending = await (0, extension_activation_state_1.readManualPendingCredential)(input.secrets);
        assertCurrent();
        if (manualPending) {
            return (await completeManualActivation(input, manualPending)).active;
        }
        const currentActive = await (0, extension_activation_state_1.readActiveCredential)(input.secrets);
        assertCurrent();
        if (currentActive?.managedActivationSuppressed &&
            !input.allowManagedOverride) {
            assertCurrent();
            await input.updateProjections(currentActive);
            assertCurrent();
            return undefined;
        }
        let selected;
        try {
            selected = await selectPending(input);
        }
        catch (error) {
            if (!currentActive ||
                !(error instanceof extension_activation_retry_1.EditorActivationFailure) ||
                error.phase !== "descriptor" ||
                error.reason !== "credential-expired") {
                throw error;
            }
            assertCurrent();
            await input.updateProjections(currentActive);
            assertCurrent();
            return undefined;
        }
        assertCurrent();
        if (!selected) {
            if (currentActive) {
                assertCurrent();
                await input.updateProjections(currentActive);
                assertCurrent();
                return undefined;
            }
            throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-absent", "No WaitSpin bootstrap descriptor is available yet");
        }
        if ((0, extension_core_1.normalizeTrustedApiBase)(selected.apiBase, allowDeveloperApiBase) !==
            selected.apiBase) {
            throw new extension_activation_retry_1.EditorActivationFailure("descriptor", "descriptor-unsafe", "managed credential API base is no longer trusted");
        }
        const pending = await advancePending(input, selected);
        const loaded = await loadEditorBootstrapDescriptor(input.stateRoot, input.installTarget, {
            installId: pending.installId,
            generation: pending.generation,
            token: pending.bootstrapToken,
        }, true, allowDeveloperApiBase);
        assertCurrent();
        const active = await (0, extension_activation_state_1.promotePendingCredential)(input.secrets, pending, {
            assertCurrent,
            updateProjections: async (identity) => {
                assertCurrent();
                await input.updateProjections(identity);
                assertCurrent();
            },
            writeReceipt: async (identity) => {
                assertCurrent();
                await input.writeReceipt(identity);
                assertCurrent();
            },
            unlinkDescriptor: async () => {
                assertCurrent();
                if (loaded)
                    await unlinkConsumedBootstrap(loaded, allowDeveloperApiBase);
                assertCurrent();
            },
        });
        assertCurrent();
        await input.globalState.update(exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY, undefined);
        assertCurrent();
        return active;
    }
    finally {
        await lock.release();
    }
}
async function runManualEditorActivation(input) {
    const lock = await (0, extension_activation_lock_1.acquireEditorActivationLock)(input.stateRoot, input.installTarget);
    try {
        const pending = await (0, extension_activation_state_1.stageManualCredential)(input.secrets, input.candidate);
        return await completeManualActivation(input, pending);
    }
    finally {
        await lock.release();
    }
}
async function migrateLegacyManagedActivation(input) {
    const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
    const generation = input.globalState.get(exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY);
    if (!Number.isSafeInteger(generation) || Number(generation) <= 0)
        return;
    const active = await (0, extension_activation_state_1.readActiveCredential)(input.secrets);
    if (!active)
        return;
    const loaded = await loadEditorBootstrapDescriptor(input.stateRoot, input.installTarget, { installId: active.installId, generation: Number(generation) }, true, allowDeveloperApiBase);
    if (!loaded)
        return;
    await (0, extension_activation_state_1.translateLegacyPendingCredential)(input.secrets, active, loaded.descriptor);
    await input.globalState.update(exports.BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY, undefined);
}
//# sourceMappingURL=extension-managed-activation.js.map