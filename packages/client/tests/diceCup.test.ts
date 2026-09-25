import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_DICE_CUP_STATE,
  reduceDiceCupState,
  normalizeDiceValues,
} from '../src/shared-ui/DiceCup.tsx';

test('点数归一化与有效范围校验（1~6）', () => {
  // 单数字
  assert.deepEqual(normalizeDiceValues(4), [4]);
  assert.deepEqual(normalizeDiceValues(0), []);
  assert.deepEqual(normalizeDiceValues(7), []);

  // 数组与非法值过滤
  assert.deepEqual(normalizeDiceValues([1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(normalizeDiceValues([1, 0, 7, 3, -1, 6]), [1, 3, 6]);

  // null / undefined
  assert.deepEqual(normalizeDiceValues(null), []);
  assert.deepEqual(normalizeDiceValues(undefined), []);
});

test('允许交互时长按掀开，松手或失焦自动扣盖防窥', () => {
  let state = INITIAL_DICE_CUP_STATE;
  assert.equal(state.isLifted, false);

  // 按住掀开
  state = reduceDiceCupState(state, { type: 'lift_down', canInteract: true });
  assert.equal(state.isLifted, true);

  // 松手扣盖
  state = reduceDiceCupState(state, { type: 'lift_up' });
  assert.equal(state.isLifted, false);

  // 按住并在失焦时强制复位
  state = reduceDiceCupState(state, { type: 'lift_down', canInteract: true });
  state = reduceDiceCupState(state, { type: 'emergency_hide' });
  assert.equal(state.isLifted, false);
});

test('不可交互状态禁止掀开骰盅', () => {
  const state = reduceDiceCupState(INITIAL_DICE_CUP_STATE, { type: 'lift_down', canInteract: false });
  assert.equal(state.isLifted, false);
});

test('支持单击切换掀开定格与再次单击扣回（双模兼容）', () => {
  let state = INITIAL_DICE_CUP_STATE;
  assert.equal(state.isLifted, false);

  // 单击掀开
  state = reduceDiceCupState(state, { type: 'lift_toggle', canInteract: true });
  assert.equal(state.isLifted, true);

  // 再次单击扣回
  state = reduceDiceCupState(state, { type: 'lift_toggle', canInteract: true });
  assert.equal(state.isLifted, false);

  // 不可交互时无法单击切换
  state = reduceDiceCupState(state, { type: 'lift_toggle', canInteract: false });
  assert.equal(state.isLifted, false);
});

test('摇骰动效状态机触发与完成', () => {
  let state = INITIAL_DICE_CUP_STATE;

  // 开始摇骰
  state = reduceDiceCupState(state, { type: 'shake_start', canInteract: true, allowShake: true });
  assert.equal(state.isShaking, true);

  // 摇骰完成
  state = reduceDiceCupState(state, { type: 'shake_end' });
  assert.equal(state.isShaking, false);
});
