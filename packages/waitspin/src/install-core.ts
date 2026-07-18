export type InstallTarget = {
  target: string;
  publisherTarget: string;
  displayName: string;
  command: string;
  statusCommand: string;
  uninstallCommand: string;
  preflight: () => Promise<string | null>;
  install: () => Promise<unknown>;
  status: () => Promise<unknown>;
  uninstall: () => Promise<unknown>;
};

export type TargetSummary = {
  target: string;
  publisher_target: string;
  display_name: string;
  command: string;
  reason?: string;
  detail?: string | null;
  result?: unknown;
  install_id?: string;
  credential_id?: string;
  generation?: number;
  state?: string;
};

export type InstallAggregate = {
  ok: boolean;
  cancelled: boolean;
  installed: TargetSummary[];
  would_install: TargetSummary[];
  skipped_not_detected: TargetSummary[];
  skipped_conflict: TargetSummary[];
  failed_rollback: TargetSummary[];
};

export type StatusAggregate = {
  ok: boolean;
  cancelled: boolean;
  installed: TargetSummary[];
  statuses: TargetSummary[];
  failed_status: TargetSummary[];
};

export type UninstallAggregate = {
  ok: boolean;
  cancelled: boolean;
  removed: TargetSummary[];
  skipped_not_installed: TargetSummary[];
  failed_rollback: TargetSummary[];
};

type InstallCoreOptions = {
  dryRun: boolean;
  redactError: (error: unknown) => string;
  onTargetResult?: (summary: TargetSummary, state: string) => void;
  onTargetStarted?: (
    summary: TargetSummary,
    index: number,
    total: number,
  ) => void;
  cancelled?: () => boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isNotDetected(message: string): boolean {
  if (/WaitSpin extension package not found|assets not found/i.test(message)) {
    return false;
  }
  return /not detected|Unable to run Claude Code|Unable to run GitHub Copilot CLI|Unable to run Antigravity CLI|Qoder CLI was not detected|Unsupported Claude Code version|ENOENT|spawn .*ENOENT|command not found|executable path/i.test(
    message,
  );
}

function isConflict(message: string): boolean {
  return /statusLine|status line|conflict|override|already has|blocked|unsupported_patch_layout|unsupported_native_cli/i.test(
    message,
  );
}

function failureReason(result: unknown): string | null {
  const value = record(result);
  if (!value.would_fail) return null;
  const reason =
    value.settings_blocked_reason ??
    value.rollback_reason ??
    value.human_message ??
    value.failure_kind ??
    "target dry-run reported failure";
  return typeof reason === "string" ? reason : "target dry-run reported failure";
}

function isConflictResult(result: unknown, reason: string): boolean {
  const kind = record(result).failure_kind;
  return (
    kind === "conflict" ||
    kind === "unsupported_patch_layout" ||
    kind === "unsupported_native_cli" ||
    isConflict(reason)
  );
}

function summaryFor(
  target: InstallTarget,
  command: string,
  extra: Partial<TargetSummary> = {},
): TargetSummary {
  return {
    target: target.target,
    publisher_target: target.publisherTarget,
    display_name: target.displayName,
    command,
    ...extra,
  };
}

export async function runInstallTargets(
  targets: readonly InstallTarget[],
  options: InstallCoreOptions,
): Promise<InstallAggregate> {
  const output: InstallAggregate = {
    ok: true,
    cancelled: false,
    installed: [],
    would_install: [],
    skipped_not_detected: [],
    skipped_conflict: [],
    failed_rollback: [],
  };

  for (const [targetIndex, target] of targets.entries()) {
    if (options.cancelled?.()) {
      output.cancelled = true;
      break;
    }
    options.onTargetStarted?.(
      summaryFor(target, target.command),
      targetIndex + 1,
      targets.length,
    );
    let detail: string | null = null;
    try {
      detail = await target.preflight();
    } catch (error) {
      const reason = options.redactError(error);
      const item = summaryFor(target, target.command, { reason });
      const state = isNotDetected(reason) ? "not_detected" : "failed_rollback";
      (state === "not_detected"
        ? output.skipped_not_detected
        : output.failed_rollback
      ).push(item);
      options.onTargetResult?.(item, state);
      continue;
    }

    try {
      const result = await target.install();
      const reason = failureReason(result);
      if (reason) {
        const item = summaryFor(target, target.command, {
          reason,
          detail,
          result,
        });
        const state = isConflictResult(result, reason)
          ? "conflict"
          : "failed_rollback";
        (state === "conflict"
          ? output.skipped_conflict
          : output.failed_rollback
        ).push(item);
        options.onTargetResult?.(item, state);
        continue;
      }
      const value = record(result);
      const item = summaryFor(target, target.command, {
        detail,
        result,
        ...(typeof value.install_id === "string"
          ? { install_id: value.install_id }
          : {}),
        ...(typeof value.credential_id === "string"
          ? { credential_id: value.credential_id }
          : {}),
        ...(Number.isSafeInteger(value.generation)
          ? { generation: value.generation as number }
          : {}),
        ...(typeof value.state === "string" ? { state: value.state } : {}),
      });
      (options.dryRun ? output.would_install : output.installed).push(item);
      const reportedState = value.state;
      options.onTargetResult?.(
        item,
        options.dryRun
          ? "preview_ready"
          : typeof reportedState === "string"
            ? reportedState
            : "ready",
      );
    } catch (error) {
      const reason = options.redactError(error);
      const item = summaryFor(target, target.command, { reason, detail });
      const state = isConflict(reason)
        ? "conflict"
        : isNotDetected(reason)
          ? "not_detected"
          : "failed_rollback";
      if (state === "conflict") output.skipped_conflict.push(item);
      else if (state === "not_detected") output.skipped_not_detected.push(item);
      else output.failed_rollback.push(item);
      options.onTargetResult?.(item, state);
    }
  }
  output.ok = !output.cancelled && output.failed_rollback.length === 0;
  return output;
}

export async function runStatusTargets(
  targets: readonly InstallTarget[],
  options: Pick<InstallCoreOptions, "redactError" | "onTargetResult" | "cancelled">,
): Promise<StatusAggregate> {
  const output: StatusAggregate = {
    ok: true,
    cancelled: false,
    installed: [],
    statuses: [],
    failed_status: [],
  };
  for (const target of targets) {
    if (options.cancelled?.()) {
      output.cancelled = true;
      break;
    }
    try {
      const result = await target.status();
      const item = summaryFor(target, target.statusCommand, { result });
      output.statuses.push(item);
      const installed = record(result).installed === true;
      if (installed) output.installed.push(item);
      options.onTargetResult?.(item, installed ? "ready" : "not_detected");
    } catch (error) {
      const item = summaryFor(target, target.statusCommand, {
        reason: options.redactError(error),
      });
      output.failed_status.push(item);
      options.onTargetResult?.(item, "failed_rollback");
    }
  }
  output.ok = !output.cancelled && output.failed_status.length === 0;
  return output;
}

export async function runUninstallTargets(
  targets: readonly InstallTarget[],
  options: Pick<InstallCoreOptions, "redactError" | "onTargetResult" | "cancelled">,
): Promise<UninstallAggregate> {
  const output: UninstallAggregate = {
    ok: true,
    cancelled: false,
    removed: [],
    skipped_not_installed: [],
    failed_rollback: [],
  };
  for (const target of targets) {
    if (options.cancelled?.()) {
      output.cancelled = true;
      break;
    }
    try {
      const result = await target.uninstall();
      const resultRecord = record(result);
      const structuredFailure =
        resultRecord.ok === false ||
        resultRecord.restore_refused === true ||
        resultRecord.manual_recovery_required === true;
      const reasonValue =
        resultRecord.human_message ??
        resultRecord.restore_refusal_reason ??
        resultRecord.rollback_reason;
      const reason =
        structuredFailure && typeof reasonValue === "string"
          ? reasonValue
          : structuredFailure
            ? "target uninstall reported failure"
            : undefined;
      const item = summaryFor(target, target.uninstallCommand, { result, reason });
      if (structuredFailure) {
        output.failed_rollback.push(item);
        options.onTargetResult?.(item, "failed_rollback");
        continue;
      }
      const removed = resultRecord.uninstalled === true;
      (removed ? output.removed : output.skipped_not_installed).push(item);
      options.onTargetResult?.(item, removed ? "removed" : "not_detected");
    } catch (error) {
      const item = summaryFor(target, target.uninstallCommand, {
        reason: options.redactError(error),
      });
      output.failed_rollback.push(item);
      options.onTargetResult?.(item, "failed_rollback");
    }
  }
  output.ok = !output.cancelled && output.failed_rollback.length === 0;
  return output;
}
