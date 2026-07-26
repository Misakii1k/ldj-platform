export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  check(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    const current = this.#buckets.get(key);
    if (current === undefined || current.resetAt <= now) {
      this.#buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (current.count >= rule.limit) {
      return { allowed: false, retryAfterMs: Math.max(1, current.resetAt - now) };
    }

    current.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}
