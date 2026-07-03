import type { Metadata } from "next";
import Link from "next/link";

import {
  formatPlatformRevenueSharePercentWords,
  formatPublisherRevenueSharePercentWords,
  formatWaitSpinCurrencyCents,
} from "@/lib/waitspin/billing";
import {
  WTS_MIN_PAYOUT_CENTS,
  WTS_PAYOUT_CADENCE_DAYS,
} from "@/lib/waitspin/constants";
import { WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY } from "@/lib/waitspin/public-publisher-policy-copy";

import { Section, WaitSpinLegalPage } from "../legal-content";
import { WalletTermsExplainer } from "./WalletTermsExplainer";

const publisherShareWords = formatPublisherRevenueSharePercentWords();
const platformShareWords = formatPlatformRevenueSharePercentWords();
const publisherPolicyCopy = WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY;
const minPayoutLabel = formatWaitSpinCurrencyCents(WTS_MIN_PAYOUT_CENTS);

export const metadata: Metadata = {
  title: "WaitSpin Terms",
  description:
    "Current product terms for WaitSpin accounts, advertiser blocks, user installs, fraud controls, refunds, credits, and security.",
};

export const dynamic = "force-dynamic";

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
          API-first and documents the verified VS Code Activity Bar/status-bar
          extension, Claude Code statusline command, Antigravity CLI
          statusline command, GitHub Copilot CLI statusline command, MiMo Code
          shell hook, OpenCode TUI plugin slot, Grok Code CLI integration,
          Qoder CLI UserPromptSubmit/Stop hooks, and install-all orchestration for
          detected supported targets. Advertiser block purchases can be paid
          through Stripe Checkout or the crypto MPP API rail backed by
          Stripe/Tempo stablecoin payment. Wallet visibility, ledger history,{" "}
          <Link className="underline" href="/wallet/connect">
            Stripe Connect onboarding
          </Link>
          , payout dry-run, and guarded payout execution are documented public
          publisher money surfaces in these terms and in{" "}
          <Link className="underline" href="/docs">
            /docs
          </Link>
          . MPP is an advertiser pay-in rail only: WaitSpin does not custody
          crypto, store private keys, collect raw wallet destinations, or offer
          direct cryptocurrency publisher withdrawals in the current EU product.
          Live transfers execute only when payout policy eligibility checks
          pass; WaitSpin does not guarantee that any balance is immediately
          withdrawable. Advertiser block purchases support Stripe Checkout and
          the production Stripe/Tempo stablecoin MPP pay-in rail. Native spinner
          patches, account-credit redemption, and self-serve cash refunds are
          not available yet.
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
          destination URL, block count, and price per block. Blocks activate
          only after the relevant Stripe payment is confirmed: Checkout through
          the existing Checkout/webhook path, or crypto MPP after the MPP
          credential verifies and Stripe reports the crypto PaymentIntent as
          succeeded. Destinations are validated to reduce SSRF and unsafe URL
          risk, but advertisers remain responsible for all advertising text,
          promoted names, brands, destination links, destination content,
          claims, tracking, and legal compliance. Illegal, abusive, deceptive,
          infringing, or prohibited promotion may result in{" "}
          <span>
            permanent account blocking without restoration or refund
          </span>
          , and WaitSpin may disclose available account, campaign, payment,
          network, and audit data to law enforcement when required or
          appropriate. WaitSpin does not guarantee impressions, conversions,
          ranking, traffic quality, or continuous availability.
        </p>
      </Section>

      <Section title="Payment Rails And Stablecoin Boundary">
        <p>
          Advertiser block purchases can be paid through Stripe Checkout or
          through the production Stripe/Tempo stablecoin MPP endpoint at{" "}
          <code>/v1/blocks/mpp-crypto</code>. The stablecoin MPP rail is an
          inbound pay-in rail only: WaitSpin verifies the MPP credential,
          verifies the bound Stripe PaymentIntent reached{" "}
          <code>succeeded</code>, and then activates blocks through the
          canonical block purchase path. WaitSpin does not provide crypto
          payouts, hold customer crypto, store raw wallet addresses or private
          keys, or operate a treasury crypto balance.
        </p>
        <p>
          Publisher payouts remain standard fiat payouts through
          Stripe-managed methods, including bank payouts, SEPA, or Instant
          Payouts where available and allowed by payout policy. WaitSpin does
          not offer direct EU crypto publisher payouts.
        </p>
      </Section>

      <Section title="Refunds, Credits, And Disputes">
        <p>
          Unused prepaid block outcomes are handled only through support review
          until a visible credit ledger and redemption flow are shipped. The
          automated account-credit balance, redemption flow, and cash refund
          request flow are public-launch blockers and are not available as
          self-serve features yet. Stripe refunds or disputes may pause future
          delivery and may reverse or hold unpaid user balances tied to
          affected delivery. Crypto MPP pay-ins are processed by Stripe/Tempo;
          any supported refund, dispute, or reversal path is handled through
          the Stripe-managed payment rail rather than a WaitSpin wallet or
          direct crypto custody flow.
        </p>
      </Section>

      <Section title="Users And Revenue Split">
        <p>
          The current revenue model uses a {publisherShareWords} user share and a{" "}
          {platformShareWords} platform share on billed impression delivery. Stripe
          processing fees are absorbed from the platform share unless the
          payment policy changes. Wallet balance, ledger entries,{" "}
          <Link className="underline" href="/wallet/connect">
            Stripe Connect onboarding
          </Link>
          , payout dry-run, and guarded fiat payout execution are the
          documented publisher money surfaces. Publisher payouts do not use the
          crypto MPP block purchase rail.
        </p>
        <WalletTermsExplainer
          maturityHours={publisherPolicyCopy.earningMaturityHours}
          maturityWindow={publisherPolicyCopy.earningMaturityWindowWords}
          minPayoutLabel={minPayoutLabel}
          payoutCadenceDays={WTS_PAYOUT_CADENCE_DAYS}
          publisherShareWords={publisherShareWords}
          trustMaxLevelLabel={publisherPolicyCopy.trustMaxLevelLabel}
          trustMinLevelLabel={publisherPolicyCopy.trustMinLevelLabel}
        />
        <p>
          New eligible publisher accounts start at{" "}
          <strong>trust level {publisherPolicyCopy.trustMinLevelLabel}</strong>{" "}
          and can receive paid sponsored inventory immediately when campaigns
          are available. Each clean {publisherPolicyCopy.trustCleanPeriodWords}{" "}
          period of billable activity can raise the level by 1, up to{" "}
          <strong>level {publisherPolicyCopy.trustMaxLevelLabel}</strong>. While
          the account is warming up, daily exposure limits scale with level: at
          level {publisherPolicyCopy.trustMinLevel}, one account can receive up to{" "}
          {publisherPolicyCopy.minLevelPublisherCampaignCapPercent}{" "}
          of a
          campaign&apos;s effective daily inventory and one install up to{" "}
          {publisherPolicyCopy.minLevelInstallCampaignCapPercent}; at level{" "}
          {publisherPolicyCopy.trustMaxLevel}, those caps rise to{" "}
          {publisherPolicyCopy.maxLevelPublisherCampaignCapPercent} and{" "}
          {publisherPolicyCopy.maxLevelInstallCampaignCapPercent}. Risk signals
          such as refund/dispute pressure, invalid receipts, velocity limits, or
          cap pressure can reduce the effective level or pause paid supply for
          review.
        </p>
        <p>
          Earnings first enter a maturing balance and become withdrawable only
          after the {publisherPolicyCopy.earningMaturityWindowWords} maturity
          window completes. Trust warmup controls how
          much paid inventory you can receive; it does not shorten payout
          maturity. Minimum payout and cadence rules apply before transfers, and
          live payouts execute only when all payout policy eligibility checks
          pass, including Connect setup, maturity, minimum balance, cadence,
          and any active payout hold, fraud review, or compliance block. Full
          level tables and limits are documented at{" "}
          <Link className="underline" href="/docs#publisher-levels-and-limits">
            User levels and limits
          </Link>
          .
        </p>
      </Section>

      <Section title="Fraud And Invalid Traffic">
        <p>
          Billable impressions require the server-side minimum visibility window
          and an active user install, but public paid traffic also requires
          fraud controls, scoped extension credentials, alerting, and drill
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
          Public API and agent docs:{" "}
          <Link className="underline" href="/docs">
            /docs
          </Link>
          . For payouts, billing, installs, abuse, and account questions, use{" "}
          <Link className="underline" href="/waitspin/support">
            Support
          </Link>
          .
        </p>
      </Section>
    </WaitSpinLegalPage>
  );
}
