import { describe, expect, it } from 'vitest';

import { FixedWindowRateLimiter } from '../../src/gateway/rate-limit.js';

describe('FixedWindowRateLimiter', () => {
  it('allows requests up to the configured limit', () => {
    const limiter = new FixedWindowRateLimiter();
    expect(limiter.check('player:chat', { limit: 2, windowMs: 1_000 }, 100).allowed).toBe(true);
    expect(limiter.check('player:chat', { limit: 2, windowMs: 1_000 }, 101).allowed).toBe(true);
  });

  it('returns a retry delay after the limit is reached', () => {
    const limiter = new FixedWindowRateLimiter();
    limiter.check('player:chat', { limit: 1, windowMs: 1_000 }, 100);
    expect(limiter.check('player:chat', { limit: 1, windowMs: 1_000 }, 400)).toEqual({
      allowed: false,
      retryAfterMs: 700,
    });
  });

  it('resets lazily without a polling timer', () => {
    const limiter = new FixedWindowRateLimiter();
    limiter.check('player:chat', { limit: 1, windowMs: 1_000 }, 100);
    expect(limiter.check('player:chat', { limit: 1, windowMs: 1_000 }, 1_100).allowed).toBe(true);
  });
});
