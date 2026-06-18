import type { Metadata } from "next";
import Link from "next/link";

import {
  formatPlatformRevenueSharePercentWords,
  formatPublisherRevenueSharePercentWords,
} from "@/lib/waitspin/billing";

import { Section, WaitSpinLegalPage } from "../legal-content";

const publisherShareWords = formatPublisherRevenueSharePercentWords();
const platformShareWords = formatPlatformRevenueSharePercentWords();

export const metadata: Metadata = {
  title: "WaitSpin Terms",
  description:
    "Current product terms for WaitSpin accounts, advertiser blocks, publisher installs, fraud controls, refunds, credits, and security.",
};

export default function WaitSpinTermsPage() {
  return (
    <WaitSpinLegalPage
      title="WaitSpin Terms"
      description="These terms describe the current WaitSpin product contract and the disclosures for the public paid marketplace surface."
    >
      <Section title="Service Scope">
        <p>
          WaitSpin is an independent ad marketplace for sponsored messages in
          verified developer wait-state surfaces. The current public contract is
          API-first and documents the verified VS Code Activity Bar/status-bar extension,
          Claude Code statusline command, MiMo Code shell hook, OpenCode TUI
          plugin slot, and install-all orchestration for detected supported
          targets. Native spinner patches, account-credit redemption, self-serve
          cash refunds, and ungated live payout promises are not public
          paid-launch capabilities. Guarded wallet, ledger, Connect, and payout
          commands remain policy-gated before any live payout execution.
        </p>
      </Section>

      <Section title="Accounts And API Keys">
        <p>
          Accounts are created through email verification. API keys are bearer
          credentials and must be kept secret, rotated when exposed, and used
          only with scopes granted to the account. We may reject temporary email
          providers, rate-limit requests, revoke keys, suspend accounts, or
          disable serving when abuse, security risk, quota evasion, or legal
          compliance requires it.
        </p>
      </Section>

      <Section title="Advertiser Blocks">
        <p>
          Advertisers create campaign drafts with a short ad line, an HTTPS
          destination URL, block count, and price per block. Destinations are
          validated to reduce SSRF and unsafe URL risk, but advertisers remain
          responsible for destination content, claims, tracking, and legal
          compliance. WaitSpin does not guarantee impressions, conversions,
          ranking, traffic quality, or continuous availability.
        </p>
      </Section>

      <Section title="Refunds, Credits, And Disputes">
        <p>
          Unused prepaid block outcomes are handled only through support review
          until a visible credit ledger and redemption flow are shipped. The
          automated account-credit balance, redemption flow, and cash refund
          request flow are public-launch blockers and are not available as
          self-serve features yet. Stripe refunds or disputes may pause future
          delivery and may reverse or hold unpaid publisher balances tied to
          affected delivery.
        </p>
      </Section>

      <Section title="Publishers And Revenue Split">
        <p>
          The current revenue model uses a {publisherShareWords} publisher share and a{" "}
          {platformShareWords} platform share on billed impression delivery. Stripe
          processing fees are absorbed from the platform share unless the
          payment policy changes. Wallet, ledger, Stripe Connect onboarding,
          payout dry-run, guarded payout execution, minimum payout, and cadence
          controls are release-candidate surfaces. Public payout promises and
          live transfers remain gated until deployed E2E, legal approval,
          minimum/cadence policy approval, Stripe test-transfer proof, and
          explicit operator flags are complete.
        </p>
      </Section>

      <Section title="Fraud And Invalid Traffic">
        <p>
          Billable impressions require the server-side minimum visibility window
          and an active publisher install, but public paid traffic also requires
          fraud controls, scoped publisher credentials, alerting, and drill
          evidence. We may void, reverse, hold, or refuse payment for scripted
          traffic, self-dealing, false visibility, unauthorized extensions,
          rate-limit evasion, bot traffic, or other invalid activity.
        </p>
      </Section>

      <Section title="Security And Non-Affiliation">
        <p>
          WaitSpin uses host isolation, trusted-edge checks, rate limits, hashed
          API keys, and audit logging. You must not bypass security controls,
          probe unauthorized routes, or publish credentials. WaitSpin is not
          affiliated with Anthropic, OpenAI, Microsoft, Visual Studio Code,
          Stripe, or any IDE vendor unless a separate written agreement says so.
        </p>
      </Section>

      <Section title="Support And Current Docs">
        <p>
          Current public API and agent docs are available at{" "}
          <Link className="underline" href="/docs">
            /docs
          </Link>
          . Product and billing questions should go through WaitSpin support
          once the product-specific support intake is published.
        </p>
      </Section>
    </WaitSpinLegalPage>
  );
}
