import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  generateUndercoverBaseline,
  stableStringify,
  type UndercoverBaseline,
} from '../../../../scripts/generate-d1-baselines.ts';

const fixtureUrl = new URL('./fixtures/d1/undercover-classic-v1.json', import.meta.url);
const FROZEN_FIXTURE_SHA256 = '38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68';

test('D1 谁是卧底 fixture 字节哈希保持冻结', async () => {
  const raw = await readFile(fixtureUrl);
  assert.equal(createHash('sha256').update(raw).digest('hex'), FROZEN_FIXTURE_SHA256);
});

test('D1 谁是卧底 classic 基线可由当前模块现场完整重生成', async () => {
  const raw = await readFile(fixtureUrl, 'utf8');
  const fixture = JSON.parse(raw) as UndercoverBaseline;
  const actual = generateUndercoverBaseline();

  assert.deepEqual(actual, fixture);
  assert.equal(raw, stableStringify(fixture));
  assert.ok(actual.result);
  assert.notEqual(actual.result.winner, null);
  assert.equal(actual.result.aborted, false);
  assert.equal(actual.finalState.phase, 'game_over');
  assert.equal(actual.result.winner, actual.finalState.winner);
  assert.equal(actual.viewTimeline.length, actual.actions.length + 1);
  assert.ok(actual.randomCursor > 0);
  assertPrivateInformationIsolation(actual);
});

function assertPrivateInformationIsolation(baseline: UndercoverBaseline): void {
  const { civilianWord, undercoverWord, roles } = baseline.result;

  for (const entry of baseline.viewTimeline) {
    if (entry.spectatorView.phase === 'game_over') continue;

    const spectatorJson = JSON.stringify(entry.spectatorView);
    assert.equal(entry.spectatorView.reveal, null);
    assert.equal(spectatorJson.includes(civilianWord), false, `步骤 ${entry.step} 的观战视角泄露平民词`);
    assert.equal(spectatorJson.includes(undercoverWord), false, `步骤 ${entry.step} 的观战视角泄露卧底词`);

    for (const playerId of baseline.players) {
      const view = entry.playerViews[playerId];
      assert.ok(view?.me);
      const ownWord = roles[playerId] === 'undercover' ? undercoverWord : civilianWord;
      const otherWord = roles[playerId] === 'undercover' ? civilianWord : undercoverWord;
      assert.equal(view.me.word, ownWord);
      assert.equal(JSON.stringify(view).includes(otherWord), false, `步骤 ${entry.step} 的 ${playerId} 视角泄露另一阵营词`);

      for (const player of view.players) {
        if (player.alive) assert.equal(player.revealedRole, null, `步骤 ${entry.step} 泄露存活玩家 ${player.playerId} 阵营`);
      }
    }
  }
}
