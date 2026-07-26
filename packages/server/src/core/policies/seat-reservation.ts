export const DEFAULT_RESERVATION_MINUTES = 5;
export const MIN_RESERVATION_MINUTES = 1;
export const MAX_RESERVATION_MINUTES = 30;

const MILLISECONDS_PER_MINUTE = 60_000;

export type SeatReservation =
  | {
      readonly status: 'DISCONNECTED_RESERVED';
      readonly reservedUntil: number;
      readonly remainingMs: number;
    }
  | { readonly status: 'EXPIRED'; readonly reservedUntil: number; readonly remainingMs: 0 };

export function reservationDurationMs(minutes = DEFAULT_RESERVATION_MINUTES): number {
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_RESERVATION_MINUTES ||
    minutes > MAX_RESERVATION_MINUTES
  ) {
    throw new RangeError(
      `Reservation duration must be an integer from ${String(MIN_RESERVATION_MINUTES)} to ${String(MAX_RESERVATION_MINUTES)} minutes`,
    );
  }
  return minutes * MILLISECONDS_PER_MINUTE;
}

export function calculateSeatReservation(input: {
  readonly disconnectedAt: number;
  readonly now: number;
  readonly durationMinutes?: number;
}): SeatReservation {
  assertTimestamp(input.disconnectedAt, 'disconnectedAt');
  assertTimestamp(input.now, 'now');
  const reservedUntil = input.disconnectedAt + reservationDurationMs(input.durationMinutes);
  const remainingMs = Math.max(0, reservedUntil - input.now);

  return remainingMs === 0
    ? { status: 'EXPIRED', reservedUntil, remainingMs: 0 }
    : { status: 'DISCONNECTED_RESERVED', reservedUntil, remainingMs };
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer timestamp`);
  }
}
