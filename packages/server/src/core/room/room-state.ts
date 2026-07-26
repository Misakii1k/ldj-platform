import type { JsonPrimitive } from '@lan-party/shared';

export type RoomPhase = 'LOBBY' | 'IN_GAME' | 'POST_GAME' | 'CLOSED';
export type MemberRole = 'player' | 'spectator';
export type MemberConnectionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED_RESERVED'
  | 'EXPIRED'
  | 'KICKED';

export type ImmutableRoomJsonValue =
  | JsonPrimitive
  | readonly ImmutableRoomJsonValue[]
  | ImmutableRoomJsonObject;
export interface ImmutableRoomJsonObject {
  readonly [key: string]: ImmutableRoomJsonValue;
}

export interface MemberState {
  readonly memberId: string;
  readonly nickname: string;
  readonly role: MemberRole;
  readonly connectionStatus: MemberConnectionStatus;
  readonly joinedAt: number;
  readonly reservedUntil: number | null;
}

export interface RoomGameConfiguration {
  readonly gameId: string;
  readonly value: ImmutableRoomJsonObject;
}

export interface ActiveRoomSession {
  readonly sessionId: string;
  readonly participantMemberIds: readonly string[];
  readonly status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
}

export interface RoomState {
  readonly roomId: string;
  readonly roomCode: string;
  readonly phase: RoomPhase;
  readonly hostMemberId: string | null;
  readonly members: readonly MemberState[];
  readonly spectatorsAllowed: boolean;
  readonly game: RoomGameConfiguration;
  readonly activeSession: ActiveRoomSession | null;
  readonly previousSessionId: string | null;
}

export function isCurrentRoomMember(member: MemberState): boolean {
  return (
    member.connectionStatus === 'CONNECTED' ||
    member.connectionStatus === 'DISCONNECTED_RESERVED'
  );
}

export function isConnectedRoomMember(member: MemberState): boolean {
  return member.connectionStatus === 'CONNECTED';
}

export function freezeRoomState(state: RoomState): RoomState {
  const members = state.members.map((member) => Object.freeze({ ...member }));
  const activeSession =
    state.activeSession === null
      ? null
      : Object.freeze({
          ...state.activeSession,
          participantMemberIds: Object.freeze([...state.activeSession.participantMemberIds]),
        });

  return Object.freeze({
    ...state,
    members: Object.freeze(members),
    game: freezeRoomGameConfiguration(state.game),
    activeSession,
  });
}

export function freezeRoomGameConfiguration(
  configuration: RoomGameConfiguration,
): RoomGameConfiguration {
  return Object.freeze({
    ...configuration,
    value: cloneAndFreezeJsonObject(configuration.value),
  });
}

function cloneAndFreezeJsonObject(value: ImmutableRoomJsonObject): ImmutableRoomJsonObject {
  const clone: Record<string, ImmutableRoomJsonValue> = {};
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child !== undefined) clone[key] = cloneAndFreezeJsonValue(child);
  }
  return Object.freeze(clone);
}

function cloneAndFreezeJsonValue(value: ImmutableRoomJsonValue): ImmutableRoomJsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const values = value as readonly ImmutableRoomJsonValue[];
    return Object.freeze(values.map((child) => cloneAndFreezeJsonValue(child)));
  }
  return cloneAndFreezeJsonObject(value as ImmutableRoomJsonObject);
}
