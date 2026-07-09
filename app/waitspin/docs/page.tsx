import type { Metadata } from "next";
import Link from "next/link";

import { WaitSpinWebMcpRegistry } from "@/app/waitspin/WaitSpinWebMcpRegistry";
import { Section, WaitSpinLegalPage } from "../legal-content";
import {
  WTS_VSCODE_MARKETPLACE_STATUS,
  WTS_VSCODE_MARKETPLACE_STATUS_PATH,
  WTS_VSCODE_OPEN_VSX_STATUS,
  WTS_VSCODE_OPEN_VSX_STATUS_PATH,
  waitSpinVscodeMarketplaceVersionLabel,
  waitSpinVscodeOpenVsxStateLabel,
  waitSpinVscodeOpenVsxVersionLabel,
} from "@/lib/waitspin/vscode-marketplace-status";
import { WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY } from "@/lib/waitspin/public-publisher-policy-copy";

const docsUrl = "https://waitspin.com/docs";
const publisherPolicyCopy = WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY;
const vscodeMarketplaceUrl =
  "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode";
const openVsxMarketplaceUrl =
  "https://open-vsx.org/extension/waitspin/waitspin-vscode";

export const metadata: Metadata = {
  metadataBase: new URL("https://waitspin.com"),
  title: "WaitSpin API And Agent Docs",
  description:
    "Current public WaitSpin API and agent contract for shipped routes, headers, scopes, and verified user earning surfaces.",
  alternates: { canonical: docsUrl },
};

export const dynamic = "force-dynamic";

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
  [
    "POST",
    "/v1/list/subscribe",
    "none",
    "Request double opt-in publisher or founding advertiser email updates.",
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
    "/v1/blocks/mpp-crypto",
    "blocks:purchase or verified MPP credential",
    "Create or reuse a Stripe/Tempo stablecoin MPP payment challenge for a pending block purchase.",
  ],
  [
    "POST",
    "/v1/publishers/register",
    "publishers:write",
    "Register a user install ID for a supported earning surface.",
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
    "Read user balance, payout eligibility, and Connect status.",
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
    "Read user delivery, refund-reversal, and dispute-hold delivery-ledger rows.",
  ],
  [
    "POST",
    "/v1/wallet/payouts",
    "connect:manage",
    "Preview or execute a guarded idempotent user payout.",
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
control key response: { "account_id": "wacc_...", "api_key": "wts_live_...", "scopes": ["campaigns:write","campaigns:read","blocks:purchase","serve:read","events:write","wallet:read","connect:manage","analytics:read","publishers:write"], "trust_level": "email_verified" }
extension key response: { "account_id": "wacc_...", "api_key": "wts_live_...", "scopes": ["publishers:write","serve:read","events:write","wallet:read"], "trust_level": "email_verified" }

POST /v1/list/subscribe
request:  { "email": "you@example.com", "segment": "publisher" | "advertiser", "source": "landing_hero", "turnstileToken": "optional", "company": "" }
response: { "ok": true, "already_subscribed": false, "expires_in_seconds": 86400, "delivery": "email" }
note: /list/confirm and /list/unsubscribe are email/browser-link routes, not API-key routes.

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

POST /v1/blocks/mpp-crypto
request:  { "campaign_id": "wcamp_...", "block_purchase_id": "wblk_..." }
unpaid:   402 Payment Required with WWW-Authenticate: Payment ... method="tempo"
pending:  { "ok": false, "status": "payment_pending", "block_purchase_id": "wblk_...", "stripe_payment_intent_id": "pi_...", "stripe_status": "processing" }
response: { "ok": true, "status": "activated", "block_purchase_id": "wblk_...", "campaign_id": "wcamp_...", "stripe_payment_intent_id": "pi_...", "activated_blocks": 1, "payment_receipt": "..." }
retry:    { "ok": true, "status": "activated", "block_purchase_id": "wblk_...", "campaign_id": "wcamp_...", "stripe_payment_intent_id": "pi_...", "activated_blocks": 1, "payment_receipt": null, "idempotent": true }

POST /v1/publishers/register
request:  { "install_id": "wins_...", "target": "status-bar-fallback" | "claude-code" | "antigravity" | "copilot" | "mimocode" | "opencode" | "grok" | "qoder" }
response: { "publisher_id": "wpub_...", "install_id": "wins_...", "target": "status-bar-fallback" | "claude-code" | "antigravity" | "copilot" | "mimocode" | "opencode" | "grok" | "qoder" }

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
        description="This is the public contract for implemented WaitSpin routes, Stripe Checkout and crypto MPP block purchases, verified user earning surfaces, and guarded publisher money surfaces."
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
          the shipped route allowlist, including Stripe Checkout, crypto MPP
          block purchases, verified user surfaces, and guarded publisher money
          surfaces.
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
          The live Marketplace status is published at{" "}
          <Link
            className="underline"
            href={WTS_VSCODE_MARKETPLACE_STATUS_PATH}
          >
            {WTS_VSCODE_MARKETPLACE_STATUS_PATH}
          </Link>
          .
        </p>
        <p>
          Authenticated routes are API-key rate limited at <code>60/min</code>
          and count against monthly API-call quota except extension
          serve/impression polling. <code>GET /v1/market</code> is IP limited at{" "}
          <code>60/min</code>.
        </p>
        <p>
          Use control keys for advertiser, Connect, and payout commands.
          Extension keys created with the <code>publisher-extension</code>{" "}
          profile are scoped to user install registration, serve polling,
          impression events, and read-only wallet visibility.
        </p>
        </Section>

        <Section
          id="publisher-wallet-and-payouts"
          title="User Wallet And Payouts"
        >
          <p>
            A connected VS Code user install means WaitSpin can serve
            sponsored cards and report wallet visibility. Payout readiness is a
            separate money state: earnings must mature, the available balance
            must reach the minimum payout, and a Stripe Express payout account
            must be set up before withdrawals.
          </p>
          <p>
            Fresh impression earnings first appear as{" "}
            <strong>maturing</strong>. They are recorded in the ledger, but
            they are not withdrawable until the public maturity window
            completes. Matured earnings move into <strong>available</strong>.
            Payouts are eligible only when the available balance reaches the
            minimum payout threshold shown by the wallet policy.
          </p>
          <p>
            <strong>Payout account not set up</strong> refers to Stripe Express
            payout onboarding, not the VS Code plugin connection. The extension
            uses an extension API key for read-only wallet visibility and
            sponsor polling; payout account setup uses guarded Connect/payment
            routes and a control key.
          </p>
          <p>
            Primary setup path: open{" "}
            <a href="/wallet/connect">Set up payout account</a>, verify your
            WaitSpin account email, choose the payout country, and
            continue to Stripe Express. The browser flow creates the Stripe
            onboarding link server-side; it does not expose a reusable control
            API key to the page.
          </p>
          <p>
            WaitSpin creates Stripe Express payout accounts with the transfers
            capability. Users receive payouts from WaitSpin; they must not be
            enabled to accept customer payments through the WaitSpin platform
            account. WaitSpin does not force a Stripe service-agreement type in
            API calls; Stripe applies the agreement required for the
            platform/country pairing.
          </p>
          <p>
            Direct Stripe payments-balance top-ups can be unavailable when
            Stripe has not approved the platform profile for that top-up path or
            when top-ups in the selected currency are unavailable. In that case,
            live payout smoke can use eligible advertiser Checkout proceeds once
            the funds are available in Stripe; do not treat a disabled top-up
            button as a WaitSpin wallet-code failure.
          </p>
          <p>
            Advanced automation path: run{" "}
            <code>waitspin wallet connect --country US</code> with a control
            key, then open the Stripe Express onboarding URL it returns.
            Extension keys cannot create payout accounts because they are
            intentionally limited to user install registration, serve polling,
            impression events, and read-only wallet views.
          </p>
          <p>
            Stable wallet blockers such as <code>earnings_maturing</code>,{" "}
            <code>balance_below_minimum</code>, and{" "}
            <code>connect_account_missing</code> are backend decision codes.
            User surfaces should translate them into readable payout guidance
            while keeping the API codes available for diagnostics.
          </p>
        </Section>

        <Section
          id="publisher-levels-and-limits"
          title="User Levels And Limits"
        >
          <p>
            User level controls how much paid inventory one user account or
            install can receive while the account warms up. A fresh eligible
            user starts at{" "}
            <strong>level {publisherPolicyCopy.trustMinLevelLabel}</strong> and
            can receive paid sponsored cards immediately when eligible campaigns
            are available. There is no manual trusted/not-trusted switch for
            normal public VS Code user installs.
          </p>
          <p>
            Level can rise by 1 after each clean{" "}
            {publisherPolicyCopy.trustCleanPeriodShort} period of billable
            activity, up to level {publisherPolicyCopy.trustMaxLevelLabel}. Risk
            signals such as refund/dispute pressure, invalid impression
            receipts, velocity limits, or cap pressure can reduce the effective
            level or pause paid supply for review.
          </p>
          <p>
            Daily exposure limits are level-based. At level{" "}
            {publisherPolicyCopy.trustMinLevel}, one user account can receive up
            to {publisherPolicyCopy.minLevelPublisherCampaignCapPercent} of a
            campaign&apos;s effective daily prepaid inventory, and one install
            can receive up to{" "}
            {publisherPolicyCopy.minLevelInstallCampaignCapPercent} of that
            campaign per day. At level {publisherPolicyCopy.trustMaxLevel},
            those caps rise to{" "}
            {publisherPolicyCopy.maxLevelPublisherCampaignCapPercent} and{" "}
            {publisherPolicyCopy.maxLevelInstallCampaignCapPercent}. A separate
            separate global daily user revenue cap also scales with level.
          </p>
          <p>
            <code>204 No Content</code> or a VS Code "no eligible sponsor" state
            does not mean the plugin is disconnected. It can mean there are no
            active eligible campaigns, self-owned campaigns were excluded,
            inventory is exhausted, or this install reached its daily exposure
            limit for the currently available campaigns.
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
          Public user earning targets are <code>status-bar-fallback</code>,
          installed from{" "}
          <Link className="underline" href={vscodeMarketplaceUrl}>
            VS Code Marketplace
          </Link>{" "}
          in VS Code with{" "}
          <code>code --install-extension waitspin.waitspin-vscode</code> or in
          Cursor Editor Mode with{" "}
          <code>cursor --install-extension waitspin.waitspin-vscode --force</code>,
          or from{" "}
          <Link className="underline" href={openVsxMarketplaceUrl}>
            Open VSX
          </Link>{" "}
          in Devin Desktop with{" "}
          <code>devin-desktop --install-extension waitspin.waitspin-vscode --force</code>,
          while the WaitSpin lifecycle command auto-detects{" "}
          <code>%LOCALAPPDATA%\devin\bin\devin.exe</code> on Windows,
          then connected inside that editor with{" "}
          <code>WaitSpin: Connect and earn</code>,{" "}
          <code>claude-code</code>, installed by{" "}
          <code>waitspin claude-code install --compose-existing</code>,{" "}
          <code>antigravity</code>, installed by{" "}
          <code>waitspin antigravity install --compose-existing</code>,{" "}
          <code>copilot</code>, installed by{" "}
          <code>waitspin copilot install --compose-existing</code>,{" "}
          <code>mimocode</code>, installed by{" "}
          <code>waitspin mimocode install</code>, and <code>opencode</code>,
          installed by <code>waitspin opencode install</code>, and{" "}
          <code>grok</code>, installed by <code>waitspin grok install</code>,
          and <code>qoder</code>, installed by{" "}
          <code>waitspin qoder install</code>.
          Claude Code, Antigravity CLI, and GitHub Copilot CLI support use
          first-class <code>statusLine.command</code> paths; MiMo Code uses a
          managed shell hook; OpenCode uses a managed TUI plugin entry; Grok
          Code CLI uses a managed text-asset footer patch with hash-backed
          restore; Qoder CLI uses the official <code>UserPromptSubmit</code>{" "}
          hook with <code>statusMessage</code>/<code>systemMessage</code> plus
          the official <code>Stop</code> hook for the later visibility callback.
          Cursor Editor Mode, Devin Desktop, and Cline VS Code
          extension installs are covered by the WaitSpin VS Code-compatible
          extension; Devin uses the Open VSX listing while standalone Cline CLI
          remains outside the public install contract. Other native spinner
          patch targets remain deferred until official statusline/plugin support
          exists.
        </p>
        <p>
          Cursor and Devin Desktop are also first-class local CLI lifecycle
          targets: <code>waitspin extension install --target cursor</code>,{" "}
          <code>waitspin extension status --target cursor</code>,{" "}
          <code>waitspin extension uninstall --target cursor</code>,{" "}
          <code>waitspin extension install --target devin</code>,{" "}
          <code>waitspin extension status --target devin</code>, and{" "}
          <code>waitspin extension uninstall --target devin</code>. These local
          labels still map to <code>status-bar-fallback</code>; they are not API
          targets.
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
          notices before install, Checkout, or user install registration. Unused
          prepaid block handling is support-reviewed; no automated
          account-credit balance, redemption flow, or self-serve cash refund
          request flow is shipped.
        </p>
      </Section>

      <Section title="VS Code, Cursor, And Devin User Setup">
        <p>
          The first-class VS Code, Cursor Editor Mode, and Devin Desktop user
          path is the{" "}
          <Link className="underline" href={vscodeMarketplaceUrl}>
            WaitSpin VS Code Marketplace extension
          </Link>
          . Install it in VS Code with{" "}
          <code>code --install-extension waitspin.waitspin-vscode</code> or in
          Cursor with{" "}
          <code>cursor --install-extension waitspin.waitspin-vscode --force</code>,
          or install the same extension ID from{" "}
          <Link className="underline" href={openVsxMarketplaceUrl}>
            Open VSX
          </Link>{" "}
          in Devin Desktop with{" "}
          <code>devin-desktop --install-extension waitspin.waitspin-vscode --force</code>,
          then run <code>WaitSpin: Connect and earn</code> inside the matching
          editor.
        </p>
        <p>
          Latest VS Code Marketplace extension for VS Code and Cursor:{" "}
          <code>
            {waitSpinVscodeMarketplaceVersionLabel(
              WTS_VSCODE_MARKETPLACE_STATUS,
            )}
          </code>
          .
        </p>
        <p>
          Latest Open VSX extension for Devin Desktop:{" "}
          <code>
            {waitSpinVscodeOpenVsxVersionLabel(WTS_VSCODE_OPEN_VSX_STATUS)}
          </code>
          . State:{" "}
          <code>
            {waitSpinVscodeOpenVsxStateLabel(WTS_VSCODE_OPEN_VSX_STATUS)}
          </code>
          . Status artifact:{" "}
          <Link
            className="underline"
            href={WTS_VSCODE_OPEN_VSX_STATUS_PATH}
          >
            {WTS_VSCODE_OPEN_VSX_STATUS_PATH}
          </Link>
          .
        </p>
        <p>
          The extension requests or accepts an extension API key, registers
          the VS Code-compatible install through{" "}
          <code>POST /v1/publishers/register</code>, stores the key in VS Code
          SecretStorage, and starts wallet/sponsor polling against{" "}
          <code>https://api.waitspin.com</code>. Cursor and Devin Desktop use
          the same SecretStorage-backed extension path; there is no separate
          Cursor or Devin API target or WaitSpin package.
        </p>
        <p>
          CLI setup remains an advanced local lifecycle path:{" "}
          <code>
            waitspin extension install --target vscode --api-key
            KEY_FROM_JSON
          </code>
          , <code>waitspin extension install --target cursor</code>, or{" "}
          <code>waitspin extension install --target devin</code>. Cursor and
          Devin installation does not put an API key in editor argv or settings;
          finish activation with <code>WaitSpin: Connect and earn</code>.
        </p>
      </Section>

      <Section title="Product / Agent Quick Start">
        <p>
          Python/Go agents should call{" "}
          <code>npx --yes waitspin ... --json</code> and parse stdout; no native
          SDK is required.
        </p>
        <pre className="overflow-x-auto border bg-muted/40 p-4 text-xs leading-6">
          {`# Credential-free agent demo path.
npm view waitspin version
export WAITSPIN_API_KEY=wts_demo_agent_quickstart
npx --yes waitspin market --demo --json
npx --yes waitspin bid create --demo --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1 --json
npx --yes waitspin bid checkout demo_campaign_001 --demo --json
npx --yes waitspin status --all --demo --json
# Done: every command returns ok=true, mode=demo, and stable demo IDs.

# Authenticated advertiser/publisher path.
npx skills add citedy/waitspin
npm view waitspin version
npx --yes waitspin init --email you@example.com --key-profile control
export WAITSPIN_API_KEY=KEY_FROM_JSON
waitspin bid create --line "Your ad" --url https://example.com --price-per-block 500 --blocks 1
waitspin bid checkout CAMPAIGN_ID
npx --yes waitspin init --email you@example.com --key-profile publisher-extension

# Advanced agent install for detected supported targets
waitspin install --all --dry-run --api-key KEY_FROM_JSON --compose-existing
waitspin install --all --api-key KEY_FROM_JSON --compose-existing
waitspin status --all

# VS Code user extension
# Marketplace: ${vscodeMarketplaceUrl}
code --install-extension waitspin.waitspin-vscode

# Cursor Editor Mode user extension
cursor --install-extension waitspin.waitspin-vscode --force
waitspin extension install --target cursor
waitspin extension status --target cursor
waitspin extension uninstall --target cursor

# Devin Desktop user extension
# Open VSX: ${openVsxMarketplaceUrl}
devin-desktop --install-extension waitspin.waitspin-vscode --force
waitspin extension install --target devin
waitspin extension status --target devin
waitspin extension uninstall --target devin
# Then run "WaitSpin: Connect and earn" in the matching editor.

# VS Code CLI fallback:
waitspin extension install --target vscode --api-key KEY_FROM_JSON
waitspin extension status --target vscode

# Claude Code statusline
waitspin claude-code install --api-key KEY_FROM_JSON --compose-existing
waitspin claude-code status

# Antigravity CLI statusline
waitspin antigravity install --api-key KEY_FROM_JSON --compose-existing
waitspin antigravity status

# GitHub Copilot CLI statusline
waitspin copilot install --api-key KEY_FROM_JSON --compose-existing
waitspin copilot status

# MiMo Code shell hook
waitspin mimocode install --api-key KEY_FROM_JSON
waitspin mimocode status

# OpenCode TUI plugin slot
waitspin opencode install --api-key KEY_FROM_JSON
waitspin opencode status

# Grok Code CLI footer
waitspin grok install --api-key KEY_FROM_JSON
waitspin grok status

# Qoder CLI UserPromptSubmit/Stop hooks
waitspin qoder install --api-key KEY_FROM_JSON
waitspin qoder status`}
        </pre>
        <p>
          The credential-free path is complete when{" "}
          <code>waitspin market --demo --json</code> returns{" "}
          <code>ok=true</code>, <code>mode=demo</code>, and stable demo IDs
          without creating an account, campaign, Stripe Checkout, install, or
          billable impression. The authenticated path is complete when the CLI
          returns the created campaign or install ID, and the matching{" "}
          <code>waitspin bids list</code> or <code>waitspin status --all</code>{" "}
          command can read that state back.
        </p>
        <p>
          Explicit target commands remain the canonical debug path.{" "}
          <code>waitspin install --all</code> is an advanced agent command that
          installs only detected supported targets and reports structured
          <code>installed</code>, <code>would_install</code>,{" "}
          <code>skipped_not_detected</code>, <code>skipped_conflict</code>, and{" "}
          <code>failed_rollback</code> arrays. Use an extension API key for
          polling/events. The VS Code extension can connect a user install inside
          VS Code and stores keys in SecretStorage; the Claude Code,
          Antigravity CLI, and GitHub Copilot CLI installers store managed
          runtime state under <code>~/.waitspin</code>, preserve existing status
          lines with <code>--compose-existing</code>, and do not patch native
          binaries. Qoder CLI stores a managed hook runtime under{" "}
          <code>~/.waitspin</code> and configures Qoder&apos;s official{" "}
          <code>UserPromptSubmit</code>/<code>Stop</code> hooks without
          patching native binaries.
        </p>
        <p>
          Extension keys created with the <code>publisher-extension</code>{" "}
          profile are valid only for user install registration, serve polling,
          impression events, and read-only wallet status/ledger.
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
          Billed impression delivery uses a 60% user share and 40%
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
          not commit VS Code, Claude Code, Qoder, or environment files
          containing credentials.
        </p>
        </Section>
      </WaitSpinLegalPage>
    </>
  );
}
