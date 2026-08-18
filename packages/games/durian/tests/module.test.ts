import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { durianModule } from '../server/module.ts';
import { DURIAN_MANIFEST } from '../shared/manifest.ts';
import type { FruitCard } from '../server/types.ts';

const players = ['a', 'b', 'c'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });

function initial(ctx: GameContext = deterministicContext()) {
  return durianModule.createInitialState(ctx, players, durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));
}

test('Durian V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(durianModule);
  versionedContractAssertions.initial(durianModule, ctx, players, { rulesetId: 'durian_orchard_v1' });
  versionedContractAssertions.viewSchemas(durianModule, initial(), players);
});

test('Durian reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'draw_card' as const, playerId: 'a' };
  versionedContractAssertions.pure(durianModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(durianModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(durianModule, ctx, state, actor('b'), action);
});

test('Durian 2 至 7 人逐视角均隐藏本人头顶牌，且能看到其他所有人头顶牌', () => {
  for (let count = 2; count <= 7; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `p${index}`);
    const ctx = deterministicContext();
    const state = durianModule.createInitialState(ctx, ids, durianModule.parseConfig({ rulesetId: 'durian_orchard_v1' }));

    assert.equal(Object.keys(state.foreheadCards).length, count);

    for (const playerId of ids) {
      const view = durianModule.getPlayerView(state, playerId);
      assert.equal(view.me?.visibleForeheadCards.length, count - 1);
      const myCard = state.foreheadCards[playerId];
      if (myCard) {
        assert.equal(view.me?.visibleForeheadCards.some((entry) => entry.card.id === myCard.id), false);
      }
      for (const otherId of ids.filter((id) => id !== playerId)) {
        const otherCard = state.foreheadCards[otherId];
        if (otherCard) {
          assert.equal(view.me?.visibleForeheadCards.some((entry) => entry.card.id === otherCard.id), true);
        }
      }
    }
  }
});

test('Durian 终局动作返回正式结果候选', () => {
  const ctx = deterministicContext();
  const cardA: FruitCard = { id: 'c-a', kind: 'fruit', left: { fruit: 'grape', quantity: 1 }, right: { fruit: 'apple', quantity: 1 } };
  const cardB: FruitCard = { id: 'c-b', kind: 'fruit', left: { fruit: 'banana', quantity: 1 }, right: { fruit: 'grape', quantity: 1 } };
  const cardDraw: FruitCard = { id: 'c-draw', kind: 'fruit', left: { fruit: 'durian', quantity: 3 }, right: { fruit: 'durian', quantity: 3 } };

  const state = durianModule.createInitialState(ctx, ['a', 'b'], durianModule.parseConfig({
    rulesetId: 'durian_orchard_v1',
    customDeck: [cardA, cardB, cardDraw],
  }));

  state.penalties.a = 7;
  state.round = 2;

  // a 摸牌并放置
  const drawn = durianModule.reduce(ctx, state, actor('a'), { type: 'draw_card', playerId: 'a' });
  assert.equal(drawn.ok, true);
  if (!drawn.ok) return;

  const placed = durianModule.reduce(ctx, drawn.nextState, actor('a'), { type: 'place_fruit', playerId: 'a', checkHalf: 'left' });
  assert.equal(placed.ok, true);
  if (!placed.ok) return;

  // b 质疑 a
  const challenged = durianModule.reduce(ctx, placed.nextState, actor('b'), { type: 'challenge', playerId: 'b' });
  assert.equal(challenged.ok, true);
  if (!challenged.ok) return;

  assert.equal(challenged.nextState.phase, 'game_over');
  assert.deepEqual(challenged.resultCandidate, { winners: ['b'], penalties: { a: 9, b: 0 } });
});

test('Durian 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(durianModule.manifest.id, 'durian');
  assert.equal(durianModule.identity.rulesetId, durianModule.defaultRulesetId);
  assert.deepEqual(durianModule.registeredRulesets, DURIAN_MANIFEST.rulesets);
  assert.equal(durianModule.manifest.stateSchemaVersion, 1);
});

test('Durian 非参局观察者没有本人视角', () => {
  const view = durianModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(durianModule.parsePlayerView(view), view);
});
