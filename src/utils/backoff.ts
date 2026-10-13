export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 15_000 };

/**
 * Exponential backoff with "full jitter": a random delay in [base, min(max, base * 2^attempt)].
 * Jitter keeps many clients from reconnecting in lockstep after an outage.
 */
export function backoffDelay(
  attempt: number,
  { baseMs, maxMs }: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 30));
  const ceiling = Math.min(maxMs, baseMs * 2 ** safeAttempt);
  return Math.round(baseMs + random() * (ceiling - baseMs));
}
