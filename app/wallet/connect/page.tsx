import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { WaitSpinFooter, WaitSpinTextNav } from "@/app/waitspin/public-chrome";
import { WalletConnectCodeInput } from "@/app/wallet/connect/WalletConnectCodeInput";
import { WalletConnectRequestForm } from "@/app/wallet/connect/WalletConnectRequestForm";
import {
  payoutConnectEmailFromCookieValue,
  payoutConnectPageState,
  WTS_PAYOUT_CONNECT_EMAIL_COOKIE,
} from "@/lib/waitspin/payout-connect-web";
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
  const cookieStore = await cookies();
  const payoutEmail = payoutConnectEmailFromCookieValue(
    cookieStore.get(WTS_PAYOUT_CONNECT_EMAIL_COOKIE)?.value,
  );
  const state = payoutConnectPageState(await searchParams, {
    email: payoutEmail,
  });
  const hasSentContext = Boolean(state.sent && state.email && state.countryCode);

  return (
    <main className="waitspin-page waitspin-text-page">
      <WaitSpinTextNav />
      <article className="waitspin-text-article">
        <header className="waitspin-text-hero">
          <p className="waitspin-kicker">WaitSpin publisher payouts</p>
          <h1>Set up payout account</h1>
          <p>
            Connect Stripe Express for WaitSpin publisher withdrawals. Your
            WaitSpin publisher surface can stay connected with its
            publisher-extension key; payout onboarding uses a separate verified
            browser flow.
          </p>
          <StatusMessages state={state} />
        </header>

        <div className="waitspin-text-content">
          {hasSentContext ? (
            <StripeVerificationForm state={state} locked />
          ) : (
            <>
              <EmailVerificationForm state={state} />
              <StripeVerificationForm state={state} />
            </>
          )}
        </div>
      </article>
      <WaitSpinFooter />
    </main>
  );
}

function StatusMessages({ state }: { state: WalletConnectPageState }) {
  if (state.connectState === "return") {
    return (
      <section
        className="waitspin-checkout-return waitspin-payout-return is-success"
        aria-labelledby="payout-return-title"
        role="status"
      >
        <div>
          <p className="waitspin-kicker">Stripe Express returned</p>
          <h2 id="payout-return-title">Payout setup was received</h2>
          <p>
            WaitSpin is syncing your Stripe Express payout account. Refresh the
            publisher wallet or status view in the earning surface you use to
            see the latest payout readiness.
          </p>
          <p className="waitspin-checkout-return-note">
            Publisher install status and payout account status are separate:
            sponsored cards can keep running while Stripe finishes account
            checks.
          </p>
        </div>
        <div className="waitspin-checkout-return-actions">
          <a href="/docs#publisher-wallet-and-payouts">Wallet docs</a>
          <Link href="/wallet/connect">New setup link</Link>
        </div>
      </section>
    );
  }
  if (state.connectState === "refresh") {
    return (
      <section
        className="waitspin-checkout-return waitspin-payout-return is-cancel"
        aria-labelledby="payout-refresh-title"
        role="status"
      >
        <div>
          <p className="waitspin-kicker">Stripe link expired</p>
          <h2 id="payout-refresh-title">Create a fresh setup link</h2>
          <p>
            Stripe needs a new onboarding URL. Send a setup code below, then use
            the latest verified link to continue payout setup.
          </p>
        </div>
        <div className="waitspin-checkout-return-actions">
          <a href="#verify-email">Send code</a>
          <a href="/docs#publisher-wallet-and-payouts">Wallet docs</a>
        </div>
      </section>
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
    if (state.error === "request_failed") {
      return (
        <div className="waitspin-text-status">
          Could not send the setup code. Check the email and payout country,
          then try again.
        </div>
      );
    }
    if (state.error === "connect_failed") {
      return (
        <div className="waitspin-text-status">
          Code was accepted, but payout setup could not start. Send a new setup
          code below; if it repeats, contact support and include your payout
          country.
        </div>
      );
    }
    return (
      <div className="waitspin-text-status">
        Code was not accepted. Enter the latest 6-digit code or send a new
        setup code.
      </div>
    );
  }
  return null;
}

function EmailVerificationForm({ state }: { state: WalletConnectPageState }) {
  return (
    <section className="waitspin-text-section" id="verify-email">
      <h2>Verify Email</h2>
      <div className="waitspin-text-section-body">
        <p>
          Use the same email as your WaitSpin publisher account. WaitSpin sends
          a 6-digit code, then redirects you to Stripe Express.
        </p>
        <WalletConnectRequestForm state={state} />
      </div>
    </section>
  );
}

function StripeVerificationForm({
  state,
  locked = false,
}: {
  state: WalletConnectPageState;
  locked?: boolean;
}) {
  const countryLabel = countryLabelForCode(state.countryCode);

  return (
    <section className="waitspin-text-section">
      <h2>Continue To Stripe</h2>
      <div className="waitspin-text-section-body">
        {locked ? (
          <p>
            Code sent to <strong>{state.email}</strong>
            {countryLabel ? <> for {countryLabel}</> : null}. Enter the 6-digit
            code to open Stripe Express.
          </p>
        ) : (
          <p>
            Already have a payout setup code? Enter it here. WaitSpin verifies
            the account server-side and opens Stripe Express; no reusable API
            key is exposed to this page.
          </p>
        )}
        <form
          className="waitspin-support-form"
          method="post"
          action="/wallet/connect/verify"
        >
          <HiddenFormFields state={state} />
          {locked ? (
            <LockedVerificationFields state={state} />
          ) : (
            <>
              <CountrySelect state={state} />
              <label>
                Email
                <span>Must match the email that received the setup code.</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={state.email ?? ""}
                  required
                />
              </label>
            </>
          )}
          <WalletConnectCodeInput />
          <div className="waitspin-support-actions">
            <button type="submit">Continue to Stripe Express</button>
            {locked ? (
              <Link href={changeEmailCountryHref(state)}>
                Change email/country
              </Link>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function LockedVerificationFields({ state }: { state: WalletConnectPageState }) {
  return (
    <>
      <input type="hidden" name="country" value={state.countryCode ?? ""} />
      <input type="hidden" name="email" value={state.email ?? ""} />
      <input type="hidden" name="sent" value="1" />
    </>
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

function countryLabelForCode(countryCode: string | undefined): string | undefined {
  if (!countryCode) return undefined;
  return WTS_PUBLISHER_CONNECT_COUNTRIES.find(
    (country) => country.code === countryCode,
  )?.label;
}

function changeEmailCountryHref(state: WalletConnectPageState): string {
  const params = new URLSearchParams();
  params.set("source", state.source ?? "web");
  if (state.installId) params.set("install_id", state.installId);
  if (state.countryCode) params.set("country", state.countryCode);
  return `/wallet/connect?${params.toString()}`;
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
