/**
 * D4-V 服务器级纯模块验证：werewolf_platform_open_kill_v1 完整局。
 * 纯模块直连（v2 未注册平台 registry，按批次裁决不做注册，见 D4-V 报告），
 * 验证完整局闭环、确定性重放、不可变性、视角泄漏、机器人合法性。
 * 禁止修改任何现有 server/platform 文件——本文件为唯一新建 server 测试。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { versionedContractAssertions } from '../../shared/tests/helpers/versionedGameContract.ts';
import { werewolfV2Module } from '../../games/werewolf/server/v2/module.ts';
import { driveBotGame } from '../../games/werewolf/tests/v2/helpers.ts';
import type { V2State } from '../../games/werewolf/server/v2/types.ts';

const FULL = {
  preset: 'classic',
  pace: 'standard',
  witchSelfSave: 'first_night',
  winCondition: 'roles',
  roles: { guard: true, hunter: true, idiot: true },
};
const FULL_PLAYERS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

test('d4-v 完整局：9 人全角色机器人局在界内收束为唯一正式结果', () => {
  const { steps, final } = driveBotGame(FULL_PLAYERS, FULL, 'v2-server-full-9p', 400);
  assert.equal(final.phase, 'game_over');
  assert.ok(final.winner === 'wolves' || final.winner === 'village');
  assert.ok(final.aborted === false);
  assert.ok(steps.length <= 400);
  // 视角：终局 reveal 非空；赢家一致
  const spectator = werewolfV2Module.getSpectatorView(final);
  assert.notEqual(spectator.reveal, null);
  assert.equal(spectator.winner, final.winner);
});

test('d4-v 确定性重放：同种子同轨迹两次重放字节一致，末态过 schema/不变量', () => {
  const { steps } = driveBotGame(FULL_PLAYERS, FULL, 'v2-server-replay-9p', 400);
  const run = () => {
    const ctx = { now: 1_700_000_000_000, random: createSeededRandom('v2-server-replay-9p') };
    let state = werewolfV2Module.createInitialState(ctx, [...FULL_PLAYERS], werewolfV2Module.parseConfig(FULL));
    const states: V2State[] = [structuredClone(state)];
    for (const step of steps) {
      ctx.now += 1_000;
      const reduced = werewolfV2Module.reduce(ctx, structuredClone(state), step.actor, step.action);
      if (!reduced.ok) throw new Error(`重放动作被拒：${JSON.stringify(step.action)}`);
      state = reduced.nextState;
      states.push(structuredClone(state));
    }
    return states;
  };
  const first = run();
  const second = run();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const finalState = first[first.length - 1]!;
  werewolfV2Module.parseState(finalState);
  werewolfV2Module.assertInvariants(finalState);
});

test('d4-v 不可变性：reduce 不修改传入状态', () => {
  const { steps, final } = driveBotGame(FULL_PLAYERS, FULL, 'v2-server-immutable', 400);
  const random = createSeededRandom('v2-server-immutable');
  const ctx = { now: 1_700_000_000_000, random };
  let state = werewolfV2Module.createInitialState(ctx, [...FULL_PLAYERS], werewolfV2Module.parseConfig(FULL));
  const mid = Math.floor(steps.length / 2);
  for (let i = 0; i < mid; i += 1) {
    const reduced = werewolfV2Module.reduce(ctx, state, steps[i]!.actor, steps[i]!.action);
    if (reduced.ok) state = reduced.nextState;
  }
  const before = structuredClone(state);
  werewolfV2Module.reduce(ctx, state, steps[mid]!.actor, steps[mid]!.action);
  assert.deepEqual(state, before);
  assert.equal(final.phase, 'game_over');
});

test('d4-v 契约套件与视角泄漏门对 v2 打开', () => {
  versionedContractAssertions.identity(werewolfV2Module);
  const ctx = { now: 1_700_000_000_000, random: createSeededRandom('v2-server-contract') };
  versionedContractAssertions.initial(werewolfV2Module, ctx, FULL_PLAYERS, FULL);
  const state = werewolfV2Module.createInitialState(ctx, [...FULL_PLAYERS], werewolfV2Module.parseConfig(FULL));
  versionedContractAssertions.viewSchemas(werewolfV2Module, state, FULL_PLAYERS);
  versionedContractAssertions.botLegalCandidates(werewolfV2Module, ctx, state, FULL_PLAYERS, 'v2-server-bot');
  const isWolf = (id: string) => (state as V2State).players[id]?.role === 'wolf';
  versionedContractAssertions.noSecretLeak(
    werewolfV2Module,
    state,
    FULL_PLAYERS,
    (snap, playerId) => {
      const s = snap as V2State;
      const p = s.players[playerId];
      return p ? [p.role] : [];
    },
    {
      allowedLeakPairs: (owner, other) => isWolf(owner) && isWolf(other),
      isRevealed: (snap) => (snap as V2State).phase === 'game_over',
    },
  );
});

test('d4-v 超时驱动仍确定性推进（纯系统动作轨迹）', () => {
  // 全员不操作：纯超时轨迹应确定性推进到第一夜
  const ctx = { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } };
  let state = werewolfV2Module.createInitialState(ctx, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], werewolfV2Module.parseConfig({}));
  const first = werewolfV2Module.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(first.ok);
  if (!first.ok) return;
  state = first.nextState;
  const token = (state as V2State).phaseToken!;
  const timed = werewolfV2Module.reduce(
    ctx,
    state,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', phase: 'role_reveal', day: 0, token },
  );
  assert.ok(timed.ok);
  if (timed.ok) assert.equal((timed.nextState as V2State).phase, 'night');
});
