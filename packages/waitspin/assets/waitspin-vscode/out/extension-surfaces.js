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
exports.PublisherSurfaces = void 0;
exports.statusBarWalletText = statusBarWalletText;
const vscode = __importStar(require("vscode"));
const extension_core_1 = require("./extension-core");
const INITIAL_PUBLISHER_STATE = {
    hasApiKey: false,
    authStopped: false,
    inventoryStatus: "setup",
    ledgerEntries: [],
};
class PublisherViewProvider {
    state;
    onVisibilityChange;
    view;
    visibilityListener;
    constructor(state, onVisibilityChange) {
        this.state = state;
        this.onVisibilityChange = onVisibilityChange;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: false,
            localResourceRoots: [],
        };
        this.visibilityListener?.dispose();
        this.visibilityListener = webviewView.onDidChangeVisibility(this.onVisibilityChange);
        this.refresh();
        this.onVisibilityChange();
    }
    update(state) {
        this.state = state;
        this.refresh();
    }
    refresh() {
        if (!this.view) {
            return;
        }
        this.view.webview.html = (0, extension_core_1.renderPublisherViewHtml)(this.state);
    }
    isVisible() {
        return this.view?.visible === true;
    }
    dispose() {
        this.visibilityListener?.dispose();
    }
}
function statusBarWalletText(status) {
    if (!status) {
        return "WaitSpin polling";
    }
    return `WaitSpin ${(0, extension_core_1.formatMicroUnits)(status.balance.availableMicroUnits)}`;
}
class PublisherSurfaces {
    statusBarItem;
    statusBarSponsorVisible = false;
    state = INITIAL_PUBLISHER_STATE;
    publisherViewProvider;
    register(context, onVisibilityChange) {
        this.publisherViewProvider = new PublisherViewProvider(this.state, onVisibilityChange);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider("waitspin.publisherView", this.publisherViewProvider));
    }
    updateState(patch) {
        this.state = {
            ...this.state,
            ...patch,
        };
        this.publisherViewProvider?.update(this.state);
        this.updateStatusBarMiniState();
    }
    dispose() {
        this.statusBarItem?.dispose();
        this.publisherViewProvider?.dispose();
    }
    hasVisibleSponsorSurface() {
        return (this.publisherViewProvider?.isVisible() === true ||
            this.statusBarSponsorVisible);
    }
    ensureStatusBarFallback() {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
            this.statusBarItem.command = "waitspin.openAd";
            this.statusBarItem.tooltip = "WaitSpin sponsored message (fallback surface)";
        }
        return this.statusBarItem;
    }
    updateStatusBarMiniState() {
        const item = this.ensureStatusBarFallback();
        if (this.state.activeServe && this.state.inventoryStatus === "serving") {
            item.text = `$(sync~spin) ${this.state.activeServe.line}`;
            item.tooltip = "WaitSpin sponsored message";
            item.command = "waitspin.openAd";
            this.statusBarSponsorVisible = true;
            item.show();
            return;
        }
        this.statusBarSponsorVisible = false;
        if (!this.state.hasApiKey || !this.state.installId) {
            item.text = "$(plug) WaitSpin setup";
            item.tooltip = "Connect WaitSpin to earn while AI responds.";
            item.command = "waitspin.connectPublisher";
            item.show();
            return;
        }
        if (this.state.authStopped) {
            item.text = "$(error) WaitSpin auth";
            item.tooltip = "Reconnect or rotate the WaitSpin extension key";
            item.command = "waitspin.connectPublisher";
            item.show();
            return;
        }
        if (this.state.inventoryStatus === "empty" && !this.state.walletStatus) {
            item.text = "$(circle-slash) WaitSpin no inventory";
        }
        else if (this.state.inventoryStatus === "error") {
            item.text = "$(warning) WaitSpin retrying";
        }
        else {
            item.text = `$(pulse) ${statusBarWalletText(this.state.walletStatus)}`;
        }
        item.tooltip = "WaitSpin wallet and sponsor status";
        item.command = "waitspin.refreshWallet";
        item.show();
    }
}
exports.PublisherSurfaces = PublisherSurfaces;
//# sourceMappingURL=extension-surfaces.js.map