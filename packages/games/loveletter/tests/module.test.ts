import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { loveLetterModule } from '../server/module.ts';
import { LOVELETTER_MANIFEST } from '../shared/manifest.ts';
import { buildLoveLetterDeck } from '../server/rules.ts';
import type { LoveLetterCard, LoveLetterRole } from '../server/types.ts';

const players = ['a', 'b'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });

function deckWith(prefix: LoveLetterRole[]): LoveLetterCard[] {
  const remaining = buildLoveLetterDeck();
  const selected = prefix.map((role) => {
    const index = remaining.findIndex((card) => card.role === role);
    assert.notEqual(index, -1, `缺少角色 ${role}`);
    return remaining.splice(index, 1)[0]!;
  });
  return [...selected, ...remaining];
}

function initial(ctx: GameContext = deterministicContext(), forcePriest = false) {
  const config = forcePriest
    ? { rulesetId: 'loveletter_classic16_v1' as const, deckOrder: deckWith(['guard', 'guard', 'priest', 'princess', 'guard']) }
    : { rulesetId: 'loveletter_classic16_v1' as const };
  return loveLetterModule.createInitialState(ctx, players, loveLetterModule.parseConfig(config));
}

test('情书 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(loveLetterModule);
  versionedContractAssertions.initial(loveLetterModule, ctx, players, { rulesetId: 'loveletter_classic16_v1' });
  versionedContractAssertions.viewSchemas(loveLetterModule, initial(), players);
});

test('情书 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx, true);
  const priest = state.hands.a!.find((card) => card.role === 'priest')!;
  const action = { type: 'play_card' as const, playerId: 'a', cardId: priest.id, targetPlayerId: 'b' };
  versionedContractAssertions.pure(loveLetterModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(loveLetterModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(loveLetterModule, ctx, state, actor('b'), action);
});

test('情书只向本人暴露手牌，观战与他人视图不泄漏', () => {
  const state = initial();
  const own = loveLetterModule.getPlayerView(state, 'a');
  const other = loveLetterModule.getPlayerView(state, 'b');
  const spectator = loveLetterModule.getSpectatorView(state);
  assert.deepEqual(own.me?.hand, state.hands.a);
  assert.equal(JSON.stringify(other).includes(state.hands.a![0]!.id), false);
  assert.equal(JSON.stringify(spectator).includes(state.hands.a![0]!.id), false);
  assert.equal('hands' in (spectator as unknown as Record<string, unknown>), false);
});

test('情书 2 至 4 人逐视角均只暴露本人手牌', () => {
  for (let count = 2; count <= 4; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `p${index}`);
    const ctx = deterministicContext();
    const state = loveLetterModule.createInitialState(ctx, ids, loveLetterModule.parseConfig({ rulesetId: 'loveletter_classic16_v1' }));
    for (const playerId of ids) {
      const view = loveLetterModule.getPlayerView(state, playerId);
      assert.deepEqual(view.me?.hand, state.hands[playerId]);
      for (const otherId of ids.filter((id) => id !== playerId)) {
        for (const card of state.hands[otherId]!) assert.equal(JSON.stringify(view).includes(card.id), false);
      }
    }
    const spectator = JSON.stringify(loveLetterModule.getSpectatorView(state));
    for (const playerId of ids) {
      for (const card of state.hands[playerId]!) assert.equal(spectator.includes(card.id), false);
    }
  }
});

test('情书终局动作返回正式结果候选', () => {
  const ctx = deterministicContext();
  const state = loveLetterModule.createInitialState(ctx, players, loveLetterModule.parseConfig({
    rulesetId: 'loveletter_classic16_v1',
    deckOrder: deckWith(['guard', 'guard', 'guard', 'princess', 'priest']),
  }));
  state.affection.a = 6;
  const guard = state.hands.a!.find((card) => card.role === 'guard')!;
  const reduced = loveLetterModule.reduce(ctx, state, actor('a'), {
    type: 'play_card', playerId: 'a', cardId: guard.id, targetPlayerId: 'b', guessedRole: 'princess',
  });
  assert.equal(reduced.ok, true);
  if (!reduced.ok) return;
  assert.deepEqual(reduced.resultCandidate, { winners: ['a'], affection: { a: 7, b: 0 } });
});

test('情书稳定完整轨迹结果 only-once 且快照可重放', () => {
  const winningDeck = deckWith(['guard', 'guard', 'guard', 'princess', 'priest']);
  const config = {
    rulesetId: 'loveletter_classic16_v1',
    deckOrder: winningDeck,
    futureDeckOrders: Array.from({ length: 6 }, () => structuredClone(winningDeck)),
  };
  const steps = Array.from({ length: 7 }, () => ({
    actor: actor('a'),
    action: {
      type: 'play_card',
      playerId: 'a',
      cardId: 'guard-3',
      targetPlayerId: 'b',
      guessedRole: 'princess',
    },
  }));
  versionedContractAssertions.resultOnlyOnce(loveLetterModule, 'loveletter-replay', players, config, steps);
  versionedContractAssertions.snapshotReplayable(loveLetterModule, 'loveletter-replay', players, config, steps);
});

test('神父查验记录仅出现在查验者本人视图', () => {
  const ctx = deterministicContext();
  const state = initial(ctx, true);
  const priest = state.hands.a!.find((card) => card.role === 'priest')!;
  const reduced = loveLetterModule.reduce(ctx, state, actor('a'), {
    type: 'play_card', playerId: 'a', cardId: priest.id, targetPlayerId: 'b',
  });
  assert.equal(reduced.ok, true);
  if (!reduced.ok) return;
  assert.equal(loveLetterModule.getPlayerView(reduced.nextState, 'a').me?.inspections.length, 1);
  assert.equal(loveLetterModule.getPlayerView(reduced.nextState, 'b').me?.inspections.length, 0);
  assert.equal('inspections' in (loveLetterModule.getSpectatorView(reduced.nextState) as unknown as Record<string, unknown>), false);
});

test('情书模块身份、manifest 与规则集声明一致', () => {
  assert.equal(loveLetterModule.manifest.id, 'loveletter');
  assert.equal(loveLetterModule.identity.rulesetId, loveLetterModule.defaultRulesetId);
  assert.deepEqual(loveLetterModule.registeredRulesets, LOVELETTER_MANIFEST.rulesets);
  assert.equal(loveLetterModule.manifest.stateSchemaVersion, 1);
});

test('情书边界解析拒绝畸形快照和视图秘密字段', () => {
  const state = initial();
  const broken = structuredClone(state);
  broken.deck.pop();
  assert.throws(() => loveLetterModule.parseState(broken), /守恒/);

  const playerView = loveLetterModule.getPlayerView(state, 'a');
  assert.throws(
    () => loveLetterModule.parsePlayerView({ ...playerView, hands: state.hands }),
    /字段无效/,
  );
  const spectatorView = loveLetterModule.getSpectatorView(state);
  assert.throws(
    () => loveLetterModule.parseSpectatorView({ ...spectatorView, inspections: state.inspections }),
    /字段无效/,
  );
});

test('情书非参局观察者没有本人手牌视角', () => {
  const view = loveLetterModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(loveLetterModule.parsePlayerView(view), view);
});
