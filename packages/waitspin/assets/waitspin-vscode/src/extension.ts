import * as vscode from "vscode";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_API_BASE,
  isSafeExternalUrl,
  normalizeTrustedApiBase,
  resolveWaitSpinApiBase,
  resolveWaitSpinStateRoot,
  VSCODE_PUBLISHER_TARGET,
  type EditorInstallTarget,
  type PublisherViewState,
} from "./extension-core";
import { migrateLegacyCredential } from "./extension-activation-state";
import {
  migrateLegacyManagedActivation,
  runManualEditorActivation,
  runManagedEditorActivation,
} from "./extension-managed-activation";
import {
  ManagedActivationRetryController,
  type ManagedActivationCompletion,
  type ManagedActivationTriggerSource,
} from "./extension-activation-retry";
import {
  PublisherOnboardingController,
  type ManualCredentialCandidate,
} from "./extension-onboarding";
import {
  readEditorActivationReceipt,
  resolveActivationReceiptRegistration,
  writeEditorActivationReceipt,
} from "./extension-state";
import { PublisherSurfaces } from "./extension-surfaces";
import { PublisherSponsorController } from "./extension-sponsor";
import { PublisherWalletController } from "./extension-wallet";

const FETCH_TIMEOUT_MS = 10_000;
const INSTALL_ID_GLOBAL_STATE_KEY = "waitspin.publisherInstallId";

let outputChannel: vscode.OutputChannel | undefined;
let secretApiKey: string | undefined;
let storedInstallId: string | undefined;
let authPollingStopped = false;
let invalidApiBaseWarned = false;
let walletController: PublisherWalletController | undefined;
let sponsorController: PublisherSponsorController | undefined;
let activationRetryController: ManagedActivationRetryController | undefined;

const surfaces = new PublisherSurfaces();

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("WaitSpin");
  }
  return outputChannel;
}

function logWaitSpin(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

function updatePublisherState(patch: Partial<PublisherViewState>): void {
  surfaces.updateState(patch);
}

function refreshConfiguredState(): void {
  updatePublisherState({
    apiBase: resolveApiBase(),
    installId: resolveInstallId(),
    hasApiKey: Boolean(resolveApiKey()),
    authStopped: authPollingStopped,
  });
}

function formatCredentialError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warnCredentialStorageFailure(action: string, error: unknown): void {
  const message = `${action}: ${formatCredentialError(error)}`;
  logWaitSpin(message);
  void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
}

function resolveApiKey(): string | undefined {
  if (secretApiKey) {
    return secretApiKey;
  }
  return undefined;
}

async function loadPublisherApiKeyFromSecretStorage(
  context: vscode.ExtensionContext,
): Promise<void> {
  let secretReadSucceeded = false;
  try {
    const active = await migrateLegacyCredential(
      context.secrets,
      storedInstallId,
    );
    secretApiKey = active?.apiKey;
    if (active) {
      storedInstallId = active.installId;
      await context.globalState.update(
        INSTALL_ID_GLOBAL_STATE_KEY,
        active.installId,
      );
    }
    secretReadSucceeded = true;
  } catch (error) {
    secretApiKey = undefined;
    refreshConfiguredState();
    warnCredentialStorageFailure(
      "Unable to read WaitSpin extension key from SecretStorage",
      error,
    );
  }

  refreshConfiguredState();
  if (storedInstallId) {
    try {
      const receipt = await readCurrentEditorActivationReceipt();
      const publisherRegistered = resolveActivationReceiptRegistration({
        secretReadSucceeded,
        secretApiKey,
        installId: storedInstallId,
        receipt,
      });
      if (publisherRegistered !== undefined) {
        await writeCurrentEditorActivationReceipt(
          storedInstallId,
          publisherRegistered,
        );
      }
    } catch (error) {
      warnCredentialStorageFailure(
        "Unable to update WaitSpin editor activation receipt",
        error,
      );
    }
  }
}

async function migratePublisherInstallIdToGlobalState(
  context: vscode.ExtensionContext,
): Promise<void> {
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
    logWaitSpin(
      "Migrated waitspin.installId into VS Code global extension state.",
    );
  } catch (error) {
    warnCredentialStorageFailure(
      "Unable to migrate waitspin.installId into VS Code global extension state",
      error,
    );
  }
}

async function clearPublisherInstallIdSetting(): Promise<void> {
  try {
    await vscode.workspace
      .getConfiguration("waitspin")
      .update("installId", undefined, vscode.ConfigurationTarget.Global);
  } catch (error) {
    warnCredentialStorageFailure(
      "Unable to clear migrated waitspin.installId from settings",
      error,
    );
  }
}

async function updateActiveCredentialProjection(
  context: vscode.ExtensionContext,
  identity: { apiKey: string; installId: string },
): Promise<void> {
  await context.globalState.update(
    INSTALL_ID_GLOBAL_STATE_KEY,
    identity.installId,
  );
  secretApiKey = identity.apiKey;
  storedInstallId = identity.installId;
  getWalletController().reset();
  refreshConfiguredState();
}

async function activateManualPublisherCredential(
  context: vscode.ExtensionContext,
  candidate: ManualCredentialCandidate,
): Promise<{ walletReadable: boolean }> {
  const result = await runManualEditorActivation({
    stateRoot: waitSpinStateRoot(),
    installTarget: currentEditorInstallTarget(),
    secrets: context.secrets,
    globalState: context.globalState,
    candidate,
    allowDeveloperApiBase: allowDeveloperApiBase(),
    fetchWithTimeout,
    updateProjections: (identity) =>
      updateActiveCredentialProjection(context, identity),
    writeReceipt: async (identity) => {
      await writeCurrentEditorActivationReceipt(identity.installId, true);
    },
  });
  authPollingStopped = false;
  return { walletReadable: result.walletReadable };
}

async function storePublisherInstallId(
  context: vscode.ExtensionContext,
  installId: string,
): Promise<void> {
  await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, installId);
  storedInstallId = installId;
  refreshConfiguredState();
  try {
    await writeCurrentEditorActivationReceipt(installId, Boolean(secretApiKey));
  } catch (error) {
    warnCredentialStorageFailure(
      "Unable to update WaitSpin editor activation receipt",
      error,
    );
  }
}

function currentEditorInstallTarget(): EditorInstallTarget {
  const appName = vscode.env.appName.toLowerCase();
  if (appName.includes("cursor")) return "cursor";
  if (appName.includes("devin")) return "devin";
  return "vscode";
}

function waitSpinStateRoot(): string {
  const root = resolveWaitSpinStateRoot(
    os.homedir(),
    process.env.WAITSPIN_STATE_ROOT,
  );
  if (!root) {
    throw new Error("WaitSpin state root must be an absolute path inside the current home");
  }
  return root;
}

function writeCurrentEditorActivationReceipt(
  installId: string,
  publisherRegistered: boolean,
): Promise<void> {
  return writeEditorActivationReceipt(
    waitSpinStateRoot(),
    currentEditorInstallTarget(),
    installId,
    publisherRegistered,
  );
}

function readCurrentEditorActivationReceipt() {
  return readEditorActivationReceipt(
    waitSpinStateRoot(),
    currentEditorInstallTarget(),
  );
}

async function runManagedActivationAttempt(
  context: vscode.ExtensionContext,
  allowManagedOverride: boolean,
  signal: AbortSignal,
): Promise<void> {
  const active = await runManagedEditorActivation({
    stateRoot: waitSpinStateRoot(),
    installTarget: currentEditorInstallTarget(),
    secrets: context.secrets,
    globalState: context.globalState,
    allowDeveloperApiBase: allowDeveloperApiBase(),
    allowManagedOverride,
    signal,
    fetchWithTimeout,
    updateProjections: (identity) =>
      updateActiveCredentialProjection(context, identity),
    writeReceipt: async (identity) => {
      await writeCurrentEditorActivationReceipt(identity.installId, true);
    },
  });
  if (!active || signal.aborted) return;
  logWaitSpin(`Activated managed WaitSpin install ${active.installId}.`);
  authPollingStopped = false;
  getWalletController().reset();
  refreshConfiguredState();
  getWalletController().resetThrottle();
  await getWalletController().refresh(false, true);
  startPollingIfConfigured();
}

function getActivationRetryController(
  context: vscode.ExtensionContext,
): ManagedActivationRetryController {
  if (activationRetryController) return activationRetryController;
  activationRetryController = new ManagedActivationRetryController({
    attempt: ({ allowManagedOverride, signal }) =>
      runManagedActivationAttempt(context, allowManagedOverride, signal),
    onRetryScheduled: (failure, delayMs) => {
      const status =
        failure.httpStatus === undefined ? "none" : String(failure.httpStatus);
      logWaitSpin(
        `Managed activation retry scheduled phase=${failure.phase} reason=${failure.reason} status=${status} delay_ms=${delayMs}.`,
      );
    },
    onTerminalFailure: (failure) => {
      warnCredentialStorageFailure(
        `Managed activation stopped phase=${failure.phase} reason=${failure.reason}`,
        failure,
      );
    },
  });
  return activationRetryController;
}

function activateManagedBootstrapIfPresent(
  context: vscode.ExtensionContext,
  source: ManagedActivationTriggerSource,
  allowManagedOverride = false,
): Promise<ManagedActivationCompletion> {
  return getActivationRetryController(context).trigger({
    source,
    allowManagedOverride,
    surfaceTerminal: source !== "focus",
  });
}

function resolveInstallId(): string | undefined {
  if (storedInstallId) {
    return storedInstallId;
  }
  const fromConfig = readGlobalWaitSpinSetting("installId");
  if (fromConfig) {
    return fromConfig;
  }
  return process.env.WAITSPIN_INSTALL_ID?.trim();
}

function readGlobalWaitSpinSetting(name: string): string | undefined {
  const config = vscode.workspace.getConfiguration("waitspin");
  const inspected = config.inspect<string>(name);
  const globalValue = inspected?.globalValue?.trim();
  return globalValue || undefined;
}

function allowDeveloperApiBase(): boolean {
  return process.env.WAITSPIN_ALLOW_DEV_API_BASE === "1";
}

function resolveApiBase(): string | undefined {
  const normalized = resolveWaitSpinApiBase(
    readGlobalWaitSpinSetting("apiBase"),
    process.env.WAITSPIN_BASE_URL,
    allowDeveloperApiBase(),
  );
  if (!normalized && !invalidApiBaseWarned) {
    invalidApiBaseWarned = true;
    logWaitSpin(
      "WaitSpin API configuration is invalid; credentialed network traffic is disabled.",
    );
  }
  return normalized;
}

function resetPollingAfterConfigChange(): void {
  authPollingStopped = false;
  getWalletController().reset();
  getSponsorController().reset("configuration changed");
  updatePublisherState({ authStopped: false, lastError: undefined });
  refreshConfiguredState();
  getSponsorController().start();
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

function stopPollingForAuth(message: string): void {
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
    void writeCurrentEditorActivationReceipt(storedInstallId, false).catch(
      (error) =>
        logWaitSpin(
          `Unable to mark WaitSpin editor activation as unhealthy: ${formatCredentialError(error)}`,
        ),
    );
  }
  void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) controller.abort();
  upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

function getWalletController(): PublisherWalletController {
  if (!walletController) {
    walletController = new PublisherWalletController({
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

function getSponsorController(): PublisherSponsorController {
  if (!sponsorController) {
    sponsorController = new PublisherSponsorController({
      fetchWithTimeout,
      isAuthError,
      isAuthStopped: () => authPollingStopped,
      isSponsorVisible: () =>
        vscode.window.state.focused && surfaces.hasVisibleSponsorSurface(),
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

function disposeExtensionResources(): void {
  activationRetryController?.dispose();
  activationRetryController = undefined;
  sponsorController?.dispose();
  surfaces.dispose();
  outputChannel?.dispose();
}

function startPollingIfConfigured(): void {
  getSponsorController().start();
}

async function showPublisherSetupPrompt(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "Connect WaitSpin before sponsor polling can start.",
    "Connect WaitSpin",
    "Open docs",
  );
  if (choice === "Connect WaitSpin") {
    await vscode.commands.executeCommand("waitspin.connectPublisher");
  } else if (choice === "Open docs") {
    await vscode.env.openExternal(
      vscode.Uri.parse("https://waitspin.com/docs"),
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const sponsor = getSponsorController();
  surfaces.register(context, () => sponsor.handleVisibilityChange());
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      sponsor.handleVisibilityChange();
      if (state.focused) {
        void activateManagedBootstrapIfPresent(context, "focus").finally(() => {
          startPollingIfConfigured();
        });
      }
    }),
  );
  storedInstallId = context.globalState
    .get<string>(INSTALL_ID_GLOBAL_STATE_KEY)
    ?.trim();

  const onboarding = new PublisherOnboardingController({
    fetchWithTimeout,
    logWaitSpin,
    resolveApiBase,
    resolveApiKey,
    resolveInstallId,
    activateManualCredential: (candidate) =>
      activateManualPublisherCredential(context, candidate),
    startPolling: resetPollingAfterConfigChange,
    updatePublisherState,
  });

  const openAd = vscode.commands.registerCommand("waitspin.openAd", () => {
    const destinationUrl = sponsor.destinationUrl();
    if (!destinationUrl || !isSafeExternalUrl(destinationUrl)) {
      return;
    }
    void vscode.env.openExternal(vscode.Uri.parse(destinationUrl));
  });
  context.subscriptions.push(openAd);

  const activatePublisher = vscode.commands.registerCommand(
    "waitspin.activatePublisher",
    () => {
      authPollingStopped = false;
      updatePublisherState({ authStopped: false, lastError: undefined });
      void activateManagedBootstrapIfPresent(context, "manual", true).finally(
        () => {
          refreshConfiguredState();
          if (!resolveApiKey() || !resolveInstallId()) {
            void showPublisherSetupPrompt();
            return;
          }
          getWalletController().resetThrottle();
          void getWalletController().refresh(false, true);
          startPollingIfConfigured();
        },
      );
    },
  );
  context.subscriptions.push(activatePublisher);

  context.subscriptions.push(
    vscode.commands.registerCommand("waitspin.connectPublisher", () => {
      void onboarding.connectPublisher();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("waitspin.refreshWallet", () => {
      void getWalletController().refresh(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("waitspin.openDocs", () => {
      void vscode.env.openExternal(
        vscode.Uri.parse("https://waitspin.com/docs"),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("waitspin.openMarket", () => {
      void vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com"));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("waitspin.openCliInstallHelp", () => {
      const terminal = vscode.window.createTerminal({ name: "WaitSpin CLI" });
      terminal.show();
      terminal.sendText("npm install -g waitspin", false);
      void vscode.window.showInformationMessage(
        "WaitSpin CLI install command is ready in a terminal. Press Enter to run it.",
      );
    }),
  );

  authPollingStopped = false;
  refreshConfiguredState();
  void (async () => {
    await migratePublisherInstallIdToGlobalState(context);
    await loadPublisherApiKeyFromSecretStorage(context);
    await migrateLegacyManagedActivation({
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
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("waitspin.installId") ||
        event.affectsConfiguration("waitspin.apiBase")
      ) {
        void migratePublisherInstallIdToGlobalState(context).finally(() => {
          resetPollingAfterConfigChange();
        });
      }
    }),
  );

  context.subscriptions.push({
    dispose: disposeExtensionResources,
  });
}

export function deactivate(): void {
  disposeExtensionResources();
}
