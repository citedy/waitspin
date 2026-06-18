import * as vscode from "vscode";
import {
  parseLedgerPayload,
  parseWalletStatusPayload,
  type PublisherViewState,
} from "./extension-core";

const WALLET_REFRESH_INTERVAL_MS = 5 * 60_000;

export type PublisherWalletHost = {
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  isAuthError(status: number): boolean;
  logWaitSpin(message: string): void;
  refreshConfiguredState(): void;
  resolveApiBase(): string | undefined;
  resolveApiKey(): string | undefined;
  updatePublisherState(patch: Partial<PublisherViewState>): void;
};

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export class PublisherWalletController {
  private walletReadStopped = false;
  private lastWalletRefreshStartedAt = 0;

  constructor(private readonly host: PublisherWalletHost) {}

  reset(): void {
    this.walletReadStopped = false;
    this.lastWalletRefreshStartedAt = 0;
  }

  resetThrottle(): void {
    this.lastWalletRefreshStartedAt = 0;
  }

  async refresh(showMessage: boolean): Promise<void> {
    if (this.walletReadStopped && !showMessage) {
      return;
    }
    const now = Date.now();
    if (
      !showMessage &&
      now - this.lastWalletRefreshStartedAt < WALLET_REFRESH_INTERVAL_MS
    ) {
      return;
    }
    this.lastWalletRefreshStartedAt = now;

    const apiKey = this.host.resolveApiKey();
    const apiBase = this.host.resolveApiBase();
    if (!apiKey || !apiBase) {
      this.host.refreshConfiguredState();
      return;
    }

    try {
      const statusResponse = await this.host.fetchWithTimeout(
        `${apiBase}/v1/wallet/status`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (this.host.isAuthError(statusResponse.status)) {
        this.stopForAuth(
          `Wallet auth failed (HTTP ${statusResponse.status}). Create a publisher-extension key with wallet:read and update WaitSpin settings.`,
          showMessage,
        );
        return;
      }
      if (!statusResponse.ok) {
        this.host.updatePublisherState({
          lastError: `Wallet status failed: HTTP ${statusResponse.status}`,
        });
        return;
      }
      const walletStatus = parseWalletStatusPayload(
        await readJsonBody(statusResponse),
      );
      if (!walletStatus) {
        this.host.updatePublisherState({
          lastError: "Wallet status failed validation",
        });
        return;
      }

      const ledgerResponse = await this.host.fetchWithTimeout(
        `${apiBase}/v1/wallet/ledger?limit=5`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (this.host.isAuthError(ledgerResponse.status)) {
        this.stopForAuth(
          `Wallet ledger auth failed (HTTP ${ledgerResponse.status}). Create a publisher-extension key with wallet:read and update WaitSpin settings.`,
          showMessage,
        );
        return;
      }
      if (!ledgerResponse.ok) {
        this.host.updatePublisherState({
          walletStatus,
          lastUpdatedAt: new Date().toISOString(),
          lastError: `Wallet ledger failed: HTTP ${ledgerResponse.status}`,
        });
        return;
      }

      this.walletReadStopped = false;
      this.host.updatePublisherState({
        walletStatus,
        ledgerEntries: parseLedgerPayload(await readJsonBody(ledgerResponse)),
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined,
      });
      if (showMessage) {
        void vscode.window.showInformationMessage("WaitSpin wallet refreshed.");
      }
    } catch (error) {
      const message = `Wallet refresh failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.host.updatePublisherState({ lastError: message });
      this.host.logWaitSpin(message);
    }
  }

  private stopForAuth(message: string, showMessage: boolean): void {
    this.walletReadStopped = true;
    this.host.updatePublisherState({
      walletStatus: undefined,
      ledgerEntries: [],
      lastUpdatedAt: new Date().toISOString(),
      lastError: `${message} Sponsor polling will continue.`,
    });
    this.host.logWaitSpin(`${message} Sponsor polling will continue.`);
    if (showMessage) {
      void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
    }
  }
}
