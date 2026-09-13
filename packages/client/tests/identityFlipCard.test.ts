import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IDENTITY_REVEAL_MODE,
  INITIAL_IDENTITY_CARD_STATE,
  reduceIdentityCardState,
  computeIsRevealed,
  reduceFlipRevealed,
  type IdentityCardState,
} from '../src/shared-ui/IdentityFlipCard.tsx';

test('初始状态为未按压且背面遮蔽', () => {
  assert.equal(INITIAL_IDENTITY_CARD_STATE.isPressing, false);
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
  const spectatorState = reduceIdentityCardState(INITIAL_IDENTITY_CARD_STATE, {
    type: 'pointer_down',
    canInteract: true,
    isSpectator: true,
  });
  assert.equal(spectatorState.isPressing, false);
  assert.equal(computeIsRevealed(spectatorState, true), false);

  // 不可交互
  const lockedState = reduceIdentityCardState(INITIAL_IDENTITY_CARD_STATE, {
    type: 'pointer_down',
    canInteract: false,
    isSpectator: false,
  });
  assert.equal(lockedState.isPressing, false);
  assert.equal(computeIsRevealed(lockedState, false), false);
});

test('环境防窥：切换后台或失焦时强制扣回', () => {
  const openState: IdentityCardState = { isPressing: true };
  assert.equal(computeIsRevealed(openState, false), true);

  const resetState = reduceIdentityCardState(openState, { type: 'emergency_hide' });
  assert.equal(resetState.isPressing, false);
  assert.equal(computeIsRevealed(resetState, false), false);
});

test('默认揭示方式仍为按住查看', () => {
  assert.equal(DEFAULT_IDENTITY_REVEAL_MODE, 'press');
});

test('flip 模式：点按翻转揭示，再点翻回', () => {
  assert.equal(reduceFlipRevealed(false, 'toggle', true), true);
  assert.equal(reduceFlipRevealed(true, 'toggle', true), false);
});

test('flip 模式：不可交互时保持原状，环境防窥强制翻回', () => {
  assert.equal(reduceFlipRevealed(false, 'toggle', false), false);
  assert.equal(reduceFlipRevealed(true, 'toggle', false), true);
  assert.equal(reduceFlipRevealed(true, 'hide', true), false);
  assert.equal(reduceFlipRevealed(false, 'hide', true), false);
});
