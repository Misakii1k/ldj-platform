/**
 * 伪人测试舞台纯函数测试（交接计划 2026-09-26-echo-judge-visual）。
 * 覆盖：演出事件推导（T0 lastVerdict 触发）、座位分边（T1）、隐私（T4）、宣判序列（T5）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerdictBanner,
  buildVerdictLedger,
  buildVerdictSequence,
  deriveStageEvents,
  type StageEvent,
} from '../src/game/echo-judge/stage/deriveStageEvents.ts';
import {
  answeredSeatIds,
  rotatedSpeakingOrder,
  splitPews,
} from '../src/game/echo-judge/stage/CourtSeats.tsx';
import type { EchoJudgeLastVerdict, EchoJudgePlayerView } from '../src/game/echo-judge/types.ts';

const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f'];

function makeView(patch: Partial<EchoJudgePlayerView> = {}): EchoJudgePlayerView {
  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_v1',
    schemaVersion: 1,
    phase: 'judge_setup',
    players: [...PLAYERS],
    round: 1,
    judgeId: 'a',
    question: '',
    topicCardId: null,
    currentSpeakerId: null,
    allAnswered: false,
    answeredCount: 0,
    accusations: null,
    caughtImpostors: null,
    escapedImpostors: null,
    scores: Object.fromEntries(PLAYERS.map((id) => [id, 0])),
    winners: [],
    deadlineAt: null,
    reveal: null,
    lastVerdict: null,
    me: null,
    ...patch,
  };
}

function verdict(round: number): EchoJudgeLastVerdict {
  return {
    round,
    judgeId: 'a',
    accusations: ['b', 'c'],
    caught: ['b'],
    wrong: ['c'],
    escaped: ['e'],
    scoreDelta: { a: 0, b: -1, e: 2 },
  };
}

function kinds(events: StageEvent[]): string[] {
  return events.map((e) => e.kind);
}

test('T0 answering → judgment 不再误触发 verdictDelivered', () => {
  const prev = makeView({ phase: 'answering', currentSpeakerId: 'f', allAnswered: false, answeredCount: 4 });
  const next = makeView({
    phase: 'judgment',
    currentSpeakerId: null,
    allAnswered: true,
    answeredCount: 5,
    accusations: [],
    caughtImpostors: [],
    escapedImpostors: [],
    deadlineAt: 123,
  });
  const events = deriveStageEvents(prev, next);
  assert.equal(kinds(events).includes('verdictDelivered'), false);
  assert.ok(kinds(events).includes('judgmentStarted'));
});

test('T0 lastVerdict.round 变化触发 verdictDelivered，数据取自快照', () => {
  // 中途轮次：accuse 后阶段直接是下一轮 judge_setup
  const prev = makeView({ phase: 'judgment', accusations: [], caughtImpostors: [], escapedImpostors: [] });
  const next = makeView({ phase: 'judge_setup', round: 2, judgeId: 'b', lastVerdict: verdict(1) });
  const events = deriveStageEvents(prev, next);
  const delivered = events.find((e) => e.kind === 'verdictDelivered');
  assert.ok(delivered && delivered.kind === 'verdictDelivered');
  assert.equal(delivered.round, 1);
  assert.deepEqual(delivered.accusations, ['b', 'c']);
  assert.deepEqual(delivered.caught, ['b']);
  assert.deepEqual(delivered.wrong, ['c']);
  assert.deepEqual(delivered.escaped, ['e']);
  assert.deepEqual(delivered.scoreDelta, { a: 0, b: -1, e: 2 });
  // 同一快照再来一帧不重复触发
  assert.equal(kinds(deriveStageEvents(next, next)).includes('verdictDelivered'), false);
});

test('T0 终局帧也触发 verdictDelivered（lastVerdict 覆盖到最后一轮）', () => {
  const prev = makeView({ phase: 'judgment' });
  const next = makeView({ phase: 'game_over', winners: ['a'], lastVerdict: verdict(6) });
  const events = deriveStageEvents(prev, next);
  assert.ok(kinds(events).includes('verdictDelivered'));
  assert.ok(kinds(events).includes('gameOver'));
});

/* ── T1 座位分边 ──────────────────────────────────────────── */

test('T1 座位分边：从审判长下家起，前一半在左（6 人 / 9 人）', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  // 审判长在首位：下家 b 起，5 人旁听 → 左 3 右 2
  assert.deepEqual(rotatedSpeakingOrder(six, 'a'), ['b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(splitPews(six, 'a'), { left: ['b', 'c', 'd'], right: ['e', 'f'] });
  // 审判长在末位：绕回 a 起
  assert.deepEqual(rotatedSpeakingOrder(six, 'f'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(splitPews(six, 'f'), { left: ['a', 'b', 'c'], right: ['d', 'e'] });
  // 审判长在中间：从下家绕场一周
  assert.deepEqual(rotatedSpeakingOrder(six, 'c'), ['d', 'e', 'f', 'a', 'b']);
  const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const split = splitPews(nine, 'e');
  assert.deepEqual(split.left, ['f', 'g', 'h', 'i']);
  assert.deepEqual(split.right, ['a', 'b', 'c', 'd']);
  // 分边不丢人不重复，审判长不在旁听席
  const all = [...split.left, ...split.right];
  assert.equal(new Set(all).size, 8);
  assert.equal(all.includes('e'), false);
});

test('T1 已发言集合：与服务端 answerOrder 同形态（players 顺序去掉审判长）', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  // 审判长 c：服务端 answerOrder = [a,b,d,e,f]，答完 2 人 → a、b
  assert.deepEqual([...answeredSeatIds(six, 'c', 2)], ['a', 'b']);
  assert.deepEqual([...answeredSeatIds(six, 'a', 0)], []);
});

/* ── T5 宣判序列与文案 ────────────────────────────────────── */

const nameOf = (id: string) => `玩家${id}`;

test('T5 翻面序列：被指认者按指认顺序先翻，漏网伪人随后浮出', () => {
  const seq = buildVerdictSequence(verdict(1));
  assert.deepEqual(seq, [
    { id: 'b', kind: 'caught' },
    { id: 'c', kind: 'wrong' },
    { id: 'e', kind: 'escaped' },
  ]);
});

test('T5 告示牌四种情形 + 账单与 scoreDelta 一致', () => {
  // mixed：抓对 1 + 冤枉 1 + 漏网 1
  assert.deepEqual(buildVerdictBanner(verdict(1), nameOf), {
    kind: 'caught',
    title: '抓到 1 个伪人',
    sub: '还有 1 个伪人漏网 · 冤枉了 1 个人类',
  });
  // 全抓到
  const all: EchoJudgeLastVerdict = { round: 1, judgeId: 'a', accusations: ['b'], caught: ['b'], wrong: [], escaped: [], scoreDelta: { a: 1, b: -1 } };
  assert.equal(buildVerdictBanner(all, nameOf).title, '伪人全部落网！');
  // 没指认但有伪人漏网
  const none: EchoJudgeLastVerdict = { round: 1, judgeId: 'a', accusations: [], caught: [], wrong: [], escaped: ['e'], scoreDelta: { a: 0, e: 2 } };
  assert.equal(buildVerdictBanner(none, nameOf).title, '伪人全员潜伏成功');
  // 0 伪人且未指认
  const clean: EchoJudgeLastVerdict = { round: 1, judgeId: 'a', accusations: [], caught: [], wrong: [], escaped: [], scoreDelta: { a: 1 } };
  assert.equal(buildVerdictBanner(clean, nameOf).title, '明察秋毫');
  // 场上本无伪人但冤枉了人
  const wrongOnly: EchoJudgeLastVerdict = { round: 1, judgeId: 'a', accusations: ['c'], caught: [], wrong: ['c'], escaped: [], scoreDelta: { a: -1 } };
  assert.equal(buildVerdictBanner(wrongOnly, nameOf).title, '场上本无伪人');

  // 账单：审判长一行 + 被抓 + 逃脱，分差直接取 scoreDelta
  const ledger = buildVerdictLedger(verdict(1));
  assert.deepEqual(ledger, [
    { id: 'a', why: '抓对 1 · 冤枉 1', delta: 0 },
    { id: 'b', why: '伪人被抓', delta: -1 },
    { id: 'e', why: '伪人逃脱', delta: 2 },
  ]);
});

test('T4/T5 隐私：宣判数据只含 id 与分差，不含触发词字段', () => {
  const v = verdict(1);
  const json = JSON.stringify({
    seq: buildVerdictSequence(v),
    banner: buildVerdictBanner(v, nameOf),
    ledger: buildVerdictLedger(v),
  });
  assert.equal(json.includes('triggerWord'), false);
  assert.equal(json.includes('暗号'), false);
});
