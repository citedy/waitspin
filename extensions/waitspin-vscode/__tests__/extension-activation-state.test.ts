/** @jest-environment node */

import {
  ACTIVE_CREDENTIAL_SECRET_KEY,
  LEGACY_API_KEY_SECRET_KEY,
  MANUAL_PENDING_CREDENTIAL_SECRET_KEY,
  PENDING_CREDENTIAL_SECRET_KEY,
  clearCredentialState,
  createOrReusePendingCredential,
  migrateLegacyCredential,
  promotePendingCredential,
  promoteManualCredential,
  readActiveCredential,
  readManualPendingCredential,
  readPendingCredential,
  stageManualCredential,
  translateLegacyPendingCredential,
  updatePendingProtocolState,
  type SecretStorageLike,
} from "../src/extension-activation-state";
import { parseRedeemedPublisherCredential } from "../src/extension-core";

class MemorySecrets implements SecretStorageLike {
  readonly values = new Map<string, string>();
  readonly events: string[] = [];
  failAfterStore: string | undefined;
  failDelete: string | undefined;

  async get(key: string): Promise<string | undefined> {
    this.events.push(`get:${key}`);
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.events.push(`store:${key}`);
    this.values.set(key, value);
    if (this.failAfterStore === key)
      throw new Error("injected store interruption");
  }

  async delete(key: string): Promise<void> {
    this.events.push(`delete:${key}`);
    if (this.failDelete === key)
      throw new Error("injected delete interruption");
    this.values.delete(key);
  }
}

const descriptor = {
  token: `wbst_${"a".repeat(43)}`,
  installId: "wins_extension_atomicity",
  installTarget: "vscode" as const,
  publisherTarget: "status-bar-fallback" as const,
  generation: 7,
  expiresAt: "2026-07-16T00:00:00.000Z",
  apiBase: "https://api.waitspin.com",
};

describe("managed editor activation SecretStorage state", () => {
  it("accepts metadata-only v2 redeem with the already stored client key", () => {
    const apiKey = `wts_live_${"z".repeat(43)}`;
    expect(
      parseRedeemedPublisherCredential(
        {
          protocol_version: 2,
          credential_id: "wkey_child",
          install_id: descriptor.installId,
          install_target: descriptor.installTarget,
          publisher_target: descriptor.publisherTarget,
          generation: descriptor.generation,
          scopes: [
            "publishers:write",
            "serve:read",
            "events:write",
            "wallet:read",
          ],
        },
        descriptor,
        apiKey,
      ),
    ).toMatchObject({ apiKey, installId: descriptor.installId });
  });

  it("stores and reads back one locally generated pending identity before redeem", async () => {
    const secrets = new MemorySecrets();
    const first = await createOrReusePendingCredential(secrets, descriptor);
    const second = await createOrReusePendingCredential(secrets, descriptor);

    expect(first.apiKey).toMatch(/^wts_live_[A-Za-z0-9_-]{43}$/);
    expect(second).toEqual(first);
    expect(await readPendingCredential(secrets)).toEqual(first);
    expect(
      secrets.events.indexOf(`store:${PENDING_CREDENTIAL_SECRET_KEY}`),
    ).toBeLessThan(
      secrets.events.lastIndexOf(`get:${PENDING_CREDENTIAL_SECRET_KEY}`),
    );
  });

  it("keeps the previous active identity while a higher generation is pending", async () => {
    const secrets = new MemorySecrets();
    await secrets.store(
      ACTIVE_CREDENTIAL_SECRET_KEY,
      JSON.stringify({
        version: 1,
        api_key: `wts_live_${"b".repeat(43)}`,
        install_id: "wins_old",
      }),
    );
    await createOrReusePendingCredential(secrets, descriptor);
    const replacement = await createOrReusePendingCredential(secrets, {
      ...descriptor,
      token: `wbst_${"c".repeat(43)}`,
      installId: "wins_replacement",
      generation: 8,
    });

    expect((await readActiveCredential(secrets))?.installId).toBe("wins_old");
    expect(replacement.installId).toBe("wins_replacement");
    expect(replacement.generation).toBe(8);
  });

  it("leaves both envelopes resumable when promotion is interrupted", async () => {
    const secrets = new MemorySecrets();
    const created = await createOrReusePendingCredential(secrets, descriptor);
    const pending = await updatePendingProtocolState(secrets, created, "ready");
    secrets.failAfterStore = ACTIVE_CREDENTIAL_SECRET_KEY;

    await expect(
      promotePendingCredential(secrets, pending, {
        assertCurrent: () => undefined,
        updateProjections: async () => undefined,
        writeReceipt: async () => undefined,
        unlinkDescriptor: async () => undefined,
      }),
    ).rejects.toThrow("injected store interruption");
    expect(await readActiveCredential(secrets)).toMatchObject({
      installId: descriptor.installId,
    });
    expect(await readPendingCredential(secrets)).toEqual(pending);

    secrets.failAfterStore = undefined;
    await promotePendingCredential(secrets, pending, {
      assertCurrent: () => undefined,
      updateProjections: async () => undefined,
      writeReceipt: async () => undefined,
      unlinkDescriptor: async () => undefined,
    });
    expect(await readPendingCredential(secrets)).toBeUndefined();
  });

  it.each(["projection", "receipt", "descriptor", "pending-delete"])(
    "keeps active and pending resumable after the %s boundary fails",
    async (boundary) => {
      const secrets = new MemorySecrets();
      const created = await createOrReusePendingCredential(secrets, descriptor);
      const pending = await updatePendingProtocolState(
        secrets,
        created,
        "ready",
      );
      if (boundary === "pending-delete") {
        secrets.failDelete = PENDING_CREDENTIAL_SECRET_KEY;
      }
      await expect(
        promotePendingCredential(secrets, pending, {
          assertCurrent: () => undefined,
          updateProjections: async () => {
            if (boundary === "projection")
              throw new Error("projection interruption");
          },
          writeReceipt: async () => {
            if (boundary === "receipt") throw new Error("receipt interruption");
          },
          unlinkDescriptor: async () => {
            if (boundary === "descriptor")
              throw new Error("descriptor interruption");
          },
        }),
      ).rejects.toThrow("interruption");
      expect(await readActiveCredential(secrets)).toMatchObject({
        installId: descriptor.installId,
      });
      expect(await readPendingCredential(secrets)).toEqual(pending);
    },
  );

  it("migrates the shipped raw key only after active-envelope readback", async () => {
    const secrets = new MemorySecrets();
    const legacyKey = `wts_live_${"d".repeat(43)}`;
    await secrets.store(LEGACY_API_KEY_SECRET_KEY, legacyKey);
    secrets.events.length = 0;

    await expect(
      migrateLegacyCredential(secrets, undefined),
    ).resolves.toBeUndefined();
    expect(secrets.values.get(LEGACY_API_KEY_SECRET_KEY)).toBe(legacyKey);

    const migrated = await migrateLegacyCredential(
      secrets,
      descriptor.installId,
    );
    expect(migrated).toMatchObject({
      apiKey: legacyKey,
      installId: descriptor.installId,
    });
    expect(
      secrets.events.lastIndexOf(`get:${ACTIVE_CREDENTIAL_SECRET_KEY}`),
    ).toBeLessThan(
      secrets.events.lastIndexOf(`delete:${LEGACY_API_KEY_SECRET_KEY}`),
    );
  });

  it("finishes interrupted legacy cleanup and translates the scalar generation once", async () => {
    const secrets = new MemorySecrets();
    const legacyKey = `wts_live_${"g".repeat(43)}`;
    await secrets.store(LEGACY_API_KEY_SECRET_KEY, legacyKey);
    await secrets.store(
      ACTIVE_CREDENTIAL_SECRET_KEY,
      JSON.stringify({
        version: 1,
        api_key: legacyKey,
        install_id: descriptor.installId,
      }),
    );
    await migrateLegacyCredential(secrets, descriptor.installId);
    expect(secrets.values.has(LEGACY_API_KEY_SECRET_KEY)).toBe(false);

    const active = await readActiveCredential(secrets);
    const pending = await translateLegacyPendingCredential(
      secrets,
      active!,
      descriptor,
    );
    expect(pending).toMatchObject({
      apiKey: legacyKey,
      generation: descriptor.generation,
      protocolState: "redeemed",
    });
    await expect(
      translateLegacyPendingCredential(secrets, active!, descriptor),
    ).resolves.toEqual(pending);
  });

  it("keeps a readback-verified active credential usable when legacy cleanup is interrupted", async () => {
    const secrets = new MemorySecrets();
    const legacyKey = `wts_live_${"i".repeat(43)}`;
    await secrets.store(LEGACY_API_KEY_SECRET_KEY, legacyKey);
    secrets.failDelete = LEGACY_API_KEY_SECRET_KEY;
    await expect(
      migrateLegacyCredential(secrets, descriptor.installId),
    ).resolves.toMatchObject({
      apiKey: legacyKey,
      installId: descriptor.installId,
    });
    expect(secrets.values.get(LEGACY_API_KEY_SECRET_KEY)).toBe(legacyKey);
    expect(await readActiveCredential(secrets)).toMatchObject({
      apiKey: legacyKey,
    });
  });

  it("deletes a stale different legacy key after verifying the active envelope", async () => {
    const secrets = new MemorySecrets();
    await storeActiveCredentialForTest(secrets, descriptor.installId);
    await secrets.store(
      LEGACY_API_KEY_SECRET_KEY,
      `wts_live_${"k".repeat(43)}`,
    );
    await migrateLegacyCredential(secrets, descriptor.installId);
    expect(secrets.values.has(LEGACY_API_KEY_SECRET_KEY)).toBe(false);
    expect((await readActiveCredential(secrets))?.apiKey).toBe(
      `wts_live_${"h".repeat(43)}`,
    );
  });

  it("fails closed when legacy pending identity is incomplete", async () => {
    const secrets = new MemorySecrets();
    const active = await storeActiveCredentialForTest(secrets, "wins_other");
    await expect(
      translateLegacyPendingCredential(secrets, active, descriptor),
    ).rejects.toThrow("Incomplete WaitSpin legacy pending credential state");
    expect(await readPendingCredential(secrets)).toBeUndefined();
  });

  it("does not clear legacy recovery state when another pending identity exists", async () => {
    const secrets = new MemorySecrets();
    const active = await storeActiveCredentialForTest(
      secrets,
      descriptor.installId,
    );
    await createOrReusePendingCredential(secrets, {
      ...descriptor,
      token: `wbst_${"j".repeat(43)}`,
      installId: "wins_conflicting_pending",
      generation: descriptor.generation + 1,
    });
    await expect(
      translateLegacyPendingCredential(secrets, active, descriptor),
    ).rejects.toThrow("conflicts with stored state");
    expect((await readPendingCredential(secrets))?.installId).toBe(
      "wins_conflicting_pending",
    );
  });

  it("clears pending, legacy, then active representations", async () => {
    const secrets = new MemorySecrets();
    await createOrReusePendingCredential(secrets, descriptor);
    await secrets.store(
      LEGACY_API_KEY_SECRET_KEY,
      `wts_live_${"e".repeat(43)}`,
    );
    await secrets.store(
      ACTIVE_CREDENTIAL_SECRET_KEY,
      JSON.stringify({
        version: 1,
        api_key: `wts_live_${"f".repeat(43)}`,
        install_id: "wins_active",
      }),
    );
    secrets.events.length = 0;

    await clearCredentialState(secrets);
    expect(
      secrets.events.filter((event) => event.startsWith("delete:")),
    ).toEqual([
      `delete:${MANUAL_PENDING_CREDENTIAL_SECRET_KEY}`,
      `delete:${PENDING_CREDENTIAL_SECRET_KEY}`,
      `delete:${LEGACY_API_KEY_SECRET_KEY}`,
      `delete:${ACTIVE_CREDENTIAL_SECRET_KEY}`,
    ]);
  });

  it("stages a manual account separately without replacing active or managed recovery", async () => {
    const secrets = new MemorySecrets();
    const oldActive = await storeActiveCredentialForTest(
      secrets,
      "wins_old_account",
    );
    const managed = await createOrReusePendingCredential(secrets, descriptor);
    const manual = await stageManualCredential(secrets, {
      apiKey: `wts_live_${"m".repeat(43)}`,
      apiBase: "https://api.waitspin.com",
      installId: "wins_manual_account",
      allowLegacyWalletFailure: false,
    });

    expect(await readActiveCredential(secrets)).toEqual(oldActive);
    expect(await readPendingCredential(secrets)).toEqual(managed);
    expect(await readManualPendingCredential(secrets)).toEqual(manual);
  });

  it.each(["descriptor", "managed-delete", "generation-clear"])(
    "keeps the old active identity when manual promotion fails at %s",
    async (boundary) => {
      const secrets = new MemorySecrets();
      const oldActive = await storeActiveCredentialForTest(
        secrets,
        "wins_old_account",
      );
      await createOrReusePendingCredential(secrets, descriptor);
      const manual = await stageManualCredential(secrets, {
        apiKey: `wts_live_${"n".repeat(43)}`,
        apiBase: "https://api.waitspin.com",
        installId: "wins_manual_account",
        allowLegacyWalletFailure: false,
      });
      if (boundary === "managed-delete") {
        secrets.failDelete = PENDING_CREDENTIAL_SECRET_KEY;
      }

      await expect(
        promoteManualCredential(secrets, manual, {
          assertCurrent: () => undefined,
          retireManagedDescriptor: async () => {
            if (boundary === "descriptor")
              throw new Error("descriptor interruption");
          },
          clearLegacyGeneration: async () => {
            if (boundary === "generation-clear")
              throw new Error("generation interruption");
          },
          updateProjections: async () => undefined,
          writeReceipt: async () => undefined,
        }),
      ).rejects.toThrow("interruption");
      expect(await readActiveCredential(secrets)).toEqual(oldActive);
      expect(await readManualPendingCredential(secrets)).toEqual(manual);
    },
  );

  it("retires descriptor before managed recovery and promotes manual active last", async () => {
    const secrets = new MemorySecrets();
    await storeActiveCredentialForTest(secrets, "wins_old_account");
    await createOrReusePendingCredential(secrets, descriptor);
    const manual = await stageManualCredential(secrets, {
      apiKey: `wts_live_${"p".repeat(43)}`,
      apiBase: "https://api.waitspin.com",
      installId: "wins_manual_account",
      allowLegacyWalletFailure: false,
    });
    secrets.failDelete = LEGACY_API_KEY_SECRET_KEY;
    secrets.events.length = 0;

    const active = await promoteManualCredential(secrets, manual, {
      assertCurrent: () => undefined,
      retireManagedDescriptor: async () => {
        secrets.events.push("retire:descriptor");
      },
      clearLegacyGeneration: async () => {
        secrets.events.push("clear:generation");
      },
      updateProjections: async () => {
        secrets.events.push("update:projections");
      },
      writeReceipt: async () => {
        secrets.events.push("write:receipt");
      },
    });

    expect(active.installId).toBe("wins_manual_account");
    expect(await readPendingCredential(secrets)).toBeUndefined();
    expect(await readActiveCredential(secrets)).toMatchObject({
      installId: "wins_manual_account",
    });
    expect(await readManualPendingCredential(secrets)).toBeUndefined();
    expect(secrets.events.indexOf("retire:descriptor")).toBeLessThan(
      secrets.events.indexOf(`delete:${PENDING_CREDENTIAL_SECRET_KEY}`),
    );
    expect(
      secrets.events.indexOf(`delete:${PENDING_CREDENTIAL_SECRET_KEY}`),
    ).toBeLessThan(secrets.events.indexOf("clear:generation"));
    expect(secrets.events.indexOf("clear:generation")).toBeLessThan(
      secrets.events.indexOf(`store:${ACTIVE_CREDENTIAL_SECRET_KEY}`),
    );
    expect(
      secrets.events.indexOf(`store:${ACTIVE_CREDENTIAL_SECRET_KEY}`),
    ).toBeLessThan(
      secrets.events.indexOf(`delete:${MANUAL_PENDING_CREDENTIAL_SECRET_KEY}`),
    );
  });

  it.each(["projection", "receipt", "manual-delete"])(
    "resumes an already promoted manual identity after %s interruption",
    async (boundary) => {
      const secrets = new MemorySecrets();
      await storeActiveCredentialForTest(secrets, "wins_old_account");
      const manual = await stageManualCredential(secrets, {
        apiKey: `wts_live_${"q".repeat(43)}`,
        apiBase: "https://api.waitspin.com",
        installId: "wins_manual_account",
        allowLegacyWalletFailure: false,
      });
      if (boundary === "manual-delete") {
        secrets.failDelete = MANUAL_PENDING_CREDENTIAL_SECRET_KEY;
      }

      await expect(
        promoteManualCredential(secrets, manual, {
          assertCurrent: () => undefined,
          retireManagedDescriptor: async () => undefined,
          clearLegacyGeneration: async () => undefined,
          updateProjections: async () => {
            if (boundary === "projection")
              throw new Error("projection interruption");
          },
          writeReceipt: async () => {
            if (boundary === "receipt") throw new Error("receipt interruption");
          },
        }),
      ).rejects.toThrow("interruption");
      expect(await readActiveCredential(secrets)).toMatchObject({
        apiKey: manual.apiKey,
        installId: manual.installId,
      });
      expect(await readManualPendingCredential(secrets)).toEqual(manual);
    },
  );
});

async function storeActiveCredentialForTest(
  secrets: MemorySecrets,
  installId: string,
) {
  const apiKey = `wts_live_${"h".repeat(43)}`;
  await secrets.store(
    ACTIVE_CREDENTIAL_SECRET_KEY,
    JSON.stringify({ version: 1, api_key: apiKey, install_id: installId }),
  );
  return (await readActiveCredential(secrets))!;
}
