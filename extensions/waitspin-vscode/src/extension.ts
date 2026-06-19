import * as vscode from "vscode";
import {
  DEFAULT_API_BASE,
  isSafeExternalUrl,
  normalizeTrustedApiBase,
  parseServePayload,
  type PublisherViewState,
  type ServeCreative,
} from "./extension-core";
import { PublisherOnboardingController } from "./extension-onboarding";
import { PublisherSurfaces } from "./extension-surfaces";
import { PublisherWalletController } from "./extension-wallet";

const POLL_INTERVAL_MS = 15_000;
const FETCH_TIMEOUT_MS = 10_000;
const API_KEY_SECRET_STORAGE_KEY = "waitspin.publisherApiKey";
const INSTALL_ID_GLOBAL_STATE_KEY = "waitspin.publisherInstallId";

type ActiveServe = ServeCreative & {
  shownAt: number;
  impressionRecorded: boolean;
  impressionRecording: boolean;
};

let pollTimer: ReturnType<typeof setInterval> | undefined;
let impressionTimeout: ReturnType<typeof setTimeout> | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let secretApiKey: string | undefined;
let storedInstallId: string | undefined;
let authPollingStopped = false;
let isPolling = false;
let invalidApiBaseWarned = false;
let activeServe: ActiveServe | undefined;
let walletController: PublisherWalletController | undefined;

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

async function migratePublisherApiKeyToSecretStorage(
  context: vscode.ExtensionContext,
): Promise<void> {
  const fromConfig = readGlobalWaitSpinSetting("apiKey");

  if (fromConfig) {
    try {
      await storePublisherApiKey(context, fromConfig);
    } catch (error) {
      secretApiKey = undefined;
      warnCredentialStorageFailure(
        "Unable to migrate waitspin.apiKey into VS Code SecretStorage",
        error,
      );
      return;
    }

    try {
      await vscode.workspace
        .getConfiguration("waitspin")
        .update("apiKey", undefined, vscode.ConfigurationTarget.Global);
    } catch (error) {
      warnCredentialStorageFailure(
        "Unable to clear migrated waitspin.apiKey from settings",
        error,
      );
    }
    logWaitSpin(
      "Migrated waitspin.apiKey into VS Code SecretStorage for publisher polling.",
    );
    return;
  }

  try {
    secretApiKey = (await context.secrets.get(API_KEY_SECRET_STORAGE_KEY))?.trim();
  } catch (error) {
    secretApiKey = undefined;
    refreshConfiguredState();
    warnCredentialStorageFailure(
      "Unable to read WaitSpin publisher key from SecretStorage",
      error,
    );
    return;
  }

  refreshConfiguredState();
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
  try {
    await storePublisherInstallId(context, fromConfig);
    await clearPublisherInstallIdSetting();
    logWaitSpin("Migrated waitspin.installId into VS Code global extension state.");
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

async function storePublisherApiKey(
  context: vscode.ExtensionContext,
  apiKey: string,
): Promise<void> {
  await context.secrets.store(API_KEY_SECRET_STORAGE_KEY, apiKey);
  secretApiKey = apiKey;
  getWalletController().reset();
  refreshConfiguredState();
}

async function storePublisherInstallId(
  context: vscode.ExtensionContext,
  installId: string,
): Promise<void> {
  await context.globalState.update(INSTALL_ID_GLOBAL_STATE_KEY, installId);
  storedInstallId = installId;
  refreshConfiguredState();
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
  const configured =
    readGlobalWaitSpinSetting("apiBase") ||
    process.env.WAITSPIN_BASE_URL?.trim() ||
    DEFAULT_API_BASE;
  const normalized = normalizeTrustedApiBase(configured, allowDeveloperApiBase());
  if (!normalized && !invalidApiBaseWarned) {
    invalidApiBaseWarned = true;
    logWaitSpin(
      "Ignoring untrusted waitspin.apiBase. Store credentials globally and use https://api.waitspin.com for publisher polling.",
    );
  }
  return normalized;
}

function resetPollingAfterConfigChange(): void {
  authPollingStopped = false;
  getWalletController().reset();
  updatePublisherState({ authStopped: false, lastError: undefined });
  refreshConfiguredState();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  startPollingIfConfigured();
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

function stopPollingForAuth(message: string): void {
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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

async function fetchNextCreative(): Promise<void> {
  if (isPolling || authPollingStopped) {
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
      stopPollingForAuth(
        `Serve auth failed (HTTP ${response.status}). Check your publisher-scoped WaitSpin key and waitspin.installId.`,
      );
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
    const parsed = parseServePayload(payload);
    if (!parsed) {
      logWaitSpin("Serve response failed validation");
      updatePublisherState({
        inventoryStatus: "error",
        lastError: "Serve response failed validation",
      });
      return;
    }

    activeServe = {
      serveId: parsed.serveId,
      line: parsed.line,
      destinationUrl: parsed.destinationUrl,
      serveReceipt: parsed.serveReceipt,
      shownAt: Date.now(),
      minVisibleMs: parsed.minVisibleMs,
      impressionRecorded: false,
      impressionRecording: false,
    };
    updatePublisherState({
      inventoryStatus: "serving",
      activeServe,
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined,
    });
    scheduleVisibleImpression(activeServe, parsed.minVisibleMs);
  } catch (error) {
    const message = `Serve network error: ${error instanceof Error ? error.message : String(error)}`;
    logWaitSpin(message);
    updatePublisherState({ inventoryStatus: "error", lastError: message });
  } finally {
    isPolling = false;
  }
}

function scheduleVisibleImpression(
  serve: NonNullable<typeof activeServe>,
  minVisibleMs: number,
): void {
  if (impressionTimeout) {
    clearTimeout(impressionTimeout);
  }
  impressionTimeout = setTimeout(() => {
    impressionTimeout = undefined;
    if (!activeServe || activeServe.serveId !== serve.serveId) {
      return;
    }
    const visibleMs = Math.max(Date.now() - serve.shownAt, minVisibleMs);
    void recordImpression(
      serve.serveId,
      serve.serveReceipt,
      visibleMs,
      resolveInstallId(),
    );
  }, minVisibleMs);
}

function flushPendingImpressionIfEligible(): void {
  const serve = activeServe;
  if (!serve) {
    return;
  }
  const visibleMs = Date.now() - serve.shownAt;
  if (visibleMs >= serve.minVisibleMs) {
    void recordImpression(
      serve.serveId,
      serve.serveReceipt,
      visibleMs,
      resolveInstallId(),
    );
  }
}

function clearImpressionSchedulingAndFlush(): void {
  if (impressionTimeout) {
    clearTimeout(impressionTimeout);
    impressionTimeout = undefined;
  }
  flushPendingImpressionIfEligible();
}

function stopPollingAndFlushImpression(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  clearImpressionSchedulingAndFlush();
}

function hideAdSurfaces(): void {
  clearImpressionSchedulingAndFlush();
  activeServe = undefined;
  updatePublisherState({ activeServe: undefined });
}

function disposeExtensionResources(): void {
  stopPollingAndFlushImpression();
  surfaces.dispose();
  outputChannel?.dispose();
}

function startPollingIfConfigured(): void {
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

async function showPublisherSetupPrompt(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "WaitSpin needs a connected publisher install before sponsor polling can start.",
    "Connect publisher",
    "Open docs",
  );
  if (choice === "Connect publisher") {
    await vscode.commands.executeCommand("waitspin.connectPublisher");
  } else if (choice === "Open docs") {
    await vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com/docs"));
  }
}

async function recordImpression(
  serveId: string,
  serveReceipt: string,
  visibleMs: number,
  installId: string | undefined,
): Promise<void> {
  const serve = activeServe;
  if (
    !serve ||
    serve.serveId !== serveId ||
    serve.impressionRecorded ||
    serve.impressionRecording
  ) {
    return;
  }
  const apiKey = resolveApiKey();
  const apiBase = resolveApiBase();
  if (!apiKey || !installId || !apiBase) {
    return;
  }

  serve.impressionRecording = true;
  try {
    const response = await fetchWithTimeout(`${apiBase}/v1/events/impression`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serve_id: serveId,
        serve_receipt: serveReceipt,
        install_id: installId,
        visible_ms: visibleMs,
      }),
    });

    if (isAuthError(response.status)) {
      stopPollingForAuth(
        `Impression auth failed (HTTP ${response.status}). Check your publisher-scoped WaitSpin key and waitspin.installId.`,
      );
      return;
    }

    if (!response.ok) {
      logWaitSpin(`Impression request failed: HTTP ${response.status}`);
      return;
    }
    serve.impressionRecorded = true;
    updatePublisherState({
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined,
    });
    getWalletController().resetThrottle();
    void getWalletController().refresh(false);
  } catch (error) {
    logWaitSpin(
      `Impression network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    serve.impressionRecording = false;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  surfaces.register(context);
  storedInstallId = context.globalState
    .get<string>(INSTALL_ID_GLOBAL_STATE_KEY)
    ?.trim();

  const onboarding = new PublisherOnboardingController({
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
      refreshConfiguredState();
      if (!resolveApiKey() || !resolveInstallId()) {
        void showPublisherSetupPrompt();
        return;
      }
      void getWalletController().refresh(false);
      startPollingIfConfigured();
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
      void vscode.env.openExternal(vscode.Uri.parse("https://waitspin.com/docs"));
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
  void Promise.all([
    migratePublisherInstallIdToGlobalState(context),
    migratePublisherApiKeyToSecretStorage(context),
  ]).finally(() => {
    startPollingIfConfigured();
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("waitspin.apiKey") ||
        event.affectsConfiguration("waitspin.installId") ||
        event.affectsConfiguration("waitspin.apiBase")
      ) {
        void Promise.all([
          migratePublisherInstallIdToGlobalState(context),
          migratePublisherApiKeyToSecretStorage(context),
        ]).finally(() => {
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
