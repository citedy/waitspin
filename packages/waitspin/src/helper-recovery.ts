import { isEditorTarget } from "./managed-install-orchestration.js";
import {
  PUBLISHER_INSTALL_ID_PATTERN,
  type HelperJournalTarget,
} from "./helper-state.js";

const PENDING_ACTIVATION = "installed_credential_pending_activation";

export type TargetPlan =
  | {
      action: "reuse";
      installId: string;
      generation: number;
      state: string;
    }
  | {
      action: "preserve";
      installId: string;
      generation: number;
      state: "conflict" | "failed_rollback";
    }
  | { action: "adopt_ready"; installId: string; generation: number }
  | { action: "bootstrap"; installId: string; generation: number };

export function resolveInstallJournalPhase(input: {
  aggregateOk: boolean;
  skippedConflictCount: number;
  skippedManagedTargetCount: number;
  requestedTargetStates: readonly (string | undefined)[];
}): "complete" | "partial" {
  const hasUnresolvedFailure = input.requestedTargetStates.some(
    (state) => state === "conflict" || state === "failed_rollback",
  );
  return input.aggregateOk &&
    input.skippedConflictCount === 0 &&
    input.skippedManagedTargetCount === 0 &&
    !hasUnresolvedFailure
    ? "complete"
    : "partial";
}

export function shouldUseRecoveryPlan(input: {
  operation: string;
  replayingInstallOperation: boolean;
  target: string;
  previousState?: string;
}): boolean {
  return (
    input.operation === "repair_target" ||
    input.operation === "repair_all" ||
    (input.operation === "install_all" &&
      input.replayingInstallOperation &&
      isEditorTarget(input.target) &&
      (input.previousState === PENDING_ACTIVATION ||
        input.previousState === "bootstrap_issued" ||
        input.previousState === "conflict" ||
        input.previousState === "failed_rollback"))
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validatedInstallId(value: unknown, source: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !PUBLISHER_INSTALL_ID_PATTERN.test(value)
  ) {
    throw new Error(`Invalid ${source} install ID`);
  }
  return value;
}

function validatedGeneration(value: unknown, source: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`Invalid ${source} generation`);
  }
  return value as number;
}

export function resolveBootstrapBinding(input: {
  target: string;
  publisherTarget: string;
  installId: string;
  requestedGeneration: number;
  response: unknown;
}): { installId: string; generation: number } {
  const response = record(input.response);
  if (
    response.install_id !== input.installId ||
    response.install_target !== input.target ||
    response.publisher_target !== input.publisherTarget
  ) {
    throw new Error("Publisher bootstrap binding mismatch");
  }
  const generation = validatedGeneration(
    response.generation,
    "publisher bootstrap",
  );
  if (generation < validatedGeneration(input.requestedGeneration, "requested")) {
    throw new Error("Publisher bootstrap generation is stale");
  }
  return { installId: input.installId, generation };
}

export function resolveRecoveryInstallId(input: {
  fallbackInstallId: string;
  previous?: HelperJournalTarget;
  localStatus: unknown;
}): string {
  const fallbackInstallId = validatedInstallId(
    input.fallbackInstallId,
    "fallback",
  );
  if (!fallbackInstallId) throw new Error("Missing fallback install ID");
  return (
    validatedInstallId(record(input.localStatus).install_id, "local") ??
    validatedInstallId(input.previous?.install_id, "journal") ??
    fallbackInstallId
  );
}

export function resolveInstallTargetPlan(input: {
  fallbackInstallId: string;
  previous?: HelperJournalTarget;
  replayingOperation: boolean;
}): TargetPlan {
  const fallbackInstallId = validatedInstallId(
    input.fallbackInstallId,
    "fallback",
  );
  if (!fallbackInstallId) throw new Error("Missing fallback install ID");
  if (!input.previous) {
    return { action: "bootstrap", installId: fallbackInstallId, generation: 1 };
  }
  const installId = validatedInstallId(input.previous.install_id, "journal");
  if (!installId) throw new Error("Missing journal install ID");
  const generation = validatedGeneration(input.previous.generation, "journal");
  if (input.replayingOperation) {
    if (
      input.previous.state === "conflict" ||
      input.previous.state === "failed_rollback"
    ) {
      return { action: "preserve", installId, generation, state: input.previous.state };
    }
    if (
      input.previous.state === "ready" ||
      input.previous.state === PENDING_ACTIVATION
    ) {
      return { action: "reuse", installId, generation, state: input.previous.state };
    }
    return { action: "bootstrap", installId, generation };
  }
  if (generation === Number.MAX_SAFE_INTEGER) {
    throw new Error("Publisher installation generation is exhausted");
  }
  return { action: "bootstrap", installId, generation: generation + 1 };
}

export function resolveRepairTargetPlan(input: {
  target: string;
  fallbackInstallId: string;
  previous?: HelperJournalTarget;
  localStatus: unknown;
  inventory: unknown;
  editorBootstrapGeneration?: number;
  now?: number;
}): TargetPlan {
  if (
    input.editorBootstrapGeneration !== undefined &&
    (!Number.isSafeInteger(input.editorBootstrapGeneration) ||
      input.editorBootstrapGeneration < 1)
  ) {
    throw new Error("Invalid editor bootstrap generation");
  }
  const local = record(input.localStatus);
  const localInstallId = validatedInstallId(local.install_id, "local");
  const previousInstallId = validatedInstallId(
    input.previous?.install_id,
    "journal",
  );
  const installations = record(input.inventory).installations;
  if (!Array.isArray(installations)) {
    throw new Error("Invalid publisher installation inventory");
  }
  const validatedInstallations: Record<string, unknown>[] = [];
  const inventoryInstallIds = new Set<string>();
  for (const value of installations) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid publisher installation inventory");
    }
    const installation = value as Record<string, unknown>;
    let inventoryInstallId: string | undefined;
    try {
      inventoryInstallId = validatedInstallId(
        installation.install_id,
        "server",
      );
      validatedGeneration(installation.generation, "server");
    } catch {
      throw new Error("Invalid publisher installation inventory");
    }
    if (
      !inventoryInstallId ||
      typeof installation.install_target !== "string" ||
      !installation.install_target ||
      typeof installation.status !== "string" ||
      !installation.status ||
      inventoryInstallIds.has(inventoryInstallId)
    ) {
      throw new Error("Invalid publisher installation inventory");
    }
    inventoryInstallIds.add(inventoryInstallId);
    validatedInstallations.push(installation);
  }
  let installId = resolveRecoveryInstallId(input);
  let exact = validatedInstallations.find(
    (installation) => installation.install_id === installId,
  );
  if (
    isEditorTarget(input.target) &&
    !exact &&
    local.installed === true &&
    input.fallbackInstallId !== installId
  ) {
    installId = validatedInstallId(input.fallbackInstallId, "fallback")!;
    exact = validatedInstallations.find(
      (installation) => installation.install_id === installId,
    );
  }
  if (
    isEditorTarget(input.target) &&
    !exact &&
    (input.previous?.state === "conflict" ||
      input.previous?.state === "failed_rollback") &&
    input.fallbackInstallId !== installId
  ) {
    installId = validatedInstallId(input.fallbackInstallId, "fallback")!;
    exact = validatedInstallations.find(
      (installation) => installation.install_id === installId,
    );
  }
  if (exact && exact.install_target !== input.target) {
    throw new Error("Publisher installation target binding mismatch");
  }
  const serverGeneration = exact
    ? validatedGeneration(exact.generation, "server")
    : 0;
  const journalGeneration =
    input.previous?.install_id === installId
      ? validatedGeneration(input.previous.generation, "journal")
      : 0;
  const editorManaged =
    local.publisher_registration_managed_by === "editor-extension";
  const editorActivationStillBootstrapping =
    isEditorTarget(input.target) &&
    input.editorBootstrapGeneration === journalGeneration &&
    input.previous?.install_id === installId &&
    (input.previous.state === PENDING_ACTIVATION ||
      input.previous.state === "bootstrap_issued");
  const editorNeedsFreshBootstrap =
    isEditorTarget(input.target) &&
    input.previous?.install_id === installId &&
    ((input.editorBootstrapGeneration !== undefined &&
      (input.previous?.state === PENDING_ACTIVATION ||
        input.previous?.state === "bootstrap_issued")) ||
      input.previous?.state === "conflict" ||
      input.previous?.state === "failed_rollback" ||
      (editorManaged && local.publisher_registered === true));
  if (
    local.installed === true &&
    local.publisher_registered === true &&
    !localInstallId &&
    !editorManaged
  ) {
    throw new Error("Local publisher installation identity is unavailable");
  }
  if (
    isEditorTarget(input.target) &&
    input.previous?.state === "failed_rollback" &&
    editorNeedsFreshBootstrap
  ) {
    const generation = Math.max(serverGeneration, journalGeneration) + 1;
    if (!Number.isSafeInteger(generation)) {
      throw new Error("Publisher installation generation is exhausted");
    }
    return { action: "bootstrap", installId, generation };
  }
  if (
    local.installed === true &&
    localInstallId !== undefined &&
    (local.publisher_registered === true ||
      (editorManaged && input.previous?.state === PENDING_ACTIVATION)) &&
    exact?.status === "ready" &&
    !editorActivationStillBootstrapping &&
    !editorNeedsFreshBootstrap
  ) {
    return { action: "adopt_ready", installId, generation: serverGeneration };
  }
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("Invalid recovery time");
  const confirmationExpiresAt = exact?.confirmation_expires_at;
  const confirmationExpiresAtMs =
    typeof confirmationExpiresAt === "string"
      ? Date.parse(confirmationExpiresAt)
      : Number.NaN;
  if (
    confirmationExpiresAt !== undefined &&
    confirmationExpiresAt !== null &&
    !Number.isFinite(confirmationExpiresAtMs)
  ) {
    throw new Error("Invalid publisher installation inventory");
  }
  if (
    isEditorTarget(input.target) &&
    local.installed === true &&
    exact?.status === PENDING_ACTIVATION &&
    input.editorBootstrapGeneration === serverGeneration &&
    confirmationExpiresAtMs > now &&
    journalGeneration === serverGeneration &&
    (input.previous?.state === PENDING_ACTIVATION ||
      input.previous?.state === "bootstrap_issued")
  ) {
    return {
      action: "reuse",
      installId,
      generation: serverGeneration,
      state: PENDING_ACTIVATION,
    };
  }

  const generation = Math.max(serverGeneration, journalGeneration) + 1;
  if (!Number.isSafeInteger(generation)) {
    throw new Error("Publisher installation generation is exhausted");
  }
  return { action: "bootstrap", installId, generation };
}
