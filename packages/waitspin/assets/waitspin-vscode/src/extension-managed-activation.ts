import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  normalizeTrustedApiBase,
  parseEditorBootstrapDescriptor,
  resolveWaitSpinApiBase,
  parseRedeemedPublisherCredential,
  selectEditorBootstrapCandidate,
  VSCODE_PUBLISHER_TARGET,
  type EditorBootstrapDescriptor,
  type EditorInstallTarget,
} from "./extension-core";
import {
  createOrReusePendingCredential,
  promoteManualCredential,
  promotePendingCredential,
  readActiveCredential,
  readManualPendingCredential,
  readPendingCredential,
  reconcileStoredPendingDescriptor,
  stageManualCredential,
  translateLegacyPendingCredential,
  updatePendingProtocolState,
  type ActiveCredentialEnvelope,
  type ManualPendingCredentialEnvelope,
  type PendingCredentialEnvelope,
  type SecretStorageLike,
} from "./extension-activation-state";
import { acquireEditorActivationLock } from "./extension-activation-lock";
import {
  assertEditorActivationCurrent,
  EditorActivationFailure,
  requestEditorActivation,
} from "./extension-activation-retry";
import {
  registerManualPublisher,
  validateManualWallet,
} from "./extension-manual-activation";

export const BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY =
  "waitspin.publisherBootstrapGeneration";

export interface GlobalStateLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

type ManagedActivationInput = {
  stateRoot: string;
  installTarget: EditorInstallTarget;
  secrets: SecretStorageLike;
  globalState: GlobalStateLike;
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
  updateProjections(active: ActiveCredentialEnvelope): Promise<void>;
  writeReceipt(active: ActiveCredentialEnvelope): Promise<void>;
  allowDeveloperApiBase?: boolean;
  allowManagedOverride?: boolean;
  signal?: AbortSignal;
};

type ManualActivationInput = ManagedActivationInput & {
  candidate: Omit<ManualPendingCredentialEnvelope, "version">;
};

type LoadedBootstrapDescriptor = {
  filePath: string;
  device: number;
  inode: number;
  digest: string;
  canonical: boolean;
  modifiedAtMs: number;
  descriptor: EditorBootstrapDescriptor;
};

function expectedManagedApiBase(allowDeveloperApiBase: boolean): string {
  const normalized = resolveWaitSpinApiBase(
    undefined,
    process.env.WAITSPIN_BASE_URL,
    allowDeveloperApiBase,
  );
  if (!normalized) {
    throw new EditorActivationFailure(
      "descriptor",
      "descriptor-unsafe",
      "configured API base is invalid",
    );
  }
  return normalized;
}

function descriptorFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function descriptorFilename(
  descriptor: Pick<
    EditorBootstrapDescriptor,
    "installId" | "generation" | "token"
  >,
): string {
  return `${descriptor.installId}.generation-${descriptor.generation}.${descriptorFingerprint(descriptor.token)}.json`;
}

async function loadEditorBootstrapDescriptors(
  stateRoot: string,
  installTarget: EditorInstallTarget,
  allowExpired: boolean,
  allowDeveloperApiBase = false,
): Promise<LoadedBootstrapDescriptor[]> {
  const expectedApiBase = expectedManagedApiBase(allowDeveloperApiBase);
  const directory = path.join(stateRoot, "bootstrap", installTarget);
  let directoryInfo;
  try {
    directoryInfo = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new EditorActivationFailure(
      "descriptor",
      "descriptor-unsafe",
      "bootstrap directory could not be inspected safely",
      { cause: error },
    );
  }
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    directoryInfo.uid !== process.getuid?.() ||
    (directoryInfo.mode & 0o077) !== 0
  ) {
    throw new EditorActivationFailure(
      "descriptor",
      "descriptor-unsafe",
      "bootstrap directory ownership or mode is unsafe",
    );
  }
  const candidates = (await readdir(directory)).filter((name) =>
    /^wins_[A-Za-z0-9._-]{3,123}(?:\.generation-[1-9][0-9]*\.[a-f0-9]{16})?\.json$/.test(
      name,
    ),
  );
  const valid: LoadedBootstrapDescriptor[] = [];
  const nowMs = Date.now();
  let latestExpiredAtMs: number | undefined;
  let unsafeCandidate = false;
  for (const name of candidates) {
    const filePath = path.join(directory, name);
    const handle = await open(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    ).catch(() => undefined);
    if (!handle) {
      unsafeCandidate = true;
      continue;
    }
    try {
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        info.nlink !== 1 ||
        (info.mode & 0o077) !== 0 ||
        info.size > 16 * 1024
      ) {
        unsafeCandidate = true;
        continue;
      }
      const raw = await handle.readFile({ encoding: "utf8" });
      const payload = JSON.parse(raw);
      const descriptor = parseEditorBootstrapDescriptor(
        payload,
        installTarget,
        allowExpired ? 0 : nowMs,
        allowDeveloperApiBase,
        expectedApiBase,
      );
      const expiredDescriptor = descriptor
        ? undefined
        : parseEditorBootstrapDescriptor(
            payload,
            installTarget,
            0,
            allowDeveloperApiBase,
            expectedApiBase,
          );
      const expiresAtMs = expiredDescriptor
        ? Date.parse(expiredDescriptor.expiresAt)
        : undefined;
      if (expiresAtMs !== undefined && expiresAtMs <= nowMs) {
        latestExpiredAtMs = Math.max(latestExpiredAtMs ?? 0, expiresAtMs);
        continue;
      }
      const canonicalName = descriptor ? descriptorFilename(descriptor) : "";
      const legacyName = descriptor ? `${descriptor.installId}.json` : "";
      if (
        !descriptor ||
        (path.basename(filePath) !== canonicalName &&
          path.basename(filePath) !== legacyName)
      ) {
        unsafeCandidate = true;
        continue;
      }
      valid.push({
        filePath,
        device: info.dev,
        inode: info.ino,
        digest: createHash("sha256").update(raw).digest("hex"),
        canonical: path.basename(filePath) === canonicalName,
        modifiedAtMs: info.mtimeMs,
        descriptor,
      });
    } catch (error) {
      if (error instanceof EditorActivationFailure) throw error;
      unsafeCandidate = true;
      continue;
    } finally {
      await handle.close();
    }
  }
  if (unsafeCandidate) {
    throw new EditorActivationFailure(
      "descriptor",
      "descriptor-unsafe",
      "bootstrap descriptor ownership, mode, or contents are unsafe",
    );
  }
  if (valid.length === 0 && latestExpiredAtMs !== undefined) {
    throw new EditorActivationFailure(
      "descriptor",
      "credential-expired",
      "bootstrap descriptor has expired",
      { expiresAtMs: latestExpiredAtMs },
    );
  }
  return valid;
}

async function loadEditorBootstrapDescriptor(
  stateRoot: string,
  installTarget: EditorInstallTarget,
  expected?: Pick<EditorBootstrapDescriptor, "installId" | "generation"> &
    Partial<Pick<EditorBootstrapDescriptor, "token">>,
  allowExpired = expected !== undefined,
  allowDeveloperApiBase = false,
): Promise<LoadedBootstrapDescriptor | undefined> {
  const valid = await loadEditorBootstrapDescriptors(
    stateRoot,
    installTarget,
    allowExpired,
    allowDeveloperApiBase,
  );
  const selected = selectEditorBootstrapCandidate(valid, expected);
  if (selected.kind === "ambiguous") {
    throw new EditorActivationFailure(
      "descriptor",
      "descriptor-unsafe",
      "bootstrap descriptors have an ambiguous generation",
    );
  }
  return selected.kind === "selected" ? selected.candidate : undefined;
}

function requestManagedActivation(
  input: ManagedActivationInput,
  pending: PendingCredentialEnvelope,
  phase: "redeem" | "register" | "ready",
  url: string,
  init: RequestInit,
): Promise<Response> {
  return requestEditorActivation({
    phase,
    url,
    init,
    signal: input.signal,
    expiresAtMs: Date.parse(pending.descriptorExpiresAt),
    fetchWithTimeout: input.fetchWithTimeout,
  });
}

async function unlinkConsumedBootstrap(
  loaded: LoadedBootstrapDescriptor,
  allowDeveloperApiBase = false,
): Promise<boolean> {
  const quarantinePath = path.join(
    path.dirname(loaded.filePath),
    `.${path.basename(loaded.filePath)}.${randomUUID()}.retiring`,
  );
  try {
    await rename(loaded.filePath, quarantinePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const handle = await open(
    quarantinePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const current = await handle.stat();
    if (
      !current.isFile() ||
      current.uid !== process.getuid?.() ||
      current.nlink !== 1 ||
      (current.mode & 0o077) !== 0 ||
      current.size < 1 ||
      current.size > 16 * 1024
    ) {
      throw new Error("bootstrap descriptor replacement is unsafe");
    }
    const raw = await handle.readFile({ encoding: "utf8" });
    const mismatch =
      current.dev !== loaded.device ||
      current.ino !== loaded.inode ||
      createHash("sha256").update(raw).digest("hex") !== loaded.digest;
    if (mismatch) {
      const replacement = parseEditorBootstrapDescriptor(
        JSON.parse(raw),
        loaded.descriptor.installTarget,
        0,
        allowDeveloperApiBase,
      );
      if (!replacement)
        throw new Error("bootstrap descriptor replacement is invalid");
      const preservedPath = path.join(
        path.dirname(loaded.filePath),
        descriptorFilename(replacement),
      );
      try {
        await link(quarantinePath, preservedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await open(
          preservedPath,
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
        );
        try {
          const existingRaw = await existing.readFile({ encoding: "utf8" });
          if (existingRaw !== raw) {
            throw new Error(
              "bootstrap descriptor replacement could not be preserved",
            );
          }
        } finally {
          await existing.close();
        }
      }
      await unlink(quarantinePath);
      return false;
    }
    await unlink(quarantinePath);
    return true;
  } finally {
    await handle.close();
  }
}

export async function retireManagedEditorBootstrapDescriptors(input: {
  stateRoot: string;
  installTarget: EditorInstallTarget;
  allowDeveloperApiBase?: boolean;
  expected?: Pick<
    EditorBootstrapDescriptor,
    "installId" | "generation" | "token"
  >;
}): Promise<number> {
  const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
  if (input.expected) {
    const loaded = await loadEditorBootstrapDescriptor(
      input.stateRoot,
      input.installTarget,
      input.expected,
      true,
      allowDeveloperApiBase,
    );
    return loaded &&
      (await unlinkConsumedBootstrap(loaded, allowDeveloperApiBase))
      ? 1
      : 0;
  }
  const loaded = await loadEditorBootstrapDescriptors(
    input.stateRoot,
    input.installTarget,
    false,
    allowDeveloperApiBase,
  );
  let retired = 0;
  for (const descriptor of loaded) {
    if (await unlinkConsumedBootstrap(descriptor, allowDeveloperApiBase))
      retired += 1;
  }
  return retired;
}

async function registerPublisher(
  input: ManagedActivationInput,
  pending: PendingCredentialEnvelope,
): Promise<void> {
  await requestManagedActivation(
    input,
    pending,
    "register",
    `${pending.apiBase}/v1/publishers/register`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pending.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        install_id: pending.installId,
        target: VSCODE_PUBLISHER_TARGET,
      }),
    },
  );
}

async function confirmPublisherReady(
  input: ManagedActivationInput,
  pending: PendingCredentialEnvelope,
): Promise<void> {
  await requestManagedActivation(
    input,
    pending,
    "ready",
    `${pending.apiBase}/v1/publisher-installations/${encodeURIComponent(pending.installId)}/ready`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${pending.apiKey}` },
    },
  );
}

async function redeemPending(
  input: ManagedActivationInput,
  pending: PendingCredentialEnvelope,
): Promise<void> {
  const descriptor: EditorBootstrapDescriptor = {
    token: pending.bootstrapToken,
    installId: pending.installId,
    installTarget: pending.installTarget,
    publisherTarget: pending.publisherTarget,
    generation: pending.generation,
    expiresAt: pending.descriptorExpiresAt,
    apiBase: pending.apiBase,
  };
  const response = await requestManagedActivation(
    input,
    pending,
    "redeem",
    `${pending.apiBase}/v1/publisher-installations/bootstrap/redeem`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redeem_protocol: 2,
        token: pending.bootstrapToken,
        api_key: pending.apiKey,
        install_id: pending.installId,
        install_target: pending.installTarget,
      }),
    },
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new EditorActivationFailure(
      "redeem",
      "validation",
      "bootstrap credential response was not valid JSON",
      { expiresAtMs: Date.parse(pending.descriptorExpiresAt), cause: error },
    );
  }
  const credential = parseRedeemedPublisherCredential(
    payload,
    descriptor,
    pending.apiKey,
  );
  if (!credential) {
    const record =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : undefined;
    const bindingMismatch =
      record !== undefined &&
      (record.install_id !== descriptor.installId ||
        record.install_target !== descriptor.installTarget ||
        record.publisher_target !== descriptor.publisherTarget ||
        record.generation !== descriptor.generation);
    throw new EditorActivationFailure(
      "redeem",
      bindingMismatch ? "binding" : "validation",
      bindingMismatch
        ? "bootstrap credential response did not match this editor install"
        : "bootstrap credential response failed validation",
      { expiresAtMs: Date.parse(pending.descriptorExpiresAt) },
    );
  }
}

async function advancePending(
  input: ManagedActivationInput,
  initialPending: PendingCredentialEnvelope,
): Promise<PendingCredentialEnvelope> {
  let pending = initialPending;
  if (pending.protocolState === "stored") {
    await redeemPending(input, pending);
    assertEditorActivationCurrent(input.signal, "redeem");
    pending = await updatePendingProtocolState(
      input.secrets,
      pending,
      "redeemed",
    );
  }
  if (pending.protocolState === "redeemed") {
    await registerPublisher(input, pending);
    assertEditorActivationCurrent(input.signal, "register");
    pending = await updatePendingProtocolState(
      input.secrets,
      pending,
      "registered",
    );
  }
  if (pending.protocolState === "registered") {
    await confirmPublisherReady(input, pending);
    assertEditorActivationCurrent(input.signal, "ready");
    pending = await updatePendingProtocolState(input.secrets, pending, "ready");
  }
  return pending;
}

async function completeManualActivation(
  input: ManagedActivationInput,
  pending: ManualPendingCredentialEnvelope,
): Promise<{ active: ActiveCredentialEnvelope; walletReadable: boolean }> {
  const assertCurrent = () =>
    assertEditorActivationCurrent(input.signal, "promotion");
  if (
    normalizeTrustedApiBase(
      pending.apiBase,
      input.allowDeveloperApiBase === true,
    ) !== pending.apiBase
  ) {
    throw new Error("manual credential API base is no longer trusted");
  }
  const walletReadable = await validateManualWallet(input, pending);
  assertCurrent();
  await registerManualPublisher(input, pending);
  assertCurrent();
  const active = await promoteManualCredential(input.secrets, pending, {
    assertCurrent,
    retireManagedDescriptor: async (managedPending) => {
      assertCurrent();
      if (managedPending) {
        await retireManagedEditorBootstrapDescriptors({
          stateRoot: input.stateRoot,
          installTarget: input.installTarget,
          allowDeveloperApiBase: input.allowDeveloperApiBase,
          expected: {
            installId: managedPending.installId,
            generation: managedPending.generation,
            token: managedPending.bootstrapToken,
          },
        });
        assertCurrent();
      }
      await retireManagedEditorBootstrapDescriptors({
        stateRoot: input.stateRoot,
        installTarget: input.installTarget,
        allowDeveloperApiBase: input.allowDeveloperApiBase,
      });
      assertCurrent();
    },
    clearLegacyGeneration: async () => {
      assertCurrent();
      await input.globalState.update(
        BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY,
        undefined,
      );
      assertCurrent();
    },
    updateProjections: async (identity) => {
      assertCurrent();
      await input.updateProjections(identity);
      assertCurrent();
    },
    writeReceipt: async (identity) => {
      assertCurrent();
      await input.writeReceipt(identity);
      assertCurrent();
    },
  });
  assertCurrent();
  return { active, walletReadable };
}

async function selectPending(
  input: ManagedActivationInput,
): Promise<PendingCredentialEnvelope | undefined> {
  const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
  let pending = await readPendingCredential(input.secrets);
  const renewed = pending
    ? await loadEditorBootstrapDescriptor(
        input.stateRoot,
        input.installTarget,
        { installId: pending.installId, generation: pending.generation },
        true,
        allowDeveloperApiBase,
      )
    : undefined;
  let newest: LoadedBootstrapDescriptor | undefined;
  try {
    newest = await loadEditorBootstrapDescriptor(
      input.stateRoot,
      input.installTarget,
      undefined,
      false,
      allowDeveloperApiBase,
    );
  } catch (error) {
    if (
      !pending ||
      !renewed ||
      !(error instanceof EditorActivationFailure) ||
      error.phase !== "descriptor" ||
      error.reason !== "credential-expired"
    ) {
      throw error;
    }
  }
  if (!pending && newest) {
    return createOrReusePendingCredential(input.secrets, newest.descriptor);
  }
  if (pending && newest && newest.descriptor.generation > pending.generation) {
    pending = await createOrReusePendingCredential(
      input.secrets,
      newest.descriptor,
    );
  }
  if (pending && renewed) {
    pending = await reconcileStoredPendingDescriptor(
      input.secrets,
      pending,
      renewed.descriptor,
    );
  }
  return pending;
}

export async function runManagedEditorActivation(
  input: ManagedActivationInput,
): Promise<ActiveCredentialEnvelope | undefined> {
  const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
  const assertCurrent = () =>
    assertEditorActivationCurrent(input.signal, "promotion");
  const lock = await acquireEditorActivationLock(
    input.stateRoot,
    input.installTarget,
  );
  try {
    assertCurrent();
    const manualPending = await readManualPendingCredential(input.secrets);
    assertCurrent();
    if (manualPending) {
      return (await completeManualActivation(input, manualPending)).active;
    }
    const currentActive = await readActiveCredential(input.secrets);
    assertCurrent();
    if (
      currentActive?.managedActivationSuppressed &&
      !input.allowManagedOverride
    ) {
      assertCurrent();
      await input.updateProjections(currentActive);
      assertCurrent();
      return undefined;
    }
    let selected: PendingCredentialEnvelope | undefined;
    try {
      selected = await selectPending(input);
    } catch (error) {
      if (
        !currentActive ||
        !(error instanceof EditorActivationFailure) ||
        error.phase !== "descriptor" ||
        error.reason !== "credential-expired"
      ) {
        throw error;
      }
      assertCurrent();
      await input.updateProjections(currentActive);
      assertCurrent();
      return undefined;
    }
    assertCurrent();
    if (!selected) {
      if (currentActive) {
        assertCurrent();
        await input.updateProjections(currentActive);
        assertCurrent();
        return undefined;
      }
      throw new EditorActivationFailure(
        "descriptor",
        "descriptor-absent",
        "No WaitSpin bootstrap descriptor is available yet",
      );
    }
    if (
      normalizeTrustedApiBase(selected.apiBase, allowDeveloperApiBase) !==
      selected.apiBase
    ) {
      throw new EditorActivationFailure(
        "descriptor",
        "descriptor-unsafe",
        "managed credential API base is no longer trusted",
      );
    }
    const pending = await advancePending(input, selected);
    const loaded = await loadEditorBootstrapDescriptor(
      input.stateRoot,
      input.installTarget,
      {
        installId: pending.installId,
        generation: pending.generation,
        token: pending.bootstrapToken,
      },
      true,
      allowDeveloperApiBase,
    );
    assertCurrent();
    const active = await promotePendingCredential(input.secrets, pending, {
      assertCurrent,
      updateProjections: async (identity) => {
        assertCurrent();
        await input.updateProjections(identity);
        assertCurrent();
      },
      writeReceipt: async (identity) => {
        assertCurrent();
        await input.writeReceipt(identity);
        assertCurrent();
      },
      unlinkDescriptor: async () => {
        assertCurrent();
        if (loaded)
          await unlinkConsumedBootstrap(loaded, allowDeveloperApiBase);
        assertCurrent();
      },
    });
    assertCurrent();
    await input.globalState.update(
      BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY,
      undefined,
    );
    assertCurrent();
    return active;
  } finally {
    await lock.release();
  }
}

export async function runManualEditorActivation(
  input: ManualActivationInput,
): Promise<{ active: ActiveCredentialEnvelope; walletReadable: boolean }> {
  const lock = await acquireEditorActivationLock(
    input.stateRoot,
    input.installTarget,
  );
  try {
    const pending = await stageManualCredential(input.secrets, input.candidate);
    return await completeManualActivation(input, pending);
  } finally {
    await lock.release();
  }
}

export async function migrateLegacyManagedActivation(
  input: Pick<
    ManagedActivationInput,
    | "stateRoot"
    | "installTarget"
    | "secrets"
    | "globalState"
    | "allowDeveloperApiBase"
  >,
): Promise<void> {
  const allowDeveloperApiBase = input.allowDeveloperApiBase === true;
  const generation = input.globalState.get<number>(
    BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY,
  );
  if (!Number.isSafeInteger(generation) || Number(generation) <= 0) return;
  const active = await readActiveCredential(input.secrets);
  if (!active) return;
  const loaded = await loadEditorBootstrapDescriptor(
    input.stateRoot,
    input.installTarget,
    { installId: active.installId, generation: Number(generation) },
    true,
    allowDeveloperApiBase,
  );
  if (!loaded) return;
  await translateLegacyPendingCredential(
    input.secrets,
    active,
    loaded.descriptor,
  );
  await input.globalState.update(
    BOOTSTRAP_GENERATION_GLOBAL_STATE_KEY,
    undefined,
  );
}
