# waitspin

Command-line client for [WaitSpin](https://waitspin.com) — sponsored
wait-state ads for verified developer surfaces.

## Install

Run after `npm view waitspin version` succeeds in launch evidence:

Before install, user registration, or Checkout, review:

- Public API and agent docs: `https://waitspin.com/docs`
- Agent markdown: `https://waitspin.com/.well-known/agents.md`
- Terms: `https://waitspin.com/waitspin/terms`
- Privacy: `https://waitspin.com/waitspin/privacy`

Refund/account-credit disclosure: unused prepaid block handling is
support-reviewed. No automated account-credit balance, redemption flow, or
self-serve cash refund request flow is shipped yet.

```bash
npm view waitspin version
npx --yes waitspin init --email you@example.com --key-profile control
export WAITSPIN_API_KEY=PASTE_CONTROL_KEY
waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1
waitspin bid checkout CAMPAIGN_ID
npx --yes waitspin init --email you@example.com --key-profile publisher-extension

# First-class VS Code user path
code --install-extension waitspin.waitspin-vscode
# Then run "WaitSpin: Connect and earn" inside VS Code.

# Advanced agent install for every detected supported target
waitspin install --all --dry-run --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin install --all --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin status --all

# CLI fallback for VS Code Activity Bar/status-bar extension
waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin extension status --target vscode

# Or install for Claude Code statusline
waitspin claude-code install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin claude-code status

# Or install for Antigravity CLI statusline
waitspin antigravity install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin antigravity status

# Or install for GitHub Copilot CLI statusline
waitspin copilot install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin copilot status

# Or install for MiMo Code shell hook
waitspin mimocode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin mimocode status

# Or install for OpenCode TUI plugin slot
waitspin opencode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin opencode status

# Or install for Grok Code CLI footer
waitspin grok install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin grok status
```

## Commands

- `waitspin init` — email OTP onboarding
- `waitspin bid create` — create a campaign draft
- `waitspin bids list` — list campaigns
- `waitspin bid checkout CAMPAIGN_ID` — Stripe Checkout for blocks
- `waitspin market` — public leaderboard
- `waitspin wallet connect --country US` — Stripe Connect Express onboarding
- `waitspin wallet status` — user balance, payout, and Connect status
- `waitspin wallet ledger` — user delivery ledger
- `waitspin wallet payout --dry-run` — payout eligibility preview
- `code --install-extension waitspin.waitspin-vscode` — install the public VS Code Marketplace extension
- `WaitSpin: Connect and earn` — connect the VS Code extension from inside the editor
- `waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY` — advanced CLI fallback for VS Code extension setup
- `waitspin extension status --target vscode` — inspect managed VS Code extension lifecycle state
- `waitspin extension uninstall --target vscode` — remove the managed VS Code extension runtime and local state
- `waitspin install --all --dry-run` — preview detected user surfaces without file changes
- `waitspin install --all` — install every detected supported user surface
- `waitspin status --all` — aggregate lifecycle status for every user surface
- `waitspin claude-code install --compose-existing` — install the Claude Code statusline command
- `waitspin claude-code status` — inspect managed Claude Code runtime state
- `waitspin claude-code uninstall` — restore Claude Code statusline settings and remove managed local state
- `waitspin antigravity install --compose-existing` — install the Antigravity CLI statusline command
- `waitspin antigravity status` — inspect managed Antigravity CLI runtime state
- `waitspin antigravity uninstall` — restore Antigravity CLI statusline settings and remove managed local state
- `waitspin copilot install --compose-existing` — install the GitHub Copilot CLI statusline command
- `waitspin copilot status` — inspect managed GitHub Copilot CLI runtime state
- `waitspin copilot uninstall` — restore GitHub Copilot CLI statusline settings and remove managed local state
- `waitspin mimocode install` — install the MiMo Code shell hook
- `waitspin mimocode status` — inspect managed MiMo Code runtime state
- `waitspin mimocode uninstall` — remove managed MiMo Code runtime and bash hook
- `waitspin opencode install` — install the OpenCode TUI plugin slot
- `waitspin opencode status` — inspect managed OpenCode runtime state
- `waitspin opencode uninstall` — remove managed OpenCode runtime and plugin
- `waitspin grok install` — install the Grok Code CLI footer surface
- `waitspin grok status` — inspect managed Grok Code CLI runtime state
- `waitspin grok uninstall` — restore Grok Code CLI and remove managed state

API base: `https://api.waitspin.com`

The public package installs five verified user earning surfaces: the VS Code
Activity Bar/status-bar extension, the Claude Code statusline command, the MiMo
Code shell hook, the OpenCode TUI plugin slot, and the Grok Code CLI footer.
Claude Code support uses the official `statusLine.command` path and does not
patch Claude Code internals. MiMo Code uses a bash hook that polls the API for
sponsored messages. OpenCode uses its TUI `app_bottom` plugin slot. Grok Code
CLI uses a managed text-asset footer patch with hash-backed backup/restore and
does not patch native binaries.

`waitspin install --all` is an advanced agent command for installing every
detected supported target. It keeps explicit target commands as the canonical
debug path, supports `--dry-run`, skips unsupported local tools in
`skipped_not_detected`, reports recoverable config conflicts in
`skipped_conflict`, and reports unexpected installer failures in
`failed_rollback`.

Payout execution is guarded server-side. Public launch proof uses Stripe test
mode with `waitspin wallet payout --confirm-test-transfer`; live transfers stay
disabled until the operator enables the explicit live payout flags.

Native spinner patches beyond supported status surfaces, account-credit
redemption, cash refund self-service, and click billing are not public
paid-launch capabilities yet.

## User install credentials

Use an extension API key created with `--key-profile publisher-extension` for
user install polling/events:

```bash
npx waitspin init --email you@example.com --key-profile publisher-extension
code --install-extension waitspin.waitspin-vscode
# Then run "WaitSpin: Connect and earn" inside VS Code.
npx waitspin install --all --dry-run --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
npx waitspin install --all --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
npx waitspin status --all
npx waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
npx waitspin claude-code install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
npx waitspin antigravity install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
npx waitspin copilot install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
npx waitspin mimocode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
npx waitspin opencode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
npx waitspin grok install --api-key PASTE_PUBLISHER_EXTENSION_KEY
```

- `WAITSPIN_API_KEY` — temporary extension API key for CLI fallback flows
- `WAITSPIN_INSTALL_ID` — from `waitspin extension install` or `waitspin claude-code install`

The VS Code Marketplace extension should normally be connected through
`WaitSpin: Connect and earn`, which stores the extension key in VS Code
SecretStorage and stores the install ID in user-scoped extension state. The
legacy `waitspin.apiKey` User setting is still migrated into SecretStorage for
fallback/rotation, but normal user operation does not require copying
install IDs or broad control keys into workspace settings.

The Claude Code installer writes a managed statusline runtime/state under
`~/.waitspin` and updates `~/.claude/settings.json` with a safe
`statusLine.command`. It fails fast when an existing unmanaged statusline is
present unless `--compose-existing` is explicitly requested and restorable.

The Antigravity CLI and GitHub Copilot CLI installers write managed
runtime/state under `~/.waitspin` and configure their first-class
`statusLine.command` settings without patching native binaries. Both fail fast
when an existing unmanaged statusline is present unless `--compose-existing` is
explicitly requested and restorable.

The MiMo Code installer writes a managed runtime script under `~/.local/bin/`
and a bash hook in `~/.bashrc`. It polls the API for sponsored messages and
displays them in the terminal.

The OpenCode installer writes a managed runtime/state under `~/.waitspin`,
installs a TUI plugin under `~/.config/opencode/plugins`, and adds the managed
entry to `~/.config/opencode/tui.json` so OpenCode mounts the `app_bottom` slot.

The Grok Code CLI installer writes a managed runtime/state under `~/.waitspin`
and patches the verified OpenTUI footer text asset with a hash-backed backup so
uninstall can restore the original file.

Cline VS Code extension installs are covered by the VS Code Activity Bar/status-bar extension target.
Standalone Cline CLI is not a public install target until Cline exposes an
official statusline/plugin surface.

## Release validation

Before advertising the public `npx waitspin` path, release operators should run:

```bash
npm --workspace packages/waitspin pack --dry-run --json
npm run test:waitspin:distribution
npm view waitspin version
npx --yes waitspin --help
npx --yes waitspin@latest mimocode status
npx --yes waitspin@latest opencode status
npx --yes waitspin@latest grok status
npx --yes waitspin@latest antigravity status
npx --yes waitspin@latest copilot status
```
