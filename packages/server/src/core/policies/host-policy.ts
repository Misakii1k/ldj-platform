export const HOST_TRANSFER_GRACE_MS = 30_000;

export type ActiveRoomPhase = 'LOBBY' | 'IN_GAME' | 'POST_GAME';
export type ExplicitHostTransferPhase = Exclude<ActiveRoomPhase, 'IN_GAME'>;

export interface HostEligibleMember {
  readonly memberId: string;
  readonly role: 'player' | 'spectator';
  readonly connected: boolean;
  readonly joinedAt: number;
}

export type HostTransferDecision =
  | { readonly type: 'WAIT'; readonly timerId: string; readonly reevaluateAt: number }
  | { readonly type: 'TRANSFER'; readonly newHostMemberId: string }
  | {
      readonly type: 'CANCEL';
      readonly reason: 'HOST_RECONNECTED' | 'STALE_TIMER';
      readonly timerId: string;
    }
  | { readonly type: 'PENDING' };

export interface HostDisconnectTimer {
  readonly timerId: string;
  readonly hostMemberId: string;
  readonly disconnectEpoch: number;
  readonly disconnectedAt: number;
}

export type HostTransferInput =
  | {
      readonly phase: ExplicitHostTransferPhase;
      readonly trigger: 'VOLUNTARY_LEAVE';
      readonly currentHostId: string;
      readonly members: readonly HostEligibleMember[];
    }
  | {
      readonly phase: ActiveRoomPhase;
      readonly trigger: 'DISCONNECTED';
      readonly currentHostId: string;
      readonly timer: HostDisconnectTimer;
      readonly currentDisconnectEpoch: number | null;
      readonly now: number;
      readonly members: readonly HostEligibleMember[];
    };

export type ExplicitHostTransferDecision =
  | { readonly ok: true; readonly newHostMemberId: string }
  | { readonly ok: false; readonly code: 'NOT_AUTHORIZED' | 'ACTION_NOT_ALLOWED' };

export function selectHostTransferCandidate(
  members: readonly HostEligibleMember[],
  currentHostId: string,
): string | null {
  const eligible = members.filter(
    (member) =>
      member.memberId !== currentHostId && member.role === 'player' && member.connected,
  );

  eligible.sort(
    (left, right) =>
      left.joinedAt - right.joinedAt || left.memberId.localeCompare(right.memberId, 'en'),
  );
  return eligible[0]?.memberId ?? null;
}

export function decideHostTransfer(input: HostTransferInput): HostTransferDecision {
  if (input.trigger === 'DISCONNECTED') {
    assertHostDisconnectTimer(input.timer);
    assertTimestamp(input.now, 'now');
    if (input.currentDisconnectEpoch !== null) {
      assertEpoch(input.currentDisconnectEpoch, 'currentDisconnectEpoch');
    }

    if (input.timer.hostMemberId !== input.currentHostId) {
      return { type: 'CANCEL', reason: 'STALE_TIMER', timerId: input.timer.timerId };
    }

    if (input.currentDisconnectEpoch === null) {
      return { type: 'CANCEL', reason: 'HOST_RECONNECTED', timerId: input.timer.timerId };
    }
    if (input.currentDisconnectEpoch !== input.timer.disconnectEpoch) {
      return { type: 'CANCEL', reason: 'STALE_TIMER', timerId: input.timer.timerId };
    }

    const currentHost = input.members.find(
      (member) => member.memberId === input.currentHostId,
    );
    if (currentHost?.connected === true) {
      return { type: 'CANCEL', reason: 'HOST_RECONNECTED', timerId: input.timer.timerId };
    }

    const reevaluateAt = input.timer.disconnectedAt + HOST_TRANSFER_GRACE_MS;
    if (!Number.isSafeInteger(reevaluateAt)) {
      throw new RangeError('host transfer deadline must be a safe integer timestamp');
    }
    if (input.now < reevaluateAt) {
      return { type: 'WAIT', timerId: input.timer.timerId, reevaluateAt };
    }
  }

  const candidate = selectHostTransferCandidate(input.members, input.currentHostId);
  return candidate === null
    ? { type: 'PENDING' }
    : { type: 'TRANSFER', newHostMemberId: candidate };
}

export function decideExplicitHostTransfer(input: {
  readonly phase: ActiveRoomPhase;
  readonly actorMemberId: string;
  readonly currentHostId: string;
  readonly targetMemberId: string;
  readonly members: readonly HostEligibleMember[];
}): ExplicitHostTransferDecision {
  if (input.actorMemberId !== input.currentHostId) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }
  if (input.phase !== 'LOBBY' && input.phase !== 'POST_GAME') {
    return { ok: false, code: 'ACTION_NOT_ALLOWED' };
  }

  const target = input.members.find((member) => member.memberId === input.targetMemberId);
  if (
    target === undefined ||
    target.memberId === input.currentHostId ||
    target.role !== 'player' ||
    !target.connected
  ) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED' };
  }

  return { ok: true, newHostMemberId: target.memberId };
}

function assertHostDisconnectTimer(timer: HostDisconnectTimer): void {
  if (timer.timerId.length === 0 || timer.hostMemberId.length === 0) {
    throw new TypeError('host disconnect timer identifiers must not be empty');
  }
  assertEpoch(timer.disconnectEpoch, 'disconnectEpoch');
  assertTimestamp(timer.disconnectedAt, 'disconnectedAt');
}

function assertEpoch(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer timestamp`);
  }
}
