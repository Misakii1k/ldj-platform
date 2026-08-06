/**
 * D4-UI0：按 (action, object) 作用域的纯 action 状态 reducer 测试。
 * 覆盖 begin/fail/settle 的不可变性、键隔离、busy 检测、
 * 错误持续到下次 begin，以及 actionKeyString 的唯一性。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionKeyString,
  beginAction,
  failAction,
  settleAction,
  isBusy,
  type ActionKey,
  type ActionStateMap,
} from '../src/game/actionState.ts';

const playCard: ActionKey = { action: 'play_card', object: 'card-1' };
const playCardCopy: ActionKey = { action: 'play_card', object: 'card-1' };
const drawCard: ActionKey = { action: 'draw_card', object: 'hand' };
const drawOnTable: ActionKey = { action: 'draw_card', object: 'table' };

function fresh(): ActionStateMap {
  return {};
}

test('actionKeyString 对相同键稳定、对不同键唯一', () => {
  assert.equal(actionKeyString(playCard), actionKeyString(playCardCopy));
  assert.equal(actionKeyString(drawCard), actionKeyString({ action: 'draw_card', object: 'hand' }));
  assert.notEqual(actionKeyString(playCard), actionKeyString(drawCard));
  // 同一 action 不同 object 必须不同
  assert.notEqual(actionKeyString(drawCard), actionKeyString(drawOnTable));
  // 分隔符注入不能产生碰撞
  assert.notEqual(
    actionKeyString({ action: 'a\u0000b', object: 'c' }),
    actionKeyString({ action: 'a', object: 'b\u0000c' }),
  );
});

test('beginAction 把指定键置为 submitting 且不可变', () => {
  const s0 = fresh();
  const s1 = beginAction(s0, playCard, 'req-1');
  assert.notEqual(s1, s0, '必须返回新对象');
  assert.equal(s0[actionKeyString(playCard)], undefined, '原状态不被修改');
  assert.deepEqual(s1[actionKeyString(playCard)], { status: 'submitting', requestId: 'req-1' });
  assert.equal(isBusy(s1, playCard), true);
});

test('settleAction 把该键置为 idle 且不影响其他键', () => {
  const s1 = beginAction(fresh(), playCard, 'req-1');
  const s2 = beginAction(s1, drawCard, 'req-2');
  const s3 = settleAction(s2, playCard);
  assert.notEqual(s3, s2);
  assert.equal(s3[actionKeyString(drawCard)], s2[actionKeyString(drawCard)], '其他键引用不变');
  assert.deepEqual(s3[actionKeyString(playCard)], { status: 'idle' });
  assert.equal(isBusy(s3, playCard), false);
  assert.equal(isBusy(s3, drawCard), true);
});

test('failAction 把该键置为 error 且只影响该键', () => {
  const s1 = beginAction(fresh(), playCard, 'req-1');
  const s2 = beginAction(s1, drawCard, 'req-2');
  const s3 = failAction(s2, drawCard, '当前阶段不支持此操作');
  assert.notEqual(s3, s2);
  assert.equal(s3[actionKeyString(playCard)], s2[actionKeyString(playCard)], 'play_card 保持 submitting');
  assert.deepEqual(s3[actionKeyString(drawCard)], {
    status: 'error',
    errorMessage: '当前阶段不支持此操作',
  });
  assert.equal(isBusy(s3, drawCard), false);
  assert.equal(isBusy(s3, playCard), true);
});

test('错误持续保留直到下一次 begin', () => {
  let s = beginAction(fresh(), drawCard, 'req-1');
  s = failAction(s, drawCard, '请求超时');
  assert.equal(isBusy(s, drawCard), false);
  // settle 只清 busy，不清错误
  s = settleAction(s, drawCard);
  assert.deepEqual(s[actionKeyString(drawCard)], { status: 'idle' });
  // 再次失败仍保留错误
  s = failAction(s, drawCard, '请求超时');
  assert.deepEqual(s[actionKeyString(drawCard)], { status: 'error', errorMessage: '请求超时' });
  // 下次 begin 才替换掉错误
  s = beginAction(s, drawCard, 'req-2');
  assert.deepEqual(s[actionKeyString(drawCard)], { status: 'submitting', requestId: 'req-2' });
});

test('未知键与空状态安全处理：不崩溃，视为空闲', () => {
  assert.equal(isBusy(fresh(), playCard), false);
  assert.equal(isBusy(beginAction(fresh(), drawCard, 'req-1'), playCard), false);
  // 对从未 begin 的键 settle/fail 不崩溃
  const s1 = beginAction(fresh(), drawCard, 'req-1');
  const s2 = settleAction(s1, playCard);
  assert.deepEqual(s2[actionKeyString(playCard)], { status: 'idle' });
  const s3 = failAction(s1, playCard, '未知键也允许记录错误');
  assert.deepEqual(s3[actionKeyString(playCard)], { status: 'error', errorMessage: '未知键也允许记录错误' });
  assert.deepEqual(s3[actionKeyString(drawCard)], s1[actionKeyString(drawCard)]);
});

test('不同键互不覆盖，同一键重新 begin 替换旧记录', () => {
  let s = beginAction(fresh(), playCard, 'req-1');
  s = beginAction(s, drawCard, 'req-2');
  assert.equal(Object.keys(s).length, 2);
  s = beginAction(s, playCard, 'req-3');
  assert.equal(Object.keys(s).length, 2, '重 begin 同一键不应新增条目');
  assert.deepEqual(s[actionKeyString(playCard)], { status: 'submitting', requestId: 'req-3' });
  assert.deepEqual(s[actionKeyString(drawCard)], { status: 'submitting', requestId: 'req-2' });
});
