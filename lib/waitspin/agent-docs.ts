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
    path: "/v1/publishers/register",
    auth: "publishers:write",
    purpose: "Register a publisher install ID for VS Code Activity Bar/status-bar extension, Claude Code statusline, MiMo Code shell hook, OpenCode TUI slot, or Grok Code CLI footer.",
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
    purpose: "Read publisher balances, Connect status, and payout eligibility.",
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
    purpose: "Read publisher delivery, reversal, hold, and payout ledger rows.",
  },
  {
    method: "POST",
    path: "/v1/wallet/payouts",
    auth: "connect:manage",
    purpose: "Preview or execute a guarded idempotent publisher payout.",
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

export function renderWaitSpinAgentsMarkdown(): string {
  return `# WaitSpin Agent Contract

Last updated: 2026-06-15

WaitSpin is an independent paid marketplace for developer wait-state inventory.
Public paid launch is not marked ready until the operator launch gates pass.

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
advertiser/control actions. Use \`--key-profile publisher-extension\` for
publisher install, serve polling, and impression reporting. Publisher-extension
keys can register publisher installs, poll serve inventory, report impressions,
and read wallet/ledger status. They cannot create campaigns, start Checkout,
manage Connect, or execute payouts.

\`POST /v1/campaigns\` requires an \`Idempotency-Key\` v4 UUID.

## Shipped Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
${endpointTable()}

## Public Publisher Surface

The verified public publisher targets are:
VS Code Activity Bar/status-bar extension, installed from
https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
with \`code --install-extension waitspin.waitspin-vscode\` and connected by running
\`WaitSpin: Connect publisher\` inside VS Code. The CLI fallback is
\`waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY\`. Claude Code statusline command,
installed by \`waitspin claude-code install --compose-existing\`; MiMo Code
shell hook, installed by \`waitspin mimocode install\`; and OpenCode TUI plugin
slot, installed by \`waitspin opencode install\`; and Grok Code CLI footer,
installed by \`waitspin grok install\`. Claude Code support uses the official
\`statusLine.command\` path; MiMo Code uses a bash hook; OpenCode uses its TUI
\`app_bottom\` plugin slot through a managed \`~/.config/opencode/tui.json\`
entry; Grok Code CLI uses a managed text-asset footer patch with hash-backed
backup and restore. Cline VS Code extension installs are covered by the VS Code
fallback; standalone Cline CLI awaits official statusline/plugin support.
Native spinner patch targets remain deferred.

The public clients do not read or send workspace files, source code, open
editor text, prompts, model responses, integrated terminal output, shell
history, repository URLs, screenshots, clipboard contents, or raw keystrokes.
Serve polling sends only the install ID; impression events send serve ID, serve
receipt, install ID, and visible milliseconds, plus normal network metadata for
rate limits and fraud controls.

Advanced agent install may use \`waitspin install --all --dry-run
--compose-existing\`, then \`waitspin install --all --compose-existing\`, and
\`waitspin status --all\`. Install-all only installs detected supported targets
and reports structured \`installed\`, \`would_install\`,
\`skipped_not_detected\`, \`skipped_conflict\`, and \`failed_rollback\` arrays.
Explicit target commands remain the canonical debug path.

## WebMCP Browser Tools

Chrome WebMCP onboarding tools are registered on https://waitspin.com
and https://waitspin.com/docs via declarative forms. Source of truth:
\`lib/waitspin/webmcp/tool-definitions.ts\`.

${waitSpinWebMcpToolListMarkdown()}

## Commission And Fees

${renderPublicCommissionSplitSentence()} Publisher earnings are recorded immediately in the
delivery ledger, mature for ${WTS_EARNING_MATURITY_HOURS} hours in pending
balance, and become payout-eligible only after moving into available balance.
Wallet status also exposes a deterministic 10-day publisher/install trust
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

\`\`\`bash
npm view waitspin version
npx --yes waitspin init --email you@example.com --key-profile control
export WAITSPIN_API_KEY=wts_live_...
waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1
waitspin bid checkout CAMPAIGN_ID
npx --yes waitspin init --email you@example.com --key-profile publisher-extension

# Install every detected supported target
waitspin install --all --dry-run --api-key wts_live_... --compose-existing
waitspin install --all --api-key wts_live_... --compose-existing
waitspin status --all

# VS Code Activity Bar/status-bar extension
# Marketplace: https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
code --install-extension waitspin.waitspin-vscode
# Then run "WaitSpin: Connect publisher" in VS Code.
# CLI fallback:
waitspin extension install --target vscode --api-key wts_live_...
waitspin extension status --target vscode

# Claude Code statusline
waitspin claude-code install --api-key wts_live_... --compose-existing
waitspin claude-code status

# MiMo Code shell hook
waitspin mimocode install --api-key wts_live_...
waitspin mimocode status

# OpenCode TUI plugin slot
waitspin opencode install --api-key wts_live_...
waitspin opencode status

# Grok Code CLI footer
waitspin grok install --api-key wts_live_...
waitspin grok status
\`\`\`
`;
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
