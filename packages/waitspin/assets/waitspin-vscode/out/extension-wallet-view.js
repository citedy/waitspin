"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLISHER_LEVELS_DOCS_LINK = void 0;
exports.formatMicroUnits = formatMicroUnits;
exports.renderWallet = renderWallet;
exports.renderLedger = renderLedger;
const extension_html_1 = require("./extension-html");
const MICRO_UNITS_PER_CENT = 10_000;
const MICRO_UNITS_PER_EURO = MICRO_UNITS_PER_CENT * 100;
const PUBLISHER_LEVELS_DOCS_URL = "https://waitspin.com/docs#publisher-levels-and-limits";
const PUBLISHER_LEVELS_LINK_TOKEN = "__WAITSPIN_PUBLISHER_LEVELS_LINK__";
exports.PUBLISHER_LEVELS_DOCS_LINK = `<a href="${PUBLISHER_LEVELS_DOCS_URL}" rel="noopener noreferrer">Publisher levels and limits</a>`;
const WALLET_PAYOUT_DOCS_URL = "https://waitspin.com/docs#publisher-wallet-and-payouts";
const WALLET_CONNECT_BASE_URL = "https://waitspin.com/wallet/connect";
function formatMicroUnits(value) {
    const amount = value / MICRO_UNITS_PER_EURO;
    const decimals = value !== 0 && Math.abs(value) < MICRO_UNITS_PER_CENT ? 6 : 2;
    return `EUR ${trimTrailingZeros(amount.toFixed(decimals))}`;
}
function renderWallet(status, installId) {
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
    if (status.balance.reversalDebtMicroUnits > 0) {
        rows.splice(4, 0, ["Reversal debt", status.balance.reversalDebtMicroUnits]);
    }
    return `<div class="grid">${rows
        .map(([label, value]) => `<span>${(0, extension_html_1.escapeHtml)(String(label))}</span><span class="amount">${formatMicroUnits(Number(value))}</span>`)
        .join("")}</div>
${renderPayoutSummary(status, installId)}`;
}
function renderLedger(entries) {
    if (!entries.length) {
        return `<p class="notice">No ledger entries yet.</p>`;
    }
    return entries
        .map((entry) => `<div class="entry">
        <p><strong>${(0, extension_html_1.escapeHtml)(entry.eventType)}</strong> <span class="amount">${formatMicroUnits(entry.publisherMicroUnits)}</span></p>
        <p class="muted">${(0, extension_html_1.escapeHtml)(new Date(entry.createdAt).toLocaleString())} - gross ${formatMicroUnits(entry.grossMicroUnits)}</p>
      </div>`)
        .join("");
}
function renderPayoutSummary(status, installId) {
    if (status.payoutEligible) {
        return `<div class="notice status"><p class="status-title">Payout status: Ready</p><p>Your matured available balance is eligible for the next payout run.</p><p class="muted"><a href="${WALLET_PAYOUT_DOCS_URL}">Wallet and payout details</a></p></div>`;
    }
    return `<div class="notice status"><p class="status-title">Payout status: Not ready yet</p><p class="muted">This wallet view loaded through your VS Code publisher install. Payout readiness is separate: earnings must mature, the available balance must reach the minimum, and a payout account may need setup.</p>${renderPayoutReasons(status)}${renderPayoutActions(status, installId)}</div>`;
}
function renderPayoutReasons(status) {
    const reasonSet = new Set(status.payoutBlockedReasons);
    const reasons = [];
    if (reasonSet.has("connect_account_missing") || !status.connectConnected) {
        reasons.push("Payout account: Not set up. Add a Stripe Express payout account before withdrawals; this is separate from the VS Code plugin connection. Use Set up payout account below.");
    }
    else if (reasonSet.has("connect_details_not_submitted")) {
        reasons.push("Payout account: Onboarding is incomplete. Finish the payout account details before withdrawals.");
    }
    else if (reasonSet.has("connect_payouts_not_enabled") ||
        reasonSet.has("payouts_disabled") ||
        !status.payoutsEnabled) {
        reasons.push("Payout account: Waiting for Stripe payouts to be enabled on the connected account.");
    }
    if (reasonSet.has("earnings_maturing") ||
        status.balance.maturingMicroUnits > 0) {
        const maturityWindow = status.earningMaturityHours
            ? ` after about ${status.earningMaturityHours} hours`
            : "";
        const nextEligibleAt = formatOptionalDateTime(status.nextEligibleAt);
        const nextEligible = nextEligibleAt
            ? ` Next eligible check: ${nextEligibleAt}.`
            : "";
        const trustLevel = renderPublisherLevelSentence(status);
        reasons.push(`Earnings: Maturing. ${formatMicroUnits(status.balance.maturingMicroUnits)} is recorded but not withdrawable yet${maturityWindow}.${trustLevel}${nextEligible}`);
    }
    if (reasonSet.has("balance_below_minimum")) {
        const minimum = status.minPayoutCents !== undefined
            ? formatCents(status.minPayoutCents)
            : "the minimum payout";
        const payoutable = status.payoutTransferCents !== undefined
            ? formatCents(status.payoutTransferCents)
            : formatMicroUnits(Math.max(status.balance.availableMicroUnits -
                status.balance.reversalDebtMicroUnits, 0));
        const reversalDebt = status.balance.reversalDebtMicroUnits > 0
            ? ` Reversal debt: ${formatMicroUnits(status.balance.reversalDebtMicroUnits)}.`
            : "";
        reasons.push(`Balance: Below minimum. Payoutable now: ${payoutable}; minimum payout: ${minimum}.${reversalDebt}`);
    }
    if (reasonSet.has("payout_cadence_cooldown")) {
        const nextEligibleAt = formatOptionalDateTime(status.nextEligibleAt);
        const nextEligible = nextEligibleAt
            ? ` Next payout window: ${nextEligibleAt}.`
            : "";
        reasons.push(`Payout timing: Waiting for the next scheduled payout window.${nextEligible}`);
    }
    if (reasonSet.has("reversal_debt_outstanding")) {
        reasons.push("Balance: Previous refunds or reversals must be settled before payout.");
    }
    if (reasonSet.has("publisher_quarantined") ||
        reasonSet.has("risk_score_payout_hold") ||
        reasonSet.has("risk_score_quarantine")) {
        reasons.push("Account review: Payouts are paused while WaitSpin reviews publisher risk signals.");
    }
    if (reasonSet.has("stale_pending_payout")) {
        reasons.push("Payout status: A previous payout is still being reconciled.");
    }
    if (!reasons.length) {
        reasons.push("Payout status: Waiting for the next wallet refresh.");
    }
    return reasons
        .map((reason) => `<p class="reason">${renderReasonText(reason)}</p>`)
        .join("");
}
function renderPayoutActions(status, installId) {
    const reasonSet = new Set(status.payoutBlockedReasons);
    const actionHref = reasonSet.has("connect_account_missing") || !status.connectConnected
        ? payoutConnectUrl(installId)
        : reasonSet.has("connect_details_not_submitted")
            ? payoutConnectUrl(installId)
            : undefined;
    const actionLabel = reasonSet.has("connect_details_not_submitted")
        ? "Finish payout onboarding"
        : "Set up payout account";
    const primary = actionHref
        ? `<a href="${(0, extension_html_1.escapeHtml)(actionHref)}">${actionLabel}</a> · `
        : "";
    return `<p class="muted">${primary}<a href="${WALLET_PAYOUT_DOCS_URL}">Wallet and payout details</a></p>`;
}
function payoutConnectUrl(installId) {
    const url = new URL(WALLET_CONNECT_BASE_URL);
    url.searchParams.set("source", "vscode");
    if (installId) {
        url.searchParams.set("install_id", installId);
    }
    return url.toString();
}
function renderReasonText(reason) {
    return (0, extension_html_1.escapeHtml)(reason).replaceAll(PUBLISHER_LEVELS_LINK_TOKEN, exports.PUBLISHER_LEVELS_DOCS_LINK);
}
function publisherLevelStatusLabel(status) {
    if (!status) {
        return undefined;
    }
    switch (status) {
        case "warming":
            return "warming up";
        case "max":
            return "maximum level";
        case "downranked":
            return "limited after risk signals";
        case "frozen":
            return "paused for review";
        default:
            return undefined;
    }
}
function renderPublisherLevelSentence(status) {
    if (status.publisherTrustLevel === undefined ||
        status.publisherTrustMaxLevel === undefined) {
        return "";
    }
    const label = publisherLevelStatusLabel(status.publisherTrustStatus);
    const nextLevelAt = formatOptionalDateTime(status.publisherTrustNextLevelAt);
    const nextLevel = nextLevelAt
        ? ` Next level window: ${nextLevelAt}.`
        : " Level can rise by 1 after each clean 24h period of billable activity.";
    const labelText = label ? `, ${label}` : "";
    return ` Publisher level: ${status.publisherTrustLevel}/${status.publisherTrustMaxLevel}${labelText}.${nextLevel} Level limits affect how much one install can receive from a campaign each day; they do not mean the plugin is disconnected. Details: ${PUBLISHER_LEVELS_LINK_TOKEN}.`;
}
function formatCents(value) {
    return `EUR ${(value / 100).toFixed(2)}`;
}
function formatOptionalDateTime(value) {
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return undefined;
    }
    return date.toLocaleString();
}
function trimTrailingZeros(value) {
    return value
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, ".00");
}
//# sourceMappingURL=extension-wallet-view.js.map