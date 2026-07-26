import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESERVATION_MINUTES,
  calculateSeatReservation,
  reservationDurationMs,
} from '../../../src/core/policies/seat-reservation.js';

describe('seat reservation policy', () => {
  it('uses a five-minute default and calculates the deadline from injected time', () => {
    expect(DEFAULT_RESERVATION_MINUTES).toBe(5);
    expect(calculateSeatReservation({ disconnectedAt: 1_000, now: 1_001 })).toEqual({
      status: 'DISCONNECTED_RESERVED',
      reservedUntil: 301_000,
      remainingMs: 299_999,
    });
  });

  it('accepts the configured 1 to 30 minute range', () => {
    expect(reservationDurationMs(1)).toBe(60_000);
    expect(reservationDurationMs(30)).toBe(1_800_000);
  });

  it.each([0, 1.5, 31, Number.NaN])('rejects an invalid duration of %s minutes', (minutes) => {
    expect(() => reservationDurationMs(minutes)).toThrow(RangeError);
  });

  it('expires at the exact injected deadline', () => {
    expect(
      calculateSeatReservation({ disconnectedAt: 10_000, now: 310_000, durationMinutes: 5 }),
    ).toEqual({ status: 'EXPIRED', reservedUntil: 310_000, remainingMs: 0 });
  });
});
