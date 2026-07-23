"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagedActivationRetryController = exports.EditorActivationFailure = void 0;
exports.formatManagedActivationFailure = formatManagedActivationFailure;
exports.parseRetryAfterMs = parseRetryAfterMs;
exports.isRetryableEditorActivationFailure = isRetryableEditorActivationFailure;
exports.assertEditorActivationCurrent = assertEditorActivationCurrent;
exports.requestEditorActivation = requestEditorActivation;
class EditorActivationFailure extends Error {
    phase;
    reason;
    httpStatus;
    retryAfterMs;
    expiresAtMs;
    constructor(phase, reason, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = "EditorActivationFailure";
        this.phase = phase;
        this.reason = reason;
        this.httpStatus = options.status;
        this.retryAfterMs = options.retryAfterMs;
        this.expiresAtMs = options.expiresAtMs;
    }
}
exports.EditorActivationFailure = EditorActivationFailure;
const ACTIVATION_PHASE_ACTION = {
    descriptor: "checking local setup",
    redeem: "verifying setup details",
    register: "registering this editor",
    ready: "confirming editor access",
    promotion: "saving editor access",
};
function formatManagedActivationFailure(failure) {
    if (failure.message === "WaitSpin activation lock is busy") {
        return "Automatic setup is already running in another editor window. Try again in a moment.";
    }
    if (failure.reason === "descriptor-unsafe") {
        return "Automatic setup stopped because a local WaitSpin setup file is invalid or has unsafe permissions.";
    }
    if (failure.reason === "credential-expired") {
        return "Automatic setup expired before it could finish. Reconnect WaitSpin to try again.";
    }
    if (failure.reason === "budget-exhausted") {
        return "Automatic setup could not finish after several attempts. Try again from the WaitSpin panel.";
    }
    if (failure.reason === "network") {
        return `Automatic setup could not reach WaitSpin while ${ACTIVATION_PHASE_ACTION[failure.phase]}. Check your connection and try again.`;
    }
    if (failure.reason === "http") {
        return `WaitSpin could not complete automatic setup while ${ACTIVATION_PHASE_ACTION[failure.phase]}. Try again in a moment.`;
    }
    if (failure.reason === "descriptor-absent") {
        return "Automatic setup is not ready yet. Open the WaitSpin panel and try again.";
    }
    return `Automatic setup stopped while ${ACTIVATION_PHASE_ACTION[failure.phase]}. Reconnect WaitSpin and try again.`;
}
function parseRetryAfterMs(value, now = Date.now()) {
    const trimmed = value?.trim();
    if (!trimmed)
        return undefined;
    if (/^[0-9]+$/.test(trimmed)) {
        const seconds = Number(trimmed);
        const milliseconds = seconds * 1_000;
        return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
    }
    const retryAt = Date.parse(trimmed);
    if (!Number.isFinite(retryAt) || retryAt <= now)
        return undefined;
    const milliseconds = retryAt - now;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}
function isRetryableEditorActivationFailure(failure) {
    if (failure.reason === "descriptor-absent" ||
        failure.reason === "network") {
        return true;
    }
    if (failure.reason !== "http" || failure.httpStatus === undefined) {
        return false;
    }
    return (failure.httpStatus === 408 ||
        failure.httpStatus === 425 ||
        failure.httpStatus === 429 ||
        (failure.httpStatus >= 500 && failure.httpStatus <= 599));
}
function assertEditorActivationCurrent(signal, phase) {
    if (!signal?.aborted)
        return;
    throw new EditorActivationFailure(phase, "state", "WaitSpin activation was cancelled before state promotion");
}
async function requestEditorActivation(input) {
    assertEditorActivationCurrent(input.signal, input.phase);
    let response;
    try {
        response = await input.fetchWithTimeout(input.url, {
            ...input.init,
            signal: input.signal,
        });
    }
    catch (error) {
        if (error instanceof EditorActivationFailure)
            throw error;
        if (input.signal?.aborted) {
            assertEditorActivationCurrent(input.signal, input.phase);
        }
        throw new EditorActivationFailure(input.phase, "network", error instanceof Error
            ? error.message
            : `WaitSpin ${input.phase} request failed before receiving a response`, { expiresAtMs: input.expiresAtMs, cause: error });
    }
    assertEditorActivationCurrent(input.signal, input.phase);
    if (!response.ok) {
        throw new EditorActivationFailure(input.phase, "http", `WaitSpin ${input.phase} request failed with HTTP ${response.status}`, {
            status: response.status,
            retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")),
            expiresAtMs: input.expiresAtMs,
        });
    }
    return response;
}
const DEFAULT_TOTAL_BUDGET_MS = 5 * 60_000;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAXIMUM_DELAY_MS = 60_000;
class ManagedActivationRetryController {
    input;
    now;
    totalBudgetMs;
    initialDelayMs;
    maximumDelayMs;
    disposed = false;
    epoch = 0;
    startedAt = 0;
    failures = 0;
    allowManagedOverride = false;
    surfaceTerminal = false;
    activePromise;
    latchedCompletion;
    resolveActive;
    timer;
    abortController;
    constructor(input) {
        this.input = input;
        this.now = input.now ?? Date.now;
        this.totalBudgetMs = input.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
        this.initialDelayMs = input.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
        this.maximumDelayMs = input.maximumDelayMs ?? DEFAULT_MAXIMUM_DELAY_MS;
    }
    trigger(trigger) {
        if (this.disposed)
            return Promise.resolve("disposed");
        if (trigger.source === "manual") {
            this.latchedCompletion = undefined;
        }
        else if (this.latchedCompletion) {
            return Promise.resolve(this.latchedCompletion);
        }
        this.allowManagedOverride ||= trigger.allowManagedOverride === true;
        this.surfaceTerminal ||= trigger.surfaceTerminal !== false;
        if (this.activePromise) {
            if (trigger.source !== "manual")
                return this.activePromise;
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
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.epoch += 1;
        this.clearScheduledWork();
        this.finish("disposed");
    }
    async runAttempt(epoch) {
        if (!this.isCurrent(epoch))
            return;
        const attemptOverride = this.allowManagedOverride;
        const attemptController = new AbortController();
        this.abortController = attemptController;
        try {
            await this.input.attempt({
                allowManagedOverride: attemptOverride,
                signal: attemptController.signal,
            });
            if (!this.isCurrent(epoch))
                return;
            if (this.allowManagedOverride && !attemptOverride) {
                void this.runAttempt(epoch);
                return;
            }
            this.finish("completed");
        }
        catch (error) {
            if (!this.isCurrent(epoch))
                return;
            const failure = this.normalizeFailure(error);
            if (!isRetryableEditorActivationFailure(failure)) {
                this.surfaceOnce(failure);
                this.finish("terminal");
                return;
            }
            this.failures += 1;
            const delayMs = this.nextDelay(failure);
            if (delayMs === undefined) {
                const reason = failure.expiresAtMs !== undefined &&
                    this.now() + this.requestedDelay(failure) >= failure.expiresAtMs
                    ? "credential-expired"
                    : "budget-exhausted";
                this.surfaceOnce(new EditorActivationFailure(failure.phase, reason, reason === "credential-expired"
                    ? "WaitSpin activation credential expired before retry"
                    : "WaitSpin activation retry budget was exhausted", {
                    status: failure.httpStatus,
                    retryAfterMs: failure.retryAfterMs,
                    expiresAtMs: failure.expiresAtMs,
                    cause: failure,
                }));
                this.finish("exhausted");
                return;
            }
            this.input.onRetryScheduled?.(failure, delayMs);
            this.timer = setTimeout(() => {
                this.timer = undefined;
                void this.runAttempt(epoch);
            }, delayMs);
        }
        finally {
            if (this.abortController === attemptController) {
                this.abortController = undefined;
            }
        }
    }
    requestedDelay(failure) {
        const exponential = Math.min(this.initialDelayMs * 2 ** Math.max(0, this.failures - 1), this.maximumDelayMs);
        return Math.min(Math.max(exponential, failure.retryAfterMs ?? 0), this.maximumDelayMs);
    }
    nextDelay(failure) {
        const delayMs = this.requestedDelay(failure);
        const retryAt = this.now() + delayMs;
        if (retryAt > this.startedAt + this.totalBudgetMs)
            return undefined;
        if (failure.expiresAtMs !== undefined && retryAt >= failure.expiresAtMs) {
            return undefined;
        }
        return delayMs;
    }
    normalizeFailure(error) {
        if (error instanceof EditorActivationFailure)
            return error;
        return new EditorActivationFailure("descriptor", "state", error instanceof Error ? error.message : "WaitSpin activation failed", { cause: error });
    }
    surfaceOnce(failure) {
        if (!this.surfaceTerminal)
            return;
        this.input.onTerminalFailure?.(failure, this.surfaceTerminal);
    }
    isCurrent(epoch) {
        return !this.disposed && this.epoch === epoch && Boolean(this.activePromise);
    }
    clearScheduledWork() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
        this.abortController?.abort();
        this.abortController = undefined;
    }
    finish(completion) {
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
exports.ManagedActivationRetryController = ManagedActivationRetryController;
//# sourceMappingURL=extension-activation-retry.js.map