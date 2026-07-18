import {
  isServeExpired,
  parseServePayload,
  serveExpiryDelayMs,
  type PublisherViewState,
  type ServeCreative,
} from "./extension-core";

const POLL_INTERVAL_MS = 15_000;
const IMPRESSION_EXPIRY_SAFETY_MS = 500;

type ActiveServe = ServeCreative & {
  apiBase: string;
  installId: string;
  visibleStartedAt: number | undefined;
  impressionRecorded: boolean;
  impressionRecording: boolean;
};

export type PublisherSponsorHost = {
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  isAuthError(status: number): boolean;
  isAuthStopped(): boolean;
  isSponsorVisible(): boolean;
  logWaitSpin(message: string): void;
  onAuthError(message: string): void;
  refreshConfiguredState(): void;
  refreshWallet(force: boolean): void | Promise<void>;
  resetWalletThrottle(): void;
  resolveApiBase(): string | undefined;
  resolveApiKey(): string | undefined;
  resolveInstallId(): string | undefined;
  updatePublisherState(patch: Partial<PublisherViewState>): void;
};

export class PublisherSponsorController {
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private impressionTimeout: ReturnType<typeof setTimeout> | undefined;
  private serveExpiryTimeout: ReturnType<typeof setTimeout> | undefined;
  private queuedFetchTimeout: ReturnType<typeof setTimeout> | undefined;
  private pollingEpoch: number | undefined;
  private lifecycleEpoch = 0;
  private disposed = false;
  private activeServe: ActiveServe | undefined;

  constructor(private readonly host: PublisherSponsorHost) {}

  start(): void {
    if (this.disposed || this.host.isAuthStopped() || this.pollTimer) return;
    if (!this.host.resolveApiKey() || !this.host.resolveInstallId()) {
      this.host.refreshConfiguredState();
      return;
    }
    this.host.refreshConfiguredState();
    this.host.resetWalletThrottle();
    void this.host.refreshWallet(true);
    void this.fetchNextCreative();
    this.pollTimer = setInterval(() => {
      void this.fetchNextCreative();
    }, POLL_INTERVAL_MS);
  }

  reset(reason: string): void {
    if (this.disposed) return;
    this.invalidateLifecycle();
    this.clearPollTimer();
    this.clearActiveServe(reason);
  }

  handleVisibilityChange(): void {
    if (this.disposed) return;
    this.updateVisibilityEvidence();
    const serve = this.activeServe;
    if (!serve || serve.impressionRecorded) return;
    if (this.expireIfNeeded(serve, "visibility change")) {
      this.queueFetchNextCreative();
      return;
    }
    this.scheduleVisibleImpression(serve);
  }

  destinationUrl(): string | undefined {
    return this.disposed ? undefined : this.activeServe?.destinationUrl;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearPollTimer();
    this.clearImpressionSchedulingAndFlush();
    this.disposed = true;
    this.invalidateLifecycle();
    this.clearActiveServe("controller disposed");
  }

  private async fetchNextCreative(): Promise<void> {
    const epoch = this.lifecycleEpoch;
    if (
      this.disposed ||
      this.pollingEpoch === epoch ||
      this.host.isAuthStopped()
    )
      return;
    if (this.shouldKeepActiveServe()) {
      this.updateVisibilityEvidence();
      this.host.updatePublisherState({
        inventoryStatus: "serving",
        activeServe: this.activeServe,
        lastError: undefined,
      });
      return;
    }

    const apiKey = this.host.resolveApiKey();
    const installId = this.host.resolveInstallId();
    const apiBase = this.host.resolveApiBase();
    if (!apiKey || !installId || !apiBase) {
      this.host.refreshConfiguredState();
      return;
    }

    this.pollingEpoch = epoch;
    this.host.updatePublisherState({
      apiBase,
      installId,
      hasApiKey: true,
      inventoryStatus: this.activeServe ? "serving" : "polling",
      lastError: undefined,
    });
    try {
      const response = await this.host.fetchWithTimeout(
        `${apiBase}/v1/serve/next`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ install_id: installId }),
        },
      );
      if (!this.isCurrentLifecycle(epoch)) return;

      if (response.status === 204) {
        this.hideAdSurfaces();
        this.host.updatePublisherState({
          inventoryStatus: "empty",
          lastUpdatedAt: new Date().toISOString(),
        });
        void this.host.refreshWallet(false);
        return;
      }

      if (this.host.isAuthError(response.status)) {
        this.stopForAuth(
          `Serve auth failed (HTTP ${response.status}). Check your WaitSpin extension key and waitspin.installId.`,
        );
        this.hideAdSurfaces();
        return;
      }

      if (!response.ok) {
        const message = `Serve request failed: HTTP ${response.status}`;
        this.host.logWaitSpin(message);
        this.host.updatePublisherState({
          inventoryStatus: "error",
          lastError: message,
        });
        return;
      }

      const payload = await response.json();
      if (!this.isCurrentLifecycle(epoch)) return;
      const parsed = parseServePayload(payload);
      if (!parsed) {
        this.host.logWaitSpin("Serve response failed validation");
        this.host.updatePublisherState({
          inventoryStatus: "error",
          lastError: "Serve response failed validation",
        });
        return;
      }

      this.activeServe = {
        ...parsed,
        apiBase,
        installId,
        visibleStartedAt: undefined,
        impressionRecorded: false,
        impressionRecording: false,
      };
      this.scheduleServeExpiry(this.activeServe);
      this.host.updatePublisherState({
        inventoryStatus: "serving",
        activeServe: this.activeServe,
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined,
      });
      this.scheduleVisibleImpression(this.activeServe);
    } catch (error) {
      if (!this.isCurrentLifecycle(epoch)) return;
      const message = `Serve network error: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.host.logWaitSpin(message);
      this.host.updatePublisherState({
        inventoryStatus: "error",
        lastError: message,
      });
    } finally {
      if (this.pollingEpoch === epoch) this.pollingEpoch = undefined;
    }
  }

  private scheduleVisibleImpression(serve: ActiveServe): void {
    if (this.expireIfNeeded(serve, "before scheduling impression")) {
      this.queueFetchNextCreative();
      return;
    }
    if (this.impressionTimeout) clearTimeout(this.impressionTimeout);
    this.updateVisibilityEvidence();
    const visibleMs = this.visibleEvidenceMs(serve);
    const waitMs = Math.min(
      Math.max(250, serve.minVisibleMs - visibleMs),
      Math.max(250, serveExpiryDelayMs(serve)),
    );
    this.impressionTimeout = setTimeout(() => {
      this.impressionTimeout = undefined;
      if (!this.activeServe || this.activeServe.serveId !== serve.serveId)
        return;
      if (this.expireIfNeeded(serve, "before recording impression")) {
        this.queueFetchNextCreative();
        return;
      }
      this.updateVisibilityEvidence();
      const currentVisibleMs = this.visibleEvidenceMs(serve);
      if (currentVisibleMs < serve.minVisibleMs) {
        this.scheduleVisibleImpression(serve);
        return;
      }
      void this.recordImpression(
        serve.serveId,
        serve.serveReceipt,
        currentVisibleMs,
      );
    }, waitMs);
  }

  private scheduleServeExpiry(serve: ActiveServe): void {
    if (this.serveExpiryTimeout) clearTimeout(this.serveExpiryTimeout);
    this.serveExpiryTimeout = setTimeout(
      () => {
        this.serveExpiryTimeout = undefined;
        if (!this.activeServe || this.activeServe.serveId !== serve.serveId)
          return;
        this.clearActiveServe("serve expired before billable impression");
        this.host.updatePublisherState({
          inventoryStatus: "polling",
          lastError: undefined,
        });
        this.queueFetchNextCreative();
      },
      Math.max(250, serveExpiryDelayMs(serve)),
    );
  }

  private updateVisibilityEvidence(): void {
    const serve = this.activeServe;
    if (!serve || serve.impressionRecorded) return;
    if (this.host.isSponsorVisible()) {
      serve.visibleStartedAt ??= Date.now();
      return;
    }
    serve.visibleStartedAt = undefined;
  }

  private visibleEvidenceMs(serve: ActiveServe): number {
    return serve.visibleStartedAt
      ? Math.max(0, Date.now() - serve.visibleStartedAt)
      : 0;
  }

  private shouldKeepActiveServe(): boolean {
    const serve = this.activeServe;
    if (!serve) return false;
    if (serve.impressionRecorded) {
      this.clearActiveServe("impression already recorded");
      return false;
    }
    return !this.expireIfNeeded(serve, "polling gate");
  }

  private flushPendingImpressionIfEligible(): void {
    const serve = this.activeServe;
    if (!serve) return;
    this.updateVisibilityEvidence();
    const visibleMs = this.visibleEvidenceMs(serve);
    if (visibleMs < serve.minVisibleMs) return;
    if (!this.expireIfNeeded(serve, "flush before hide")) {
      void this.recordImpression(serve.serveId, serve.serveReceipt, visibleMs);
    }
  }

  private clearImpressionSchedulingAndFlush(): void {
    if (this.impressionTimeout) {
      clearTimeout(this.impressionTimeout);
      this.impressionTimeout = undefined;
    }
    if (this.serveExpiryTimeout) {
      clearTimeout(this.serveExpiryTimeout);
      this.serveExpiryTimeout = undefined;
    }
    this.flushPendingImpressionIfEligible();
  }

  private hideAdSurfaces(): void {
    this.clearImpressionSchedulingAndFlush();
    this.clearActiveServe("surfaces hidden");
  }

  private clearActiveServeIfCurrent(serveId: string): void {
    if (this.activeServe?.serveId === serveId) {
      this.clearActiveServe("serve cleared");
    }
  }

  private clearActiveServe(reason: string): void {
    if (this.impressionTimeout) {
      clearTimeout(this.impressionTimeout);
      this.impressionTimeout = undefined;
    }
    if (this.serveExpiryTimeout) {
      clearTimeout(this.serveExpiryTimeout);
      this.serveExpiryTimeout = undefined;
    }
    if (this.activeServe) {
      this.host.logWaitSpin(
        `Cleared sponsor serve ${this.activeServe.serveId} (${this.activeServe.campaignId ?? "unknown campaign"}): ${reason}`,
      );
    }
    this.activeServe = undefined;
    this.host.updatePublisherState({ activeServe: undefined });
  }

  private expireIfNeeded(serve: ActiveServe, reason: string): boolean {
    if (!isServeExpired(serve, Date.now(), IMPRESSION_EXPIRY_SAFETY_MS)) {
      return false;
    }
    if (!this.activeServe || this.activeServe.serveId !== serve.serveId) {
      return true;
    }
    this.clearActiveServe(`expired ${reason}`);
    this.host.updatePublisherState({
      inventoryStatus: "polling",
      lastError: undefined,
    });
    return true;
  }

  private queueFetchNextCreative(): void {
    if (this.disposed || this.queuedFetchTimeout) return;
    const epoch = this.lifecycleEpoch;
    const timeout = setTimeout(() => {
      if (this.queuedFetchTimeout === timeout) {
        this.queuedFetchTimeout = undefined;
      }
      if (!this.isCurrentLifecycle(epoch)) return;
      void this.fetchNextCreative();
    }, 0);
    this.queuedFetchTimeout = timeout;
  }

  private clearQueuedFetch(): void {
    if (!this.queuedFetchTimeout) return;
    clearTimeout(this.queuedFetchTimeout);
    this.queuedFetchTimeout = undefined;
  }

  private invalidateLifecycle(): void {
    this.lifecycleEpoch += 1;
    this.pollingEpoch = undefined;
    this.clearQueuedFetch();
  }

  private isCurrentLifecycle(epoch: number): boolean {
    return !this.disposed && this.lifecycleEpoch === epoch;
  }

  private clearPollTimer(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private stopForAuth(message: string): void {
    if (this.host.isAuthStopped()) return;
    this.clearPollTimer();
    this.host.onAuthError(message);
  }

  private async recordImpression(
    serveId: string,
    serveReceipt: string,
    visibleMs: number,
  ): Promise<void> {
    if (this.disposed) return;
    const serve = this.activeServe;
    if (
      !serve ||
      serve.serveId !== serveId ||
      serve.impressionRecorded ||
      serve.impressionRecording
    ) {
      return;
    }
    const apiKey = this.host.resolveApiKey();
    const apiBase = this.host.resolveApiBase();
    const installId = this.host.resolveInstallId();
    if (!apiKey || !installId || !apiBase) return;
    if (
      serve.installId !== installId ||
      serve.apiBase !== apiBase ||
      this.expireIfNeeded(serve, "recording guard")
    ) {
      this.queueFetchNextCreative();
      return;
    }

    const epoch = this.lifecycleEpoch;
    serve.impressionRecording = true;
    try {
      const response = await this.host.fetchWithTimeout(
        `${serve.apiBase}/v1/events/impression`,
        {
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
        },
      );
      if (!this.isCurrentLifecycle(epoch)) return;

      if (this.host.isAuthError(response.status)) {
        this.stopForAuth(
          `Impression auth failed (HTTP ${response.status}). Check your WaitSpin extension key and waitspin.installId.`,
        );
        return;
      }
      if (!response.ok) {
        const message = `Impression request failed: HTTP ${response.status}`;
        this.host.logWaitSpin(message);
        this.clearActiveServeIfCurrent(serveId);
        this.host.updatePublisherState({
          inventoryStatus: "error",
          lastError: message,
        });
        return;
      }
      serve.impressionRecorded = true;
      this.clearActiveServeIfCurrent(serveId);
      this.host.updatePublisherState({
        inventoryStatus: "polling",
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined,
      });
      this.host.resetWalletThrottle();
      void this.host.refreshWallet(true);
    } catch (error) {
      if (!this.isCurrentLifecycle(epoch)) return;
      const message = `Impression network error: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.host.logWaitSpin(message);
      this.clearActiveServeIfCurrent(serveId);
      this.host.updatePublisherState({
        inventoryStatus: "error",
        lastError: message,
      });
    } finally {
      serve.impressionRecording = false;
    }
  }
}
