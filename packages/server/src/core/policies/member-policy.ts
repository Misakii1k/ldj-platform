import { normalizeNickname as normalizeSecurityNickname } from '../security/nickname.js';

export const MAX_PLAYER_COUNT = 12;
export const MAX_SPECTATOR_COUNT = 8;
export const MIN_START_PLAYER_COUNT = 4;

export type MemberRole = 'player' | 'spectator';
export type JoinableRoomStatus = 'LOBBY' | 'IN_GAME' | 'POST_GAME' | 'CLOSED';

export interface PolicyMember {
  readonly memberId: string;
  readonly nickname: string;
  readonly role: MemberRole;
  readonly connected: boolean;
}

type JoinPolicyErrorCode =
  | 'ACTION_NOT_ALLOWED'
  | 'INVALID_MESSAGE'
  | 'NICKNAME_TAKEN'
  | 'ROOM_FULL';

export type JoinPolicyResult =
  | { readonly ok: false; readonly code: JoinPolicyErrorCode }
  | { readonly ok: true; readonly nickname: string };

export type StartGamePolicyResult =
  | {
      readonly ok: false;
      readonly code: 'ACTION_NOT_ALLOWED';
      readonly connectedPlayerCount: number;
    }
  | { readonly ok: true; readonly connectedPlayerCount: number };

export function tryNormalizeNickname(input: string): string | null {
  try {
    return normalizeSecurityNickname(input);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function validateJoin(input: {
  readonly nickname: string;
  readonly requestedRole: MemberRole;
  readonly roomStatus: JoinableRoomStatus;
  readonly spectatorsAllowed: boolean;
  readonly members: readonly PolicyMember[];
}): JoinPolicyResult {
  const nickname = tryNormalizeNickname(input.nickname);
  if (nickname === null) return { ok: false, code: 'INVALID_MESSAGE' };

  if (input.members.some((member) => tryNormalizeNickname(member.nickname) === nickname)) {
    return { ok: false, code: 'NICKNAME_TAKEN' };
  }

  if (!isRoleJoinAllowed(input.requestedRole, input.roomStatus, input.spectatorsAllowed)) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED' };
  }

  const roleCount = input.members.filter((member) => member.role === input.requestedRole).length;
  const capacity = input.requestedRole === 'player' ? MAX_PLAYER_COUNT : MAX_SPECTATOR_COUNT;
  return roleCount >= capacity
    ? { ok: false, code: 'ROOM_FULL' }
    : { ok: true, nickname };
}

export function validateStartGame(members: readonly PolicyMember[]): StartGamePolicyResult {
  const connectedPlayerCount = members.filter(canPerformGameAction).length;
  return connectedPlayerCount >= MIN_START_PLAYER_COUNT && connectedPlayerCount <= MAX_PLAYER_COUNT
    ? { ok: true, connectedPlayerCount }
    : { ok: false, code: 'ACTION_NOT_ALLOWED', connectedPlayerCount };
}

export function canBecomeHost(member: PolicyMember): boolean {
  return member.role === 'player' && member.connected;
}

export function canPerformGameAction(member: PolicyMember): boolean {
  return member.role === 'player' && member.connected;
}

function isRoleJoinAllowed(
  role: MemberRole,
  roomStatus: JoinableRoomStatus,
  spectatorsAllowed: boolean,
): boolean {
  if (role === 'player') return roomStatus === 'LOBBY';
  if (!spectatorsAllowed) return false;
  return roomStatus === 'LOBBY' || roomStatus === 'IN_GAME';
}
