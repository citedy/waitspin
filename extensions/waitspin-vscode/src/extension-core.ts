import { randomUUID } from "node:crypto";
import { escapeHtml } from "./extension-html";
import {
  PUBLISHER_LEVELS_DOCS_LINK,
  renderLedger,
  renderWallet,
} from "./extension-wallet-view";

export { formatMicroUnits } from "./extension-wallet-view";

export const DEFAULT_API_BASE = "https://api.waitspin.com";
export const MIN_VISIBLE_MS = 5_000;
export const VSCODE_PUBLISHER_TARGET = "status-bar-fallback";
export const PUBLISHER_KEY_INTENDED_USE = "key_profile:publisher_extension";
export const PUBLISHER_EXTENSION_REQUIRED_SCOPES = [
  "publishers:write",
  "serve:read",
  "events:write",
  "wallet:read",
] as const;

export type ServeCreative = {
  serveId: string;
  campaignId?: string;
  line: string;
  destinationUrl: string;
  serveReceipt: string;
  expiresAt: string;
  expiresAtMs: number;
  minVisibleMs: number;
};

export type WalletStatus = {
  balance: {
    availableMicroUnits: number;
    maturingMicroUnits: number;
    heldMicroUnits: number;
    reversalDebtMicroUnits: number;
    pendingPayoutMicroUnits: number;
    lifetimeEarnedMicroUnits: number;
  };
  payoutEligible: boolean;
  payoutBlockedReasons: string[];
  payoutTransferCents?: number;
  minPayoutCents?: number;
  earningMaturityHours?: number;
  nextEligibleAt?: string;
  publisherTrustLevel?: number;
  publisherTrustMaxLevel?: number;
  publisherTrustStatus?: string;
  publisherTrustNextLevelAt?: string;
  connectConnected: boolean;
  payoutsEnabled: boolean;
};

export type WalletLedgerEntry = {
  id: string;
  eventType: string;
  publisherMicroUnits: number;
  grossMicroUnits: number;
  createdAt: string;
};

export type PublisherViewState = {
  apiBase?: string;
  installId?: string;
  hasApiKey: boolean;
  authStopped: boolean;
  inventoryStatus: "setup" | "polling" | "serving" | "empty" | "error";
  activeServe?: ServeCreative;
  walletStatus?: WalletStatus;
  ledgerEntries: WalletLedgerEntry[];
  lastUpdatedAt?: string;
  lastError?: string;
};

export type VerifiedPublisherKey = {
  accountId: string;
  apiKey: string;
  keyProfile: string;
  scopes: string[];
};

export type PublisherRegistration = {
  publisherId: string;
  installId: string;
  target: string;
};

export function generatePublisherInstallId(
  randomUuid: () => string = randomUUID,
): string {
  return `wins_${randomUuid().replace(/-/g, "")}`;
}

export function hasPublisherExtensionScopes(scopes: readonly string[]): boolean {
  return PUBLISHER_EXTENSION_REQUIRED_SCOPES.every((scope) =>
    scopes.includes(scope),
  );
}

export function parseVerifiedPublisherKeyPayload(
  payload: unknown,
): VerifiedPublisherKey | undefined {
  const record = objectRecord(payload);
  if (!record) {
    return undefined;
  }
  const accountId =
    typeof record.account_id === "string" ? record.account_id.trim() : "";
  const apiKey = typeof record.api_key === "string" ? record.api_key.trim() : "";
  const keyProfile =
    typeof record.key_profile === "string" ? record.key_profile.trim() : "";
  const scopes = readStringArray(record.scopes);
  if (
    !accountId ||
    !apiKey.startsWith("wts_live_") ||
    keyProfile !== "publisher_extension" ||
    !hasPublisherExtensionScopes(scopes)
  ) {
    return undefined;
  }
  return { accountId, apiKey, keyProfile, scopes };
}

export function parsePublisherRegistrationPayload(
  payload: unknown,
): PublisherRegistration | undefined {
  const record = objectRecord(payload);
  if (!record) {
    return undefined;
  }
  const publisherId =
    typeof record.publisher_id === "string" ? record.publisher_id.trim() : "";
  const installId =
    typeof record.install_id === "string" ? record.install_id.trim() : "";
  const target = typeof record.target === "string" ? record.target.trim() : "";
  if (!publisherId || !installId || target !== VSCODE_PUBLISHER_TARGET) {
    return undefined;
  }
  return { publisherId, installId, target };
}

export function isLoopbackApiHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function normalizeTrustedApiBase(
  value: string,
  allowDeveloperApiBase: boolean,
): string | undefined {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const isCleanOrigin =
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.pathname === "/" || parsed.pathname === "");
    const isProductionApi =
      parsed.protocol === "https:" &&
      hostname === "api.waitspin.com" &&
      isCleanOrigin;
    if (isProductionApi) {
      return parsed.origin;
    }

    if (
      allowDeveloperApiBase &&
      isCleanOrigin &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackApiHostname(parsed.hostname)
    ) {
      return parsed.origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
}

function parseIpv4Number(value: string): number | undefined {
  const normalized = value.toLowerCase();
  let parsed: number;
  if (/^0x[0-9a-f]+$/.test(normalized)) {
    parsed = Number.parseInt(normalized.slice(2), 16);
  } else if (/^0[0-7]+$/.test(normalized) && normalized.length > 1) {
    parsed = Number.parseInt(normalized, 8);
  } else if (/^\d+$/.test(normalized)) {
    parsed = Number.parseInt(normalized, 10);
  } else {
    return undefined;
  }
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    return undefined;
  }
  return parsed;
}

function isBlockedPrivateIpv4(octets: readonly number[]): boolean {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseIpv4Octets(hostname: string): number[] | undefined {
  const singleNumber = parseIpv4Number(hostname);
  if (singleNumber !== undefined) {
    return [
      (singleNumber >>> 24) & 255,
      (singleNumber >>> 16) & 255,
      (singleNumber >>> 8) & 255,
      singleNumber & 255,
    ];
  }

  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const octets = parts.map(parseIpv4Number);
  if (
    octets.some((octet) => octet === undefined || octet < 0 || octet > 255)
  ) {
    return undefined;
  }
  return octets as number[];
}

function isBlockedPrivateHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  const ipv4Octets = parseIpv4Octets(host);
  if (ipv4Octets && isBlockedPrivateIpv4(ipv4Octets)) {
    return true;
  }
  if (["localhost", "127.0.0.1", "0.0.0.0", "::", "::1"].includes(host)) {
    return true;
  }
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) {
    return true;
  }
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) {
    return true;
  }
  if (/^169\.254\./.test(host)) {
    return true;
  }
  if (host.startsWith("::ffff:") || host.startsWith("0:0:0:0:0:ffff:")) {
    return true;
  }
  if (host.startsWith("fe80:") || /^(fc|fd)[0-9a-f]{0,2}:/.test(host)) {
    return true;
  }
  return false;
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const { hostname, password, protocol, username } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }
    if (username || password) {
      return false;
    }
    const host = normalizeHostname(hostname);
    if (isBlockedPrivateHostname(host)) {
      return false;
    }
    if (
      ["metadata.google.internal", "metadata", "fd00:ec2::254"].includes(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseServePayload(payload: unknown): ServeCreative | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const serveId = record.serve_id;
  if (typeof serveId !== "string" || serveId.trim().length < 8) {
    return undefined;
  }
  const serveReceipt = record.serve_receipt;
  if (
    typeof serveReceipt !== "string" ||
    serveReceipt.trim().length < 32 ||
    serveReceipt.length > 2048
  ) {
    return undefined;
  }
  const creative = record.creative;
  if (!creative || typeof creative !== "object") {
    return undefined;
  }
  const creativeRecord = creative as Record<string, unknown>;
  const campaignId = creativeRecord.campaign_id;
  const line = creativeRecord.line;
  const destinationUrl = creativeRecord.destination_url;
  if (typeof line !== "string" || line.trim().length === 0) {
    return undefined;
  }
  if (
    typeof destinationUrl !== "string" ||
    !isSafeExternalUrl(destinationUrl)
  ) {
    return undefined;
  }
  const minVisibleMs =
    typeof record.min_visible_ms === "number" &&
    Number.isFinite(record.min_visible_ms) &&
    Number.isInteger(record.min_visible_ms) &&
    record.min_visible_ms >= MIN_VISIBLE_MS
      ? record.min_visible_ms
      : MIN_VISIBLE_MS;
  const expiresAt = record.expires_at;
  if (typeof expiresAt !== "string" || expiresAt.trim().length === 0) {
    return undefined;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return undefined;
  }
  return {
    serveId: serveId.trim(),
    campaignId:
      typeof campaignId === "string" && campaignId.trim().length > 0
        ? campaignId.trim()
        : undefined,
    line: line.trim(),
    destinationUrl: destinationUrl.trim(),
    serveReceipt: serveReceipt.trim(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    minVisibleMs,
  };
}

export function isServeExpired(
  serve: Pick<ServeCreative, "expiresAtMs">,
  nowMs = Date.now(),
  safetyMs = 0,
): boolean {
  return nowMs + safetyMs >= serve.expiresAtMs;
}

export function serveExpiryDelayMs(
  serve: Pick<ServeCreative, "expiresAtMs">,
  nowMs = Date.now(),
): number {
  return Math.max(0, serve.expiresAtMs - nowMs);
}

export function parseWalletStatusPayload(payload: unknown): WalletStatus | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const balance = objectRecord(record.balance);
  const connect = objectRecord(record.connect);
  const payoutPolicy = objectRecord(record.payout_policy);
  const publisherTrust = objectRecord(record.publisher_trust);
  if (!balance || !connect || !payoutPolicy) {
    return undefined;
  }

  const availableMicroUnits = readInteger(balance.available_micro_units);
  const maturingMicroUnits = readInteger(balance.maturing_micro_units);
  const heldMicroUnits = readInteger(balance.held_micro_units);
  const reversalDebtMicroUnits =
    readInteger(balance.reversal_debt_micro_units) ?? 0;
  const pendingPayoutMicroUnits = readInteger(balance.pending_payout_micro_units);
  const lifetimeEarnedMicroUnits = readInteger(
    balance.lifetime_earned_micro_units,
  );
  const payoutTransferCents = readInteger(payoutPolicy.transfer_cents);
  const minPayoutCents = readInteger(payoutPolicy.min_payout_cents);
  const earningMaturityHours = readInteger(
    payoutPolicy.earning_maturity_hours,
  );
  const nextEligibleAt =
    typeof payoutPolicy.next_eligible_at === "string" &&
    payoutPolicy.next_eligible_at.trim()
      ? payoutPolicy.next_eligible_at.trim()
      : undefined;
  const publisherTrustLevel = readInteger(publisherTrust?.level);
  const publisherTrustMaxLevel = readInteger(publisherTrust?.max_level);
  const publisherTrustStatus =
    typeof publisherTrust?.status === "string" && publisherTrust.status.trim()
      ? publisherTrust.status.trim()
      : undefined;
  const publisherTrustNextLevelAt =
    typeof publisherTrust?.next_level_at === "string" &&
    publisherTrust.next_level_at.trim()
      ? publisherTrust.next_level_at.trim()
      : undefined;
  if (
    availableMicroUnits === undefined ||
    maturingMicroUnits === undefined ||
    heldMicroUnits === undefined ||
    pendingPayoutMicroUnits === undefined ||
    lifetimeEarnedMicroUnits === undefined
  ) {
    return undefined;
  }

  return {
    balance: {
      availableMicroUnits,
      maturingMicroUnits,
      heldMicroUnits,
      reversalDebtMicroUnits,
      pendingPayoutMicroUnits,
      lifetimeEarnedMicroUnits,
    },
    payoutEligible: payoutPolicy.eligible === true,
    payoutBlockedReasons: readStringArray(payoutPolicy.blocked_reasons),
    payoutTransferCents,
    minPayoutCents,
    earningMaturityHours,
    nextEligibleAt,
    publisherTrustLevel,
    publisherTrustMaxLevel,
    publisherTrustStatus,
    publisherTrustNextLevelAt,
    connectConnected: connect.connected === true,
    payoutsEnabled: connect.payouts_enabled === true,
  };
}

export function parseLedgerPayload(payload: unknown): WalletLedgerEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const entries = (payload as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry): WalletLedgerEntry[] => {
    const record = objectRecord(entry);
    if (!record) {
      return [];
    }
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const eventType =
      typeof record.event_type === "string" ? record.event_type.trim() : "";
    const createdAt =
      typeof record.created_at === "string" ? record.created_at.trim() : "";
    if (!id || !eventType || !createdAt) {
      return [];
    }
    const publisherMicroUnits = readInteger(record.publisher_micro_units);
    const grossMicroUnits = readInteger(record.gross_micro_units);
    if (publisherMicroUnits === undefined || grossMicroUnits === undefined) {
      return [];
    }
    return [
      {
        id,
        eventType,
        publisherMicroUnits,
        grossMicroUnits,
        createdAt,
      },
    ];
  });
}

export function renderPublisherViewHtml(state: PublisherViewState): string {
  const status = renderInstallStatus(state);
  const sponsor = renderSponsor(state);
  const wallet = renderWallet(state.walletStatus, state.installId);
  const ledger = renderLedger(state.ledgerEntries);
  const updated = state.lastUpdatedAt
    ? `Updated ${escapeHtml(new Date(state.lastUpdatedAt).toLocaleString())}`
    : "Waiting for first refresh";
  const error = state.lastError
    ? `<p class="notice error">${escapeHtml(state.lastError)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    h2 { margin: 0 0 10px; font-size: 13px; font-weight: 700; }
    h3 { margin: 18px 0 8px; font-size: 11px; letter-spacing: 0; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    p { margin: 0 0 8px; line-height: 1.45; }
    .muted { color: var(--vscode-descriptionForeground); }
    .notice { border-left: 2px solid var(--vscode-focusBorder); padding: 8px 10px; background: var(--vscode-editorWidget-background); }
    .error { border-left-color: var(--vscode-errorForeground); }
    .sponsor { padding: 10px; border: 1px solid var(--vscode-sideBarSectionHeader-border); background: var(--vscode-editor-background); }
    .line { font-weight: 650; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; }
    .amount { font-variant-numeric: tabular-nums; }
    .status { margin-top: 10px; }
    .status-title { font-weight: 650; }
    .reason { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-sideBarSectionHeader-border); }
    .reason:first-child { border-top: 0; padding-top: 0; }
    .entry { padding: 8px 0; border-top: 1px solid var(--vscode-sideBarSectionHeader-border); }
    .entry:first-child { border-top: 0; }
    a { color: var(--vscode-textLink-foreground); }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h2>WaitSpin</h2>
  ${status}
  ${error}
  <h3>Sponsor</h3>
  ${sponsor}
  <h3>Wallet</h3>
  ${wallet}
  <h3>Recent Ledger</h3>
  ${ledger}
  <p class="muted">${updated}</p>
</body>
</html>`;
}

function renderInstallStatus(state: PublisherViewState): string {
  if (state.authStopped) {
    return `<p class="notice error">Authentication stopped. Run <code>WaitSpin: Connect and earn</code> to rotate or reconnect the extension key.</p>`;
  }
  if (!state.hasApiKey || !state.installId) {
    return `<p class="notice">Install status: setup required. Run <code>WaitSpin: Connect and earn</code> to connect this VS Code install and store the extension key in SecretStorage.</p>`;
  }
  const apiBase = state.apiBase ? escapeHtml(state.apiBase) : "trusted API";
  return `<p class="notice">Install status: active for <code>${escapeHtml(state.installId)}</code> on ${apiBase}.</p>`;
}

function renderSponsor(state: PublisherViewState): string {
  if (state.activeServe && state.inventoryStatus === "serving") {
    return `<div class="sponsor"><p class="line">${escapeHtml(state.activeServe.line)}</p><p class="muted">Visible impression records after ${Math.round(state.activeServe.minVisibleMs / 1000)} seconds. Open the sponsor link from the Command Palette or status bar.</p></div>`;
  }
  if (state.inventoryStatus === "empty") {
    return `<p class="notice">No eligible sponsor right now. This can mean the current campaigns are empty for this install today, including level-based daily exposure limits. The plugin will keep polling without showing house ads. ${PUBLISHER_LEVELS_DOCS_LINK}</p>`;
  }
  if (state.inventoryStatus === "polling") {
    return `<p class="notice">Polling for eligible sponsored wait-state inventory.</p>`;
  }
  if (state.inventoryStatus === "error") {
    return `<p class="notice error">Inventory refresh failed. WaitSpin will retry on the next polling interval.</p>`;
  }
  return `<p class="notice">Connect WaitSpin to start sponsor polling.</p>`;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
