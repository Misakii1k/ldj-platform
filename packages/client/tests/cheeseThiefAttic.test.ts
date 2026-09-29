/**
 * 奶酪大盗「阁楼世界」纯模型单测（atticModel.ts）。
 * 契约依据：docs/plans/2026-09-29-cheese-thief-visual/README.md §1.2 / §1.4。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheeseThiefPlayerView } from '../src/game/cheese-thief/types.ts';
import {
  atticTimeFor,
  awakeSeatIds,
  cheeseSightFor,
  isAutoStealDue,
  isRollScene,
  nightNotice,
  rollValuesFor,
  seatToneIndex,
  splitSeats,
  timelineRows,
  verdictCopy,
  votedSeatIds,
  voteStats,
} from '../src/game/cheese-thief/stage/atticModel.ts';

const P = ['p1', 'p2', 'p3', 'p4', 'p5'];

function makeView(overrides: {
  phase?: CheeseThiefPlayerView['phase'];
  currentHour?: number;
  cheeseStolen?: boolean;
  votes?: CheeseThiefPlayerView['votes'];
  thiefCaught?: boolean | null;
  winners?: string[];
  reveal?: CheeseThiefPlayerView['reveal'];
  me?: Partial<NonNullable<CheeseThiefPlayerView['me']>> | null;
}): CheeseThiefPlayerView {
  const meOver = overrides.me === null ? null : overrides.me ?? {};
  return {
    gameId: 'cheese-thief',
    rulesetId: 'cheese_thief_classic_v1',
    schemaVersion: 1,
    phase: overrides.phase ?? 'night',
    players: [...P],
    cheeseStolen: overrides.cheeseStolen ?? false,
    mode: 'standard',
    currentHour: overrides.currentHour ?? 3,
    roleCardsEnabled: false,
    revealedCat: null,
    revealedDog: null,
    dogFirstVoter: null,
    thiefCaught: overrides.thiefCaught ?? null,
    winners: overrides.winners ?? [],
    deadlineAt: null,
    votes: overrides.votes ?? null,
    reveal: overrides.reveal ?? null,
    me: meOver === null
      ? null
      : {
          playerId: 'p2',
          wakeHour: 3,
          hourChoices: null,
          coWakers: [],
          cheeseWasMissing: false,
          isThief: false,
          isAccomplice: false,
          knownAccomplices: [],
          roleCard: 'none',
          canPeek: false,
          peekedHour: null,
          catPeekedHour: null,
          hasVoted: false,
          ...meOver,
        },
  };
}

test('昼夜：night/hour_choice/accomplice_select 为夜，dawn/vote/game_over 为昼', () => {
  assert.equal(atticTimeFor('hour_choice'), 'night');
  assert.equal(atticTimeFor('night'), 'night');
  assert.equal(atticTimeFor('accomplice_select'), 'night');
  assert.equal(atticTimeFor('dawn'), 'day');
  assert.equal(atticTimeFor('vote'), 'day');
  assert.equal(atticTimeFor('game_over'), 'day');
});

test('席位分列：左列前 ceil(n/2)，右列其余', () => {
  assert.deepEqual(splitSeats(P), { left: ['p1', 'p2', 'p3'], right: ['p4', 'p5'] });
  assert.deepEqual(splitSeats(['a', 'b', 'c', 'd']), { left: ['a', 'b'], right: ['c', 'd'] });
  assert.deepEqual(splitSeats(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).left.length, 4);
});

test('老鼠色：你是 m1，其余按座次取 m2..m8', () => {
  assert.equal(seatToneIndex(P, 'p2', 'p2'), 1);
  assert.equal(seatToneIndex(P, 'p1', 'p2'), 2);
  assert.equal(seatToneIndex(P, 'p3', 'p2'), 3);
  assert.equal(seatToneIndex(P, 'p5', 'p2'), 5);
  // 我在末尾时，前面的人依次 m2..m5
  assert.equal(seatToneIndex(P, 'p1', 'p5'), 2);
  assert.equal(seatToneIndex(P, 'p4', 'p5'), 5);
  assert.equal(seatToneIndex(P, 'p5', 'p5'), 1);
});

test('醒来高亮：只在轮到我时，标我 + 同醒者', () => {
  const v = makeView({ currentHour: 3, me: { wakeHour: 3, coWakers: ['p4'] } });
  assert.deepEqual([...awakeSeatIds(v, 'p2')].sort(), ['p2', 'p4']);
  assert.equal(awakeSeatIds(makeView({ currentHour: 2, me: { wakeHour: 3 } }), 'p2').size, 0);
  assert.equal(awakeSeatIds(makeView({ phase: 'dawn', currentHour: 0 }), 'p2').size, 0);
  assert.equal(awakeSeatIds(makeView({ me: null }), null).size, 0);
});

test('奶酪可见性：没轮到我时按在场渲染（防泄露几点被偷）', () => {
  // 我 5 点醒，现在 3 点，奶酪其实已被偷——我的屏幕仍显示奶酪在
  const v = makeView({ currentHour: 3, cheeseStolen: true, me: { wakeHour: 5 } });
  assert.equal(cheeseSightFor(v, 'p2'), 'on-board');
});

test('奶酪可见性：正在醒来时显示真实状态', () => {
  assert.equal(cheeseSightFor(makeView({ currentHour: 3, cheeseStolen: false }), 'p2'), 'on-board');
  assert.equal(
    cheeseSightFor(makeView({ currentHour: 3, cheeseStolen: true, me: { wakeHour: 3, isThief: true } }), 'p2'),
    'with-me',
  );
  assert.equal(
    cheeseSightFor(makeView({ currentHour: 3, cheeseStolen: true, me: { wakeHour: 3 } }), 'p2'),
    'missing',
  );
});

test('奶酪可见性：醒过后冻结在醒来时所见', () => {
  // 我 2 点醒时奶酪还在；3 点被别人偷走——我的屏幕保持「在」
  const v = makeView({ currentHour: 4, cheeseStolen: true, me: { wakeHour: 2, cheeseWasMissing: false } });
  assert.equal(cheeseSightFor(v, 'p2'), 'on-board');
  // 我 4 点醒时已经没了——保持「空」
  const v2 = makeView({ currentHour: 5, cheeseStolen: true, me: { wakeHour: 4, cheeseWasMissing: true } });
  assert.equal(cheeseSightFor(v2, 'p2'), 'missing');
  // 我是大盗——奶酪在我手里
  const v3 = makeView({ currentHour: 5, cheeseStolen: true, me: { wakeHour: 3, isThief: true } });
  assert.equal(cheeseSightFor(v3, 'p2'), 'with-me');
});

test('奶酪可见性：天亮后按真实状态；观战者实时', () => {
  assert.equal(cheeseSightFor(makeView({ phase: 'dawn', currentHour: 0, cheeseStolen: true }), 'p2'), 'missing');
  assert.equal(cheeseSightFor(makeView({ phase: 'dawn', currentHour: 0, cheeseStolen: false }), 'p2'), 'on-board');
  assert.equal(
    cheeseSightFor(makeView({ phase: 'night', currentHour: 3, cheeseStolen: true, me: null }), null),
    'missing',
  );
});

test('自动偷：独醒且奶酪在场才触发', () => {
  assert.equal(isAutoStealDue(makeView({ currentHour: 3 }), 'p2'), true);
  assert.equal(isAutoStealDue(makeView({ currentHour: 3, cheeseStolen: true }), 'p2'), false);
  assert.equal(isAutoStealDue(makeView({ currentHour: 3, me: { wakeHour: 3, coWakers: ['p4'] } }), 'p2'), false);
  assert.equal(isAutoStealDue(makeView({ currentHour: 2 }), 'p2'), false);
  assert.equal(isAutoStealDue(makeView({ currentHour: 0 }), 'p2'), false);
  assert.equal(isAutoStealDue(makeView({ phase: 'dawn', currentHour: 0 }), 'p2'), false);
  assert.equal(isAutoStealDue(makeView({ me: null }), null), false);
});

test('② 掷骰数据：4 人局两骰候选，5–8 人局开局窗口一颗（纯演出）', () => {
  // 4 人局 hour_choice：两颗候选
  const four = rollValuesFor(makeView({ phase: 'hour_choice', currentHour: 0, me: { wakeHour: 0, hourChoices: [2, 4] } }));
  assert.deepEqual(four, { values: [2, 4], fourPick: true });
  // 5–8 人局 night 第 0 时刻：一颗（服务器已定）
  const single = rollValuesFor(makeView({ phase: 'night', currentHour: 0, me: { wakeHour: 3 } }));
  assert.deepEqual(single, { values: [3], fourPick: false });
  // 夜中非开局 / 白天 / 观战者：无掷骰画面
  assert.equal(rollValuesFor(makeView({ phase: 'night', currentHour: 3 })), null);
  assert.equal(rollValuesFor(makeView({ phase: 'dawn', currentHour: 0 })), null);
  assert.equal(rollValuesFor(makeView({ phase: 'night', currentHour: 0, me: null })), null);
  assert.equal(isRollScene(makeView({ phase: 'night', currentHour: 0, me: { wakeHour: 3 } })), true);
  assert.equal(isRollScene(makeView({ phase: 'vote', currentHour: 0 })), false);
});

test('掷骰画面与自动偷互不触发（hour_choice / 第 0 时刻不自动偷）', () => {
  assert.equal(isAutoStealDue(makeView({ phase: 'hour_choice', currentHour: 0, me: { wakeHour: 0, hourChoices: [2, 4] } })), false);
  assert.equal(isAutoStealDue(makeView({ phase: 'night', currentHour: 0, me: { wakeHour: 3 } })), false);
});

test('夜间告示牌文案状态机', () => {
  const nameOf = (id: string) => id;
  // 开局窗口
  assert.equal(nightNotice(makeView({ currentHour: 0 }), 'p2', nameOf).title, '记住你的点数');
  // 没轮到我
  assert.equal(nightNotice(makeView({ currentHour: 2, me: { wakeHour: 3 } }), 'p2', nameOf).title, '夜深了……');
  // 我独醒、奶酪在
  assert.equal(nightNotice(makeView({ currentHour: 3 }), 'p2', nameOf).title, '你独自醒来了');
  // 我偷到了
  assert.equal(
    nightNotice(makeView({ currentHour: 3, cheeseStolen: true, me: { wakeHour: 3, isThief: true } }), 'p2', nameOf).title,
    '奶酪到手，别出声',
  );
  // 我醒来时已经没了
  assert.equal(
    nightNotice(makeView({ currentHour: 3, cheeseStolen: true, me: { wakeHour: 3, cheeseWasMissing: true } }), 'p2', nameOf).title,
    '奶酪不见了！',
  );
  // 同醒
  const co = nightNotice(makeView({ currentHour: 3, me: { wakeHour: 3, coWakers: ['p4', 'p5'] } }), 'p2', nameOf);
  assert.equal(co.title, '你们同时醒来了');
  assert.ok(co.caption.includes('p4'));
});

test('投票：已投集合只看键；终局票数并列最高一起出局', () => {
  const voting = makeView({
    phase: 'vote',
    currentHour: 0,
    votes: { p1: { kind: 'accuse', targetPlayerId: 'p2' }, p3: { kind: 'abstain' } },
  });
  assert.deepEqual([...votedSeatIds(voting)].sort(), ['p1', 'p3']);

  const over = makeView({
    phase: 'game_over',
    currentHour: 0,
    votes: {
      p1: { kind: 'accuse', targetPlayerId: 'p2' },
      p2: { kind: 'accuse', targetPlayerId: 'p4' },
      p3: { kind: 'accuse', targetPlayerId: 'p2' },
      p4: { kind: 'accuse', targetPlayerId: 'p4' },
      p5: { kind: 'abstain' },
    },
  });
  const stats = voteStats(over);
  assert.equal(stats.counts['p2'], 2);
  assert.equal(stats.maxVotes, 2);
  assert.deepEqual([...stats.eliminated].sort(), ['p2', 'p4']);

  // 全弃票 → 无人出局
  const allAbstain = makeView({
    phase: 'game_over',
    currentHour: 0,
    votes: Object.fromEntries(P.map((id) => [id, { kind: 'abstain' as const }])),
  });
  assert.deepEqual(voteStats(allAbstain).eliminated, []);
});

test('三结局文案', () => {
  const reveal = { thiefId: 'p2', stealHour: 3, wakeHours: {}, accomplices: [], peeks: [] };
  assert.deepEqual(verdictCopy(makeView({ phase: 'game_over', currentHour: 0, thiefCaught: true, reveal })), {
    when: '大盗被投出',
    title: '村民胜！',
  });
  assert.deepEqual(verdictCopy(makeView({ phase: 'game_over', currentHour: 0, thiefCaught: false, reveal })), {
    when: '投错了人',
    title: '大盗胜！',
  });
  assert.deepEqual(
    verdictCopy(makeView({ phase: 'game_over', currentHour: 0, thiefCaught: false, reveal: null })),
    { when: '没人偷走奶酪', title: '平安夜！' },
  );
});

test('时间线：按点数聚合，偷走/偷看/同醒/没人醒；skip_peek（target=自己）不算偷看', () => {
  const wakeHours = { p1: 5, p2: 3, p3: 1, p4: 1, p5: 6 };
  const reveal = {
    thiefId: 'p2',
    stealHour: 3,
    wakeHours,
    accomplices: [],
    peeks: [
      { viewer: 'p1', target: 'p3' }, // 5 点真偷看
      { viewer: 'p5', target: 'p5' }, // 6 点 skip_peek
    ],
  };
  const rows = timelineRows(reveal, P, (id) => id);
  assert.equal(rows.length, 6);
  assert.equal(rows[0]!.kind, 'multi'); // 1 点 p3+p4
  assert.equal(rows[1]!.kind, 'none'); // 2 点没人
  assert.equal(rows[2]!.kind, 'steal'); // 3 点 p2 偷走
  assert.equal(rows[3]!.kind, 'none'); // 4 点没人
  assert.equal(rows[4]!.kind, 'peek'); // 5 点 p1 偷看
  assert.equal(rows[5]!.kind, 'solo'); // 6 点 p5 跳过偷看 → 独醒
  assert.deepEqual(rows[0]!.names.sort(), ['p3', 'p4']);
});
