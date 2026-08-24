import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPartySandboxInvariants,
  createDefaultBell,
  createDefaultCoin,
  createDefaultDeck,
  createDefaultDice,
  createDefaultRevolver,
  createDefaultScoreboard,
  createDefaultTimer,
  createDefaultWheel,
  createPartySandboxState,
  reducePartySandboxState,
} from '../server/rules.ts';
import type { PartySandboxState } from '../server/types.ts';

const players = ['alice', 'bob', 'charlie'];

function accepted(state: PartySandboxState, action: unknown): PartySandboxState {
  const res = reducePartySandboxState(state, action);
  assert.equal(res.ok, true, `预期动作成功: ${JSON.stringify(action)} -> ${res.error}`);
  assert.ok(res.nextState);
  return res.nextState;
}

test('沙盒初始化：包含左轮、骰子与抢答铃默认道具', () => {
  const state = createPartySandboxState(players);
  assert.equal(state.players.length, 3);
  assert.equal(state.propOrder.length, 3);
  assert.ok(state.props['prop_revolver_1']);
  assert.ok(state.props['prop_dice_1']);
  assert.ok(state.props['prop_bell_1']);
  assert.equal(state.activityLogs.length, 1);
});

test('左轮手枪：装弹、旋转、击发空枪与实弹消耗', () => {
  let state = createPartySandboxState(players);
  const rev = state.props['prop_revolver_1']!;
  assert.equal(rev.kind, 'revolver');

  // 装填 6 发实弹
  state = accepted(state, {
    type: 'operate_revolver',
    playerId: 'alice',
    propId: rev.id,
    subAction: 'load',
    chambers: 6,
    liveCount: 6,
  });

  const loadedRev = state.props[rev.id]!;
  if (loadedRev.kind === 'revolver') {
    assert.equal(loadedRev.cylinder.filter((b) => b === 'live').length, 6);
  }

  // 扣动扳机 -> 实弹击发
  state = accepted(state, {
    type: 'operate_revolver',
    playerId: 'alice',
    propId: rev.id,
    subAction: 'shoot',
    targetPlayerId: 'bob',
  });

  const shotRev = state.props[rev.id]!;
  if (shotRev.kind === 'revolver') {
    assert.equal(shotRev.lastAction?.result, 'live');
    assert.equal(shotRev.lastAction?.targetPlayerId, 'bob');
    assert.equal(shotRev.cylinder.filter((b) => b === 'live').length, 5, '击发后实弹变为 5 发');
  }
});

test('摇骰盅：摇骰、盖盅与掀盅', () => {
  let state = createPartySandboxState(players);
  const dice = state.props['prop_dice_1']!;
  assert.equal(dice.kind, 'dice');

  // 摇骰
  state = accepted(state, {
    type: 'operate_dice',
    playerId: 'bob',
    propId: dice.id,
    subAction: 'roll',
  });

  // 盖上骰盅
  state = accepted(state, {
    type: 'operate_dice',
    playerId: 'bob',
    propId: dice.id,
    subAction: 'toggle_cup',
  });
  const coveredDice = state.props[dice.id]!;
  if (coveredDice.kind === 'dice') {
    assert.equal(coveredDice.isCupCovered, true);
  }

  // 掀开骰盅
  state = accepted(state, {
    type: 'operate_dice',
    playerId: 'bob',
    propId: dice.id,
    subAction: 'toggle_cup',
  });
  const openedDice = state.props[dice.id]!;
  if (openedDice.kind === 'dice') {
    assert.equal(openedDice.isCupCovered, false);
  }
});

test('抢答铃：首位锁定与重置', () => {
  let state = createPartySandboxState(players);
  const bell = state.props['prop_bell_1']!;

  state = accepted(state, {
    type: 'operate_bell',
    playerId: 'charlie',
    propId: bell.id,
    subAction: 'ring',
  });
  let b = state.props[bell.id]!;
  if (b.kind === 'bell') {
    assert.equal(b.rungBy, 'charlie');
    assert.equal(b.ringCount, 1);
  }

  // 他人再次拍铃不会抢夺第一名
  state = accepted(state, {
    type: 'operate_bell',
    playerId: 'alice',
    propId: bell.id,
    subAction: 'ring',
  });
  b = state.props[bell.id]!;
  if (b.kind === 'bell') {
    assert.equal(b.rungBy, 'charlie');
    assert.equal(b.ringCount, 2);
  }

  // 重置抢答铃
  state = accepted(state, {
    type: 'operate_bell',
    playerId: 'bob',
    propId: bell.id,
    subAction: 'reset',
  });
  b = state.props[bell.id]!;
  if (b.kind === 'bell') {
    assert.equal(b.rungBy, null);
    assert.equal(b.ringCount, 0);
  }
});

test('卡牌堆：添加卡牌堆、发牌、打出手牌与洗牌', () => {
  let state = createPartySandboxState(players);
  const deck = createDefaultDeck('deck_custom', '真心话', [
    { id: 'c1', title: '真心话 1', content: '分享你最尴尬的经历' },
    { id: 'c2', title: '真心话 2', content: '分享你最喜欢的一首歌' },
    { id: 'c3', title: '真心话 3', content: '说出在场最帅的人' },
    { id: 'c4', title: '真心话 4', content: '童年最想成为什么' },
  ]);

  state = accepted(state, {
    type: 'spawn_prop',
    playerId: 'alice',
    prop: deck,
  });

  // 全员发牌
  state = accepted(state, {
    type: 'operate_deck',
    playerId: 'alice',
    propId: 'deck_custom',
    subAction: 'deal_all',
  });

  assert.equal(state.hands['alice']?.length, 1);
  assert.equal(state.hands['bob']?.length, 1);
  assert.equal(state.hands['charlie']?.length, 1);

  // 打出手牌
  state = accepted(state, {
    type: 'operate_deck',
    playerId: 'alice',
    propId: 'deck_custom',
    subAction: 'play_hand',
    isPublic: true,
  });

  assert.equal(state.hands['alice']?.length, 0);
  const d = state.props['deck_custom']!;
  if (d.kind === 'deck') {
    assert.equal(d.tableCards.length, 1);
  }
});

test('计时炸弹与幸运硬币', () => {
  let state = createPartySandboxState(players);
  const timer = createDefaultTimer('t1', 10);
  const coin = createDefaultCoin('coin1');

  state = accepted(state, { type: 'spawn_prop', playerId: 'alice', prop: timer });
  state = accepted(state, { type: 'spawn_prop', playerId: 'alice', prop: coin });

  // 抛硬币
  state = accepted(state, { type: 'operate_coin', playerId: 'alice', propId: 'coin1', subAction: 'flip' });
  const c = state.props['coin1']!;
  if (c.kind === 'coin') {
    assert.ok(c.lastFlipResult === 'heads' || c.lastFlipResult === 'tails');
  }

  // 启动倒计时
  state = accepted(state, { type: 'operate_timer', playerId: 'bob', propId: 't1', subAction: 'start' });
  let t = state.props['t1']!;
  if (t.kind === 'timer') {
    assert.equal(t.isRunning, true);
  }
});

test('AI 小助手锵锵一键布置桌面', () => {
  let state = createPartySandboxState(players);
  state = accepted(state, {
    type: 'ai_setup_table',
    playerId: 'alice',
    prompt: '我们要玩大冒险，准备30张卡牌',
    reply: '已为您准备好【刺激大冒险】卡牌堆，并在桌上放置了定时炸弹与抢答铃！',
    replaceDeckCards: {
      deckId: 'prop_deck_adv',
      title: '刺激大冒险',
      cards: [
        { id: 'adv_1', title: '大冒险 1', content: '做 5 个深蹲' },
        { id: 'adv_2', title: '大冒险 2', content: '模仿动物叫声' },
      ],
    },
  });

  assert.equal(state.assistantMessage?.prompt, '我们要玩大冒险，准备30张卡牌');
  assert.ok(state.props['prop_deck_adv']);
});

test('指名大转盘：旋转与扇区设置', () => {
  let state = createPartySandboxState(players);
  const wheel = createDefaultWheel('wheel_1');

  state = accepted(state, { type: 'spawn_prop', playerId: 'alice', prop: wheel });

  // 旋转转盘
  state = accepted(state, {
    type: 'operate_wheel',
    playerId: 'bob',
    propId: 'wheel_1',
    subAction: 'spin',
  });
  const w = state.props['wheel_1']!;
  if (w.kind === 'wheel') {
    assert.ok(w.lastResult);
    assert.equal(w.spunBy, 'bob');
  }

  // 设置新扇区
  state = accepted(state, {
    type: 'operate_wheel',
    playerId: 'alice',
    propId: 'wheel_1',
    subAction: 'set_segments',
    segments: [
      { label: '惩罚A', color: '#ff0000' },
      { label: '惩罚B', color: '#00ff00' },
    ],
  });
  const w2 = state.props['wheel_1']!;
  if (w2.kind === 'wheel') {
    assert.equal(w2.segments.length, 2);
  }
});

test('筹码计分板：加减分与重置', () => {
  let state = createPartySandboxState(players);
  const scoreboard = createDefaultScoreboard('sb_1', '筹码计分板', players, 100);

  state = accepted(state, { type: 'spawn_prop', playerId: 'alice', prop: scoreboard });

  // 加减分
  state = accepted(state, {
    type: 'operate_scoreboard',
    playerId: 'alice',
    propId: 'sb_1',
    subAction: 'modify_score',
    targetPlayerId: 'bob',
    delta: 50,
  });
  let sb = state.props['sb_1']!;
  if (sb.kind === 'scoreboard') {
    assert.equal(sb.scores['bob'], 150);
  }

  // 全员重置
  state = accepted(state, {
    type: 'operate_scoreboard',
    playerId: 'alice',
    propId: 'sb_1',
    subAction: 'reset_scores',
    initialScore: 200,
  });
  sb = state.props['sb_1']!;
  if (sb.kind === 'scoreboard') {
    assert.equal(sb.scores['alice'], 200);
    assert.equal(sb.scores['bob'], 200);
    assert.equal(sb.scores['charlie'], 200);
  }
});

test('卡牌堆：逐张新增与删除', () => {
  let state = createPartySandboxState(players);
  const deck = createDefaultDeck('deck_1', '卡牌堆', []);
  state = accepted(state, { type: 'spawn_prop', playerId: 'alice', prop: deck });

  // 新增卡牌
  state = accepted(state, {
    type: 'operate_deck',
    playerId: 'alice',
    propId: 'deck_1',
    subAction: 'add_card',
    card: { id: 'custom_1', title: '自制卡', content: '自制内容' },
  });
  let d = state.props['deck_1']!;
  if (d.kind === 'deck') {
    assert.equal(d.drawPile.length, 1);
  }

  // 删除卡牌
  state = accepted(state, {
    type: 'operate_deck',
    playerId: 'alice',
    propId: 'deck_1',
    subAction: 'remove_card',
    cardId: 'custom_1',
  });
  d = state.props['deck_1']!;
  if (d.kind === 'deck') {
    assert.equal(d.drawPile.length, 0);
  }
});
