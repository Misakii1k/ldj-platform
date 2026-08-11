import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';
import { createGooseRelayState, reduceGooseRelayState } from '../server/rules.ts';
import type { CaseCard, GooseRelayState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const NOW = 1_700_000_000_000;
const CARD_A: CaseCard = { murderer: 'grey_goose', victim: 'white_goose', tool: 'knife', scene: 'barn' };

function initial() {
  const ctx = deterministicContext();
  return gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig({ rulesetId: 'goose_relay_classic_v1' }));
}

/** 确定性状态：头鹅 a，恶鹅 c */
function deterministic(): GooseRelayState {
  return createGooseRelayState(players, { rulesetId: 'goose_relay_classic_v1' }, CARD_A, ['c']);
}

/** 推进到 relay 阶段（头鹅已传） */
function toRelayAfterHead(state: GooseRelayState): GooseRelayState {
  const r = reduceGooseRelayState(state, { type: 'transmit', playerId: 'a', case: CARD_A }, { now: NOW });
  if (!r.ok) throw new Error(r.message);
  return r.nextState;
}

/** 推进到讨论阶段（全员已传） */
function toDiscussion(state: GooseRelayState): GooseRelayState {
  let s = state;
  for (let i = 0; i < players.length; i += 1) {
    const r = reduceGooseRelayState(s, { type: 'transmit', playerId: players[i]!, case: CARD_A }, { now: NOW });
    if (!r.ok) throw new Error(r.message);
    s = r.nextState;
  }
  return s;
}

test('以鹅传鹅 视图严格解析：build→parse 往返一致', () => {
  const state = initial();
  for (const id of players) {
    const view = gooseRelayModule.getPlayerView(state, id);
    assert.deepEqual(gooseRelayModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
  }
  const spectator = gooseRelayModule.getSpectatorView(state);
  assert.deepEqual(gooseRelayModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('以鹅传鹅 传递期隐私：仅头鹅见原始案情、当前传递者见上一位演绎，其余无内容', () => {
  const state = deterministic();
  // case_view：只有头鹅 a 见原始案情
  const a = gooseRelayModule.getPlayerView(state, 'a');
  assert.equal(a.me?.role, 'head');
  assert.deepEqual(a.me?.observed, CARD_A);
  for (const id of ['b', 'c', 'd', 'e']) {
    const view = gooseRelayModule.getPlayerView(state, id);
    assert.equal(view.me?.observed, null, `${id} 在读卡阶段不应看到案情`);
    assert.equal(JSON.stringify(view).includes(CARD_A.murderer), false, `${id} 视图不得含案情内容`);
  }
  const spectator = JSON.stringify(gooseRelayModule.getSpectatorView(state));
  assert.equal(spectator.includes('murderer'), false, '观战视角不得含案情字段');

  // relay 阶段：b（下标 1）可见头鹅演绎；c/d/e 不可见
  const relay = toRelayAfterHead(state);
  const b = gooseRelayModule.getPlayerView(relay, 'b');
  assert.equal(b.me?.role, 'white');
  assert.deepEqual(b.me?.observed, CARD_A, 'b 应看到头鹅演绎');
  for (const id of ['c', 'd', 'e']) {
    assert.equal(gooseRelayModule.getPlayerView(relay, id).me?.observed, null, `${id} 未轮到时不应看到演绎`);
  }
  // 观战视角在传递期不得含演绎链内容（transmissions 为 null）
  assert.equal(gooseRelayModule.getSpectatorView(relay).transmissions, null);
});

test('以鹅传鹅 恶鹅身份仅本人可见，观战与白鹅不可见', () => {
  const state = deterministic();
  const c = gooseRelayModule.getPlayerView(state, 'c');
  assert.equal(c.me?.role, 'evil', '恶鹅本人应知身份');
  for (const id of ['a', 'b', 'd', 'e']) {
    assert.equal(gooseRelayModule.getPlayerView(state, id).me?.role, id === 'a' ? 'head' : 'white');
  }
  const spectator = JSON.stringify(gooseRelayModule.getSpectatorView(state));
  assert.equal(spectator.includes('evilGeese'), false, '终局前观战视角不得含恶鹅名单');
});

test('以鹅传鹅 讨论起演绎链公开，终局披露完整真相', () => {
  const state = deterministic();
  const discussion = toDiscussion(state);
  assert.equal(discussion.phase, 'discussion');
  const spectator = gooseRelayModule.getSpectatorView(discussion);
  assert.equal(spectator.transmissions?.length, players.length, '讨论起演绎链应公开');
  // 观战视角此时可含案情内容（演绎链已公开）
  assert.equal(JSON.stringify(spectator).includes('murderer'), true);

  // 讨论后进入指认 → 末位指对 → 投票 → 终局披露
  const accusation = reduceGooseRelayState(discussion, { type: 'end_discussion' }, { now: NOW });
  if (!accusation.ok) throw new Error(accusation.message);
  let s = accusation.nextState;
  assert.equal(s.phase, 'accusation');
  s = acceptedV(s, { type: 'accuse', playerId: 'e', murderer: CARD_A.murderer, victim: CARD_A.victim });
  assert.equal(s.phase, 'vote');
  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    s = acceptedV(s, { type: 'cast_vote', playerId: id, targetPlayerId: target });
  }
  assert.equal(s.phase, 'game_over');
  const revealed = gooseRelayModule.getSpectatorView(s);
  assert.ok(revealed.reveal, '终局应披露');
  assert.deepEqual(revealed.reveal.case, CARD_A);
  assert.deepEqual(revealed.reveal.evilGeese, ['c']);
  assert.equal(revealed.reveal.caseMatched, true);
  assert.deepEqual(revealed.reveal.transmissions.length, players.length);
});

function acceptedV(state: GooseRelayState, action: unknown): GooseRelayState {
  const r = reduceGooseRelayState(state, action, { now: NOW });
  if (!r.ok) throw new Error(r.message);
  return r.nextState;
}

test('以鹅传鹅 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = gooseRelayModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => gooseRelayModule.parsePlayerView({ ...playerView, case: CARD_A }), /字段无效/);
  const spectator = gooseRelayModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => gooseRelayModule.parseSpectatorView({ ...spectator, evilGeese: ['a'] }), /字段无效/);
});

test('以鹅传鹅 非参局观察者没有本人视角', () => {
  const view = gooseRelayModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(gooseRelayModule.parsePlayerView(view), view);
});
