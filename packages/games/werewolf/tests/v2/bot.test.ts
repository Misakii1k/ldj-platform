/**
 * werewolf v2 — 机器人共用 parseAction+reduce 权威入口（功能清单 8；AC-07）。
 * pickBotAction 产出经 parseAction 后必被 reducer 接受；
 * buildBotPrompt 的每个候选动作同样可被 reducer 接受；
 * 完整机器人局在有界步数内收束。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { werewolfV2Module } from '../../server/v2/module.ts';
import { byRole, driveBotGame, startedNight } from './helpers.ts';
import type { V2State } from '../../server/v2/types.ts';

const IDS = ['w1', 'w2', 's', 'x', 'v1', 'v2'];

function botActionsFor(state: V2State) {
  const collected: Array<{ playerId: string; action: unknown }> = [];
  for (const id of Object.keys(state.players)) {
    const view = werewolfV2Module.getPlayerView(state, id);
    const action = werewolfV2Module.pickBotAction?.({
      view,
      playerId: id,
      random: createSeededRandom(`v2-bot-check:${id}`),
    });
    if (action !== null && action !== undefined) collected.push({ playerId: id, action });
  }
  return collected;
}

test('v2 机器人动作经 parseAction 后全被 reducer 接受（夜间）', () => {
  const state = startedNight(IDS);
  const actions = botActionsFor(state);
  assert.ok(actions.length >= 3, `至少狼/预言家/守卫机器人可动：${actions.length}`);
  for (const { playerId, action } of actions) {
    const parsed = werewolfV2Module.parseAction(action);
    const reduced = werewolfV2Module.reduce(
      { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
      state,
      { kind: 'player', playerId },
      parsed,
    );
    assert.equal(reduced.ok, true, `${playerId} 的机器人动作被拒`);
  }
});

test('v2 狼人自刀时机器人候选含自己（open-kill 口径一致）', () => {
  const state = startedNight(IDS);
  const wolf = byRole(state, 'wolf')[0]!;
  const view = werewolfV2Module.getPlayerView(state, wolf);
  const action = werewolfV2Module.pickBotAction?.({
    view,
    playerId: wolf,
    random: createSeededRandom('v2-bot-self'),
  });
  assert.deepEqual(action, { type: 'night_kill', targetPlayerId: wolf });
});

test('v2 botPrompt 候选动作全部可被 reducer 接受', () => {
  const state = startedNight(IDS);
  for (const id of Object.keys(state.players)) {
    const view = werewolfV2Module.getPlayerView(state, id);
    const prompt = werewolfV2Module.buildBotPrompt?.({
      view,
      playerId: id,
      random: createSeededRandom(`v2-prompt:${id}`),
    });
    if (!prompt) continue;
    assert.ok(prompt.options.length >= 1, `${id} 的 prompt 无候选`);
    for (const option of prompt.options) {
      const parsed = werewolfV2Module.parseAction(option.action);
      const reduced = werewolfV2Module.reduce(
        { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } },
        state,
        { kind: 'player', playerId: id },
        parsed,
      );
      assert.equal(reduced.ok, true, `${id} 的 prompt 候选被 reducer 拒绝：${JSON.stringify(option.action)}`);
    }
  }
});

test('v2 完整机器人局在有界步数内收束为唯一正式结果', () => {
  const { steps, final } = driveBotGame(IDS, {}, 'v2-bot-bounded');
  assert.equal(final.phase, 'game_over');
  assert.ok(final.winner === 'wolves' || final.winner === 'village');
  assert.ok(steps.length > 0 && steps.length <= 300);
  // 终局只可能由一次动作产生：resultCandidate 非空
  assert.equal(werewolfV2Module.getSpectatorView(final).reveal !== null, true);
  assert.equal(werewolfV2Module.getSpectatorView(final).winner, final.winner);
});
