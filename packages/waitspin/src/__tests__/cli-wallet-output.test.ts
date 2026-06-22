/** @jest-environment node */

import { main } from "../cli";

const fetchMock = jest.fn();

function mockJsonResponse(payload: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as unknown as Response);
}

function captureStdout() {
  const chunks: string[] = [];
  jest
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    });
  return chunks;
}

describe("waitspin wallet CLI output", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("prints wallet status as human-readable payout guidance by default", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      account_id: "wacct_test",
      balance: {
        available_micro_units: 1_049_400,
        maturing_micro_units: 51_000,
        pending_payout_micro_units: 0,
        held_micro_units: 0,
        lifetime_earned_micro_units: 1_100_400,
      },
      connect: {
        connected: true,
        country_code: "PT",
        payouts_enabled: true,
        details_submitted: true,
      },
      payout_policy: {
        eligible: true,
        transfer_cents: 104,
        currency: "eur",
        blocked_reasons: [],
      },
      publisher_trust: {
        level: 1,
        max_level: 10,
        status: "downranked",
        next_level_at: null,
      },
    });

    await main([
      "wallet",
      "status",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin wallet");
    expect(output).toContain("Available: EUR 1.0494");
    expect(output).toContain("Payout account: Connected (PT)");
    expect(output).toContain("Payout status: Ready for EUR 1.04.");
    expect(output).toContain("User level: 1/10, limited after risk signals.");
    expect(output).not.toContain("available_micro_units");
    expect(output).not.toContain("blocked_reasons");
  });

  it("keeps wallet status JSON available behind --json", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      account_id: "wacct_test",
      balance: {},
      connect: {},
      payout_policy: { blocked_reasons: ["connect_account_missing"] },
    });

    await main([
      "wallet",
      "status",
      "--json",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      account_id: "wacct_test",
      payout_policy: { blocked_reasons: ["connect_account_missing"] },
    });
  });

  it("prints market campaigns as a readable table by default", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      campaigns: [
        {
          campaign_id: "wcamp_market",
          ad_line: "WaitSpin: earn from AI wait states",
          brand_name: "WaitSpin",
          bid_cpm_micros: 2_000_000,
          impressions_served: 12,
          status: "active",
        },
      ],
    });

    await main(["market", "--base-url", "https://api.waitspin.com"]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin public market");
    expect(output).toContain("wcamp_market: EUR 2.00 CPM");
    expect(output).toContain("12 served");
    expect(output).toContain("Higher CPM campaigns are prioritized");
    expect(output).not.toContain('"campaigns"');
  });

  it("strips terminal control sequences from human-readable output", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      campaigns: [
        {
          campaign_id: "wcamp_market",
          ad_line: "\u001B]8;;https://evil.test\u0007Bad\u001B]8;;\u0007",
          brand_name: "\u001B[31mWaitSpin\u001B[0m",
          bid_cpm_micros: 2_000_000,
          impressions_served: 12,
          status: "active",
        },
      ],
    });

    await main(["market", "--base-url", "https://api.waitspin.com"]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin");
    expect(output).not.toContain("\u001B");
    expect(output).not.toContain("https://evil.test");
  });

  it("keeps market JSON available behind --json", async () => {
    const stdout = captureStdout();
    mockJsonResponse({ campaigns: [] });

    await main(["market", "--json", "--base-url", "https://api.waitspin.com"]);

    expect(JSON.parse(stdout.join(""))).toEqual({
      ok: true,
      campaigns: [],
    });
  });

  it("prints campaign creation with budget and checkout next step", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      campaign_id: "wcamp_test",
      block_purchase_id: "wbp_test",
      status: "draft",
      blocks: 1,
      price_per_block_cents: 200,
    });

    await main([
      "bid",
      "create",
      "--line",
      "Talents.Kids - AI Childs Talents Discovery",
      "--url",
      "https://www.talents.kids",
      "--price-per-block",
      "200",
      "--blocks",
      "1",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin campaign draft created");
    expect(output).toContain("Budget: EUR 2.00 / 1,000-impression");
    expect(output).toContain("Next: waitspin bid checkout wcamp_test");
    expect(output).not.toContain("price_per_block_cents");
  });

  it("prints bid checkout with a checkout URL and disclosure", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      checkout_url: "https://checkout.stripe.test/session",
      block_purchase_id: "wbp_test",
    });

    await main([
      "bid",
      "checkout",
      "wcamp_test",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin advertiser checkout");
    expect(output).toContain("Checkout URL: https://checkout.stripe.test/session");
    expect(output).toContain("After Stripe confirms payment");
    expect(output).not.toContain("checkout_url");
  });

  it("prints advertiser campaign lists without raw JSON by default", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      campaigns: [
        {
          id: "wcamp_test",
          ad_line: "WaitSpin: earn from AI wait states",
          status: "active",
          blocks_purchased: 1,
          units_remaining: 999_000,
        },
      ],
    });

    await main([
      "bids",
      "list",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin advertiser campaigns");
    expect(output).toContain("wcamp_test: active");
    expect(output).toContain("999 remaining");
    expect(output).not.toContain("units_remaining");
  });

  it("prints wallet connect as a setup action by default", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      onboarding_url: "https://connect.stripe.test/onboard",
    });

    await main([
      "wallet",
      "connect",
      "--country",
      "PT",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin payout account setup");
    expect(output).toContain(
      "Stripe onboarding URL: https://connect.stripe.test/onboard",
    );
    expect(output).not.toContain("onboarding_url");
  });

  it("prints payout dry-runs as a ready/not-ready summary", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      dry_run: true,
      amount_cents: 104,
      currency: "eur",
      eligible: true,
      blocked_reasons: [],
    });

    await main([
      "wallet",
      "payout",
      "--dry-run",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin payout dry run");
    expect(output).toContain("Status: Ready");
    expect(output).toContain("Amount: EUR 1.04");
    expect(output).not.toContain("amount_micro_units");
  });

  it("prints ledger rows with sub-cent publisher earnings visible", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      entries: [
        {
          event_type: "impression",
          publisher_micro_units: 1200,
          gross_micro_units: 2000,
          created_at: "2026-06-21T11:41:24.060Z",
          earning_matures_at: "2026-06-24T11:41:24.060Z",
        },
      ],
    });

    await main([
      "wallet",
      "ledger",
      "--limit",
      "1",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("WaitSpin ledger");
    expect(output).toContain("impression: +EUR 0.0012 publisher share");
    expect(output).toContain("+EUR 0.0020 gross");
    expect(output).not.toContain("publisher_micro_units");
  });

  it("prints debit ledger rows with a clear negative sign", async () => {
    const stdout = captureStdout();
    mockJsonResponse({
      entries: [
        {
          event_type: "payout_reversal",
          publisher_micro_units: -1200,
          gross_micro_units: -2000,
          created_at: "2026-06-21T11:41:24.060Z",
        },
      ],
    });

    await main([
      "wallet",
      "ledger",
      "--limit",
      "1",
      "--api-key",
      "wts_test",
      "--base-url",
      "https://api.waitspin.com",
    ]);

    const output = stdout.join("");
    expect(output).toContain("payout_reversal: -EUR 0.0012 publisher share");
    expect(output).toContain("-EUR 0.0020 gross");
    expect(output).not.toContain("+EUR -");
  });
});
