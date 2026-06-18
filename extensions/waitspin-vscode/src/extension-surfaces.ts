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

  constructor(private state: PublisherViewState) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: false,
      localResourceRoots: [],
    };
    this.refresh();
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
}

function statusBarWalletText(status: WalletStatus | undefined): string {
  if (!status) {
    return "WaitSpin polling";
  }
  return `WaitSpin ${formatMicroUnits(status.balance.availableMicroUnits)}`;
}

export class PublisherSurfaces {
  private statusBarItem: vscode.StatusBarItem | undefined;
  private state: PublisherViewState = INITIAL_PUBLISHER_STATE;
  private readonly publisherViewProvider = new PublisherViewProvider(this.state);

  register(context: vscode.ExtensionContext): void {
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
    this.publisherViewProvider.update(this.state);
    this.updateStatusBarMiniState();
  }

  dispose(): void {
    this.statusBarItem?.dispose();
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

    if (this.state.activeServe) {
      item.text = `$(sync~spin) ${this.state.activeServe.line}`;
      item.tooltip = "WaitSpin sponsored message";
      item.command = "waitspin.openAd";
      item.show();
      return;
    }

    if (!this.state.hasApiKey || !this.state.installId) {
      item.text = "$(plug) WaitSpin setup";
      item.tooltip = "WaitSpin needs a publisher-extension key and install ID";
      item.command = "waitspin.openCliInstallHelp";
      item.show();
      return;
    }

    if (this.state.authStopped) {
      item.text = "$(error) WaitSpin auth";
      item.tooltip = "WaitSpin authentication stopped";
      item.command = "waitspin.activatePublisher";
      item.show();
      return;
    }

    if (this.state.inventoryStatus === "empty") {
      item.text = "$(circle-slash) WaitSpin no inventory";
    } else if (this.state.inventoryStatus === "error") {
      item.text = "$(warning) WaitSpin retrying";
    } else {
      item.text = `$(pulse) ${statusBarWalletText(this.state.walletStatus)}`;
    }
    item.tooltip = "WaitSpin publisher status";
    item.command = "waitspin.refreshWallet";
    item.show();
  }
}
