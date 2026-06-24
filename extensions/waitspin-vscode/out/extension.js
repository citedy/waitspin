"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const extension_core_1 = require("./extension-core");
const extension_onboarding_1 = require("./extension-onboarding");
const extension_surfaces_1 = require("./extension-surfaces");
const extension_wallet_1 = require("./extension-wallet");
const POLL_INTERVAL_MS = 15_000;
const FETCH_TIMEOUT_MS = 10_000;
const IMPRESSION_EXPIRY_SAFETY_MS = 500;
const API_KEY_SECRET_STORAGE_KEY = "waitspin.publisherApiKey";
const INSTALL_ID_GLOBAL_STATE_KEY = "waitspin.publisherInstallId";
let pollTimer;
let impressionTimeout;
let serveExpiryTimeout;
let outputChannel;
let secretApiKey;
let storedInstallId;
let authPollingStopped = false;
let isPolling = false;
let invalidApiBaseWarned = false;
let activeServe;
let walletController;
const surfaces = new extension_surfaces_1.PublisherSurfaces();
function getOutputChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("WaitSpin");
    }
    return outputChannel;
}
function logWaitSpin(message) {
    getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}
function updatePublisherState(patch) {
    surfaces.updateState(patch);
}
function refreshConfiguredState() {
    updatePublisherState({
        apiBase: resolveApiBase(),
        installId: resolveInstallId(),
        hasApiKey: Boolean(resolveApiKey()),
        authStopped: authPollingStopped,
    });
}
function formatCredentialError(error) {
    return error instanceof Error ? error.message : String(error);
}
function warnCredentialStorageFailure(action, error) {
    const message = `${action}: ${formatCredentialError(error)}`;
    logWaitSpin(message);
    void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
}
function resolveApiKey() {
    if (secretApiKey) {
        return secretApiKey;
    }
    return undefined;
}
async function migratePublisherApiKeyToSecretStorage(context) {
    const fromConfig = readGlobalWaitSpinSetting("apiKey");
    if (fromConfig) {
        try {
            await storePublisherApiKey(context, fromConfig);
        }
        catch (error) {
            secretApiKey = undefined;
            warnCredentialStorageFailure("Unable to migrate waitspin.apiKey into VS Code SecretStorage", error);
            return;
        }
        try {
            await vscode.workspace
                .getConfiguration("waitspin")
                .update("apiKey", undefined, vscode.ConfigurationTarget.Global);
        }
        catch (error) {
            warnCredentialStorageFailure("Unable to clear migrated waitspin.apiKey from settings", error);
        }
        logWaitSpin("Migrated waitspin.apiKey into VS Code SecretStorage for sponsor polling.");
        return;
    }
    try {
        secretApiKey = (await context.secrets.get(API_KEY_SECRET_STORAGE_KEY))?.trim();
    }
    catch (error) {
        secretApiKey = undefined;
        refreshConfiguredState();
        warnCredentialStorageFailure("Unable to read WaitSpin extension key from SecretStorage", error);
        return;
    }
    refreshConfiguredState();
}
async function migratePublisherInstallIdToGlobalState(context) {
    const fromConfig = readGlobalWaitSpinSetting("installId");
    if (!fromConfig) {
        return;
    }
    if (fromConfig === storedInstallId) {
        await clearPublisherInstallIdSetting();
        return;
    }
    try {
        await storePublisherInstallId(context, fromConfig);
        await clearPublisherInstallIdSetting();
        logWaitSpin("Migrated waitspin.installId into VS Code global extension state.");
    }
    catch (error) {
        warnCredentialStorageFailure("Unable to migrate waitspin.installId into VS Code global extension state", error);
    }
}
async function clearPublisherInstallIdSetting() {
    try {
        await vscode.workspace
            .getConfiguration("waitspin")
            .update("installId", undefined, vscode.ConfigurationTarget.Global);
    }
    catch (error) {
        warnCredentialStorageFailure("Unable to clear migrated waitspin.installId from settings", error);
    }
}
async function storePublisherApiKey(context, apiKey) {
    await context.secrets.store(API_KEY_SECRET_STORAGE_KEY, apiKey);
    secretApiKey = apiKey;
    getWalletController().reset();
    refreshConfiguredState();
}
async function storePublisherInstallId(context, installId) {
    await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, installId);
    storedInstallId = installId;
    refreshConfiguredState();
}
function resolveInstallId() {
    if (storedInstallId) {
        return storedInstallId;
    }
    const fromConfig = readGlobalWaitSpinSetting("installId");
    if (fromConfig) {
        return fromConfig;
    }
    return process.env.WAITSPIN_INSTALL_ID?.trim();
}
function readGlobalWaitSpinSetting(name) {
    const config = vscode.workspace.getConfiguration("waitspin");
    const inspected = config.inspect(name);
    const globalValue = inspected?.globalValue?.trim();
    return globalValue || undefined;
}
function allowDeveloperApiBase() {
    return process.env.WAITSPIN_ALLOW_DEV_API_BASE === "1";
}
function resolveApiBase() {
    const configured = readGlobalWaitSpinSetting("apiBase") ||
        process.env.WAITSPIN_BASE_URL?.trim() ||
        extension_core_1.DEFAULT_API_BASE;
    const normalized = (0, extension_core_1.normalizeTrustedApiBase)(configured, allowDeveloperApiBase());
    if (!normalized && !invalidApiBaseWarned) {
        invalidApiBaseWarned = true;
        logWaitSpin("Ignoring untrusted waitspin.apiBase. Store credentials globally and use https://api.waitspin.com for sponsor polling.");
    }
    return normalized;
}
function resetPollingAfterConfigChange() {
    authPollingStopped = false;
    getWalletController().reset();
    clearActiveServe("configuration changed");
    updatePublisherState({ authStopped: false, lastError: undefined });
    refreshConfiguredState();
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
    startPollingIfConfigured();
}
function isAuthError(status) {
    return status === 401 || status === 403;
}
function stopPollingForAuth(message) {
    if (authPollingStopped) {
        return;
    }
    authPollingStopped = true;
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
    updatePublisherState({
        authStopped: true,
        inventoryStatus: "error",
        lastError: message,
    });
    logWaitSpin(message);
    void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
}
async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
}
function getWalletController() {
    if (!walletController) {
        walletController = new extension_wallet_1.PublisherWalletController({
            fetchWithTimeout,
            isAuthError,
            logWaitSpin,
            refreshConfiguredState,
            resolveApiBase,
            resolveApiKey,
            updatePublisherState,
        });
    }
    return walletController;
}
async function fetchNextCreative() {
    if (isPolling || authPollingStopped) {
        return;
    }
    if (shouldKeepActiveServeBeforeNextFetch()) {
        updateActiveServeVisibilityEvidence();
        updatePublisherState({
            inventoryStatus: "serving",
            activeServe,
            lastError: undefined,
        });
        return;
    }
    const apiKey = resolveApiKey();
    const installId = resolveInstallId();
    const apiBase = resolveApiBase();
    if (!apiKey || !installId || !apiBase) {
        refreshConfiguredState();
        return;
    }
    isPolling = true;
    updatePublisherState({
        apiBase,
        installId,
        hasApiKey: true,
        inventoryStatus: activeServe ? "serving" : "polling",
        lastError: undefined,
    });
    try {
        const response = await fetchWithTimeout(`${apiBase}/v1/serve/next`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ install_id: installId }),
        });
        if (response.status === 204) {
            hideAdSurfaces();
            updatePublisherState({
                inventoryStatus: "empty",
                lastUpdatedAt: new Date().toISOString(),
            });
            void getWalletController().refresh(false);
            return;
        }
        if (isAuthError(response.status)) {
            stopPollingForAuth(`Serve auth failed (HTTP ${response.status}). Check your WaitSpin extension key and waitspin.installId.`);
            hideAdSurfaces();
            return;
        }
        if (!response.ok) {
            logWaitSpin(`Serve request failed: HTTP ${response.status}`);
            updatePublisherState({
                inventoryStatus: "error",
                lastError: `Serve request failed: HTTP ${response.status}`,
            });
            return;
        }
        const payload = await response.json();
        const parsed = (0, extension_core_1.parseServePayload)(payload);
        if (!parsed) {
            logWaitSpin("Serve response failed validation");
            updatePublisherState({
                inventoryStatus: "error",
                lastError: "Serve response failed validation",
            });
            return;
        }
        activeServe = {
            ...parsed,
            apiBase,
            installId,
            shownAt: Date.now(),
            visibleStartedAt: undefined,
            impressionRecorded: false,
            impressionRecording: false,
        };
        scheduleServeExpiry(activeServe);
        updatePublisherState({
            inventoryStatus: "serving",
            activeServe,
            lastUpdatedAt: new Date().toISOString(),
            lastError: undefined,
        });
        scheduleVisibleImpression(activeServe, parsed.minVisibleMs);
    }
    catch (error) {
        const message = `Serve network error: ${error instanceof Error ? error.message : String(error)}`;
        logWaitSpin(message);
        updatePublisherState({ inventoryStatus: "error", lastError: message });
    }
    finally {
        isPolling = false;
    }
}
function scheduleVisibleImpression(serve, minVisibleMs) {
    if (expireActiveServeIfNeeded(serve, "before scheduling impression")) {
        queueFetchNextCreative();
        return;
    }
    if (impressionTimeout) {
        clearTimeout(impressionTimeout);
    }
    updateActiveServeVisibilityEvidence();
    const visibleMs = activeServeVisibleEvidenceMs(serve);
    const waitMs = Math.min(Math.max(250, minVisibleMs - visibleMs), Math.max(250, (0, extension_core_1.serveExpiryDelayMs)(serve)));
    impressionTimeout = setTimeout(() => {
        impressionTimeout = undefined;
        if (!activeServe || activeServe.serveId !== serve.serveId) {
            return;
        }
        if (expireActiveServeIfNeeded(serve, "before recording impression")) {
            queueFetchNextCreative();
            return;
        }
        updateActiveServeVisibilityEvidence();
        const visibleMs = activeServeVisibleEvidenceMs(serve);
        if (visibleMs < minVisibleMs) {
            scheduleVisibleImpression(serve, minVisibleMs);
            return;
        }
        void recordImpression(serve.serveId, serve.serveReceipt, visibleMs);
    }, waitMs);
}
function scheduleServeExpiry(serve) {
    if (serveExpiryTimeout) {
        clearTimeout(serveExpiryTimeout);
    }
    serveExpiryTimeout = setTimeout(() => {
        serveExpiryTimeout = undefined;
        if (!activeServe || activeServe.serveId !== serve.serveId) {
            return;
        }
        clearActiveServe("serve expired before billable impression");
        updatePublisherState({
            inventoryStatus: "polling",
            lastError: undefined,
        });
        queueFetchNextCreative();
    }, Math.max(250, (0, extension_core_1.serveExpiryDelayMs)(serve)));
}
function hasImpressionVisibilityEvidence() {
    return vscode.window.state.focused && surfaces.hasVisibleSponsorSurface();
}
function updateActiveServeVisibilityEvidence() {
    const serve = activeServe;
    if (!serve || serve.impressionRecorded) {
        return;
    }
    if (hasImpressionVisibilityEvidence()) {
        serve.visibleStartedAt ??= Date.now();
        return;
    }
    serve.visibleStartedAt = undefined;
}
function activeServeVisibleEvidenceMs(serve) {
    if (!serve.visibleStartedAt) {
        return 0;
    }
    return Math.max(0, Date.now() - serve.visibleStartedAt);
}
function shouldKeepActiveServeBeforeNextFetch() {
    const serve = activeServe;
    if (!serve) {
        return false;
    }
    if (serve.impressionRecorded) {
        clearActiveServe("impression already recorded");
        return false;
    }
    if (expireActiveServeIfNeeded(serve, "polling gate")) {
        return false;
    }
    return true;
}
function flushPendingImpressionIfEligible() {
    const serve = activeServe;
    if (!serve) {
        return;
    }
    updateActiveServeVisibilityEvidence();
    const visibleMs = activeServeVisibleEvidenceMs(serve);
    if (visibleMs >= serve.minVisibleMs) {
        if (expireActiveServeIfNeeded(serve, "flush before hide")) {
            return;
        }
        void recordImpression(serve.serveId, serve.serveReceipt, visibleMs);
    }
}
function clearImpressionSchedulingAndFlush() {
    if (impressionTimeout) {
        clearTimeout(impressionTimeout);
        impressionTimeout = undefined;
    }
    if (serveExpiryTimeout) {
        clearTimeout(serveExpiryTimeout);
        serveExpiryTimeout = undefined;
    }
    flushPendingImpressionIfEligible();
}
function stopPollingAndFlushImpression() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
    clearImpressionSchedulingAndFlush();
}
function hideAdSurfaces() {
    clearImpressionSchedulingAndFlush();
    clearActiveServe("surfaces hidden");
}
function clearActiveServeIfCurrent(serveId) {
    if (!activeServe || activeServe.serveId !== serveId) {
        return;
    }
    clearActiveServe("serve cleared");
}
function clearActiveServe(reason) {
    if (impressionTimeout) {
        clearTimeout(impressionTimeout);
        impressionTimeout = undefined;
    }
    if (serveExpiryTimeout) {
        clearTimeout(serveExpiryTimeout);
        serveExpiryTimeout = undefined;
    }
    if (activeServe) {
        logWaitSpin(`Cleared sponsor serve ${activeServe.serveId} (${activeServe.campaignId ?? "unknown campaign"}): ${reason}`);
    }
    activeServe = undefined;
    updatePublisherState({ activeServe: undefined });
}
function expireActiveServeIfNeeded(serve, reason) {
    if (!(0, extension_core_1.isServeExpired)(serve, Date.now(), IMPRESSION_EXPIRY_SAFETY_MS)) {
        return false;
    }
    if (!activeServe || activeServe.serveId !== serve.serveId) {
        return true;
    }
    clearActiveServe(`expired ${reason}`);
    updatePublisherState({
        inventoryStatus: "polling",
        lastError: undefined,
    });
    return true;
}
function queueFetchNextCreative() {
    setTimeout(() => {
        void fetchNextCreative();
    }, 0);
}
function handleImpressionVisibilityChange() {
    updateActiveServeVisibilityEvidence();
    const serve = activeServe;
    if (!serve || serve.impressionRecorded) {
        return;
    }
    if (expireActiveServeIfNeeded(serve, "visibility change")) {
        queueFetchNextCreative();
        return;
    }
    scheduleVisibleImpression(serve, serve.minVisibleMs);
}
function disposeExtensionResources() {
    stopPollingAndFlushImpression();
    surfaces.dispose();
    outputChannel?.dispose();
}
function startPollingIfConfigured() {
    if (authPollingStopped || pollTimer) {
        return;
    }
    if (!resolveApiKey() || !resolveInstallId()) {
        refreshConfiguredState();
        return;
    }
    refreshConfiguredState();
    getWalletController().resetThrottle();
    void getWalletController().refresh(false);
    void fetchNextCreative();
    pollTimer = setInterval(() => {
        void fetchNextCreative();
    }, POLL_INTERVAL_MS);
}
async function showPublisherSetupPrompt() {
    const choice = await vscode.window.showInformationMessage("Connect WaitSpin before sponsor polling can start.", "Connect WaitSpin", "Open docs");
    if (choice === "Connect WaitSpin") {
        await vscode.commands.executeCommand("waitspin.connectPublisher");
    }
    else if (choice === "Open docs") {
        await vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com/docs"));
    }
}
async function recordImpression(serveId, serveReceipt, visibleMs) {
    const serve = activeServe;
    if (!serve ||
        serve.serveId !== serveId ||
        serve.impressionRecorded ||
        serve.impressionRecording) {
        return;
    }
    const apiKey = resolveApiKey();
    const apiBase = resolveApiBase();
    const currentInstallId = resolveInstallId();
    if (!apiKey || !currentInstallId || !apiBase) {
        return;
    }
    if (serve.installId !== currentInstallId ||
        serve.apiBase !== apiBase ||
        expireActiveServeIfNeeded(serve, "recording guard")) {
        queueFetchNextCreative();
        return;
    }
    serve.impressionRecording = true;
    try {
        const response = await fetchWithTimeout(`${serve.apiBase}/v1/events/impression`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                serve_id: serveId,
                serve_receipt: serveReceipt,
                install_id: serve.installId,
                visible_ms: visibleMs,
            }),
        });
        if (isAuthError(response.status)) {
            stopPollingForAuth(`Impression auth failed (HTTP ${response.status}). Check your WaitSpin extension key and waitspin.installId.`);
            return;
        }
        if (!response.ok) {
            const message = `Impression request failed: HTTP ${response.status}`;
            logWaitSpin(message);
            clearActiveServeIfCurrent(serveId);
            updatePublisherState({
                inventoryStatus: "error",
                lastError: message,
            });
            return;
        }
        serve.impressionRecorded = true;
        clearActiveServeIfCurrent(serveId);
        updatePublisherState({
            inventoryStatus: "polling",
            lastUpdatedAt: new Date().toISOString(),
            lastError: undefined,
        });
        getWalletController().resetThrottle();
        void getWalletController().refresh(false);
    }
    catch (error) {
        const message = `Impression network error: ${error instanceof Error ? error.message : String(error)}`;
        logWaitSpin(message);
        clearActiveServeIfCurrent(serveId);
        updatePublisherState({
            inventoryStatus: "error",
            lastError: message,
        });
    }
    finally {
        serve.impressionRecording = false;
    }
}
function activate(context) {
    surfaces.register(context, handleImpressionVisibilityChange);
    context.subscriptions.push(vscode.window.onDidChangeWindowState(handleImpressionVisibilityChange));
    storedInstallId = context.globalState
        .get(INSTALL_ID_GLOBAL_STATE_KEY)
        ?.trim();
    const onboarding = new extension_onboarding_1.PublisherOnboardingController({
        fetchWithTimeout,
        logWaitSpin,
        resolveApiBase,
        resolveApiKey,
        resolveInstallId,
        storeApiKey: (apiKey) => storePublisherApiKey(context, apiKey),
        storeInstallId: (installId) => storePublisherInstallId(context, installId),
        startPolling: resetPollingAfterConfigChange,
        updatePublisherState,
    });
    const openAd = vscode.commands.registerCommand("waitspin.openAd", () => {
        const destinationUrl = activeServe?.destinationUrl;
        if (!destinationUrl || !(0, extension_core_1.isSafeExternalUrl)(destinationUrl)) {
            return;
        }
        void vscode.env.openExternal(vscode.Uri.parse(destinationUrl));
    });
    context.subscriptions.push(openAd);
    const activatePublisher = vscode.commands.registerCommand("waitspin.activatePublisher", () => {
        authPollingStopped = false;
        updatePublisherState({ authStopped: false, lastError: undefined });
        refreshConfiguredState();
        if (!resolveApiKey() || !resolveInstallId()) {
            void showPublisherSetupPrompt();
            return;
        }
        void getWalletController().refresh(false);
        startPollingIfConfigured();
    });
    context.subscriptions.push(activatePublisher);
    context.subscriptions.push(vscode.commands.registerCommand("waitspin.connectPublisher", () => {
        void onboarding.connectPublisher();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("waitspin.refreshWallet", () => {
        void getWalletController().refresh(true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("waitspin.openDocs", () => {
        void vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com/docs"));
    }));
    context.subscriptions.push(vscode.commands.registerCommand("waitspin.openMarket", () => {
        void vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com"));
    }));
    context.subscriptions.push(vscode.commands.registerCommand("waitspin.openCliInstallHelp", () => {
        const terminal = vscode.window.createTerminal({ name: "WaitSpin CLI" });
        terminal.show();
        terminal.sendText("npm install -g waitspin", false);
        void vscode.window.showInformationMessage("WaitSpin CLI install command is ready in a terminal. Press Enter to run it.");
    }));
    authPollingStopped = false;
    refreshConfiguredState();
    void Promise.all([
        migratePublisherInstallIdToGlobalState(context),
        migratePublisherApiKeyToSecretStorage(context),
    ]).finally(() => {
        startPollingIfConfigured();
    });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("waitspin.apiKey") ||
            event.affectsConfiguration("waitspin.installId") ||
            event.affectsConfiguration("waitspin.apiBase")) {
            void Promise.all([
                migratePublisherInstallIdToGlobalState(context),
                migratePublisherApiKeyToSecretStorage(context),
            ]).finally(() => {
                resetPollingAfterConfigChange();
            });
        }
    }));
    context.subscriptions.push({
        dispose: disposeExtensionResources,
    });
}
function deactivate() {
    disposeExtensionResources();
}
//# sourceMappingURL=extension.js.map