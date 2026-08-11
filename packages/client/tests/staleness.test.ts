/**
 * 陈旧判定纯函数测试（D7-A §6 已知限制的修复）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRoomStatusStale } from '../src/connection/staleness.ts';

test('权威 IN_GAME 而本地非 IN_GAME → 陈旧（静默丢开局广播场景）', () => {
  assert.equal(isRoomStatusStale('LOBBY', 'IN_GAME'), true);
  assert.equal(isRoomStatusStale('POST_GAME', 'IN_GAME'), true);
  assert.equal(isRoomStatusStale(null, 'IN_GAME'), true);
  assert.equal(isRoomStatusStale(undefined, 'IN_GAME'), true);
});

test('本地与权威一致或权威未开局 → 不陈旧', () => {
  assert.equal(isRoomStatusStale('IN_GAME', 'IN_GAME'), false);
  assert.equal(isRoomStatusStale('LOBBY', 'LOBBY'), false);
  assert.equal(isRoomStatusStale('POST_GAME', 'POST_GAME'), false);
  assert.equal(isRoomStatusStale('IN_GAME', 'POST_GAME'), false, '结算广播丢失由既有看门狗路径覆盖');
});
