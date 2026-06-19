import type { Metadata } from "next";

import { WaitSpinFooter, WaitSpinTextNav } from "@/app/waitspin/public-chrome";
import { payoutConnectPageState } from "@/lib/waitspin/payout-connect-web";
import { WTS_PUBLISHER_CONNECT_COUNTRIES } from "@/lib/waitspin/publisher-connect-countries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up WaitSpin payout account",
  description:
    "Connect a Stripe Express payout account for WaitSpin publisher earnings.",
  alternates: { canonical: "https://waitspin.com/wallet/connect" },
};

type WalletConnectPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
type WalletConnectPageState = ReturnType<typeof payoutConnectPageState>;

export default async function WalletConnectPage({
  searchParams,
}: WalletConnectPageProps) {
  const state = payoutConnectPageState(await searchParams);

  return (
    <main className="waitspin-page waitspin-text-page">
      <WaitSpinTextNav />
      <article className="waitspin-text-article">
        <header className="waitspin-text-hero">
          <p className="waitspin-kicker">WaitSpin publisher payouts</p>
          <h1>Set up payout account</h1>
          <p>
            Connect Stripe Express for WaitSpin publisher withdrawals. Your VS
            Code install can stay connected with a publisher-extension key;
            payout onboarding uses a separate verified browser flow.
          </p>
          <StatusMessages state={state} />
        </header>

        <div className="waitspin-text-content">
          <EmailVerificationForm state={state} />
          <StripeVerificationForm state={state} />
        </div>
      </article>
      <WaitSpinFooter />
    </main>
  );
}

function StatusMessages({ state }: { state: WalletConnectPageState }) {
  if (state.connectState === "return") {
    return (
      <div className="waitspin-text-status">
        Stripe onboarding returned to WaitSpin. Refresh the VS Code wallet view
        to see the latest payout account status.
      </div>
    );
  }
  if (state.connectState === "refresh") {
    return (
      <div className="waitspin-text-status">
        Stripe needs a fresh onboarding link. Enter your email below and
        continue setup with a new verified link.
      </div>
    );
  }
  if (state.error) {
    if (state.error === "country_mismatch") {
      return (
        <div className="waitspin-text-status">
          That WaitSpin account already has a Stripe Express payout country.
          Reopen setup with the original country or contact support before
          creating a replacement payout account.
        </div>
      );
    }
    return (
      <div className="waitspin-text-status">
        Setup did not complete. Check the email/code and try again.
      </div>
    );
  }
  return null;
}

function EmailVerificationForm({ state }: { state: WalletConnectPageState }) {
  return (
    <section className="waitspin-text-section">
      <h2>Verify Email</h2>
      <div className="waitspin-text-section-body">
        <p>
          Use the same email as your WaitSpin publisher account. WaitSpin sends
          a 6-digit code, then redirects you to Stripe Express.
        </p>
        <form
          className="waitspin-support-form"
          method="post"
          action="/wallet/connect/request"
        >
          <HiddenFormFields state={state} />
          <CountrySelect state={state} />
          <label>
            Email
            <span>Your WaitSpin account email for payout setup.</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <div className="waitspin-support-actions">
            <button type="submit">Send setup code</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function StripeVerificationForm({ state }: { state: WalletConnectPageState }) {
  return (
    <section className="waitspin-text-section">
      <h2>Continue To Stripe</h2>
      <div className="waitspin-text-section-body">
        <p>
          After the code arrives, enter it here. WaitSpin verifies the account
          server-side and opens Stripe Express; no reusable API key is exposed to
          this page.
        </p>
        <form
          className="waitspin-support-form"
          method="post"
          action="/wallet/connect/verify"
        >
          <HiddenFormFields state={state} />
          <CountrySelect state={state} />
          <label>
            Email
            <span>Must match the email that received the setup code.</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            6-digit code
            <span>Use the latest WaitSpin payout setup code.</span>
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <div className="waitspin-support-actions">
            <button type="submit">Continue to Stripe Express</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function HiddenFormFields({ state }: { state: WalletConnectPageState }) {
  return (
    <>
      <input type="hidden" name="source" value={state.source ?? "web"} />
      {state.installId ? (
        <input type="hidden" name="install_id" value={state.installId} />
      ) : null}
    </>
  );
}

function CountrySelect({ state }: { state: WalletConnectPageState }) {
  return (
    <label>
      Country
      <span>
        Choose the publisher payout country. Stripe locks this to the Express
        account once onboarding starts.
      </span>
      <select name="country" defaultValue={state.countryCode ?? ""} required>
        <option value="" disabled>
          Select payout country
        </option>
        {WTS_PUBLISHER_CONNECT_COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
      </select>
    </label>
  );
}
