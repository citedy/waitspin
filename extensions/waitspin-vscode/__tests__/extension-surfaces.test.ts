const mockStatusBarItem = {
  command: undefined as string | undefined,
  dispose: jest.fn(),
  show: jest.fn(),
  text: "",
  tooltip: "",
};

jest.mock(
  "vscode",
  () => ({
    StatusBarAlignment: { Left: 1 },
    window: {
      createStatusBarItem: jest.fn(() => mockStatusBarItem),
      registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
    },
  }),
  { virtual: true },
);

import { PublisherSurfaces } from "../src/extension-surfaces";
import type { ServeCreative } from "../src/extension-core";

function activeServe(): ServeCreative {
  const expiresAtMs = Date.now() + 60_000;
  return {
    serveId: "wsrv_test",
    campaignId: "wcamp_test",
    line: "Citedy: find growth gaps, ship fixes",
    destinationUrl: "https://example.com",
    serveReceipt: "wtsr_12345678901234567890123456789012",
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    minVisibleMs: 5_000,
  };
}

describe("WaitSpin VS Code surfaces", () => {
  beforeEach(() => {
    mockStatusBarItem.command = undefined;
    mockStatusBarItem.text = "";
    mockStatusBarItem.tooltip = "";
    mockStatusBarItem.show.mockClear();
  });

  it("does not let a stale active serve override retrying state", () => {
    const surfaces = new PublisherSurfaces();

    surfaces.updateState({
      hasApiKey: true,
      installId: "wins_test",
      authStopped: false,
      inventoryStatus: "error",
      activeServe: activeServe(),
      ledgerEntries: [],
      lastError: "Serve network error: fetch failed",
    });

    expect(mockStatusBarItem.text).toBe("$(warning) WaitSpin retrying");
    expect(mockStatusBarItem.command).toBe("waitspin.refreshWallet");
    expect(surfaces.hasVisibleSponsorSurface()).toBe(false);
  });

  it("renders sponsor status only while inventory status is serving", () => {
    const surfaces = new PublisherSurfaces();

    surfaces.updateState({
      hasApiKey: true,
      installId: "wins_test",
      authStopped: false,
      inventoryStatus: "serving",
      activeServe: activeServe(),
      ledgerEntries: [],
    });

    expect(mockStatusBarItem.text).toContain(
      "Citedy: find growth gaps, ship fixes",
    );
    expect(mockStatusBarItem.command).toBe("waitspin.openAd");
    expect(surfaces.hasVisibleSponsorSurface()).toBe(true);
  });

  it("renders the current wallet balance in the status bar", () => {
    const surfaces = new PublisherSurfaces();

    surfaces.updateState({
      hasApiKey: true,
      installId: "wins_test",
      authStopped: false,
      inventoryStatus: "empty",
      ledgerEntries: [],
      walletStatus: {
        balance: {
          availableMicroUnits: 4_750_000,
          maturingMicroUnits: 670_000,
          heldMicroUnits: 0,
          reversalDebtMicroUnits: 0,
          pendingPayoutMicroUnits: 0,
          lifetimeEarnedMicroUnits: 5_420_000,
        },
        payoutEligible: false,
        payoutBlockedReasons: [],
        connectConnected: false,
        payoutsEnabled: false,
      },
    });

    expect(mockStatusBarItem.text).toBe("$(pulse) WaitSpin EUR 4.75");
    expect(mockStatusBarItem.command).toBe("waitspin.refreshWallet");
  });
});
