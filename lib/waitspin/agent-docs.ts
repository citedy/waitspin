import {
  WAITSPIN_CONTROL_V1_PATHS,
  WAITSPIN_CONTROL_API_PATHS,
} from "@/lib/waitspin/control-api-hosts";
import { WTS_EARNING_MATURITY_HOURS } from "@/lib/waitspin/constants";
import { renderPublicCommissionSplitSentence } from "@/lib/waitspin/billing";
import { waitSpinWebMcpToolListMarkdown } from "@/lib/waitspin/webmcp/tool-definitions";

type AgentEndpoint = {
  method: "GET" | "POST";
  path: string;
  auth: string;
  purpose: string;
};

export const WAITSPIN_AGENT_ENDPOINTS: readonly AgentEndpoint[] = [
  {
    method: "POST",
    path: "/v1/keys/request",
    auth: "none",
    purpose: "Request an email verification code.",
  },
  {
    method: "POST",
    path: "/v1/keys/verify",
    auth: "none",
    purpose: "Verify code and receive a wts_live API key.",
  },
  {
    method: "POST",
    path: "/v1/list/subscribe",
    auth: "none",
    purpose:
      "Request double opt-in WaitSpin publisher or founding advertiser email updates.",
  },
  {
    method: "GET",
    path: "/v1/market",
    auth: "none",
    purpose: "Read active public campaign leaderboard.",
  },
  {
    method: "POST",
    path: "/v1/campaigns",
    auth: "campaigns:write",
    purpose: "Create a draft campaign and pending block purchase.",
  },
  {
    method: "GET",
    path: "/v1/campaigns",
    auth: "campaigns:read",
    purpose: "List campaigns for the API key account.",
  },
  {
    method: "POST",
    path: "/v1/blocks/checkout",
    auth: "blocks:purchase",
    purpose: "Create or reuse a Stripe Checkout URL.",
  },
  {
    method: "POST",
    path: "/v1/blocks/mpp-crypto",
    auth: "blocks:purchase or verified MPP credential",
    purpose:
      "Create or reuse a Stripe/Tempo stablecoin MPP challenge for a pending block purchase.",
  },
  {
    method: "POST",
    path: "/v1/publishers/register",
    auth: "publishers:write",
    purpose:
      "Register a user install ID for VS Code Activity Bar/status-bar extension, Cursor Editor Mode through the VS Code-compatible extension path, Devin Desktop through Open VSX, Claude Code statusline, MiMo Code shell hook, OpenCode TUI slot, Grok Code CLI footer, Antigravity CLI statusline, GitHub Copilot CLI statusline, or Qoder CLI UserPromptSubmit/Stop hooks.",
  },
  {
    method: "POST",
    path: "/v1/serve/next",
    auth: "serve:read",
    purpose: "Return the next sponsored message or 204.",
  },
  {
    method: "POST",
    path: "/v1/events/impression",
    auth: "events:write",
    purpose: "Record an impression after the visible interval.",
  },
  {
    method: "GET",
    path: "/v1/wallet/status",
    auth: "wallet:read",
    purpose: "Read user balances, Connect status, and payout eligibility.",
  },
  {
    method: "POST",
    path: "/v1/wallet/connect",
    auth: "connect:manage",
    purpose: "Create or refresh a Stripe Express onboarding link.",
  },
  {
    method: "GET",
    path: "/v1/wallet/ledger",
    auth: "wallet:read",
    purpose: "Read user delivery, reversal, hold, and payout ledger rows.",
  },
  {
    method: "POST",
    path: "/v1/wallet/payouts",
    auth: "connect:manage",
    purpose: "Preview or execute a guarded idempotent user payout.",
  },
  {
    method: "POST",
    path: "/api/waitspin/webhook",
    auth: "Stripe signature",
    purpose: "Stripe activation and refund/dispute handling.",
  },
] as const;

function endpointTable() {
  return WAITSPIN_AGENT_ENDPOINTS.map(
    (endpoint) =>
      `| ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.auth} | ${endpoint.purpose} |`,
  ).join("\n");
}

export function waitSpinAgentDocsMissingShippedPaths(): string[] {
  const documented = new Set(WAITSPIN_AGENT_ENDPOINTS.map((item) => item.path));
  return [...WAITSPIN_CONTROL_V1_PATHS, ...WAITSPIN_CONTROL_API_PATHS].filter(
    (path) => !documented.has(path),
  );
}

export const WAITSPIN_AGENT_QUICKSTART_MARKDOWN = `Use this credential-free path when an agent needs one clean WaitSpin onboarding
run. It uses static CLI fixtures only.

Canonical agent-readable quickstart: https://waitspin.com/quickstart.md

## Credential-Free Demo Path

\`\`\`bash
npm view waitspin version
export WAITSPIN_API_KEY=wts_demo_agent_quickstart
npx --yes waitspin market --demo --json
npx --yes waitspin bid create --demo --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1 --json
npx --yes waitspin bid checkout demo_campaign_001 --demo --json
npx --yes waitspin status --all --demo --json
\`\`\`

\`waitspin market --demo --json\` returns at least this shape:

\`\`\`json
{
  "ok": true,
  "mode": "demo",
  "campaigns": [
    {
      "campaign_id": "demo_campaign_001"
    }
  ]
}
\`\`\`

For a machine assertion, check \`campaigns[0].campaign_id\`:

\`\`\`bash
npx --yes waitspin market --demo --json \\
  | jq -e '.ok == true and .mode == "demo" and .campaigns[0].campaign_id == "demo_campaign_001"'
\`\`\`

Done means every demo command returns \`ok: true\`, \`"mode": "demo"\`, and
stable demo IDs such as \`demo_campaign_001\` and
\`demo_block_purchase_001\`. This path does not create an account, campaign,
Stripe Checkout, install, publisher event, payout, or billable impression.

## Non-JS Agents

WaitSpin is CLI-first. No native Python, Go, or language-specific SDK is required.
Non-JS agents should shell out to \`npx --yes waitspin ... --json\` and parse stdout.

\`\`\`python
import json
import subprocess

result = subprocess.run(
    ["npx", "--yes", "waitspin", "market", "--demo", "--json"],
    capture_output=True,
    text=True,
    check=True,
)
market = json.loads(result.stdout)
\`\`\`

\`\`\`go
package main

import (
	"encoding/json"
	"os/exec"
)

func main() {
	output, err := exec.Command("npx", "--yes", "waitspin", "market", "--demo", "--json").Output()
	if err != nil {
		panic(err)
	}
	var market map[string]any
	if err := json.Unmarshal(output, &market); err != nil {
		panic(err)
	}
}
\`\`\`

## Authenticated Advertiser/Publisher Path

\`\`\`bash
npm view waitspin version
npx --yes waitspin init --email you@example.com --key-profile control
# Check the email inbox, then verify the OTP before using the returned key.
npx --yes waitspin init --email you@example.com --code CODE_FROM_EMAIL --key-profile control --json
export WAITSPIN_API_KEY=wts_live_key_returned_by_verified_init
waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1
waitspin bid checkout CAMPAIGN_ID
# Agent-native stablecoin pay-in: POST /v1/blocks/mpp-crypto and follow the
# 402 Payment challenge until WaitSpin returns Payment-Receipt.
npx --yes waitspin init --email you@example.com --key-profile publisher-extension
# Check the email inbox again if prompted, then verify the publisher key.
npx --yes waitspin init --email you@example.com --code CODE_FROM_EMAIL --key-profile publisher-extension --json
export WAITSPIN_API_KEY=wts_live_publisher_key_returned_by_verified_init

# Install every detected all-install target.
waitspin install --all --dry-run --compose-existing
waitspin install --all --compose-existing
waitspin status --all
\`\`\`

WaitSpin is CLI-first. Python, Go, and shell agents should call the CLI and parse
JSON unless a future native SDK is explicitly documented.
`;

export function renderWaitSpinQuickstartMarkdown(): string {
  return `# WaitSpin Quickstart

${WAITSPIN_AGENT_QUICKSTART_MARKDOWN}`;
}

export function renderWaitSpinAgentsMarkdown(): string {
  return `# WaitSpin Agent Contract

Last updated: 2026-07-02

WaitSpin is an independent paid marketplace for developer wait-state inventory.
Advertisers can buy blocks through Stripe Checkout or the production
Stripe/Tempo stablecoin MPP API rail; publisher payouts remain the standard
Stripe-managed fiat payout path.

## Base URLs

- Public API discovery: https://api.waitspin.com/v1
- OpenAPI contract: https://waitspin.com/openapi/waitspin-api.openapi.json
- Human docs: https://waitspin.com/docs
- Terms: https://waitspin.com/waitspin/terms
- Privacy: https://waitspin.com/waitspin/privacy
- Trust boundary: https://waitspin.com/waitspin/trust
- Public client source: https://github.com/citedy/waitspin

## Authentication

Authenticated routes use \`Authorization: Bearer wts_live_...\`.

Use \`npx --yes waitspin init --email EMAIL --key-profile control\` for
advertiser/control actions. Use \`--key-profile publisher-extension\` to create
an extension API key for user install registration, serve polling, and
impression reporting. Keys from that profile can register user installs, poll
serve inventory, report impressions,
and read wallet/ledger status. They cannot create campaigns, start Checkout,
start MPP block purchases, manage Connect, or execute payouts.

\`POST /v1/campaigns\` requires an \`Idempotency-Key\` v4 UUID.

## Agent Payment Flow

Stripe Checkout remains the classic card and wallet path through
\`POST /v1/blocks/checkout\`. Agents that support HTTP 402 payments can also use
\`POST /v1/blocks/mpp-crypto\` for stablecoin block purchases through
Stripe/Tempo MPP:

1. Create a campaign and pending block purchase through \`POST /v1/campaigns\`.
2. Call \`POST /v1/blocks/mpp-crypto\` with a control key that has
   \`blocks:purchase\`.
3. WaitSpin returns \`402 Payment Required\` with
   \`WWW-Authenticate: Payment ...\`.
4. The agent pays the Stripe/Tempo challenge and retries with the MPP payment
   credential.
5. WaitSpin verifies the MPP credential and Stripe
   \`PaymentIntent.status === "succeeded"\`, then activates blocks through the
   canonical block purchase path and returns \`Payment-Receipt\` plus the
   WaitSpin receipt.

MPP is an advertiser pay-in rail only. It is not a publisher crypto payout,
wallet, custody, or raw wallet-address collection flow.

## Shipped Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
${endpointTable()}

## Crypto MPP Block Purchases

\`POST /v1/blocks/mpp-crypto\` lets advertisers and agents buy pending block
purchases with stablecoin through Stripe/Tempo MPP. The first request uses a
normal WaitSpin bearer key with \`blocks:purchase\` and returns
\`402 Payment Required\` plus \`WWW-Authenticate: Payment ...\` when payment is
required. After the agent pays through the MPP challenge, retry the same request
with the Payment credential. WaitSpin verifies the MPP credential, verifies the
bound Stripe \`PaymentIntent\` is \`succeeded\`, activates blocks through the
canonical block purchase path, and returns \`200\` with a receipt. Pending,
failed, canceled, mismatched, or unverified MPP/Stripe payments do not activate
blocks.

This is an inbound advertiser payment rail only. WaitSpin does not implement
crypto payouts, wallet custody, raw wallet address storage, private-key
handling, or a treasury crypto balance; publishers continue to receive standard
Stripe-managed fiat payouts when payout policy allows.

## Public User Earning Surfaces

The verified public user earning surfaces are:
VS Code Activity Bar/status-bar extension, installed from
https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
with \`code --install-extension waitspin.waitspin-vscode\` for VS Code or
\`cursor --install-extension waitspin.waitspin-vscode --force\` for Cursor Editor Mode,
or from Open VSX for Devin Desktop with
\`devin-desktop --install-extension waitspin.waitspin-vscode --force\` when the desktop
CLI is on PATH. The equivalent WaitSpin local lifecycle commands are
\`waitspin extension install --target cursor\` and
\`waitspin extension install --target devin\`, with matching \`status\` and
\`uninstall\` subcommands. On Windows, they resolve Cursor command shims and
auto-detect \`%LOCALAPPDATA%\\devin\\bin\\devin.exe\`,
then connected by running \`WaitSpin: Connect and earn\` inside the matching
editor. The VS Code CLI fallback is \`waitspin extension install --target vscode
--api-key PASTE_PUBLISHER_EXTENSION_KEY\`. Claude Code statusline command,
installed by \`waitspin claude-code install --compose-existing\`; Antigravity
CLI statusline command, installed by \`waitspin antigravity install
--compose-existing\`; GitHub Copilot CLI statusline command, installed by
\`waitspin copilot install --compose-existing\`; MiMo Code shell hook, installed
by \`waitspin mimocode install\`; OpenCode TUI plugin slot, installed by
\`waitspin opencode install\`; and Grok Code CLI footer, installed by
\`waitspin grok install\`; and Qoder CLI UserPromptSubmit/Stop hooks, installed by
\`waitspin qoder install\`. Claude Code, Antigravity CLI, and GitHub Copilot CLI
support use first-class \`statusLine.command\` paths; MiMo Code uses a bash
hook; OpenCode uses its TUI \`app_bottom\` plugin slot through a managed
\`~/.config/opencode/tui.json\` entry; Grok Code CLI uses a managed text-asset
footer patch with hash-backed backup and restore; Qoder CLI uses the official
\`UserPromptSubmit\` hook with \`statusMessage\`/\`systemMessage\` plus the
official \`Stop\` hook for the later visibility callback. Cline VS Code extension
installs, Cursor Editor Mode, and Devin Desktop are covered by the same VS
Code-compatible extension ID; Devin uses the Open VSX listing, and standalone
Cline CLI awaits official statusline/plugin support. Native spinner patch
targets remain deferred.

The public clients do not send workspace files, source code, open editor text,
prompts, model responses, integrated terminal output, shell history, repository
URLs, screenshots, clipboard contents, or raw keystrokes. Qoder's official hook
payload is delivered locally by Qoder and can include prompt or assistant
message fields; the WaitSpin Qoder runtime discards those fields before cache or
API work. Serve polling sends only the install ID; impression events send serve
ID, serve receipt, install ID, and visible milliseconds, plus normal network
metadata for rate limits and fraud controls.

Advanced agent install may use \`waitspin install --all --dry-run
--compose-existing\`, then \`waitspin install --all --compose-existing\`, and
\`waitspin status --all\`. Install-all only installs detected supported targets,
including Cursor and Devin Desktop local editor aliases, and reports structured
\`installed\`, \`would_install\`,
\`skipped_not_detected\`, \`skipped_conflict\`, and \`failed_rollback\` arrays.
Explicit target commands remain the canonical debug path.

## WebMCP Browser Tools

Chrome WebMCP onboarding tools are registered on https://waitspin.com
and https://waitspin.com/docs via declarative forms. Source of truth:
\`lib/waitspin/webmcp/tool-definitions.ts\`.

${waitSpinWebMcpToolListMarkdown()}

## Commission And Fees

${renderPublicCommissionSplitSentence()} User earnings are recorded immediately in the
delivery ledger, mature for ${WTS_EARNING_MATURITY_HOURS} hours in pending
balance, and become payout-eligible only after moving into available balance.
Wallet status also exposes a deterministic 10-day user/install trust
warmup state with freeze/downrank reasons. Trust warmup never shortens the
${WTS_EARNING_MATURITY_HOURS}-hour earning maturity window. Stripe processing
fees are absorbed from the platform share unless the payment policy changes. Do
not expose internal constant names in public user or advertiser instructions.

## Deferred Capabilities

Do not claim these as shipped public paid-launch capabilities:

- Native spinner patching beyond supported status surfaces.
- \`POST /v1/events/click\` and 50x click billing.
- Automated account-credit balance, redemption, or self-serve cash refund
  request flow for unused prepaid blocks.
- Geo targeting and house ads on empty inventory.
- Live payout transfers without explicit operator flags and deployed evidence.

## Agent Quick Start

${WAITSPIN_AGENT_QUICKSTART_MARKDOWN}

Supported user-surface install commands:

\`\`\`bash
# VS Code Activity Bar/status-bar extension
# Marketplace: https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
code --install-extension waitspin.waitspin-vscode

# Cursor Editor Mode user extension
cursor --install-extension waitspin.waitspin-vscode --force
waitspin extension install --target cursor
waitspin extension status --target cursor
waitspin extension uninstall --target cursor
# Then run "WaitSpin: Connect and earn" in the matching editor.

# Devin Desktop user extension
# Open VSX: https://open-vsx.org/extension/waitspin/waitspin-vscode
devin-desktop --install-extension waitspin.waitspin-vscode --force
waitspin extension install --target devin
waitspin extension status --target devin
waitspin extension uninstall --target devin
# Then run "WaitSpin: Connect and earn" in Devin Desktop.

# VS Code CLI fallback:
waitspin extension install --target vscode --api-key wts_live_...
waitspin extension status --target vscode

# Claude Code statusline
waitspin claude-code install --api-key wts_live_... --compose-existing
waitspin claude-code status

# Antigravity CLI statusline
waitspin antigravity install --api-key wts_live_... --compose-existing
waitspin antigravity status

# GitHub Copilot CLI statusline
waitspin copilot install --api-key wts_live_... --compose-existing
waitspin copilot status

# MiMo Code shell hook
waitspin mimocode install --api-key wts_live_...
waitspin mimocode status

# OpenCode TUI plugin slot
waitspin opencode install --api-key wts_live_...
waitspin opencode status

# Grok Code CLI footer
waitspin grok install --api-key wts_live_...
waitspin grok status

# Qoder CLI UserPromptSubmit/Stop hooks
waitspin qoder install --api-key wts_live_...
waitspin qoder status
\`\`\`
`;
}

export function waitSpinQuickstartMarkdownResponse(): Response {
  return new Response(renderWaitSpinQuickstartMarkdown(), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export function waitSpinAgentsMarkdownResponse(): Response {
  return new Response(renderWaitSpinAgentsMarkdown(), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
