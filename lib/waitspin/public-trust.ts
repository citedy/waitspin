export const WAITSPIN_PUBLIC_TRUST_REPO_URL = "https://github.com/citedy/waitspin";

export const WAITSPIN_PUBLIC_PUBLISHER_TARGETS = [
  {
    label: "VS Code",
    target: "status-bar-fallback",
    localBehavior:
      "Uses VS Code SecretStorage for the publisher API key, a global user-settings bootstrap for install ID/API base, and the managed Activity Bar/status-bar fallback surface.",
  },
  {
    label: "Claude Code",
    target: "claude-code",
    localBehavior:
      "Inspects user/scoped Claude settings, manages statusLine.command with --compose-existing support, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "MiMo Code",
    target: "mimocode",
    localBehavior:
      "Installs a managed runtime under ~/.local/bin, adds a bash hook in ~/.bashrc, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "OpenCode",
    target: "opencode",
    localBehavior:
      "Installs a plugin under ~/.config/opencode/plugins, manages the tui.json plugin entry, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "Grok Code CLI",
    target: "grok",
    localBehavior:
      "Uses a managed text-asset footer patch with hash-backed backup/restore plus managed runtime/cache/state; it does not patch native binaries.",
  },
] as const;

export const WAITSPIN_PUBLIC_TARGET_IDS = WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map(
  (target) => target.target,
);

export const WAITSPIN_NEVER_SENT_DATA = [
  "workspace files",
  "source code",
  "open editor text",
  "prompts",
  "model responses",
  "integrated terminal output",
  "shell history",
  "repository URLs",
  "screenshots",
  "clipboard contents",
  "raw keystrokes",
] as const;

export const WAITSPIN_SENT_PAYLOADS = [
  "publisher registration: {install_id,target}",
  "serve polling: {install_id}",
  "impression event: {serve_id,serve_receipt,install_id,visible_ms}",
  "standard network metadata used for rate limits, fraud controls, abuse response, and audit logs",
] as const;

export const WAITSPIN_PRIVATE_BOUNDARY = [
  "hosted backend implementation",
  "receipt signing internals",
  "fraud thresholds and risk scoring",
  "campaign ranking and allocation logic",
  "billing/accounting internals",
  "payout execution controls",
  "database schema and migrations",
  "deployment, monitoring, and operator scripts",
] as const;

export function waitSpinPublicTargetsSentence(): string {
  return WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map(
    (target) => `${target.label} (${target.target})`,
  ).join(", ");
}
