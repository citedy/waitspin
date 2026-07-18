"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_API_KEY_SECRET_KEY = exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY = exports.PENDING_CREDENTIAL_SECRET_KEY = exports.ACTIVE_CREDENTIAL_SECRET_KEY = void 0;
exports.generateManagedApiKey = generateManagedApiKey;
exports.readActiveCredential = readActiveCredential;
exports.readPendingCredential = readPendingCredential;
exports.readManualPendingCredential = readManualPendingCredential;
exports.storeActiveCredential = storeActiveCredential;
exports.stageManualCredential = stageManualCredential;
exports.promoteManualCredential = promoteManualCredential;
exports.createOrReusePendingCredential = createOrReusePendingCredential;
exports.reconcileStoredPendingDescriptor = reconcileStoredPendingDescriptor;
exports.updatePendingProtocolState = updatePendingProtocolState;
exports.translateLegacyPendingCredential = translateLegacyPendingCredential;
exports.promotePendingCredential = promotePendingCredential;
exports.migrateLegacyCredential = migrateLegacyCredential;
exports.clearCredentialState = clearCredentialState;
const node_crypto_1 = require("node:crypto");
const extension_core_1 = require("./extension-core");
exports.ACTIVE_CREDENTIAL_SECRET_KEY = "waitspin.publisherCredential.active.v1";
exports.PENDING_CREDENTIAL_SECRET_KEY = "waitspin.publisherCredential.pending.v1";
exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY = "waitspin.publisherCredential.manualPending.v1";
exports.LEGACY_API_KEY_SECRET_KEY = "waitspin.publisherApiKey";
const INSTALL_ID_PATTERN = /^wins_[A-Za-z0-9._-]{3,123}$/;
const V2_API_KEY_PATTERN = /^wts_live_[A-Za-z0-9_-]{43}$/;
async function storeActiveCredentialForPromotion(secrets, apiKey, installId, managedActivationSuppressed, assertCurrent) {
    const previous = await secrets.get(exports.ACTIVE_CREDENTIAL_SECRET_KEY);
    assertCurrent();
    const active = await storeActiveCredential(secrets, apiKey, installId, managedActivationSuppressed);
    try {
        assertCurrent();
    }
    catch (error) {
        if (previous === undefined) {
            await secrets.delete(exports.ACTIVE_CREDENTIAL_SECRET_KEY);
        }
        else {
            await secrets.store(exports.ACTIVE_CREDENTIAL_SECRET_KEY, previous);
        }
        throw error;
    }
    return active;
}
function objectRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function parseJson(value) {
    if (!value)
        return undefined;
    try {
        return objectRecord(JSON.parse(value));
    }
    catch {
        return undefined;
    }
}
function validApiKey(value, exact) {
    return (typeof value === "string" &&
        (exact ? V2_API_KEY_PATTERN.test(value) : value.startsWith("wts_live_")));
}
function serializeActive(active) {
    return JSON.stringify({
        version: active.version,
        api_key: active.apiKey,
        install_id: active.installId,
        managed_activation_suppressed: active.managedActivationSuppressed,
    });
}
function parseActive(value) {
    const record = parseJson(value);
    if (!record ||
        record.version !== 1 ||
        !validApiKey(record.api_key, false) ||
        typeof record.install_id !== "string" ||
        !INSTALL_ID_PATTERN.test(record.install_id)) {
        return undefined;
    }
    return {
        version: 1,
        apiKey: record.api_key,
        installId: record.install_id,
        managedActivationSuppressed: record.managed_activation_suppressed === true,
    };
}
function serializePending(pending) {
    return JSON.stringify({
        version: pending.version,
        api_key: pending.apiKey,
        bootstrap_token: pending.bootstrapToken,
        api_base: pending.apiBase,
        install_id: pending.installId,
        install_target: pending.installTarget,
        publisher_target: pending.publisherTarget,
        generation: pending.generation,
        descriptor_expires_at: pending.descriptorExpiresAt,
        protocol_state: pending.protocolState,
    });
}
function parsePending(value) {
    const record = parseJson(value);
    const apiBase = typeof record?.api_base === "string"
        ? (0, extension_core_1.normalizeTrustedApiBase)(record.api_base, true)
        : undefined;
    const protocolState = record?.protocol_state;
    if (!record ||
        record.version !== 1 ||
        !validApiKey(record.api_key, true) ||
        typeof record.bootstrap_token !== "string" ||
        !/^wbst_[A-Za-z0-9_-]{43}$/.test(record.bootstrap_token) ||
        !apiBase ||
        typeof record.install_id !== "string" ||
        !INSTALL_ID_PATTERN.test(record.install_id) ||
        !["vscode", "cursor", "devin"].includes(String(record.install_target)) ||
        record.publisher_target !== extension_core_1.VSCODE_PUBLISHER_TARGET ||
        !Number.isSafeInteger(record.generation) ||
        Number(record.generation) <= 0 ||
        typeof record.descriptor_expires_at !== "string" ||
        !Number.isFinite(Date.parse(record.descriptor_expires_at)) ||
        !["stored", "redeemed", "registered", "ready"].includes(String(protocolState))) {
        return undefined;
    }
    return {
        version: 1,
        apiKey: record.api_key,
        bootstrapToken: record.bootstrap_token,
        apiBase,
        installId: record.install_id,
        installTarget: record.install_target,
        publisherTarget: extension_core_1.VSCODE_PUBLISHER_TARGET,
        generation: Number(record.generation),
        descriptorExpiresAt: record.descriptor_expires_at,
        protocolState: protocolState,
    };
}
function serializeManualPending(pending) {
    return JSON.stringify({
        version: pending.version,
        api_key: pending.apiKey,
        api_base: pending.apiBase,
        install_id: pending.installId,
        allow_legacy_wallet_failure: pending.allowLegacyWalletFailure,
    });
}
function parseManualPending(value) {
    const record = parseJson(value);
    const apiBase = typeof record?.api_base === "string"
        ? (0, extension_core_1.normalizeTrustedApiBase)(record.api_base, true)
        : undefined;
    if (!record ||
        record.version !== 1 ||
        !validApiKey(record.api_key, false) ||
        !apiBase ||
        typeof record.install_id !== "string" ||
        !INSTALL_ID_PATTERN.test(record.install_id) ||
        typeof record.allow_legacy_wallet_failure !== "boolean") {
        return undefined;
    }
    return {
        version: 1,
        apiKey: record.api_key,
        apiBase,
        installId: record.install_id,
        allowLegacyWalletFailure: record.allow_legacy_wallet_failure,
    };
}
async function storeAndReadback(secrets, key, value, serialize, read) {
    await secrets.store(key, serialize(value));
    const stored = await read(secrets);
    if (!stored || serialize(stored) !== serialize(value)) {
        throw new Error("WaitSpin SecretStorage readback failed");
    }
    return stored;
}
function generateManagedApiKey(bytes = node_crypto_1.randomBytes) {
    return `wts_live_${bytes(32).toString("base64url")}`;
}
async function readActiveCredential(secrets) {
    return parseActive(await secrets.get(exports.ACTIVE_CREDENTIAL_SECRET_KEY));
}
async function readPendingCredential(secrets) {
    return parsePending(await secrets.get(exports.PENDING_CREDENTIAL_SECRET_KEY));
}
async function readManualPendingCredential(secrets) {
    return parseManualPending(await secrets.get(exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY));
}
async function storeActiveCredential(secrets, apiKey, installId, managedActivationSuppressed = false) {
    const active = {
        version: 1,
        apiKey,
        installId,
        managedActivationSuppressed,
    };
    if (!parseActive(serializeActive(active))) {
        throw new Error("Invalid WaitSpin active credential identity");
    }
    return storeAndReadback(secrets, exports.ACTIVE_CREDENTIAL_SECRET_KEY, active, serializeActive, readActiveCredential);
}
async function stageManualCredential(secrets, candidate) {
    const pending = {
        version: 1,
        ...candidate,
    };
    if (!parseManualPending(serializeManualPending(pending))) {
        throw new Error("Invalid WaitSpin manual pending credential identity");
    }
    const existing = await readManualPendingCredential(secrets);
    if (existing &&
        serializeManualPending(existing) === serializeManualPending(pending)) {
        return existing;
    }
    return storeAndReadback(secrets, exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY, pending, serializeManualPending, readManualPendingCredential);
}
async function promoteManualCredential(secrets, pending, actions) {
    actions.assertCurrent();
    const current = await readManualPendingCredential(secrets);
    actions.assertCurrent();
    if (!current ||
        serializeManualPending(current) !== serializeManualPending(pending)) {
        throw new Error("WaitSpin manual pending credential changed before promotion");
    }
    actions.assertCurrent();
    const managedPending = await readPendingCredential(secrets);
    actions.assertCurrent();
    await actions.retireManagedDescriptor(managedPending);
    actions.assertCurrent();
    await secrets.delete(exports.PENDING_CREDENTIAL_SECRET_KEY);
    actions.assertCurrent();
    await actions.clearLegacyGeneration();
    actions.assertCurrent();
    const active = await storeActiveCredentialForPromotion(secrets, current.apiKey, current.installId, true, actions.assertCurrent);
    await actions.updateProjections(active);
    actions.assertCurrent();
    await actions.writeReceipt(active);
    actions.assertCurrent();
    try {
        await secrets.delete(exports.LEGACY_API_KEY_SECRET_KEY);
    }
    catch { }
    actions.assertCurrent();
    await secrets.delete(exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY);
    actions.assertCurrent();
    return active;
}
function pendingMatchesDescriptor(pending, descriptor) {
    return (pending.bootstrapToken === descriptor.token &&
        pending.apiBase === descriptor.apiBase &&
        pending.installId === descriptor.installId &&
        pending.installTarget === descriptor.installTarget &&
        pending.publisherTarget === descriptor.publisherTarget &&
        pending.generation === descriptor.generation &&
        pending.descriptorExpiresAt === descriptor.expiresAt);
}
async function createOrReusePendingCredential(secrets, descriptor) {
    const existing = await readPendingCredential(secrets);
    if (existing && pendingMatchesDescriptor(existing, descriptor))
        return existing;
    if (existing && existing.generation >= descriptor.generation) {
        throw new Error("WaitSpin pending credential generation conflict");
    }
    const pending = {
        version: 1,
        apiKey: generateManagedApiKey(),
        bootstrapToken: descriptor.token,
        apiBase: descriptor.apiBase,
        installId: descriptor.installId,
        installTarget: descriptor.installTarget,
        publisherTarget: descriptor.publisherTarget,
        generation: descriptor.generation,
        descriptorExpiresAt: descriptor.expiresAt,
        protocolState: "stored",
    };
    return storeAndReadback(secrets, exports.PENDING_CREDENTIAL_SECRET_KEY, pending, serializePending, readPendingCredential);
}
async function reconcileStoredPendingDescriptor(secrets, pending, descriptor) {
    if (pending.protocolState !== "stored" ||
        pending.installId !== descriptor.installId ||
        pending.installTarget !== descriptor.installTarget ||
        pending.publisherTarget !== descriptor.publisherTarget ||
        pending.apiBase !== descriptor.apiBase ||
        pending.generation !== descriptor.generation) {
        return pending;
    }
    if (pendingMatchesDescriptor(pending, descriptor))
        return pending;
    const current = await readPendingCredential(secrets);
    if (!current || serializePending(current) !== serializePending(pending)) {
        throw new Error("WaitSpin pending credential changed during renewal");
    }
    return storeAndReadback(secrets, exports.PENDING_CREDENTIAL_SECRET_KEY, {
        ...pending,
        bootstrapToken: descriptor.token,
        descriptorExpiresAt: descriptor.expiresAt,
    }, serializePending, readPendingCredential);
}
async function updatePendingProtocolState(secrets, pending, protocolState) {
    const current = await readPendingCredential(secrets);
    if (!current ||
        current.apiKey !== pending.apiKey ||
        current.generation !== pending.generation) {
        throw new Error("WaitSpin pending credential changed during activation");
    }
    return storeAndReadback(secrets, exports.PENDING_CREDENTIAL_SECRET_KEY, { ...current, protocolState }, serializePending, readPendingCredential);
}
async function translateLegacyPendingCredential(secrets, active, descriptor) {
    if (active.installId !== descriptor.installId ||
        !V2_API_KEY_PATTERN.test(active.apiKey)) {
        throw new Error("Incomplete WaitSpin legacy pending credential state");
    }
    const existing = await readPendingCredential(secrets);
    if (existing) {
        if (existing.apiKey === active.apiKey &&
            pendingMatchesDescriptor(existing, descriptor) &&
            existing.protocolState !== "stored") {
            return existing;
        }
        throw new Error("WaitSpin legacy pending credential conflicts with stored state");
    }
    const pending = {
        version: 1,
        apiKey: active.apiKey,
        bootstrapToken: descriptor.token,
        apiBase: descriptor.apiBase,
        installId: descriptor.installId,
        installTarget: descriptor.installTarget,
        publisherTarget: descriptor.publisherTarget,
        generation: descriptor.generation,
        descriptorExpiresAt: descriptor.expiresAt,
        protocolState: "redeemed",
    };
    return storeAndReadback(secrets, exports.PENDING_CREDENTIAL_SECRET_KEY, pending, serializePending, readPendingCredential);
}
async function promotePendingCredential(secrets, pending, actions) {
    actions.assertCurrent();
    if (pending.protocolState !== "ready") {
        throw new Error("WaitSpin pending credential is not ready for promotion");
    }
    const current = await readPendingCredential(secrets);
    actions.assertCurrent();
    if (!current || serializePending(current) !== serializePending(pending)) {
        throw new Error("WaitSpin pending credential changed before promotion");
    }
    const active = await storeActiveCredentialForPromotion(secrets, pending.apiKey, pending.installId, false, actions.assertCurrent);
    await actions.updateProjections(active);
    actions.assertCurrent();
    await actions.writeReceipt(active);
    actions.assertCurrent();
    await actions.unlinkDescriptor(pending);
    actions.assertCurrent();
    await secrets.delete(exports.PENDING_CREDENTIAL_SECRET_KEY);
    actions.assertCurrent();
    return active;
}
async function migrateLegacyCredential(secrets, installId) {
    const active = await readActiveCredential(secrets);
    const legacyApiKey = (await secrets.get(exports.LEGACY_API_KEY_SECRET_KEY))?.trim();
    if (active) {
        if (legacyApiKey) {
            try {
                await secrets.delete(exports.LEGACY_API_KEY_SECRET_KEY);
            }
            catch {
                return active;
            }
        }
        return active;
    }
    if (!legacyApiKey || !installId)
        return undefined;
    const migrated = await storeActiveCredential(secrets, legacyApiKey, installId);
    try {
        await secrets.delete(exports.LEGACY_API_KEY_SECRET_KEY);
    }
    catch {
        return migrated;
    }
    return migrated;
}
async function clearCredentialState(secrets) {
    await secrets.delete(exports.MANUAL_PENDING_CREDENTIAL_SECRET_KEY);
    await secrets.delete(exports.PENDING_CREDENTIAL_SECRET_KEY);
    await secrets.delete(exports.LEGACY_API_KEY_SECRET_KEY);
    await secrets.delete(exports.ACTIVE_CREDENTIAL_SECRET_KEY);
}
//# sourceMappingURL=extension-activation-state.js.map