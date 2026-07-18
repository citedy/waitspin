"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveActivationReceiptRegistration = resolveActivationReceiptRegistration;
exports.readEditorActivationReceipt = readEditorActivationReceipt;
exports.writeEditorActivationReceipt = writeEditorActivationReceipt;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const extension_core_1 = require("./extension-core");
const INSTALL_ID_PATTERN = /^wins_[A-Za-z0-9._-]{3,123}$/;
function resolveActivationReceiptRegistration(input) {
    if (!input.secretReadSucceeded)
        return undefined;
    if (input.receipt?.install_id === input.installId &&
        input.receipt.publisher_registered === false) {
        return false;
    }
    return Boolean(input.secretApiKey);
}
async function readEditorActivationReceipt(stateDirectory, target) {
    const receiptPath = node_path_1.default.join(stateDirectory, `${target}-install.json`);
    let parsed;
    try {
        parsed = JSON.parse(await (0, promises_1.readFile)(receiptPath, "utf8"));
    }
    catch {
        return undefined;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
    }
    const receipt = parsed;
    if (typeof receipt.install_id !== "string" ||
        !INSTALL_ID_PATTERN.test(receipt.install_id) ||
        receipt.publisher_target !== extension_core_1.VSCODE_PUBLISHER_TARGET ||
        typeof receipt.publisher_registered !== "boolean") {
        return undefined;
    }
    return {
        install_id: receipt.install_id,
        publisher_target: extension_core_1.VSCODE_PUBLISHER_TARGET,
        publisher_registered: receipt.publisher_registered,
    };
}
async function writeEditorActivationReceipt(stateDirectory, target, installId, publisherRegistered) {
    if (!INSTALL_ID_PATTERN.test(installId)) {
        throw new Error("Invalid editor activation install ID");
    }
    await (0, promises_1.mkdir)(stateDirectory, { recursive: true, mode: 0o700 });
    let directoryInfo = await (0, promises_1.lstat)(stateDirectory);
    const uid = process.getuid?.();
    if (!directoryInfo.isDirectory() ||
        directoryInfo.isSymbolicLink() ||
        (uid !== undefined && directoryInfo.uid !== uid)) {
        throw new Error("WaitSpin state directory ownership or mode is unsafe");
    }
    if (process.platform !== "win32" && (directoryInfo.mode & 0o077) !== 0) {
        await (0, promises_1.chmod)(stateDirectory, 0o700);
        directoryInfo = await (0, promises_1.lstat)(stateDirectory);
        if ((directoryInfo.mode & 0o077) !== 0) {
            throw new Error("WaitSpin state directory ownership or mode is unsafe");
        }
    }
    const receiptPath = node_path_1.default.join(stateDirectory, `${target}-install.json`);
    const temporaryPath = node_path_1.default.join(stateDirectory, `.${target}-install-${(0, node_crypto_1.randomUUID)()}.tmp`);
    let temporaryExists = false;
    try {
        await (0, promises_1.writeFile)(temporaryPath, `${JSON.stringify({
            install_id: installId,
            publisher_target: extension_core_1.VSCODE_PUBLISHER_TARGET,
            publisher_registered: publisherRegistered,
        }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        temporaryExists = true;
        await (0, promises_1.rename)(temporaryPath, receiptPath);
        temporaryExists = false;
    }
    finally {
        if (temporaryExists)
            await (0, promises_1.unlink)(temporaryPath).catch(() => undefined);
    }
}
//# sourceMappingURL=extension-state.js.map