/** @jest-environment node */

import {
  formatMicroUnits,
  isSafeExternalUrl,
  parseLedgerPayload,
  parseServePayload,
  parseWalletStatusPayload,
  renderPublisherViewHtml,
} from "../src/extension-core";

describe("WaitSpin VS Code extension core", () => {
  it("rejects local and metadata sponsor destinations", () => {
    expect(isSafeExternalUrl("https://example.com/wait")).toBe(true);
    expect(isSafeExternalUrl("https://user@example.com/wait")).toBe(false);
    expect(isSafeExternalUrl("https://user:pass@example.com/wait")).toBe(false);
    expect(isSafeExternalUrl("file:///tmp/ad")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1:3000")).toBe(false);
    expect(isSafeExternalUrl("http://0.0.0.0:3000")).toBe(false);
    expect(isSafeExternalUrl("http://2130706433/")).toBe(false);
    expect(isSafeExternalUrl("http://0x7f000001/")).toBe(false);
    expect(isSafeExternalUrl("http://017700000001/")).toBe(false);
    expect(isSafeExternalUrl("http://0x0a000001/")).toBe(false);
    expect(isSafeExternalUrl("http://0300.0250.0001.0001/")).toBe(false);
    expect(isSafeExternalUrl("http://0xC0.0xA8.0x00.0x01/")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:127.0.0.1]:3000")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:a00:1]:3000")).toBe(false);
    expect(isSafeExternalUrl("http://[0:0:0:0:0:ffff:7f00:1]")).toBe(false);
    expect(isSafeExternalUrl("http://[fd00::1]")).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isSafeExternalUrl("http://metadata.google.internal")).toBe(false);
  });

  it("validates serve payloads and enforces the 5s visible floor", () => {
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        creative: {
          line: "Ship faster with WaitSpin",
          destination_url: "https://example.com",
        },
        min_visible_ms: 1,
      }),
    ).toMatchObject({
      serveId: "wss_12345678",
      minVisibleMs: 5_000,
    });
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        creative: {
          line: "Ship faster with WaitSpin",
          destination_url: "https://example.com",
        },
        min_visible_ms: Infinity,
      }),
    ).toMatchObject({ minVisibleMs: 5_000 });

    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "short",
        creative: {
          line: "Bad receipt",
          destination_url: "https://example.com",
        },
      }),
    ).toBeUndefined();
  });

  it("parses wallet status and ledger entries for publisher visibility", () => {
    expect(
      parseWalletStatusPayload({
        balance: {
          available_micro_units: 12_000_000,
          maturing_micro_units: 3_000_000,
          held_micro_units: 0,
          pending_payout_micro_units: 1_000_000,
          lifetime_earned_micro_units: 16_000_000,
        },
        connect: { connected: true, payouts_enabled: false },
        payout_policy: {
          eligible: false,
          blocked_reasons: ["payouts_disabled"],
        },
      }),
    ).toMatchObject({
      balance: {
        availableMicroUnits: 12_000_000,
        maturingMicroUnits: 3_000_000,
      },
      connectConnected: true,
      payoutBlockedReasons: ["payouts_disabled"],
    });

    expect(
      parseLedgerPayload({
        entries: [
          {
            id: "wled_test",
            event_type: "impression",
            publisher_micro_units: 3_000,
            gross_micro_units: 5_000,
            created_at: "2026-06-17T12:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "wled_test",
        publisherMicroUnits: 3_000,
      }),
    ]);

    expect(
      parseWalletStatusPayload({
        balance: {
          available_micro_units: "12000000",
          maturing_micro_units: 3_000_000,
          held_micro_units: 0,
          pending_payout_micro_units: 1_000_000,
          lifetime_earned_micro_units: 16_000_000,
        },
        connect: { connected: true, payouts_enabled: false },
        payout_policy: { eligible: false, blocked_reasons: [] },
      }),
    ).toBeUndefined();
    expect(
      parseLedgerPayload({
        entries: [
          {
            id: "wled_bad",
            event_type: "impression",
            publisher_micro_units: "3000",
            gross_micro_units: 5_000,
            created_at: "2026-06-17T12:00:00.000Z",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("preserves sub-cent ledger precision for single impressions", () => {
    expect(formatMicroUnits(3_000)).toBe("EUR 0.003");
    expect(formatMicroUnits(12_000_000)).toBe("EUR 12.00");
  });

  it("renders no-inventory state without enabling scripts", () => {
    const html = renderPublisherViewHtml({
      hasApiKey: true,
      authStopped: false,
      installId: "wins_test",
      apiBase: "https://api.waitspin.com",
      inventoryStatus: "empty",
      ledgerEntries: [],
    });

    expect(html).toContain("No inventory right now");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
  });
});
