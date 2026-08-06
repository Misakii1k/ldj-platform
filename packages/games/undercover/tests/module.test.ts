/**
 * 谁是卧底模块测试：不变量（SPEC §6.10）+ 阶段流转 + 边界补遗（D-1~D-4、D-7）+ 确定性重放。
 * 全部走纯函数接口，不触碰数据库/网络。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, type Actor, type GameContext } from '@ldj/shared';
import { undercoverModule } from '../server/module.ts';
import { undercoverStateSchema, type UndercoverState } from '../server/state.ts';

const T0 = 1_700_000_000_000;

/** 界内取值助手：测试内索引已知有效，收敛 noUncheckedIndexedAccess 的 undefined */
function at(arr: readonly string[], i: number): string {
  const v = arr[i];
  assert.ok(v !== undefined, `索引越界：${i}`);
  return v;
}

/** 可控测试驱动：种子化随机 + 手动推进的时钟 */
class Driver {
  state: UndercoverState;
  now = T0;
  readonly random;

  constructor(seed: string, playerCount: number, cursor = 0) {
    this.random = createSeededRandom(seed, cursor);
    const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
    const config = undercoverModule.parseConfig({});
    this.state = undercoverModule.createInitialState(this.ctx(), players, config);
  }

  ctx(): GameContext {
    return { now: this.now, random: this.random };
  }

  /** 执行动作并断言成功，返回事件与效果 */
  ok(actor: Actor, action: unknown) {
    const parsed = undercoverModule.parseAction(action);
    const r = undercoverModule.reduce(this.ctx(), this.state, actor, parsed);
    assert.ok(r.ok, `期望成功，实际失败：${JSON.stringify(r)}（action=${JSON.stringify(action)}）`);
    this.state = r.state;
    return r;
  }

  /** 执行动作并断言被拒绝 */
  fail(actor: Actor, action: unknown, code = 'ACTION_NOT_ALLOWED') {
    const parsed = undercoverModule.parseAction(action);
    const r = undercoverModule.reduce(this.ctx(), this.state, actor, parsed);
    assert.ok(!r.ok, `期望失败，实际成功（action=${JSON.stringify(action)}）`);
    assert.equal(r.code, code);
    return r;
  }

  player(id: string): Actor {
    return { kind: 'player', playerId: id };
  }

  system(): Actor {
    return { kind: 'system', source: 'timer' };
  }

  /** begin + 全员确认看词 → speaking */
  toSpeaking() {
    this.ok(this.system(), { type: 'begin' });
    for (const id of this.aliveIds()) this.ok(this.player(id), { type: 'confirm_word' });
    assert.equal(this.state.phase, 'speaking');
  }

  /** 所有存活者依序结束发言 → voting */
  speakAll() {
    while (this.state.phase === 'speaking') {
      const speaker = at(this.state.speakingOrder, this.state.currentSpeakerIndex);
      this.ok(this.player(speaker), { type: 'finish_speech' });
    }
    assert.equal(this.state.phase, 'voting');
  }

  /** 按投票表投票（键为投票者，值为目标）；留空者不投 */
  castVotes(votes: Record<string, string>) {
    for (const [voter, target] of Object.entries(votes)) {
      this.ok(this.player(voter), { type: 'cast_vote', targetPlayerId: target });
    }
  }

  /** 触发投票超时结算 */
  voteTimeout() {
    const kind = this.state.phase === 'runoff_voting' ? 'runoff' : 'normal';
    this.ok(this.system(), { type: 'vote_timeout', round: this.state.round, kind });
  }

  /** VOTE_RESULT 展示期结束 */
  resultElapsed() {
    assert.equal(this.state.phase, 'vote_result');
    this.ok(this.system(), { type: 'vote_result_elapsed', round: this.state.round });
  }

  aliveIds(): string[] {
    return Object.entries(this.state.players)
      .filter(([, p]) => p.alive)
      .sort(([, a], [, b]) => a.seat - b.seat)
      .map(([id]) => id);
  }

  undercoverIds(): string[] {
    return Object.entries(this.state.players)
      .filter(([, p]) => p.role === 'undercover')
      .map(([id]) => id);
  }

  civilianIds(): string[] {
    return Object.entries(this.state.players)
      .filter(([, p]) => p.role === 'civilian')
      .map(([id]) => id);
  }
}

// —— 初始状态不变量（§6.10） ——

test('初始状态：角色分配与人数规则、席位唯一、schema 有效', () => {
  for (let n = 4; n <= 12; n++) {
    for (const seed of ['a', 'b', 'c']) {
      const d = new Driver(`${seed}:${n}`, n);
      const s = d.state;
      undercoverStateSchema.parse(s);
      assert.equal(Object.keys(s.players).length, n);
      const undercover = d.undercoverIds().length;
      assert.equal(undercover, n >= 8 ? 2 : 1, `${n} 人应有 ${n >= 8 ? 2 : 1} 卧底`);
      const seats = new Set(Object.values(s.players).map((p) => p.seat));
      assert.equal(seats.size, n);
      assert.notEqual(s.civilianWord, s.undercoverWord);
      assert.equal(s.phase, 'word_reveal');
      assert.equal(s.deadlineAt, null);
    }
  }
});

test('初始状态：人数越界与重复玩家被拒绝', () => {
  const random = createSeededRandom('x');
  const config = undercoverModule.parseConfig({});
  assert.throws(() => undercoverModule.createInitialState({ now: T0, random }, ['a', 'b', 'c'], config));
  assert.throws(() =>
    undercoverModule.createInitialState({ now: T0, random }, Array.from({ length: 13 }, (_, i) => `p${i}`), config),
  );
  assert.throws(() =>
    undercoverModule.createInitialState({ now: T0, random }, ['a', 'a', 'b', 'c'], config),
  );
});

// —— 看词阶段（§6.3） ——

test('看词：全员确认立即进入发言；重复确认幂等；超时兜底', () => {
  const d = new Driver('reveal', 5);
  d.ok(d.system(), { type: 'begin' });
  assert.ok(d.state.deadlineAt !== null);
  // begin 重复投递幂等
  const before = d.state;
  d.ok(d.system(), { type: 'begin' });
  assert.deepEqual(d.state, before);

  const ids = d.aliveIds();
  const firstId = at(ids, 0);
  d.ok(d.player(firstId), { type: 'confirm_word' });
  d.ok(d.player(firstId), { type: 'confirm_word' }); // 幂等
  assert.equal(d.state.confirmedPlayerIds.filter((x) => x === firstId).length, 1);
  for (const id of ids.slice(1)) d.ok(d.player(id), { type: 'confirm_word' });
  assert.equal(d.state.phase, 'speaking');
  assert.equal(d.state.round, 1);

  // 另一局走超时路径
  const d2 = new Driver('reveal2', 4);
  d2.ok(d2.system(), { type: 'begin' });
  d2.ok(d2.system(), { type: 'reveal_timeout' });
  assert.equal(d2.state.phase, 'speaking');
});

// —— 发言阶段（§6.4 + §6.10 顺序不变量） ——

test('发言：顺序无重复且覆盖全部存活者；非当前发言者被拒；超时自动推进', () => {
  const d = new Driver('speak', 6);
  d.toSpeaking();
  const order = d.state.speakingOrder;
  assert.equal(new Set(order).size, order.length);
  assert.deepEqual([...order].sort(), [...d.aliveIds()].sort());

  const [first, second] = [at(order, 0), at(order, 1)];
  d.fail(d.player(second), { type: 'finish_speech' }); // 不轮到
  d.ok(d.player(first), { type: 'finish_speech' });
  assert.equal(d.state.currentSpeakerIndex, 1);
  // 迟到的旧计时器无效果
  const snap = JSON.stringify(d.state);
  d.ok(d.system(), { type: 'speech_timeout', round: 1, speakerIndex: 0 });
  assert.equal(JSON.stringify(d.state), snap);
  // 当前发言者超时推进
  d.ok(d.system(), { type: 'speech_timeout', round: 1, speakerIndex: 1 });
  assert.equal(d.state.currentSpeakerIndex, 2);
  // 剩余全部发言完进入投票
  while (d.state.phase === 'speaking') {
    const sp = at(d.state.speakingOrder, d.state.currentSpeakerIndex);
    d.ok(d.player(sp), { type: 'finish_speech' });
  }
  assert.equal(d.state.phase, 'voting');
});

// —— 投票（§6.5 + D-4 锁定） ——

test('投票：禁自投、锁定不可改、目标须存活、每人一票', () => {
  const d = new Driver('vote-rules', 4);
  d.toSpeaking();
  d.speakAll();
  const ids = d.aliveIds();
  const [a, b, c] = [at(ids, 0), at(ids, 1), at(ids, 2)];
  d.fail(d.player(a), { type: 'cast_vote', targetPlayerId: a }); // 自投
  d.ok(d.player(a), { type: 'cast_vote', targetPlayerId: b });
  d.fail(d.player(a), { type: 'cast_vote', targetPlayerId: c }); // 已锁定
  assert.equal(d.state.votes[a], b);
  d.fail(d.player(a), { type: 'cast_vote', targetPlayerId: b }); // 重复也拒（requestId 幂等在平台层）
});

test('投票：唯一最高票被淘汰并公开阵营；全员提交提前结算', () => {
  const d = new Driver('vote-elim', 5);
  d.toSpeaking();
  d.speakAll();
  const ids = d.aliveIds();
  const target = at(ids, 0);
  const others = ids.filter((x) => x !== target);
  // 其他 4 人全投 target；target 投别人
  d.castVotes({ [target]: at(others, 0) });
  for (const v of others) d.castVotes({ [v]: target });
  // 全员已投 → 提前结算进入 vote_result
  assert.equal(d.state.phase, 'vote_result');
  assert.equal(d.state.lastVoteSummary?.outcome, 'eliminated');
  assert.equal(d.state.lastVoteSummary?.eliminatedPlayerId, target);
  assert.equal(d.state.players[target]?.alive, false);
  assert.equal(d.state.players[target]?.exitReason, 'voted_out');
  assert.equal(d.state.lastVoteSummary?.eliminatedRole, d.state.players[target]?.role);
});

test('投票：全员弃票 → 无人淘汰直接进下一轮（D-1）', () => {
  const d = new Driver('vote-none', 4);
  d.toSpeaking();
  d.speakAll();
  d.voteTimeout(); // 无任何选票
  assert.equal(d.state.phase, 'vote_result');
  assert.equal(d.state.lastVoteSummary?.outcome, 'no_votes');
  d.resultElapsed();
  assert.equal(d.state.phase, 'speaking');
  assert.equal(d.state.round, 2);
});

test('下一轮首位发言者 = 上轮首位之后的下一名存活玩家（§6.1）', () => {
  const d = new Driver('rotate', 4);
  d.toSpeaking();
  const firstOfRound1 = d.state.roundFirstSpeaker;
  assert.ok(firstOfRound1);
  d.speakAll();
  d.voteTimeout();
  d.resultElapsed();
  assert.equal(d.state.round, 2);
  const alive = d.aliveIds();
  const idx = alive.indexOf(firstOfRound1);
  const expected = alive[(idx + 1) % alive.length];
  assert.equal(d.state.roundFirstSpeaker, expected);
});

// —— 加赛（§6.6 + D-2） ——

test('平票 → 一次加赛；加赛唯一最高票淘汰；加赛只能投候选人', () => {
  const d = new Driver('runoff', 6);
  d.toSpeaking();
  d.speakAll();
  const ids = d.aliveIds();
  const [x, y] = [at(ids, 0), at(ids, 1)];
  // 制造 x/y 平票（各 3 票，6 人互投）
  d.castVotes({
    [at(ids, 2)]: x,
    [at(ids, 3)]: x,
    [y]: x,
    [at(ids, 4)]: y,
    [at(ids, 5)]: y,
    [x]: y,
  });
  assert.equal(d.state.phase, 'vote_result');
  assert.equal(d.state.lastVoteSummary?.outcome, 'tie');
  d.resultElapsed();
  assert.equal(d.state.phase, 'runoff_voting');
  assert.deepEqual([...d.state.runoffCandidates].sort(), [x, y].sort());
  // 加赛不能投非候选人
  d.fail(d.player(at(ids, 2)), { type: 'cast_vote', targetPlayerId: at(ids, 3) });
  // 候选人不能投自己，但可投其他候选人
  d.fail(d.player(x), { type: 'cast_vote', targetPlayerId: x });
  d.ok(d.player(x), { type: 'cast_vote', targetPlayerId: y });
  d.ok(d.player(at(ids, 2)), { type: 'cast_vote', targetPlayerId: y });
  d.voteTimeout();
  assert.equal(d.state.lastVoteSummary?.outcome, 'eliminated');
  assert.equal(d.state.lastVoteSummary?.eliminatedPlayerId, y);
});

test('加赛再次平票 → 本轮无人淘汰（D-2），每轮最多一次加赛', () => {
  const d = new Driver('runoff-tie', 6);
  d.toSpeaking();
  d.speakAll();
  const ids = d.aliveIds();
  const [x, y] = [at(ids, 0), at(ids, 1)];
  d.castVotes({ [at(ids, 2)]: x, [at(ids, 3)]: y });
  d.voteTimeout();
  d.resultElapsed();
  assert.equal(d.state.phase, 'runoff_voting');
  // 加赛再平：x、y 各 1 票
  d.castVotes({ [at(ids, 4)]: x, [at(ids, 5)]: y });
  d.voteTimeout();
  assert.equal(d.state.lastVoteSummary?.outcome, 'runoff_tie');
  d.resultElapsed();
  assert.equal(d.state.phase, 'speaking'); // 不再二次加赛
  assert.equal(d.state.round, 2);
  assert.equal(d.aliveIds().length, 6);
});

// —— 胜负判定（§6.8） ——

test('淘汰唯一卧底 → 平民胜利；game_over 后动作全部无效（§6.10）', () => {
  const d = new Driver('civ-win', 4);
  d.toSpeaking();
  d.speakAll();
  const spy = at(d.undercoverIds(), 0);
  const civs = d.civilianIds();
  for (const v of civs) d.castVotes({ [v]: spy });
  d.castVotes({ [spy]: at(civs, 0) });
  assert.equal(d.state.pendingOutcome?.next, 'game_over');
  d.resultElapsed();
  assert.equal(d.state.phase, 'game_over');
  assert.equal(d.state.winner, 'civilian');
  const result = undercoverModule.getResult(d.state);
  assert.equal(result?.winner, 'civilian');
  // game_over 后玩家动作被拒、系统动作无变化
  d.fail(d.player(at(civs, 0)), { type: 'finish_speech' });
  const snap = JSON.stringify(d.state);
  d.ok(d.system(), { type: 'vote_timeout', round: d.state.round, kind: 'normal' });
  assert.equal(JSON.stringify(d.state), snap);
});

test('卧底数 ≥ 平民数 → 卧底胜利', () => {
  const d = new Driver('spy-win', 4); // 1 卧底 3 平民
  d.toSpeaking();
  d.speakAll();
  const spy = at(d.undercoverIds(), 0);
  const civs = d.civilianIds();
  const [c0, c1, c2] = [at(civs, 0), at(civs, 1), at(civs, 2)];
  // 淘汰一名平民 → 1 卧底 vs 2 平民，继续
  for (const v of [spy, c1, c2]) d.castVotes({ [v]: c0 });
  d.castVotes({ [c0]: spy });
  d.resultElapsed();
  assert.equal(d.state.phase, 'speaking');
  d.speakAll();
  // 再淘汰一名平民 → 1 卧底 vs 1 平民 → 卧底胜
  d.castVotes({ [spy]: c1, [c2]: c1, [c1]: spy });
  assert.equal(d.state.pendingOutcome?.winner, 'undercover');
  d.resultElapsed();
  assert.equal(d.state.winner, 'undercover');
});

// —— 掉线超时（§6.7 + D-7） ——

test('批量 forfeit：先标记再统一判胜负；全员退出 → ABORTED 不虚构胜方', () => {
  const d = new Driver('forfeit', 5);
  d.toSpeaking();
  const civs = d.civilianIds();
  const [c0, c1, c2] = [at(civs, 0), at(civs, 1), at(civs, 2)];
  // 两名平民同一安全点超时退出（不足以分胜负：1 卧底 vs 2 平民）
  d.ok(d.system(), { type: 'player_forfeited', playerIds: [c0, c1] });
  assert.equal(d.state.players[c0]?.exitReason, 'disconnect_timeout');
  assert.equal(d.state.phase === 'game_over', false);
  // 已淘汰者不能恢复存活（§6.10）：重复 forfeit 无效果
  const snap = JSON.stringify(d.state);
  d.ok(d.system(), { type: 'player_forfeited', playerIds: [c0] });
  assert.equal(JSON.stringify(d.state), snap);
  // 剩余平民再退 → 卧底胜
  d.ok(d.system(), { type: 'player_forfeited', playerIds: [c2] });
  assert.equal(d.state.winner, 'undercover');

  // 全员同时退出 → ABORTED
  const d2 = new Driver('forfeit-all', 4);
  d2.toSpeaking();
  d2.ok(d2.system(), { type: 'player_forfeited', playerIds: d2.aliveIds() });
  assert.equal(d2.state.phase, 'game_over');
  assert.equal(d2.state.winner, null);
  assert.equal(d2.state.aborted, true);
});

test('当前发言者 forfeit → 自动推进；投票期已锁选票不作废（D-4）', () => {
  const d = new Driver('forfeit-speaker', 5);
  d.toSpeaking();
  const speaker = at(d.state.speakingOrder, 0);
  d.ok(d.system(), { type: 'player_forfeited', playerIds: [speaker] });
  if (d.state.phase === 'speaking') {
    const cur = at(d.state.speakingOrder, d.state.currentSpeakerIndex);
    assert.ok(d.state.players[cur]?.alive);
    assert.notEqual(cur, speaker);
  }
  // 投票期：先投票再 forfeit，选票仍计入结算
  const d2 = new Driver('forfeit-vote', 5);
  d2.toSpeaking();
  d2.speakAll();
  const ids = d2.aliveIds();
  const [v0, v1] = [at(ids, 0), at(ids, 1)];
  d2.castVotes({ [v0]: v1 });
  d2.ok(d2.system(), { type: 'player_forfeited', playerIds: [v0] });
  d2.voteTimeout();
  assert.equal(d2.state.lastVoteSummary?.tally[v1], 1); // 锁定选票有效
});

// —— 视角（§6.9 + §6.10 泄密不变量） ——

test('玩家视角：看得到自己的词，看不到他人角色/词语；淘汰者公开阵营', () => {
  const d = new Driver('views', 5);
  d.toSpeaking();
  const spy = at(d.undercoverIds(), 0);
  const civ = at(d.civilianIds(), 0);
  const beforeViewBuild = structuredClone(d.state);

  const civView = undercoverModule.getPlayerView(d.state, civ);
  const unknownView = undercoverModule.getPlayerView(d.state, 'not-seated');
  assert.deepEqual(d.state, beforeViewBuild);
  assert.equal(civView.me?.word, d.state.civilianWord);
  assert.equal(civView.me?.role, null); // 存活期间不直接显示阵营
  assert.equal(unknownView.me, null);
  assert.ok(civView.players.every((p) => p.revealedRole === null));
  assert.equal(civView.reveal, null);
  assert.deepEqual(Object.keys(civView).slice(0, -1), [
    'phase',
    'round',
    'players',
    'speakingOrder',
    'currentSpeakerId',
    'deadlineAt',
    'votesSubmitted',
    'votesExpected',
    'runoffCandidates',
    'confirmedPlayerIds',
    'lastVoteSummary',
    'winner',
    'aborted',
    'reveal',
  ]);
  assert.equal(Object.keys(civView).at(-1), 'me');
  assert.deepEqual(Object.keys(civView.players[0]!), [
    'playerId',
    'seat',
    'alive',
    'exitReason',
    'revealedRole',
  ]);
  assert.deepEqual(Object.keys(civView.me!), [
    'playerId',
    'word',
    'role',
    'alive',
    'confirmed',
    'hasVoted',
    'myVote',
  ]);
  // 平民视角序列化后不得出现卧底词
  assert.ok(!JSON.stringify(civView).includes(d.state.undercoverWord));

  const spyView = undercoverModule.getPlayerView(d.state, spy);
  assert.equal(spyView.me?.word, d.state.undercoverWord);
  assert.ok(!JSON.stringify(spyView).includes(d.state.civilianWord));

  // 观战视角：无词语、无角色、无 me 字段
  const specView = undercoverModule.getSpectatorView(d.state);
  const specJson = JSON.stringify(specView);
  assert.equal('me' in specView, false);
  assert.deepEqual(Object.keys(specView), Object.keys(civView).slice(0, -1));
  assert.ok(!specJson.includes(d.state.civilianWord));
  assert.ok(!specJson.includes(d.state.undercoverWord));
  assert.equal(specJson.includes('pendingOutcome'), false);
  assert.equal(specJson.includes('"votes"'), false);

  // 淘汰后：公开其阵营但不公开词语；本人可见自己阵营
  d.ok(d.system(), { type: 'player_forfeited', playerIds: [civ] });
  const afterView = undercoverModule.getPlayerView(d.state, spy);
  const civEntry = afterView.players.find((p) => p.playerId === civ);
  assert.equal(civEntry?.revealedRole, 'civilian');
  const deadView = undercoverModule.getPlayerView(d.state, civ);
  assert.equal(deadView.me?.role, 'civilian');
  if (d.state.phase !== 'game_over') {
    assert.ok(!JSON.stringify(deadView).includes(d.state.undercoverWord)); // 已淘汰仍看不到他人秘密
  }
});

test('游戏结束：全部公开（阵营 + 双词）', () => {
  const d = new Driver('views-over', 4);
  d.toSpeaking();
  const civs = d.civilianIds();
  d.ok(d.system(), { type: 'player_forfeited', playerIds: civs });
  assert.equal(d.state.phase, 'game_over');
  const spec = undercoverModule.getSpectatorView(d.state);
  assert.equal(spec.reveal?.civilianWord, d.state.civilianWord);
  assert.equal(spec.reveal?.undercoverWord, d.state.undercoverWord);
  assert.equal(Object.keys(spec.reveal?.roles ?? {}).length, 4);
});

// —— 纯函数与确定性（§6.10 重放一致） ——

test('reduce 不修改传入状态对象', () => {
  const d = new Driver('immutable', 4);
  const before = JSON.stringify(d.state);
  const frozen = d.state;
  const r = undercoverModule.reduce(d.ctx(), frozen, d.system(), undercoverModule.parseAction({ type: 'begin' }));
  assert.ok(r.ok);
  assert.equal(JSON.stringify(frozen), before);
});

test('确定性重放：相同种子 + 相同动作序列 → 最终状态一致', () => {
  const run = (): string => {
    const d = new Driver('replay-seed', 6);
    d.toSpeaking();
    d.speakAll();
    const ids = d.aliveIds();
    const t = at(ids, 0);
    d.castVotes({ [at(ids, 1)]: t, [at(ids, 2)]: t, [at(ids, 3)]: t, [at(ids, 4)]: t });
    d.voteTimeout();
    if (d.state.phase === 'vote_result') d.resultElapsed();
    return JSON.stringify(d.state) + `#cursor=${d.random.getCursor()}`;
  };
  assert.equal(run(), run());
});

test('随机源：相同 (seed, cursor) 序列一致，快进可续接', () => {
  const a = createSeededRandom('s1');
  const seq = [a.nextInt(0, 100), a.nextInt(0, 100), a.nextInt(0, 100)];
  const b = createSeededRandom('s1');
  assert.deepEqual([b.nextInt(0, 100), b.nextInt(0, 100), b.nextInt(0, 100)], seq);
  // 从 cursor=2 恢复，第三个值应与 seq[2] 一致
  const c = createSeededRandom('s1', 2);
  assert.equal(c.nextInt(0, 100), seq[2]);
  assert.equal(c.getCursor(), 3);
});
