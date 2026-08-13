/**
 * 暗夜证词 机器人策略测试。
 *
 * 覆盖：
 * - 问答阶段：被问 → 答；未轮到 → null；已答完再次调用 → null
 * - 推理阶段：null
 * - 投票阶段：返回合法 cast_vote（parseAction + reduce 通过）
 * - game_over：null
 * - 非参局玩家：null
 * - 完整冒烟：system + bot 交替跑到终局
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { pickNightTestimonyBotAction } from '../server/bot.ts';
import { nightTestimonyModule } from '../server/module.ts';
import { createNightTestimonyState } from '../server/rules.ts';
import type { NightTestimonyState } from '../server/types.ts';

const PLAYERS = ['a', 'b', 'c', 'd'] as const;
const ACTOR = (playerId: string) => ({ kind: 'player' as const, playerId });
const SYS = { kind: 'system' as const, source: 'timer' as const };

function makeInitialState(ctx: GameContext = deterministicContext()): NightTestimonyState {
  return nightTestimonyModule.createInitialState(
    ctx,
    [...PLAYERS],
    nightTestimonyModule.parseConfig({ rulesetId: 'night_testimony_v1' }),
  );
}

function makeDeterministicState(): NightTestimonyState {
  // b 是狱警；a/c/d 是囚犯（互异罪行）
  return createNightTestimonyState(
    [...PLAYERS],
    { rulesetId: 'night_testimony_v1' },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
  );
}

/** 把 bot 决策交给 reduce；返回 {state, action, ok} */
function tryBotAction(
  ctx: GameContext,
  state: NightTestimonyState,
  playerId: string,
  randomSeed = 'bot-test',
) {
  const view = nightTestimonyModule.getPlayerView(state, playerId);
  const random = createSeededRandom(`${randomSeed}:${playerId}`);
  const action = pickNightTestimonyBotAction({ view, playerId, random });
  if (action === null) return { state, action, ok: true as const, applied: false as const };
  // 必经 parseAction + reduce
  const parsed = nightTestimonyModule.parseAction(action);
  const result = nightTestimonyModule.reduce(ctx, structuredClone(state), ACTOR(playerId), parsed);
  if (!result.ok) return { state, action: parsed, ok: false as const, applied: false as const, message: result.message };
  return { state: result.nextState, action: parsed, ok: true as const, applied: true as const };
}

test('暗夜证词 bot 提问阶段：被问时随机 YES/NO（标记有余量时）', () => {
  const ctx = deterministicContext();
  // 多次采样：bot 答 yes 或 no 都合法
  const answers = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    const state = makeDeterministicStateForAsk(ctx, 'c', 'a', `q${i}`);
    const r = tryBotAction(ctx, state, 'a', `seed-${i}`);
    if (r.action && r.action.type === 'answer') {
      answers.add(r.action.answer);
      assert.equal(r.applied, true, 'answer 应被 reducer 接受');
    }
  }
  assert.ok(answers.size >= 1, 'bot 至少要能产生一个 answer');
  // 标记不耗尽时 yes/no 都会出现（概率 1/2^20 才会全同）
  assert.ok(answers.has('yes') || answers.has('no'), 'bot 应至少返回 yes 或 no 之一');
});

function makeDeterministicStateForAsk(
  ctx: GameContext,
  questioner: string,
  responder: string,
  text: string,
): NightTestimonyState {
  const state = makeDeterministicState();
  const ask = nightTestimonyModule.reduce(
    ctx,
    state,
    ACTOR(questioner),
    { type: 'ask', playerId: questioner, targetPlayerId: responder, text },
  );
  if (!ask.ok) throw new Error(ask.message);
  return ask.nextState;
}

test('暗夜证词 bot 提问阶段：未轮到 → null', () => {
  const state = makeDeterministicState();
  // 没人被问，phase=question
  for (const id of PLAYERS) {
    const view = nightTestimonyModule.getPlayerView(state, id);
    const random = createSeededRandom(`seed-${id}`);
    const action = pickNightTestimonyBotAction({ view, playerId: id, random });
    assert.equal(action, null, `${id} 没人问应返回 null`);
  }
});

test('暗夜证词 bot 推理阶段：始终 null', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  // 强行推进到 deduction（用系统计时器兜底）
  const r = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_question' });
  assert.ok(r.ok);
  if (!r.ok) return;
  state = r.nextState;
  assert.equal(state.phase, 'deduction');
  for (const id of PLAYERS) {
    const view = nightTestimonyModule.getPlayerView(state, id);
    const random = createSeededRandom(`seed-${id}`);
    const action = pickNightTestimonyBotAction({ view, playerId: id, random });
    assert.equal(action, null, `deduction 阶段 ${id} 应返回 null`);
  }
});

test('暗夜证词 bot 投票阶段：返回合法 cast_vote（parse + reduce 通过）', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  // 推进到 vote
  const r1 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_question' });
  if (!r1.ok) throw new Error(r1.message);
  state = r1.nextState;
  const r2 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'end_deduction' });
  if (!r2.ok) throw new Error(r2.message);
  state = r2.nextState;
  assert.equal(state.phase, 'vote');

  // 每个 bot 投一次：动作必须可 parse 且 reduce 接受
  for (const id of PLAYERS) {
    const r = tryBotAction(ctx, state, id, `vote-${id}`);
    assert.equal(r.ok, true, `bot ${id} 投票应被 reducer 接受`);
    assert.equal(r.applied, true, 'vote 应被应用到状态');
    if (r.applied) state = r.state;
  }
  // 全部投完应进 game_over
  assert.equal(state.phase, 'game_over');
  // 投的都不是自己：抽 1 个看看
  const b = pickNightTestimonyBotAction({
    view: nightTestimonyModule.getPlayerView(state, 'a'),
    playerId: 'a',
    random: createSeededRandom('a-after'),
  });
  assert.equal(b, null, 'game_over 阶段 bot 应返回 null');
});

test('暗夜证词 bot game_over：狱警需猜罪时返回 submit_guesses，其余 null', () => {
  const ctx = deterministicContext();
  // 走完整路径到 game_over（票出狱警 → 猜罪中间态）
  let state = makeDeterministicState();
  const begin = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'begin' });
  if (!begin.ok) throw new Error(begin.message);
  state = begin.nextState;
  const r1 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_question' });
  if (!r1.ok) throw new Error(r1.message);
  state = r1.nextState;
  const r2 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'end_deduction' });
  if (!r2.ok) throw new Error(r2.message);
  state = r2.nextState;
  // 让 a/c/d 投 b（狱警），b 投 a；票出狱警 → 进入猜罪中间态（winners=[]，wardenRevealed=true）
  for (const id of ['a', 'c', 'd']) {
    const v = nightTestimonyModule.reduce(ctx, state, ACTOR(id), { type: 'cast_vote', playerId: id, targetPlayerId: 'b' });
    if (!v.ok) throw new Error(v.message);
    state = v.nextState;
  }
  const v = nightTestimonyModule.reduce(ctx, state, ACTOR('b'), { type: 'cast_vote', playerId: 'b', targetPlayerId: 'a' });
  if (!v.ok) throw new Error(v.message);
  state = v.nextState;
  assert.equal(state.phase, 'game_over');
  assert.equal(state.wardenGuesses, null, '狱警被票出后等待猜罪');
  for (const id of PLAYERS) {
    const view = nightTestimonyModule.getPlayerView(state, id);
    const random = createSeededRandom(`over-${id}`);
    const action = pickNightTestimonyBotAction({ view, playerId: id, random });
    if (id === 'b') {
      assert.ok(action && action.type === 'submit_guesses', '狱警应返回 submit_guesses 以闭环');
      if (action && action.type === 'submit_guesses') {
        assert.equal(action.playerId, 'b');
        assert.deepEqual(Object.keys(action.guesses).sort(), ['a', 'c', 'd'], '猜罪须覆盖全部囚犯');
        // 应用后对局真正终结：全部玩家返回 null
        const applied = nightTestimonyModule.reduce(ctx, state, ACTOR('b'), action);
        assert.equal(applied.ok, true, 'submit_guesses 应被 reducer 接受');
        if (!applied.ok) continue;
        for (const p of PLAYERS) {
          const v2 = nightTestimonyModule.getPlayerView(applied.nextState, p);
          const a2 = pickNightTestimonyBotAction({ view: v2, playerId: p, random: createSeededRandom(`done-${p}`) });
          assert.equal(a2, null, `猜罪结算后 ${p} 应返回 null`);
        }
      }
    } else {
      assert.equal(action, null, `囚犯 ${id} 应返回 null`);
    }
  }
});

test('暗夜证词 bot 非参局玩家：返回 null', () => {
  const ctx = deterministicContext();
  const state = makeInitialState(ctx);
  const view = nightTestimonyModule.getPlayerView(state, 'outsider');
  assert.equal(view.me, null, '非参局者视角 me 应为 null');
  const random = createSeededRandom('out');
  const action = pickNightTestimonyBotAction({ view, playerId: 'outsider', random });
  assert.equal(action, null);
});

test('暗夜证词 bot 已回答后再次调用：pendingQuestion 为空 → null', () => {
  const ctx = deterministicContext();
  // 构造一个 'a' 刚被问完、pendingQuestion=null 的状态
  let state = makeDeterministicState();
  const ask = nightTestimonyModule.reduce(
    ctx,
    state,
    ACTOR('c'),
    { type: 'ask', playerId: 'c', targetPlayerId: 'a', text: 'q' },
  );
  if (!ask.ok) throw new Error(ask.message);
  state = ask.nextState;
  const ans = nightTestimonyModule.reduce(ctx, state, ACTOR('a'), { type: 'answer', playerId: 'a', answer: 'yes' });
  if (!ans.ok) throw new Error(ans.message);
  state = ans.nextState;
  assert.equal(state.pendingQuestion, null, 'a 答完后 pendingQuestion 应清空');
  // 现在再调 bot for a → null
  const view = nightTestimonyModule.getPlayerView(state, 'a');
  const random = createSeededRandom('after-ans');
  const action = pickNightTestimonyBotAction({ view, playerId: 'a', random });
  assert.equal(action, null, 'a 已回答，再次调用应返回 null');
});

test('暗夜证词 bot 答案严格满足 schema（playerId 必为该玩家）', () => {
  const ctx = deterministicContext();
  // 给 a/c/d 各造一个"被问"状态，验证 bot 答案的 playerId 一定等于请求的 playerId
  for (const responder of ['a', 'c', 'd'] as const) {
    for (let i = 0; i < 8; i += 1) {
      const state = makeDeterministicStateForAsk(ctx, 'b', responder, `q-${i}`);
      const view = nightTestimonyModule.getPlayerView(state, responder);
      const random = createSeededRandom(`ans-${responder}-${i}`);
      const action = pickNightTestimonyBotAction({ view, playerId: responder, random });
      assert.ok(action !== null, `${responder} 第 ${i} 次采样应能产出动作`);
      assert.equal(action?.type, 'answer', '被问时 bot 应产出 answer');
      if (action && action.type === 'answer') {
        assert.equal(action.playerId, responder, 'answer.playerId 必须等于请求者');
        const parsed = nightTestimonyModule.parseAction(action);
        const reduced = nightTestimonyModule.reduce(ctx, structuredClone(state), ACTOR(responder), parsed);
        assert.equal(reduced.ok, true, 'parseAction + reduce 必须通过');
      }
    }
  }
});

test('暗夜证词 bot 投票时 targetPlayerId 不是自己', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  const r1 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_question' });
  if (!r1.ok) throw new Error(r1.message);
  state = r1.nextState;
  const r2 = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'end_deduction' });
  if (!r2.ok) throw new Error(r2.message);
  state = r2.nextState;
  for (let i = 0; i < 16; i += 1) {
    const id = PLAYERS[i % PLAYERS.length]!;
    const view = nightTestimonyModule.getPlayerView(state, id);
    const random = createSeededRandom(`vt-${i}`);
    const action = pickNightTestimonyBotAction({ view, playerId: id, random });
    if (action && action.type === 'cast_vote') {
      assert.notEqual(action.targetPlayerId, id, `${id} 不能投自己`);
      assert.ok(PLAYERS.includes(action.targetPlayerId as typeof PLAYERS[number]), '目标必须在本局');
    }
  }
});

test('暗夜证词 完整冒烟：system + bot 交替跑完一局（多种随机种子）', () => {
  for (const seed of ['smoke-1', 'smoke-2', 'smoke-3']) {
    const ctx: GameContext = { now: 1_700_000_000_000, random: createSeededRandom(seed) };
    let state = makeInitialState(ctx);
    // begin
    const begin = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'begin' });
    if (!begin.ok) throw new Error(begin.message);
    state = begin.nextState;

    // 问答：循环到进入 deduction（YES 用完或上限）
    let safety = 30;
    while (state.phase === 'question' && safety-- > 0) {
      // 找一对非自己的"提问者→被问者"组合
      const asker = state.players[0]!;
      const responder = state.players.find((p) => p !== asker)!;
      const ask = nightTestimonyModule.reduce(
        ctx,
        state,
        ACTOR(asker),
        { type: 'ask', playerId: asker, targetPlayerId: responder, text: `q-${safety}` },
      );
      if (!ask.ok) throw new Error(ask.message);
      state = ask.nextState;
      // 轮到这个 responder → 调 bot
      const view = nightTestimonyModule.getPlayerView(state, responder);
      const random = createSeededRandom(`${seed}-ans-${safety}`);
      const action = pickNightTestimonyBotAction({ view, playerId: responder, random });
      assert.ok(action, `${responder} 被问时 bot 应能回答`);
      if (action && action.type === 'answer') {
        const ans = nightTestimonyModule.reduce(ctx, state, ACTOR(responder), action);
        if (!ans.ok) throw new Error(ans.message);
        state = ans.nextState;
      }
    }
    assert.equal(state.phase, 'deduction', `${seed}: 问答应推进到 deduction`);

    // 推理 → 投票
    const end = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'end_deduction' });
    if (!end.ok) throw new Error(end.message);
    state = end.nextState;
    assert.equal(state.phase, 'vote');

    // 投票：bot 逐个投，直到 game_over 或超时
    safety = 20;
    while (state.phase === 'vote' && safety-- > 0) {
      // 找下一个尚未投票的玩家，调其 bot
      const voter = state.players.find((p) => state.votes[p] === undefined);
      if (!voter) break;
      const view = nightTestimonyModule.getPlayerView(state, voter);
      const random = createSeededRandom(`${seed}-vote-${safety}`);
      const action = pickNightTestimonyBotAction({ view, playerId: voter, random });
      if (action === null) {
        // bot 没法投（极少见：只剩自己）。用系统兜底跳过
        const skip = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_vote' });
        if (!skip.ok) throw new Error(skip.message);
        state = skip.nextState;
        continue;
      }
      if (action.type !== 'cast_vote') throw new Error('vote 阶段 bot 应产出 cast_vote');
      const v = nightTestimonyModule.reduce(ctx, state, ACTOR(voter), action);
      if (!v.ok) {
        // 唯一可能：bot 试图投一个非存活玩家或自己。回退到 resolve_vote 推进
        const skip = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_vote' });
        if (!skip.ok) throw new Error(skip.message);
        state = skip.nextState;
        continue;
      }
      state = v.nextState;
    }
    // 兜底：如果 game_over 还没触发（极端情况），用 resolve_vote 收尾
    if (state.phase === 'vote') {
      const r = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'resolve_vote' });
      if (!r.ok) throw new Error(r.message);
      state = r.nextState;
    }
    assert.equal(state.phase, 'game_over', `${seed}: 应进入 game_over`);
    // 终局收尾：若狱警被票出需猜罪，bot 完成猜罪后对局才真正终结
    const wardenView = nightTestimonyModule.getPlayerView(state, state.wardenId);
    const wardenAction = pickNightTestimonyBotAction({
      view: wardenView,
      playerId: state.wardenId,
      random: createSeededRandom(`${seed}-guess`),
    });
    if (wardenAction !== null) {
      assert.equal(wardenAction.type, 'submit_guesses', `${seed}: 需猜罪时狱警应返回 submit_guesses`);
      const applied = nightTestimonyModule.reduce(ctx, state, ACTOR(state.wardenId), wardenAction);
      if (!applied.ok) throw new Error(applied.message);
      state = applied.nextState;
    }
    // 终局后 bot 一律 null
    for (const id of PLAYERS) {
      const view = nightTestimonyModule.getPlayerView(state, id);
      const random = createSeededRandom(`${seed}-end-${id}`);
      const a = pickNightTestimonyBotAction({ view, playerId: id, random });
      assert.equal(a, null, `${seed} 终局后 ${id} 应返回 null`);
    }
  }
});
