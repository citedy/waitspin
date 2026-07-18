import {
  PublisherSponsorController,
  type PublisherSponsorHost,
} from "../src/extension-sponsor";

const API_BASE = "https://api.waitspin.com";
const API_KEY = `wts_live_${"a".repeat(43)}`;
const INSTALL_ID = "wins_sponsor_test";
const NOW = Date.parse("2026-07-15T12:00:00.000Z");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function response(status: number, payload?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function creative(expiresInMs = 60_000) {
  return {
    serve_id: "serve_test_1234",
    serve_receipt: "r".repeat(32),
    expires_at: new Date(NOW + expiresInMs).toISOString(),
    min_visible_ms: 5_000,
    creative: {
      campaign_id: "campaign_test",
      line: "Sponsor line",
      destination_url: "https://sponsor.example/product",
    },
  };
}

function fixture(fetchWithTimeout: PublisherSponsorHost["fetchWithTimeout"]) {
  let authStopped = false;
  let focused = true;
  let sponsorVisible = false;
  let apiKey: string | undefined = API_KEY;
  const updates: Array<Record<string, unknown>> = [];
  const host: PublisherSponsorHost = {
    fetchWithTimeout,
    isAuthError: (status) => status === 401 || status === 403,
    isAuthStopped: () => authStopped,
    isSponsorVisible: () => focused && sponsorVisible,
    logWaitSpin: jest.fn(),
    onAuthError: jest.fn(() => {
      authStopped = true;
    }),
    refreshConfiguredState: jest.fn(),
    refreshWallet: jest.fn(),
    resetWalletThrottle: jest.fn(),
    resolveApiBase: () => API_BASE,
    resolveApiKey: () => apiKey,
    resolveInstallId: () => INSTALL_ID,
    updatePublisherState: (patch) => updates.push(patch),
  };
  return {
    controller: new PublisherSponsorController(host),
    host,
    updates,
    setFocused(value: boolean) {
      focused = value;
    },
    setApiKey(value: string | undefined) {
      apiKey = value;
    },
    setSponsorVisible(value: boolean) {
      sponsorVisible = value;
    },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("PublisherSponsorController", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("polls immediately and every 15 seconds while configured", async () => {
    const fetchWithTimeout = jest.fn(async () => response(204));
    const { controller, host, updates } = fixture(fetchWithTimeout);

    controller.start();
    await settle();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(host.refreshWallet).toHaveBeenCalledWith(true);
    expect(updates.at(-1)).toMatchObject({ inventoryStatus: "empty" });

    jest.advanceTimersByTime(15_000);
    await settle();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("does not schedule polling without a publisher credential", async () => {
    const fetchWithTimeout = jest.fn(async () => response(204));
    const { controller, host } = fixture(fetchWithTimeout);
    host.resolveApiKey = () => undefined;

    controller.start();
    jest.advanceTimersByTime(30_000);
    await settle();

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(host.refreshConfiguredState).toHaveBeenCalledTimes(1);
  });

  it("starts once and keeps an unexpired serve authoritative across poll ticks", async () => {
    const fetchWithTimeout = jest.fn(async () => response(200, creative()));
    const { controller } = fixture(fetchWithTimeout);

    controller.start();
    controller.start();
    await settle();
    jest.advanceTimersByTime(15_000);
    await settle();

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(controller.destinationUrl()).toBe("https://sponsor.example/product");
  });

  it("requires one continuous visible interval before recording once", async () => {
    const fetchWithTimeout = jest.fn(async (url: string) =>
      url.endsWith("/v1/serve/next")
        ? response(200, creative())
        : response(200),
    );
    const context = fixture(fetchWithTimeout);
    context.setSponsorVisible(true);

    context.controller.start();
    await settle();
    jest.advanceTimersByTime(3_000);
    context.setSponsorVisible(false);
    context.controller.handleVisibilityChange();
    jest.advanceTimersByTime(1_000);
    context.setSponsorVisible(true);
    context.controller.handleVisibilityChange();

    jest.advanceTimersByTime(4_999);
    await settle();
    expect(
      fetchWithTimeout.mock.calls.filter(([url]) =>
        String(url).endsWith("/v1/events/impression"),
      ),
    ).toHaveLength(0);

    jest.advanceTimersByTime(1);
    await settle();
    context.controller.handleVisibilityChange();
    jest.advanceTimersByTime(5_000);
    await settle();

    const impressionCalls = fetchWithTimeout.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/events/impression"),
    );
    expect(impressionCalls).toHaveLength(1);
    expect(JSON.parse(String(impressionCalls[0]?.[1]?.body))).toMatchObject({
      install_id: INSTALL_ID,
      serve_id: "serve_test_1234",
      visible_ms: 5_000,
    });
    expect(context.controller.destinationUrl()).toBeUndefined();
  });

  it("expires a serve without recording an impression and resumes polling", async () => {
    let serveRequests = 0;
    const fetchWithTimeout = jest.fn(async (url: string) => {
      if (url.endsWith("/v1/serve/next")) {
        serveRequests += 1;
        return serveRequests === 1
          ? response(200, creative(4_000))
          : response(204);
      }
      return response(200);
    });
    const context = fixture(fetchWithTimeout);
    context.setSponsorVisible(true);

    context.controller.start();
    await settle();
    jest.advanceTimersByTime(4_000);
    jest.advanceTimersByTime(1);
    await settle();

    expect(context.controller.destinationUrl()).toBeUndefined();
    expect(serveRequests).toBe(2);
    expect(
      fetchWithTimeout.mock.calls.some(([url]) =>
        String(url).endsWith("/v1/events/impression"),
      ),
    ).toBe(false);
  });

  it("stops scheduled polling after a serve authentication failure", async () => {
    const fetchWithTimeout = jest.fn(async () => response(401));
    const { controller, host } = fixture(fetchWithTimeout);

    controller.start();
    await settle();
    expect(host.onAuthError).toHaveBeenCalledWith(
      "Serve auth failed (HTTP 401). Check your WaitSpin extension key and waitspin.installId.",
    );

    jest.advanceTimersByTime(45_000);
    await settle();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("stops scheduled polling after an impression authentication failure", async () => {
    const fetchWithTimeout = jest.fn(async (url: string) =>
      url.endsWith("/v1/serve/next")
        ? response(200, creative())
        : response(403),
    );
    const context = fixture(fetchWithTimeout);
    context.setSponsorVisible(true);

    context.controller.start();
    await settle();
    jest.advanceTimersByTime(5_000);
    await settle();
    jest.advanceTimersByTime(30_000);
    await settle();

    expect(context.host.onAuthError).toHaveBeenCalledWith(
      "Impression auth failed (HTTP 403). Check your WaitSpin extension key and waitspin.installId.",
    );
    expect(
      fetchWithTimeout.mock.calls.filter(([url]) =>
        String(url).endsWith("/v1/serve/next"),
      ),
    ).toHaveLength(1);
  });

  it("resets the current sponsor and timers before starting again", async () => {
    const fetchWithTimeout = jest.fn(async (url: string) =>
      url.endsWith("/v1/serve/next")
        ? response(200, creative())
        : response(200),
    );
    const { controller, host } = fixture(fetchWithTimeout);

    controller.start();
    await settle();
    expect(controller.destinationUrl()).toBe("https://sponsor.example/product");

    controller.reset("configuration changed");
    jest.advanceTimersByTime(15_000);
    await settle();

    expect(controller.destinationUrl()).toBeUndefined();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

    controller.start();
    await settle();
    expect(controller.destinationUrl()).toBe("https://sponsor.example/product");
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("ignores an old credential response after reset and starts the replacement immediately", async () => {
    const oldResponse = deferred<Response>();
    const replacementKey = `wts_live_${"b".repeat(43)}`;
    const replacementCreative = {
      ...creative(),
      serve_id: "serve_replacement",
      creative: {
        ...creative().creative,
        destination_url: "https://replacement.example/product",
      },
    };
    const fetchWithTimeout = jest.fn(
      async (_url: string, init: RequestInit) => {
        const authorization = new Headers(init.headers).get("Authorization");
        return authorization === `Bearer ${API_KEY}`
          ? oldResponse.promise
          : response(200, replacementCreative);
      },
    );
    const context = fixture(fetchWithTimeout);

    context.controller.start();
    await settle();
    context.controller.reset("publisher credential changed");
    context.setApiKey(replacementKey);
    context.controller.start();
    await settle();

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(context.controller.destinationUrl()).toBe(
      "https://replacement.example/product",
    );

    oldResponse.resolve(response(200, creative()));
    await settle();

    expect(context.controller.destinationUrl()).toBe(
      "https://replacement.example/product",
    );
    expect(
      context.updates.some(
        (update) =>
          (update.activeServe as { serveId?: string } | undefined)?.serveId ===
          "serve_test_1234",
      ),
    ).toBe(false);
  });

  it("ignores a late serve response after dispose", async () => {
    const serveResponse = deferred<Response>();
    const fetchWithTimeout = jest.fn(async () => serveResponse.promise);
    const context = fixture(fetchWithTimeout);

    context.controller.start();
    await settle();
    context.controller.dispose();
    const updatesAtDispose = context.updates.length;

    serveResponse.resolve(response(200, creative()));
    await settle();

    expect(context.controller.destinationUrl()).toBeUndefined();
    expect(context.updates).toHaveLength(updatesAtDispose);
  });

  it("ignores a late impression response after dispose", async () => {
    const impressionResponse = deferred<Response>();
    const fetchWithTimeout = jest.fn(async (url: string) =>
      url.endsWith("/v1/serve/next")
        ? response(200, creative())
        : impressionResponse.promise,
    );
    const context = fixture(fetchWithTimeout);
    context.setSponsorVisible(true);

    context.controller.start();
    await settle();
    jest.advanceTimersByTime(5_000);
    await settle();
    context.controller.dispose();
    const updatesAtDispose = context.updates.length;

    impressionResponse.resolve(response(200));
    await settle();

    expect(context.controller.destinationUrl()).toBeUndefined();
    expect(context.updates).toHaveLength(updatesAtDispose);
    expect(context.host.refreshWallet).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued replacement fetch on dispose", async () => {
    const fetchWithTimeout = jest.fn(async () =>
      response(200, creative(4_000)),
    );
    const context = fixture(fetchWithTimeout);

    context.controller.start();
    await settle();
    jest.setSystemTime(NOW + 4_001);
    context.controller.handleVisibilityChange();
    context.controller.dispose();
    jest.runOnlyPendingTimers();
    await settle();

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(context.controller.destinationUrl()).toBeUndefined();
  });

  it("cancels a queued replacement fetch on reset", async () => {
    const fetchWithTimeout = jest.fn(async () =>
      response(200, creative(4_000)),
    );
    const context = fixture(fetchWithTimeout);

    context.controller.start();
    await settle();
    jest.setSystemTime(NOW + 4_001);
    context.controller.handleVisibilityChange();
    context.controller.reset("publisher credential changed");
    jest.runOnlyPendingTimers();
    await settle();

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(context.controller.destinationUrl()).toBeUndefined();
  });

  it("flushes an eligible impression on dispose and cancels future polls", async () => {
    const fetchWithTimeout = jest.fn(async (url: string) =>
      url.endsWith("/v1/serve/next")
        ? response(200, creative())
        : response(200),
    );
    const context = fixture(fetchWithTimeout);
    context.setSponsorVisible(true);

    context.controller.start();
    await settle();
    jest.setSystemTime(NOW + 5_000);
    context.controller.dispose();
    await settle();
    jest.advanceTimersByTime(45_000);
    await settle();

    expect(
      fetchWithTimeout.mock.calls.filter(([url]) =>
        String(url).endsWith("/v1/events/impression"),
      ),
    ).toHaveLength(1);
    expect(
      fetchWithTimeout.mock.calls.filter(([url]) =>
        String(url).endsWith("/v1/serve/next"),
      ),
    ).toHaveLength(1);
  });
});
