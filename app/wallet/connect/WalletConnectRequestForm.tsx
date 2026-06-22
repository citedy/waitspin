"use client";

import { FormEvent, useState } from "react";

import { useWaitSpinTurnstile } from "@/app/waitspin/WaitSpinTurnstile";
import { WTS_PUBLISHER_CONNECT_COUNTRIES } from "@/lib/waitspin/publisher-connect-countries";
import type { PayoutConnectPageState } from "@/lib/waitspin/payout-connect-web";

export function WalletConnectRequestForm({
  state,
}: {
  state: PayoutConnectPageState;
}) {
  const turnstile = useWaitSpinTurnstile();
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitDisabled =
    isSubmitting || (turnstile.required && !turnstile.ready);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSubmitting(true);
    setStatus(turnstile.required ? "Checking..." : "Sending...");
    try {
      const token = turnstile.required ? await turnstile.execute() : "";
      const tokenInput = form.elements.namedItem(
        "turnstile_token",
      ) as HTMLInputElement | null;
      if (tokenInput) tokenInput.value = token;
      setStatus("Sending...");
      HTMLFormElement.prototype.submit.call(form);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Security verification failed.",
      );
      turnstile.reset();
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="waitspin-support-form"
      method="post"
      action="/wallet/connect/request"
      onSubmit={submit}
    >
      <HiddenRequestFields state={state} />
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
      <label>
        Email
        <span>Your WaitSpin account email for payout setup.</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email ?? ""}
          required
        />
      </label>
      {turnstile.node}
      {status ? (
        <p className="waitspin-support-status" aria-live="polite">
          {status}
        </p>
      ) : null}
      <div className="waitspin-support-actions">
        <button disabled={submitDisabled} type="submit">
          Send setup code
        </button>
      </div>
    </form>
  );
}

function HiddenRequestFields({ state }: { state: PayoutConnectPageState }) {
  return (
    <>
      <input type="hidden" name="source" value={state.source ?? "web"} />
      <input type="hidden" name="turnstile_token" value="" />
      {state.installId ? (
        <input type="hidden" name="install_id" value={state.installId} />
      ) : null}
    </>
  );
}
