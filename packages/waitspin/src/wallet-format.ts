type JsonRecord = Record<string, unknown>;

const MICRO_UNITS_PER_CENT = 10_000;
const MICRO_UNITS_PER_EURO = MICRO_UNITS_PER_CENT * 100;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function trimTrailingZeros(value: string, minDecimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (!fraction) return value;
  let trimmed = fraction;
  while (trimmed.length > minDecimals && trimmed.endsWith("0")) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${whole}.${trimmed.padEnd(minDecimals, "0")}`;
}

function formatMicroUnits(value: unknown): string {
  const amount = numberValue(value) ?? 0;
  const euros = amount / MICRO_UNITS_PER_EURO;
  const absAmount = Math.abs(amount);
  const hasSubCentValue =
    amount !== 0 && absAmount % MICRO_UNITS_PER_CENT !== 0;
  const decimals = hasSubCentValue ? 6 : 2;
  const minDecimals = hasSubCentValue ? 4 : 2;
  return `EUR ${trimTrailingZeros(euros.toFixed(decimals), minDecimals)}`;
}

function formatSignedMicroUnits(value: unknown): string {
  const amount = numberValue(value) ?? 0;
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatMicroUnits(Math.abs(amount))}`;
}

function formatCents(value: unknown, currencyValue: unknown = "eur"): string {
  const cents = numberValue(value) ?? 0;
  const currency = stringValue(currencyValue)?.toUpperCase() ?? "EUR";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function formatOptionalDateTime(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function payoutReasonText(reason: string, payload: JsonRecord): string {
  const balance = record(payload.balance);
  const policy = record(payload.payout_policy);
  switch (reason) {
    case "connect_account_missing":
      return "Payout account is not set up. Open https://waitspin.com/wallet/connect to connect Stripe Express.";
    case "connect_details_not_submitted":
      return "Payout account onboarding is incomplete. Reopen https://waitspin.com/wallet/connect to finish Stripe Express.";
    case "connect_payouts_not_enabled":
    case "payouts_disabled":
      return "Stripe has not enabled payouts on the connected account yet.";
    case "earnings_maturing": {
      const hours = numberValue(policy.earning_maturity_hours);
      const windowText = hours ? ` after about ${hours} hours` : "";
      return `Earnings are still maturing. ${formatMicroUnits(
        balance.maturing_micro_units,
      )} is recorded but not withdrawable yet${windowText}.`;
    }
    case "balance_below_minimum":
      return `Balance is below the payout minimum. Payoutable now: ${formatCents(
        policy.transfer_cents,
        policy.currency,
      )}; minimum payout: ${formatCents(
        policy.min_payout_cents,
        policy.currency,
      )}.`;
    case "payout_cadence_cooldown": {
      const next = formatOptionalDateTime(policy.next_eligible_at);
      return next
        ? `Waiting for the next payout window: ${next}.`
        : "Waiting for the next scheduled payout window.";
    }
    case "reversal_debt_outstanding":
      return "Previous refunds or reversals must be settled before payout.";
    case "publisher_quarantined":
    case "risk_score_payout_hold":
    case "risk_score_quarantine":
      return "Payouts are paused while WaitSpin reviews account risk signals.";
    case "stale_pending_payout":
      return "A previous payout is still being reconciled. Contact support if this remains after a few minutes.";
    default:
      return `Waiting on payout check: ${reason}.`;
  }
}

function publisherLevelText(payload: JsonRecord): string | undefined {
  const trust = record(payload.publisher_trust);
  const level = numberValue(trust.level);
  const maxLevel = numberValue(trust.max_level);
  if (level === undefined || maxLevel === undefined) return undefined;
  const status = stringValue(trust.status);
  const label =
    status === "downranked"
      ? "limited after risk signals"
      : status === "warming"
        ? "warming up"
        : status === "max"
          ? "maximum level"
          : status === "frozen"
            ? "paused for review"
            : undefined;
  const next = formatOptionalDateTime(trust.next_level_at);
  const suffix = next
    ? ` Next level window: ${next}.`
    : " Level can rise after clean billable activity.";
  return `User level: ${level}/${maxLevel}${
    label ? `, ${label}` : ""
  }.${suffix} Level limits affect daily campaign share; they do not mean the plugin is disconnected.`;
}

export function formatWalletStatus(payload: unknown): string {
  const data = record(payload);
  const balance = record(data.balance);
  const connect = record(data.connect);
  const policy = record(data.payout_policy);
  const reasons = stringArray(policy.blocked_reasons);
  const lines = [
    "WaitSpin wallet",
    `Account: ${stringValue(data.account_id) ?? "unknown"}`,
    "",
    `Available: ${formatMicroUnits(balance.available_micro_units)}`,
    `Pending maturity: ${formatMicroUnits(balance.maturing_micro_units)}`,
    `Pending payout: ${formatMicroUnits(balance.pending_payout_micro_units)}`,
    `Held: ${formatMicroUnits(balance.held_micro_units)}`,
    `Lifetime earned: ${formatMicroUnits(balance.lifetime_earned_micro_units)}`,
    "",
  ];

  const connected = booleanValue(connect.connected) === true;
  const payoutsEnabled = booleanValue(connect.payouts_enabled) === true;
  const detailsSubmitted = booleanValue(connect.details_submitted) === true;
  const country = stringValue(connect.country_code);
  lines.push(
    connected
      ? `Payout account: Connected${country ? ` (${country})` : ""}, ${
          payoutsEnabled && detailsSubmitted
            ? "Stripe payouts enabled"
            : "Stripe onboarding pending"
        }.`
      : "Payout account: Not set up. Open https://waitspin.com/wallet/connect to connect Stripe Express.",
  );

  if (booleanValue(policy.eligible)) {
    lines.push(
      `Payout status: Ready for ${formatCents(policy.transfer_cents, policy.currency)}.`,
    );
  } else {
    lines.push("Payout status: Not ready yet.");
    const visibleReasons = reasons.length ? reasons : ["wallet_refresh_pending"];
    for (const reason of visibleReasons) {
      lines.push(`- ${payoutReasonText(reason, data)}`);
    }
  }

  const level = publisherLevelText(data);
  if (level) {
    lines.push("", level);
  }

  lines.push("", "Raw API fields: rerun with --json.");
  return `${lines.join("\n")}\n`;
}

export function formatWalletPayout(payload: unknown): string {
  const data = record(payload);
  const currency = data.currency;
  const lines = ["WaitSpin payout"];
  if (booleanValue(data.dry_run)) {
    lines[0] = "WaitSpin payout dry run";
  }
  if (booleanValue(data.eligible) === false) {
    lines.push("Status: Not ready yet.");
    lines.push(`Amount: ${formatCents(data.amount_cents, currency)}`);
    const reasons = stringArray(data.blocked_reasons);
    for (const reason of reasons.length ? reasons : ["wallet_refresh_pending"]) {
      lines.push(`- ${payoutReasonText(reason, { payout_policy: data })}`);
    }
    lines.push("Raw API fields: rerun with --json.");
    return `${lines.join("\n")}\n`;
  }

  const status = stringValue(data.status);
  if (status) {
    lines.push(`Status: ${status}`);
  } else {
    lines.push("Status: Ready");
  }
  lines.push(`Amount: ${formatCents(data.amount_cents, currency)}`);
  const transferId = stringValue(data.stripe_transfer_id);
  if (transferId) {
    lines.push(`Stripe transfer: ${transferId}`);
  } else if (booleanValue(data.dry_run)) {
    lines.push(
      "Next: run `waitspin wallet payout --confirm-test-transfer` when you are ready.",
    );
  }
  lines.push("Raw API fields: rerun with --json.");
  return `${lines.join("\n")}\n`;
}

export function formatWalletLedger(payload: unknown): string {
  const entries = Array.isArray(record(payload).entries)
    ? (record(payload).entries as unknown[])
    : [];
  const lines = ["WaitSpin ledger"];
  if (!entries.length) {
    lines.push("No ledger entries yet.");
    return `${lines.join("\n")}\n`;
  }

  for (const entryValue of entries) {
    const entry = record(entryValue);
    const created = formatOptionalDateTime(entry.created_at) ?? "unknown time";
    const eventType = stringValue(entry.event_type) ?? "event";
    const publisher = formatSignedMicroUnits(entry.publisher_micro_units);
    const gross = formatSignedMicroUnits(entry.gross_micro_units);
    const maturesAt = formatOptionalDateTime(entry.earning_matures_at);
    const maturedAt = formatOptionalDateTime(entry.earning_matured_at);
    const maturity = maturedAt
      ? `matured ${maturedAt}`
      : maturesAt
        ? `matures ${maturesAt}`
        : "maturity unknown";
    lines.push(
      `${created} - ${eventType}: ${publisher} publisher share (${gross} gross, ${maturity})`,
    );
  }
  lines.push("Raw API fields: rerun with --json.");
  return `${lines.join("\n")}\n`;
}
