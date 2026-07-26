import { describe, expect, it } from 'vitest';

import {
  decideExplicitHostTransfer,
  decideHostTransfer,
  selectHostTransferCandidate,
  type HostEligibleMember,
} from '../../../src/core/policies/host-policy.js';

const members: HostEligibleMember[] = [
  { memberId: 'host', role: 'player', connected: false, joinedAt: 100 },
  { memberId: 'spectator-first', role: 'spectator', connected: true, joinedAt: 110 },
  { memberId: 'offline-player', role: 'player', connected: false, joinedAt: 120 },
  { memberId: 'player-early', role: 'player', connected: true, joinedAt: 130 },
  { memberId: 'player-late', role: 'player', connected: true, joinedAt: 140 },
];

const disconnectTimer = {
  timerId: 'host-transfer:host:1',
  hostMemberId: 'host',
  disconnectEpoch: 1,
  disconnectedAt: 10_000,
} as const;

describe('host policy', () => {
  it('chooses the earliest joined online player and never a spectator', () => {
    expect(selectHostTransferCandidate(members, 'host')).toBe('player-early');
  });

  it.each(['LOBBY', 'POST_GAME'] as const)(
    'transfers immediately when the host voluntarily leaves during %s',
    (phase) => {
      expect(
        decideHostTransfer({
          phase,
          trigger: 'VOLUNTARY_LEAVE',
          currentHostId: 'host',
          members,
        }),
      ).toEqual({ type: 'TRANSFER', newHostMemberId: 'player-early' });
    },
  );

  it('waits 30 seconds after a disconnect in every active room phase, then transfers', () => {
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: disconnectTimer,
        currentDisconnectEpoch: 1,
        now: 39_999,
        members,
      }),
    ).toEqual({ type: 'WAIT', timerId: disconnectTimer.timerId, reevaluateAt: 40_000 });
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: disconnectTimer,
        currentDisconnectEpoch: 1,
        now: 40_000,
        members,
      }),
    ).toEqual({ type: 'TRANSFER', newHostMemberId: 'player-early' });
  });

  it('keeps the room pending when the grace period elapsed without an eligible player', () => {
    expect(
      decideHostTransfer({
        phase: 'POST_GAME',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: { ...disconnectTimer, disconnectedAt: 0 },
        currentDisconnectEpoch: 1,
        now: 30_000,
        members: members.filter((member) => member.role === 'spectator' || member.memberId === 'host'),
      }),
    ).toEqual({ type: 'PENDING' });
  });

  it('cancels transfer when the host reconnected before the timer fired', () => {
    const reconnectedMembers = members.map((member) =>
      member.memberId === 'host' ? { ...member, connected: true } : member,
    );
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: disconnectTimer,
        currentDisconnectEpoch: null,
        now: 40_000,
        members: reconnectedMembers,
      }),
    ).toEqual({ type: 'CANCEL', reason: 'HOST_RECONNECTED', timerId: disconnectTimer.timerId });
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: disconnectTimer,
        currentDisconnectEpoch: 1,
        now: 40_000,
        members: reconnectedMembers,
      }),
    ).toEqual({ type: 'CANCEL', reason: 'HOST_RECONNECTED', timerId: disconnectTimer.timerId });
  });

  it('cancels a stale timer from an older disconnect epoch or former host', () => {
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'host',
        timer: disconnectTimer,
        currentDisconnectEpoch: 2,
        now: 40_000,
        members,
      }),
    ).toEqual({ type: 'CANCEL', reason: 'STALE_TIMER', timerId: disconnectTimer.timerId });
    expect(
      decideHostTransfer({
        phase: 'LOBBY',
        trigger: 'DISCONNECTED',
        currentHostId: 'new-host',
        timer: disconnectTimer,
        currentDisconnectEpoch: 1,
        now: 40_000,
        members,
      }),
    ).toEqual({ type: 'CANCEL', reason: 'STALE_TIMER', timerId: disconnectTimer.timerId });
  });

  it('allows explicit transfer only by the current host in lobby or post-game to an online player', () => {
    expect(
      decideExplicitHostTransfer({
        phase: 'LOBBY',
        actorMemberId: 'host',
        currentHostId: 'host',
        targetMemberId: 'player-early',
        members,
      }),
    ).toEqual({ ok: true, newHostMemberId: 'player-early' });
    expect(
      decideExplicitHostTransfer({
        phase: 'POST_GAME',
        actorMemberId: 'host',
        currentHostId: 'host',
        targetMemberId: 'player-late',
        members,
      }),
    ).toEqual({ ok: true, newHostMemberId: 'player-late' });
  });

  it.each([
    ['IN_GAME', 'host', 'player-early'],
    ['LOBBY', 'player-early', 'player-late'],
    ['LOBBY', 'host', 'host'],
    ['LOBBY', 'host', 'spectator-first'],
    ['LOBBY', 'host', 'offline-player'],
    ['LOBBY', 'host', 'missing-player'],
  ] as const)(
    'rejects invalid explicit transfer in %s by %s to %s',
    (phase, actorMemberId, targetMemberId) => {
      expect(
        decideExplicitHostTransfer({
          phase,
          actorMemberId,
          currentHostId: 'host',
          targetMemberId,
          members,
        }),
      ).toEqual({
        ok: false,
        code: actorMemberId === 'host' ? 'ACTION_NOT_ALLOWED' : 'NOT_AUTHORIZED',
      });
    },
  );
});
