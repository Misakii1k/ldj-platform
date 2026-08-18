import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';
import { createGooseRelayState, reduceGooseRelayState } from '../server/rules.ts';
import type { CaseCard, CharacterId, GooseRelayState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const NOW = 1_700_000_000_000;
const CANDIDATES: CharacterId[] = [
  'detective',
  'astronaut',
  'pirate',
  'chef',
  'doctor',
  'firefighter',
  'miner',
  'wizard',
  'samurai',
];
const CARD_A: CaseCard = { murderer: 'detective', victim: 'astronaut' };

function initial() {
  const ctx = deterministicContext();
  return gooseRelayModule.createInitialState(
    ctx,
    players,
    gooseRelayModule.parseConfig({ rulesetId: 'goose_relay_classic_v1' }),
  );
}

/** 确定性状态：抢头鹅阶段，恶鹅 c */
function deterministic(): GooseRelayState {
  return createGooseRelayState(
    players,
    { rulesetId: 'goose_relay_classic_v1' },
    CANDIDATES,
    ['c'],
    CARD_A,
    'a',
  );
}

function acceptedV(state: GooseRelayState, action: unknown, now = NOW): GooseRelayState {
  const res = reduceGooseRelayState(state, action, { now });
  if (!res.ok) throw new Error(res.message);
  return res.nextState;
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

test('以鹅传鹅 隐私与展示区：选卡阶段仅头鹅可见9张卡，接力期间全员保密，讨论与指认对全员公开', () => {
  let state = deterministic();
  // pick_cards 阶段：仅头鹅可见 9 张卡
  const aPick = gooseRelayModule.getPlayerView(state, 'a');
  assert.equal(aPick.candidateCards.length, 9);
  const bPick = gooseRelayModule.getPlayerView(state, 'b');
  assert.equal(bPick.candidateCards.length, 0);

  state = acceptedV(state, {
    type: 'pick_cards',
    playerId: 'a',
    murderer: 'detective',
    victim: 'astronaut',
  });
  // relay 阶段：头鹅可见自己选的案情卡，接力期间全员不公开9张候选卡
  const a = gooseRelayModule.getPlayerView(state, 'a');
  assert.equal(a.me?.role, 'head');
  assert.deepEqual(a.me?.observed, CARD_A);
  assert.equal(a.candidateCards.length, 0);

  // 其余人不可见案情卡与9张候选卡
  for (const id of ['b', 'c', 'd', 'e']) {
    const view = gooseRelayModule.getPlayerView(state, id);
    assert.equal(view.me?.observed, null, `${id} 不应看到案情卡`);
    assert.equal(view.candidateCards.length, 0, `${id} 接力期间不应看到候选卡`);
  }

  // 接力完成，进入讨论阶段后，全员可见 9 张候选牌
  for (let i = 0; i < players.length; i += 1) {
    state = acceptedV(state, { type: 'relay_done', playerId: state.lineOrder[i]! });
  }
  assert.equal(state.phase, 'discussion');
  for (const id of players) {
    assert.equal(gooseRelayModule.getPlayerView(state, id).candidateCards.length, 9);
  }
  assert.equal(gooseRelayModule.getSpectatorView(state).candidateCards.length, 9);
});

test('以鹅传鹅 恶鹅身份仅本人可见，观战与白鹅不可见', () => {
  const state = deterministic();
  const c = gooseRelayModule.getPlayerView(state, 'c');
  assert.equal(c.me?.role, 'evil', '恶鹅本人应知身份');
  for (const id of ['b', 'd', 'e']) {
    assert.equal(gooseRelayModule.getPlayerView(state, id).me?.role, 'white');
  }
  const spectator = JSON.stringify(gooseRelayModule.getSpectatorView(state));
  assert.equal(spectator.includes('evilGeese'), false, '终局前观战视角不得含恶鹅名单');
});

test('以鹅传鹅 终局披露完整真相', () => {
  let s = deterministic();
  s = acceptedV(s, {
    type: 'pick_cards',
    playerId: 'a',
    murderer: 'detective',
    victim: 'astronaut',
  });
  // 动作传递
  for (let i = 0; i < players.length; i += 1) {
    s = acceptedV(s, { type: 'relay_done', playerId: s.lineOrder[i]! });
  }
  // 讨论
  s = acceptedV(s, { type: 'end_discussion' });
  // 末位指对
  s = acceptedV(s, { type: 'accuse', playerId: 'e', murderer: 'detective', victim: 'astronaut' });
  assert.equal(s.phase, 'vote');
  // 投票
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
  assert.equal(revealed.reveal.candidateCards.length, 9);
});

test('以鹅传鹅 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = gooseRelayModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => gooseRelayModule.parsePlayerView({ ...playerView, extraField: 123 }), /字段无效/);
  const spectator = gooseRelayModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => gooseRelayModule.parseSpectatorView({ ...spectator, evilGeese: ['a'] }), /字段无效/);
});

test('以鹅传鹅 非参局观察者没有本人视角', () => {
  const view = gooseRelayModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(gooseRelayModule.parsePlayerView(view), view);
});
