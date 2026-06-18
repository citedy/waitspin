import type { Metadata } from "next";
import Link from "next/link";

import { WaitSpinWebMcpRegistry } from "@/app/waitspin/WaitSpinWebMcpRegistry";
import { Section, WaitSpinLegalPage } from "../legal-content";

const docsUrl = "https://waitspin.com/docs";

export const metadata: Metadata = {
  metadataBase: new URL("https://waitspin.com"),
  title: "WaitSpin API And Agent Docs",
  description:
    "Current public WaitSpin API and agent contract for shipped routes, headers, scopes, and verified publisher surfaces.",
  alternates: { canonical: docsUrl },
};

const endpoints = [
  [
    "GET",
    "/v1",
    "none",
    "Read API discovery metadata with docs and OpenAPI URLs.",
  ],
  ["POST", "/v1/keys/request", "none", "Request an email verification code."],
  [
    "POST",
    "/v1/keys/verify",
    "none",
    "Verify code and receive a wts_live_ key.",
  ],
  ["GET", "/v1/market", "none", "Read active public campaign leaderboard."],
  [
    "POST",
    "/v1/campaigns",
    "campaigns:write",
    "Create a draft campaign and pending block purchase. Requires Idempotency-Key.",
  ],
  [
    "GET",
    "/v1/campaigns",
    "campaigns:read",
    "List campaigns for the API key account.",
  ],
  [
    "POST",
    "/v1/blocks/checkout",
    "blocks:purchase",
    "Create or reuse a Stripe Checkout URL for a pending campaign.",
  ],
  [
    "POST",
    "/v1/publishers/register",
    "publishers:write",
    "Register a publisher install ID for a supported publisher target.",
  ],
  [
    "POST",
    "/v1/serve/next",
    "serve:read",
    "Return the next sponsored message, or 204 when no inventory is available.",
  ],
  [
    "POST",
    "/v1/events/impression",
    "events:write",
    "Record a billable impression after the server-side visible interval.",
  ],
  [
    "GET",
    "/v1/wallet/status",
    "wallet:read",
    "Read publisher balance, payout eligibility, and Connect status.",
  ],
  [
    "POST",
    "/v1/wallet/connect",
    "connect:manage",
    "Create or refresh a Stripe Express onboarding link.",
  ],
  [
    "GET",
    "/v1/wallet/ledger",
    "wallet:read",
    "Read publisher delivery, refund-reversal, and dispute-hold delivery-ledger rows.",
  ],
  [
    "POST",
    "/v1/wallet/payouts",
    "connect:manage",
    "Preview or execute a guarded idempotent publisher payout.",
  ],
  [
    "POST",
    "/api/waitspin/webhook",
    "Stripe signature",
    "Stripe Checkout activation, refund/dispute accounting, and Connect account sync.",
  ],
] as const;

const routeShapes = `GET /v1
response: { "name": "WaitSpin REST API", "version": "v1", "api_base_url": "https://api.waitspin.com/v1", "docs_url": "https://waitspin.com/docs", "openapi_url": "https://waitspin.com/openapi/waitspin-api.openapi.json", "routes": { "discovery": ["/v1"], "control": ["/v1/market"], "webhooks": ["/api/waitspin/webhook"] } }

POST /v1/keys/request
request:  { "email": "you@example.com", "intended_use": "optional" }
response: { "ok": true, "expires_in_seconds": 900, "delivery": "email" }

POST /v1/keys/verify
request:  { "email": "you@example.com", "code": "123456" }
control response: { "account_id": "wacc_...", "api_key": "wts_live_...", "scopes": ["campaigns:write","campaigns:read","blocks:purchase","serve:read","events:write","wallet:read","connect:manage","analytics:read","publishers:write"], "trust_level": "email_verified" }
publisher-extension response: { "account_id": "wacc_...", "api_key": "wts_live_...", "scopes": ["publishers:write","serve:read","events:write","wallet:read"], "trust_level": "email_verified" }

GET /v1/market
response: { "campaigns": [{ "campaign_id": "wcamp_...", "ad_line": "...", "brand_name": null, "bid_cpm_micros": 1000000, "impressions_served": 0, "status": "active" }] }

POST /v1/campaigns
headers:  Authorization: Bearer wts_live_...; Idempotency-Key: <v4-uuid>
request:  { "ad_line": "...", "destination_url": "https://example.com", "brand_name": "Example", "price_per_block_cents": 500, "blocks": 1 }
response: { "campaign_id": "wcamp_...", "block_purchase_id": "wbp_...", "status": "draft", "blocks": 1, "price_per_block_cents": 500 }

GET /v1/campaigns
response: { "campaigns": [{ "id": "wcamp_...", "ad_line": "...", "status": "draft", "blocks_purchased": 1, "units_remaining": 1000000 }] }

POST /v1/blocks/checkout
request:  { "campaign_id": "wcamp_..." }
response: { "checkout_url": "https://checkout.stripe.com/...", "block_purchase_id": "wbp_..." }

POST /v1/publishers/register
request:  { "install_id": "wins_...", "target": "status-bar-fallback" | "claude-code" | "mimocode" | "opencode" | "grok" }
response: { "publisher_id": "wpub_...", "install_id": "wins_...", "target": "status-bar-fallback" | "claude-code" | "mimocode" | "opencode" | "grok" }

POST /v1/serve/next
request:  { "install_id": "wins_...", "slot_id": "optional" }
response: 204, or { "serve_id": "wss_...", "creative": { "line": "...", "destination_url": "https://example.com", "campaign_id": "wcamp_..." }, "min_visible_ms": 5000, "expires_at": "...", "serve_receipt": "wtsr_v1..." }

POST /v1/events/impression
request:  { "serve_id": "wss_...", "serve_receipt": "wtsr_v1...", "install_id": "wins_...", "visible_ms": 5000 }
response: { "ok": true, "billed_micro_units": 5000 }

GET /v1/wallet/status
response: { "account_id": "wacc_...", "balance": { "available_micro_units": 0, "maturing_micro_units": 0, "held_micro_units": 0, "reversed_micro_units": 0, "reversal_debt_micro_units": 0, "paid_micro_units": 0, "lifetime_earned_micro_units": 0, "pending_payout_micro_units": 0 }, "connect": { "connected": false, "stripe_account_id": null, "payouts_enabled": false, "details_submitted": false }, "payout_policy": { "min_payout_cents": 1000, "cadence_days": 7, "currency": "eur", "earning_maturity_hours": 72, "eligible": false, "transfer_cents": 0, "next_eligible_at": null, "blocked_reasons": ["connect_account_missing"] }, "payout_hold": { "active": false, "reason": null, "created_at": null }, "publisher_trust": { "level": 1, "base_level": 1, "max_level": 10, "status": "warming", "clean_days": 0, "normal_cap_share_bps": 1000, "first_billable_at": null, "next_level_at": null, "reasons": [], "paid_supply_allowed": true, "paid_supply_blocked_reasons": [] } }

POST /v1/wallet/connect
response: { "stripe_account_id": "acct_...", "onboarding_url": "https://connect.stripe.com/...", "payouts_enabled": false, "details_submitted": false }

GET /v1/wallet/ledger?limit=50
response: { "entries": [{ "id": "wled_...", "event_type": "impression", "block_purchase_id": "wbp_...", "source_ledger_id": null, "stripe_event_id": null, "gross_micro_units": 5000, "publisher_micro_units": 3000, "platform_micro_units": 2000, "earning_matures_at": "...", "earning_matured_at": null, "created_at": "..." }] }

POST /v1/wallet/payouts
headers:  Authorization: Bearer wts_live_...; Idempotency-Key required for non-dry-run
request:  { "dry_run": true, "confirm_test_transfer": false }
response:
{
  "ok": true,
  "dry_run": true,
  "amount_micro_units": 0,
  "amount_cents": 0,
  "currency": "eur",
  "eligible": false,
  "blocked_reasons": ["connect_account_missing", "earnings_maturing", "balance_below_minimum"],
  "min_payout_cents": 1000,
  "cadence_days": 7,
  "next_eligible_at": null,
  "payouts_enabled": false,
  "details_submitted": false
}

POST /api/waitspin/webhook
auth:     Stripe signature over raw body
events:   checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created, account.updated
response: { "ok": true }`;

export default function WaitSpinDocsPage() {
  return (
    <>
      <script src="/waitspin/webmcp-origin-trial.js" async />
      <WaitSpinWebMcpRegistry />
      <WaitSpinLegalPage
        title="WaitSpin API And Agent Docs"
        description="This is the public contract for implemented WaitSpin routes and guarded release-candidate surfaces. It intentionally excludes launch-blocked capabilities."
      >
        <Section title="Base URLs And Auth">
        <p>
          Public API host: <code>https://api.waitspin.com</code>. API discovery
          is available at <code>https://api.waitspin.com/v1</code>. Public
          launch host: <code>https://waitspin.com</code>. Authenticated routes use{" "}
          <code>Authorization: Bearer wts_live_...</code>. Campaign creation
          also requires an <code>Idempotency-Key</code> UUID.
        </p>
        <p>
          The canonical REST API contract is OpenAPI-backed:{" "}
          <Link
            className="underline"
            href="/openapi/waitspin-api.openapi.json"
          >
            /openapi/waitspin-api.openapi.json
          </Link>
          . Code routes and public docs must stay in parity with that spec.
        </p>
        <p>
          Agent markdown is available at{" "}
          <code>https://waitspin.com/.well-known/agents.md</code> and{" "}
          <code>https://waitspin.com/waitspin/agents.md</code>. It is scoped to
          the shipped route allowlist, including verified publisher targets,
          and excludes deferred launch claims.
        </p>
        <p>
          Public client source and trust-boundary docs are published at{" "}
          <a className="underline" href="https://github.com/citedy/waitspin">
            github.com/citedy/waitspin
          </a>{" "}
          and summarized at{" "}
          <Link className="underline" href="/waitspin/trust">
            /waitspin/trust
          </Link>
          .
        </p>
        <p>
          VS Code Marketplace provenance is published as JSON at{" "}
          <Link className="underline" href="/provenance/waitspin-vscode.json">
            /provenance/waitspin-vscode.json
          </Link>
          . It records the public source repository, extension version,
          release source commit, Marketplace URL, npm package version, VSIX
          filename, and VSIX SHA256 without committing the VSIX binary.
        </p>
        <p>
          Authenticated routes are API-key rate limited at <code>60/min</code>
          and count against monthly API-call quota except publisher
          serve/impression polling. <code>GET /v1/market</code> is IP limited at{" "}
          <code>60/min</code>.
        </p>
        <p>
          Use control keys for advertiser, Connect, and payout commands. Use
          publisher-extension keys only for extension registration, serve
          polling, impression events, and read-only wallet visibility.
        </p>
        </Section>

        <Section title="Implemented Routes And Guarded Surfaces">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-semibold text-foreground">
                  Method
                </th>
                <th className="py-2 pr-4 font-semibold text-foreground">
                  Path
                </th>
                <th className="py-2 pr-4 font-semibold text-foreground">
                  Auth
                </th>
                <th className="py-2 font-semibold text-foreground">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map(([method, path, auth, purpose]) => (
                <tr key={`${method}:${path}`} className="border-b">
                  <td className="py-2 pr-4 font-mono">{method}</td>
                  <td className="py-2 pr-4 font-mono">{path}</td>
                  <td className="py-2 pr-4">{auth}</td>
                  <td className="py-2">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Section>

        <Section title="Request And Response Shapes">
        <pre className="overflow-x-auto border bg-muted/40 p-4 text-xs leading-6">
          {routeShapes}
        </pre>
        <p>
          <code>POST /v1/campaigns</code> idempotency keys expire after 24
          hours. Reusing a key with the same payload replays the stored
          response; reusing it with a different payload returns a conflict
          response (<code>409</code>).
        </p>
        <p>
          Public publisher targets are <code>status-bar-fallback</code>,
          installed by <code>waitspin extension install --target vscode</code>,{" "}
          <code>claude-code</code>, installed by{" "}
          <code>waitspin claude-code install --compose-existing</code>,{" "}
          <code>mimocode</code>, installed by{" "}
          <code>waitspin mimocode install</code>, and <code>opencode</code>,
          installed by <code>waitspin opencode install</code>, and{" "}
          <code>grok</code>, installed by <code>waitspin grok install</code>.
          Claude Code support uses the official <code>statusLine.command</code>{" "}
          path; MiMo Code uses a managed shell hook; OpenCode uses a managed
          TUI plugin entry; Grok Code CLI uses a managed text-asset footer patch
          with hash-backed restore. Cline VS Code extension installs are
          covered by <code>waitspin extension install --target vscode</code>;
          standalone Cline CLI awaits official statusline/plugin support.
          Native spinner patch targets remain deferred.
        </p>
        </Section>

        <Section title="Legal And Payment Disclosures">
        <p>
          Review the{" "}
          <Link className="underline" href="/waitspin/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline" href="/waitspin/privacy">
            Privacy
          </Link>{" "}
          notices before install, Checkout, or publisher registration. Unused
          prepaid block handling is support-reviewed; no automated
          account-credit balance, redemption flow, or self-serve cash refund
          request flow is shipped.
        </p>
      </Section>

      <Section title="Agent Quick Start">
        <pre className="overflow-x-auto border bg-muted/40 p-4 text-xs leading-6">
          {`# Verify the published package before using this as release evidence.
npm view waitspin version
npx --yes waitspin init --email you@example.com --key-profile control
export WAITSPIN_API_KEY=PASTE_CONTROL_KEY
waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1
waitspin bid checkout CAMPAIGN_ID
npx --yes waitspin init --email you@example.com --key-profile publisher-extension

# Advanced agent install for detected supported targets
waitspin install --all --dry-run --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin install --all --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin status --all

# VS Code publisher extension
waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin extension status --target vscode

# Claude Code statusline
waitspin claude-code install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing
waitspin claude-code status

# MiMo Code shell hook
waitspin mimocode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin mimocode status

# OpenCode TUI plugin slot
waitspin opencode install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin opencode status

# Grok Code CLI footer
waitspin grok install --api-key PASTE_PUBLISHER_EXTENSION_KEY
waitspin grok status`}
        </pre>
        <p>
          Explicit target commands remain the canonical debug path.{" "}
          <code>waitspin install --all</code> is an advanced agent command that
          installs only detected supported targets and reports structured
          <code>installed</code>, <code>would_install</code>,{" "}
          <code>skipped_not_detected</code>, <code>skipped_conflict</code>, and{" "}
          <code>failed_rollback</code> arrays. Use a publisher-extension key for
          polling/events. The VS Code extension migrates configured API keys
          into VS Code SecretStorage on activation; the Claude Code installer
          stores managed runtime state under <code>~/.waitspin</code> and does
          not write the key into Claude settings.
        </p>
        <p>
          Publisher-extension keys are valid only for publisher registration,
          serve polling, impression events, and read-only wallet status/ledger.
          They cannot create campaigns, start Checkout, manage Connect, or
          execute payouts.
        </p>
      </Section>

      <Section title="Response And Error Contract">
        <p>
          Successful JSON responses include route-specific fields and no cache
          storage for authenticated control routes. Empty inventory returns{" "}
          <code>204 No Content</code>. Client errors use standard HTTP status
          codes such as <code>400</code>, <code>401</code>, <code>403</code>,{" "}
          <code>409</code>, <code>422</code>, and <code>429</code> with a JSON
          error body; rate limits may include <code>Retry-After</code>.
        </p>
        <p>
          Billed impression delivery uses a 60% publisher share and 40%
          platform share. Stripe processing fees are absorbed from the platform
          share unless the payment policy changes.
        </p>
      </Section>

      <Section title="Not In The Public Contract Yet">
        <p>
          Native spinner patches beyond supported status surfaces, click
          billing, account-credit redemption, cash refund self-service, live
          payout transfers without explicit operator flags and deployed
          evidence, geo targeting, and house ads are withheld from the public
          contract until implementation and launch evidence are complete.
        </p>
      </Section>

      <Section title="Legal And Security">
        <p>
          WaitSpin uses hashed API-key storage, host isolation, trusted-edge
          checks, rate limits, and audit logging. Keep API keys secret and do
          not commit VS Code, Claude Code, or environment files containing
          credentials.
        </p>
        </Section>
      </WaitSpinLegalPage>
    </>
  );
}
