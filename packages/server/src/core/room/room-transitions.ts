import {
  gameIdSchema,
  playerIdSchema,
  roomCodeSchema,
  roomIdSchema,
  safeJsonObjectSchema,
  sessionIdSchema,
} from '@lan-party/shared';
import { z } from 'zod';

import {
  decideExplicitHostTransfer,
  decideHostTransfer,
  type HostEligibleMember,
} from '../policies/host-policy.js';
import {
  validateJoin,
  validateStartGame,
  type PolicyMember,
} from '../policies/member-policy.js';
import { calculateSeatReservation } from '../policies/seat-reservation.js';
import { normalizeNickname } from '../security/nickname.js';
import {
  freezeRoomGameConfiguration,
  freezeRoomState,
  isConnectedRoomMember,
  isCurrentRoomMember,
  type MemberRole,
  type MemberState,
  type RoomGameConfiguration,
  type RoomState,
} from './room-state.js';

const roomSessionAuthorityBrand: unique symbol = Symbol('room-session-authority');
const issuedRoomSessionAuthorities = new WeakSet<object>();

export interface RoomSessionAuthority {
  readonly source: 'platform' | 'game_module';
  readonly [roomSessionAuthorityBrand]: true;
}

export type RoomDomainErrorCode =
  | 'ACTION_NOT_ALLOWED'
  | 'INVALID_MESSAGE'
  | 'NICKNAME_TAKEN'
  | 'NOT_AUTHORIZED'
  | 'ROOM_CLOSED'
  | 'ROOM_FULL';

export type RoomTransitionResult =
  | { readonly ok: true; readonly state: RoomState }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: RoomDomainErrorCode;
        readonly reason: string;
      };
    };

export type GameConfigurationValidator = (
  configuration: Readonly<RoomGameConfiguration>,
) => boolean;

const timestampSchema = z.number().int().min(0).safe();
const nicknameSchema = z.string();
const memberRoleSchema = z.enum(['player', 'spectator']);

const createRoomInputSchema = z
  .object({
    roomId: roomIdSchema,
    roomCode: roomCodeSchema,
    creatorMemberId: playerIdSchema,
    creatorNickname: nicknameSchema,
    joinedAt: timestampSchema,
    gameId: gameIdSchema,
    gameConfiguration: safeJsonObjectSchema,
    spectatorsAllowed: z.boolean(),
  })
  .strict();

const joinRoomInputSchema = z
  .object({
    memberId: playerIdSchema,
    nickname: nicknameSchema,
    role: memberRoleSchema,
    joinedAt: timestampSchema,
  })
  .strict();

const memberTargetInputSchema = z.object({ targetMemberId: playerIdSchema }).strict();
const startRoomInputSchema = z.object({ sessionId: sessionIdSchema }).strict();
const updateGameConfigurationInputSchema = z
  .object({
    gameId: gameIdSchema,
    gameConfiguration: safeJsonObjectSchema,
    spectatorsAllowed: z.boolean().optional(),
  })
  .strict();
const abortActiveSessionInputSchema = z.object({ confirmed: z.literal(true) }).strict();

export interface CreateRoomInput {
  readonly roomId: string;
  readonly roomCode: string;
  readonly creatorMemberId: string;
  readonly creatorNickname: string;
  readonly joinedAt: number;
  readonly gameId: string;
  readonly gameConfiguration: Readonly<Record<string, unknown>>;
  readonly spectatorsAllowed: boolean;
}

export interface JoinRoomInput {
  readonly memberId: string;
  readonly nickname: string;
  readonly role: MemberRole;
  readonly joinedAt: number;
}

export interface MemberTargetInput {
  readonly targetMemberId: string;
}

export interface StartRoomInput {
  readonly sessionId: string;
}

export interface UpdateGameConfigurationInput {
  readonly gameId: string;
  readonly gameConfiguration: Readonly<Record<string, unknown>>;
  readonly spectatorsAllowed?: boolean;
}

export interface AbortActiveSessionInput {
  readonly confirmed: true;
}

export function createRoomSessionAuthority(
  source: RoomSessionAuthority['source'],
): RoomSessionAuthority {
  if (source !== 'platform' && source !== 'game_module') {
    throw new TypeError('room session authority source must be platform or game_module');
  }
  const authority: RoomSessionAuthority = Object.freeze({
    source,
    [roomSessionAuthorityBrand]: true as const,
  });
  issuedRoomSessionAuthorities.add(authority);
  return authority;
}

export function createRoom(input: CreateRoomInput): RoomTransitionResult {
  const parsed = createRoomInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();

  let nickname: string;
  try {
    nickname = normalizeNickname(parsed.data.creatorNickname);
  } catch (error) {
    if (error instanceof RangeError) return invalidInput();
    throw error;
  }

  const creator: MemberState = {
    memberId: parsed.data.creatorMemberId,
    nickname,
    role: 'player',
    connectionStatus: 'CONNECTED',
    joinedAt: parsed.data.joinedAt,
    reservedUntil: null,
  };

  return success(
    freezeRoomState({
      roomId: parsed.data.roomId,
      roomCode: parsed.data.roomCode,
      phase: 'LOBBY',
      hostMemberId: creator.memberId,
      members: [creator],
      spectatorsAllowed: parsed.data.spectatorsAllowed,
      game: {
        gameId: parsed.data.gameId,
        value: parsed.data.gameConfiguration,
      },
      activeSession: null,
      previousSessionId: null,
    }),
  );
}

export function joinRoom(state: RoomState, input: JoinRoomInput): RoomTransitionResult {
  if (state.phase === 'CLOSED') return failure('ROOM_CLOSED', 'room is closed');

  const parsed = joinRoomInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (state.members.some((member) => member.memberId === parsed.data.memberId)) {
    return failure('ACTION_NOT_ALLOWED', 'member identifier is already associated with this room');
  }

  const currentMembers = state.members.filter(isCurrentRoomMember);
  const policyResult = validateJoin({
    nickname: parsed.data.nickname,
    requestedRole: parsed.data.role,
    roomStatus: state.phase,
    spectatorsAllowed: state.spectatorsAllowed,
    members: currentMembers.map(toPolicyMember),
  });
  if (!policyResult.ok) return failure(policyResult.code, joinFailureReason(policyResult.code));

  const member: MemberState = {
    memberId: parsed.data.memberId,
    nickname: policyResult.nickname,
    role: parsed.data.role,
    connectionStatus: 'CONNECTED',
    joinedAt: parsed.data.joinedAt,
    reservedUntil: null,
  };

  return success(withState(state, { members: [...state.members, member] }));
}

/**
 * `actorMemberId` comes from the authenticated connection context. It is
 * deliberately not part of a client-controlled command object.
 */
export function leaveRoom(
  state: RoomState,
  actorMemberId: string,
  now: number,
  reservationMinutes?: number,
): RoomTransitionResult {
  if (!isValidActorMemberId(actorMemberId) || !timestampSchema.safeParse(now).success) {
    return invalidInput();
  }
  if (state.phase === 'CLOSED') return failure('ROOM_CLOSED', 'room is closed');

  const actor = findConnectedMember(state, actorMemberId);
  if (actor === undefined) return failure('NOT_AUTHORIZED', 'actor is not an active room member');

  const isCurrentParticipant =
    state.phase === 'IN_GAME' &&
    state.activeSession?.participantMemberIds.includes(actor.memberId) === true;

  if (isCurrentParticipant) {
    let reservedUntil: number;
    try {
      const reservation = calculateSeatReservation({
        disconnectedAt: now,
        now,
        ...(reservationMinutes === undefined ? {} : { durationMinutes: reservationMinutes }),
      });
      reservedUntil = reservation.reservedUntil;
      if (!timestampSchema.safeParse(reservedUntil).success) return invalidInput();
    } catch (error) {
      if (error instanceof RangeError) return invalidInput();
      throw error;
    }
    return success(
      withState(state, {
        members: replaceMember(state.members, actor.memberId, {
          ...actor,
          connectionStatus: 'DISCONNECTED_RESERVED',
          reservedUntil,
        }),
      }),
    );
  }

  const remainingMembers = state.members.filter((member) => member.memberId !== actor.memberId);
  let hostMemberId = state.hostMemberId;
  if (actor.memberId === state.hostMemberId) {
    if (state.phase === 'IN_GAME') {
      return failure('ACTION_NOT_ALLOWED', 'an in-game host must retain a player seat');
    }
    const decision = decideHostTransfer({
      phase: state.phase,
      trigger: 'VOLUNTARY_LEAVE',
      currentHostId: actor.memberId,
      members: remainingMembers.map(toHostEligibleMember),
    });
    hostMemberId = decision.type === 'TRANSFER' ? decision.newHostMemberId : null;
  }

  return success(withState(state, { members: remainingMembers, hostMemberId }));
}

export function kickMember(
  state: RoomState,
  actorMemberId: string,
  input: MemberTargetInput,
): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  if (state.phase !== 'LOBBY' && state.phase !== 'IN_GAME') {
    return failure('ACTION_NOT_ALLOWED', 'members cannot be kicked in the current phase');
  }

  const parsed = memberTargetInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (parsed.data.targetMemberId === actorMemberId) {
    return failure('ACTION_NOT_ALLOWED', 'host cannot kick themselves');
  }

  const target = findCurrentMember(state, parsed.data.targetMemberId);
  if (target === undefined) return failure('ACTION_NOT_ALLOWED', 'target is not an active member');
  if (
    state.phase === 'IN_GAME' &&
    state.activeSession?.participantMemberIds.includes(target.memberId) === true
  ) {
    return failure('ACTION_NOT_ALLOWED', 'an active session participant cannot be kicked');
  }

  return success(
    withState(state, {
      members: replaceMember(state.members, target.memberId, {
        ...target,
        connectionStatus: 'KICKED',
        reservedUntil: null,
      }),
    }),
  );
}

export function updateGameConfiguration(
  state: RoomState,
  actorMemberId: string,
  input: UpdateGameConfigurationInput,
  validateGameConfiguration: GameConfigurationValidator,
): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  if (state.phase !== 'LOBBY') {
    return failure('ACTION_NOT_ALLOWED', 'game configuration may only change in the lobby');
  }

  const parsed = updateGameConfigurationInputSchema.safeParse(input);
  if (!parsed.success || typeof validateGameConfiguration !== 'function') return invalidInput();
  const candidate = freezeRoomGameConfiguration({
    gameId: parsed.data.gameId,
    value: parsed.data.gameConfiguration,
  });
  if (!validateGameConfiguration(candidate)) {
    return failure('ACTION_NOT_ALLOWED', 'game configuration is invalid');
  }

  return success(
    withState(state, {
      game: candidate,
      ...(parsed.data.spectatorsAllowed === undefined
        ? {}
        : { spectatorsAllowed: parsed.data.spectatorsAllowed }),
    }),
  );
}

export function transferHost(
  state: RoomState,
  actorMemberId: string,
  input: MemberTargetInput,
): RoomTransitionResult {
  if (state.phase === 'CLOSED') return failure('ROOM_CLOSED', 'room is closed');
  if (!isValidActorMemberId(actorMemberId)) return invalidInput();

  const parsed = memberTargetInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (state.hostMemberId === null) {
    return failure('NOT_AUTHORIZED', 'room does not currently have a host');
  }

  const decision = decideExplicitHostTransfer({
    phase: state.phase,
    actorMemberId,
    currentHostId: state.hostMemberId,
    targetMemberId: parsed.data.targetMemberId,
    members: state.members.filter(isCurrentRoomMember).map(toHostEligibleMember),
  });
  if (!decision.ok) return failure(decision.code, 'host transfer is not allowed');

  return success(withState(state, { hostMemberId: decision.newHostMemberId }));
}

export function startRoom(
  state: RoomState,
  actorMemberId: string,
  input: StartRoomInput,
  validateGameConfiguration: GameConfigurationValidator,
): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  if (state.phase !== 'LOBBY') {
    return failure('ACTION_NOT_ALLOWED', 'game may only start from the lobby');
  }

  const parsed = startRoomInputSchema.safeParse(input);
  if (!parsed.success || typeof validateGameConfiguration !== 'function') return invalidInput();
  if (parsed.data.sessionId === state.previousSessionId) {
    return failure('ACTION_NOT_ALLOWED', 'a new game must use a new session identifier');
  }

  const currentMembers = state.members.filter(isCurrentRoomMember);
  const startPolicy = validateStartGame(currentMembers.map(toPolicyMember));
  if (!startPolicy.ok) {
    return failure('ACTION_NOT_ALLOWED', 'four to twelve connected players are required');
  }
  if (!validateGameConfiguration(state.game)) {
    return failure('ACTION_NOT_ALLOWED', 'game configuration is invalid');
  }

  const participantMemberIds = currentMembers
    .filter((member) => member.role === 'player' && isConnectedRoomMember(member))
    .map((member) => member.memberId);

  return success(
    withState(state, {
      phase: 'IN_GAME',
      activeSession: {
        sessionId: parsed.data.sessionId,
        participantMemberIds,
        status: 'ACTIVE',
      },
    }),
  );
}

export function abortActiveSession(
  state: RoomState,
  actorMemberId: string,
  input: AbortActiveSessionInput,
): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  const parsed = abortActiveSessionInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (
    state.phase !== 'IN_GAME' ||
    state.activeSession === null ||
    state.activeSession.status !== 'ACTIVE'
  ) {
    return failure('ACTION_NOT_ALLOWED', 'there is no active session to abort');
  }

  return success(
    withState(state, {
      phase: 'POST_GAME',
      activeSession: { ...state.activeSession, status: 'ABORTED' },
    }),
  );
}

export function finishActiveSession(
  state: RoomState,
  authority: RoomSessionAuthority,
  sessionId: string,
): RoomTransitionResult {
  if (!issuedRoomSessionAuthorities.has(authority)) {
    return failure('NOT_AUTHORIZED', 'finishing a session requires server authority');
  }
  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (!parsedSessionId.success) return invalidInput();
  if (
    state.phase !== 'IN_GAME' ||
    state.activeSession === null ||
    state.activeSession.status !== 'ACTIVE'
  ) {
    return failure('ACTION_NOT_ALLOWED', 'there is no active session to finish');
  }
  if (state.activeSession.sessionId !== parsedSessionId.data) {
    return failure('ACTION_NOT_ALLOWED', 'session identifier does not match the active session');
  }

  return success(
    withState(state, {
      phase: 'POST_GAME',
      activeSession: { ...state.activeSession, status: 'FINISHED' },
    }),
  );
}

export function returnToLobby(state: RoomState, actorMemberId: string): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  if (
    state.phase !== 'POST_GAME' ||
    state.activeSession === null ||
    state.activeSession.status === 'ACTIVE'
  ) {
    return failure('ACTION_NOT_ALLOWED', 'room is not ready to return to the lobby');
  }

  return success(
    withState(state, {
      phase: 'LOBBY',
      activeSession: null,
      previousSessionId: state.activeSession.sessionId,
    }),
  );
}

export function closeRoom(state: RoomState, actorMemberId: string): RoomTransitionResult {
  const authorizationFailure = authorizeHost(state, actorMemberId);
  if (authorizationFailure !== null) return authorizationFailure;
  if (state.phase !== 'LOBBY' && state.phase !== 'POST_GAME') {
    return failure('ACTION_NOT_ALLOWED', 'room cannot be closed during an active game');
  }
  return success(withState(state, { phase: 'CLOSED' }));
}

function authorizeHost(state: RoomState, actorMemberId: string): RoomTransitionResult | null {
  if (state.phase === 'CLOSED') return failure('ROOM_CLOSED', 'room is closed');
  if (!isValidActorMemberId(actorMemberId)) return invalidInput();
  const actor = findConnectedMember(state, actorMemberId);
  if (actor === undefined || state.hostMemberId !== actor.memberId) {
    return failure('NOT_AUTHORIZED', 'only the current host may perform this action');
  }
  return null;
}

function isValidActorMemberId(memberId: string): boolean {
  return playerIdSchema.safeParse(memberId).success;
}

function findCurrentMember(state: RoomState, memberId: string): MemberState | undefined {
  return state.members.find(
    (member) => member.memberId === memberId && isCurrentRoomMember(member),
  );
}

function findConnectedMember(state: RoomState, memberId: string): MemberState | undefined {
  return state.members.find(
    (member) => member.memberId === memberId && isConnectedRoomMember(member),
  );
}

function toPolicyMember(member: MemberState): PolicyMember {
  return {
    memberId: member.memberId,
    nickname: member.nickname,
    role: member.role,
    connected: isConnectedRoomMember(member),
  };
}

function toHostEligibleMember(member: MemberState): HostEligibleMember {
  return {
    memberId: member.memberId,
    role: member.role,
    connected: isConnectedRoomMember(member),
    joinedAt: member.joinedAt,
  };
}

function replaceMember(
  members: readonly MemberState[],
  memberId: string,
  replacement: MemberState,
): readonly MemberState[] {
  return members.map((member) => (member.memberId === memberId ? replacement : member));
}

function withState(state: RoomState, changes: Partial<RoomState>): RoomState {
  return freezeRoomState({ ...state, ...changes });
}

function success(state: RoomState): RoomTransitionResult {
  return { ok: true, state };
}

function invalidInput(): RoomTransitionResult {
  return failure('INVALID_MESSAGE', 'domain input is invalid');
}

function failure(code: RoomDomainErrorCode, reason: string): RoomTransitionResult {
  return { ok: false, error: { code, reason } };
}

function joinFailureReason(code: RoomDomainErrorCode): string {
  switch (code) {
    case 'INVALID_MESSAGE':
      return 'nickname is invalid';
    case 'NICKNAME_TAKEN':
      return 'nickname is already in use';
    case 'ROOM_FULL':
      return 'requested room capacity is full';
    case 'ACTION_NOT_ALLOWED':
      return 'requested role cannot join in the current room phase';
    default:
      return 'join is not allowed';
  }
}
