/**
 * 铃铛对决 规则机器人策略测试。
 *
 * 覆盖：
 * - 关键 phase 行为：轮到自己出牌/摸牌、按铃窗口有/无匹配短语、已动作后再次询问返回 null。
 * - 机器人产出经 module.parseAction 后能被 module.reduce 接受（action.playerId 一致、身份合法）。
 * - 完整冒烟：从开局跑动到 game_over，bot 在每一拍只在该自己动时才动，其余返回 null。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { bellClashModule } from '../server/module.ts';
import {
  createBellClashState,
} from '../server/rules.ts';
import type {
  BellClashAction,
  BellClashCard,
  BellClashPlayerView,
  BellClashState,
} from '../server/types.ts';

const PLAYERS = ['a', 'b', 'c'] as const;
const ACTOR = (playerId: string) => ({ kind: 'player' as const, playerId });
const SYS = { kind: 'system' as const, source: 'timer' as const };
const CONFIG = { rulesetId: 'bell_clash_v1' } as const;

function initial(ctx: GameContext = deterministicContext()): BellClashState {
  return bellClashModule.createInitialState(ctx, [...PLAYERS], bellClashModule.parseConfig(CONFIG));
}

/** 派发一步：成功就返回 nextState，失败就把拒绝原因抛出来 */
function step(
  ctx: GameContext,
  state: BellClashState,
  actor: unknown,
  action: unknown,
): BellClashState {
  const result = bellClashModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(`reduce 拒绝: ${result.message}`);
  return result.nextState;
}

/** 跑一次 bot 决策，并断言产出要么是 null、要么被 reducer 接受 */
function runBot(
  ctx: GameContext,
  state: BellClashState,
  playerId: string,
  _seed = `bot-test:${playerId}`,
): BellClashAction | null {
  const view = bellClashModule.getPlayerView(state, playerId) as unknown as BellClashPlayerView;
  const random = {
    nextInt: (() => 0), // 测试只需拿到一个确定性的可选索引
    shuffle: <T>(items: readonly T[]) => [...items],
  };
  const action = bellClashModule.pickBotAction?.({ view, playerId, random });
  if (action === null || action === undefined) return null;
  // 动作必须能被 parseAction 解析
  const parsed = bellClashModule.parseAction(action);
  // playerId 必须匹配请求者
  if ('playerId' in parsed && parsed.playerId !== playerId) {
    throw new Error(`机器人动作的 playerId 与请求者不一致: ${JSON.stringify(parsed)}`);
  }
  // 实际派发到 reducer：要么 ok，要么拒绝原因应是"还没轮到你"等场景（也合法）
  const result = bellClashModule.reduce(ctx, state, ACTOR(playerId), parsed);
  if (!result.ok) {
    throw new Error(
      `机器人动作被 reducer 拒绝: player=${playerId} action=${JSON.stringify(parsed)} ${result.message}`,
    );
  }
  return parsed;
}

// —— 单元行为：关键 phase ——

test('轮到自己且有可出牌 → 机器人返回 play_card 且被 reducer 接受', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  // 默认开局后 currentPlayerId 是 players[0] = a；开始动作也已经被触发
  const afterBegin = step(ctx, state, SYS, { type: 'begin' });
  assert.equal(afterBegin.currentPlayerId, 'a');
  // 找 a 手中可打出的牌（同色/同数字），塞到首张位置以便 bot 选中
  const view = bellClashModule.getPlayerView(afterBegin, 'a') as unknown as BellClashPlayerView;
  assert.ok(view.me, 'a 必须在局内');
  const top = view.discardTop;
  const hand = view.me!.hand;
  const playableIdx = hand.findIndex((card) => {
    if (top === null) return true;
    if (card.color === top.color) return true;
    return card.kind === 'number' && top.kind === 'number' && card.number === top.number;
  });
  if (playableIdx >= 0) {
    const action = runBot(ctx, afterBegin, 'a');
    assert.ok(action, '应有动作');
    assert.equal(action!.type, 'play_card');
    if (action!.type === 'play_card') {
      assert.equal(action!.playerId, 'a');
      assert.equal(action!.cardIndex, playableIdx);
    }
  } else {
    // 极端：手牌都打不出 → 应当返回 draw_card
    const action = runBot(ctx, afterBegin, 'a');
    assert.ok(action, '应当摸牌');
    assert.equal(action!.type, 'draw_card');
  }
});

test('非自己回合 → 机器人返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const afterBegin = step(ctx, state, SYS, { type: 'begin' });
  // b、c 都非当前出牌者
  for (const id of ['b', 'c'] as const) {
    const action = bellClashModule.pickBotAction?.({
      view: bellClashModule.getPlayerView(afterBegin, id) as unknown as BellClashPlayerView,
      playerId: id,
      random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
    });
    assert.equal(action, null, `${id} 不该动`);
  }
});

test('不在本局的玩家 → 机器人返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  // 视角里 me === null 的玩家
  const view = bellClashModule.getPlayerView(state, 'zzz') as unknown as BellClashPlayerView;
  const action = bellClashModule.pickBotAction?.({
    view,
    playerId: 'zzz',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.equal(action, null);
});

test('终局阶段 → 机器人返回 null', () => {
  // 构造一个已 game_over 的状态：a 只剩 1 张可打
  const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
  const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };
  const finished = createBellClashState(
    ['a', 'b'],
    { rulesetId: 'bell_clash_v1', handSize: 1 },
    [blue2],
    { a: [red1], b: [blue2] },
    red1,
  );
  // 让 a 打出最后一张牌进入 game_over
  const ctx = deterministicContext();
  const over = step(ctx, finished, ACTOR('a'), { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(over.phase, 'game_over');
  const action = bellClashModule.pickBotAction?.({
    view: bellClashModule.getPlayerView(over, 'a') as unknown as BellClashPlayerView,
    playerId: 'a',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.equal(action, null);
});

// —— 按铃窗口 ——

test('按铃窗口：手中无同色短语卡 → 机器人不拍铃（避免罚摸）', () => {
  // 构造：a 刚打出红色短语卡 → 打开按铃窗口；b 手中没有红色短语卡
  const redPhrase: BellClashCard = { kind: 'phrase', color: 'red', phrase: '大声说「好耶！」' };
  const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
  const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };
  const yellow1: BellClashCard = { kind: 'number', color: 'yellow', number: 1 };
  const ctx = deterministicContext();
  const state = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 2 },
    [blue2],
    { a: [redPhrase, red1], b: [blue2, yellow1], c: [red1, yellow1] },
    red1,
  );
  const opened = step(ctx, state, ACTOR('a'), { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(opened.bellOpen, true, 'a 打出短语卡应开窗');
  // b 手中无同色短语 → 不拍铃
  const viewB = bellClashModule.getPlayerView(opened, 'b') as unknown as BellClashPlayerView;
  const actionB = bellClashModule.pickBotAction?.({
    view: viewB,
    playerId: 'b',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.equal(actionB, null, 'b 没有红色短语卡，不应拍铃');
});

test('按铃窗口：手中有同色短语卡 → 机器人返回 ring_bell 且被 reducer 接受', () => {
  const redPhrase: BellClashCard = { kind: 'phrase', color: 'red', phrase: '大声说「好耶！」' };
  const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
  const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };
  const yellow1: BellClashCard = { kind: 'number', color: 'yellow', number: 1 };
  const ctx = deterministicContext();
  const state = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 3 },
    [blue2],
    { a: [redPhrase, red1, yellow1], b: [blue2, yellow1, red1], c: [redPhrase, red1, yellow1] },
    red1,
  );
  // a 打出红色短语卡 → 打开按铃窗口
  const opened = step(ctx, state, ACTOR('a'), { type: 'play_card', playerId: 'a', cardIndex: 0 });
  assert.equal(opened.bellOpen, true);
  // c 持有红色短语 → 应拍铃
  const viewC = bellClashModule.getPlayerView(opened, 'c') as unknown as BellClashPlayerView;
  const actionC = bellClashModule.pickBotAction?.({
    view: viewC,
    playerId: 'c',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.ok(actionC, 'c 应拍铃');
  assert.deepEqual(actionC, { type: 'ring_bell', playerId: 'c' });
  // 派发到 reducer：成功
  const result = bellClashModule.reduce(ctx, opened, ACTOR('c'), bellClashModule.parseAction(actionC!));
  assert.equal(result.ok, true, 'c 的拍铃应被接受');
});

test('按铃窗口：已有人拍铃 → 机器人不再拍（让系统结算）', () => {
  const redPhrase: BellClashCard = { kind: 'phrase', color: 'red', phrase: '大声说「好耶！」' };
  const red1: BellClashCard = { kind: 'number', color: 'red', number: 1 };
  const blue2: BellClashCard = { kind: 'number', color: 'blue', number: 2 };
  const yellow1: BellClashCard = { kind: 'number', color: 'yellow', number: 1 };
  const ctx = deterministicContext();
  const state = createBellClashState(
    ['a', 'b', 'c'],
    { rulesetId: 'bell_clash_v1', handSize: 3 },
    [blue2],
    { a: [redPhrase, red1, yellow1], b: [blue2, yellow1, red1], c: [redPhrase, red1, yellow1] },
    red1,
  );
  let s = step(ctx, state, ACTOR('a'), { type: 'play_card', playerId: 'a', cardIndex: 0 });
  s = step(ctx, s, ACTOR('c'), { type: 'ring_bell', playerId: 'c' });
  assert.equal(s.bellClaimantId, 'c');
  // 这时 b 也想拍铃 → 机器人应返回 null（让系统 resolve_bell 结算）
  const viewB = bellClashModule.getPlayerView(s, 'b') as unknown as BellClashPlayerView;
  const actionB = bellClashModule.pickBotAction?.({
    view: viewB,
    playerId: 'b',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.equal(actionB, null, 'b 不该在 c 已拍铃时再拍');
});

// —— 重复询问 / 已动作后 ——

test('已出过牌后再次询问（轮到下一位了）→ 机器人返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const s1 = step(ctx, state, SYS, { type: 'begin' });
  // 让 a 出掉一张可打出的牌
  const viewA = bellClashModule.getPlayerView(s1, 'a') as unknown as BellClashPlayerView;
  const top = viewA.discardTop;
  const hand = viewA.me!.hand;
  const idx = hand.findIndex((card) => {
    if (top === null) return true;
    if (card.color === top.color) return true;
    return card.kind === 'number' && top.kind === 'number' && card.number === top.number;
  });
  if (idx < 0) return; // 当前手牌都打不出，reducer 仍会拒绝 play；跳过本测试的负面断言
  const s2 = step(ctx, s1, ACTOR('a'), { type: 'play_card', playerId: 'a', cardIndex: idx });
  // 现在轮到 b（除非 a 已打完）
  if (s2.phase === 'game_over') {
    // 走极端路径：直接断言终局 → null
    const action = bellClashModule.pickBotAction?.({
      view: bellClashModule.getPlayerView(s2, 'a') as unknown as BellClashPlayerView,
      playerId: 'a',
      random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
    });
    assert.equal(action, null);
    return;
  }
  assert.notEqual(s2.currentPlayerId, 'a', 'a 刚出完牌，轮到 b');
  // a 再问一次：应返回 null
  const action = bellClashModule.pickBotAction?.({
    view: bellClashModule.getPlayerView(s2, 'a') as unknown as BellClashPlayerView,
    playerId: 'a',
    random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
  });
  assert.equal(action, null, 'a 出完牌后再次询问应不动');
});

// —— 完整冒烟 ——

/** 从玩家视角找到第一个可打出的牌（与 module.test.ts 中 firstPlayable 等价） */
function firstPlayableIndex(state: BellClashState, playerId: string): number {
  const view = bellClashModule.getPlayerView(state, playerId) as unknown as BellClashPlayerView;
  const hand = view.me?.hand ?? [];
  const top = view.discardTop;
  return hand.findIndex((card) => {
    if (top === null) return true;
    if (card.color === top.color) return true;
    return card.kind === 'number' && top.kind === 'number' && card.number === top.number;
  });
}

test('完整冒烟：bot + system 交替直到 game_over，机器人只在轮到自己时返回动作', () => {
  const ctx = deterministicContext();
  let s = initial(ctx);
  s = step(ctx, s, SYS, { type: 'begin' });
  const askedWhenNotTurn = new Set<string>(); // 记录"非自己回合问了 bot"，应始终返回 null
  for (let stepN = 0; stepN < 600; stepN += 1) {
    if (s.phase === 'game_over') break;
    const current = s.currentPlayerId as string;
    // 1) 询问所有玩家：非当前出牌者必须返回 null
    for (const id of PLAYERS) {
      if (id === current) continue;
      if (s.bellOpen) continue; // 窗口期间所有非当前者都不动
      const action = bellClashModule.pickBotAction?.({
        view: bellClashModule.getPlayerView(s, id) as unknown as BellClashPlayerView,
        playerId: id,
        random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
      });
      assert.equal(action, null, `step=${stepN} id=${id} 非自己回合，bot 不该动`);
      askedWhenNotTurn.add(id);
    }
    // 2) 按铃窗口
    if (s.bellOpen) {
      // 找持同色短语卡的玩家让其拍铃；否则 system resolve
      const top = s.discardTop!;
      let claimant: string | null = s.bellClaimantId;
      if (claimant === null) {
        claimant = null;
        for (const id of PLAYERS) {
          if (id === current) continue;
          const hand = s.hands[id]!;
          if (hand.some((c) => c.kind === 'phrase' && c.color === top.color)) {
            claimant = id;
            break;
          }
        }
      }
      if (claimant) {
        s = step(ctx, s, ACTOR(claimant), { type: 'ring_bell', playerId: claimant });
        continue;
      }
      s = step(ctx, s, SYS, { type: 'resolve_bell', claimantId: '' });
      continue;
    }
    // 3) 当前出牌者：让 bot 决策
    const action = bellClashModule.pickBotAction?.({
      view: bellClashModule.getPlayerView(s, current) as unknown as BellClashPlayerView,
      playerId: current,
      random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
    });
    assert.ok(action, `step=${stepN} ${current} 应有动作（自己回合）`);
    // 验证 action 的 playerId 与 current 一致
    if ('playerId' in action!) assert.equal(action!.playerId, current);
    // bot 应当始终能直接交给 reducer
    const expectedIdx = firstPlayableIndex(s, current);
    if (action!.type === 'play_card' && expectedIdx < 0) {
      throw new Error(`step=${stepN} bot 选择 play_card 但视图无可打牌`);
    }
    s = step(ctx, s, ACTOR(current), action!);
  }
  assert.equal(s.phase, 'game_over', '应在有界步数内收束');
  assert.equal(s.winners.length, 1);
  assert.ok(askedWhenNotTurn.size >= 1, '应至少有一次对非自己回合玩家的询问');
});
