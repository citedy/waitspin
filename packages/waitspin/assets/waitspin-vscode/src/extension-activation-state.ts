import { randomBytes } from "node:crypto";
import {
  normalizeTrustedApiBase,
  VSCODE_PUBLISHER_TARGET,
  type EditorBootstrapDescriptor,
  type EditorInstallTarget,
} from "./extension-core";

export const ACTIVE_CREDENTIAL_SECRET_KEY =
  "waitspin.publisherCredential.active.v1";
export const PENDING_CREDENTIAL_SECRET_KEY =
  "waitspin.publisherCredential.pending.v1";
export const MANUAL_PENDING_CREDENTIAL_SECRET_KEY =
  "waitspin.publisherCredential.manualPending.v1";
export const LEGACY_API_KEY_SECRET_KEY = "waitspin.publisherApiKey";

const INSTALL_ID_PATTERN = /^wins_[A-Za-z0-9._-]{3,123}$/;
const V2_API_KEY_PATTERN = /^wts_live_[A-Za-z0-9_-]{43}$/;

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export type ActiveCredentialEnvelope = {
  version: 1;
  apiKey: string;
  installId: string;
  managedActivationSuppressed: boolean;
};

export type PendingProtocolState =
  "stored" | "redeemed" | "registered" | "ready";

export type PendingCredentialEnvelope = {
  version: 1;
  apiKey: string;
  bootstrapToken: string;
  apiBase: string;
  installId: string;
  installTarget: EditorInstallTarget;
  publisherTarget: typeof VSCODE_PUBLISHER_TARGET;
  generation: number;
  descriptorExpiresAt: string;
  protocolState: PendingProtocolState;
};

export type ManualPendingCredentialEnvelope = {
  version: 1;
  apiKey: string;
  apiBase: string;
  installId: string;
  allowLegacyWalletFailure: boolean;
};

type PromotionActions = {
  assertCurrent(): void;
  updateProjections(active: ActiveCredentialEnvelope): Promise<void>;
  writeReceipt(active: ActiveCredentialEnvelope): Promise<void>;
  unlinkDescriptor(pending: PendingCredentialEnvelope): Promise<void>;
};

type ManualPromotionActions = {
  assertCurrent(): void;
  retireManagedDescriptor(
    pending: PendingCredentialEnvelope | undefined,
  ): Promise<void>;
  clearLegacyGeneration(): Promise<void>;
  updateProjections(active: ActiveCredentialEnvelope): Promise<void>;
  writeReceipt(active: ActiveCredentialEnvelope): Promise<void>;
};

async function storeActiveCredentialForPromotion(
  secrets: SecretStorageLike,
  apiKey: string,
  installId: string,
  managedActivationSuppressed: boolean,
  assertCurrent: () => void,
): Promise<ActiveCredentialEnvelope> {
  const previous = await secrets.get(ACTIVE_CREDENTIAL_SECRET_KEY);
  assertCurrent();
  const active = await storeActiveCredential(
    secrets,
    apiKey,
    installId,
    managedActivationSuppressed,
  );
  try {
    assertCurrent();
  } catch (error) {
    if (previous === undefined) {
      await secrets.delete(ACTIVE_CREDENTIAL_SECRET_KEY);
    } else {
      await secrets.store(ACTIVE_CREDENTIAL_SECRET_KEY, previous);
    }
    throw error;
  }
  return active;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJson(
  value: string | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return objectRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function validApiKey(value: unknown, exact: boolean): value is string {
  return (
    typeof value === "string" &&
    (exact ? V2_API_KEY_PATTERN.test(value) : value.startsWith("wts_live_"))
  );
}

function serializeActive(active: ActiveCredentialEnvelope): string {
  return JSON.stringify({
    version: active.version,
    api_key: active.apiKey,
    install_id: active.installId,
    managed_activation_suppressed: active.managedActivationSuppressed,
  });
}

function parseActive(
  value: string | undefined,
): ActiveCredentialEnvelope | undefined {
  const record = parseJson(value);
  if (
    !record ||
    record.version !== 1 ||
    !validApiKey(record.api_key, false) ||
    typeof record.install_id !== "string" ||
    !INSTALL_ID_PATTERN.test(record.install_id)
  ) {
    return undefined;
  }
  return {
    version: 1,
    apiKey: record.api_key,
    installId: record.install_id,
    managedActivationSuppressed: record.managed_activation_suppressed === true,
  };
}

function serializePending(pending: PendingCredentialEnvelope): string {
  return JSON.stringify({
    version: pending.version,
    api_key: pending.apiKey,
    bootstrap_token: pending.bootstrapToken,
    api_base: pending.apiBase,
    install_id: pending.installId,
    install_target: pending.installTarget,
    publisher_target: pending.publisherTarget,
    generation: pending.generation,
    descriptor_expires_at: pending.descriptorExpiresAt,
    protocol_state: pending.protocolState,
  });
}

function parsePending(
  value: string | undefined,
): PendingCredentialEnvelope | undefined {
  const record = parseJson(value);
  const apiBase =
    typeof record?.api_base === "string"
      ? normalizeTrustedApiBase(record.api_base, true)
      : undefined;
  const protocolState = record?.protocol_state;
  if (
    !record ||
    record.version !== 1 ||
    !validApiKey(record.api_key, true) ||
    typeof record.bootstrap_token !== "string" ||
    !/^wbst_[A-Za-z0-9_-]{43}$/.test(record.bootstrap_token) ||
    !apiBase ||
    typeof record.install_id !== "string" ||
    !INSTALL_ID_PATTERN.test(record.install_id) ||
    !["vscode", "cursor", "devin"].includes(String(record.install_target)) ||
    record.publisher_target !== VSCODE_PUBLISHER_TARGET ||
    !Number.isSafeInteger(record.generation) ||
    Number(record.generation) <= 0 ||
    typeof record.descriptor_expires_at !== "string" ||
    !Number.isFinite(Date.parse(record.descriptor_expires_at)) ||
    !["stored", "redeemed", "registered", "ready"].includes(
      String(protocolState),
    )
  ) {
    return undefined;
  }
  return {
    version: 1,
    apiKey: record.api_key,
    bootstrapToken: record.bootstrap_token,
    apiBase,
    installId: record.install_id,
    installTarget: record.install_target as EditorInstallTarget,
    publisherTarget: VSCODE_PUBLISHER_TARGET,
    generation: Number(record.generation),
    descriptorExpiresAt: record.descriptor_expires_at,
    protocolState: protocolState as PendingProtocolState,
  };
}

function serializeManualPending(
  pending: ManualPendingCredentialEnvelope,
): string {
  return JSON.stringify({
    version: pending.version,
    api_key: pending.apiKey,
    api_base: pending.apiBase,
    install_id: pending.installId,
    allow_legacy_wallet_failure: pending.allowLegacyWalletFailure,
  });
}

function parseManualPending(
  value: string | undefined,
): ManualPendingCredentialEnvelope | undefined {
  const record = parseJson(value);
  const apiBase =
    typeof record?.api_base === "string"
      ? normalizeTrustedApiBase(record.api_base, true)
      : undefined;
  if (
    !record ||
    record.version !== 1 ||
    !validApiKey(record.api_key, false) ||
    !apiBase ||
    typeof record.install_id !== "string" ||
    !INSTALL_ID_PATTERN.test(record.install_id) ||
    typeof record.allow_legacy_wallet_failure !== "boolean"
  ) {
    return undefined;
  }
  return {
    version: 1,
    apiKey: record.api_key,
    apiBase,
    installId: record.install_id,
    allowLegacyWalletFailure: record.allow_legacy_wallet_failure,
  };
}

async function storeAndReadback<T>(
  secrets: SecretStorageLike,
  key: string,
  value: T,
  serialize: (candidate: T) => string,
  read: (storage: SecretStorageLike) => Promise<T | undefined>,
): Promise<T> {
  await secrets.store(key, serialize(value));
  const stored = await read(secrets);
  if (!stored || serialize(stored) !== serialize(value)) {
    throw new Error("WaitSpin SecretStorage readback failed");
  }
  return stored;
}

export function generateManagedApiKey(
  bytes: (size: number) => Buffer = randomBytes,
): string {
  return `wts_live_${bytes(32).toString("base64url")}`;
}

export async function readActiveCredential(
  secrets: SecretStorageLike,
): Promise<ActiveCredentialEnvelope | undefined> {
  return parseActive(await secrets.get(ACTIVE_CREDENTIAL_SECRET_KEY));
}

export async function readPendingCredential(
  secrets: SecretStorageLike,
): Promise<PendingCredentialEnvelope | undefined> {
  return parsePending(await secrets.get(PENDING_CREDENTIAL_SECRET_KEY));
}

export async function readManualPendingCredential(
  secrets: SecretStorageLike,
): Promise<ManualPendingCredentialEnvelope | undefined> {
  return parseManualPending(
    await secrets.get(MANUAL_PENDING_CREDENTIAL_SECRET_KEY),
  );
}

export async function storeActiveCredential(
  secrets: SecretStorageLike,
  apiKey: string,
  installId: string,
  managedActivationSuppressed = false,
): Promise<ActiveCredentialEnvelope> {
  const active: ActiveCredentialEnvelope = {
    version: 1,
    apiKey,
    installId,
    managedActivationSuppressed,
  };
  if (!parseActive(serializeActive(active))) {
    throw new Error("Invalid WaitSpin active credential identity");
  }
  return storeAndReadback(
    secrets,
    ACTIVE_CREDENTIAL_SECRET_KEY,
    active,
    serializeActive,
    readActiveCredential,
  );
}

export async function stageManualCredential(
  secrets: SecretStorageLike,
  candidate: Omit<ManualPendingCredentialEnvelope, "version">,
): Promise<ManualPendingCredentialEnvelope> {
  const pending: ManualPendingCredentialEnvelope = {
    version: 1,
    ...candidate,
  };
  if (!parseManualPending(serializeManualPending(pending))) {
    throw new Error("Invalid WaitSpin manual pending credential identity");
  }
  const existing = await readManualPendingCredential(secrets);
  if (
    existing &&
    serializeManualPending(existing) === serializeManualPending(pending)
  ) {
    return existing;
  }
  return storeAndReadback(
    secrets,
    MANUAL_PENDING_CREDENTIAL_SECRET_KEY,
    pending,
    serializeManualPending,
    readManualPendingCredential,
  );
}

export async function promoteManualCredential(
  secrets: SecretStorageLike,
  pending: ManualPendingCredentialEnvelope,
  actions: ManualPromotionActions,
): Promise<ActiveCredentialEnvelope> {
  actions.assertCurrent();
  const current = await readManualPendingCredential(secrets);
  actions.assertCurrent();
  if (
    !current ||
    serializeManualPending(current) !== serializeManualPending(pending)
  ) {
    throw new Error(
      "WaitSpin manual pending credential changed before promotion",
    );
  }

  actions.assertCurrent();
  const managedPending = await readPendingCredential(secrets);
  actions.assertCurrent();
  await actions.retireManagedDescriptor(managedPending);
  actions.assertCurrent();
  await secrets.delete(PENDING_CREDENTIAL_SECRET_KEY);
  actions.assertCurrent();
  await actions.clearLegacyGeneration();
  actions.assertCurrent();

  const active = await storeActiveCredentialForPromotion(
    secrets,
    current.apiKey,
    current.installId,
    true,
    actions.assertCurrent,
  );
  await actions.updateProjections(active);
  actions.assertCurrent();
  await actions.writeReceipt(active);
  actions.assertCurrent();
  try {
    await secrets.delete(LEGACY_API_KEY_SECRET_KEY);
  } catch {}
  actions.assertCurrent();
  await secrets.delete(MANUAL_PENDING_CREDENTIAL_SECRET_KEY);
  actions.assertCurrent();
  return active;
}

function pendingMatchesDescriptor(
  pending: PendingCredentialEnvelope,
  descriptor: EditorBootstrapDescriptor,
): boolean {
  return (
    pending.bootstrapToken === descriptor.token &&
    pending.apiBase === descriptor.apiBase &&
    pending.installId === descriptor.installId &&
    pending.installTarget === descriptor.installTarget &&
    pending.publisherTarget === descriptor.publisherTarget &&
    pending.generation === descriptor.generation &&
    pending.descriptorExpiresAt === descriptor.expiresAt
  );
}

export async function createOrReusePendingCredential(
  secrets: SecretStorageLike,
  descriptor: EditorBootstrapDescriptor,
): Promise<PendingCredentialEnvelope> {
  const existing = await readPendingCredential(secrets);
  if (existing && pendingMatchesDescriptor(existing, descriptor))
    return existing;
  if (existing && existing.generation >= descriptor.generation) {
    throw new Error("WaitSpin pending credential generation conflict");
  }
  const pending: PendingCredentialEnvelope = {
    version: 1,
    apiKey: generateManagedApiKey(),
    bootstrapToken: descriptor.token,
    apiBase: descriptor.apiBase,
    installId: descriptor.installId,
    installTarget: descriptor.installTarget,
    publisherTarget: descriptor.publisherTarget,
    generation: descriptor.generation,
    descriptorExpiresAt: descriptor.expiresAt,
    protocolState: "stored",
  };
  return storeAndReadback(
    secrets,
    PENDING_CREDENTIAL_SECRET_KEY,
    pending,
    serializePending,
    readPendingCredential,
  );
}

export async function reconcileStoredPendingDescriptor(
  secrets: SecretStorageLike,
  pending: PendingCredentialEnvelope,
  descriptor: EditorBootstrapDescriptor,
): Promise<PendingCredentialEnvelope> {
  if (
    pending.protocolState !== "stored" ||
    pending.installId !== descriptor.installId ||
    pending.installTarget !== descriptor.installTarget ||
    pending.publisherTarget !== descriptor.publisherTarget ||
    pending.apiBase !== descriptor.apiBase ||
    pending.generation !== descriptor.generation
  ) {
    return pending;
  }
  if (pendingMatchesDescriptor(pending, descriptor)) return pending;
  const current = await readPendingCredential(secrets);
  if (!current || serializePending(current) !== serializePending(pending)) {
    throw new Error("WaitSpin pending credential changed during renewal");
  }
  return storeAndReadback(
    secrets,
    PENDING_CREDENTIAL_SECRET_KEY,
    {
      ...pending,
      bootstrapToken: descriptor.token,
      descriptorExpiresAt: descriptor.expiresAt,
    },
    serializePending,
    readPendingCredential,
  );
}

export async function updatePendingProtocolState(
  secrets: SecretStorageLike,
  pending: PendingCredentialEnvelope,
  protocolState: PendingProtocolState,
): Promise<PendingCredentialEnvelope> {
  const current = await readPendingCredential(secrets);
  if (
    !current ||
    current.apiKey !== pending.apiKey ||
    current.generation !== pending.generation
  ) {
    throw new Error("WaitSpin pending credential changed during activation");
  }
  return storeAndReadback(
    secrets,
    PENDING_CREDENTIAL_SECRET_KEY,
    { ...current, protocolState },
    serializePending,
    readPendingCredential,
  );
}

export async function translateLegacyPendingCredential(
  secrets: SecretStorageLike,
  active: ActiveCredentialEnvelope,
  descriptor: EditorBootstrapDescriptor,
): Promise<PendingCredentialEnvelope> {
  if (
    active.installId !== descriptor.installId ||
    !V2_API_KEY_PATTERN.test(active.apiKey)
  ) {
    throw new Error("Incomplete WaitSpin legacy pending credential state");
  }
  const existing = await readPendingCredential(secrets);
  if (existing) {
    if (
      existing.apiKey === active.apiKey &&
      pendingMatchesDescriptor(existing, descriptor) &&
      existing.protocolState !== "stored"
    ) {
      return existing;
    }
    throw new Error(
      "WaitSpin legacy pending credential conflicts with stored state",
    );
  }
  const pending: PendingCredentialEnvelope = {
    version: 1,
    apiKey: active.apiKey,
    bootstrapToken: descriptor.token,
    apiBase: descriptor.apiBase,
    installId: descriptor.installId,
    installTarget: descriptor.installTarget,
    publisherTarget: descriptor.publisherTarget,
    generation: descriptor.generation,
    descriptorExpiresAt: descriptor.expiresAt,
    protocolState: "redeemed",
  };
  return storeAndReadback(
    secrets,
    PENDING_CREDENTIAL_SECRET_KEY,
    pending,
    serializePending,
    readPendingCredential,
  );
}

export async function promotePendingCredential(
  secrets: SecretStorageLike,
  pending: PendingCredentialEnvelope,
  actions: PromotionActions,
): Promise<ActiveCredentialEnvelope> {
  actions.assertCurrent();
  if (pending.protocolState !== "ready") {
    throw new Error("WaitSpin pending credential is not ready for promotion");
  }
  const current = await readPendingCredential(secrets);
  actions.assertCurrent();
  if (!current || serializePending(current) !== serializePending(pending)) {
    throw new Error("WaitSpin pending credential changed before promotion");
  }
  const active = await storeActiveCredentialForPromotion(
    secrets,
    pending.apiKey,
    pending.installId,
    false,
    actions.assertCurrent,
  );
  await actions.updateProjections(active);
  actions.assertCurrent();
  await actions.writeReceipt(active);
  actions.assertCurrent();
  await actions.unlinkDescriptor(pending);
  actions.assertCurrent();
  await secrets.delete(PENDING_CREDENTIAL_SECRET_KEY);
  actions.assertCurrent();
  return active;
}

export async function migrateLegacyCredential(
  secrets: SecretStorageLike,
  installId: string | undefined,
): Promise<ActiveCredentialEnvelope | undefined> {
  const active = await readActiveCredential(secrets);
  const legacyApiKey = (await secrets.get(LEGACY_API_KEY_SECRET_KEY))?.trim();
  if (active) {
    if (legacyApiKey) {
      try {
        await secrets.delete(LEGACY_API_KEY_SECRET_KEY);
      } catch {
        return active;
      }
    }
    return active;
  }
  if (!legacyApiKey || !installId) return undefined;
  const migrated = await storeActiveCredential(
    secrets,
    legacyApiKey,
    installId,
  );
  try {
    await secrets.delete(LEGACY_API_KEY_SECRET_KEY);
  } catch {
    return migrated;
  }
  return migrated;
}

export async function clearCredentialState(
  secrets: SecretStorageLike,
): Promise<void> {
  await secrets.delete(MANUAL_PENDING_CREDENTIAL_SECRET_KEY);
  await secrets.delete(PENDING_CREDENTIAL_SECRET_KEY);
  await secrets.delete(LEGACY_API_KEY_SECRET_KEY);
  await secrets.delete(ACTIVE_CREDENTIAL_SECRET_KEY);
}
