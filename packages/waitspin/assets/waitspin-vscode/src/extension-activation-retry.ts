export type EditorActivationPhase =
  | "descriptor"
  | "redeem"
  | "register"
  | "ready"
  | "promotion";

export type EditorActivationFailureReason =
  | "descriptor-absent"
  | "descriptor-unsafe"
  | "network"
  | "http"
  | "validation"
  | "binding"
  | "state"
  | "budget-exhausted"
  | "credential-expired";

type EditorActivationFailureOptions = {
  status?: number;
  retryAfterMs?: number;
  expiresAtMs?: number;
  cause?: unknown;
};

export class EditorActivationFailure extends Error {
  readonly phase: EditorActivationPhase;
  readonly reason: EditorActivationFailureReason;
  readonly httpStatus: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly expiresAtMs: number | undefined;

  constructor(
    phase: EditorActivationPhase,
    reason: EditorActivationFailureReason,
    message: string,
    options: EditorActivationFailureOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "EditorActivationFailure";
    this.phase = phase;
    this.reason = reason;
    this.httpStatus = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.expiresAtMs = options.expiresAtMs;
  }
}

export function parseRetryAfterMs(
  value: string | null,
  now = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^[0-9]+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    const milliseconds = seconds * 1_000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt) || retryAt <= now) return undefined;
  const milliseconds = retryAt - now;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

export function isRetryableEditorActivationFailure(
  failure: EditorActivationFailure,
): boolean {
  if (
    failure.reason === "descriptor-absent" ||
    failure.reason === "network"
  ) {
    return true;
  }
  if (failure.reason !== "http" || failure.httpStatus === undefined) {
    return false;
  }
  return (
    failure.httpStatus === 408 ||
    failure.httpStatus === 425 ||
    failure.httpStatus === 429 ||
    (failure.httpStatus >= 500 && failure.httpStatus <= 599)
  );
}

export function assertEditorActivationCurrent(
  signal: AbortSignal | undefined,
  phase: EditorActivationPhase,
): void {
  if (!signal?.aborted) return;
  throw new EditorActivationFailure(
    phase,
    "state",
    "WaitSpin activation was cancelled before state promotion",
  );
}

export async function requestEditorActivation(input: {
  phase: "redeem" | "register" | "ready";
  url: string;
  init: RequestInit;
  signal?: AbortSignal;
  expiresAtMs: number;
  fetchWithTimeout(url: string, init: RequestInit): Promise<Response>;
}): Promise<Response> {
  assertEditorActivationCurrent(input.signal, input.phase);
  let response: Response;
  try {
    response = await input.fetchWithTimeout(input.url, {
      ...input.init,
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof EditorActivationFailure) throw error;
    if (input.signal?.aborted) {
      assertEditorActivationCurrent(input.signal, input.phase);
    }
    throw new EditorActivationFailure(
      input.phase,
      "network",
      error instanceof Error
        ? error.message
        : `WaitSpin ${input.phase} request failed before receiving a response`,
      { expiresAtMs: input.expiresAtMs, cause: error },
    );
  }
  assertEditorActivationCurrent(input.signal, input.phase);
  if (!response.ok) {
    throw new EditorActivationFailure(
      input.phase,
      "http",
      `WaitSpin ${input.phase} request failed with HTTP ${response.status}`,
      {
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")),
        expiresAtMs: input.expiresAtMs,
      },
    );
  }
  return response;
}

export type ManagedActivationTriggerSource = "startup" | "focus" | "manual";
export type ManagedActivationCompletion =
  | "completed"
  | "terminal"
  | "exhausted"
  | "disposed";

type ManagedActivationAttemptInput = {
  allowManagedOverride: boolean;
  signal: AbortSignal;
};

type ManagedActivationRetryControllerInput = {
  attempt(input: ManagedActivationAttemptInput): Promise<void>;
  onTerminalFailure?(
    failure: EditorActivationFailure,
    surfaceTerminal: boolean,
  ): void;
  onRetryScheduled?(failure: EditorActivationFailure, delayMs: number): void;
  totalBudgetMs?: number;
  initialDelayMs?: number;
  maximumDelayMs?: number;
  now?: () => number;
};

type ManagedActivationTrigger = {
  source: ManagedActivationTriggerSource;
  allowManagedOverride?: boolean;
  surfaceTerminal?: boolean;
};

const DEFAULT_TOTAL_BUDGET_MS = 5 * 60_000;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAXIMUM_DELAY_MS = 60_000;

export class ManagedActivationRetryController {
  private readonly input: ManagedActivationRetryControllerInput;
  private readonly now: () => number;
  private readonly totalBudgetMs: number;
  private readonly initialDelayMs: number;
  private readonly maximumDelayMs: number;
  private disposed = false;
  private epoch = 0;
  private startedAt = 0;
  private failures = 0;
  private allowManagedOverride = false;
  private surfaceTerminal = false;
  private activePromise: Promise<ManagedActivationCompletion> | undefined;
  private latchedCompletion: "terminal" | "exhausted" | undefined;
  private resolveActive:
    | ((completion: ManagedActivationCompletion) => void)
    | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abortController: AbortController | undefined;

  constructor(input: ManagedActivationRetryControllerInput) {
    this.input = input;
    this.now = input.now ?? Date.now;
    this.totalBudgetMs = input.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
    this.initialDelayMs = input.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.maximumDelayMs = input.maximumDelayMs ?? DEFAULT_MAXIMUM_DELAY_MS;
  }

  trigger(trigger: ManagedActivationTrigger): Promise<ManagedActivationCompletion> {
    if (this.disposed) return Promise.resolve("disposed");
    if (trigger.source === "manual") {
      this.latchedCompletion = undefined;
    } else if (this.latchedCompletion) {
      return Promise.resolve(this.latchedCompletion);
    }
    this.allowManagedOverride ||= trigger.allowManagedOverride === true;
    this.surfaceTerminal ||= trigger.surfaceTerminal !== false;
    if (this.activePromise) {
      if (trigger.source !== "manual") return this.activePromise;
      this.startedAt = this.now();
      this.failures = 0;
      const epoch = ++this.epoch;
      this.clearScheduledWork();
      void Promise.resolve().then(() => this.runAttempt(epoch));
      return this.activePromise;
    }

    this.startedAt = this.now();
    this.failures = 0;
    const epoch = ++this.epoch;
    this.activePromise = new Promise((resolve) => {
      this.resolveActive = resolve;
    });
    void Promise.resolve().then(() => this.runAttempt(epoch));
    return this.activePromise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.clearScheduledWork();
    this.finish("disposed");
  }

  private async runAttempt(epoch: number): Promise<void> {
    if (!this.isCurrent(epoch)) return;
    const attemptOverride = this.allowManagedOverride;
    const attemptController = new AbortController();
    this.abortController = attemptController;
    try {
      await this.input.attempt({
        allowManagedOverride: attemptOverride,
        signal: attemptController.signal,
      });
      if (!this.isCurrent(epoch)) return;
      if (this.allowManagedOverride && !attemptOverride) {
        void this.runAttempt(epoch);
        return;
      }
      this.finish("completed");
    } catch (error) {
      if (!this.isCurrent(epoch)) return;
      const failure = this.normalizeFailure(error);
      if (!isRetryableEditorActivationFailure(failure)) {
        this.surfaceOnce(failure);
        this.finish("terminal");
        return;
      }
      this.failures += 1;
      const delayMs = this.nextDelay(failure);
      if (delayMs === undefined) {
        const reason =
          failure.expiresAtMs !== undefined &&
          this.now() + this.requestedDelay(failure) >= failure.expiresAtMs
            ? "credential-expired"
            : "budget-exhausted";
        this.surfaceOnce(
          new EditorActivationFailure(
            failure.phase,
            reason,
            reason === "credential-expired"
              ? "WaitSpin activation credential expired before retry"
              : "WaitSpin activation retry budget was exhausted",
            {
              status: failure.httpStatus,
              retryAfterMs: failure.retryAfterMs,
              expiresAtMs: failure.expiresAtMs,
              cause: failure,
            },
          ),
        );
        this.finish("exhausted");
        return;
      }
      this.input.onRetryScheduled?.(failure, delayMs);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.runAttempt(epoch);
      }, delayMs);
    } finally {
      if (this.abortController === attemptController) {
        this.abortController = undefined;
      }
    }
  }

  private requestedDelay(failure: EditorActivationFailure): number {
    const exponential = Math.min(
      this.initialDelayMs * 2 ** Math.max(0, this.failures - 1),
      this.maximumDelayMs,
    );
    return Math.min(
      Math.max(exponential, failure.retryAfterMs ?? 0),
      this.maximumDelayMs,
    );
  }

  private nextDelay(failure: EditorActivationFailure): number | undefined {
    const delayMs = this.requestedDelay(failure);
    const retryAt = this.now() + delayMs;
    if (retryAt > this.startedAt + this.totalBudgetMs) return undefined;
    if (failure.expiresAtMs !== undefined && retryAt >= failure.expiresAtMs) {
      return undefined;
    }
    return delayMs;
  }

  private normalizeFailure(error: unknown): EditorActivationFailure {
    if (error instanceof EditorActivationFailure) return error;
    return new EditorActivationFailure(
      "descriptor",
      "state",
      error instanceof Error ? error.message : "WaitSpin activation failed",
      { cause: error },
    );
  }

  private surfaceOnce(failure: EditorActivationFailure): void {
    if (!this.surfaceTerminal) return;
    this.input.onTerminalFailure?.(failure, this.surfaceTerminal);
  }

  private isCurrent(epoch: number): boolean {
    return !this.disposed && this.epoch === epoch && Boolean(this.activePromise);
  }

  private clearScheduledWork(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.abortController?.abort();
    this.abortController = undefined;
  }

  private finish(completion: ManagedActivationCompletion): void {
    const resolve = this.resolveActive;
    this.clearScheduledWork();
    this.activePromise = undefined;
    this.resolveActive = undefined;
    this.allowManagedOverride = false;
    this.surfaceTerminal = false;
    if (completion === "terminal" || completion === "exhausted") {
      this.latchedCompletion = completion;
    }
    resolve?.(completion);
  }
}
