"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_VISIBLE_MS = exports.DEFAULT_API_BASE = void 0;
exports.isLoopbackApiHostname = isLoopbackApiHostname;
exports.normalizeTrustedApiBase = normalizeTrustedApiBase;
exports.isSafeExternalUrl = isSafeExternalUrl;
exports.parseServePayload = parseServePayload;
exports.parseWalletStatusPayload = parseWalletStatusPayload;
exports.parseLedgerPayload = parseLedgerPayload;
exports.formatMicroUnits = formatMicroUnits;
exports.renderPublisherViewHtml = renderPublisherViewHtml;
exports.DEFAULT_API_BASE = "https://api.waitspin.com";
exports.MIN_VISIBLE_MS = 5_000;
const MICRO_UNITS_PER_CENT = 10_000;
const MICRO_UNITS_PER_EURO = MICRO_UNITS_PER_CENT * 100;
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
    if (!balance || !connect || !payoutPolicy) {
        return undefined;
    }
    const availableMicroUnits = readInteger(balance.available_micro_units);
    const maturingMicroUnits = readInteger(balance.maturing_micro_units);
    const heldMicroUnits = readInteger(balance.held_micro_units);
    const pendingPayoutMicroUnits = readInteger(balance.pending_payout_micro_units);
    const lifetimeEarnedMicroUnits = readInteger(balance.lifetime_earned_micro_units);
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
            pendingPayoutMicroUnits,
            lifetimeEarnedMicroUnits,
        },
        payoutEligible: payoutPolicy.eligible === true,
        payoutBlockedReasons: readStringArray(payoutPolicy.blocked_reasons),
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
function formatMicroUnits(value) {
    const amount = value / MICRO_UNITS_PER_EURO;
    const decimals = value !== 0 && Math.abs(value) < MICRO_UNITS_PER_CENT ? 6 : 2;
    return `EUR ${trimTrailingZeros(amount.toFixed(decimals))}`;
}
function trimTrailingZeros(value) {
    return value
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, ".00");
}
function renderPublisherViewHtml(state) {
    const status = renderInstallStatus(state);
    const sponsor = renderSponsor(state);
    const wallet = renderWallet(state.walletStatus);
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
    .entry { padding: 8px 0; border-top: 1px solid var(--vscode-sideBarSectionHeader-border); }
    .entry:first-child { border-top: 0; }
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
        return `<p class="notice error">Authentication stopped. Rotate or refresh the publisher-extension key, then run WaitSpin: Start publisher polling.</p>`;
    }
    if (!state.hasApiKey || !state.installId) {
        return `<p class="notice">Install status: waiting for publisher-extension key and install ID. Run <code>waitspin extension install --target vscode</code>, then set User settings.</p>`;
    }
    const apiBase = state.apiBase ? escapeHtml(state.apiBase) : "trusted API";
    return `<p class="notice">Install status: active for <code>${escapeHtml(state.installId)}</code> on ${apiBase}.</p>`;
}
function renderSponsor(state) {
    if (state.activeServe && state.inventoryStatus === "serving") {
        return `<div class="sponsor"><p class="line">${escapeHtml(state.activeServe.line)}</p><p class="muted">Visible impression records after ${Math.round(state.activeServe.minVisibleMs / 1000)} seconds. Open the sponsor link from the Command Palette or status bar.</p></div>`;
    }
    if (state.inventoryStatus === "empty") {
        return `<p class="notice">No inventory right now. The plugin will keep polling without showing house ads.</p>`;
    }
    if (state.inventoryStatus === "polling") {
        return `<p class="notice">Polling for eligible sponsored wait-state inventory.</p>`;
    }
    if (state.inventoryStatus === "error") {
        return `<p class="notice error">Inventory refresh failed. WaitSpin will retry on the next polling interval.</p>`;
    }
    return `<p class="notice">Configure the install to start sponsor polling.</p>`;
}
function renderWallet(status) {
    if (!status) {
        return `<p class="notice">Wallet status is unavailable until a publisher-extension key with <code>wallet:read</code> refreshes successfully.</p>`;
    }
    const rows = [
        ["Available", status.balance.availableMicroUnits],
        ["Pending maturity", status.balance.maturingMicroUnits],
        ["Pending payout", status.balance.pendingPayoutMicroUnits],
        ["Held", status.balance.heldMicroUnits],
        ["Lifetime earned", status.balance.lifetimeEarnedMicroUnits],
    ];
    const blocked = status.payoutBlockedReasons.length
        ? escapeHtml(status.payoutBlockedReasons.join(", "))
        : "none";
    return `<div class="grid">${rows
        .map(([label, value]) => `<span>${escapeHtml(String(label))}</span><span class="amount">${formatMicroUnits(Number(value))}</span>`)
        .join("")}</div>
<p class="muted">Payout eligible: ${status.payoutEligible ? "yes" : "no"}; Connect: ${status.connectConnected ? "connected" : "not connected"}; payouts: ${status.payoutsEnabled ? "enabled" : "disabled"}; blockers: ${blocked}</p>`;
}
function renderLedger(entries) {
    if (!entries.length) {
        return `<p class="notice">No ledger entries yet.</p>`;
    }
    return entries
        .map((entry) => `<div class="entry">
        <p><strong>${escapeHtml(entry.eventType)}</strong> <span class="amount">${formatMicroUnits(entry.publisherMicroUnits)}</span></p>
        <p class="muted">${escapeHtml(new Date(entry.createdAt).toLocaleString())} - gross ${formatMicroUnits(entry.grossMicroUnits)}</p>
      </div>`)
        .join("");
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
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
//# sourceMappingURL=extension-core.js.map