import * as vscode from "vscode";
import {
  DEFAULT_API_BASE,
  PUBLISHER_KEY_INTENDED_USE,
  VSCODE_PUBLISHER_TARGET,
  generatePublisherInstallId,
  isLoopbackApiHostname,
  parsePublisherRegistrationPayload,
  parseVerifiedPublisherKeyPayload,
  parseWalletStatusPayload,
  type PublisherViewState,
} from "./extension-core";

type PublisherOnboardingHost = {
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  logWaitSpin(message: string): void;
  resolveApiBase(): string | undefined;
  resolveApiKey(): string | undefined;
  resolveInstallId(): string | undefined;
  storeApiKey(apiKey: string): Promise<void>;
  storeInstallId(installId: string): Promise<void>;
  startPolling(): void;
  updatePublisherState(patch: Partial<PublisherViewState>): void;
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
          if (mode === "email") {
            await this.host.storeApiKey(apiKey);
            this.host.logWaitSpin(
              "Stored newly issued extension key before registration retry points.",
            );
          }
          await this.registerAndStorePublisher(apiBase, apiKey, mode);
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
          description: "Receive a 6-digit code, then connect this VS Code install",
          mode: "email" as const,
        },
        {
          label: "Use existing extension key",
          description: "Paste an extension API key once; it is stored in SecretStorage",
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
      await readJsonBody(verifyResponse, this.host.logWaitSpin, "Key verification"),
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

  private async registerAndStorePublisher(
    apiBase: string,
    apiKey: string,
    mode: ConnectMode,
  ): Promise<void> {
    const installId = await this.pickPublisherInstallId();
    if (!installId) {
      return;
    }

    const walletReadable = await this.checkWalletRead(
      apiBase,
      apiKey,
      mode === "existing-key" || mode === "stored-key",
    );

    const registrationResponse = await this.host.fetchWithTimeout(
      `${apiBase}/v1/publishers/register`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          install_id: installId,
          target: VSCODE_PUBLISHER_TARGET,
        }),
      },
    );
    if (!registrationResponse.ok) {
      throw httpError("Install registration failed", registrationResponse);
    }
    const registration = parsePublisherRegistrationPayload(
      await readJsonBody(
        registrationResponse,
        this.host.logWaitSpin,
        "Install registration",
      ),
    );
    if (!registration) {
      throw new Error("Install registration response failed validation.");
    }

    await this.host.storeInstallId(registration.installId);
    await this.host.storeApiKey(apiKey);
    this.host.updatePublisherState({
      apiBase,
      installId: registration.installId,
      hasApiKey: true,
      authStopped: false,
      inventoryStatus: "polling",
      lastError: walletReadable
        ? undefined
        : "WaitSpin connected. Wallet and ledger need a key with wallet:read.",
      lastUpdatedAt: new Date().toISOString(),
    });
    this.host.logWaitSpin(
      `WaitSpin connected for ${registration.installId}.`,
    );
    this.host.startPolling();
    await vscode.window.showInformationMessage(
      walletReadable
        ? "WaitSpin connected. Wallet and sponsor polling are starting."
        : "WaitSpin connected. Sponsor polling is starting; rotate the key to enable wallet reads.",
      "Open WaitSpin",
    ).then((choice) => {
      if (choice === "Open WaitSpin") {
        void vscode.commands.executeCommand("workbench.view.extension.waitspin");
      }
    });
  }

  private async checkWalletRead(
    apiBase: string,
    apiKey: string,
    allowLegacyPublisherKey: boolean,
  ): Promise<boolean> {
    const response = await this.host.fetchWithTimeout(
      `${apiBase}/v1/wallet/status`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    if (response.status === 401 || response.status === 403) {
      if (allowLegacyPublisherKey) {
        return false;
      }
      throw new Error(
        "Extension key cannot read wallet status. Create or rotate an extension key with wallet:read.",
      );
    }
    if (!response.ok) {
      throw httpError("Wallet validation failed", response);
    }
    if (
      !parseWalletStatusPayload(
        await readJsonBody(response, this.host.logWaitSpin, "Wallet validation"),
      )
    ) {
      throw new Error("Wallet validation response failed validation.");
    }
    return true;
  }
}
