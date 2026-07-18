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
exports.PublisherOnboardingController = void 0;
const vscode = __importStar(require("vscode"));
const extension_core_1 = require("./extension-core");
async function readJsonBody(response, log, label = "WaitSpin") {
    try {
        return await response.json();
    }
    catch (error) {
        const message = sanitizeSetupErrorMessage(error instanceof Error ? error.message : String(error));
        log?.(`${label} JSON parse failed: ${message}`);
        return undefined;
    }
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function isPublisherKeyLike(value) {
    return value.trim().startsWith("wts_live_");
}
function httpError(prefix, response) {
    return new Error(`${prefix}: HTTP ${response.status}`);
}
function sanitizeSetupErrorMessage(message) {
    return (message
        .replace(/wts_(?:live|test)_[A-Za-z0-9._-]+/g, "wts_[redacted]")
        .replace(/\bwins_[A-Za-z0-9._-]+\b/g, "[install-id]")
        .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
        .replace(/https?:\/\/[^\s)]+/g, "[url]")
        .replace(/\b(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?\b/g, "[host]")
        .slice(0, 240) || "Unknown error");
}
function isTrustedOnboardingApiBase(apiBase) {
    try {
        const parsed = new URL(apiBase);
        return (parsed.origin === extension_core_1.DEFAULT_API_BASE ||
            (0, extension_core_1.isLoopbackApiHostname)(parsed.hostname));
    }
    catch {
        return false;
    }
}
class PublisherOnboardingController {
    host;
    connectInFlight = false;
    constructor(host) {
        this.host = host;
    }
    async connectPublisher() {
        if (this.connectInFlight) {
            await vscode.window.showInformationMessage("WaitSpin setup is already running.");
            return;
        }
        this.connectInFlight = true;
        try {
            await this.connectPublisherOnce();
        }
        finally {
            this.connectInFlight = false;
        }
    }
    async connectPublisherOnce() {
        const apiBase = this.host.resolveApiBase();
        if (!apiBase || !isTrustedOnboardingApiBase(apiBase)) {
            await vscode.window.showErrorMessage("WaitSpin needs the trusted API base https://api.waitspin.com before setup can continue.");
            return;
        }
        const storedApiKey = this.host.resolveApiKey();
        const mode = await this.pickConnectMode(Boolean(storedApiKey));
        if (!mode) {
            return;
        }
        const installId = await this.pickPublisherInstallId();
        if (!installId) {
            return;
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Connecting WaitSpin",
                cancellable: false,
            }, async () => {
                const apiKey = mode === "email"
                    ? await this.verifyPublisherKeyByEmail(apiBase)
                    : mode === "stored-key"
                        ? storedApiKey
                        : await this.readExistingPublisherKey();
                if (!apiKey) {
                    return;
                }
                await this.registerAndActivatePublisher(apiBase, apiKey, mode, installId);
            });
        }
        catch (error) {
            const message = sanitizeSetupErrorMessage(error instanceof Error ? error.message : String(error));
            this.host.logWaitSpin(`WaitSpin setup failed: ${message}`);
            this.host.updatePublisherState({
                inventoryStatus: "setup",
                lastError: `WaitSpin setup failed: ${message}`,
            });
            await vscode.window.showErrorMessage(`WaitSpin setup failed: ${message}`);
        }
    }
    async pickConnectMode(hasStoredApiKey) {
        const selected = await vscode.window.showQuickPick([
            ...(hasStoredApiKey
                ? [
                    {
                        label: "Use stored extension key",
                        description: "Reuse the key already stored in VS Code SecretStorage",
                        mode: "stored-key",
                    },
                ]
                : []),
            {
                label: "Create extension key by email",
                description: "Receive a 6-digit code, then connect this VS Code install",
                mode: "email",
            },
            {
                label: "Use existing extension key",
                description: "Paste an extension API key once; it is stored in SecretStorage",
                mode: "existing-key",
            },
        ], {
            title: "Connect WaitSpin",
            placeHolder: "Choose how to connect this VS Code install",
        });
        return selected?.mode;
    }
    async verifyPublisherKeyByEmail(apiBase) {
        const email = await vscode.window.showInputBox({
            title: "WaitSpin account email",
            prompt: "Enter the email that should own this extension key.",
            ignoreFocusOut: true,
            validateInput: (value) => isValidEmail(value) ? undefined : "Enter a valid email address.",
        });
        if (!email) {
            return undefined;
        }
        const requestResponse = await this.host.fetchWithTimeout(`${apiBase}/v1/keys/request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email.trim(),
                intended_use: extension_core_1.PUBLISHER_KEY_INTENDED_USE,
            }),
        });
        if (!requestResponse.ok) {
            throw httpError("Key request failed", requestResponse);
        }
        const code = await vscode.window.showInputBox({
            title: "WaitSpin verification code",
            prompt: "Enter the 6-digit WaitSpin code from your email.",
            ignoreFocusOut: true,
            validateInput: (value) => /^\d{6}$/.test(value.trim()) ? undefined : "Enter the 6-digit code.",
        });
        if (!code) {
            return undefined;
        }
        const verifyResponse = await this.host.fetchWithTimeout(`${apiBase}/v1/keys/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email.trim(),
                code: code.trim(),
                intended_use: extension_core_1.PUBLISHER_KEY_INTENDED_USE,
            }),
        });
        if (!verifyResponse.ok) {
            throw httpError("Key verification failed", verifyResponse);
        }
        const verified = (0, extension_core_1.parseVerifiedPublisherKeyPayload)(await readJsonBody(verifyResponse, this.host.logWaitSpin, "Key verification"));
        if (!verified) {
            throw new Error("Verification did not return an extension key with wallet:read.");
        }
        return verified.apiKey;
    }
    async readExistingPublisherKey() {
        const apiKey = await vscode.window.showInputBox({
            title: "WaitSpin extension key",
            prompt: "Paste an extension API key. WaitSpin stores it in VS Code SecretStorage.",
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => isPublisherKeyLike(value)
                ? undefined
                : "Enter an extension API key beginning with wts_live_.",
        });
        return apiKey?.trim();
    }
    async pickPublisherInstallId() {
        const existingInstallId = this.host.resolveInstallId();
        if (!existingInstallId) {
            return (0, extension_core_1.generatePublisherInstallId)();
        }
        const selected = await vscode.window.showQuickPick([
            {
                label: "Reconnect this VS Code install",
                description: existingInstallId,
                installId: existingInstallId,
            },
            {
                label: "Create a new install ID",
                description: "Use this when rotating away from a compromised install",
                installId: (0, extension_core_1.generatePublisherInstallId)(),
            },
        ], {
            title: "WaitSpin install identity",
            placeHolder: "Choose how this VS Code install should be registered",
        });
        return selected?.installId;
    }
    async registerAndActivatePublisher(apiBase, apiKey, mode, installId) {
        const { walletReadable } = await this.host.activateManualCredential({
            apiBase,
            apiKey,
            installId,
            allowLegacyWalletFailure: mode === "existing-key" || mode === "stored-key",
        });
        this.host.updatePublisherState({
            apiBase,
            installId,
            hasApiKey: true,
            authStopped: false,
            inventoryStatus: "polling",
            lastError: walletReadable
                ? undefined
                : "WaitSpin connected. Wallet and ledger need a key with wallet:read.",
            lastUpdatedAt: new Date().toISOString(),
        });
        this.host.logWaitSpin(`WaitSpin connected for ${installId}.`);
        this.host.startPolling();
        await vscode.window
            .showInformationMessage(walletReadable
            ? "WaitSpin connected. Wallet and sponsor polling are starting."
            : "WaitSpin connected. Sponsor polling is starting; rotate the key to enable wallet reads.", "Open WaitSpin")
            .then((choice) => {
            if (choice === "Open WaitSpin") {
                void vscode.commands.executeCommand("workbench.view.extension.waitspin");
            }
        });
    }
}
exports.PublisherOnboardingController = PublisherOnboardingController;
//# sourceMappingURL=extension-onboarding.js.map