"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublisherWalletController = void 0;
const vscode = __importStar(require("vscode"));
const extension_core_1 = require("./extension-core");
const WALLET_REFRESH_INTERVAL_MS = 5 * 60_000;
async function readJsonBody(response) {
    try {
        return await response.json();
    }
    catch {
        return undefined;
    }
}
class PublisherWalletController {
    host;
    walletReadStopped = false;
    lastWalletRefreshStartedAt = 0;
    constructor(host) {
        this.host = host;
    }
    reset() {
        this.walletReadStopped = false;
        this.lastWalletRefreshStartedAt = 0;
    }
    resetThrottle() {
        this.lastWalletRefreshStartedAt = 0;
    }
    async refresh(showMessage) {
        if (this.walletReadStopped && !showMessage) {
            return;
        }
        const now = Date.now();
        if (!showMessage &&
            now - this.lastWalletRefreshStartedAt < WALLET_REFRESH_INTERVAL_MS) {
            return;
        }
        this.lastWalletRefreshStartedAt = now;
        const apiKey = this.host.resolveApiKey();
        const apiBase = this.host.resolveApiBase();
        if (!apiKey || !apiBase) {
            this.host.refreshConfiguredState();
            return;
        }
        try {
            const statusResponse = await this.host.fetchWithTimeout(`${apiBase}/v1/wallet/status`, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (this.host.isAuthError(statusResponse.status)) {
                this.stopForAuth(`Wallet auth failed (HTTP ${statusResponse.status}). Create an extension key with wallet:read and update WaitSpin settings.`, showMessage);
                return;
            }
            if (!statusResponse.ok) {
                this.host.updatePublisherState({
                    lastError: `Wallet status failed: HTTP ${statusResponse.status}`,
                });
                return;
            }
            const walletStatus = (0, extension_core_1.parseWalletStatusPayload)(await readJsonBody(statusResponse));
            if (!walletStatus) {
                this.host.updatePublisherState({
                    lastError: "Wallet status failed validation",
                });
                return;
            }
            const ledgerResponse = await this.host.fetchWithTimeout(`${apiBase}/v1/wallet/ledger?limit=5`, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (this.host.isAuthError(ledgerResponse.status)) {
                this.stopForAuth(`Wallet ledger auth failed (HTTP ${ledgerResponse.status}). Create an extension key with wallet:read and update WaitSpin settings.`, showMessage);
                return;
            }
            if (!ledgerResponse.ok) {
                this.host.updatePublisherState({
                    walletStatus,
                    lastUpdatedAt: new Date().toISOString(),
                    lastError: `Wallet ledger failed: HTTP ${ledgerResponse.status}`,
                });
                return;
            }
            this.walletReadStopped = false;
            this.host.updatePublisherState({
                walletStatus,
                ledgerEntries: (0, extension_core_1.parseLedgerPayload)(await readJsonBody(ledgerResponse)),
                lastUpdatedAt: new Date().toISOString(),
                lastError: undefined,
            });
            if (showMessage) {
                void vscode.window.showInformationMessage("WaitSpin wallet refreshed.");
            }
        }
        catch (error) {
            const message = `Wallet refresh failed: ${error instanceof Error ? error.message : String(error)}`;
            this.host.updatePublisherState({ lastError: message });
            this.host.logWaitSpin(message);
        }
    }
    stopForAuth(message, showMessage) {
        this.walletReadStopped = true;
        this.host.updatePublisherState({
            walletStatus: undefined,
            ledgerEntries: [],
            lastUpdatedAt: new Date().toISOString(),
            lastError: `${message} Sponsor polling will continue.`,
        });
        this.host.logWaitSpin(`${message} Sponsor polling will continue.`);
        if (showMessage) {
            void vscode.window.showWarningMessage(`WaitSpin: ${message}`);
        }
    }
}
exports.PublisherWalletController = PublisherWalletController;
//# sourceMappingURL=extension-wallet.js.map