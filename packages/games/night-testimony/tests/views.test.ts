import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { nightTestimonyModule } from '../server/module.ts';
import { createNightTestimonyState } from '../server/rules.ts';
import { crimeLabel } from '../server/views.ts';
import type { NightTestimonyState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd'];

function initial() {
  const ctx = deterministicContext();
  return nightTestimonyModule.createInitialState(ctx, players, nightTestimonyModule.parseConfig({ rulesetId: 'night_testimony_v1' }));
}

/** 确定性状态：b 狱警；a/c/d 囚犯 */
function deterministic(): NightTestimonyState {
  return createNightTestimonyState(
    players,
    { rulesetId: 'night_testimony_v1' },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
  );
}

test('囚徒之夜 视图严格解析：build→parse 往返一致', () => {
  const state = initial();
  for (const id of players) {
    const view = nightTestimonyModule.getPlayerView(state, id);
    assert.deepEqual(nightTestimonyModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
  }
  const spectator = nightTestimonyModule.getSpectatorView(state);
  assert.deepEqual(nightTestimonyModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('囚徒之夜 终局前私密信息不进视图：wardenId/crimes 不外泄', () => {
  const state = deterministic();
  // 观战视角不得含狱警/罪行全表
  const spectatorJson = JSON.stringify(nightTestimonyModule.getSpectatorView(state));
  for (const key of ['wardenId', 'crimes', 'isWarden', 'crime']) {
    assert.equal(spectatorJson.includes(key), false, `观战视角不得含 ${key}`);
  }
  // 玩家视图：本人是狱警则 crime=null；囚犯则含本人罪行（不含他人罪行全表）
  const b = nightTestimonyModule.getPlayerView(state, 'b');
  assert.equal(b.me?.isWarden, true);
  assert.equal(b.me?.crime, null);
  const a = nightTestimonyModule.getPlayerView(state, 'a');
  assert.equal(a.me?.isWarden, false);
  assert.equal(a.me?.crime, 'arson', '囚犯应知自己的罪行');
  const aJson = JSON.stringify(a);
  assert.equal(aJson.includes('"theft"'), false, '不得含他人罪行');
});

test('囚徒之夜 罪行标签映射存在且覆盖全部罪行', () => {
  for (const crime of ['arson', 'theft', 'forgery', 'smuggling', 'fraud', 'kidnap'] as const) {
    assert.ok(crimeLabel(crime).length > 0, `${crime} 应有中文标签`);
  }
});

test('囚徒之夜 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = nightTestimonyModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => nightTestimonyModule.parsePlayerView({ ...playerView, wardenId: 'b' }), /字段无效/);
  const spectator = nightTestimonyModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => nightTestimonyModule.parseSpectatorView({ ...spectator, crimes: {} }), /字段无效/);
});

test('囚徒之夜 非参局观察者没有本人视角', () => {
  const view = nightTestimonyModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(nightTestimonyModule.parsePlayerView(view), view);
});
