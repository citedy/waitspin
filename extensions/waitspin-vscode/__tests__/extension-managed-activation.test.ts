/** @jest-environment node */

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  runManualEditorActivation,
  runManagedEditorActivation,
  type GlobalStateLike,
} from "../src/extension-managed-activation";
import {
  createOrReusePendingCredential,
  readActiveCredential,
  readManualPendingCredential,
  readPendingCredential,
  stageManualCredential,
  storeActiveCredential,
  type SecretStorageLike,
} from "../src/extension-activation-state";

class SharedSecrets implements SecretStorageLike {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key);
  }
  async store(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

class MemoryGlobalState implements GlobalStateLike {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }
  async update(key: string, value: unknown) {
    this.values.set(key, value);
  }
}

async function withWaitSpinBaseURL<T>(
  value: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = process.env.WAITSPIN_BASE_URL;
  process.env.WAITSPIN_BASE_URL = value;
  try {
    return await operation();
  } finally {
    if (previous === undefined) {
      delete process.env.WAITSPIN_BASE_URL;
    } else {
      process.env.WAITSPIN_BASE_URL = previous;
    }
  }
}

async function createDescriptor(
  stateRoot: string,
  suffix: string,
  options: {
    apiBase?: string;
    expiresAt?: string;
    generation?: number;
    legacy?: boolean;
    token?: string;
  } = {},
) {
  const installId = `wins_managed_${suffix}`;
  const directory = path.join(stateRoot, "bootstrap", "vscode");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const token = options.token ?? `wbst_${"a".repeat(43)}`;
  const generation = options.generation ?? 1;
  const fingerprint = createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 16);
  const filePath = path.join(
    directory,
    options.legacy
      ? `${installId}.json`
      : `${installId}.generation-${generation}.${fingerprint}.json`,
  );
  await writeFile(
    filePath,
    JSON.stringify({
      managed_by: "waitspin-macos",
      schema_version: 1,
      protocol_version: 1,
      token,
      install_id: installId,
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation,
      expires_at: options.expiresAt ?? "2027-07-16T00:00:00.000Z",
      api_base: options.apiBase ?? "https://api.waitspin.com",
    }),
    { mode: 0o600 },
  );
  return { filePath, generation, installId, token };
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

describe("managed editor activation coordinator", () => {
  it("ignores an expired descriptor when a valid replacement is available", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-expired-replacement-${process.pid}-${Date.now()}`,
    );
    await createDescriptor(stateRoot, "expired", {
      expiresAt: "2020-07-16T00:00:00.000Z",
      token: `wbst_${"x".repeat(43)}`,
    });
    const input = {
      stateRoot,
      installTarget: "vscode" as const,
      secrets: new SharedSecrets(),
      globalState: new MemoryGlobalState(),
      fetchWithTimeout: async (url: string) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse("wins_managed_current")
          : okResponse(),
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    };

    await expect(runManagedEditorActivation(input)).rejects.toMatchObject({
      reason: "credential-expired",
    });
    const current = await createDescriptor(stateRoot, "current", {
      token: `wbst_${"y".repeat(43)}`,
    });

    await expect(runManagedEditorActivation(input)).resolves.toMatchObject({
      installId: current.installId,
    });
  });

  it("keeps an active credential when only an expired descriptor remains", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-active-expired-${process.pid}-${Date.now()}`,
    );
    await createDescriptor(stateRoot, "expired-after-ready", {
      expiresAt: "2020-07-16T00:00:00.000Z",
    });
    const secrets = new SharedSecrets();
    const active = await storeActiveCredential(
      secrets,
      `wts_live_${"a".repeat(43)}`,
      "wins_managed_active",
    );
    let projectedInstallId: string | undefined;
    let networkCalls = 0;

    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState: new MemoryGlobalState(),
        fetchWithTimeout: async () => {
          networkCalls += 1;
          return okResponse();
        },
        updateProjections: async (current) => {
          projectedInstallId = current.installId;
        },
        writeReceipt: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(networkCalls).toBe(0);
    expect(projectedInstallId).toBe(active.installId);
    expect(await readActiveCredential(secrets)).toEqual(active);
  });

  it("uses a loopback bootstrap descriptor only with explicit dev opt-in", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-loopback-${process.pid}-${Date.now()}`,
    );
    const { installId } = await createDescriptor(stateRoot, "loopback", {
      apiBase: "http://127.0.0.1:8787",
    });
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    const calls: string[] = [];

    await expect(
      withWaitSpinBaseURL("http://127.0.0.1:8787", () =>
        runManagedEditorActivation({
          stateRoot,
          installTarget: "vscode",
          secrets,
          globalState,
          allowDeveloperApiBase: true,
          fetchWithTimeout: async (url: string) => {
            calls.push(url);
            return url.endsWith("/bootstrap/redeem")
              ? metadataResponse(installId)
              : okResponse();
          },
          updateProjections: async () => undefined,
          writeReceipt: async () => undefined,
        }),
      ),
    ).resolves.toMatchObject({ installId });
    expect(calls).toHaveLength(3);
    expect(calls.every((url) => url.startsWith("http://127.0.0.1:8787/"))).toBe(
      true,
    );
  });

  it("does not resume a stored loopback managed credential without current dev opt-in", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-loopback-resume-${process.pid}-${Date.now()}`,
    );
    const { filePath } = await createDescriptor(stateRoot, "loopback-resume", {
      apiBase: "http://127.0.0.1:8787",
    });
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();

    await expect(
      withWaitSpinBaseURL("http://127.0.0.1:8787", () =>
        runManagedEditorActivation({
          stateRoot,
          installTarget: "vscode",
          secrets,
          globalState,
          allowDeveloperApiBase: true,
          fetchWithTimeout: async () => {
            throw new Error("offline");
          },
          updateProjections: async () => undefined,
          writeReceipt: async () => undefined,
        }),
      ),
    ).rejects.toThrow("offline");
    expect(await readPendingCredential(secrets)).toMatchObject({
      apiBase: "http://127.0.0.1:8787",
      protocolState: "stored",
    });
    await unlink(filePath);

    let networkCalls = 0;
    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        fetchWithTimeout: async () => {
          networkCalls += 1;
          return okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).rejects.toThrow("managed credential API base is no longer trusted");
    expect(networkCalls).toBe(0);
  });

  it("stores the client key before redeem and lets two hosts produce one activation", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-managed-${process.pid}-${Date.now()}`,
    );
    const { filePath, installId } = await createDescriptor(stateRoot, "race");
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    const calls: string[] = [];
    const input = {
      stateRoot,
      installTarget: "vscode" as const,
      secrets,
      globalState,
      fetchWithTimeout: async (url: string, init: RequestInit) => {
        calls.push(url);
        if (url.endsWith("/bootstrap/redeem")) {
          const pending = await readPendingCredential(secrets);
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          expect(pending?.apiKey).toBe(body.api_key);
          return metadataResponse(installId);
        }
        return okResponse();
      },
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    };

    const results = await Promise.all([
      runManagedEditorActivation(input),
      runManagedEditorActivation(input),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      calls.filter((url) => url.endsWith("/bootstrap/redeem")),
    ).toHaveLength(1);
    expect(
      calls.filter((url) => url.endsWith("/publishers/register")),
    ).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/ready"))).toHaveLength(1);
    await expect(lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps an atomic path replacement discoverable instead of unlinking it", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-retire-race-${process.pid}-${Date.now()}`,
    );
    const originalToken = `wbst_${"b".repeat(43)}`;
    const replacementToken = `wbst_${"c".repeat(43)}`;
    const { filePath, installId } = await createDescriptor(
      stateRoot,
      "replace",
      {
        token: originalToken,
      },
    );
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    const input = {
      stateRoot,
      installTarget: "vscode" as const,
      secrets,
      globalState,
      fetchWithTimeout: async (url: string) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse(installId)
          : okResponse(),
      updateProjections: async () => undefined,
      writeReceipt: async () => {
        const replacementPath = `${filePath}.replacement`;
        const replacement = JSON.parse(await readFile(filePath, "utf8"));
        replacement.token = replacementToken;
        await writeFile(replacementPath, `${JSON.stringify(replacement)}\n`, {
          mode: 0o600,
        });
        await rename(replacementPath, filePath);
      },
    };

    await expect(runManagedEditorActivation(input)).resolves.toBeDefined();
    const replacementFingerprint = createHash("sha256")
      .update(replacementToken)
      .digest("hex")
      .slice(0, 16);
    const discoverablePath = path.join(
      path.dirname(filePath),
      `${installId}.generation-1.${replacementFingerprint}.json`,
    );
    await expect(readFile(discoverablePath, "utf8")).resolves.toContain(
      replacementToken,
    );
  });

  it("adopts a renewed same-generation token without replacing the stored client key", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-same-generation-renewal-${process.pid}-${Date.now()}`,
    );
    const original = await createDescriptor(stateRoot, "renewal", {
      token: `wbst_${"d".repeat(43)}`,
    });
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    const originalPending = await createOrReusePendingCredential(secrets, {
      token: original.token,
      installId: original.installId,
      installTarget: "vscode",
      publisherTarget: "status-bar-fallback",
      generation: original.generation,
      expiresAt: "2027-07-16T00:00:00.000Z",
      apiBase: "https://api.waitspin.com",
    });
    await unlink(original.filePath);
    const renewed = await createDescriptor(stateRoot, "renewal", {
      token: `wbst_${"e".repeat(43)}`,
    });

    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        fetchWithTimeout: async (url, init) => {
          if (url.endsWith("/bootstrap/redeem")) {
            const body = JSON.parse(String(init.body)) as Record<
              string,
              unknown
            >;
            expect(body.token).toBe(renewed.token);
            expect(body.api_key).toBe(originalPending.apiKey);
            return metadataResponse(original.installId);
          }
          return okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).resolves.toMatchObject({
      apiKey: originalPending.apiKey,
      installId: original.installId,
    });
  });

  it("keeps consuming legacy install-id descriptor filenames", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-legacy-${process.pid}-${Date.now()}`,
    );
    const { filePath, installId } = await createDescriptor(
      stateRoot,
      "legacy",
      {
        legacy: true,
      },
    );
    const input = {
      stateRoot,
      installTarget: "vscode" as const,
      secrets: new SharedSecrets(),
      globalState: new MemoryGlobalState(),
      fetchWithTimeout: async (url: string) =>
        url.endsWith("/bootstrap/redeem")
          ? metadataResponse(installId)
          : okResponse(),
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    };

    await expect(runManagedEditorActivation(input)).resolves.toMatchObject({
      installId,
    });
    await expect(lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["redeem", "register", "ready"])(
    "reuses the same pending identity after a lost %s response",
    async (failedPhase) => {
      const stateRoot = path.join(
        os.tmpdir(),
        `waitspin-lost-${failedPhase}-${process.pid}-${Date.now()}`,
      );
      const { installId } = await createDescriptor(stateRoot, failedPhase);
      const secrets = new SharedSecrets();
      const globalState = new MemoryGlobalState();
      const calls = { redeem: 0, register: 0, ready: 0 };
      let injected = false;
      const input = {
        stateRoot,
        installTarget: "vscode" as const,
        secrets,
        globalState,
        fetchWithTimeout: async (url: string) => {
          const phase = url.endsWith("/bootstrap/redeem")
            ? "redeem"
            : url.endsWith("/publishers/register")
              ? "register"
              : "ready";
          calls[phase] += 1;
          if (phase === failedPhase && !injected) {
            injected = true;
            throw new Error(`${phase} response lost`);
          }
          return phase === "redeem"
            ? metadataResponse(installId)
            : okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      };

      await expect(runManagedEditorActivation(input)).rejects.toThrow(
        "response lost",
      );
      const pendingBeforeRetry = await readPendingCredential(secrets);
      await expect(runManagedEditorActivation(input)).resolves.toMatchObject({
        apiKey: pendingBeforeRetry?.apiKey,
        installId,
      });
      expect(calls[failedPhase]).toBe(2);
    },
  );

  it("replays a stored v2 credential after its bootstrap descriptor expires", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-expired-pending-replay-${process.pid}-${Date.now()}`,
    );
    const descriptor = await createDescriptor(stateRoot, "expired-pending", {
      expiresAt: "2020-07-16T00:00:00.000Z",
    });
    const secrets = new SharedSecrets();
    const pending = await createOrReusePendingCredential(secrets, {
      token: descriptor.token,
      installId: descriptor.installId,
      installTarget: "vscode",
      publisherTarget: "status-bar-fallback",
      generation: descriptor.generation,
      expiresAt: "2020-07-16T00:00:00.000Z",
      apiBase: "https://api.waitspin.com",
    });
    let redeemCalls = 0;

    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState: new MemoryGlobalState(),
        fetchWithTimeout: async (url, init) => {
          if (url.endsWith("/bootstrap/redeem")) {
            redeemCalls += 1;
            const body = JSON.parse(String(init.body)) as Record<
              string,
              unknown
            >;
            expect(body.api_key).toBe(pending.apiKey);
            return metadataResponse(descriptor.installId);
          }
          return okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).resolves.toMatchObject({
      apiKey: pending.apiKey,
      installId: descriptor.installId,
    });
    expect(redeemCalls).toBe(1);
  });

  it.each(["wallet", "register"])(
    "keeps the old active identity when manual %s validation fails",
    async (phase) => {
      const stateRoot = path.join(
        os.tmpdir(),
        `waitspin-manual-${phase}-${process.pid}-${Date.now()}`,
      );
      await createDescriptor(stateRoot, phase);
      const secrets = new SharedSecrets();
      const globalState = new MemoryGlobalState();
      const oldActive = await storeActiveCredential(
        secrets,
        `wts_live_${"o".repeat(43)}`,
        "wins_old_account",
      );
      const input = {
        stateRoot,
        installTarget: "vscode" as const,
        secrets,
        globalState,
        candidate: {
          apiKey: `wts_live_${"m".repeat(43)}`,
          apiBase: "https://api.waitspin.com",
          installId: "wins_manual_account",
          allowLegacyWalletFailure: false,
        },
        fetchWithTimeout: async (url: string) => {
          if (url.endsWith("/wallet/status")) {
            return phase === "wallet"
              ? new Response("{}", { status: 500 })
              : walletResponse();
          }
          return new Response("{}", { status: 500 });
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      };

      let failure: unknown;
      try {
        await runManualEditorActivation(input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(
        new Error(
          phase === "wallet"
            ? "wallet validation failed with HTTP 500"
            : "publisher registration failed with HTTP 500",
        ),
      );
      expect(await readActiveCredential(secrets)).toEqual(oldActive);
      expect(await readManualPendingCredential(secrets)).toMatchObject({
        installId: "wins_manual_account",
      });
    },
  );

  it("serializes focus activation behind a manual switch and cannot resurrect the old descriptor", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-manual-race-${process.pid}-${Date.now()}`,
    );
    const { filePath, installId: managedInstallId } = await createDescriptor(
      stateRoot,
      "manual-race",
    );
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    await storeActiveCredential(
      secrets,
      `wts_live_${"o".repeat(43)}`,
      managedInstallId,
    );
    let enterValidation!: () => void;
    let releaseValidation!: () => void;
    const validationEntered = new Promise<void>((resolve) => {
      enterValidation = resolve;
    });
    const validationRelease = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    const manual = runManualEditorActivation({
      stateRoot,
      installTarget: "vscode" as const,
      secrets,
      globalState,
      candidate: {
        apiKey: `wts_live_${"m".repeat(43)}`,
        apiBase: "https://api.waitspin.com",
        installId: "wins_manual_account",
        allowLegacyWalletFailure: false,
      },
      fetchWithTimeout: async (url: string) => {
        if (url.endsWith("/wallet/status")) {
          enterValidation();
          await validationRelease;
          return walletResponse();
        }
        return registrationResponse("wins_manual_account");
      },
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });
    await validationEntered;

    const managed = runManagedEditorActivation({
      stateRoot,
      installTarget: "vscode" as const,
      secrets,
      globalState,
      fetchWithTimeout: async () => {
        throw new Error("managed activation must not reach the network");
      },
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
    });
    releaseValidation();

    await expect(manual).resolves.toMatchObject({
      active: { installId: "wins_manual_account" },
      walletReadable: true,
    });
    await expect(managed).resolves.toBeUndefined();
    await expect(lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readActiveCredential(secrets)).toMatchObject({
      installId: "wins_manual_account",
    });
    expect(await readPendingCredential(secrets)).toBeUndefined();
  });

  it("resumes manual pending before considering a managed descriptor on focus", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-manual-resume-${process.pid}-${Date.now()}`,
    );
    const { filePath } = await createDescriptor(stateRoot, "manual-resume");
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    await storeActiveCredential(
      secrets,
      `wts_live_${"o".repeat(43)}`,
      "wins_old_account",
    );
    await stageManualCredential(secrets, {
      apiKey: `wts_live_${"m".repeat(43)}`,
      apiBase: "https://api.waitspin.com",
      installId: "wins_manual_account",
      allowLegacyWalletFailure: false,
    });
    const calls: string[] = [];

    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        fetchWithTimeout: async (url: string) => {
          calls.push(url);
          return url.endsWith("/wallet/status")
            ? walletResponse()
            : registrationResponse("wins_manual_account");
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).resolves.toMatchObject({ installId: "wins_manual_account" });
    expect(calls.some((url) => url.endsWith("/bootstrap/redeem"))).toBe(false);
    await expect(lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readManualPendingCredential(secrets)).toBeUndefined();
  });

  it("retires exact pending and higher-generation descriptors before manual promotion", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-manual-retire-all-${process.pid}-${Date.now()}`,
    );
    const exact = await createDescriptor(stateRoot, "manual-exact", {
      token: `wbst_${"b".repeat(43)}`,
    });
    const higher = await createDescriptor(stateRoot, "manual-higher", {
      generation: 2,
      token: `wbst_${"c".repeat(43)}`,
    });
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    await storeActiveCredential(
      secrets,
      `wts_live_${"o".repeat(43)}`,
      exact.installId,
    );
    await createOrReusePendingCredential(secrets, {
      token: exact.token,
      installId: exact.installId,
      installTarget: "vscode",
      publisherTarget: "status-bar-fallback",
      generation: exact.generation,
      expiresAt: "2027-07-16T00:00:00.000Z",
      apiBase: "https://api.waitspin.com",
    });

    await expect(
      runManualEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        candidate: {
          apiKey: `wts_live_${"m".repeat(43)}`,
          apiBase: "https://api.waitspin.com",
          installId: "wins_manual_account",
          allowLegacyWalletFailure: false,
        },
        fetchWithTimeout: async (url: string) =>
          url.endsWith("/wallet/status")
            ? walletResponse()
            : registrationResponse("wins_manual_account"),
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).resolves.toMatchObject({
      active: { installId: "wins_manual_account" },
    });

    await expect(lstat(exact.filePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(lstat(higher.filePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const lateHelper = await createDescriptor(stateRoot, "late-helper", {
      generation: 3,
      token: `wbst_${"d".repeat(43)}`,
    });
    let synchronizedInstallId: string | undefined;
    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        fetchWithTimeout: async () => {
          throw new Error("retired descriptors must not reach the network");
        },
        updateProjections: async (active) => {
          synchronizedInstallId = active.installId;
        },
        writeReceipt: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(synchronizedInstallId).toBe("wins_manual_account");
    expect(await readActiveCredential(secrets)).toMatchObject({
      installId: "wins_manual_account",
      managedActivationSuppressed: true,
    });
    await expect(lstat(lateHelper.filePath)).resolves.toBeDefined();
  });

  it("does not resume a stored loopback manual credential without current dev opt-in", async () => {
    const stateRoot = path.join(
      os.tmpdir(),
      `waitspin-manual-loopback-${process.pid}-${Date.now()}`,
    );
    const secrets = new SharedSecrets();
    const globalState = new MemoryGlobalState();
    await storeActiveCredential(
      secrets,
      `wts_live_${"o".repeat(43)}`,
      "wins_old_account",
    );
    await stageManualCredential(secrets, {
      apiKey: `wts_live_${"m".repeat(43)}`,
      apiBase: "http://127.0.0.1:8787",
      installId: "wins_manual_loopback",
      allowLegacyWalletFailure: false,
    });
    let networkCalls = 0;

    await expect(
      runManagedEditorActivation({
        stateRoot,
        installTarget: "vscode",
        secrets,
        globalState,
        fetchWithTimeout: async () => {
          networkCalls += 1;
          return okResponse();
        },
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
      }),
    ).rejects.toThrow("manual credential API base is no longer trusted");
    expect(networkCalls).toBe(0);
    expect(await readActiveCredential(secrets)).toMatchObject({
      installId: "wins_old_account",
    });
    expect(await readManualPendingCredential(secrets)).toMatchObject({
      installId: "wins_manual_loopback",
    });
  });
});
