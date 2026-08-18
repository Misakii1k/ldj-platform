import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_IDENTITY_CARD_STATE,
  reduceIdentityCardState,
  computeIsRevealed,
  type IdentityCardState,
} from '../src/shared-ui/IdentityFlipCard.tsx';

test('初始状态为未按压、未锁定常驻且背面遮蔽', () => {
  assert.equal(INITIAL_IDENTITY_CARD_STATE.isPressing, false);
  assert.equal(INITIAL_IDENTITY_CARD_STATE.isLockedOpen, false);
  assert.equal(computeIsRevealed(INITIAL_IDENTITY_CARD_STATE, false), false);
});

test('允许交互时长按可揭开，松开或取消后自动遮蔽防窥', () => {
  let state = INITIAL_IDENTITY_CARD_STATE;

  // 按下卡牌
  state = reduceIdentityCardState(state, { type: 'pointer_down', canInteract: true, isSpectator: false });
  assert.equal(state.isPressing, true);
  assert.equal(computeIsRevealed(state, false), true);

  // 松开卡牌
  state = reduceIdentityCardState(state, { type: 'pointer_up' });
  assert.equal(state.isPressing, false);
  assert.equal(computeIsRevealed(state, false), false);

  // 移出/取消
  state = reduceIdentityCardState(state, { type: 'pointer_down', canInteract: true, isSpectator: false });
  state = reduceIdentityCardState(state, { type: 'pointer_cancel' });
  assert.equal(state.isPressing, false);
  assert.equal(computeIsRevealed(state, false), false);
});

test('观战者或不可交互状态下禁止长按揭开', () => {
  // 观战者
  let spectatorState = reduceIdentityCardState(INITIAL_IDENTITY_CARD_STATE, {
    type: 'pointer_down',
    canInteract: true,
    isSpectator: true,
  });
  assert.equal(spectatorState.isPressing, false);
  assert.equal(computeIsRevealed(spectatorState, true), false);

  // 不可交互
  let lockedState = reduceIdentityCardState(INITIAL_IDENTITY_CARD_STATE, {
    type: 'pointer_down',
    canInteract: false,
    isSpectator: false,
  });
  assert.equal(lockedState.isPressing, false);
  assert.equal(computeIsRevealed(lockedState, false), false);
});

test('支持锁定常驻查看并在再次点击后解锁', () => {
  let state = INITIAL_IDENTITY_CARD_STATE;

  // 点击锁键锁定常驻
  state = reduceIdentityCardState(state, { type: 'toggle_lock', canInteract: true, isSpectator: false });
  assert.equal(state.isLockedOpen, true);
  assert.equal(computeIsRevealed(state, false), true);

  // 再次点击解锁
  state = reduceIdentityCardState(state, { type: 'toggle_lock', canInteract: true, isSpectator: false });
  assert.equal(state.isLockedOpen, false);
  assert.equal(computeIsRevealed(state, false), false);
});

test('环境防窥：切换后台或失焦时强制扣回并清除锁定状态', () => {
  // 处于常驻锁定态
  const lockedState: IdentityCardState = { isPressing: true, isLockedOpen: true };
  assert.equal(computeIsRevealed(lockedState, false), true);

  // 触发切后台或失焦
  const resetState = reduceIdentityCardState(lockedState, { type: 'emergency_hide' });
  assert.equal(resetState.isPressing, false);
  assert.equal(resetState.isLockedOpen, false);
  assert.equal(computeIsRevealed(resetState, false), false);
});
