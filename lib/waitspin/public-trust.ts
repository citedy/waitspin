export const WAITSPIN_PUBLIC_TRUST_REPO_URL = "https://github.com/citedy/waitspin";

export const WAITSPIN_PUBLIC_PUBLISHER_TARGETS = [
  {
    label: "VS Code",
    target: "status-bar-fallback",
    href: "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode",
    localBehavior:
      "Uses VS Code SecretStorage for the extension API key and user-scoped extension state for the install ID. The Marketplace extension provides an Activity Bar user view, status-bar mini state, wallet balance, pending balance, recent ledger entries, current sponsor card, no-inventory state, connect/polling/refresh/open commands, and a five-second visible impression hold.",
  },
  {
    label: "Cursor Editor Mode",
    target: "status-bar-fallback",
    href: "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode",
    localBehavior:
      "Uses the same VS Code-compatible WaitSpin extension in Cursor, installed or updated with cursor --install-extension waitspin.waitspin-vscode --force, waitspin extension install --target cursor, or Cursor's Extensions panel. Detected Cursor installs are included in waitspin install --all. It stores keys through the VS Code-compatible SecretStorage API and uses the same Activity Bar/status-bar privacy boundary as the VS Code surface.",
  },
  {
    label: "Devin Desktop",
    target: "status-bar-fallback",
    href: "https://open-vsx.org/extension/waitspin/waitspin-vscode",
    localBehavior:
      "Uses the Open VSX-published WaitSpin VS Code-compatible extension in Devin Desktop, installed from the Extensions panel/Open VSX, with devin-desktop --install-extension waitspin.waitspin-vscode --force, or with waitspin extension install --target devin. Windows lifecycle detection includes %LOCALAPPDATA%\\devin\\bin\\devin.exe. Detected Devin installs are included in waitspin install --all. It stores keys through the VS Code-compatible SecretStorage API and uses the same Activity Bar/status-bar privacy boundary as the VS Code surface.",
  },
  {
    label: "Claude Code",
    target: "claude-code",
    installCommand:
      "waitspin claude-code install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    localBehavior:
      "Inspects user/scoped Claude settings, manages statusLine.command with --compose-existing support, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "MiMo Code",
    target: "mimocode",
    installCommand:
      "waitspin mimocode install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    localBehavior:
      "Installs a managed runtime under ~/.local/bin, adds a bash hook in ~/.bashrc, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "OpenCode",
    target: "opencode",
    installCommand:
      "waitspin opencode install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    localBehavior:
      "Installs a plugin under ~/.config/opencode/plugins, manages the tui.json plugin entry, and stores WaitSpin state/cache under ~/.waitspin.",
  },
  {
    label: "Grok Code CLI",
    target: "grok",
    installCommand:
      "waitspin grok install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    localBehavior:
      "Uses a managed text-asset footer patch with hash-backed backup/restore plus managed runtime/cache/state; it does not patch native binaries.",
  },
  {
    label: "Antigravity CLI",
    target: "antigravity",
    installCommand:
      "waitspin antigravity install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    localBehavior:
      "Manages Antigravity CLI statusLine.command in ~/.gemini/antigravity-cli/settings.json and stores WaitSpin state/cache under ~/.waitspin without patching native binaries.",
  },
  {
    label: "GitHub Copilot CLI",
    target: "copilot",
    installCommand:
      "waitspin copilot install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    localBehavior:
      "Manages GitHub Copilot CLI statusLine.command in ~/.copilot/settings.json or COPILOT_HOME/settings.json and stores WaitSpin state/cache under ~/.waitspin without patching native binaries.",
  },
  {
    label: "Qoder CLI",
    target: "qoder",
    installCommand:
      "waitspin qoder install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    localBehavior:
      "Installs through Qoder's official UserPromptSubmit/Stop hooks, returns sponsored copy with statusMessage/systemMessage, discards prompt and assistant-message hook fields locally before cache/API work, merges ~/.qoder/settings.json without patching Qoder binaries, and stores WaitSpin runtime/state/cache under ~/.waitspin.",
  },
] as const;

export const WAITSPIN_PUBLIC_TARGET_IDS = WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map(
  (target) => target.target,
).filter(
  (target, index, targets): target is (typeof targets)[number] =>
    targets.indexOf(target) === index,
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
  "user install registration: {install_id,target}",
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
