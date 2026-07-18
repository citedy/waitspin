/** @jest-environment node */

import {
  formatMicroUnits,
  generatePublisherInstallId,
  hasPublisherExtensionScopes,
  isSafeExternalUrl,
  isServeExpired,
  parseLedgerPayload,
  parseEditorBootstrapDescriptor,
  parsePublisherRegistrationPayload,
  parseRedeemedPublisherCredential,
  parseServePayload,
  parseVerifiedPublisherKeyPayload,
  parseWalletStatusPayload,
  recoverManagedBootstrap,
  renderPublisherViewHtml,
  resolveWaitSpinApiBase,
  resolveWaitSpinStateRoot,
  selectEditorBootstrapCandidate,
  serveExpiryDelayMs,
} from "../src/extension-core";

describe("WaitSpin VS Code extension core", () => {
  it("makes the guarded API environment authoritative", () => {
    expect(
      resolveWaitSpinApiBase(
        "https://api.waitspin.com",
        "http://127.0.0.1:38787/",
        true,
      ),
    ).toBe("http://127.0.0.1:38787");
    expect(
      resolveWaitSpinApiBase(
        "https://api.waitspin.com",
        "https://invalid.example.com",
        true,
      ),
    ).toBeUndefined();
    expect(
      resolveWaitSpinApiBase("https://api.waitspin.com", " ", true),
    ).toBeUndefined();
  });

  it("keeps QA state inside an explicit home-scoped root", () => {
    expect(
      resolveWaitSpinStateRoot(
        "/Users/test",
        "/Users/test/Library/Application Support/WaitSpin-QA/helper-state",
      ),
    ).toBe("/Users/test/Library/Application Support/WaitSpin-QA/helper-state");
    expect(resolveWaitSpinStateRoot("/Users/test", "/tmp/shared-state")).toBeUndefined();
    expect(resolveWaitSpinStateRoot("/Users/test")).toBe("/Users/test/.waitspin");
  });

  it("resumes stored readiness before attempting another bootstrap redemption", async () => {
    const resumePendingReady = jest.fn(async () => true);
    const redeemEditorBootstrap = jest.fn(async () => {
      throw new Error("consumed bootstrap must not be retried");
    });

    await expect(
      recoverManagedBootstrap({ resumePendingReady, redeemEditorBootstrap }),
    ).resolves.toBe(true);
    expect(resumePendingReady).toHaveBeenCalledTimes(1);
    expect(redeemEditorBootstrap).not.toHaveBeenCalled();

    await expect(
      recoverManagedBootstrap({
        resumePendingReady: async () => false,
        redeemEditorBootstrap: async () => false,
      }),
    ).resolves.toBe(false);
  });

  it("selects bootstrap descriptors by exact token or newest generation and expiry", () => {
    const stale = {
      descriptor: {
        installId: "wins_stale",
        generation: 2,
        token: "wbst_stale",
        expiresAt: "2026-07-15T01:00:00.000Z",
      },
      modifiedAtMs: 200,
    };
    const current = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_current",
        expiresAt: "2026-07-15T02:00:00.000Z",
      },
      modifiedAtMs: 100,
    };
    const replay = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_replay",
        expiresAt: "2026-07-15T03:00:00.000Z",
      },
      modifiedAtMs: 300,
    };

    expect(selectEditorBootstrapCandidate([stale, current])).toEqual({
      kind: "selected",
      candidate: current,
    });
    expect(selectEditorBootstrapCandidate([current, replay])).toEqual({
      kind: "selected",
      candidate: replay,
    });
    expect(
      selectEditorBootstrapCandidate([current, replay], {
        installId: "wins_current",
        generation: 3,
        token: "wbst_current",
      }),
    ).toEqual({ kind: "selected", candidate: current });
  });

  it("prefers a newer-expiry legacy descriptor over a same-generation canonical descriptor", () => {
    const canonical = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_canonical",
        expiresAt: "2026-07-15T02:00:00.000Z",
      },
      canonical: true,
      modifiedAtMs: 300,
    };
    const legacy = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_legacy",
        expiresAt: "2026-07-15T03:00:00.000Z",
      },
      canonical: false,
      modifiedAtMs: 100,
    };

    expect(selectEditorBootstrapCandidate([canonical, legacy])).toEqual({
      kind: "selected",
      candidate: legacy,
    });
  });

  it("breaks otherwise equal discovery ties deterministically by token", () => {
    const lexicalFirst = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_alpha",
        expiresAt: "2026-07-15T03:00:00.000Z",
      },
      canonical: true,
      modifiedAtMs: 300,
    };
    const lexicalLast = {
      descriptor: {
        installId: "wins_current",
        generation: 3,
        token: "wbst_omega",
        expiresAt: "2026-07-15T03:00:00.000Z",
      },
      canonical: true,
      modifiedAtMs: 300,
    };

    expect(selectEditorBootstrapCandidate([lexicalFirst, lexicalLast])).toEqual(
      { kind: "selected", candidate: lexicalLast },
    );
    expect(selectEditorBootstrapCandidate([lexicalLast, lexicalFirst])).toEqual(
      { kind: "selected", candidate: lexicalLast },
    );
  });

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
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        expires_at: expiresAt,
        creative: {
          campaign_id: "wcamp_test",
          line: "Ship faster with WaitSpin",
          destination_url: "https://example.com",
        },
        min_visible_ms: 1,
      }),
    ).toMatchObject({
      serveId: "wss_12345678",
      campaignId: "wcamp_test",
      expiresAt,
      expiresAtMs: Date.parse(expiresAt),
      minVisibleMs: 5_000,
    });
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        expires_at: expiresAt,
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
        expires_at: expiresAt,
        creative: {
          line: "Bad receipt",
          destination_url: "https://example.com",
        },
      }),
    ).toBeUndefined();
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        creative: {
          line: "Missing expiry",
          destination_url: "https://example.com",
        },
      }),
    ).toBeUndefined();
    expect(
      parseServePayload({
        serve_id: "wss_12345678",
        serve_receipt: "wtsr_12345678901234567890123456789012",
        expires_at: "not-a-date",
        creative: {
          line: "Bad expiry",
          destination_url: "https://example.com",
        },
      }),
    ).toBeUndefined();
  });

  it("detects expired serve payloads before billing attempts", () => {
    const serve = { expiresAtMs: 1_000 };

    expect(isServeExpired(serve, 999)).toBe(false);
    expect(isServeExpired(serve, 1_000)).toBe(true);
    expect(isServeExpired(serve, 600, 400)).toBe(true);
    expect(serveExpiryDelayMs(serve, 250)).toBe(750);
    expect(serveExpiryDelayMs(serve, 1_500)).toBe(0);
  });

  it("validates extension-owned publisher onboarding payloads", () => {
    expect(
      generatePublisherInstallId(() => "12345678-1234-4234-9234-123456789abc"),
    ).toBe("wins_12345678123442349234123456789abc");
    expect(
      hasPublisherExtensionScopes([
        "publishers:write",
        "serve:read",
        "events:write",
        "wallet:read",
      ]),
    ).toBe(true);
    expect(
      parseVerifiedPublisherKeyPayload({
        account_id: "wacc_test",
        api_key: "wts_live_test_key_value_1234567890",
        key_profile: "publisher_extension",
        scopes: [
          "publishers:write",
          "serve:read",
          "events:write",
          "wallet:read",
        ],
      }),
    ).toMatchObject({
      apiKey: "wts_live_test_key_value_1234567890",
      keyProfile: "publisher_extension",
    });
    expect(
      parseVerifiedPublisherKeyPayload({
        account_id: "wacc_test",
        api_key: "wts_live_test_key_value_1234567890",
        key_profile: "publisher_extension",
        scopes: ["publishers:write", "serve:read", "events:write"],
      }),
    ).toBeUndefined();
    expect(
      parsePublisherRegistrationPayload({
        publisher_id: "wpub_test",
        install_id: "wins_test",
        target: "status-bar-fallback",
      }),
    ).toEqual({
      publisherId: "wpub_test",
      installId: "wins_test",
      target: "status-bar-fallback",
    });
  });

  it("validates managed editor bootstrap binding and exact child scopes", () => {
    const descriptor = parseEditorBootstrapDescriptor(
      {
        managed_by: "waitspin-macos",
        schema_version: 1,
        protocol_version: 1,
        token: `wbst_${"a".repeat(43)}`,
        install_id: "wins_12345678",
        install_target: "cursor",
        publisher_target: "status-bar-fallback",
        generation: 2,
        expires_at: "2026-07-11T12:10:00.000Z",
        api_base: "https://api.waitspin.com",
      },
      "cursor",
      Date.parse("2026-07-11T12:00:00.000Z"),
    );
    expect(descriptor).toMatchObject({
      installId: "wins_12345678",
      installTarget: "cursor",
      publisherTarget: "status-bar-fallback",
      generation: 2,
    });
    expect(
      parseRedeemedPublisherCredential(
        {
          protocol_version: 1,
          credential_id: "wkey_child",
          api_key: "wts_live_test_key_value_1234567890",
          install_id: "wins_12345678",
          install_target: "cursor",
          publisher_target: "status-bar-fallback",
          generation: 2,
          scopes: [
            "publishers:write",
            "serve:read",
            "events:write",
            "wallet:read",
          ],
        },
        descriptor!,
      ),
    ).toMatchObject({ generation: 2, installTarget: "cursor" });
    expect(
      parseRedeemedPublisherCredential(
        {
          protocol_version: 1,
          credential_id: "wkey_child",
          api_key: "wts_live_test_key_value_1234567890",
          install_id: "wins_12345678",
          install_target: "cursor",
          publisher_target: "status-bar-fallback",
          generation: 3,
          scopes: [
            "publishers:write",
            "serve:read",
            "events:write",
            "wallet:read",
          ],
        },
        descriptor!,
      ),
    ).toBeUndefined();
    expect(
      parseRedeemedPublisherCredential(
        {
          protocol_version: 1,
          credential_id: "wkey_child",
          api_key: "wts_live_test_key_value_1234567890",
          install_id: "wins_12345678",
          install_target: "cursor",
          publisher_target: "status-bar-fallback",
          generation: 2,
          scopes: [
            "publishers:write",
            "serve:read",
            "events:write",
            "wallet:read",
            "campaigns:write",
          ],
        },
        descriptor!,
      ),
    ).toBeUndefined();
    expect(
      parseEditorBootstrapDescriptor(
        {
          managed_by: "waitspin-macos",
          schema_version: 1,
          protocol_version: 1,
          token: `wbst_${"a".repeat(43)}`,
          install_id: "wins_12345678",
          install_target: "vscode",
          publisher_target: "status-bar-fallback",
          generation: 2,
          expires_at: "2026-07-11T12:10:00.000Z",
          api_base: "https://api.waitspin.com",
        },
        "cursor",
        Date.parse("2026-07-11T12:00:00.000Z"),
      ),
    ).toBeUndefined();
  });

  it("accepts loopback managed bootstrap descriptors only with explicit dev opt-in", () => {
    const payload = {
      managed_by: "waitspin-macos",
      schema_version: 1,
      protocol_version: 1,
      token: `wbst_${"a".repeat(43)}`,
      install_id: "wins_12345678",
      install_target: "vscode",
      publisher_target: "status-bar-fallback",
      generation: 2,
      expires_at: "2026-07-11T12:10:00.000Z",
      api_base: "http://127.0.0.1:8787",
    };
    const now = Date.parse("2026-07-11T12:00:00.000Z");

    expect(
      parseEditorBootstrapDescriptor(payload, "vscode", now),
    ).toBeUndefined();
    expect(
      parseEditorBootstrapDescriptor(payload, "vscode", now, true),
    ).toMatchObject({ apiBase: "http://127.0.0.1:8787" });
    expect(
      parseEditorBootstrapDescriptor(
        { ...payload, api_base: "https://api.waitspin.com" },
        "vscode",
        now,
        true,
        "http://127.0.0.1:8787",
      ),
    ).toBeUndefined();
  });

  it("parses wallet status and ledger entries for publisher visibility", () => {
    expect(
      parseWalletStatusPayload({
        balance: {
          available_micro_units: 12_000_000,
          maturing_micro_units: 3_000_000,
          held_micro_units: 0,
          reversal_debt_micro_units: 0,
          pending_payout_micro_units: 1_000_000,
          lifetime_earned_micro_units: 16_000_000,
        },
        connect: { connected: true, payouts_enabled: false },
        payout_policy: {
          eligible: false,
          blocked_reasons: [
            "connect_payouts_not_enabled",
            "earnings_maturing",
            "balance_below_minimum",
          ],
          transfer_cents: 1200,
          min_payout_cents: 1000,
          earning_maturity_hours: 72,
          next_eligible_at: "2026-06-20T12:00:00.000Z",
        },
        publisher_trust: {
          level: 1,
          max_level: 10,
          status: "warming",
          next_level_at: "2026-06-21T12:00:00.000Z",
        },
      }),
    ).toMatchObject({
      balance: {
        availableMicroUnits: 12_000_000,
        maturingMicroUnits: 3_000_000,
        reversalDebtMicroUnits: 0,
      },
      connectConnected: true,
      payoutBlockedReasons: [
        "connect_payouts_not_enabled",
        "earnings_maturing",
        "balance_below_minimum",
      ],
      payoutTransferCents: 1200,
      minPayoutCents: 1000,
      earningMaturityHours: 72,
      nextEligibleAt: "2026-06-20T12:00:00.000Z",
      publisherTrustLevel: 1,
      publisherTrustMaxLevel: 10,
      publisherTrustStatus: "warming",
      publisherTrustNextLevelAt: "2026-06-21T12:00:00.000Z",
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

    expect(html).toContain("No eligible sponsor right now");
    expect(html).toContain("level-based daily exposure limits");
    expect(html).toContain(
      "https://waitspin.com/docs#publisher-levels-and-limits",
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
  });

  it("renders payout blockers as readable guidance", () => {
    const html = renderPublisherViewHtml({
      hasApiKey: true,
      authStopped: false,
      installId: "wins_test",
      apiBase: "https://api.waitspin.com",
      inventoryStatus: "empty",
      walletStatus: {
        balance: {
          availableMicroUnits: 0,
          maturingMicroUnits: 40_000,
          heldMicroUnits: 0,
          reversalDebtMicroUnits: 0,
          pendingPayoutMicroUnits: 0,
          lifetimeEarnedMicroUnits: 40_000,
        },
        payoutEligible: false,
        payoutBlockedReasons: [
          "connect_account_missing",
          "earnings_maturing",
          "balance_below_minimum",
        ],
        minPayoutCents: 1000,
        earningMaturityHours: 72,
        publisherTrustLevel: 1,
        publisherTrustMaxLevel: 10,
        publisherTrustStatus: "downranked",
        publisherTrustNextLevelAt: "2026-06-21T12:00:00.000Z",
        connectConnected: false,
        payoutsEnabled: false,
      },
      ledgerEntries: [],
    });

    expect(html).toContain("Payout status: Not ready yet");
    expect(html).toContain(
      "This wallet view loaded through your VS Code connection",
    );
    expect(html).toContain("Payout account: Not set up");
    expect(html).toContain("Earnings: Maturing");
    expect(html).toContain("User level: 1/10, limited after risk signals");
    expect(html).toContain("Next level window:");
    expect(html).toContain(
      "Level limits affect how much one install can receive from a campaign each day",
    );
    expect(html).toContain("User levels and limits");
    expect(html).toContain(
      "https://waitspin.com/docs#publisher-levels-and-limits",
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Balance: Below minimum");
    expect(html).toContain("minimum payout: EUR 10.00");
    expect(html).toContain("Set up payout account");
    expect(html).toContain(
      "https://waitspin.com/wallet/connect?source=vscode&amp;install_id=wins_test",
    );
    expect(html).toContain(
      "https://waitspin.com/docs#publisher-wallet-and-payouts",
    );
    expect(html).not.toContain("wts_live_");
    expect(html).not.toContain("Payout eligible: no; Connect");
    expect(html).not.toContain("connect_account_missing");
    expect(html).not.toContain("earnings_maturing");
    expect(html).not.toContain("balance_below_minimum");
  });

  it("does not render unknown publisher trust status labels", () => {
    const html = renderPublisherViewHtml({
      hasApiKey: true,
      authStopped: false,
      installId: "wins_test",
      apiBase: "https://api.waitspin.com",
      inventoryStatus: "empty",
      walletStatus: {
        balance: {
          availableMicroUnits: 0,
          maturingMicroUnits: 40_000,
          heldMicroUnits: 0,
          reversalDebtMicroUnits: 0,
          pendingPayoutMicroUnits: 0,
          lifetimeEarnedMicroUnits: 40_000,
        },
        payoutEligible: false,
        payoutBlockedReasons: ["earnings_maturing"],
        earningMaturityHours: 72,
        publisherTrustLevel: 1,
        publisherTrustMaxLevel: 10,
        publisherTrustStatus: "unexpected_backend_status",
        connectConnected: true,
        payoutsEnabled: true,
      },
      ledgerEntries: [],
    });

    expect(html).toContain("User level: 1/10.");
    expect(html).not.toContain("unexpected_backend_status");
    expect(html).not.toContain("unexpected backend status");
  });

  it("uses payoutable balance when reversal debt blocks payout minimum", () => {
    const html = renderPublisherViewHtml({
      hasApiKey: true,
      authStopped: false,
      installId: "wins_test",
      apiBase: "https://api.waitspin.com",
      inventoryStatus: "empty",
      walletStatus: {
        balance: {
          availableMicroUnits: 12_000_000,
          maturingMicroUnits: 0,
          heldMicroUnits: 0,
          reversalDebtMicroUnits: 3_000_000,
          pendingPayoutMicroUnits: 0,
          lifetimeEarnedMicroUnits: 12_000_000,
        },
        payoutEligible: false,
        payoutBlockedReasons: [
          "reversal_debt_outstanding",
          "balance_below_minimum",
        ],
        payoutTransferCents: 900,
        minPayoutCents: 1000,
        connectConnected: true,
        payoutsEnabled: true,
      },
      ledgerEntries: [],
    });

    expect(html).toContain('Available</span><span class="amount">EUR 12.00');
    expect(html).toContain("Reversal debt");
    expect(html).toContain("Payoutable now: EUR 9.00");
    expect(html).toContain("minimum payout: EUR 10.00");
    expect(html).toContain("Reversal debt: EUR 3.00");
    expect(html).not.toContain("Available now: EUR 12.00");
  });

  it("renders setup around in-editor connect instead of manual settings", () => {
    const html = renderPublisherViewHtml({
      hasApiKey: false,
      authStopped: false,
      inventoryStatus: "setup",
      ledgerEntries: [],
    });

    expect(html).toContain("WaitSpin: Connect and earn");
    expect(html).toContain("SecretStorage");
    expect(html).not.toContain("set User settings");
  });
});
