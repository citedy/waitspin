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
  private refreshEpoch = 0;
  private refreshInFlight: Promise<void> | undefined;
  private refreshQueued = false;
  private queuedForce = false;
  private queuedShowMessage = false;

  constructor(private readonly host: PublisherWalletHost) {}

  reset(): void {
    this.refreshEpoch += 1;
    this.walletReadStopped = false;
    this.lastWalletRefreshStartedAt = 0;
    this.host.updatePublisherState({
      walletStatus: undefined,
      ledgerEntries: [],
      lastError: undefined,
    });
  }

  resetThrottle(): void {
    this.lastWalletRefreshStartedAt = 0;
  }

  refresh(showMessage: boolean, force = false): Promise<void> {
    if (this.refreshInFlight) {
      if (force || showMessage) {
        this.refreshQueued = true;
        this.queuedForce ||= force;
        this.queuedShowMessage ||= showMessage;
      }
      return this.refreshInFlight;
    }
    const inFlight = this.runRefreshQueue(showMessage, force).finally(() => {
      if (this.refreshInFlight === inFlight) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = inFlight;
    return inFlight;
  }

  private async runRefreshQueue(
    showMessage: boolean,
    force: boolean,
  ): Promise<void> {
    let nextShowMessage = showMessage;
    let nextForce = force;
    while (true) {
      await this.performRefresh(nextShowMessage, nextForce);
      if (!this.refreshQueued) return;
      nextShowMessage = this.queuedShowMessage;
      nextForce = this.queuedForce;
      this.refreshQueued = false;
      this.queuedForce = false;
      this.queuedShowMessage = false;
    }
  }

  private async performRefresh(
    showMessage: boolean,
    force: boolean,
  ): Promise<void> {
    if (this.walletReadStopped && !showMessage) {
      return;
    }
    const now = Date.now();
    if (
      !force &&
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
    const epoch = this.refreshEpoch;

    try {
      const statusResponse = await this.host.fetchWithTimeout(
        `${apiBase}/v1/wallet/status`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (epoch !== this.refreshEpoch) return;
      if (this.host.isAuthError(statusResponse.status)) {
        this.stopForAuth(
          `Wallet auth failed (HTTP ${statusResponse.status}). Create an extension key with wallet:read and update WaitSpin settings.`,
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
      const statusBody = await readJsonBody(statusResponse);
      if (epoch !== this.refreshEpoch) return;
      const walletStatus = parseWalletStatusPayload(statusBody);
      if (!walletStatus) {
        this.host.updatePublisherState({
          lastError: "Wallet status failed validation",
        });
        return;
      }
      this.host.updatePublisherState({
        walletStatus,
        ledgerEntries: [],
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined,
      });

      const ledgerResponse = await this.host.fetchWithTimeout(
        `${apiBase}/v1/wallet/ledger?limit=5`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (epoch !== this.refreshEpoch) return;
      if (this.host.isAuthError(ledgerResponse.status)) {
        this.stopForAuth(
          `Wallet ledger auth failed (HTTP ${ledgerResponse.status}). Create an extension key with wallet:read and update WaitSpin settings.`,
          showMessage,
        );
        return;
      }
      if (!ledgerResponse.ok) {
        this.host.updatePublisherState({
          walletStatus,
          ledgerEntries: [],
          lastUpdatedAt: new Date().toISOString(),
          lastError: `Wallet ledger failed: HTTP ${ledgerResponse.status}`,
        });
        return;
      }

      const ledgerBody = await readJsonBody(ledgerResponse);
      if (epoch !== this.refreshEpoch) return;
      this.walletReadStopped = false;
      this.host.updatePublisherState({
        walletStatus,
        ledgerEntries: parseLedgerPayload(ledgerBody),
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined,
      });
      if (showMessage) {
        void vscode.window.showInformationMessage("WaitSpin wallet refreshed.");
      }
    } catch (error) {
      if (epoch !== this.refreshEpoch) return;
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
