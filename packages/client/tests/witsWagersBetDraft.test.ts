import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialDraft,
  calculateReserved,
  calculateAvailable,
  selectChipTarget,
  setChipExtraStake,
  adjustExtraStake,
  clearChip,
  isDraftDirty,
  isDraftValid,
  estimateProfitIfTargetWins,
} from '../src/game/wits-wagers/betDraft.ts';
import type { BetPairView, BoardTargetView, TargetId } from '../src/game/wits-wagers/types.ts';

test('betDraft: 初始化草稿与预留/可用余额计算', () => {
  const initial = createInitialDraft(null);
  assert.equal(initial[0].chipId, 'A');
  assert.equal(initial[0].targetId, null);
  assert.equal(initial[0].extraStake, 0);
  assert.equal(initial[1].chipId, 'B');

  assert.equal(calculateReserved(initial), 0);
  assert.equal(calculateAvailable(10, initial), 10);

  const accepted: BetPairView = [
    { chipId: 'A', targetId: 'g:100', extraStake: 4 },
    { chipId: 'B', targetId: 'g:200', extraStake: 3 },
  ];
  const fromAccepted = createInitialDraft(accepted);
  assert.equal(calculateReserved(fromAccepted), 7);
  assert.equal(calculateAvailable(10, fromAccepted), 3);
});

test('betDraft: 选择目标、调整与限制附加积分', () => {
  let draft = createInitialDraft(null);

  // A 选 g:100
  draft = selectChipTarget(draft, 'A', 'g:100');
  assert.equal(draft[0].targetId, 'g:100');

  // score=10，给 A 加注 6
  draft = setChipExtraStake(draft, 'A', 6, 10);
  assert.equal(draft[0].extraStake, 6);
  assert.equal(calculateAvailable(10, draft), 4);

  // B 选 g:200 并尝试加注 10，但可用只有 4，应被上限截断为 4
  draft = selectChipTarget(draft, 'B', 'g:200');
  draft = setChipExtraStake(draft, 'B', 10, 10);
  assert.equal(draft[1].extraStake, 4);
  assert.equal(calculateAvailable(10, draft), 0);

  // 调整 A -2
  draft = adjustExtraStake(draft, 'A', -2, 10);
  assert.equal(draft[0].extraStake, 4);
  assert.equal(calculateAvailable(10, draft), 2);

  // 清除 A，extraStake 归零且 targetId 为 null
  draft = clearChip(draft, 'A');
  assert.equal(draft[0].targetId, null);
  assert.equal(draft[0].extraStake, 0);
  assert.equal(calculateAvailable(10, draft), 6);
});

test('betDraft: dirty 状态检测与草稿有效性校验', () => {
  const accepted: BetPairView = [
    { chipId: 'A', targetId: 'g:100', extraStake: 2 },
    { chipId: 'B', targetId: null, extraStake: 0 },
  ];
  let draft = createInitialDraft(accepted);
  assert.equal(isDraftDirty(draft, accepted), false);

  draft = adjustExtraStake(draft, 'A', 1, 10);
  assert.equal(isDraftDirty(draft, accepted), true);

  const validTargets = new Set<TargetId>(['smaller', 'g:100', 'g:200']);
  assert.equal(isDraftValid(draft, 10, validTargets), true);

  // 非法目标
  const invalidDraft: BetPairView = [
    { chipId: 'A', targetId: 'g:999' as TargetId, extraStake: 0 },
    { chipId: 'B', targetId: null, extraStake: 0 },
  ];
  assert.equal(isDraftValid(invalidDraft, 10, validTargets), false);
});

test('betDraft: 预计收益计算（双筹码同槽各自生效）', () => {
  const board: BoardTargetView[] = [
    { id: 'smaller', value: null, slot: 'SMALLER', odds: 6, authors: [], timeoutAuthors: [] },
    { id: 'g:100', value: 100, slot: 'C', odds: 2, authors: ['p1'], timeoutAuthors: [] },
    { id: 'g:200', value: 200, slot: 'R1', odds: 3, authors: ['p2'], timeoutAuthors: [] },
  ];

  // A 押 g:100 加注 2，B 押 g:100 加注 3
  const draft: BetPairView = [
    { chipId: 'A', targetId: 'g:100', extraStake: 2 },
    { chipId: 'B', targetId: 'g:100', extraStake: 3 },
  ];

  // 若 g:100 胜出：
  // profit = (1+2)*2 + (1+3)*2 = 6 + 8 = 14
  // loss = 0
  const est100 = estimateProfitIfTargetWins(draft, board, 'g:100');
  assert.equal(est100.profit, 14);
  assert.equal(est100.loss, 0);

  // 若 g:200 胜出：
  // profit = 0
  // loss = 2 + 3 = 5
  const est200 = estimateProfitIfTargetWins(draft, board, 'g:200');
  assert.equal(est200.profit, 0);
  assert.equal(est200.loss, 5);
});
