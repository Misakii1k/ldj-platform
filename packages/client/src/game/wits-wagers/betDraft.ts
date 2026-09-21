import type { ChipId, TargetId, BetPairView, BoardTargetView } from './types.ts';

export function createInitialDraft(accepted?: BetPairView | null): BetPairView {
  if (accepted && accepted.length === 2) {
    return [
      { chipId: 'A', targetId: accepted[0].targetId, extraStake: accepted[0].extraStake },
      { chipId: 'B', targetId: accepted[1].targetId, extraStake: accepted[1].extraStake },
    ];
  }
  return [
    { chipId: 'A', targetId: null, extraStake: 0 },
    { chipId: 'B', targetId: null, extraStake: 0 },
  ];
}

export function calculateReserved(draft: BetPairView): number {
  const extraA = draft[0].targetId !== null ? draft[0].extraStake : 0;
  const extraB = draft[1].targetId !== null ? draft[1].extraStake : 0;
  return extraA + extraB;
}

export function calculateAvailable(score: number, draft: BetPairView): number {
  return Math.max(0, score - calculateReserved(draft));
}

export function selectChipTarget(
  draft: BetPairView,
  chipId: ChipId,
  targetId: TargetId | null,
): BetPairView {
  const [a, b] = draft;
  if (chipId === 'A') {
    return [
      { ...a, targetId, extraStake: targetId === null ? 0 : a.extraStake },
      { ...b },
    ];
  }
  return [
    { ...a },
    { ...b, targetId, extraStake: targetId === null ? 0 : b.extraStake },
  ];
}

export function setChipExtraStake(
  draft: BetPairView,
  chipId: ChipId,
  rawAmount: number,
  score: number,
): BetPairView {
  const [a, b] = draft;
  const targetChip = chipId === 'A' ? a : b;
  const otherChip = chipId === 'A' ? b : a;

  if (targetChip.targetId === null) {
    return draft; // 未选择目标不可加注
  }

  const otherExtra = otherChip.targetId !== null ? otherChip.extraStake : 0;
  const maxAvailableForThisChip = Math.max(0, score - otherExtra);

  const cleanAmount = Math.max(0, Math.min(Math.floor(rawAmount), maxAvailableForThisChip));

  if (chipId === 'A') {
    return [{ ...a, extraStake: cleanAmount }, { ...b }];
  }
  return [{ ...a }, { ...b, extraStake: cleanAmount }];
}

export function adjustExtraStake(
  draft: BetPairView,
  chipId: ChipId,
  delta: number,
  score: number,
): BetPairView {
  const [a, b] = draft;
  const current = chipId === 'A' ? a.extraStake : b.extraStake;
  return setChipExtraStake(draft, chipId, current + delta, score);
}

export function clearChip(draft: BetPairView, chipId: ChipId): BetPairView {
  const [a, b] = draft;
  if (chipId === 'A') {
    return [{ chipId: 'A', targetId: null, extraStake: 0 }, { ...b }];
  }
  return [{ ...a }, { chipId: 'B', targetId: null, extraStake: 0 }];
}

export function isDraftDirty(draft: BetPairView, accepted: BetPairView): boolean {
  return (
    draft[0].targetId !== accepted[0].targetId ||
    draft[0].extraStake !== accepted[0].extraStake ||
    draft[1].targetId !== accepted[1].targetId ||
    draft[1].extraStake !== accepted[1].extraStake
  );
}

export function isDraftValid(
  draft: BetPairView,
  score: number,
  validTargetIds: Set<TargetId>,
): boolean {
  const [a, b] = draft;
  if (a.chipId !== 'A' || b.chipId !== 'B') return false;

  if (a.targetId !== null && !validTargetIds.has(a.targetId)) return false;
  if (b.targetId !== null && !validTargetIds.has(b.targetId)) return false;

  if (a.targetId === null && a.extraStake !== 0) return false;
  if (b.targetId === null && b.extraStake !== 0) return false;

  if (!Number.isSafeInteger(a.extraStake) || a.extraStake < 0) return false;
  if (!Number.isSafeInteger(b.extraStake) || b.extraStake < 0) return false;

  return calculateReserved(draft) <= score;
}

/**
 * 预计收益提示（仅供前端计算展示，明确标注“预计”，权威结果以服务端账本为准）。
 */
export function estimateProfitIfTargetWins(
  draft: BetPairView,
  board: readonly BoardTargetView[],
  targetId: TargetId,
): { profit: number; loss: number } {
  const target = board.find((t) => t.id === targetId);
  const odds = target ? target.odds : 6;

  let profit = 0;
  let loss = 0;

  for (const chip of draft) {
    if (chip.targetId === null) continue;
    if (chip.targetId === targetId) {
      profit += (1 + chip.extraStake) * odds;
    } else {
      loss += chip.extraStake;
    }
  }

  return { profit, loss };
}
