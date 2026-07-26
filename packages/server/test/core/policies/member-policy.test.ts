import { describe, expect, it } from 'vitest';

import {
  canBecomeHost,
  canPerformGameAction,
  tryNormalizeNickname,
  validateJoin,
  validateStartGame,
  type PolicyMember,
} from '../../../src/core/policies/member-policy.js';

describe('member policy', () => {
  it('normalizes nickname whitespace and Unicode before uniqueness checks', () => {
    const existing: PolicyMember[] = [
      { memberId: 'player-1', nickname: 'Caf\u00e9', role: 'player', connected: true },
    ];

    expect(tryNormalizeNickname('  Cafe\u0301  ')).toBe('Caf\u00e9');
    expect(
      validateJoin({
        nickname: ' Cafe\u0301 ',
        requestedRole: 'player',
        roomStatus: 'LOBBY',
        spectatorsAllowed: true,
        members: existing,
      }),
    ).toEqual({ ok: false, code: 'NICKNAME_TAKEN' });
  });

  it('enforces 1 to 16 Unicode characters for normalized nicknames', () => {
    expect(tryNormalizeNickname('   ')).toBeNull();
    expect(tryNormalizeNickname('😀'.repeat(16))).toBe('😀'.repeat(16));
    expect(tryNormalizeNickname('😀'.repeat(17))).toBeNull();
    expect(tryNormalizeNickname('player-\uD800')).toBeNull();
  });

  it('enforces independent capacities of 12 players and 8 spectators', () => {
    const players: PolicyMember[] = Array.from({ length: 12 }, (_, index) => ({
      memberId: `player-${String(index)}`,
      nickname: `玩家${String(index)}`,
      role: 'player' as const,
      connected: index % 2 === 0,
    }));
    const spectators: PolicyMember[] = Array.from({ length: 8 }, (_, index) => ({
      memberId: `spectator-${String(index)}`,
      nickname: `观众${String(index)}`,
      role: 'spectator' as const,
      connected: true,
    }));

    expect(
      validateJoin({
        nickname: 'new player',
        requestedRole: 'player',
        roomStatus: 'LOBBY',
        spectatorsAllowed: true,
        members: players,
      }),
    ).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(
      validateJoin({
        nickname: 'new spectator',
        requestedRole: 'spectator',
        roomStatus: 'LOBBY',
        spectatorsAllowed: true,
        members: spectators,
      }),
    ).toEqual({ ok: false, code: 'ROOM_FULL' });
  });

  it('allows only spectators to join while a game is in progress', () => {
    expect(
      validateJoin({
        nickname: 'late player',
        requestedRole: 'player',
        roomStatus: 'IN_GAME',
        spectatorsAllowed: true,
        members: [],
      }),
    ).toEqual({ ok: false, code: 'ACTION_NOT_ALLOWED' });
    expect(
      validateJoin({
        nickname: 'late spectator',
        requestedRole: 'spectator',
        roomStatus: 'IN_GAME',
        spectatorsAllowed: true,
        members: [],
      }),
    ).toEqual({ ok: true, nickname: 'late spectator' });
  });

  it('rejects new spectators when spectating is disabled', () => {
    expect(
      validateJoin({
        nickname: 'spectator',
        requestedRole: 'spectator',
        roomStatus: 'LOBBY',
        spectatorsAllowed: false,
        members: [],
      }),
    ).toEqual({ ok: false, code: 'ACTION_NOT_ALLOWED' });
  });

  it('requires 4 to 12 connected players to start and ignores spectators', () => {
    const members: PolicyMember[] = [
      ...Array.from({ length: 4 }, (_, index) => ({
        memberId: `player-${String(index)}`,
        nickname: `player ${String(index)}`,
        role: 'player' as const,
        connected: index < 3,
      })),
      { memberId: 'spectator', nickname: 'spectator', role: 'spectator', connected: true },
    ];

    expect(validateStartGame(members)).toEqual({
      ok: false,
      code: 'ACTION_NOT_ALLOWED',
      connectedPlayerCount: 3,
    });
    members[3] = { ...members[3]!, connected: true };
    expect(validateStartGame(members)).toEqual({ ok: true, connectedPlayerCount: 4 });
  });

  it('never grants host or game-actor capability to spectators', () => {
    const spectator: PolicyMember = {
      memberId: 'spectator',
      nickname: 'spectator',
      role: 'spectator',
      connected: true,
    };
    const player: PolicyMember = {
      memberId: 'player',
      nickname: 'player',
      role: 'player',
      connected: true,
    };

    expect(canBecomeHost(spectator)).toBe(false);
    expect(canPerformGameAction(spectator)).toBe(false);
    expect(canBecomeHost(player)).toBe(true);
    expect(canPerformGameAction(player)).toBe(true);
    expect(canPerformGameAction({ ...player, connected: false })).toBe(false);
  });
});
