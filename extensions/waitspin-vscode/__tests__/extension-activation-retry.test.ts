import {
  EditorActivationFailure,
  ManagedActivationRetryController,
  isRetryableEditorActivationFailure,
  parseRetryAfterMs,
} from "../src/extension-activation-retry";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function failure(
  phase: "descriptor" | "redeem" | "register" | "ready",
  reason:
    | "descriptor-absent"
    | "network"
    | "http"
    | "validation"
    | "binding",
  options: {
    status?: number;
    retryAfterMs?: number;
    expiresAtMs?: number;
  } = {},
): EditorActivationFailure {
  return new EditorActivationFailure(phase, reason, `${phase} failed`, options);
}

describe("ManagedActivationRetryController", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("safely parses Retry-After delta-seconds and HTTP-date values", () => {
    expect(parseRetryAfterMs("60", NOW)).toBe(60_000);
    expect(
      parseRetryAfterMs(new Date(NOW + 45_000).toUTCString(), NOW),
    ).toBe(45_000);
    expect(parseRetryAfterMs("-1", NOW)).toBeUndefined();
    expect(parseRetryAfterMs("1.5", NOW)).toBeUndefined();
    expect(parseRetryAfterMs(new Date(NOW - 1_000).toUTCString(), NOW)).toBe(
      undefined,
    );
    expect(parseRetryAfterMs("not-a-date", NOW)).toBeUndefined();
  });

  it.each([408, 425, 429, 500, 503, 599])(
    "retries transient HTTP %s",
    (status) => {
      expect(
        isRetryableEditorActivationFailure(
          failure("redeem", "http", { status }),
        ),
      ).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 409])(
    "stops on terminal HTTP %s",
    (status) => {
      expect(
        isRetryableEditorActivationFailure(
          failure("redeem", "http", { status }),
        ),
      ).toBe(false);
    },
  );

  it("retries descriptor absence until the descriptor appears", async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(failure("descriptor", "descriptor-absent"))
      .mockRejectedValueOnce(failure("descriptor", "descriptor-absent"))
      .mockResolvedValue(undefined);
    const controller = new ManagedActivationRetryController({ attempt });

    const completed = controller.trigger({ source: "startup" });
    await settle();
    expect(attempt).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(attempt).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(completed).resolves.toBe("completed");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it.each(["redeem", "register", "ready"] as const)(
    "retries a transient %s failure",
    async (phase) => {
      const attempt = jest
        .fn()
        .mockRejectedValueOnce(failure(phase, "network"))
        .mockResolvedValue(undefined);
      const controller = new ManagedActivationRetryController({ attempt });

      const completed = controller.trigger({ source: "focus" });
      await settle();
      await jest.advanceTimersByTimeAsync(1_000);

      await expect(completed).resolves.toBe("completed");
      expect(attempt).toHaveBeenCalledTimes(2);
    },
  );

  it("honors a safe Retry-After 60 response after a lost register response", async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(
        failure("register", "http", {
          status: 503,
          retryAfterMs: 60_000,
          expiresAtMs: NOW + 120_000,
        }),
      )
      .mockResolvedValue(undefined);
    const controller = new ManagedActivationRetryController({ attempt });

    const completed = controller.trigger({ source: "startup" });
    await settle();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(completed).resolves.toBe("completed");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("stops once the total retry budget is exhausted", async () => {
    const attempt = jest.fn(async () => {
      throw failure("redeem", "network");
    });
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
      totalBudgetMs: 5_000,
    });

    const completed = controller.trigger({ source: "startup" });
    await settle();
    await jest.advanceTimersByTimeAsync(3_000);

    await expect(completed).resolves.toBe("exhausted");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(terminal).toHaveBeenCalledTimes(1);
    expect(terminal.mock.calls[0]?.[0]).toMatchObject({
      phase: "redeem",
      reason: "budget-exhausted",
    });
  });

  it("does not schedule a retry at or beyond credential expiry", async () => {
    const attempt = jest.fn(async () => {
      throw failure("ready", "http", {
        status: 503,
        retryAfterMs: 60_000,
        expiresAtMs: NOW + 30_000,
      });
    });
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
    });

    await expect(
      controller.trigger({ source: "startup" }),
    ).resolves.toBe("exhausted");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(terminal.mock.calls[0]?.[0]).toMatchObject({
      phase: "ready",
      reason: "credential-expired",
    });
  });

  it.each([
    failure("redeem", "http", { status: 401 }),
    failure("register", "binding"),
    failure("descriptor", "validation"),
  ])("stops and surfaces a terminal failure once", async (terminalFailure) => {
    const attempt = jest.fn(async () => {
      throw terminalFailure;
    });
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
    });

    await expect(
      controller.trigger({ source: "manual", surfaceTerminal: true }),
    ).resolves.toBe("terminal");
    await jest.advanceTimersByTimeAsync(300_000);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(terminal).toHaveBeenCalledTimes(1);
  });

  it("does not surface a terminal focus failure until a manual retry", async () => {
    const attempt = jest.fn(async () => {
      throw failure("redeem", "http", { status: 403 });
    });
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
    });

    await expect(
      controller.trigger({ source: "focus", surfaceTerminal: false }),
    ).resolves.toBe("terminal");
    expect(terminal).not.toHaveBeenCalled();

    await expect(
      controller.trigger({ source: "manual", surfaceTerminal: true }),
    ).resolves.toBe("terminal");
    expect(terminal).toHaveBeenCalledTimes(1);
  });

  it("latches terminal state across focus and retries only after manual action", async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(failure("redeem", "http", { status: 403 }))
      .mockResolvedValue(undefined);
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
    });

    await expect(
      controller.trigger({ source: "startup" }),
    ).resolves.toBe("terminal");
    await expect(
      controller.trigger({ source: "focus" }),
    ).resolves.toBe("terminal");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(terminal).toHaveBeenCalledTimes(1);

    await expect(
      controller.trigger({ source: "manual" }),
    ).resolves.toBe("completed");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("coalesces startup, focus, and manual triggers into one host attempt", async () => {
    let resolveAttempt!: () => void;
    const blocked = new Promise<void>((resolve) => {
      resolveAttempt = resolve;
    });
    const attempt = jest.fn(async () => blocked);
    const controller = new ManagedActivationRetryController({ attempt });

    const startup = controller.trigger({ source: "startup" });
    const focus = controller.trigger({ source: "focus" });
    const manual = controller.trigger({
      source: "manual",
      allowManagedOverride: true,
      surfaceTerminal: true,
    });
    await settle();
    expect(startup).toBe(focus);
    expect(startup).toBe(manual);
    expect(attempt).toHaveBeenCalledTimes(1);

    resolveAttempt();
    await expect(startup).resolves.toBe("completed");
  });

  it("coalesces a late manual override and reruns only after the guarded attempt", async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const seenOverrides: boolean[] = [];
    const attempt = jest.fn(async ({ allowManagedOverride }) => {
      seenOverrides.push(allowManagedOverride);
      if (seenOverrides.length === 1) await firstBlocked;
    });
    const controller = new ManagedActivationRetryController({ attempt });

    const focus = controller.trigger({ source: "focus" });
    await settle();
    const manual = controller.trigger({
      source: "manual",
      allowManagedOverride: true,
    });
    expect(manual).toBe(focus);
    releaseFirst();

    await expect(focus).resolves.toBe("completed");
    expect(seenOverrides).toEqual([false, true]);
  });

  it("restarts an active background retry immediately after manual action", async () => {
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(failure("redeem", "network"))
      .mockResolvedValue(undefined);
    const controller = new ManagedActivationRetryController({ attempt });

    const startup = controller.trigger({ source: "startup" });
    await settle();
    expect(attempt).toHaveBeenCalledTimes(1);

    const manual = controller.trigger({
      source: "manual",
      allowManagedOverride: true,
      surfaceTerminal: true,
    });
    expect(manual).toBe(startup);
    await settle();

    expect(attempt).toHaveBeenCalledTimes(2);
    await expect(startup).resolves.toBe("completed");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("dispose clears timers, aborts in-flight work, and blocks late promotion", async () => {
    let releaseAttempt!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    });
    let promoted = false;
    const attempt = jest.fn(async ({ signal }: { signal: AbortSignal }) => {
      await blocked;
      if (!signal.aborted) promoted = true;
    });
    const terminal = jest.fn();
    const controller = new ManagedActivationRetryController({
      attempt,
      onTerminalFailure: terminal,
    });

    const completed = controller.trigger({ source: "startup" });
    await settle();
    controller.dispose();
    releaseAttempt();
    await settle();

    await expect(completed).resolves.toBe("disposed");
    expect(promoted).toBe(false);
    expect(terminal).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
