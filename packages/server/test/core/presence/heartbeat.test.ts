import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISCONNECT_AFTER_MS,
  DEFAULT_PING_INTERVAL_MS,
  HeartbeatTracker,
  resolveHeartbeatConfig,
  type HeartbeatLease,
} from '../../../src/core/presence/heartbeat.js';

describe('heartbeat configuration', () => {
  it('defaults to a 15 second ping interval and 45 second disconnect timeout', () => {
    expect(resolveHeartbeatConfig()).toEqual({
      pingIntervalMs: DEFAULT_PING_INTERVAL_MS,
      disconnectAfterMs: DEFAULT_DISCONNECT_AFTER_MS,
    });
    expect(DEFAULT_PING_INTERVAL_MS).toBe(15_000);
    expect(DEFAULT_DISCONNECT_AFTER_MS).toBe(45_000);
  });

  it('accepts a strictly validated configuration', () => {
    expect(resolveHeartbeatConfig({ pingIntervalMs: 2_000, disconnectAfterMs: 6_000 })).toEqual({
      pingIntervalMs: 2_000,
      disconnectAfterMs: 6_000,
    });
  });

  it.each([
    null,
    [],
    { pingIntervalMs: 0 },
    { pingIntervalMs: 1.5 },
    { disconnectAfterMs: Number.NaN },
    { pingIntervalMs: 5_000, disconnectAfterMs: 5_000 },
    { unknown: 1 },
  ])('rejects invalid or unknown configuration %#', (input) => {
    expect(() => resolveHeartbeatConfig(input)).toThrow();
  });
});

describe('HeartbeatTracker', () => {
  it('requests pings at the exact interval and expires at the exact timeout', () => {
    const tracker = new HeartbeatTracker();
    const { lease } = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 1_000,
    });

    expect(tracker.evaluate(15_999)).toEqual({ ping: [], expired: [] });
    expect(tracker.evaluate(16_000)).toEqual({ ping: [lease], expired: [] });
    expect(tracker.evaluate(16_000)).toEqual({ ping: [], expired: [] });
    expect(tracker.evaluate(45_999)).toEqual({ ping: [lease], expired: [] });
    expect(tracker.evaluate(46_000)).toEqual({ ping: [], expired: [lease] });
    expect(tracker.activeConnectionFor('player-1')).toBeNull();
    expect(tracker.evaluate(100_000)).toEqual({ ping: [], expired: [] });
  });

  it('uses a valid pong as the new disconnect deadline', () => {
    const tracker = new HeartbeatTracker({ pingIntervalMs: 1_000, disconnectAfterMs: 3_000 });
    const { lease } = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 10_000,
    });

    expect(tracker.pong(lease, 12_999)).toBe(true);
    expect(tracker.evaluate(15_998).expired).toEqual([]);
    expect(tracker.evaluate(15_999).expired).toEqual([lease]);
  });

  it('does not let a pong at or after the timeout revive an expired connection', () => {
    const tracker = new HeartbeatTracker({ pingIntervalMs: 1_000, disconnectAfterMs: 3_000 });
    const { lease } = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 10_000,
    });

    expect(tracker.pong(lease, 13_000)).toBe(false);
    expect(tracker.activeConnectionFor('player-1')).toBeNull();
    expect(tracker.evaluate(13_000).expired).toEqual([]);
  });

  it('issues a fresh lease on idempotent registration without reporting the current transport as replaced', () => {
    const tracker = new HeartbeatTracker();
    const first = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 1_000,
    });
    const repeated = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 1_001,
    });

    expect(repeated.lease).not.toBe(first.lease);
    expect(repeated.replacedConnectionIds).toEqual([]);
    expect(tracker.pong(first.lease, 2_000)).toBe(false);
    expect(tracker.pong(repeated.lease, 2_000)).toBe(true);
  });

  it('does not let stale pongs or releases affect a replacement session', () => {
    const tracker = new HeartbeatTracker({ pingIntervalMs: 1_000, disconnectAfterMs: 3_000 });
    const oldRegistration = tracker.register({
      memberId: 'player-1',
      connectionId: 'old',
      connectedAt: 1_000,
    });
    const replacement = tracker.register({
      memberId: 'player-1',
      connectionId: 'new',
      connectedAt: 2_000,
    });

    expect(replacement.replacedConnectionIds).toEqual(['old']);
    expect(tracker.pong(oldRegistration.lease, 4_999)).toBe(false);
    expect(tracker.release(oldRegistration.lease)).toBe(false);
    expect(tracker.activeConnectionFor('player-1')).toBe('new');
    expect(tracker.evaluate(4_999).expired).toEqual([]);
    expect(tracker.evaluate(5_000).expired).toEqual([replacement.lease]);
  });

  it('rejects a structurally forged lease and out-of-order pong timestamps', () => {
    const tracker = new HeartbeatTracker();
    const { lease } = tracker.register({
      memberId: 'player-1',
      connectionId: 'connection-1',
      connectedAt: 5_000,
    });
    const forged = {
      memberId: 'player-1',
      connectionId: 'connection-1',
    } as unknown as HeartbeatLease;

    expect(() => tracker.pong(forged, 6_000)).toThrow('heartbeat lease');
    expect(tracker.pong(lease, 6_000)).toBe(true);
    expect(tracker.pong(lease, 5_999)).toBe(false);
  });

  it('makes a reused connection id unable to control its previous member', () => {
    const tracker = new HeartbeatTracker();
    const first = tracker.register({
      memberId: 'player-1',
      connectionId: 'shared',
      connectedAt: 1_000,
    });
    const second = tracker.register({
      memberId: 'player-2',
      connectionId: 'shared',
      connectedAt: 2_000,
    });

    expect(second.replacedConnectionIds).toEqual([]);
    expect(tracker.pong(first.lease, 3_000)).toBe(false);
    expect(tracker.activeConnectionFor('player-1')).toBeNull();
    expect(tracker.activeConnectionFor('player-2')).toBe('shared');
  });
});
