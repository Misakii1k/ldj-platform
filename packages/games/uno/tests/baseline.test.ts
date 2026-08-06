import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  generateUnoBaseline,
  stableStringify,
  type UnoBaseline,
} from '../../../../scripts/generate-d1-baselines.ts';

const fixtureUrl = new URL('./fixtures/d1/uno-legacy-platform-v1.json', import.meta.url);
const FROZEN_FIXTURE_SHA256 = 'e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6';

test('D1 UNO fixture 字节哈希保持冻结', async () => {
  const raw = await readFile(fixtureUrl);
  assert.equal(createHash('sha256').update(raw).digest('hex'), FROZEN_FIXTURE_SHA256);
});

test('D1 UNO legacy 基线可由当前模块现场完整重生成', async () => {
  const raw = await readFile(fixtureUrl, 'utf8');
  const fixture = JSON.parse(raw) as UnoBaseline;
  const actual = generateUnoBaseline();

  assert.deepEqual(actual, fixture);
  assert.equal(raw, stableStringify(fixture));
  assert.ok(actual.result);
  assert.equal(actual.finalState.phase, 'game_over');
  assert.equal(actual.result.winnerId, actual.finalState.winnerId);
  assert.equal(actual.viewTimeline.length, actual.actions.length + 1);
  assert.ok(actual.randomCursor > 0);
  assertPrivateHandIsolation(actual);
});

function assertPrivateHandIsolation(baseline: UnoBaseline): void {

  for (const entry of baseline.viewTimeline) {
    for (const viewerId of baseline.players) {
      const view = entry.playerViews[viewerId];
      assert.ok(view?.me);
      assert.equal(view.me.playerId, viewerId);

      const serialized = JSON.stringify(view);
      for (const otherId of baseline.players) {
        if (otherId === viewerId) continue;
        const otherHand = entry.playerViews[otherId]?.me?.hand;
        assert.ok(otherHand);
        for (const card of otherHand) {
          assert.equal(serialized.includes(card.id), false, `步骤 ${entry.step} 的 ${viewerId} 视角泄露了 ${otherId} 的 ${card.id}`);
        }
      }
    }

    const spectator = entry.spectatorView as unknown as Record<string, unknown>;
    assert.equal('me' in spectator, false);
    assert.equal('hands' in spectator, false);
    const spectatorJson = JSON.stringify(spectator);
    for (const playerId of baseline.players) {
      for (const card of entry.playerViews[playerId]?.me?.hand ?? []) {
        assert.equal(spectatorJson.includes(card.id), false, `步骤 ${entry.step} 的观战视角泄露了 ${playerId} 的 ${card.id}`);
      }
    }
  }
}
