import * as vscode from "vscode";
import {
  DEFAULT_API_BASE,
  PUBLISHER_KEY_INTENDED_USE,
  generatePublisherInstallId,
  isLoopbackApiHostname,
  parseVerifiedPublisherKeyPayload,
  type PublisherViewState,
} from "./extension-core";

type PublisherOnboardingHost = {
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  logWaitSpin(message: string): void;
  resolveApiBase(): string | undefined;
  resolveApiKey(): string | undefined;
  resolveInstallId(): string | undefined;
  activateManualCredential(
    candidate: ManualCredentialCandidate,
  ): Promise<{ walletReadable: boolean }>;
  startPolling(): void;
  updatePublisherState(patch: Partial<PublisherViewState>): void;
};

export type ManualCredentialCandidate = {
  apiKey: string;
  apiBase: string;
  installId: string;
  allowLegacyWalletFailure: boolean;
};

type ConnectMode = "email" | "existing-key" | "stored-key";

async function readJsonBody(
  response: Response,
  log?: (message: string) => void,
  label = "WaitSpin",
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    const message = sanitizeSetupErrorMessage(
      error instanceof Error ? error.message : String(error),
    );
    log?.(`${label} JSON parse failed: ${message}`);
    return undefined;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPublisherKeyLike(value: string): boolean {
  return value.trim().startsWith("wts_live_");
}

function httpError(prefix: string, response: Response): Error {
  return new Error(`${prefix}: HTTP ${response.status}`);
}

function sanitizeSetupErrorMessage(message: string): string {
  return (
    message
      .replace(/wts_(?:live|test)_[A-Za-z0-9._-]+/g, "wts_[redacted]")
      .replace(/\bwins_[A-Za-z0-9._-]+\b/g, "[install-id]")
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
      .replace(/https?:\/\/[^\s)]+/g, "[url]")
      .replace(/\b(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?\b/g, "[host]")
      .slice(0, 240) || "Unknown error"
  );
}

function isTrustedOnboardingApiBase(apiBase: string): boolean {
  try {
    const parsed = new URL(apiBase);
    return (
      parsed.origin === DEFAULT_API_BASE ||
      isLoopbackApiHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export class PublisherOnboardingController {
  private connectInFlight = false;

  constructor(private readonly host: PublisherOnboardingHost) {}

  async connectPublisher(): Promise<void> {
    if (this.connectInFlight) {
      await vscode.window.showInformationMessage(
        "WaitSpin setup is already running.",
      );
      return;
    }
    this.connectInFlight = true;

    try {
      await this.connectPublisherOnce();
    } finally {
      this.connectInFlight = false;
    }
  }

  private async connectPublisherOnce(): Promise<void> {
    const apiBase = this.host.resolveApiBase();
    if (!apiBase || !isTrustedOnboardingApiBase(apiBase)) {
      await vscode.window.showErrorMessage(
        "WaitSpin needs the trusted API base https://api.waitspin.com before setup can continue.",
      );
      return;
    }

    const storedApiKey = this.host.resolveApiKey();
    const mode = await this.pickConnectMode(Boolean(storedApiKey));
    if (!mode) {
      return;
    }
    const installId = await this.pickPublisherInstallId();
    if (!installId) {
      return;
    }

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Connecting WaitSpin",
          cancellable: false,
        },
        async () => {
          const apiKey =
            mode === "email"
              ? await this.verifyPublisherKeyByEmail(apiBase)
              : mode === "stored-key"
                ? storedApiKey
                : await this.readExistingPublisherKey();
          if (!apiKey) {
            return;
          }
          await this.registerAndActivatePublisher(
            apiBase,
            apiKey,
            mode,
            installId,
          );
        },
      );
    } catch (error) {
      const message = sanitizeSetupErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      this.host.logWaitSpin(`WaitSpin setup failed: ${message}`);
      this.host.updatePublisherState({
        inventoryStatus: "setup",
        lastError: `WaitSpin setup failed: ${message}`,
      });
      await vscode.window.showErrorMessage(`WaitSpin setup failed: ${message}`);
    }
  }

  private async pickConnectMode(
    hasStoredApiKey: boolean,
  ): Promise<ConnectMode | undefined> {
    const selected = await vscode.window.showQuickPick(
      [
        ...(hasStoredApiKey
          ? [
              {
                label: "Use stored extension key",
                description:
                  "Reuse the key already stored in VS Code SecretStorage",
                mode: "stored-key" as const,
              },
            ]
          : []),
        {
          label: "Create extension key by email",
          description:
            "Receive a 6-digit code, then connect this VS Code install",
          mode: "email" as const,
        },
        {
          label: "Use existing extension key",
          description:
            "Paste an extension API key once; it is stored in SecretStorage",
          mode: "existing-key" as const,
        },
      ],
      {
        title: "Connect WaitSpin",
        placeHolder: "Choose how to connect this VS Code install",
      },
    );
    return selected?.mode;
  }

  private async verifyPublisherKeyByEmail(
    apiBase: string,
  ): Promise<string | undefined> {
    const email = await vscode.window.showInputBox({
      title: "WaitSpin account email",
      prompt: "Enter the email that should own this extension key.",
      ignoreFocusOut: true,
      validateInput: (value) =>
        isValidEmail(value) ? undefined : "Enter a valid email address.",
    });
    if (!email) {
      return undefined;
    }

    const requestResponse = await this.host.fetchWithTimeout(
      `${apiBase}/v1/keys/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          intended_use: PUBLISHER_KEY_INTENDED_USE,
        }),
      },
    );
    if (!requestResponse.ok) {
      throw httpError("Key request failed", requestResponse);
    }

    const code = await vscode.window.showInputBox({
      title: "WaitSpin verification code",
      prompt: "Enter the 6-digit WaitSpin code from your email.",
      ignoreFocusOut: true,
      validateInput: (value) =>
        /^\d{6}$/.test(value.trim()) ? undefined : "Enter the 6-digit code.",
    });
    if (!code) {
      return undefined;
    }

    const verifyResponse = await this.host.fetchWithTimeout(
      `${apiBase}/v1/keys/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          intended_use: PUBLISHER_KEY_INTENDED_USE,
        }),
      },
    );
    if (!verifyResponse.ok) {
      throw httpError("Key verification failed", verifyResponse);
    }
    const verified = parseVerifiedPublisherKeyPayload(
      await readJsonBody(
        verifyResponse,
        this.host.logWaitSpin,
        "Key verification",
      ),
    );
    if (!verified) {
      throw new Error(
        "Verification did not return an extension key with wallet:read.",
      );
    }
    return verified.apiKey;
  }

  private async readExistingPublisherKey(): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      title: "WaitSpin extension key",
      prompt:
        "Paste an extension API key. WaitSpin stores it in VS Code SecretStorage.",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        isPublisherKeyLike(value)
          ? undefined
          : "Enter an extension API key beginning with wts_live_.",
    });
    return apiKey?.trim();
  }

  private async pickPublisherInstallId(): Promise<string | undefined> {
    const existingInstallId = this.host.resolveInstallId();
    if (!existingInstallId) {
      return generatePublisherInstallId();
    }

    const selected = await vscode.window.showQuickPick(
      [
        {
          label: "Reconnect this VS Code install",
          description: existingInstallId,
          installId: existingInstallId,
        },
        {
          label: "Create a new install ID",
          description: "Use this when rotating away from a compromised install",
          installId: generatePublisherInstallId(),
        },
      ],
      {
        title: "WaitSpin install identity",
        placeHolder: "Choose how this VS Code install should be registered",
      },
    );
    return selected?.installId;
  }

  private async registerAndActivatePublisher(
    apiBase: string,
    apiKey: string,
    mode: ConnectMode,
    installId: string,
  ): Promise<void> {
    const { walletReadable } = await this.host.activateManualCredential({
      apiBase,
      apiKey,
      installId,
      allowLegacyWalletFailure:
        mode === "existing-key" || mode === "stored-key",
    });

    this.host.updatePublisherState({
      apiBase,
      installId,
      hasApiKey: true,
      authStopped: false,
      inventoryStatus: "polling",
      lastError: walletReadable
        ? undefined
        : "WaitSpin connected. Wallet and ledger need a key with wallet:read.",
      lastUpdatedAt: new Date().toISOString(),
    });
    this.host.logWaitSpin(`WaitSpin connected for ${installId}.`);
    this.host.startPolling();
    await vscode.window
      .showInformationMessage(
        walletReadable
          ? "WaitSpin connected. Wallet and sponsor polling are starting."
          : "WaitSpin connected. Sponsor polling is starting; rotate the key to enable wallet reads.",
        "Open WaitSpin",
      )
      .then((choice) => {
        if (choice === "Open WaitSpin") {
          void vscode.commands.executeCommand(
            "workbench.view.extension.waitspin",
          );
        }
      });
  }
}
