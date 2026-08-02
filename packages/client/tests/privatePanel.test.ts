import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePrivatePanelState } from '../src/game/tabletop/privateState.ts';

test('私密面板初始遮罩且只有同步玩家可主动揭示', () => {
  assert.equal(reducePrivatePanelState(false, { type: 'reveal', allowed: true, synced: true }), true);
  assert.equal(reducePrivatePanelState(false, { type: 'reveal', allowed: false, synced: true }), false);
  assert.equal(reducePrivatePanelState(false, { type: 'reveal', allowed: true, synced: false }), false);
});

test('后台、失焦和断线立即遮罩且恢复后不自动揭示', () => {
  for (const type of ['hide', 'blur', 'disconnect'] as const) {
    assert.equal(reducePrivatePanelState(true, { type }), false);
  }
  assert.equal(reducePrivatePanelState(false, { type: 'sync' }), false);
});
