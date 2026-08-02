export interface BuzzerClaim<TSnapshotRef> {
  readonly playerId: string;
  readonly roomSeq: number;
  readonly snapshotRef: TSnapshotRef;
}

export type BuzzerWindow<TSnapshotRef> =
  | {
      readonly windowId: string;
      readonly status: 'open';
      readonly winner: null;
    }
  | {
      readonly windowId: string;
      readonly status: 'locked';
      readonly winner: BuzzerClaim<TSnapshotRef>;
    }
  | {
      readonly windowId: string;
      readonly status: 'closed';
      readonly winner: BuzzerClaim<TSnapshotRef> | null;
    };

export interface BuzzerClaimAttempt<TSnapshotRef> extends BuzzerClaim<TSnapshotRef> {
  readonly legal: boolean;
}

export type BuzzerClaimResult<TSnapshotRef> =
  | {
      readonly ok: true;
      readonly state: BuzzerWindow<TSnapshotRef>;
    }
  | {
      readonly ok: false;
      readonly code: 'ILLEGAL_CLAIM' | 'WINDOW_LOCKED' | 'WINDOW_CLOSED';
      readonly state: BuzzerWindow<TSnapshotRef>;
    };

export function openBuzzerWindow<TSnapshotRef>(windowId: string): BuzzerWindow<TSnapshotRef> {
  if (windowId.length === 0) throw new Error('抢铃窗口 ID 不能为空');
  return { windowId, status: 'open', winner: null };
}

export function claimBuzzer<TSnapshotRef>(
  state: BuzzerWindow<TSnapshotRef>,
  attempt: BuzzerClaimAttempt<TSnapshotRef>,
): BuzzerClaimResult<TSnapshotRef> {
  if (state.status === 'locked') return { ok: false, code: 'WINDOW_LOCKED', state };
  if (state.status === 'closed') return { ok: false, code: 'WINDOW_CLOSED', state };
  if (!attempt.legal) return { ok: false, code: 'ILLEGAL_CLAIM', state };
  return {
    ok: true,
    state: {
      windowId: state.windowId,
      status: 'locked',
      winner: {
        playerId: attempt.playerId,
        roomSeq: attempt.roomSeq,
        snapshotRef: attempt.snapshotRef,
      },
    },
  };
}

export function closeBuzzerWindow<TSnapshotRef>(
  state: BuzzerWindow<TSnapshotRef>,
): BuzzerWindow<TSnapshotRef> {
  if (state.status === 'closed') return state;
  return {
    windowId: state.windowId,
    status: 'closed',
    winner: state.winner,
  };
}
