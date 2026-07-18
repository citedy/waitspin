/** @jest-environment node */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  runManagedEditorActivation,
  type GlobalStateLike,
} from "../src/extension-managed-activation";
import {
  ACTIVE_CREDENTIAL_SECRET_KEY,
  MANUAL_PENDING_CREDENTIAL_SECRET_KEY,
  PENDING_CREDENTIAL_SECRET_KEY,
  readActiveCredential,
  stageManualCredential,
  storeActiveCredential,
  type SecretStorageLike,
} from "../src/extension-activation-state";

class ObservableSecrets implements SecretStorageLike {
  readonly values = new Map<string, string>();
  onGet?: (key: string, value: string | undefined) => Promise<void>;
  onStore?: (key: string, value: string) => Promise<void>;

  async get(key: string) {
    const value = this.values.get(key);
    await this.onGet?.(key, value);
    return value;
  }

  async store(key: string, value: string) {
    this.values.set(key, value);
    await this.onStore?.(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

class ObservableGlobalState implements GlobalStateLike {
  readonly values = new Map<string, unknown>();
  readonly updates: Array<[string, unknown]> = [];

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown) {
    this.updates.push([key, value]);
    this.values.set(key, value);
  }
}

async function createDescriptor(stateRoot: string, suffix: string) {
  const installId = `wins_managed_${suffix}`;
  const directory = path.join(stateRoot, "bootstrap", "vscode");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const token = `wbst_${"a".repeat(43)}`;
  const generation = 1;
  const fingerprint = createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 16);
  await writeFile(
    path.join(
      directory,
      `${installId}.generation-${generation}.${fingerprint}.json`,
    ),
    JSON.stringify({
      managed_by: "waitspin-macos",
      schema_version: 1,
      protocol_version: 1,
      token,
      install_id: installId,
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation,
      expires_at: "2027-07-16T00:00:00.000Z",
      api_base: "https://api.waitspin.com",
    }),
    { mode: 0o600 },
  );
  return installId;
}

function metadataResponse(installId: string) {
  return new Response(
    JSON.stringify({
      protocol_version: 2,
      credential_id: "wkey_managed",
      install_id: installId,
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation: 1,
      scopes: ["publishers:write", "serve:read", "events:write", "wallet:read"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function okResponse() {
  return new Response("{}", { status: 200 });
}

function walletResponse() {
  return new Response(
    JSON.stringify({
      balance: {
        available_micro_units: 1,
        maturing_micro_units: 0,
        held_micro_units: 0,
        reversal_debt_micro_units: 0,
        pending_payout_micro_units: 0,
        lifetime_earned_micro_units: 1,
      },
      connect: { connected: false, payouts_enabled: false },
      payout_policy: { eligible: false, blocked_reasons: [] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function registrationResponse(installId: string) {
  return new Response(
    JSON.stringify({
      publisher_id: "wpub_manual",
      install_id: installId,
      target: "status-bar-fallback",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("managed editor activation failures", () => {
  it("classifies descriptor absence as retryable without touching the network", async () => {
    let networkCalls = 0;
    const activation = runManagedEditorActivation({
      stateRoot: path.join(
        os.tmpdir(),
        `waitspin-absent-${process.pid}-${Date.now()}`,
      ),
      installTarget: "vscode",
      secrets: new ObservableSecrets(),
      globalState: new ObservableGlobalState(),
      fetchWithTimeout: async () => {
        networkCalls += 1;
        return okResponse();
      },
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });

    await expect(activation).rejects.toMatchObject({
      phase: "descriptor",
      reason: "descriptor-absent",
    });
    expect(networkCalls).toBe(0);
  });

  it.each(["redeem", "register", "ready"] as const)(
    "retains phase, status, Retry-After, and credential expiry for %s",
    async (failedPhase) => {
      const stateRoot = path.join(
        os.tmpdir(),
        `waitspin-http-${failedPhase}-${process.pid}-${Date.now()}`,
      );
      const installId = await createDescriptor(stateRoot, failedPhase);
      const activation = runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets: new ObservableSecrets(),
        globalState: new ObservableGlobalState(),
        fetchWithTimeout: async (url) => {
          const phase = url.endsWith("/bootstrap/redeem")
            ? "redeem"
            : url.endsWith("/publishers/register")
              ? "register"
              : "ready";
          if (phase === failedPhase) {
            return new Response("{}", {
              status: 503,
              headers: { "Retry-After": "60" },
            });
          }
          return phase === "redeem" ? metadataResponse(installId) : okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      });

      await expect(activation).rejects.toMatchObject({
        phase: failedPhase,
        reason: "http",
        httpStatus: 503,
        retryAfterMs: 60_000,
        expiresAtMs: Date.parse("2027-07-16T00:00:00.000Z"),
      });
    },
  );

  it("classifies an invalid redeem binding as terminal", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-binding-${process.pid}-${Date.now()}`,
    );
    const installId = await createDescriptor(stateRoot, "binding");
    const activation = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode",
      secrets: new ObservableSecrets(),
      globalState: new ObservableGlobalState(),
      fetchWithTimeout: async (url) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse(`${installId}_other`)
          : okResponse(),
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });

    await expect(activation).rejects.toMatchObject({
      phase: "redeem",
      reason: "binding",
    });
  });

  it("aborts before promotion when the host is disposed", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-dispose-${process.pid}-${Date.now()}`,
    );
    const installId = await createDescriptor(stateRoot, "dispose");
    const secrets = new ObservableSecrets();
    const controller = new AbortController();
    let enterReady!: () => void;
    let releaseReady!: () => void;
    const readyEntered = new Promise<void>((resolve) => {
      enterReady = resolve;
    });
    const readyBlocked = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    const activation = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode",
      secrets,
      globalState: new ObservableGlobalState(),
      signal: controller.signal,
      fetchWithTimeout: async (url) => {
        if (url.endsWith("/ready")) {
          enterReady();
          await readyBlocked;
          return okResponse();
        }
        return url.endsWith("/bootstrap/redeem")
          ? metadataResponse(installId)
          : okResponse();
      },
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });
    await readyEntered;
    controller.abort();
    releaseReady();

    await expect(activation).rejects.toMatchObject({
      phase: "ready",
      reason: "state",
    });
    expect(await readActiveCredential(secrets)).toBeUndefined();
  });

  it("does not promote or mutate projections after disposal inside managed promotion", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-promotion-dispose-${process.pid}-${Date.now()}`,
    );
    const installId = await createDescriptor(stateRoot, "promotion-dispose");
    const secrets = new ObservableSecrets();
    const globalState = new ObservableGlobalState();
    const controller = new AbortController();
    const updateProjections = jest.fn(async () => undefined);
    const writeReceipt = jest.fn(async () => undefined);
    let readyReads = 0;
    let enterPromotion!: () => void;
    let releasePromotion!: () => void;
    const promotionEntered = new Promise<void>((resolve) => {
      enterPromotion = resolve;
    });
    const promotionBlocked = new Promise<void>((resolve) => {
      releasePromotion = resolve;
    });
    secrets.onGet = async (key, value) => {
      if (
        key === PENDING_CREDENTIAL_SECRET_KEY &&
        value?.includes('"protocol_state":"ready"') &&
        ++readyReads === 2
      ) {
        enterPromotion();
        await promotionBlocked;
      }
    };

    const activation = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode",
      secrets,
      globalState,
      signal: controller.signal,
      fetchWithTimeout: async (url) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse(installId)
          : okResponse(),
      updateProjections,
      writeReceipt,
    });
    await promotionEntered;
    controller.abort();
    releasePromotion();

    await expect(activation).rejects.toMatchObject({
      phase: "promotion",
      reason: "state",
    });
    expect(secrets.values.has(ACTIVE_CREDENTIAL_SECRET_KEY)).toBe(false);
    expect(updateProjections).not.toHaveBeenCalled();
    expect(writeReceipt).not.toHaveBeenCalled();
    expect(globalState.updates).toEqual([]);
  });

  it("restores the old active identity when disposal races the promotion commit", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-commit-dispose-${process.pid}-${Date.now()}`,
    );
    const installId = await createDescriptor(stateRoot, "commit-dispose");
    const secrets = new ObservableSecrets();
    const oldActive = await storeActiveCredential(
      secrets,
      `wts_live_${"d".repeat(43)}`,
      "wins_old_commit",
    );
    const controller = new AbortController();
    let activeStores = 0;
    let enterCommit!: () => void;
    let releaseCommit!: () => void;
    const commitEntered = new Promise<void>((resolve) => {
      enterCommit = resolve;
    });
    const commitBlocked = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    secrets.onStore = async (key) => {
      if (key === ACTIVE_CREDENTIAL_SECRET_KEY && ++activeStores === 1) {
        enterCommit();
        await commitBlocked;
      }
    };

    const activation = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode",
      secrets,
      globalState: new ObservableGlobalState(),
      signal: controller.signal,
      fetchWithTimeout: async (url) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse(installId)
          : okResponse(),
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });
    await commitEntered;
    controller.abort();
    releaseCommit();

    await expect(activation).rejects.toMatchObject({
      phase: "promotion",
      reason: "state",
    });
    expect(await readActiveCredential(secrets)).toEqual(oldActive);
  });

  it("keeps the old active identity after disposal inside manual promotion", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-manual-promotion-dispose-${process.pid}-${Date.now()}`,
    );
    const secrets = new ObservableSecrets();
    const globalState = new ObservableGlobalState();
    const oldActive = await storeActiveCredential(
      secrets,
      `wts_live_${"b".repeat(43)}`,
      "wins_old_manual",
    );
    const manual = await stageManualCredential(secrets, {
      apiKey: `wts_live_${"c".repeat(43)}`,
      apiBase: "https://api.waitspin.com",
      installId: "wins_new_manual",
      allowLegacyWalletFailure: false,
    });
    const controller = new AbortController();
    const updateProjections = jest.fn(async () => undefined);
    const writeReceipt = jest.fn(async () => undefined);
    let manualReads = 0;
    let enterPromotion!: () => void;
    let releasePromotion!: () => void;
    const promotionEntered = new Promise<void>((resolve) => {
      enterPromotion = resolve;
    });
    const promotionBlocked = new Promise<void>((resolve) => {
      releasePromotion = resolve;
    });
    secrets.onGet = async (key) => {
      if (key === MANUAL_PENDING_CREDENTIAL_SECRET_KEY && ++manualReads === 2) {
        enterPromotion();
        await promotionBlocked;
      }
    };

    const activation = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode",
      secrets,
      globalState,
      signal: controller.signal,
      fetchWithTimeout: async (url) =>
        url.endsWith("/wallet/status")
          ? walletResponse()
          : registrationResponse(manual.installId),
      updateProjections,
      writeReceipt,
    });
    await promotionEntered;
    controller.abort();
    releasePromotion();

    await expect(activation).rejects.toMatchObject({
      phase: "promotion",
      reason: "state",
    });
    expect(await readActiveCredential(secrets)).toEqual(oldActive);
    expect(updateProjections).not.toHaveBeenCalled();
    expect(writeReceipt).not.toHaveBeenCalled();
    expect(globalState.updates).toEqual([]);
  });
});
