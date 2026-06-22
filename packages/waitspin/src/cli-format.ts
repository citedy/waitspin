type JsonRecord = Record<string, unknown>;

const IMPRESSION_MICRO_UNITS = 1_000;

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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatInteger(value: unknown): string {
  const number = numberValue(value) ?? 0;
  return new Intl.NumberFormat("en-US").format(Math.trunc(number));
}

function formatMoney(cents: unknown, currencyValue: unknown = "eur"): string {
  const amount = numberValue(cents);
  const currency = stringValue(currencyValue)?.toUpperCase() ?? "EUR";
  if (amount === undefined) return currency;
  return `${currency} ${(amount / 100).toFixed(2)}`;
}

function formatCpm(bidCpmMicros: unknown): string {
  const micros = numberValue(bidCpmMicros);
  if (micros === undefined || micros <= 0) return "unknown CPM";
  return `EUR ${(micros / 1_000_000).toFixed(2)} CPM`;
}

function formatBool(value: unknown): string {
  return booleanValue(value) === true ? "yes" : "no";
}

function formatLines(lines: Array<string | undefined | null | false>): string {
  return `${lines.filter(Boolean).join("\n")}\n`;
}

function rawHint(): string {
  return "Raw API fields: rerun with --json.";
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function commandLine(value: unknown): string | undefined {
  const command = stringValue(value);
  return command ? `Next: ${command}` : undefined;
}

function targetLabel(value: unknown): string {
  return stringValue(value) ?? "target";
}

function statusWord(value: unknown): string {
  return booleanValue(value) === true ? "installed" : "not installed";
}

export function formatInitResult(payload: unknown): string {
  const data = record(payload);
  const apiKey = stringValue(data.api_key);
  if (apiKey) {
    const scopes = arrayValue(data.scopes)
      .map((scope) => stringValue(scope))
      .filter((scope): scope is string => Boolean(scope));
    const commands = arrayValue(data.next_commands)
      .map((command) => stringValue(command))
      .filter((command): command is string => Boolean(command));
    return formatLines([
      "WaitSpin API key active",
      `Account: ${stringValue(data.account_id) ?? "unknown"}`,
      `Base URL: ${stringValue(data.base_url) ?? "https://api.waitspin.com"}`,
      `API key: ${maskSecret(apiKey)}`,
      scopes.length ? `Scopes: ${scopes.join(", ")}` : undefined,
      stringValue(data.human_message),
      commands.length ? "" : undefined,
      ...commands.map((command) => `Next: ${command}`),
      "",
      rawHint(),
    ]);
  }

  return formatLines([
    "WaitSpin email code sent",
    `Email: ${stringValue(data.email) ?? "unknown"}`,
    `Delivery: ${stringValue(data.delivery) ?? "email"}`,
    `Expires in: ${formatInteger(data.expires_in_seconds ?? 900)} seconds`,
    stringValue(data.human_message),
    commandLine(data.next_command),
    "",
    rawHint(),
  ]);
}

export function formatCampaignCreateResult(payload: unknown): string {
  const data = record(payload);
  const blocks = numberValue(data.blocks) ?? 0;
  const pricePerBlockCents = numberValue(data.price_per_block_cents) ?? 0;
  const impressions = blocks * 1_000;
  return formatLines([
    "WaitSpin campaign draft created",
    `Campaign: ${stringValue(data.campaign_id) ?? "unknown"}`,
    `Block purchase: ${stringValue(data.block_purchase_id) ?? "unknown"}`,
    `Status: ${stringValue(data.status) ?? "draft"}`,
    `Budget: ${formatMoney(blocks * pricePerBlockCents)} / ${formatInteger(
      impressions,
    )}-impression block purchase`,
    `CPM bid: ${formatMoney(pricePerBlockCents)} per 1,000 impressions`,
    commandLine(
      data.campaign_id
        ? `waitspin bid checkout ${String(data.campaign_id)}`
        : undefined,
    ),
    "",
    rawHint(),
  ]);
}

export function formatBidsListResult(payload: unknown): string {
  const campaigns = arrayValue(record(payload).campaigns);
  const lines = ["WaitSpin advertiser campaigns"];
  if (!campaigns.length) {
    lines.push("No campaigns found for this API key.");
    lines.push(rawHint());
    return `${lines.join("\n")}\n`;
  }

  for (const value of campaigns) {
    const campaign = record(value);
    const blocks = numberValue(campaign.blocks_purchased) ?? 0;
    const remainingUnits = numberValue(campaign.units_remaining) ?? 0;
    const remainingImpressions = Math.floor(
      remainingUnits / IMPRESSION_MICRO_UNITS,
    );
    lines.push(
      `- ${stringValue(campaign.id) ?? "unknown"}: ${
        stringValue(campaign.status) ?? "unknown"
      }, ${formatInteger(blocks * 1_000)} bought impressions, ${formatInteger(
        remainingImpressions,
      )} remaining - ${stringValue(campaign.ad_line) ?? "no ad line"}`,
    );
  }
  lines.push(rawHint());
  return `${lines.join("\n")}\n`;
}

export function formatBidCheckoutResult(payload: unknown): string {
  const data = record(payload);
  return formatLines([
    "WaitSpin advertiser checkout",
    `Block purchase: ${stringValue(data.block_purchase_id) ?? "unknown"}`,
    `Checkout URL: ${stringValue(data.checkout_url) ?? "not returned"}`,
    "Open the Checkout URL to pay. After Stripe confirms payment, the campaign appears as active inventory.",
    stringValue(record(data.checkout_disclosure).refund_policy),
    "",
    rawHint(),
  ]);
}

export function formatMarketResult(payload: unknown): string {
  const campaigns = arrayValue(record(payload).campaigns);
  const lines = ["WaitSpin public market"];
  if (!campaigns.length) {
    lines.push("No active public campaigns right now.");
    lines.push(rawHint());
    return `${lines.join("\n")}\n`;
  }

  for (const value of campaigns) {
    const campaign = record(value);
    lines.push(
      `- ${stringValue(campaign.campaign_id) ?? "unknown"}: ${formatCpm(
        campaign.bid_cpm_micros,
      )}, ${formatInteger(campaign.impressions_served)} served - ${
        stringValue(campaign.brand_name) ??
        stringValue(campaign.ad_line) ??
        "campaign"
      }`,
    );
  }
  lines.push(
    "Higher CPM campaigns are prioritized in serving rotation while eligible inventory remains.",
  );
  lines.push(rawHint());
  return `${lines.join("\n")}\n`;
}

export function formatWalletConnectResult(payload: unknown): string {
  const data = record(payload);
  return formatLines([
    "WaitSpin payout account setup",
    `Stripe onboarding URL: ${stringValue(data.onboarding_url) ?? "not returned"}`,
    "Open the URL to connect Stripe Express for publisher withdrawals.",
    "",
    rawHint(),
  ]);
}

export function formatTargetInstallResult(payload: unknown): string {
  const data = record(payload);
  const dryRun = booleanValue(data.dry_run) === true;
  const target = targetLabel(data.target);
  const title = dryRun
    ? `WaitSpin ${target} install dry run`
    : `WaitSpin ${target} install`;
  return formatLines([
    title,
    `Mode: ${stringValue(data.mode) ?? "managed"}`,
    `Install ID: ${stringValue(data.install_id) ?? "not created"}`,
    `Publisher registered: ${formatBool(data.publisher_registered)}`,
    `State: ${stringValue(data.state_path) ?? "not written"}`,
    stringValue(data.runtime_path)
      ? `Runtime: ${stringValue(data.runtime_path)}`
      : undefined,
    stringValue(data.patch_file) ? `Patch file: ${stringValue(data.patch_file)}` : undefined,
    stringValue(data.note),
    stringValue(data.human_message),
    commandLine(data.next_command),
    "",
    rawHint(),
  ]);
}

export function formatTargetStatusResult(payload: unknown): string {
  const data = record(payload);
  const target = targetLabel(data.target);
  return formatLines([
    `WaitSpin ${target} status`,
    `Status: ${statusWord(data.installed)}`,
    `Mode: ${stringValue(data.mode) ?? "managed"}`,
    `Publisher registered: ${formatBool(data.publisher_registered)}`,
    `Install ID: ${stringValue(data.install_id) ?? "none"}`,
    stringValue(data.human_message),
    stringValue(data.status_invalid_reason)
      ? `Problem: ${stringValue(data.status_invalid_reason)}`
      : undefined,
    stringValue(data.patch_invalid_reason)
      ? `Patch problem: ${stringValue(data.patch_invalid_reason)}`
      : undefined,
    commandLine(data.next_command),
    "",
    rawHint(),
  ]);
}

export function formatTargetUninstallResult(payload: unknown): string {
  const data = record(payload);
  const target = targetLabel(data.target);
  const dryRun = booleanValue(data.dry_run) === true;
  const removed = arrayValue(data.removed).length;
  const wouldRemove = arrayValue(data.would_remove).length;
  return formatLines([
    dryRun
      ? `WaitSpin ${target} uninstall dry run`
      : `WaitSpin ${target} uninstall`,
    dryRun
      ? `Would remove: ${formatInteger(wouldRemove)} path(s)`
      : `Removed: ${formatInteger(removed)} path(s)`,
    `Uninstalled: ${formatBool(data.uninstalled)}`,
    stringValue(data.human_message),
    stringValue(data.restore_refusal_reason)
      ? `Restore problem: ${stringValue(data.restore_refusal_reason)}`
      : undefined,
    "",
    rawHint(),
  ]);
}

function formatAllTargetSummary(value: unknown): string {
  const item = record(value);
  const target = targetLabel(item.target);
  const result = record(item.result);
  const installed =
    booleanValue(item.installed) ?? booleanValue(result.installed);
  const reason = stringValue(item.reason);
  const detail = stringValue(item.detail);
  const friendlyReason = reason
    ? reason.replaceAll("_", " ").replace(/\s+/g, " ")
    : undefined;
  const state = friendlyReason ?? (installed === undefined ? undefined : statusWord(installed));
  return `- ${target}${state ? `: ${state}` : ""}${detail ? ` (${detail})` : ""}`;
}

export function formatInstallAllResult(payload: unknown): string {
  const data = record(payload);
  const installed = arrayValue(data.installed);
  const wouldInstall = arrayValue(data.would_install);
  const skippedNotDetected = arrayValue(data.skipped_not_detected);
  const skippedConflict = arrayValue(data.skipped_conflict);
  const failedRollback = arrayValue(data.failed_rollback);
  return formatLines([
    "WaitSpin install all",
    `Mode: ${booleanValue(data.dry_run) ? "dry run" : "apply"}`,
    `Installed: ${formatInteger(installed.length)}`,
    `Would install: ${formatInteger(wouldInstall.length)}`,
    `Skipped, not detected: ${formatInteger(skippedNotDetected.length)}`,
    `Skipped, conflict: ${formatInteger(skippedConflict.length)}`,
    `Failed/rollback: ${formatInteger(failedRollback.length)}`,
    wouldInstall.length ? "Would install targets:" : undefined,
    ...wouldInstall.map(formatAllTargetSummary),
    installed.length ? "Installed targets:" : undefined,
    ...installed.map(formatAllTargetSummary),
    skippedConflict.length ? "Skipped conflicts:" : undefined,
    ...skippedConflict.map(formatAllTargetSummary),
    failedRollback.length ? "Failures:" : undefined,
    ...failedRollback.map(formatAllTargetSummary),
    commandLine(data.next_command),
    stringValue(data.human_message),
    "",
    rawHint(),
  ]);
}

export function formatStatusAllResult(payload: unknown): string {
  const data = record(payload);
  const installed = arrayValue(data.installed);
  const statuses = arrayValue(data.statuses);
  const failedStatus = arrayValue(data.failed_status);
  return formatLines([
    "WaitSpin status all",
    `Installed targets: ${formatInteger(installed.length)} / ${formatInteger(
      statuses.length,
    )}`,
    ...statuses.map((value) => {
      const item = record(value);
      const result = record(item.result);
      const installed =
        booleanValue(item.installed) ?? booleanValue(result.installed);
      return `- ${targetLabel(item.target)}: ${statusWord(installed)}, publisher registered: ${formatBool(
        item.publisher_registered ?? result.publisher_registered,
      )}`;
    }),
    failedStatus.length ? "Status failures:" : undefined,
    ...failedStatus.map(formatAllTargetSummary),
    "",
    rawHint(),
  ]);
}
