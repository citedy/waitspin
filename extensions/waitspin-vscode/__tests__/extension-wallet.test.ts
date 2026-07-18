jest.mock(
  "vscode",
  () => ({
    window: {
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
    },
  }),
  { virtual: true },
);

import { PublisherWalletController, type PublisherWalletHost } from "../src/extension-wallet";

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function walletPayload(availableMicroUnits: number) {
  return {
    balance: {
      available_micro_units: availableMicroUnits,
      maturing_micro_units: 0,
      held_micro_units: 0,
      reversal_debt_micro_units: 0,
      pending_payout_micro_units: 0,
      lifetime_earned_micro_units: availableMicroUnits,
    },
    payout_eligible: false,
    payout_blocked_reasons: [],
    connect: { connected: false, payouts_enabled: false },
    payout_policy: { eligible: false, blocked_reasons: [] },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("PublisherWalletController", () => {
  it("force-refreshes wallet state after managed credential activation", async () => {
    const updates: unknown[] = [];
    const fetchWithTimeout = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(walletPayload(0)))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }))
      .mockResolvedValueOnce(jsonResponse(walletPayload(4_750_000)))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));
    const host: PublisherWalletHost = {
      fetchWithTimeout,
      isAuthError: () => false,
      logWaitSpin: jest.fn(),
      refreshConfiguredState: jest.fn(),
      resolveApiBase: () => "https://api.waitspin.com",
      resolveApiKey: () => "wts_live_test_key_value_1234567890",
      updatePublisherState: (patch) => updates.push(patch),
    };
    const controller = new PublisherWalletController(host);

    await controller.refresh(false);
    await controller.refresh(false);
    await controller.refresh(false, true);

    expect(fetchWithTimeout).toHaveBeenCalledTimes(4);
    expect(updates.at(-1)).toMatchObject({
      walletStatus: {
        balance: {
          availableMicroUnits: 4_750_000,
        },
      },
    });
  });

  it("serializes forced refreshes and queues one authoritative follow-up", async () => {
    const firstStatus = deferred<Response>();
    const updates: Array<Record<string, unknown>> = [];
    const fetchWithTimeout = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockImplementationOnce(() => firstStatus.promise)
      .mockResolvedValueOnce(jsonResponse({ entries: [] }))
      .mockResolvedValueOnce(jsonResponse(walletPayload(4_750_000)))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));
    const host: PublisherWalletHost = {
      fetchWithTimeout,
      isAuthError: () => false,
      logWaitSpin: jest.fn(),
      refreshConfiguredState: jest.fn(),
      resolveApiBase: () => "https://api.waitspin.com",
      resolveApiKey: () => "wts_live_test_key_value_1234567890",
      updatePublisherState: (patch) => updates.push(patch),
    };
    const controller = new PublisherWalletController(host);

    const firstRefresh = controller.refresh(false, true);
    await Promise.resolve();
    const secondRefresh = controller.refresh(false, true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

    firstStatus.resolve(jsonResponse(walletPayload(0)));
    await Promise.all([firstRefresh, secondRefresh]);

    expect(fetchWithTimeout).toHaveBeenCalledTimes(4);
    expect(updates.at(-1)).toMatchObject({
      walletStatus: { balance: { availableMicroUnits: 4_750_000 } },
    });
  });

  it("invalidates an old credential refresh and clears stale ledger entries", async () => {
    const oldStatus = deferred<Response>();
    const updates: Array<Record<string, unknown>> = [];
    let apiKey = "wts_live_old_key_value_1234567890";
    const fetchWithTimeout = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockImplementationOnce(() => oldStatus.promise)
      .mockResolvedValueOnce(jsonResponse(walletPayload(4_750_000)))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockResolvedValueOnce(jsonResponse(walletPayload(4_750_000)))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));
    const host: PublisherWalletHost = {
      fetchWithTimeout,
      isAuthError: (status) => status === 401,
      logWaitSpin: jest.fn(),
      refreshConfiguredState: jest.fn(),
      resolveApiBase: () => "https://api.waitspin.com",
      resolveApiKey: () => apiKey,
      updatePublisherState: (patch) => updates.push(patch),
    };
    const controller = new PublisherWalletController(host);

    const oldRefresh = controller.refresh(false, true);
    await Promise.resolve();
    apiKey = "wts_live_new_key_value_1234567890";
    controller.reset();
    const newRefresh = controller.refresh(false, true);
    oldStatus.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
    await Promise.all([oldRefresh, newRefresh]);

    expect(updates).not.toContainEqual(
      expect.objectContaining({ lastError: expect.stringContaining("Wallet auth failed") }),
    );
    expect(updates.at(-1)).toMatchObject({
      walletStatus: { balance: { availableMicroUnits: 4_750_000 } },
      ledgerEntries: [],
      lastError: "Wallet ledger failed: HTTP 500",
    });

    await controller.refresh(false, true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(5);
  });

  it("discards a late ledger response from the credential used before reset", async () => {
    const oldLedger = deferred<Response>();
    const oldLedgerStarted = deferred<void>();
    const updates: Array<Record<string, unknown>> = [];
    const fetchWithTimeout = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(walletPayload(1_000_000)))
      .mockImplementationOnce(() => {
        oldLedgerStarted.resolve();
        return oldLedger.promise;
      })
      .mockResolvedValueOnce(jsonResponse(walletPayload(4_750_000)))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));
    const host: PublisherWalletHost = {
      fetchWithTimeout,
      isAuthError: () => false,
      logWaitSpin: jest.fn(),
      refreshConfiguredState: jest.fn(),
      resolveApiBase: () => "https://api.waitspin.com",
      resolveApiKey: () => "wts_live_test_key_value_1234567890",
      updatePublisherState: (patch) => updates.push(patch),
    };
    const controller = new PublisherWalletController(host);

    const oldRefresh = controller.refresh(false, true);
    await oldLedgerStarted.promise;
    controller.reset();
    const updatesAfterReset = updates.length;
    const newRefresh = controller.refresh(false, true);
    oldLedger.resolve(
      jsonResponse({
        entries: [
          {
            id: "wled_old_account",
            event_type: "impression",
            publisher_micro_units: 3_000,
            gross_micro_units: 5_000,
            created_at: "2026-07-14T12:00:00.000Z",
          },
        ],
      }),
    );
    await Promise.all([oldRefresh, newRefresh]);

    expect(updates.slice(updatesAfterReset)).not.toContainEqual(
      expect.objectContaining({
        ledgerEntries: [expect.objectContaining({ id: "wled_old_account" })],
      }),
    );
    expect(updates.at(-1)).toMatchObject({
      walletStatus: { balance: { availableMicroUnits: 4_750_000 } },
      ledgerEntries: [],
    });
  });
});
