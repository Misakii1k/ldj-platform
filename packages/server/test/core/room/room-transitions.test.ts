import { describe, expect, it, vi } from 'vitest';

import {
  abortActiveSession,
  closeRoom,
  createRoom,
  createRoomSessionAuthority,
  finishActiveSession,
  joinRoom,
  kickMember,
  leaveRoom,
  returnToLobby,
  startRoom,
  transferHost,
  updateGameConfiguration,
  type CreateRoomInput,
  type JoinRoomInput,
  type RoomState,
  type RoomSessionAuthority,
  type RoomTransitionResult,
} from '../../../src/core/room/index.js';

const baseCreateInput: CreateRoomInput = {
  roomId: 'room-a',
  roomCode: 'ABC23',
  creatorMemberId: 'player-host',
  creatorNickname: ' 房主 ',
  joinedAt: 100,
  gameId: 'undercover',
  gameConfiguration: { speechSeconds: 60, nested: { votingSeconds: 45 } },
  spectatorsAllowed: true,
};

function expectSuccess(result: RoomTransitionResult): RoomState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected success, received ${result.error.code}`);
  return result.state;
}

function expectFailure(result: RoomTransitionResult, code: string): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

function newRoom(input: Partial<CreateRoomInput> = {}): RoomState {
  return expectSuccess(createRoom({ ...baseCreateInput, ...input }));
}

function addMember(state: RoomState, input: Partial<JoinRoomInput> = {}): RoomState {
  const index = state.members.length;
  return expectSuccess(
    joinRoom(state, {
      memberId: `player-${String(index)}`,
      nickname: `成员${String(index)}`,
      role: 'player',
      joinedAt: 100 + index,
      ...input,
    }),
  );
}

function fourPlayerRoom(): RoomState {
  let state = newRoom();
  state = addMember(state);
  state = addMember(state);
  state = addMember(state);
  return state;
}

describe('room aggregate creation and membership', () => {
  it('creates an immutable lobby with a normalized connected player as host', () => {
    const sourceConfiguration = {
      speechSeconds: 60,
      nested: { votingSeconds: 45 },
    };
    const state = newRoom({ gameConfiguration: sourceConfiguration });

    expect(state).toMatchObject({
      roomCode: 'ABC23',
      phase: 'LOBBY',
      hostMemberId: 'player-host',
      previousSessionId: null,
      activeSession: null,
      members: [
        {
          memberId: 'player-host',
          nickname: '房主',
          role: 'player',
          connectionStatus: 'CONNECTED',
          reservedUntil: null,
        },
      ],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.members)).toBe(true);
    expect(Object.isFrozen(state.members[0])).toBe(true);
    expect(Object.isFrozen(state.game.value)).toBe(true);
    expect(Object.isFrozen(state.game.value.nested)).toBe(true);
    expect(Object.isFrozen(sourceConfiguration)).toBe(false);
    expect(state.game.value).not.toBe(sourceConfiguration);
    sourceConfiguration.nested.votingSeconds = 90;
    expect(state.game.value.nested).toEqual({ votingSeconds: 45 });
  });

  it('rejects malformed or unknown creation fields with a stable error code', () => {
    expectFailure(createRoom({ ...baseCreateInput, creatorNickname: '   ' }), 'INVALID_MESSAGE');
    expectFailure(
      createRoom({ ...baseCreateInput, actorMemberId: 'forged' } as CreateRoomInput),
      'INVALID_MESSAGE',
    );
  });

  it('joins players and spectators without mutating the prior state', () => {
    const original = newRoom();
    const withPlayer = addMember(original, { nickname: '  Cafe\u0301  ' });
    const withSpectator = addMember(withPlayer, {
      memberId: 'spectator-1',
      nickname: '观众',
      role: 'spectator',
    });

    expect(original.members).toHaveLength(1);
    expect(withPlayer.members[1]?.nickname).toBe('Caf\u00e9');
    expect(withSpectator.members[2]?.role).toBe('spectator');
    expect(Object.isFrozen(withSpectator.members[2])).toBe(true);
  });

  it('enforces normalized nickname uniqueness and independent capacities', () => {
    const state = addMember(newRoom(), { nickname: 'Caf\u00e9' });
    expectFailure(
      joinRoom(state, {
        memberId: 'duplicate-name',
        nickname: ' Cafe\u0301 ',
        role: 'spectator',
        joinedAt: 500,
      }),
      'NICKNAME_TAKEN',
    );

    let fullPlayers = state;
    for (let index = 2; index < 12; index += 1) {
      fullPlayers = addMember(fullPlayers, {
        memberId: `capacity-player-${String(index)}`,
        nickname: `容量玩家${String(index)}`,
      });
    }
    expectFailure(
      joinRoom(fullPlayers, {
        memberId: 'player-overflow',
        nickname: '额外玩家',
        role: 'player',
        joinedAt: 999,
      }),
      'ROOM_FULL',
    );
    expect(
      joinRoom(fullPlayers, {
        memberId: 'spectator-still-open',
        nickname: '仍可观战',
        role: 'spectator',
        joinedAt: 1_000,
      }).ok,
    ).toBe(true);
  });

  it('only admits spectators during a game and excludes them from the player seat count', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );

    expectFailure(
      joinRoom(started, {
        memberId: 'late-player',
        nickname: '迟到玩家',
        role: 'player',
        joinedAt: 900,
      }),
      'ACTION_NOT_ALLOWED',
    );
    const withSpectator = expectSuccess(
      joinRoom(started, {
        memberId: 'late-spectator',
        nickname: '迟到观众',
        role: 'spectator',
        joinedAt: 901,
      }),
    );
    expect(withSpectator.members.at(-1)?.role).toBe('spectator');
    expect(started.activeSession?.participantMemberIds).not.toContain('late-spectator');
  });

  it('rejects all joins after close', () => {
    const closed = expectSuccess(closeRoom(newRoom(), 'player-host'));
    expectFailure(
      joinRoom(closed, {
        memberId: 'late-member',
        nickname: '迟到',
        role: 'spectator',
        joinedAt: 300,
      }),
      'ROOM_CLOSED',
    );
  });
});

describe('room aggregate host and departure policies', () => {
  it('removes a voluntary lobby leaver without mutating the old state', () => {
    const original = addMember(newRoom());
    const next = expectSuccess(leaveRoom(original, 'player-1', 1_000));

    expect(original.members.some((member) => member.memberId === 'player-1')).toBe(true);
    expect(next.members.some((member) => member.memberId === 'player-1')).toBe(false);
    expect(next.hostMemberId).toBe('player-host');
  });

  it('immediately transfers a voluntarily vacated host seat to the earliest online player', () => {
    let state = newRoom();
    state = addMember(state, {
      memberId: 'spectator-first',
      nickname: '先到观众',
      role: 'spectator',
      joinedAt: 101,
    });
    state = addMember(state, {
      memberId: 'player-early',
      nickname: '早到玩家',
      joinedAt: 102,
    });
    state = addMember(state, {
      memberId: 'player-late',
      nickname: '晚到玩家',
      joinedAt: 103,
    });

    const next = expectSuccess(leaveRoom(state, 'player-host', 1_000));
    expect(next.hostMemberId).toBe('player-early');
    expect(next.members.some((member) => member.memberId === 'player-host')).toBe(false);
    expect(leaveRoom(newRoom(), 'player-host', 1_000)).toMatchObject({
      ok: true,
      state: { hostMemberId: null },
    });
  });

  it('keeps in-game players as reserved participants instead of deleting them', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    const next = expectSuccess(leaveRoom(started, 'player-host', 10_000));
    const host = next.members.find((member) => member.memberId === 'player-host');

    expect(host).toMatchObject({
      connectionStatus: 'DISCONNECTED_RESERVED',
      reservedUntil: 310_000,
    });
    expect(next.activeSession?.participantMemberIds).toContain('player-host');
    expect(next.hostMemberId).toBe('player-host');
    expectFailure(
      leaveRoom(started, 'player-host', Number.MAX_SAFE_INTEGER),
      'INVALID_MESSAGE',
    );
  });

  it('allows an in-game spectator to leave without changing participants', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    const withSpectator = expectSuccess(
      joinRoom(started, {
        memberId: 'spectator-1',
        nickname: '观众',
        role: 'spectator',
        joinedAt: 500,
      }),
    );
    const participants = withSpectator.activeSession?.participantMemberIds;
    const next = expectSuccess(leaveRoom(withSpectator, 'spectator-1', 10_000));

    expect(next.members.some((member) => member.memberId === 'spectator-1')).toBe(false);
    expect(next.activeSession?.participantMemberIds).toEqual(participants);
  });

  it('kicks lobby members and in-game nonparticipants but never an active participant', () => {
    const lobby = addMember(fourPlayerRoom(), {
      memberId: 'spectator-1',
      nickname: '观众',
      role: 'spectator',
    });
    const kicked = expectSuccess(
      kickMember(lobby, 'player-host', { targetMemberId: 'spectator-1' }),
    );
    expect(kicked.members.find((member) => member.memberId === 'spectator-1')).toMatchObject({
      connectionStatus: 'KICKED',
    });

    const started = expectSuccess(
      startRoom(lobby, 'player-host', { sessionId: 'session-a' }, () => true),
    );
    expectFailure(
      kickMember(started, 'player-host', { targetMemberId: 'player-1' }),
      'ACTION_NOT_ALLOWED',
    );

    const withSpectator = expectSuccess(
      joinRoom(started, {
        memberId: 'late-spectator',
        nickname: '中途观众',
        role: 'spectator',
        joinedAt: 900,
      }),
    );
    const spectatorKicked = expectSuccess(
      kickMember(withSpectator, 'player-host', { targetMemberId: 'late-spectator' }),
    );
    expect(
      spectatorKicked.members.find((member) => member.memberId === 'late-spectator'),
    ).toMatchObject({ connectionStatus: 'KICKED' });

    const withWaitingPlayer = addMember(fourPlayerRoom(), {
      memberId: 'waiting-player',
      nickname: '未参局玩家',
    });
    const disconnectedBeforeStart: RoomState = {
      ...withWaitingPlayer,
      members: withWaitingPlayer.members.map((member) =>
        member.memberId === 'waiting-player'
          ? {
              ...member,
              connectionStatus: 'DISCONNECTED_RESERVED' as const,
              reservedUntil: 10_000,
            }
          : member,
      ),
    };
    const activeWithoutWaitingPlayer = expectSuccess(
      startRoom(
        disconnectedBeforeStart,
        'player-host',
        { sessionId: 'session-waiting' },
        () => true,
      ),
    );
    const waitingPlayerKicked = expectSuccess(
      kickMember(activeWithoutWaitingPlayer, 'player-host', {
        targetMemberId: 'waiting-player',
      }),
    );
    expect(
      waitingPlayerKicked.members.find((member) => member.memberId === 'waiting-player'),
    ).toMatchObject({ connectionStatus: 'KICKED' });
  });

  it('authorizes host management from context and rejects forged actor fields', () => {
    const state = addMember(newRoom());
    expectFailure(
      kickMember(state, 'player-1', {
        targetMemberId: 'player-host',
        actorMemberId: 'player-host',
      } as never),
      'NOT_AUTHORIZED',
    );
    expectFailure(
      kickMember(state, 'player-host', {
        targetMemberId: 'player-1',
        actorMemberId: 'player-host',
      } as never),
      'INVALID_MESSAGE',
    );
  });

  it('does not authorize a reserved identity without an active connection', () => {
    const state = newRoom();
    const reserved: RoomState = {
      ...state,
      members: state.members.map((member) => ({
        ...member,
        connectionStatus: 'DISCONNECTED_RESERVED',
        reservedUntil: 10_000,
      })),
    };

    expectFailure(closeRoom(reserved, 'player-host'), 'NOT_AUTHORIZED');
    expectFailure(leaveRoom(reserved, 'player-host', 1_000), 'NOT_AUTHORIZED');
  });

  it('explicitly transfers only to a connected player in lobby or post-game', () => {
    let state = addMember(newRoom(), { memberId: 'player-next', nickname: '下一任' });
    state = addMember(state, {
      memberId: 'spectator-1',
      nickname: '观众',
      role: 'spectator',
    });

    const transferred = expectSuccess(
      transferHost(state, 'player-host', { targetMemberId: 'player-next' }),
    );
    expect(transferred.hostMemberId).toBe('player-next');
    expectFailure(
      transferHost(state, 'player-host', { targetMemberId: 'spectator-1' }),
      'ACTION_NOT_ALLOWED',
    );
    expectFailure(
      transferHost(state, 'player-next', { targetMemberId: 'player-host' }),
      'NOT_AUTHORIZED',
    );
  });

  it('never grants spectators room-management authority', () => {
    const state = addMember(newRoom(), {
      memberId: 'spectator-1',
      nickname: '观众',
      role: 'spectator',
    });
    expectFailure(closeRoom(state, 'spectator-1'), 'NOT_AUTHORIZED');
    expectFailure(kickMember(state, 'spectator-1', { targetMemberId: 'player-host' }), 'NOT_AUTHORIZED');
    expectFailure(
      transferHost(state, 'player-host', { targetMemberId: 'spectator-1' }),
      'ACTION_NOT_ALLOWED',
    );
  });
});

describe('room aggregate game lifecycle', () => {
  it('lets only the lobby host update a validated, detached game configuration', () => {
    const lobby = addMember(newRoom());
    const source = { speechSeconds: 90, nested: { votingSeconds: 60 } };
    const validator = vi.fn((configuration) => {
      expect(Object.isFrozen(configuration)).toBe(true);
      expect(Object.isFrozen(configuration.value)).toBe(true);
      return configuration.gameId === 'undercover';
    });
    const updated = expectSuccess(
      updateGameConfiguration(
        lobby,
        'player-host',
        {
          gameId: 'undercover',
          gameConfiguration: source,
          spectatorsAllowed: false,
        },
        validator,
      ),
    );

    expect(updated.game.value).toEqual(source);
    expect(updated.game.value).not.toBe(source);
    expect(updated.spectatorsAllowed).toBe(false);
    expect(lobby.game.value).toEqual(baseCreateInput.gameConfiguration);
    expect(Object.isFrozen(source)).toBe(false);
    source.nested.votingSeconds = 30;
    expect(updated.game.value.nested).toEqual({ votingSeconds: 60 });
    expect(validator).toHaveBeenCalledOnce();

    expectFailure(
      updateGameConfiguration(
        lobby,
        'player-1',
        { gameId: 'undercover', gameConfiguration: {} },
        () => true,
      ),
      'NOT_AUTHORIZED',
    );
    expectFailure(
      updateGameConfiguration(
        lobby,
        'player-host',
        { gameId: 'undercover', gameConfiguration: {}, actorMemberId: 'forged' } as never,
        () => true,
      ),
      'INVALID_MESSAGE',
    );
    expectFailure(
      updateGameConfiguration(
        lobby,
        'player-host',
        {
          gameId: 'undercover',
          gameConfiguration: JSON.parse('{"constructor":{"polluted":true}}') as Record<
            string,
            unknown
          >,
        },
        () => true,
      ),
      'INVALID_MESSAGE',
    );
    expectFailure(
      updateGameConfiguration(
        lobby,
        'player-host',
        { gameId: 'undercover', gameConfiguration: {} },
        () => false,
      ),
      'ACTION_NOT_ALLOWED',
    );

    const active = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-config' }, () => true),
    );
    expectFailure(
      updateGameConfiguration(
        active,
        'player-host',
        { gameId: 'undercover', gameConfiguration: {} },
        () => true,
      ),
      'ACTION_NOT_ALLOWED',
    );
  });

  it('revalidates host, connected player count, and game configuration before start', () => {
    const threePlayers = addMember(addMember(newRoom()));
    expectFailure(
      startRoom(threePlayers, 'player-host', { sessionId: 'session-a' }, () => true),
      'ACTION_NOT_ALLOWED',
    );

    const lobby = fourPlayerRoom();
    expectFailure(
      startRoom(lobby, 'player-1', { sessionId: 'session-a' }, () => true),
      'NOT_AUTHORIZED',
    );
    expectFailure(
      startRoom(lobby, 'player-host', { sessionId: 'session-a' }, () => false),
      'ACTION_NOT_ALLOWED',
    );

    const validator = vi.fn(() => true);
    const started = expectSuccess(
      startRoom(lobby, 'player-host', { sessionId: 'session-a' }, validator),
    );
    expect(validator).toHaveBeenCalledWith(lobby.game);
    expect(started.phase).toBe('IN_GAME');
    expect(started.activeSession?.participantMemberIds).toHaveLength(4);
    expect(lobby.phase).toBe('LOBBY');
  });

  it('excludes spectators and disconnected players from a new session', () => {
    let lobby = fourPlayerRoom();
    lobby = addMember(lobby, {
      memberId: 'player-extra',
      nickname: '掉线玩家',
    });
    lobby = addMember(lobby, {
      memberId: 'spectator-1',
      nickname: '观众',
      role: 'spectator',
    });
    const disconnected = lobby.members.map((member) =>
      member.memberId === 'player-extra'
        ? { ...member, connectionStatus: 'DISCONNECTED_RESERVED' as const, reservedUntil: 10_000 }
        : member,
    );
    const state = { ...lobby, members: disconnected };

    const started = expectSuccess(
      startRoom(state, 'player-host', { sessionId: 'session-a' }, () => true),
    );
    expect(started.activeSession?.participantMemberIds).not.toContain('player-extra');
    expect(started.activeSession?.participantMemberIds).not.toContain('spectator-1');
  });

  it('returns from post-game while preserving members and host, then requires a fresh session id', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    const postGame = expectSuccess(
      finishActiveSession(
        started,
        createRoomSessionAuthority('game_module'),
        'session-a',
      ),
    );
    const lobby = expectSuccess(returnToLobby(postGame, 'player-host'));

    expect(lobby.phase).toBe('LOBBY');
    expect(lobby.hostMemberId).toBe('player-host');
    expect(lobby.members).toEqual(started.members);
    expect(lobby.activeSession).toBeNull();
    expect(lobby.previousSessionId).toBe('session-a');
    expectFailure(
      startRoom(lobby, 'player-host', { sessionId: 'session-a' }, () => true),
      'ACTION_NOT_ALLOWED',
    );
    expect(
      startRoom(lobby, 'player-host', { sessionId: 'session-b' }, () => true).ok,
    ).toBe(true);
  });

  it('lets only the confirmed host abort an active session and retains diagnostics', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    expectFailure(
      abortActiveSession(started, 'player-1', { confirmed: true }),
      'NOT_AUTHORIZED',
    );
    expectFailure(
      abortActiveSession(started, 'player-host', { confirmed: false } as never),
      'INVALID_MESSAGE',
    );
    expectFailure(
      abortActiveSession(started, 'player-host', {
        confirmed: true,
        actorMemberId: 'forged',
      } as never),
      'INVALID_MESSAGE',
    );

    const aborted = expectSuccess(
      abortActiveSession(started, 'player-host', { confirmed: true }),
    );
    expect(aborted.phase).toBe('POST_GAME');
    expect(aborted.activeSession).toMatchObject({
      sessionId: 'session-a',
      status: 'ABORTED',
      participantMemberIds: started.activeSession?.participantMemberIds,
    });
    expectFailure(
      abortActiveSession(aborted, 'player-host', { confirmed: true }),
      'ACTION_NOT_ALLOWED',
    );
  });

  it('requires an issued server capability and matching session id to finish', () => {
    const started = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    const forgedAuthority = {
      source: 'game_module',
    } as unknown as RoomSessionAuthority;
    expectFailure(
      finishActiveSession(started, forgedAuthority, 'session-a'),
      'NOT_AUTHORIZED',
    );

    const authority = createRoomSessionAuthority('game_module');
    expectFailure(
      finishActiveSession(started, authority, 'session-other'),
      'ACTION_NOT_ALLOWED',
    );
    const finished = expectSuccess(finishActiveSession(started, authority, 'session-a'));
    expect(finished.phase).toBe('POST_GAME');
    expect(finished.activeSession).toMatchObject({
      sessionId: 'session-a',
      status: 'FINISHED',
    });
    expectFailure(
      finishActiveSession(finished, authority, 'session-a'),
      'ACTION_NOT_ALLOWED',
    );
  });

  it('allows only the host to close outside an active game', () => {
    const lobby = addMember(newRoom());
    expectFailure(closeRoom(lobby, 'player-1'), 'NOT_AUTHORIZED');
    expect(expectSuccess(closeRoom(lobby, 'player-host')).phase).toBe('CLOSED');

    const active = expectSuccess(
      startRoom(fourPlayerRoom(), 'player-host', { sessionId: 'session-a' }, () => true),
    );
    expectFailure(closeRoom(active, 'player-host'), 'ACTION_NOT_ALLOWED');
  });
});
