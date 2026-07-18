#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCanonicalInstallTargets,
  generateInstallId,
  PRODUCTION_API_ORIGIN,
} from "./cli.js";
import { isEditorTarget } from "./managed-install-orchestration.js";
import {
  runInstallTargets,
  runStatusTargets,
  runUninstallTargets,
  type InstallTarget,
  type TargetSummary,
  type UninstallAggregate,
} from "./install-core.js";
import {
  emitHelperEvent,
  HELPER_PROTOCOL_VERSION,
  readHelperRequest,
  redactHelperText,
  resetHelperOutputBudget,
  type HelperRequest,
} from "./helper-protocol.js";
import {
  acquireHelperLock,
  editorBootstrapDescriptorGeneration,
  loadHelperJournal,
  markBootstrapIssued,
  PUBLISHER_INSTALL_ID_PATTERN,
  saveHelperJournal,
  waitspinRoot,
  writeEditorBootstrapDescriptor,
  type HelperJournalTarget,
} from "./helper-state.js";
import {
  resolveInstallJournalPhase,
  resolveBootstrapBinding,
  resolveInstallTargetPlan,
  resolveRecoveryInstallId,
  resolveRepairTargetPlan,
  shouldUseRecoveryPlan,
  type TargetPlan,
} from "./helper-recovery.js";

export { parseHelperRequestText, redactHelperText } from "./helper-protocol.js";
export {
  resolveInstallJournalPhase,
  resolveInstallTargetPlan,
  resolveRepairTargetPlan,
  shouldUseRecoveryPlan,
} from "./helper-recovery.js";

const API_TIMEOUT_MS = 30_000;

const home = os.homedir();
let cancelRequested = false;

function assertCanonicalRuntime(request: HelperRequest): void {
  if (process.env.WAITSPIN_HELPER_ALLOW_DEV_RUNTIME === "1") return;
  const canonicalRoot = "/Applications/WaitSpin.app/Contents/Resources";
  const node = realpathSync(process.execPath);
  const helper = realpathSync(process.argv[1] || "");
  if (
    !node.startsWith(`${canonicalRoot}/runtime/`) ||
    !helper.startsWith(`${canonicalRoot}/waitspin/`) ||
    (request.app_runtime_root && realpathSync(request.app_runtime_root) !== canonicalRoot)
  ) {
    throw new Error(
      "WaitSpin helper requires the verified /Applications/WaitSpin.app runtime",
    );
  }
}

function deterministicFinderPath(): string {
  const entries = new Set<string>([
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    path.join(home, ".local", "bin"),
  ]);
  try {
    for (const line of readFileSync("/etc/paths", "utf8").split(/\r?\n/)) {
      if (line.trim()) entries.add(line.trim());
    }
  } catch {}
  try {
    for (const name of readdirSync("/etc/paths.d").sort((a, b) => a.localeCompare(b))) {
      for (const line of readFileSync(path.join("/etc/paths.d", name), "utf8").split(/\r?\n/)) {
        if (line.trim()) entries.add(line.trim());
      }
    }
  } catch {}
  return [...entries].filter((entry) => path.isAbsolute(entry)).join(":");
}

function trustedApiBase(value: string): string {
  const base = new URL(value);
  if (base.origin !== "https://api.waitspin.com") {
    if (
      process.env.WAITSPIN_HELPER_ALLOW_DEV_RUNTIME !== "1" ||
      base.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(base.hostname)
    ) {
      throw new Error("Untrusted WaitSpin API base");
    }
  }
  return base.origin;
}

async function apiJson<T>(
  apiBase: string,
  pathname: string,
  init: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase}${pathname}`, {
      ...init,
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        typeof body.error === "string" ? body.error : `WaitSpin API HTTP ${response.status}`,
      );
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function createTargetEvent(
  request: Pick<HelperRequest, "request_id">,
  summary: TargetSummary,
  state: string,
) {
  return {
    protocol_version: HELPER_PROTOCOL_VERSION,
    request_id: request.request_id,
    event: "target_result",
    install_target: summary.target,
    publisher_target: summary.publisher_target,
    display_name: summary.display_name,
    state,
    ...(summary.install_id ? { install_id: summary.install_id } : {}),
    ...(summary.credential_id ? { credential_id: summary.credential_id } : {}),
    ...(summary.generation ? { generation: summary.generation } : {}),
    ...(summary.reason ? { reason: summary.reason } : {}),
  };
}

export function createTargetStartedEvent(
  request: Pick<HelperRequest, "request_id">,
  summary: TargetSummary,
  index: number,
  total: number,
) {
  return {
    protocol_version: HELPER_PROTOCOL_VERSION,
    request_id: request.request_id,
    event: "target_started",
    install_target: summary.target,
    publisher_target: summary.publisher_target,
    display_name: summary.display_name,
    index,
    total,
  };
}

function targetEvent(request: HelperRequest, summary: TargetSummary, state: string) {
  emitHelperEvent(createTargetEvent(request, summary, state));
}

export function createStatusTargetEvent(
  request: Pick<HelperRequest, "request_id">,
  summary: TargetSummary,
  detectedState: string,
  journalTarget?: HelperJournalTarget,
) {
  if (detectedState !== "ready") {
    return createTargetEvent(request, summary, detectedState);
  }
  if (!journalTarget || journalTarget.state === "removed") {
    return createTargetEvent(request, summary, "repair_required");
  }
  const statusResult =
    summary.result && typeof summary.result === "object" && !Array.isArray(summary.result)
      ? (summary.result as Record<string, unknown>)
      : {};
  if (
    journalTarget.state === "conflict" ||
    journalTarget.state === "failed_rollback"
  ) {
    return createTargetEvent(
      request,
      {
        ...summary,
        install_id: journalTarget.install_id,
        generation: journalTarget.generation,
      },
      journalTarget.state,
    );
  }
  if (
    typeof statusResult.install_id === "string" &&
    statusResult.install_id !== journalTarget.install_id
  ) {
    return createTargetEvent(request, summary, "repair_required");
  }
  const editorTarget = isEditorTarget(summary.target);
  const activationPending =
    editorTarget &&
    journalTarget.state === "installed_credential_pending_activation";
  const missingEditorReceiptDuringUpdate =
    editorTarget &&
    journalTarget.state === "ready" &&
    statusResult.installed === true &&
    statusResult.install_id == null &&
    statusResult.publisher_registration_managed_by === "editor-extension";
  if (
    statusResult.publisher_registered === false &&
    !activationPending &&
    !missingEditorReceiptDuringUpdate
  ) {
    return createTargetEvent(request, summary, "repair_required");
  }
  if (
    editorTarget &&
    statusResult.publisher_registered === true &&
    !activationPending
  ) {
    return createTargetEvent(
      request,
      {
        ...summary,
        install_id: journalTarget.install_id,
        generation: journalTarget.generation,
      },
      "ready",
    );
  }
  const reconciledState =
    journalTarget.state === "ready"
      ? "ready"
      : "installed_credential_pending_activation";
  return createTargetEvent(
    request,
    {
      ...summary,
      install_id: journalTarget.install_id,
      generation: journalTarget.generation,
    },
    reconciledState,
  );
}

export function selectHelperTargets<T extends { target: string }>(
  request: Pick<HelperRequest, "operation" | "install_target">,
  targets: readonly T[],
): T[] {
  return request.operation === "repair_target"
    ? targets.filter((target) => target.target === request.install_target)
    : [...targets];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function deactivateJournalInstallations(
  request: HelperRequest,
  apiBase: string,
  journal: Awaited<ReturnType<typeof loadHelperJournal>>,
  targets: readonly InstallTarget[],
  onTargetResult: (summary: TargetSummary, state: string) => void,
): Promise<UninstallAggregate> {
  const aggregate: UninstallAggregate = {
    ok: true,
    cancelled: false,
    removed: [],
    skipped_not_installed: [],
    failed_rollback: [],
  };
  for (const [target, targetState] of Object.entries(journal.targets)) {
    if (cancelRequested) break;
    const definition = targets.find((candidate) => candidate.target === target);
    const summary: TargetSummary = {
      target,
      publisher_target: definition?.publisherTarget ?? target,
      display_name: definition?.displayName ?? target,
      command: "server deactivate",
      install_id: targetState.install_id,
      generation: targetState.generation,
    };
    if (targetState.state === "removed") {
      aggregate.skipped_not_installed.push(summary);
      onTargetResult(summary, "removed");
      continue;
    }
    try {
      await apiJson(
        apiBase,
        `/v1/publisher-installations/${encodeURIComponent(targetState.install_id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${request.parent_credential}` },
        },
      );
      targetState.state = "removed";
      targetState.updated_at = new Date().toISOString();
      await saveHelperJournal(journal);
      aggregate.removed.push(summary);
      onTargetResult(summary, "removed");
    } catch (error) {
      const failed = { ...summary, reason: redactHelperText(error) };
      aggregate.failed_rollback.push(failed);
      onTargetResult(failed, "failed_rollback");
    }
  }
  aggregate.cancelled = cancelRequested;
  aggregate.ok = !aggregate.cancelled && aggregate.failed_rollback.length === 0;
  journal.phase = aggregate.ok ? "removed" : "cleanup_required";
  await saveHelperJournal(journal);
  return aggregate;
}

async function execute(request: HelperRequest): Promise<Record<string, unknown>> {
  assertCanonicalRuntime(request);
  process.env.PATH = deterministicFinderPath();
  const stateRoot = request.state_root ?? waitspinRoot;
  if (stateRoot !== waitspinRoot) {
    throw new Error("Helper state root does not match the verified runtime environment");
  }
  const flags = new Map<string, string[]>();
  flags.set("json", ["true"]);
  flags.set("compose-existing", [request.compose_existing === false ? "false" : "true"]);
  if (request.operation === "preview_install_all") {
    flags.set("dry-run", ["true"]);
  }
  const apiBase = trustedApiBase(request.api_base ?? PRODUCTION_API_ORIGIN);
  flags.set("base-url", [apiBase]);
  if (process.env.WAITSPIN_HELPER_ALLOW_DEV_RUNTIME === "1") {
    flags.set("allow-dev-api-base", ["true"]);
    flags.set("allow-dev-extension-assets", ["true"]);
  }
  const targets = createCanonicalInstallTargets(flags);
  const requestedTargets = selectHelperTargets(request, targets);
  if (requestedTargets.length === 0) {
    throw new Error("Canonical repair target disappeared");
  }
  const callback = (summary: TargetSummary, state: string) =>
    targetEvent(request, summary, state);
  const startedCallback = (
    summary: TargetSummary,
    index: number,
    total: number,
  ) => emitHelperEvent(createTargetStartedEvent(request, summary, index, total));

  if (request.operation === "preview_install_all") {
    return runInstallTargets(targets, {
      dryRun: true,
      redactError: redactHelperText,
      onTargetResult: callback,
      cancelled: () => cancelRequested,
    });
  }
  if (request.operation === "status_all") {
    const journal = await loadHelperJournal();
    return runStatusTargets(targets, {
      redactError: redactHelperText,
      onTargetResult: (summary, state) =>
        emitHelperEvent(
          createStatusTargetEvent(
            request,
            summary,
            state,
            journal.targets[summary.target],
          ),
        ),
      cancelled: () => cancelRequested,
    });
  }

  const releaseLock = await acquireHelperLock();
  try {
    const journal = await loadHelperJournal();
    const replayingInstallOperation =
      request.operation === "install_all" &&
      request.operation_id !== undefined &&
      request.operation_id === journal.operation_id;
    journal.operation_id = request.operation_id ?? randomUUID();
    journal.phase = request.operation;
    await saveHelperJournal(journal);

    if (
      request.operation === "uninstall_all" ||
      request.operation === "uninstall_local_all"
    ) {
      const aggregate = await runUninstallTargets(targets, {
        redactError: redactHelperText,
        onTargetResult: callback,
        cancelled: () => cancelRequested,
      });
      journal.phase = aggregate.ok ? "local_removed" : "cleanup_required";
      await saveHelperJournal(journal);
      if (request.operation === "uninstall_local_all" || !aggregate.ok) {
        return aggregate;
      }
      const deactivation = await deactivateJournalInstallations(
        request,
        apiBase,
        journal,
        targets,
        callback,
      );
      deactivation.removed.unshift(...aggregate.removed);
      deactivation.skipped_not_installed.unshift(
        ...aggregate.skipped_not_installed,
      );
      deactivation.failed_rollback.unshift(...aggregate.failed_rollback);
      deactivation.ok = deactivation.failed_rollback.length === 0;
      return deactivation;
    }
    if (request.operation === "deactivate_all") {
      return deactivateJournalInstallations(
        request,
        apiBase,
        journal,
        targets,
        callback,
      );
    }

    let repairInventoryPromise: Promise<Record<string, unknown>> | undefined;
    const repairInventory = () =>
      (repairInventoryPromise ??= apiJson<Record<string, unknown>>(
        apiBase,
        "/v1/publisher-installations",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${request.parent_credential}`,
          },
        },
      ));

    const wrappedTargets: InstallTarget[] = requestedTargets.map((target) => ({
      ...target,
      install: async () => {
        const previous = journal.targets[target.target];
        let repairLocalStatus: unknown;
        let repairPlan: TargetPlan;
        const recoveryRequired = shouldUseRecoveryPlan({
          operation: request.operation,
          replayingInstallOperation,
          target: target.target,
          previousState: previous?.state,
        });
        const fallbackInstallId =
          recoveryRequired && isEditorTarget(target.target)
            ? generateInstallId()
            : previous?.install_id || generateInstallId();
        if (recoveryRequired) {
          repairLocalStatus = await target.status();
          const inventory = await repairInventory();
          const recoveryInstallId = resolveRecoveryInstallId({
            fallbackInstallId,
            previous,
            localStatus: repairLocalStatus,
          });
          repairPlan = resolveRepairTargetPlan({
            target: target.target,
            fallbackInstallId,
            previous,
            localStatus: repairLocalStatus,
            inventory,
            editorBootstrapGeneration: isEditorTarget(target.target)
              ? await editorBootstrapDescriptorGeneration(
                  target.target,
                  recoveryInstallId,
                  {
                    publisherTarget: target.publisherTarget,
                    apiBase,
                  },
                )
              : undefined,
          });
        } else {
          repairPlan = resolveInstallTargetPlan({
            fallbackInstallId,
            previous,
            replayingOperation: replayingInstallOperation,
          });
        }
        const { installId, generation } = repairPlan;
        if (repairPlan.action === "preserve") {
          return {
            install_id: installId,
            generation,
            state: repairPlan.state,
            would_fail: true,
            failure_kind: repairPlan.state,
            human_message:
              repairPlan.state === "conflict"
                ? "Previous target conflict requires explicit repair."
                : "Previous target rollback failure requires explicit repair.",
          };
        }
        if (repairPlan.action === "reuse") {
          journal.targets[target.target] = {
            install_id: installId,
            generation,
            state: repairPlan.state,
            updated_at: new Date().toISOString(),
          };
          await saveHelperJournal(journal);
          return {
            install_id: installId,
            generation,
            state: repairPlan.state,
          };
        }
        if (repairPlan.action === "adopt_ready") {
          journal.targets[target.target] = {
            install_id: installId,
            generation,
            state: "ready",
            updated_at: new Date().toISOString(),
          };
          await saveHelperJournal(journal);
          return {
            ...(record(repairLocalStatus)),
            install_id: installId,
            generation,
            state: "ready",
          };
        }
        const bootstrap = await apiJson<Record<string, unknown>>(
          apiBase,
          "/v1/publisher-installations/bootstrap",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${request.parent_credential}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              operation_id: journal.operation_id,
              install_id: installId,
              install_target: target.target,
              generation,
            }),
          },
        );
        const binding = resolveBootstrapBinding({
          target: target.target,
          publisherTarget: target.publisherTarget,
          installId,
          requestedGeneration: generation,
          response: bootstrap,
        });
        const effectiveGeneration = binding.generation;
        markBootstrapIssued(journal, {
          target: target.target,
          installId,
          generation: effectiveGeneration,
        });
        // The durable journal write deliberately precedes every local mutation.
        // A retry/uninstall can therefore deactivate the issued child even if
        // the process crashes before the target installer starts.
        await saveHelperJournal(journal);
        const targetFlags = new Map(flags);
        targetFlags.set("install-id", [installId]);
        targetFlags.set("json", ["true"]);
        const editor = isEditorTarget(target.target);
        let childCredential: string | undefined;
        if (editor) {
          if (bootstrap.credential_mode !== "bootstrap" || typeof bootstrap.token !== "string") {
            throw new Error("Invalid editor bootstrap response");
          }
          await writeEditorBootstrapDescriptor(target.target, bootstrap, {
            publisherTarget: target.publisherTarget,
            apiBase,
          });
          targetFlags.set("publisher-bootstrap-only", ["true"]);
        } else {
          if (bootstrap.credential_mode !== "direct" || typeof bootstrap.api_key !== "string") {
            throw new Error("Invalid file-target bootstrap response");
          }
          childCredential = bootstrap.api_key;
          targetFlags.set("api-key", [childCredential]);
        }
        const runnable = createCanonicalInstallTargets(targetFlags).find(
          (candidate) => candidate.target === target.target,
        );
        if (!runnable) throw new Error("Canonical install target disappeared");
        const result = await runnable.install();
        const state = editor ? "installed_credential_pending_activation" : "ready";
        if (childCredential) {
          await apiJson(
            apiBase,
            `/v1/publisher-installations/${encodeURIComponent(installId)}/ready`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${childCredential}` },
            },
          );
        }
        journal.targets[target.target]!.state = state;
        journal.targets[target.target]!.updated_at = new Date().toISOString();
        await saveHelperJournal(journal);
        return {
          ...(result as Record<string, unknown>),
          install_id: installId,
          ...(typeof bootstrap.credential_id === "string"
            ? { credential_id: bootstrap.credential_id }
            : {}),
          generation: effectiveGeneration,
          state,
        };
      },
    }));
    const aggregate = await runInstallTargets(wrappedTargets, {
      dryRun: false,
      redactError: redactHelperText,
      onTargetResult: callback,
      onTargetStarted: startedCallback,
      cancelled: () => cancelRequested,
    });
    for (const summary of aggregate.skipped_conflict) {
      if (journal.targets[summary.target]) {
        journal.targets[summary.target]!.state = "conflict";
        journal.targets[summary.target]!.updated_at = new Date().toISOString();
      }
    }
    for (const summary of aggregate.failed_rollback) {
      if (journal.targets[summary.target]) {
        journal.targets[summary.target]!.state = "failed_rollback";
        journal.targets[summary.target]!.updated_at = new Date().toISOString();
      }
    }
    journal.phase = resolveInstallJournalPhase({
      aggregateOk: aggregate.ok,
      skippedConflictCount: aggregate.skipped_conflict.length,
      skippedManagedTargetCount: aggregate.skipped_not_detected.filter(
        (summary) => {
          const state = journal.targets[summary.target]?.state;
          return state !== undefined && state !== "removed";
        },
      ).length,
      requestedTargetStates: requestedTargets.map(
        (target) => journal.targets[target.target]?.state,
      ),
    });
    await saveHelperJournal(journal);
    return aggregate;
  } finally {
    await releaseLock();
  }
}

async function main(): Promise<void> {
  cancelRequested = false;
  resetHelperOutputBudget();
  const requestCancellation = () => {
    cancelRequested = true;
  };
  process.once("SIGINT", requestCancellation);
  process.once("SIGTERM", requestCancellation);
  let request: HelperRequest | undefined;
  try {
    request = await readHelperRequest();
    const result = await execute(request);
    emitHelperEvent({
      protocol_version: HELPER_PROTOCOL_VERSION,
      request_id: request.request_id,
      event: "result",
      cancelled: cancelRequested,
      ...result,
    });
    process.exitCode = result.ok === false ? 2 : 0;
  } catch (error) {
    emitHelperEvent({
      protocol_version: HELPER_PROTOCOL_VERSION,
      request_id: request?.request_id ?? null,
      event: "result",
      ok: false,
      error: redactHelperText(error),
      installed: [],
      would_install: [],
      skipped_not_detected: [],
      skipped_conflict: [],
      failed_rollback: [],
    });
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", requestCancellation);
    process.off("SIGTERM", requestCancellation);
  }
}

function isDirectEntrypoint(): boolean {
  const entrypoint = process.argv[1] ? path.basename(process.argv[1]) : "";
  return entrypoint === "waitspin-helper" || /^helper\.[cm]?[jt]s$/.test(entrypoint);
}

if (isDirectEntrypoint()) void main();
