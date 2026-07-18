/** @jest-environment node */

const showQuickPick = jest.fn();
const showInputBox = jest.fn();
const showErrorMessage = jest.fn(async () => undefined);
const showInformationMessage = jest.fn(async () => undefined);

jest.mock(
  "vscode",
  () => ({
    ProgressLocation: { Notification: 1 },
    commands: { executeCommand: jest.fn() },
    window: {
      showQuickPick,
      showInputBox,
      showErrorMessage,
      showInformationMessage,
      withProgress: jest.fn(async (_options, task) => task()),
    },
  }),
  { virtual: true },
);

import { PublisherOnboardingController } from "../src/extension-onboarding";

const apiKey = `wts_live_${"a".repeat(43)}`;
const installId = "wins_existing_install";

function walletResponse() {
  return new Response(
    JSON.stringify({
      balance: {
        available_micro_units: 1,
        maturing_micro_units: 0,
        held_micro_units: 0,
        reversal_debt_micro_units: 0,
        pending_payout_micro_units: 0,
        lifetime_earned_micro_units: 1,
      },
      connect: { connected: false, payouts_enabled: false },
      payout_policy: { eligible: false, blocked_reasons: [] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function hostForRegistration(responseInstallId: string) {
  const events: string[] = [];
  const activateManualCredential = jest.fn(async (candidate) => {
    events.push("stage:manual");
    events.push("fetch:wallet");
    events.push("fetch:register");
    if (responseInstallId !== candidate.installId) {
      throw new Error("Install registration response failed validation.");
    }
    events.push("promote:manual");
    return { walletReadable: true };
  });
  return {
    events,
    activateManualCredential,
    host: {
      fetchWithTimeout: async (url: string) => {
        if (url.endsWith("/v1/keys/request"))
          return new Response("{}", { status: 200 });
        if (url.endsWith("/v1/keys/verify")) {
          return new Response(
            JSON.stringify({
              account_id: "wacc_test",
              api_key: apiKey,
              key_profile: "publisher_extension",
              scopes: [
                "publishers:write",
                "serve:read",
                "events:write",
                "wallet:read",
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return walletResponse();
      },
      logWaitSpin: jest.fn(),
      resolveApiBase: () => "https://api.waitspin.com",
      resolveApiKey: () => undefined,
      resolveInstallId: () => installId,
      activateManualCredential,
      startPolling: jest.fn(),
      updatePublisherState: jest.fn(),
    },
  };
}

describe("publisher onboarding credential persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    showQuickPick
      .mockResolvedValueOnce({ mode: "email" })
      .mockResolvedValueOnce({ installId });
    showInputBox
      .mockResolvedValueOnce("agent@citedy.com")
      .mockResolvedValueOnce("123456");
  });

  it("stages the email-issued identity and promotes only after wallet and registration", async () => {
    const fixture = hostForRegistration(installId);
    await new PublisherOnboardingController(fixture.host).connectPublisher();
    expect(fixture.events).toEqual([
      "stage:manual",
      "fetch:wallet",
      "fetch:register",
      "promote:manual",
    ]);
    expect(fixture.activateManualCredential).toHaveBeenCalledWith({
      apiBase: "https://api.waitspin.com",
      apiKey,
      installId,
      allowLegacyWalletFailure: false,
    });
  });

  it("rejects a registration response bound to another install ID", async () => {
    const fixture = hostForRegistration("wins_wrong_install");
    await new PublisherOnboardingController(fixture.host).connectPublisher();
    expect(fixture.events).toEqual([
      "stage:manual",
      "fetch:wallet",
      "fetch:register",
    ]);
    expect(showErrorMessage).toHaveBeenCalledWith(
      "WaitSpin setup failed: Install registration response failed validation.",
    );
  });
});
