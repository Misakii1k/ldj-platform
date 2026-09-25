/**
 * T01：一智千金客户端严格视角 parser 测试。
 *
 * 契约修订 C01：parser 住在客户端侧，与服务端 views.ts 结构重复，
 * 因此这里既测失败关闭，也钉死 02 §3 的视角白名单字段，
 * 供 T04 写服务端 views 时做对拍基准。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWitsWagersView,
  breakdownNotes,
  formatMoney,
  targetLabel,
  YUAN_PER_POINT,
} from '../src/game/wits-wagers/types.ts';

// —— 固定 fixture：假题、假玩家，绝不引用生产题库 ——

function publicView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_platform_v1',
    viewVersion: 1,
    phase: 'betting',
    round: 2,
    totalRounds: 7,
    phaseEpoch: 5,
    roundToken: 'a3f9c1',
    deadlineAt: 1_700_000_030_000,
    question: { prompt: '测试题面：某条河流长度？', unit: '千米' },
    players: [
      { playerId: 'p1', score: 10, winningGuesses: 1, hasSubmitted: true, forfeited: false },
      { playerId: 'p2', score: 0, winningGuesses: 0, hasSubmitted: true, forfeited: false },
    ],
    board: [
      { id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] },
      { id: 'g:300', value: 300, slot: 'L1', odds: 3, authors: ['p1'] },
      { id: 'g:900', value: 900, slot: 'R1', odds: 3, authors: ['p2'] },
    ],
    publicBets: {
      p1: [
        { chipId: 'A', targetId: 'g:300', extraStake: 4 },
        { chipId: 'B', targetId: null, extraStake: 0 },
      ],
    },
    revealed: null,
    history: [],
    result: null,
    ...overrides,
  };
}

function meBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    playerId: 'p1',
    submittedGuess: { value: 300, origin: 'submitted' },
    guessRevision: 1,
    acceptedBets: [
      { chipId: 'A', targetId: 'g:300', extraStake: 4 },
      { chipId: 'B', targetId: null, extraStake: 0 },
    ],
    betRevision: 2,
    reserved: 4,
    available: 6,
    canGuess: false,
    canBet: true,
    ...overrides,
  };
}

const playerView = (o: Record<string, unknown> = {}, me: Record<string, unknown> | null = meBlock()) =>
  ({ ...publicView(o), me });

// —— 正常路径 ——

test('合法玩家视角解析通过并保留白名单字段', () => {
  const parsed = parseWitsWagersView(playerView(), 'player');
  assert.ok(parsed, '合法视角不应被拒绝');
  assert.equal(parsed.phase, 'betting');
  assert.equal(parsed.totalRounds, 7);
  assert.equal(parsed.board.length, 3); // lower + 两个数值槽
  assert.equal(parsed.me?.reserved, 4);
  assert.equal(parsed.me?.available, 6);
  // reserved + available 必须等于 score，parser 不负责纠正但要原样透出供 UI 校验。
  assert.equal(parsed.me!.reserved + parsed.me!.available, 10);
});

test('观战视角必须无 me 键（不是 me:null）', () => {
  const spectator = publicView();
  const parsed = parseWitsWagersView(spectator, 'spectator');
  assert.ok(parsed);
  assert.equal('me' in parsed, false);
  // 带 me 的负载走观战角色必须失败关闭。
  assert.equal(parseWitsWagersView({ ...spectator, me: null }, 'spectator'), null);
});

test('非参赛者 me:null 合法（02 §3：不抛私密 State）', () => {
  const parsed = parseWitsWagersView(playerView({}, null), 'player');
  assert.ok(parsed);
  assert.equal(parsed.me, null);
});

test('玩家角色缺少 me 键失败关闭', () => {
  assert.equal(parseWitsWagersView(publicView(), 'player'), null);
});

// —— 版本与身份 ——

test('未知版本/游戏/规则集一律拒绝', () => {
  assert.equal(parseWitsWagersView(playerView({ viewVersion: 2 }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ viewVersion: '1' }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ gameId: 'wits_wagers' }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ rulesetId: 'wits_wagers_v1' }), 'player'), null);
});

test('非对象输入不被当作合法视角', () => {
  for (const bad of [null, undefined, 42, 'view', [], true]) {
    assert.equal(parseWitsWagersView(bad, 'player'), null, `${String(bad)} 不应通过`);
  }
});

// —— 未知键：泄露的主要载体 ——

test('任何多余键失败关闭（防服务端误加字段泄露）', () => {
  assert.equal(parseWitsWagersView(playerView({ correctAnswer: 300 }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ questionPlan: [] }), 'player'), null);
  const extraMe = parseWitsWagersView(playerView({}, meBlock({ bankVersion: 3 })), 'player');
  assert.equal(extraMe, null);
});

test('题面对象只允许 prompt/unit，不得夹带答案或来源', () => {
  assert.equal(
    parseWitsWagersView(playerView({ question: { prompt: 'x', unit: 'km', answer: 300 } }), 'player'),
    null,
  );
  assert.equal(
    parseWitsWagersView(playerView({ question: { prompt: 'x', unit: 'km', sourceUrl: 'https://e.x' } }), 'player'),
    null,
  );
  assert.equal(parseWitsWagersView(playerView({ question: { prompt: 'x' } }), 'player'), null);
});

test('board 目标只允许白名单键', () => {
  const board = [{ id: 'g:300', value: 300, slot: 'L1', odds: 3, authors: ['p1'], answer: 300 }];
  assert.equal(parseWitsWagersView(playerView({ board }), 'player'), null);
});

// —— 数值语义 ——

test('拒绝非安全整数与非法数值', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      parseWitsWagersView(playerView({ round: bad }), 'player'),
      null,
      `round=${String(bad)} 不应通过`,
    );
  }
  assert.equal(parseWitsWagersView(playerView({}, meBlock({ reserved: -1 })), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({}, meBlock({ available: 1.5 })), 'player'), null);
});

test('猜测值必须是 1..999999999999 的正整数（G0 P7）', () => {
  const ok = parseWitsWagersView(playerView({}, meBlock({ submittedGuess: { value: 999_999_999_999, origin: 'submitted' } })), 'player');
  assert.ok(ok);
  for (const bad of [0, -5, 1_000_000_000_000, 1.5]) {
    assert.equal(
      parseWitsWagersView(playerView({}, meBlock({ submittedGuess: { value: bad, origin: 'submitted' } })), 'player'),
      null,
      `guess=${String(bad)} 不应通过`,
    );
  }
});

test('guess origin 只允许 submitted（超时补答已废除）', () => {
  const ok = parseWitsWagersView(playerView({}, meBlock({ submittedGuess: { value: 1, origin: 'submitted' } })), 'player');
  assert.ok(ok);
  assert.equal(
    parseWitsWagersView(playerView({}, meBlock({ submittedGuess: { value: 1, origin: 'timeout' } })), 'player'),
    null,
  );
});

test('赔率只允许查表内的 2/3/4/5/6', () => {
  for (const odds of [2, 3, 4, 5, 6]) {
    const board = [{ id: 'g:1', value: 1, slot: 'C', odds, authors: ['p1'] }];
    assert.ok(parseWitsWagersView(playerView({ board }), 'player'), `odds=${odds} 应通过`);
  }
  for (const odds of [0, 1, 7, 2.5, -3]) {
    const board = [{ id: 'g:1', value: 1, slot: 'C', odds, authors: ['p1'] }];
    assert.equal(parseWitsWagersView(playerView({ board }), 'player'), null, `odds=${odds} 不应通过`);
  }
});

// —— 结构不变量 ——

test('BetPair 必须恰好 A 后 B 两项', () => {
  const one = { p1: [{ chipId: 'A', targetId: null, extraStake: 0 }] };
  assert.equal(parseWitsWagersView(playerView({ publicBets: one }), 'player'), null);
  const reversed = {
    p1: [
      { chipId: 'B', targetId: null, extraStake: 0 },
      { chipId: 'A', targetId: null, extraStake: 0 },
    ],
  };
  assert.equal(parseWitsWagersView(playerView({ publicBets: reversed }), 'player'), null, '逆序应拒绝');
  const dup = {
    p1: [
      { chipId: 'A', targetId: null, extraStake: 0 },
      { chipId: 'A', targetId: null, extraStake: 0 },
    ],
  };
  assert.equal(parseWitsWagersView(playerView({ publicBets: dup }), 'player'), null, '重复 chipId 应拒绝');
});

test('未放置筹码的 extraStake 必须为 0（01 §4 账本前提）', () => {
  const bad = {
    p1: [
      { chipId: 'A', targetId: null, extraStake: 3 },
      { chipId: 'B', targetId: null, extraStake: 0 },
    ],
  };
  assert.equal(parseWitsWagersView(playerView({ publicBets: bad }), 'player'), null);
});

test('targetId 形状必须是 lower 或 g:<正整数>', () => {
  for (const good of ['lower', 'g:1', 'g:999999999999']) {
    const bets = { p1: [{ chipId: 'A', targetId: good, extraStake: 0 }, { chipId: 'B', targetId: null, extraStake: 0 }] };
    assert.ok(parseWitsWagersView(playerView({ publicBets: bets }), 'player'), `${good} 应通过`);
  }
  // higher 是已删除的旧边缘槽，服务端若还发出来必须失败关闭
  for (const bad of ['g:', 'g:0', 'g:-1', 'g:1.5', 'G:1', 'lower ', 'g:01', 'smaller', 'other', 'higher']) {
    const bets = { p1: [{ chipId: 'A', targetId: bad, extraStake: 0 }, { chipId: 'B', targetId: null, extraStake: 0 }] };
    assert.equal(parseWitsWagersView(playerView({ publicBets: bets }), 'player'), null, `${bad} 不应通过`);
  }
});

test('phase 与 slot 只接受登记值', () => {
  for (const phase of ['created', 'answering', 'arranging', 'betting', 'settlement', 'game_over']) {
    assert.ok(parseWitsWagersView(playerView({ phase }), 'player'), `${phase} 应通过`);
  }
  assert.equal(parseWitsWagersView(playerView({ phase: 'waiting' }), 'player'), null);
  const board = [{ id: 'g:1', value: 1, slot: 'L4', odds: 3, authors: [] }];
  assert.equal(parseWitsWagersView(playerView({ board }), 'player'), null);
});

test('totalRounds 固定为 7，round 不得超出 0..7', () => {
  assert.equal(parseWitsWagersView(playerView({ totalRounds: 5 }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ round: 8 }), 'player'), null);
  assert.ok(parseWitsWagersView(playerView({ round: 0, phase: 'created' }), 'player'));
});

test('边缘槽必须无数值、无作者、赔率为 6，槽位名要对得上', () => {
  const bad = [
    // 边缘槽带了数值
    [{ id: 'lower', value: 5, slot: 'LOWER', odds: 6, authors: [] }],
    // 边缘槽带了作者
    [{ id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: ['p1'] }],
    // 边缘槽赔率被改
    [{ id: 'lower', value: null, slot: 'LOWER', odds: 3, authors: [] }],
    // id 与槽位名错配
    [{ id: 'lower', value: null, slot: 'L1', odds: 6, authors: [] }],
    // 已删除的 higher 卡整张混进来
    [{ id: 'higher', value: null, slot: 'HIGHER', odds: 6, authors: [] }],
    // 数值槽却占用了边缘槽位名
    [{ id: 'g:1', value: 1, slot: 'LOWER', odds: 2, authors: [] }],
  ];
  for (const board of bad) {
    assert.equal(parseWitsWagersView(playerView({ board }), 'player'), null, JSON.stringify(board));
  }
});

test('deadlineAt 可为 null，但不接受非整数', () => {
  assert.ok(parseWitsWagersView(playerView({ deadlineAt: null, phase: 'game_over' }), 'player'));
  assert.equal(parseWitsWagersView(playerView({ deadlineAt: 1.5 }), 'player'), null);
});

test('history 长度不得超过 7', () => {
  const entry = publicView().board;
  const long = Array.from({ length: 8 }, () => ({ round: 1, board: entry }));
  assert.equal(parseWitsWagersView(playerView({ history: long }), 'player'), null);
});

// —— 解析结果隔离 ——

test('parser 返回副本，改动结果不回写输入', () => {
  const input = playerView();
  const parsed = parseWitsWagersView(input, 'player');
  assert.ok(parsed);
  parsed.board.push({ id: 'g:7', value: 7, slot: 'C', odds: 2, authors: [] });
  assert.equal((input.board as unknown[]).length, 3, 'parser 不得返回输入数组的引用');
});

// —— T04 冻结：revealed/history/result 严格白名单与对拍测试 ——

function sampleRoundResult(): Record<string, unknown> {
  return {
    round: 1,
    question: {
      id: 'q1',
      prompt: '某山海拔？',
      unit: '米',
      answer: 8848,
      sourceUrl: 'https://example.com',
      sourceNote: '官方地理公报',
      asOf: '2024',
      explanation: '珠穆朗玛峰海拔。',
      reviewed: true,
    },
    board: [
      { id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] },
      { id: 'g:8000', value: 8000, slot: 'C', odds: 2, authors: ['p1'] },
    ],
    bets: {
      p1: [
        { chipId: 'A', targetId: 'g:8000', extraStake: 0 },
        { chipId: 'B', targetId: null, extraStake: 0 },
      ],
    },
    winningTargetIds: ['g:8000'],
    awardedAuthors: ['p1'],
    ledger: [
      {
        playerId: 'p1',
        scoreBefore: 0,
        reserved: 0,
        winProfit: 2,
        loss: 0,
        authorBonus: 3,
        scoreAfter: 5,
      },
    ],
  };
}

function sampleFinalResult(): Record<string, unknown> {
  return {
    rankings: [
      { playerId: 'p1', score: 20, winningGuesses: 2, rank: 1 },
      { playerId: 'p2', score: 10, winningGuesses: 1, rank: 2 },
    ],
    winners: ['p1'],
    roundsPlayed: 7,
  };
}

test('revealed/history 严格白名单：合法结构通过，任何未知键或非法字段失败关闭', () => {
  const good = sampleRoundResult();
  assert.ok(parseWitsWagersView(playerView({ revealed: good, history: [good] }), 'player'));

  // 未知键失败关闭
  assert.equal(parseWitsWagersView(playerView({ revealed: { ...good, extraSecret: true } }), 'player'), null);

  // question 中含有未知键或缺少 reviewed
  const badQ = { ...(good.question as Record<string, unknown>), reviewed: false };
  assert.equal(parseWitsWagersView(playerView({ revealed: { ...good, question: badQ } }), 'player'), null);

  // answer 必须为正整数
  const badAnswer = { ...(good.question as Record<string, unknown>), answer: 0 };
  assert.equal(parseWitsWagersView(playerView({ revealed: { ...good, question: badAnswer } }), 'player'), null);

  // winningTargetIds 必须是合法 id 的数组，最多两项（等距双胜）
  assert.equal(parseWitsWagersView(playerView({ revealed: { ...good, winningTargetIds: 'g:8000' } }), 'player'), null);
  assert.equal(parseWitsWagersView(playerView({ revealed: { ...good, winningTargetIds: ['invalid'] } }), 'player'), null);
  assert.equal(
    parseWitsWagersView(playerView({ revealed: { ...good, winningTargetIds: ['g:8000', 'lower', 'g:1'] } }), 'player'),
    null,
  );
  // 空数组（全员未作答作废轮）与双胜都合法
  assert.ok(parseWitsWagersView(playerView({ revealed: { ...good, winningTargetIds: [] } }), 'player'));
  assert.ok(parseWitsWagersView(playerView({ revealed: { ...good, winningTargetIds: ['lower', 'g:8000'] } }), 'player'));
});

test('result 严格白名单：合法结构通过，未知键或非法名次失败关闭', () => {
  const goodResult = sampleFinalResult();
  assert.ok(parseWitsWagersView(playerView({ result: goodResult, phase: 'game_over' }), 'player'));

  // 未知键
  assert.equal(parseWitsWagersView(playerView({ result: { ...goodResult, extraKey: 123 }, phase: 'game_over' }), 'player'), null);

  // roundsPlayed 不为 7
  assert.equal(parseWitsWagersView(playerView({ result: { ...goodResult, roundsPlayed: 6 }, phase: 'game_over' }), 'player'), null);

  // 名次小于 1
  const badRankings = [{ playerId: 'p1', score: 20, winningGuesses: 2, rank: 0 }];
  assert.equal(parseWitsWagersView(playerView({ result: { ...goodResult, rankings: badRankings }, phase: 'game_over' }), 'player'), null);
});

// —— 钞票展示层：服务端算分，桌面摆钞票（1 分 = ¥100） ——

test('formatMoney: 积分按 1 分 = ¥100 换算并加千分位', () => {
  assert.equal(formatMoney(0), '¥0');
  assert.equal(formatMoney(3), '¥300');
  assert.equal(formatMoney(13), '¥1,300');
  assert.equal(formatMoney(1234), '¥123,400');
});

test('breakdownNotes: 贪心拆张，张数最少且总额守恒', () => {
  assert.deepEqual(breakdownNotes(0), []);
  assert.deepEqual(breakdownNotes(-5), [], '负分不产生钞票');
  assert.deepEqual(breakdownNotes(1), [100]);
  assert.deepEqual(breakdownNotes(2), [200]);
  assert.deepEqual(breakdownNotes(3), [200, 100], '¥300 是两张，不是三张一百');
  assert.deepEqual(breakdownNotes(13), [1000, 200, 100]);
  assert.deepEqual(breakdownNotes(17), [1000, 500, 200]);
  assert.deepEqual(breakdownNotes(23), [1000, 1000, 200, 100]);

  // 总额必须等于积分换算后的金额，且只用登记面值
  for (const points of [1, 2, 7, 23, 46, 99, 137]) {
    const notes = breakdownNotes(points);
    const sum = notes.reduce((a, b) => a + b, 0);
    assert.equal(sum, points * YUAN_PER_POINT, `${points} 分拆张后总额不守恒`);
    assert.ok(notes.every((n) => [100, 200, 500, 1000].includes(n)));
  }
});

test('targetLabel: 边缘槽用中文，数值槽用千分位', () => {
  assert.equal(targetLabel({ id: 'lower', value: null }), '更低');
  assert.equal(targetLabel({ id: 'g:8000', value: 8000 }), '8,000');
  assert.equal(targetLabel(null), '未知槽位');
  assert.equal(targetLabel(undefined), '未知槽位');
});
