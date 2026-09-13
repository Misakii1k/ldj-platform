import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { cheeseThiefModule } from '../server/module.ts';
import { CHEESE_THIEF_MANIFEST } from '../shared/manifest.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'cheese_thief_classic_v1' };

function initial(ctx: GameContext = deterministicContext()) {
  return cheeseThiefModule.createInitialState(ctx, players, cheeseThiefModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(ctx: GameContext, state: ReturnType<typeof initial>, actor: unknown, action: unknown) {
  const result = cheeseThiefModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 推进到天亮（含共犯选择兜底） */
function toDawn(ctx: GameContext, state: ReturnType<typeof initial>) {
  let s = state;
  s = next(ctx, s, sys, { type: 'begin' });
  for (let hour = 1; hour <= 6; hour += 1) {
    s = next(ctx, s, sys, { type: 'advance_night', hour });
  }
  if (s.phase === 'night') {
    s = next(ctx, s, sys, { type: 'end_night' });
  }
  if (s.phase === 'accomplice_select') {
    s = next(ctx, s, sys, { type: 'auto_select_accomplice' });
  }
  assert.equal(s.phase, 'dawn');
  return s;
}

test('奶酪大盗 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(cheeseThiefModule);
  versionedContractAssertions.initial(cheeseThiefModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(cheeseThiefModule, initial(), players);
});

test('奶酪大盗 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'cast_abstention' as const, playerId: 'a' };
  versionedContractAssertions.pure(cheeseThiefModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(cheeseThiefModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(cheeseThiefModule, ctx, state, actor('b'), action);
});

test('奶酪大盗 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const playerVote = { type: 'cast_abstention' as const, playerId: 'a' };
  assert.equal(
    cheeseThiefModule.reduce(ctx, state, sys, playerVote).ok,
    false,
    '系统不能代投玩家票',
  );
  const systemAdvance = { type: 'advance_night' as const, hour: 1 };
  assert.equal(
    cheeseThiefModule.reduce(ctx, state, actor('a'), systemAdvance).ok,
    false,
    '玩家不能推进夜间时刻',
  );
  const systemAuto = { type: 'auto_select_accomplice' as const };
  assert.equal(
    cheeseThiefModule.reduce(ctx, state, actor('a'), systemAuto).ok,
    false,
    '玩家不能触发系统兜底',
  );
});

test('奶酪大盗 夜间推进到天亮并进入投票、结算', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  // begin：排定第 1 时刻计时器
  const began = cheeseThiefModule.reduce(ctx, state, sys, { type: 'begin' });
  assert.equal(began.ok, true);
  if (!began.ok) return;
  assert.ok(began.effects.some((e) => e.type === 'schedule_timer' && e.timerId === 'night-1'));

  let s = began.nextState;
  for (let hour = 1; hour <= 6; hour += 1) {
    s = next(ctx, s, sys, { type: 'advance_night', hour });
  }
  if (s.phase === 'night') {
    s = next(ctx, s, sys, { type: 'end_night' });
  }
  if (s.phase === 'accomplice_select') {
    s = next(ctx, s, sys, { type: 'auto_select_accomplice' });
  }
  assert.equal(s.phase, 'dawn', '第 6 时刻后应天亮');

  const discussed = cheeseThiefModule.reduce(ctx, s, sys, { type: 'end_discussion' });
  assert.equal(discussed.ok, true);
  if (!discussed.ok) return;
  assert.equal(discussed.nextState.phase, 'vote');

  let voting = discussed.nextState;
  for (const id of players) {
    const voted = cheeseThiefModule.reduce(ctx, voting, actor(id), {
      type: 'cast_abstention',
      playerId: id,
    });
    assert.equal(voted.ok, true);
    if (!voted.ok) return;
    voting = voted.nextState;
  }
  assert.equal(voting.phase, 'game_over', '全员投票后应结算');
  assert.ok(voting.winners.length > 0);
});

test('奶酪大盗 终局前不泄漏醒来时刻与盗贼，终局披露完整真相', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);

  // 终局前的玩家/观战视图不得含醒来时刻表与盗贼字段（本人 wakeHour 除外）
  for (const id of players) {
    const view = cheeseThiefModule.getPlayerView(state, id);
    assert.equal(view.me?.wakeHour, state.wakeHours[id], '本人应知道自己的醒来时刻');
    assert.equal(JSON.stringify(view).includes('wakeHours'), false, '不得含醒来时刻全表');
    assert.equal(JSON.stringify(view).includes('thiefId'), false);
  }
  const spectatorPre = JSON.stringify(cheeseThiefModule.getSpectatorView(state));
  for (const key of ['wakeHours', 'thiefId', 'stealHour', 'accomplices']) {
    assert.equal(spectatorPre.includes(key), false, `观战视角不得含 ${key}`);
  }

  // 推进到终局（全弃票）
  state = toDawn(ctx, state);
  state = next(ctx, state, sys, { type: 'end_discussion' });
  for (const id of players) {
    state = next(ctx, state, actor(id), { type: 'cast_abstention', playerId: id });
  }
  assert.equal(state.phase, 'game_over');
  const spectator = cheeseThiefModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.ok(spectator.reveal, '终局应披露真相');
  assert.deepEqual(
    (spectator.reveal as { wakeHours: Record<string, number> }).wakeHours,
    state.wakeHours,
  );
});

test('奶酪大盗 终局返回正式结果候选', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = toDawn(ctx, state);
  s = next(ctx, s, sys, { type: 'end_discussion' });
  // 全员弃票 → 结算
  for (const id of players) {
    const r = cheeseThiefModule.reduce(ctx, s, actor(id), { type: 'cast_abstention', playerId: id });
    if (!r.ok) return;
    s = r.nextState;
  }
  assert.equal(s.phase, 'game_over');
  const candidate = s.thiefCaught !== null ? s : null;
  assert.ok(candidate, '终局应产出结果候选');
  assert.ok(candidate.winners.length > 0);
});

test('奶酪大盗 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(cheeseThiefModule.manifest.id, 'cheese-thief');
  assert.equal(cheeseThiefModule.identity.rulesetId, cheeseThiefModule.defaultRulesetId);
  assert.deepEqual(cheeseThiefModule.registeredRulesets, CHEESE_THIEF_MANIFEST.rulesets);
  assert.equal(cheeseThiefModule.manifest.stateSchemaVersion, 1);
});

test('奶酪大盗 玩家退出（系统动作）→ 系统可投递、玩家不可冒充', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = cheeseThiefModule.reduce(ctx, state, sys, { type: 'player_forfeited', playerIds: ['a', 'b', 'c'] });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  if (s.players.length < 2 || s.thiefId === null || !s.players.includes(s.thiefId)) {
    assert.equal(s.phase, 'game_over');
    assert.ok(s.winners.length > 0);
  }
  assert.equal(
    cheeseThiefModule.reduce(ctx, state, actor('a'), { type: 'player_forfeited', playerIds: ['b'] }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
