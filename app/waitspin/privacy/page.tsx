import type { Metadata } from "next";
import Link from "next/link";

import {
  WAITSPIN_NEVER_SENT_DATA,
  WAITSPIN_PUBLIC_PUBLISHER_TARGETS,
  WAITSPIN_PUBLIC_TRUST_REPO_URL,
  WAITSPIN_SENT_PAYLOADS,
} from "@/lib/waitspin/public-trust";
import { WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY } from "@/lib/waitspin/public-publisher-policy-copy";
import { Section, WaitSpinLegalPage } from "../legal-content";
import { payoutOperatorAddress } from "../public-chrome";
import { PublicSurfaceCopyLabel } from "../public-surface-copy-label";

const publisherPolicyCopy = WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY;

export const metadata: Metadata = {
  title: "WaitSpin Privacy",
  description:
    "Privacy notice for WaitSpin email verification, API keys, advertiser blocks, user installs, extension telemetry, payments, and fraud controls.",
};

export const dynamic = "force-dynamic";

export default function WaitSpinPrivacyPage() {
  return (
    <WaitSpinLegalPage
      title="WaitSpin Privacy"
      description="This notice explains the data WaitSpin uses to operate the API, marketplace, user earning surfaces, billing, fraud controls, support, and monitoring."
      lastUpdated="July 13, 2026"
    >
      <Section title="Controller And Privacy Contact">
        <p>
          TEMNIKOVA LDA, NIPC/VAT PT516343653, trading through the WaitSpin
          product, is the data controller. Its registered address is{" "}
          {payoutOperatorAddress}. Privacy requests can be submitted through the{" "}
          <Link className="underline" href="/waitspin/support">
            WaitSpin support page
          </Link>
          . Dmitri Sergeev, CTO, is the internal privacy-policy owner; this does
          not designate him as a statutory data protection officer.
        </p>
      </Section>

      <Section title="Data We Process">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Email address, verification attempts, OTP delivery metadata, account
            status, plan/trust level, and API key metadata such as prefix,
            scopes, hashed secret, status, and last-used timestamps.
          </li>
          <li>
            Advertiser campaign data, including ad line, brand name, destination
            URL, block count, price, campaign state, Checkout session IDs,
            Stripe payment identifiers, stablecoin MPP PaymentIntent and
            receipt identifiers, and webhook event IDs.
          </li>
          <li>
            User install data, including install ID, target, status, serve
            sessions, impression events, creative views, valid clicks, visible
            time, timestamps, HMAC-derived network/client risk signals, and
            audit events. Raw IP addresses and user-agent strings are not stored
            with click events; their HMAC risk fields are marked for purge
            after 30 days.
          </li>
          <li>
            Operational logs, support messages, incident notes, monitor
            evidence, abuse reports, and security/audit records needed to run
            and protect the service.
          </li>
        </ul>
        <p>
          Data comes from you; from the WaitSpin clients and website when you
          use them; and from service providers involved in the requested
          transaction or operation, such as Stripe payment and Connect status,
          Resend email-delivery status, and infrastructure security signals.
          WaitSpin does not obtain personal data from unrelated data brokers.
        </p>
      </Section>

      <Section title="User Surface Behavior">
        <p>
          Verified user earning surfaces include the VS Code Activity Bar/status-bar
          extension, VS Code-compatible Cursor Editor Mode and Devin Desktop
          editor surfaces, Claude Code statusline command, Antigravity CLI
          statusline command, GitHub Copilot CLI statusline command, MiMo Code
          shell hook, OpenCode TUI plugin slot, Grok Code CLI footer, and Qoder
          CLI UserPromptSubmit/Stop hooks. They poll the
          WaitSpin API for a sponsored message, show the message in the relevant
          wait-state surface, open the advertiser destination only after user
          action, and report an impression after the required visible interval.
          The documented surfaces do not need source code, keystrokes, editor
          contents, terminal output, or repository files to serve ads.
          Qoder&apos;s official hook payload is delivered locally by Qoder and can
          include prompt or assistant-message fields; the WaitSpin Qoder runtime
          discards those fields before cache or API work.
        </p>
        <p>
          The VS Code extension connects a user install inside VS Code, stores
          the extension API key in VS Code SecretStorage, stores the
          install ID in user-scoped extension state, and polls only the WaitSpin
          API. Serve polling sends the install ID;
          impression reporting sends the serve ID, serve receipt, install ID,
          and visible duration. When click measurement is enabled for a
          capability-aware clickable surface, the client reports one
          receipt-bound view and opens an opaque WaitSpin redirect URL on user
          click. WaitSpin also receives standard network metadata used for rate
          limits, abuse prevention, and audit logging.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map((target) => (
            <li key={`${target.label}-${target.target}`}>
              {"href" in target ? (
                <a
                  className="underline"
                  href={target.href}
                  rel="noopener noreferrer"
                >
                  <strong>{target.label}</strong>
                </a>
              ) : (
                <PublicSurfaceCopyLabel
                  command={target.installCommand}
                  label={target.label}
                />
              )}
              : {target.localBehavior}
            </li>
          ))}
        </ul>
        <p>
          The VS Code-compatible extension is distributed through the{" "}
          <a
            className="underline"
            href="https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode"
          >
            Visual Studio Marketplace
          </a>{" "}
          for VS Code and Cursor, and through{" "}
          <a
            className="underline"
            href="https://open-vsx.org/extension/waitspin/waitspin-vscode"
          >
            Open VSX
          </a>{" "}
          for Devin Desktop. Public source is published at{" "}
          <a className="underline" href={WAITSPIN_PUBLIC_TRUST_REPO_URL}>
            github.com/citedy/waitspin
          </a>
          . Public source and provenance are documented on the{" "}
          <Link className="underline" href="/waitspin/trust">
            WaitSpin Trust
          </Link>{" "}
          page, including the machine-readable manifest at{" "}
          <Link className="underline" href="/provenance/waitspin-vscode.json">
            /provenance/waitspin-vscode.json
          </Link>
          .
        </p>
      </Section>

      <Section title="What User Clients Do Not Send">
        <p>
          WaitSpin is designed to measure wait-state ad visibility, not your
          work. The public clients do not send:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_NEVER_SENT_DATA.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title="Operational Telemetry">
        <p>
          WaitSpin has no separate analytics telemetry stream in the public
          clients. Serve, impression, capability-gated view/click, wallet, and
          accounting events are operational telemetry needed to run the
          marketplace. Click measurement is not inferred from editor contents
          and does not run on text-only surfaces.
        </p>
        <p>
          On the public website, Google Analytics 4 page and conversion
          measurement is gated by a GDPR cookie preference notice for EU/EEA
          visitors and runs without that notice outside the EU/EEA. EU/EEA
          visitors can accept all cookies, keep necessary cookies only, or
          choose analytics and advertising measurement separately. Website
          events are limited to page views, install-link clicks, command-copy
          success, list signup success, advertiser-path clicks, checkout-return status, and public
          surface selection. They do not include email addresses, company names,
          API keys, wallet addresses, command contents, clipboard contents,
          source code, editor data, terminal output, or repository files.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_SENT_PAYLOADS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title="How We Use Data">
        <p>
          We use WaitSpin data to verify accounts, issue and secure API keys,
          create campaigns, route Checkout, activate paid blocks, select and
          route Stripe/Tempo stablecoin MPP pay-ins, activate paid blocks,
          select and serve ads, record billable impressions, enforce quotas,
          prevent fraud, investigate incidents, provide support, and satisfy
          legal, accounting, tax, and security obligations.
        </p>
      </Section>

      <Section title="Legal Bases">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Contract necessity under GDPR Article 6(1)(b): account access,
            campaign and marketplace operation, purchases, publisher earnings,
            balances, payouts, support, and delivery of requested services.
          </li>
          <li>
            Legal obligation under Article 6(1)(c): Portuguese tax,
            accounting, payment, regulatory, and legally required recordkeeping.
          </li>
          <li>
            Legitimate interests under Article 6(1)(f): service security and
            reliability, fraud and abuse prevention, reconciliation, defence of
            legal claims, limited accountability evidence, and a minimum direct-
            marketing suppression entry. These interests are applied with data
            minimisation and the rights described below.
          </li>
          <li>
            Consent under Article 6(1)(a): optional website analytics,
            advertising measurement, and marketing messages where consent is
            required. Consent can be withdrawn at any time without affecting
            processing that was lawful before withdrawal.
          </li>
        </ul>
      </Section>

      <Section title="Processors, Recipients, And Transfers">
        <p>
          WaitSpin uses PostgreSQL/Supabase-compatible database infrastructure,
          a dedicated DigitalOcean VPS, Cloudflare DNS/security services, Stripe
          for payments, Resend for email, Google Analytics 4 for consent-gated
          website measurement, GitHub Actions for public smoke checks, and
          logging/monitoring tools needed for reliability and abuse response.
          These providers receive only the data needed for their function.
          Professional advisers, auditors, payment partners, or public
          authorities receive data only when necessary for a service, legal
          obligation, claim, or lawful request. WaitSpin does not sell personal
          data. Stripe handles card data and stablecoin payment processing
          directly; WaitSpin stores Stripe identifiers, MPP receipt references,
          and payment state, not full card numbers, raw wallet addresses,
          private keys, or crypto custody balances.
        </p>
        <p>
          Some providers may process data outside the EEA. Where a transfer is
          not covered by an EU adequacy decision, WaitSpin requires an
          applicable GDPR Article 46 safeguard, such as the European
          Commission&apos;s standard contractual clauses, plus supplementary
          measures where required. A copy or description of the applicable
          safeguard can be requested through the support page.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          Direct account identifiers, credentials, devices, installations,
          verification records, temporary mutation records, and local analytics
          identities are deleted, revoked, or replaced with non-deliverable
          tombstones immediately after confirmed account deletion. Routine
          operational logs are retained for no more than 30 days and must not
          contain the deletion token, email confirmation fragment, or reusable
          credentials. A scoped incident copy may be retained only until the
          incident or a documented legal hold closes.
        </p>
        <p>
          When you delete an account, WaitSpin revokes credentials and devices,
          removes email verification and temporary mutation records, suppresses
          marketing email, tombstones associated analytics identities, and
          queues deletion with the analytics processor. Raw processor
          identifiers are removed after processor deletion succeeds. The
          account email and local installation identifiers are replaced with
          non-deliverable tombstones.
        </p>
        <p>
          Pseudonymous purchases and Stripe evidence; balances, Stripe Connect
          payout-account evidence, payouts, and payout transitions; financially
          relevant delivery records; refunds; and disputes are retained for 10
          years from the applicable Portuguese tax or accounting period. Risk,
          quarantine, abuse, and fraud evidence is retained only until the
          related matter closes, capped at 10 years unless a documented legal
          hold requires longer. An open dispute or legal hold extends only the
          records needed for that matter until it closes; it does not justify
          retaining unrelated direct identity.
        </p>
        <p>
          Marketing subscriber data and send logs are deleted immediately. A
          minimal suppression entry is retained only to prevent accidental
          re-enrollment or further direct marketing for as long as WaitSpin
          operates its email-marketing service; it is reviewed annually and is
          never used to contact or profile the person. For analytics
          processor deletion, the processor identifier is retained only until
          deletion completes; a blocked request requires remediation within 30
          days. Redacted processor-deletion result evidence is retained for 12
          months. Revoked credential tombstones, pseudonymous analytics
          consent/deletion tombstones, prior audit event/time/resource envelopes
          with direct-identifier and secret fields removed, the remaining
          pseudonymous forensic metadata, and the aggregate account-deletion
          audit event are retained for 3 years.
          These retained records cannot restore the account, create a
          refund, recreate credentials, change a balance, cancel a payout, or
          rewrite historical ledger totals.
        </p>
      </Section>

      <Section title="Your Data Protection Rights">
        <p>
          Subject to the conditions and exceptions in applicable law, you may
          request access, correction, deletion, restriction, and portability of
          your personal data; object to processing based on legitimate
          interests; and withdraw consent at any time. You may object to direct
          marketing at any time. Requests can be made through the support page,
          and WaitSpin may request proportionate information to verify identity.
          WaitSpin will communicate the action taken without undue delay and,
          in any event, within one month after receiving the request. Where a
          request is complex or numerous requests are being handled, that period
          may be extended by up to two further months; WaitSpin will explain the
          extension within the first month.
        </p>
        <p>
          You also have the right to lodge a complaint with the supervisory
          authority where you live or work or where an alleged infringement
          occurred. In Portugal, complaints can be submitted to the{" "}
          <a
            className="underline"
            href="https://www.cnpd.pt/cidadaos/participacoes/"
            rel="noopener noreferrer"
          >
            Comiss&atilde;o Nacional de Prote&ccedil;&atilde;o de Dados (CNPD)
          </a>
          .
        </p>
      </Section>

      <Section title="Required Data And Automated Controls">
        <p>
          An email address and verification data are required to create and
          access an account. Campaign, payment, tax, payout, and connected-
          account data are required only when the corresponding advertiser or
          publisher function is used. Without required data, WaitSpin cannot
          provide that function. Marketing and consent-gated website analytics
          are optional.
        </p>
        <p>
          WaitSpin uses automated security, quota, invalid-traffic, and fraud
          controls that can reject an event, pause delivery, quarantine a
          publisher, or restrict a credential. WaitSpin does not use personal
          data for solely automated decisions that produce legal or similarly
          significant effects without an available human review path. A user
          can request review through the support page.
        </p>
      </Section>

      <Section title="Choices And Security">
        <p>
          You can stop using the extension, remove local extension settings,
          rotate API keys, avoid storing keys in workspace settings, and contact
          support for privacy or account questions. WaitSpin protects keys with
          hashed storage, uses trusted-edge and host-isolation checks in
          production, limits request rates, and avoids printing secrets in
          launch evidence or incident notes.
        </p>
        <p>
          A signed-in user can start permanent account deletion from the{" "}
          <Link className="underline" href="/waitspin/account/delete">
            WaitSpin account deletion page
          </Link>
          . The email confirmation opens a final warning; only the explicit
          final button performs deletion. Completed deletion cannot be undone.
        </p>
      </Section>

      <Section title="Money And Payout Data">
        <p>
          Wallet, ledger,{" "}
          <Link className="underline" href="/wallet/connect">
            Stripe Connect onboarding
          </Link>
          , payout dry-run, and payout execution process payout, tax, compliance,
          account, balance, ledger, trust level and warmup status, and Stripe
          Connect status data when used. Trust level starts at{" "}
          {publisherPolicyCopy.trustMinLevelLabel} and can rise by one level
          after each clean {publisherPolicyCopy.trustCleanPeriodWords} period of
          billable activity, up to {publisherPolicyCopy.trustMaxLevelLabel},
          while daily exposure limits scale with that level. Earnings mature for{" "}
          {publisherPolicyCopy.earningMaturityHours} hours before becoming
          withdrawable; trust warmup controls paid inventory exposure, not payout
          maturity. Live transfers execute only when payout policy eligibility
          checks pass. See{" "}
          <Link className="underline" href="/docs#publisher-levels-and-limits">
            User levels and limits
          </Link>{" "}
          for the public cap tables. Account-credit redemption and self-serve
          refund workflows are not shipped; if they are added later, updated
          public docs will describe the additional data they require. Publisher
          payouts remain standard Stripe-managed fiat payouts; WaitSpin does not
          offer direct EU crypto publisher payouts.
        </p>
      </Section>
    </WaitSpinLegalPage>
  );
}
