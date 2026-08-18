import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'goose_relay_classic_v1' };

function initial(ctx: GameContext = deterministicContext()) {
  return gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(
  ctx: GameContext,
  state: ReturnType<typeof initial>,
  actor: unknown,
  action: unknown,
) {
  const result = gooseRelayModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 全流程推进到讨论阶段：抢头鹅 -> 选卡 -> 动作接力全完成 */
function relayAll(ctx: GameContext, state: ReturnType<typeof initial>) {
  let s = state;
  s = next(ctx, s, sys, { type: 'begin' });
  // a 抢头鹅
  s = next(ctx, s, actor('a'), { type: 'claim_head', playerId: 'a' });
  // a 选卡
  const m = s.candidateCards[0]!;
  const v = s.candidateCards[1]!;
  s = next(ctx, s, actor('a'), { type: 'pick_cards', playerId: 'a', murderer: m, victim: v });
  assert.equal(s.phase, 'relay');
  // 5 人依次完成表演接力
  for (let i = 0; i < s.players.length; i += 1) {
    s = next(ctx, s, actor(s.lineOrder[i]!), {
      type: 'relay_done',
      playerId: s.lineOrder[i]!,
    });
  }
  assert.equal(s.phase, 'discussion');
  return s;
}

test('以鹅传鹅 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(gooseRelayModule);
  versionedContractAssertions.initial(gooseRelayModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(gooseRelayModule, initial(), players);
});

test('以鹅传鹅 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'claim_head' as const, playerId: 'a' };
  versionedContractAssertions.pure(gooseRelayModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(gooseRelayModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(
    gooseRelayModule,
    ctx,
    state,
    actor('b'),
    action,
  );
});

test('以鹅传鹅 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(
    gooseRelayModule.reduce(ctx, state, sys, { type: 'claim_head', playerId: 'a' }).ok,
    false,
    '系统不能代抢头鹅',
  );
  assert.equal(
    gooseRelayModule.reduce(ctx, state, actor('b'), { type: 'end_discussion', playerId: 'b' }).ok,
    false,
    '非头鹅玩家不能结束讨论',
  );
});

test('以鹅传鹅 完整局：抢头鹅 → 选卡 → 表演接力 → 讨论 → 末位指对 → 投票 → 结算出结果', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = relayAll(ctx, state);
  s = next(ctx, s, sys, { type: 'end_discussion' });
  assert.equal(s.phase, 'accusation', '讨论后进入指认');
  assert.equal(s.currentAccuserIndex, 4, '从末位开始指认');

  // 让 e 按真实案情指认
  s = next(ctx, s, actor('e'), {
    type: 'accuse',
    playerId: 'e',
    murderer: s.case.murderer,
    victim: s.case.victim,
  });
  assert.equal(s.phase, 'vote', '指对后进入投票');

  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    s = next(ctx, s, actor(id), {
      type: 'cast_vote',
      playerId: id,
      targetPlayerId: target,
    });
  }
  assert.equal(s.phase, 'game_over', '全员投票后应结算');
  assert.equal(typeof s.caseMatched, 'boolean');
  assert.equal(typeof s.evilIdentified, 'boolean');
  assert.ok(s.winners.length > 0);
});

test('以鹅传鹅 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(gooseRelayModule.manifest.id, 'goose-relay');
  assert.equal(gooseRelayModule.identity.rulesetId, gooseRelayModule.defaultRulesetId);
  assert.deepEqual(gooseRelayModule.registeredRulesets, GOOSE_RELAY_MANIFEST.rulesets);
  assert.equal(gooseRelayModule.manifest.stateSchemaVersion, 2);
});

test('以鹅传鹅 玩家退出（系统动作）→ 系统可投递、玩家不可冒充', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = gooseRelayModule.reduce(ctx, state, sys, {
    type: 'player_forfeited',
    playerIds: ['a', 'b', 'c', 'd'],
  });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  assert.equal(s.phase, 'game_over');
  assert.ok(s.winners.length > 0);

  assert.equal(
    gooseRelayModule.reduce(ctx, state, actor('a'), {
      type: 'player_forfeited',
      playerIds: ['b'],
    }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
