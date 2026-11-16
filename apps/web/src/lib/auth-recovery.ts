import { ApiError } from "./api";

export const AUTH_RECOVERY_WINDOW_MS = 120_000;
const BACKOFF_MS = [2_000, 4_000, 8_000, 12_000, 16_000];

export function isTransientAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.failure === "network" || error.status >= 500);
}

// Covers response-body reads too, and removes listeners even when a request wins.
function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    work().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** One cycle per deduplicated query; every invocation gets a fresh deadline. */
export async function recoverAuthIdentity<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  policy = { windowMs: AUTH_RECOVERY_WINDOW_MS, requestMs: 15_000, backoffMs: BACKOFF_MS },
): Promise<T> {
  const deadline = new AbortController();
  const unavailable = () => new ApiError(503, "SERVICE_UNAVAILABLE", "Session verification is temporarily unavailable.");
  const timer = setTimeout(() => deadline.abort(unavailable()), policy.windowMs);
  const cycleSignal = AbortSignal.any([signal, deadline.signal]);
  let failures = 0;
  try {
    while (true) {
      cycleSignal.throwIfAborted();
      const attempt = new AbortController();
      const timeout = setTimeout(() => attempt.abort(unavailable()), policy.requestMs);
      const attemptSignal = AbortSignal.any([cycleSignal, attempt.signal]);
      try {
        const result = await abortable(attemptSignal, () => read(attemptSignal));
        return result;
      } catch (error) {
        cycleSignal.throwIfAborted();
        if (!isTransientAuthFailure(error)) throw error;
      } finally {
        clearTimeout(timeout);
      }
      const delay = policy.backoffMs[Math.min(failures++, policy.backoffMs.length - 1)];
      await pause(delay, cycleSignal);
    }
  } finally {
    clearTimeout(timer);
  }
}
