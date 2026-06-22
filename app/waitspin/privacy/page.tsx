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
    >
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
            Stripe payment identifiers, and webhook event IDs.
          </li>
          <li>
            User install data, including install ID, target, status, serve
            sessions, impression events, visible time, timestamps, user-agent,
            IP-derived rate-limit and fraud signals, and audit events.
          </li>
          <li>
            Operational logs, support messages, incident notes, monitor
            evidence, abuse reports, and security/audit records needed to run
            and protect the service.
          </li>
        </ul>
      </Section>

      <Section title="User Surface Behavior">
        <p>
          Verified user earning surfaces include the VS Code Activity Bar/status-bar
          extension, Claude Code statusline command, MiMo Code shell hook,
          OpenCode TUI plugin slot, and Grok Code CLI footer. They poll the
          WaitSpin API for a sponsored message, show the message in the relevant
          wait-state surface, open the advertiser destination only after user
          action, and report an impression after the required visible interval.
          The documented surfaces do not need source code, keystrokes, editor
          contents, terminal output, or repository files to serve ads.
        </p>
        <p>
          The VS Code extension connects a user install inside VS Code, stores
          the extension API key in VS Code SecretStorage, stores the
          install ID in user-scoped extension state, and polls only the WaitSpin
          API. Serve polling sends the install ID;
          impression reporting sends the serve ID, serve receipt, install ID,
          and visible duration. WaitSpin also receives standard network metadata
          used for rate limits, abuse prevention, and audit logging.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {WAITSPIN_PUBLIC_PUBLISHER_TARGETS.map((target) => (
            <li key={target.target}>
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
          The VS Code extension is distributed through the{" "}
          <a
            className="underline"
            href="https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode"
          >
            Visual Studio Marketplace
          </a>
          . Public source is published at{" "}
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
          clients. Serve, impression, wallet, and accounting events are
          operational telemetry needed to run the marketplace.
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
          serve ads, record billable impressions, enforce quotas, prevent fraud,
          investigate incidents, provide support, and satisfy legal, accounting,
          tax, and security obligations.
        </p>
      </Section>

      <Section title="Processors And Infrastructure">
        <p>
          WaitSpin uses PostgreSQL/Supabase-compatible database infrastructure,
          a dedicated DigitalOcean VPS, Cloudflare DNS/security services, Stripe
          for payments, Resend for email, GitHub Actions for public smoke
          checks, and logging/monitoring tools needed for reliability and abuse
          response. Stripe handles card data directly; WaitSpin stores Stripe
          identifiers and payment state, not full card numbers.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          API, campaign, payment, ledger, audit, and fraud records are retained
          as long as needed for marketplace accounting, dispute handling,
          security, compliance, and support. Operational logs and monitor
          evidence should be kept only as long as needed for incident response
          and launch evidence. We may retain minimal records after account
          closure when required to prevent abuse, resolve disputes, or meet
          legal obligations.
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
          public docs will describe the additional data they require.
        </p>
      </Section>
    </WaitSpinLegalPage>
  );
}
