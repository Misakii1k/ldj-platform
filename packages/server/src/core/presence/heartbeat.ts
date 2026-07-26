export const DEFAULT_PING_INTERVAL_MS = 15_000;
export const DEFAULT_DISCONNECT_AFTER_MS = 45_000;

const heartbeatLeaseBrand: unique symbol = Symbol('heartbeat-lease');

export interface HeartbeatConfig {
  readonly pingIntervalMs: number;
  readonly disconnectAfterMs: number;
}

export interface HeartbeatLease {
  readonly memberId: string;
  readonly connectionId: string;
  readonly [heartbeatLeaseBrand]: true;
}

export interface HeartbeatRegistration {
  readonly lease: HeartbeatLease;
  readonly replacedConnectionIds: readonly string[];
}

export interface HeartbeatEvaluation {
  readonly ping: readonly HeartbeatLease[];
  readonly expired: readonly HeartbeatLease[];
}

interface ActiveConnection {
  readonly lease: HeartbeatLease;
  lastPongAt: number;
  lastPingAt: number;
}

const CONFIG_KEYS = new Set(['pingIntervalMs', 'disconnectAfterMs']);

export function resolveHeartbeatConfig(input: unknown = {}): HeartbeatConfig {
  if (!isPlainRecord(input)) {
    throw new TypeError('heartbeat configuration must be a plain object');
  }

  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !CONFIG_KEYS.has(key)) {
      throw new TypeError(`unknown heartbeat configuration key: ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError('heartbeat configuration must not contain accessors');
    }
  }

  const pingIntervalMs = readDuration(input, 'pingIntervalMs', DEFAULT_PING_INTERVAL_MS);
  const disconnectAfterMs = readDuration(
    input,
    'disconnectAfterMs',
    DEFAULT_DISCONNECT_AFTER_MS,
  );
  if (disconnectAfterMs <= pingIntervalMs) {
    throw new RangeError('disconnectAfterMs must be greater than pingIntervalMs');
  }

  return Object.freeze({ pingIntervalMs, disconnectAfterMs });
}

export class HeartbeatTracker {
  readonly #config: HeartbeatConfig;
  readonly #issuedLeases = new WeakSet<object>();
  readonly #activeByMember = new Map<string, ActiveConnection>();
  readonly #activeByConnection = new Map<string, ActiveConnection>();

  constructor(config: unknown = {}) {
    this.#config = resolveHeartbeatConfig(config);
  }

  register(input: {
    readonly memberId: string;
    readonly connectionId: string;
    readonly connectedAt: number;
  }): HeartbeatRegistration {
    assertIdentifier(input.memberId, 'memberId');
    assertIdentifier(input.connectionId, 'connectionId');
    assertTimestamp(input.connectedAt, 'connectedAt');

    const replacedConnectionIds = new Set<string>();
    const previousForMember = this.#activeByMember.get(input.memberId);
    if (previousForMember !== undefined) {
      if (previousForMember.lease.connectionId !== input.connectionId) {
        replacedConnectionIds.add(previousForMember.lease.connectionId);
      }
      this.#deactivate(previousForMember);
    }
    const previousForConnection = this.#activeByConnection.get(input.connectionId);
    if (previousForConnection !== undefined) {
      this.#deactivate(previousForConnection);
    }

    const lease: HeartbeatLease = Object.freeze({
      memberId: input.memberId,
      connectionId: input.connectionId,
      [heartbeatLeaseBrand]: true as const,
    });
    const connection: ActiveConnection = {
      lease,
      lastPongAt: input.connectedAt,
      lastPingAt: input.connectedAt,
    };
    this.#issuedLeases.add(lease);
    this.#activeByMember.set(input.memberId, connection);
    this.#activeByConnection.set(input.connectionId, connection);

    return Object.freeze({
      lease,
      replacedConnectionIds: Object.freeze([...replacedConnectionIds]),
    });
  }

  pong(lease: HeartbeatLease, receivedAt: number): boolean {
    this.#assertIssuedLease(lease);
    assertTimestamp(receivedAt, 'receivedAt');
    const active = this.#activeRecord(lease);
    if (active === undefined || receivedAt < active.lastPongAt) {
      return false;
    }
    if (elapsedAtLeast(active.lastPongAt, receivedAt, this.#config.disconnectAfterMs)) {
      this.#deactivate(active);
      return false;
    }

    active.lastPongAt = receivedAt;
    return true;
  }

  release(lease: HeartbeatLease): boolean {
    this.#assertIssuedLease(lease);
    const active = this.#activeRecord(lease);
    if (active === undefined) return false;
    this.#deactivate(active);
    return true;
  }

  activeConnectionFor(memberId: string): string | null {
    return this.#activeByMember.get(memberId)?.lease.connectionId ?? null;
  }

  evaluate(now: number): HeartbeatEvaluation {
    assertTimestamp(now, 'now');
    const ping: HeartbeatLease[] = [];
    const expired: HeartbeatLease[] = [];

    for (const active of this.#activeByConnection.values()) {
      if (elapsedAtLeast(active.lastPongAt, now, this.#config.disconnectAfterMs)) {
        expired.push(active.lease);
        this.#deactivate(active);
        continue;
      }
      if (elapsedAtLeast(active.lastPingAt, now, this.#config.pingIntervalMs)) {
        ping.push(active.lease);
        active.lastPingAt = now;
      }
    }

    return Object.freeze({ ping: Object.freeze(ping), expired: Object.freeze(expired) });
  }

  #assertIssuedLease(lease: HeartbeatLease): void {
    if (!this.#issuedLeases.has(lease)) {
      throw new TypeError('operation requires a heartbeat lease issued by this tracker');
    }
  }

  #activeRecord(lease: HeartbeatLease): ActiveConnection | undefined {
    const active = this.#activeByConnection.get(lease.connectionId);
    return active?.lease === lease ? active : undefined;
  }

  #deactivate(active: ActiveConnection): void {
    if (this.#activeByMember.get(active.lease.memberId) === active) {
      this.#activeByMember.delete(active.lease.memberId);
    }
    if (this.#activeByConnection.get(active.lease.connectionId) === active) {
      this.#activeByConnection.delete(active.lease.connectionId);
    }
  }
}

function readDuration(
  input: Record<PropertyKey, unknown>,
  key: 'pingIntervalMs' | 'disconnectAfterMs',
  defaultValue: number,
): number {
  const value = Object.hasOwn(input, key) ? input[key] : defaultValue;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${key} must be a positive safe integer`);
  }
  return value as number;
}

function elapsedAtLeast(startedAt: number, now: number, durationMs: number): boolean {
  return now >= startedAt && now - startedAt >= durationMs;
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function assertIdentifier(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty trimmed string`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer timestamp`);
  }
}
