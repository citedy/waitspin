import {
  runInstallTargets,
  runStatusTargets,
  runUninstallTargets,
  type InstallTarget,
} from "./install-core.js";

export type ManagedAllInstallTarget = {
  target: string;
  command: string;
  statusCommand: string;
  preflight: (flags: Map<string, string[]>) => Promise<string | null>;
  install: (flags: Map<string, string[]>) => Promise<void>;
  status: (flags: Map<string, string[]>) => Promise<void>;
};

type OrchestrationDependencies = {
  allTargets: (flags: Map<string, string[]>) => ManagedAllInstallTarget[];
  booleanFlag: (flags: Map<string, string[]>, name: string) => boolean;
  capturePrintedJson: <T>(callback: () => Promise<void>) => Promise<T>;
  formatInstallAllResult: (result: Record<string, unknown>) => string;
  formatStatusAllResult: (result: Record<string, unknown>) => string;
  printCliOutput: (
    flags: Map<string, string[]>,
    value: unknown,
    formatted: string,
  ) => void;
  redactError: (error: unknown) => string;
  uninstallTarget: (
    target: string,
    flags: Map<string, string[]>,
  ) => Promise<void>;
};

export const TARGET_DISPLAY_NAMES: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  devin: "Devin Desktop",
  "claude-code": "Claude Code",
  mimocode: "MiMo Code",
  opencode: "OpenCode",
  grok: "Grok CLI",
  antigravity: "Antigravity CLI",
  copilot: "GitHub Copilot CLI",
  qoder: "Qoder CLI",
};

export const CANONICAL_INSTALL_TARGETS = Object.freeze(
  Object.keys(TARGET_DISPLAY_NAMES),
);

export const EDITOR_TARGETS = ["vscode", "cursor", "devin"] as const;
export const EDITOR_PUBLISHER_TARGET = "status-bar-fallback";

export function isEditorTarget(target: string): boolean {
  return (EDITOR_TARGETS as readonly string[]).includes(target);
}

function cloneFlags(flags: Map<string, string[]>): Map<string, string[]> {
  return new Map(
    Array.from(flags.entries()).map(([key, values]) => [key, [...values]]),
  );
}

function canonicalPublisherTarget(target: string): string {
  return isEditorTarget(target) ? EDITOR_PUBLISHER_TARGET : target;
}

export function createCanonicalInstallTargets(
  flags: Map<string, string[]>,
  dependencies: OrchestrationDependencies,
  options: {
    installFlags?: (
      target: string,
      flags: Map<string, string[]>,
    ) => Promise<Map<string, string[]>>;
  } = {},
): InstallTarget[] {
  const internalJsonFlags = cloneFlags(flags);
  internalJsonFlags.set("json", ["true"]);
  return dependencies.allTargets(flags).map((target) => ({
    target: target.target,
    publisherTarget: canonicalPublisherTarget(target.target),
    displayName: TARGET_DISPLAY_NAMES[target.target] ?? target.target,
    command: target.command,
    statusCommand: target.statusCommand,
    uninstallCommand: isEditorTarget(target.target)
      ? `waitspin extension uninstall --target ${target.target}`
      : `waitspin ${target.target} uninstall`,
    preflight: () => target.preflight(flags),
    install: async () => {
      const targetFlags = options.installFlags
        ? await options.installFlags(target.target, internalJsonFlags)
        : internalJsonFlags;
      return dependencies.capturePrintedJson<unknown>(() =>
        target.install(targetFlags),
      );
    },
    status: () =>
      dependencies.capturePrintedJson<unknown>(() =>
        target.status(internalJsonFlags),
      ),
    uninstall: () =>
      dependencies.capturePrintedJson<unknown>(() =>
        dependencies.uninstallTarget(target.target, internalJsonFlags),
      ),
  }));
}

export async function runManagedInstallAll(
  flags: Map<string, string[]>,
  dependencies: OrchestrationDependencies,
) {
  const dryRun = dependencies.booleanFlag(flags, "dry-run");
  const includeExperimental = dependencies.booleanFlag(
    flags,
    "include-experimental",
  );
  if (includeExperimental && !dryRun) {
    throw new Error(
      "--include-experimental is only available with install --all --dry-run. Use explicit waitspin <target> install commands for hidden experimental targets.",
    );
  }
  const aggregate = await runInstallTargets(
    createCanonicalInstallTargets(flags, dependencies),
    { dryRun, redactError: dependencies.redactError },
  );
  const output = {
    ...aggregate,
    command: "install --all",
    dry_run: dryRun,
    mode: "detected-targets",
    include_experimental: includeExperimental,
    next: "check_all_status",
    next_command: includeExperimental
      ? "waitspin status --all --include-experimental"
      : "waitspin status --all",
    human_message:
      "Install-all is an advanced agent command. Explicit target commands remain the canonical debug path.",
  };
  dependencies.printCliOutput(
    flags,
    output,
    dependencies.formatInstallAllResult(output),
  );
}

export async function runManagedStatusAll(
  flags: Map<string, string[]>,
  dependencies: OrchestrationDependencies,
) {
  const aggregate = await runStatusTargets(
    createCanonicalInstallTargets(flags, dependencies),
    { redactError: dependencies.redactError },
  );
  const output = {
    ...aggregate,
    command: "status --all",
    include_experimental: dependencies.booleanFlag(flags, "include-experimental"),
  };
  dependencies.printCliOutput(
    flags,
    output,
    dependencies.formatStatusAllResult(output),
  );
}

export async function runManagedUninstallAll(
  flags: Map<string, string[]>,
  dependencies: OrchestrationDependencies,
) {
  const aggregate = await runUninstallTargets(
    createCanonicalInstallTargets(flags, dependencies),
    { redactError: dependencies.redactError },
  );
  const output = {
    ...aggregate,
    command: "uninstall --all",
    include_experimental: dependencies.booleanFlag(flags, "include-experimental"),
  };
  dependencies.printCliOutput(flags, output, JSON.stringify(output, null, 2));
}

export async function runManagedRepairAll(
  flags: Map<string, string[]>,
  dependencies: OrchestrationDependencies,
) {
  if (dependencies.booleanFlag(flags, "include-experimental")) {
    throw new Error(
      "repair --all cannot mutate experimental targets. Use install --all --include-experimental --dry-run, then repair an explicitly selected experimental target.",
    );
  }
  const repairFlags = cloneFlags(flags);
  repairFlags.set("compose-existing", ["true"]);
  const aggregate = await runInstallTargets(
    createCanonicalInstallTargets(repairFlags, dependencies),
    { dryRun: false, redactError: dependencies.redactError },
  );
  const output = {
    ...aggregate,
    command: "repair --all",
    include_experimental: false,
  };
  dependencies.printCliOutput(flags, output, JSON.stringify(output, null, 2));
}
