import * as vscode from "vscode";
import {
  formatMicroUnits,
  renderPublisherViewHtml,
  type PublisherViewState,
  type WalletStatus,
} from "./extension-core";

const INITIAL_PUBLISHER_STATE: PublisherViewState = {
  hasApiKey: false,
  authStopped: false,
  inventoryStatus: "setup",
  ledgerEntries: [],
};

class PublisherViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private visibilityListener: vscode.Disposable | undefined;

  constructor(
    private state: PublisherViewState,
    private readonly onVisibilityChange: () => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: false,
      localResourceRoots: [],
    };
    this.visibilityListener?.dispose();
    this.visibilityListener = webviewView.onDidChangeVisibility(
      this.onVisibilityChange,
    );
    this.refresh();
    this.onVisibilityChange();
  }

  update(state: PublisherViewState): void {
    this.state = state;
    this.refresh();
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderPublisherViewHtml(this.state);
  }

  isVisible(): boolean {
    return this.view?.visible === true;
  }

  dispose(): void {
    this.visibilityListener?.dispose();
  }
}

export function statusBarWalletText(status: WalletStatus | undefined): string {
  if (!status) {
    return "WaitSpin polling";
  }
  return `WaitSpin ${formatMicroUnits(status.balance.availableMicroUnits)}`;
}

export class PublisherSurfaces {
  private statusBarItem: vscode.StatusBarItem | undefined;
  private statusBarSponsorVisible = false;
  private state: PublisherViewState = INITIAL_PUBLISHER_STATE;
  private publisherViewProvider: PublisherViewProvider | undefined;

  register(context: vscode.ExtensionContext, onVisibilityChange: () => void): void {
    this.publisherViewProvider = new PublisherViewProvider(
      this.state,
      onVisibilityChange,
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "waitspin.publisherView",
        this.publisherViewProvider,
      ),
    );
  }

  updateState(patch: Partial<PublisherViewState>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.publisherViewProvider?.update(this.state);
    this.updateStatusBarMiniState();
  }

  dispose(): void {
    this.statusBarItem?.dispose();
    this.publisherViewProvider?.dispose();
  }

  hasVisibleSponsorSurface(): boolean {
    return (
      this.publisherViewProvider?.isVisible() === true ||
      this.statusBarSponsorVisible
    );
  }

  private ensureStatusBarFallback(): vscode.StatusBarItem {
    if (!this.statusBarItem) {
      this.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        50,
      );
      this.statusBarItem.command = "waitspin.openAd";
      this.statusBarItem.tooltip = "WaitSpin sponsored message (fallback surface)";
    }
    return this.statusBarItem;
  }

  private updateStatusBarMiniState(): void {
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
    } else if (this.state.inventoryStatus === "error") {
      item.text = "$(warning) WaitSpin retrying";
    } else {
      item.text = `$(pulse) ${statusBarWalletText(this.state.walletStatus)}`;
    }
    item.tooltip = "WaitSpin wallet and sponsor status";
    item.command = "waitspin.refreshWallet";
    item.show();
  }
}
