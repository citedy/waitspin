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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_os_1 = __importDefault(require("node:os"));
const extension_core_1 = require("./extension-core");
const extension_activation_state_1 = require("./extension-activation-state");
const extension_managed_activation_1 = require("./extension-managed-activation");
const extension_activation_retry_1 = require("./extension-activation-retry");
const extension_onboarding_1 = require("./extension-onboarding");
const extension_state_1 = require("./extension-state");
const extension_surfaces_1 = require("./extension-surfaces");
const extension_sponsor_1 = require("./extension-sponsor");
const extension_wallet_1 = require("./extension-wallet");
const FETCH_TIMEOUT_MS = 10_000;
const INSTALL_ID_GLOBAL_STATE_KEY = "waitspin.publisherInstallId";
let outputChannel;
let secretApiKey;
let storedInstallId;
let authPollingStopped = false;
let invalidApiBaseWarned = false;
let walletController;
let sponsorController;
let activationRetryController;
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
async function loadPublisherApiKeyFromSecretStorage(context) {
    let secretReadSucceeded = false;
    try {
        const active = await (0, extension_activation_state_1.migrateLegacyCredential)(context.secrets, storedInstallId);
        secretApiKey = active?.apiKey;
        if (active) {
            storedInstallId = active.installId;
            await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, active.installId);
        }
        secretReadSucceeded = true;
    }
    catch (error) {
        secretApiKey = undefined;
        refreshConfiguredState();
        warnCredentialStorageFailure("Unable to read WaitSpin extension key from SecretStorage", error);
    }
    refreshConfiguredState();
    if (storedInstallId) {
        try {
            const receipt = await readCurrentEditorActivationReceipt();
            const publisherRegistered = (0, extension_state_1.resolveActivationReceiptRegistration)({
                secretReadSucceeded,
                secretApiKey,
                installId: storedInstallId,
                receipt,
            });
            if (publisherRegistered !== undefined) {
                await writeCurrentEditorActivationReceipt(storedInstallId, publisherRegistered);
            }
        }
        catch (error) {
            warnCredentialStorageFailure("Unable to update WaitSpin editor activation receipt", error);
        }
    }
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
    if (secretApiKey && storedInstallId) {
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
async function updateActiveCredentialProjection(context, identity) {
    await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, identity.installId);
    secretApiKey = identity.apiKey;
    storedInstallId = identity.installId;
    getWalletController().reset();
    refreshConfiguredState();
}
async function activateManualPublisherCredential(context, candidate) {
    const result = await (0, extension_managed_activation_1.runManualEditorActivation)({
        stateRoot: waitSpinStateRoot(),
        installTarget: currentEditorInstallTarget(),
        secrets: context.secrets,
        globalState: context.globalState,
        candidate,
        allowDeveloperApiBase: allowDeveloperApiBase(),
        fetchWithTimeout,
        updateProjections: (identity) => updateActiveCredentialProjection(context, identity),
        writeReceipt: async (identity) => {
            await writeCurrentEditorActivationReceipt(identity.installId, true);
        },
    });
    authPollingStopped = false;
    return { walletReadable: result.walletReadable };
}
async function storePublisherInstallId(context, installId) {
    await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, installId);
    storedInstallId = installId;
    refreshConfiguredState();
    try {
        await writeCurrentEditorActivationReceipt(installId, Boolean(secretApiKey));
    }
    catch (error) {
        warnCredentialStorageFailure("Unable to update WaitSpin editor activation receipt", error);
    }
}
function currentEditorInstallTarget() {
    const appName = vscode.env.appName.toLowerCase();
    if (appName.includes("cursor"))
        return "cursor";
    if (appName.includes("devin"))
        return "devin";
    return "vscode";
}
function waitSpinStateRoot() {
    const root = (0, extension_core_1.resolveWaitSpinStateRoot)(node_os_1.default.homedir(), process.env.WAITSPIN_STATE_ROOT);
    if (!root) {
        throw new Error("WaitSpin state root must be an absolute path inside the current home");
    }
    return root;
}
function writeCurrentEditorActivationReceipt(installId, publisherRegistered) {
    return (0, extension_state_1.writeEditorActivationReceipt)(waitSpinStateRoot(), currentEditorInstallTarget(), installId, publisherRegistered);
}
function readCurrentEditorActivationReceipt() {
    return (0, extension_state_1.readEditorActivationReceipt)(waitSpinStateRoot(), currentEditorInstallTarget());
}
async function runManagedActivationAttempt(context, allowManagedOverride, signal) {
    const active = await (0, extension_managed_activation_1.runManagedEditorActivation)({
        stateRoot: waitSpinStateRoot(),
        installTarget: currentEditorInstallTarget(),
        secrets: context.secrets,
        globalState: context.globalState,
        allowDeveloperApiBase: allowDeveloperApiBase(),
        allowManagedOverride,
        signal,
        fetchWithTimeout,
        updateProjections: (identity) => updateActiveCredentialProjection(context, identity),
        writeReceipt: async (identity) => {
            await writeCurrentEditorActivationReceipt(identity.installId, true);
        },
    });
    if (!active || signal.aborted)
        return;
    logWaitSpin(`Activated managed WaitSpin install ${active.installId}.`);
    authPollingStopped = false;
    getWalletController().reset();
    refreshConfiguredState();
    getWalletController().resetThrottle();
    await getWalletController().refresh(false, true);
    startPollingIfConfigured();
}
function getActivationRetryController(context) {
    if (activationRetryController)
        return activationRetryController;
    activationRetryController = new extension_activation_retry_1.ManagedActivationRetryController({
        attempt: ({ allowManagedOverride, signal }) => runManagedActivationAttempt(context, allowManagedOverride, signal),
        onRetryScheduled: (failure, delayMs) => {
            const status = failure.httpStatus === undefined ? "none" : String(failure.httpStatus);
            logWaitSpin(`Managed activation retry scheduled phase=${failure.phase} reason=${failure.reason} status=${status} delay_ms=${delayMs}.`);
        },
        onTerminalFailure: (failure) => {
            warnCredentialStorageFailure(`Managed activation stopped phase=${failure.phase} reason=${failure.reason}`, failure);
        },
    });
    return activationRetryController;
}
function activateManagedBootstrapIfPresent(context, source, allowManagedOverride = false) {
    return getActivationRetryController(context).trigger({
        source,
        allowManagedOverride,
        surfaceTerminal: source !== "focus",
    });
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
    const normalized = (0, extension_core_1.resolveWaitSpinApiBase)(readGlobalWaitSpinSetting("apiBase"), process.env.WAITSPIN_BASE_URL, allowDeveloperApiBase());
    if (!normalized && !invalidApiBaseWarned) {
        invalidApiBaseWarned = true;
        logWaitSpin("WaitSpin API configuration is invalid; credentialed network traffic is disabled.");
    }
    return normalized;
}
function resetPollingAfterConfigChange() {
    authPollingStopped = false;
    getWalletController().reset();
    getSponsorController().reset("configuration changed");
    updatePublisherState({ authStopped: false, lastError: undefined });
    refreshConfiguredState();
    getSponsorController().start();
}
function isAuthError(status) {
    return status === 401 || status === 403;
}
function stopPollingForAuth(message) {
    if (authPollingStopped) {
        return;
    }
    authPollingStopped = true;
    updatePublisherState({
        authStopped: true,
        inventoryStatus: "error",
        lastError: message,
    });
    logWaitSpin(message);
    if (storedInstallId) {
        void writeCurrentEditorActivationReceipt(storedInstallId, false).catch((error) => logWaitSpin(`Unable to mark WaitSpin editor activation as unhealthy: ${formatCredentialError(error)}`));
    }
    void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
}
async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal?.aborted)
        controller.abort();
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener("abort", abortFromUpstream);
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
function getSponsorController() {
    if (!sponsorController) {
        sponsorController = new extension_sponsor_1.PublisherSponsorController({
            fetchWithTimeout,
            isAuthError,
            isAuthStopped: () => authPollingStopped,
            isSponsorVisible: () => vscode.window.state.focused && surfaces.hasVisibleSponsorSurface(),
            logWaitSpin,
            onAuthError: stopPollingForAuth,
            refreshConfiguredState,
            refreshWallet: (force) => getWalletController().refresh(false, force),
            resetWalletThrottle: () => getWalletController().resetThrottle(),
            resolveApiBase,
            resolveApiKey,
            resolveInstallId,
            updatePublisherState,
        });
    }
    return sponsorController;
}
function disposeExtensionResources() {
    activationRetryController?.dispose();
    activationRetryController = undefined;
    sponsorController?.dispose();
    surfaces.dispose();
    outputChannel?.dispose();
}
function startPollingIfConfigured() {
    getSponsorController().start();
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
function activate(context) {
    const sponsor = getSponsorController();
    surfaces.register(context, () => sponsor.handleVisibilityChange());
    context.subscriptions.push(vscode.window.onDidChangeWindowState((state) => {
        sponsor.handleVisibilityChange();
        if (state.focused) {
            void activateManagedBootstrapIfPresent(context, "focus").finally(() => {
                startPollingIfConfigured();
            });
        }
    }));
    storedInstallId = context.globalState
        .get(INSTALL_ID_GLOBAL_STATE_KEY)
        ?.trim();
    const onboarding = new extension_onboarding_1.PublisherOnboardingController({
        fetchWithTimeout,
        logWaitSpin,
        resolveApiBase,
        resolveApiKey,
        resolveInstallId,
        activateManualCredential: (candidate) => activateManualPublisherCredential(context, candidate),
        startPolling: resetPollingAfterConfigChange,
        updatePublisherState,
    });
    const openAd = vscode.commands.registerCommand("waitspin.openAd", () => {
        const destinationUrl = sponsor.destinationUrl();
        if (!destinationUrl || !(0, extension_core_1.isSafeExternalUrl)(destinationUrl)) {
            return;
        }
        void vscode.env.openExternal(vscode.Uri.parse(destinationUrl));
    });
    context.subscriptions.push(openAd);
    const activatePublisher = vscode.commands.registerCommand("waitspin.activatePublisher", () => {
        authPollingStopped = false;
        updatePublisherState({ authStopped: false, lastError: undefined });
        void activateManagedBootstrapIfPresent(context, "manual", true).finally(() => {
            refreshConfiguredState();
            if (!resolveApiKey() || !resolveInstallId()) {
                void showPublisherSetupPrompt();
                return;
            }
            getWalletController().resetThrottle();
            void getWalletController().refresh(false, true);
            startPollingIfConfigured();
        });
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
    void (async () => {
        await migratePublisherInstallIdToGlobalState(context);
        await loadPublisherApiKeyFromSecretStorage(context);
        await (0, extension_managed_activation_1.migrateLegacyManagedActivation)({
            stateRoot: waitSpinStateRoot(),
            installTarget: currentEditorInstallTarget(),
            secrets: context.secrets,
            globalState: context.globalState,
            allowDeveloperApiBase: allowDeveloperApiBase(),
        });
        void activateManagedBootstrapIfPresent(context, "startup");
    })()
        .catch((error) => {
        warnCredentialStorageFailure("WaitSpin activation failed", error);
    })
        .finally(() => {
        startPollingIfConfigured();
    });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("waitspin.installId") ||
            event.affectsConfiguration("waitspin.apiBase")) {
            void migratePublisherInstallIdToGlobalState(context).finally(() => {
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