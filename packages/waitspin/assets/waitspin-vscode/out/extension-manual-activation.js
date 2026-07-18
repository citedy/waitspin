"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateManualWallet = validateManualWallet;
exports.registerManualPublisher = registerManualPublisher;
const extension_core_1 = require("./extension-core");
const extension_activation_retry_1 = require("./extension-activation-retry");
async function validateManualWallet(input, pending) {
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    const response = await input.fetchWithTimeout(`${pending.apiBase}/v1/wallet/status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${pending.apiKey}` },
        signal: input.signal,
    });
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    if (response.status === 401 || response.status === 403) {
        if (pending.allowLegacyWalletFailure)
            return false;
        throw new Error("extension key cannot read wallet status; rotate it with wallet:read");
    }
    if (!response.ok) {
        throw new Error(`wallet validation failed with HTTP ${response.status}`);
    }
    const wallet = (0, extension_core_1.parseWalletStatusPayload)(await response.json());
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    if (!wallet)
        throw new Error("wallet validation response failed validation");
    return true;
}
async function registerManualPublisher(input, pending) {
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    const response = await input.fetchWithTimeout(`${pending.apiBase}/v1/publishers/register`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${pending.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            install_id: pending.installId,
            target: extension_core_1.VSCODE_PUBLISHER_TARGET,
        }),
        signal: input.signal,
    });
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    if (!response.ok) {
        throw new Error(`publisher registration failed with HTTP ${response.status}`);
    }
    const registration = (0, extension_core_1.parsePublisherRegistrationPayload)(await response.json());
    (0, extension_activation_retry_1.assertEditorActivationCurrent)(input.signal, "promotion");
    if (!registration || registration.installId !== pending.installId) {
        throw new Error("publisher registration response failed validation");
    }
}
//# sourceMappingURL=extension-manual-activation.js.map