"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLISHER_EXTENSION_REQUIRED_SCOPES = exports.PUBLISHER_KEY_INTENDED_USE = exports.VSCODE_PUBLISHER_TARGET = exports.MIN_VISIBLE_MS = exports.DEFAULT_API_BASE = exports.formatMicroUnits = void 0;
exports.generatePublisherInstallId = generatePublisherInstallId;
exports.hasPublisherExtensionScopes = hasPublisherExtensionScopes;
exports.parseVerifiedPublisherKeyPayload = parseVerifiedPublisherKeyPayload;
exports.parsePublisherRegistrationPayload = parsePublisherRegistrationPayload;
exports.isLoopbackApiHostname = isLoopbackApiHostname;
exports.normalizeTrustedApiBase = normalizeTrustedApiBase;
exports.isSafeExternalUrl = isSafeExternalUrl;
exports.parseServePayload = parseServePayload;
exports.parseWalletStatusPayload = parseWalletStatusPayload;
exports.parseLedgerPayload = parseLedgerPayload;
exports.renderPublisherViewHtml = renderPublisherViewHtml;
const node_crypto_1 = require("node:crypto");
const extension_html_1 = require("./extension-html");
const extension_wallet_view_1 = require("./extension-wallet-view");
var extension_wallet_view_2 = require("./extension-wallet-view");
Object.defineProperty(exports, "formatMicroUnits", { enumerable: true, get: function () { return extension_wallet_view_2.formatMicroUnits; } });
exports.DEFAULT_API_BASE = "https://api.waitspin.com";
exports.MIN_VISIBLE_MS = 5_000;
exports.VSCODE_PUBLISHER_TARGET = "status-bar-fallback";
exports.PUBLISHER_KEY_INTENDED_USE = "key_profile:publisher_extension";
exports.PUBLISHER_EXTENSION_REQUIRED_SCOPES = [
    "publishers:write",
    "serve:read",
    "events:write",
    "wallet:read",
];
function generatePublisherInstallId(randomUuid = node_crypto_1.randomUUID) {
    return `wins_${randomUuid().replace(/-/g, "")}`;
}
function hasPublisherExtensionScopes(scopes) {
    return exports.PUBLISHER_EXTENSION_REQUIRED_SCOPES.every((scope) => scopes.includes(scope));
}
function parseVerifiedPublisherKeyPayload(payload) {
    const record = objectRecord(payload);
    if (!record) {
        return undefined;
    }
    const accountId = typeof record.account_id === "string" ? record.account_id.trim() : "";
    const apiKey = typeof record.api_key === "string" ? record.api_key.trim() : "";
    const keyProfile = typeof record.key_profile === "string" ? record.key_profile.trim() : "";
    const scopes = readStringArray(record.scopes);
    if (!accountId ||
        !apiKey.startsWith("wts_live_") ||
        keyProfile !== "publisher_extension" ||
        !hasPublisherExtensionScopes(scopes)) {
        return undefined;
    }
    return { accountId, apiKey, keyProfile, scopes };
}
function parsePublisherRegistrationPayload(payload) {
    const record = objectRecord(payload);
    if (!record) {
        return undefined;
    }
    const publisherId = typeof record.publisher_id === "string" ? record.publisher_id.trim() : "";
    const installId = typeof record.install_id === "string" ? record.install_id.trim() : "";
    const target = typeof record.target === "string" ? record.target.trim() : "";
    if (!publisherId || !installId || target !== exports.VSCODE_PUBLISHER_TARGET) {
        return undefined;
    }
    return { publisherId, installId, target };
}
function isLoopbackApiHostname(hostname) {
    const normalized = hostname.toLowerCase().replace(/\.$/, "");
    return (normalized === "localhost" ||
        normalized === "::1" ||
        normalized === "[::1]" ||
        /^127(?:\.\d{1,3}){3}$/.test(normalized));
}
function normalizeTrustedApiBase(value, allowDeveloperApiBase) {
    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
        const isCleanOrigin = !parsed.username &&
            !parsed.password &&
            !parsed.search &&
            !parsed.hash &&
            (parsed.pathname === "/" || parsed.pathname === "");
        const isProductionApi = parsed.protocol === "https:" &&
            hostname === "api.waitspin.com" &&
            isCleanOrigin;
        if (isProductionApi) {
            return parsed.origin;
        }
        if (allowDeveloperApiBase &&
            isCleanOrigin &&
            (parsed.protocol === "http:" || parsed.protocol === "https:") &&
            isLoopbackApiHostname(parsed.hostname)) {
            return parsed.origin;
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
function normalizeHostname(hostname) {
    return hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
}
function parseIpv4Number(value) {
    const normalized = value.toLowerCase();
    let parsed;
    if (/^0x[0-9a-f]+$/.test(normalized)) {
        parsed = Number.parseInt(normalized.slice(2), 16);
    }
    else if (/^0[0-7]+$/.test(normalized) && normalized.length > 1) {
        parsed = Number.parseInt(normalized, 8);
    }
    else if (/^\d+$/.test(normalized)) {
        parsed = Number.parseInt(normalized, 10);
    }
    else {
        return undefined;
    }
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
        return undefined;
    }
    return parsed;
}
function isBlockedPrivateIpv4(octets) {
    const [first, second] = octets;
    return (first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168));
}
function parseIpv4Octets(hostname) {
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
    if (octets.some((octet) => octet === undefined || octet < 0 || octet > 255)) {
        return undefined;
    }
    return octets;
}
function isBlockedPrivateHostname(hostname) {
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
function isSafeExternalUrl(url) {
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
        if (["metadata.google.internal", "metadata", "fd00:ec2::254"].includes(host)) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function parseServePayload(payload) {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }
    const record = payload;
    const serveId = record.serve_id;
    if (typeof serveId !== "string" || serveId.trim().length < 8) {
        return undefined;
    }
    const serveReceipt = record.serve_receipt;
    if (typeof serveReceipt !== "string" ||
        serveReceipt.trim().length < 32 ||
        serveReceipt.length > 2048) {
        return undefined;
    }
    const creative = record.creative;
    if (!creative || typeof creative !== "object") {
        return undefined;
    }
    const creativeRecord = creative;
    const line = creativeRecord.line;
    const destinationUrl = creativeRecord.destination_url;
    if (typeof line !== "string" || line.trim().length === 0) {
        return undefined;
    }
    if (typeof destinationUrl !== "string" ||
        !isSafeExternalUrl(destinationUrl)) {
        return undefined;
    }
    const minVisibleMs = typeof record.min_visible_ms === "number" &&
        Number.isFinite(record.min_visible_ms) &&
        Number.isInteger(record.min_visible_ms) &&
        record.min_visible_ms >= exports.MIN_VISIBLE_MS
        ? record.min_visible_ms
        : exports.MIN_VISIBLE_MS;
    return {
        serveId: serveId.trim(),
        line: line.trim(),
        destinationUrl: destinationUrl.trim(),
        serveReceipt: serveReceipt.trim(),
        minVisibleMs,
    };
}
function parseWalletStatusPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }
    const record = payload;
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
    const reversalDebtMicroUnits = readInteger(balance.reversal_debt_micro_units) ?? 0;
    const pendingPayoutMicroUnits = readInteger(balance.pending_payout_micro_units);
    const lifetimeEarnedMicroUnits = readInteger(balance.lifetime_earned_micro_units);
    const payoutTransferCents = readInteger(payoutPolicy.transfer_cents);
    const minPayoutCents = readInteger(payoutPolicy.min_payout_cents);
    const earningMaturityHours = readInteger(payoutPolicy.earning_maturity_hours);
    const nextEligibleAt = typeof payoutPolicy.next_eligible_at === "string" &&
        payoutPolicy.next_eligible_at.trim()
        ? payoutPolicy.next_eligible_at.trim()
        : undefined;
    const publisherTrustLevel = readInteger(publisherTrust?.level);
    const publisherTrustMaxLevel = readInteger(publisherTrust?.max_level);
    const publisherTrustStatus = typeof publisherTrust?.status === "string" && publisherTrust.status.trim()
        ? publisherTrust.status.trim()
        : undefined;
    const publisherTrustNextLevelAt = typeof publisherTrust?.next_level_at === "string" &&
        publisherTrust.next_level_at.trim()
        ? publisherTrust.next_level_at.trim()
        : undefined;
    if (availableMicroUnits === undefined ||
        maturingMicroUnits === undefined ||
        heldMicroUnits === undefined ||
        pendingPayoutMicroUnits === undefined ||
        lifetimeEarnedMicroUnits === undefined) {
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
function parseLedgerPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return [];
    }
    const entries = payload.entries;
    if (!Array.isArray(entries)) {
        return [];
    }
    return entries.flatMap((entry) => {
        const record = objectRecord(entry);
        if (!record) {
            return [];
        }
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const eventType = typeof record.event_type === "string" ? record.event_type.trim() : "";
        const createdAt = typeof record.created_at === "string" ? record.created_at.trim() : "";
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
function renderPublisherViewHtml(state) {
    const status = renderInstallStatus(state);
    const sponsor = renderSponsor(state);
    const wallet = (0, extension_wallet_view_1.renderWallet)(state.walletStatus, state.installId);
    const ledger = (0, extension_wallet_view_1.renderLedger)(state.ledgerEntries);
    const updated = state.lastUpdatedAt
        ? `Updated ${(0, extension_html_1.escapeHtml)(new Date(state.lastUpdatedAt).toLocaleString())}`
        : "Waiting for first refresh";
    const error = state.lastError
        ? `<p class="notice error">${(0, extension_html_1.escapeHtml)(state.lastError)}</p>`
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
  <h2>WaitSpin Publisher</h2>
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
function renderInstallStatus(state) {
    if (state.authStopped) {
        return `<p class="notice error">Authentication stopped. Run <code>WaitSpin: Connect publisher</code> to rotate or reconnect the publisher-extension key.</p>`;
    }
    if (!state.hasApiKey || !state.installId) {
        return `<p class="notice">Install status: setup required. Run <code>WaitSpin: Connect publisher</code> to register this VS Code install and store the publisher key in SecretStorage.</p>`;
    }
    const apiBase = state.apiBase ? (0, extension_html_1.escapeHtml)(state.apiBase) : "trusted API";
    return `<p class="notice">Install status: active for <code>${(0, extension_html_1.escapeHtml)(state.installId)}</code> on ${apiBase}.</p>`;
}
function renderSponsor(state) {
    if (state.activeServe && state.inventoryStatus === "serving") {
        return `<div class="sponsor"><p class="line">${(0, extension_html_1.escapeHtml)(state.activeServe.line)}</p><p class="muted">Visible impression records after ${Math.round(state.activeServe.minVisibleMs / 1000)} seconds. Open the sponsor link from the Command Palette or status bar.</p></div>`;
    }
    if (state.inventoryStatus === "empty") {
        return `<p class="notice">No eligible sponsor right now. This can mean the current campaigns are empty for this install today, including level-based daily exposure limits. The plugin will keep polling without showing house ads. ${extension_wallet_view_1.PUBLISHER_LEVELS_DOCS_LINK}</p>`;
    }
    if (state.inventoryStatus === "polling") {
        return `<p class="notice">Polling for eligible sponsored wait-state inventory.</p>`;
    }
    if (state.inventoryStatus === "error") {
        return `<p class="notice error">Inventory refresh failed. WaitSpin will retry on the next polling interval.</p>`;
    }
    return `<p class="notice">Connect this publisher install to start sponsor polling.</p>`;
}
function objectRecord(value) {
    return value && typeof value === "object"
        ? value
        : undefined;
}
function readInteger(value) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value)
        ? value
        : undefined;
}
function readStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => typeof item === "string");
}
//# sourceMappingURL=extension-core.js.map