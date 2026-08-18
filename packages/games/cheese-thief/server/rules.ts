import type { GameEffect } from '@ldj/shared';
import { parseCheeseThiefAction, parseCheeseThiefConfig } from './schemas.ts';
import {
  DIE_SIDES,
  NIGHT_END_HOUR,
  type AccompliceRule,
  type CheeseThiefAction,
  type CheeseThiefEvent,
  type CheeseThiefReduceResult,
  type CheeseThiefState,
  type ResolvedCheeseThiefConfig,
  type RoleCard,
} from './types.ts';

/** 掷骰/随机选择源（与 GameContext.random 同形，便于测试注入） */
export interface DieRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
}

export interface ReduceCtx {
  now: number;
  random: DieRandom;
}

const deny = (message: string): CheeseThiefReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: CheeseThiefState): CheeseThiefReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

function nightTimer(config: ResolvedCheeseThiefConfig, now: number, hour: number): GameEffect {
  return {
    type: 'schedule_timer',
    timerId: `night-${hour}`,
    deadlineAt: now + config.nightHourSeconds * 1000,
    action: { type: 'advance_night', hour },
  };
}

/** 每人私密掷 6 面骰，决定醒来时刻（1–6） */
export function rollWakeHours(
  players: readonly string[],
  random: DieRandom,
): Record<string, number> {
  return Object.fromEntries(players.map((id) => [id, random.nextInt(1, DIE_SIDES + 1)]));
}

/** 4 人局变体：每人私密掷两枚骰，自选其一作为醒来时刻 */
export function rollHourChoices(
  players: readonly string[],
  random: DieRandom,
): Record<string, [number, number]> {
  return Object.fromEntries(
    players.map((id) => [id, [random.nextInt(1, DIE_SIDES + 1), random.nextInt(1, DIE_SIDES + 1)]]),
  );
}

/** 身份卡随机分配（启用 roleCards 时）：猫/狗/白老鼠各一张给随机互异玩家 */
export function assignRoleCards(
  players: readonly string[],
  random: DieRandom,
): Record<string, RoleCard | 'none'> {
  const roles: Record<string, RoleCard | 'none'> = Object.fromEntries(
    players.map((id) => [id, 'none' as const]),
  );
  const pool = [...players];
  const take = (): string => {
    const index = random.nextInt(0, pool.length);
    return pool.splice(index, 1)[0]!;
  };
  roles[take()] = 'cat';
  roles[take()] = 'dog';
  roles[take()] = 'whiteMouse';
  return roles;
}

export function accompliceRuleFor(state: CheeseThiefState): AccompliceRule {
  return state.config.accomplicesByPlayers[state.players.length] ?? { count: 0, known: false };
}

export function createCheeseThiefState(
  players: readonly string[],
  configInput: unknown = {},
  wakeHours: Record<string, number>,
  hourChoices: Record<string, [number, number]> | null = null,
  roleCards: Record<string, RoleCard | 'none'> | null = null,
): CheeseThiefState {
  if (players.length < 4 || players.length > 8) throw new Error('奶酪大盗需要 4 至 8 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  // module.createInitialState 传入的已是解析后 config（accomplicesByPlayers 为 number key），
  // 二次 parse 会因 schema 的 string key 规则失败——识别已解析形状直接使用。
  const config: ResolvedCheeseThiefConfig =
    typeof configInput === 'object' && configInput !== null && 'accomplicesByPlayers' in configInput
      ? (configInput as ResolvedCheeseThiefConfig)
      : parseCheeseThiefConfig(configInput);
  if (players.length > 4 && hourChoices) throw new Error('5–8 人局不提供两骰候选');
  for (const id of players) {
    if (hourChoices) {
      const pair = hourChoices[id];
      if (
        !pair ||
        pair.length !== 2 ||
        pair.some((h) => !Number.isInteger(h) || h < 1 || h > DIE_SIDES)
      ) {
        throw new Error('候选时刻无效');
      }
    } else {
      const hour = wakeHours[id];
      if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 1 || hour > DIE_SIDES) {
        throw new Error('醒来时刻无效');
      }
    }
  }
  const roleCardsResolved: Record<string, RoleCard | 'none'> = config.roleCards
    ? roleCards ??
      Object.fromEntries(players.map((id) => [id, 'none' as const]))
    : Object.fromEntries(players.map((id) => [id, 'none' as const]));
  if (config.roleCards) {
    for (const id of players) {
      if (roleCardsResolved[id] !== 'cat' && roleCardsResolved[id] !== 'dog' && roleCardsResolved[id] !== 'whiteMouse' && roleCardsResolved[id] !== 'none') {
        throw new Error('身份卡无效');
      }
    }
    const dealt = Object.values(roleCardsResolved).filter((r) => r !== 'none');
    // 原版身份卡为可选：允许 1–3 张，且每种最多一张。
    if (dealt.length < 1 || dealt.length > 3) throw new Error('身份卡数量无效');
    const kinds = ['cat', 'dog', 'whiteMouse'] as const;
    for (const kind of kinds) {
      if (dealt.filter((r) => r === kind).length > 1) throw new Error('身份卡种类重复');
    }
  }
  const state: CheeseThiefState = {
    schemaVersion: 1,
    phase: hourChoices ? 'hour_choice' : 'night',
    players: [...players],
    config,
    wakeHours: { ...wakeHours },
    hourChoices: hourChoices ? Object.fromEntries(Object.entries(hourChoices)) : null,
    currentHour: hourChoices ? 0 : 1,
    lastProcessedHour: 0,
    cheeseStolen: false,
    thiefId: null,
    stealHour: null,
    accomplices: [],
    accomplicesKnown: accompliceRuleFor({
      players: [...players],
      config,
    } as CheeseThiefState).known,
    peeks: [],
    roleCards: roleCardsResolved,
    catPeekTarget: null,
    dogFirstVoter: null,
    votes: {},
    eliminated: null,
    thiefCaught: null,
    winners: [],
  };
  assertCheeseThiefInvariants(state);
  return state;
}

/** 随机从非盗贼玩家中抽取 count 名共犯（不相识模式） */
function randomAccomplices(state: CheeseThiefState, count: number, random: DieRandom): string[] {
  const pool = state.players.filter((id) => id !== state.thiefId);
  const result: string[] = [];
  while (result.length < count && pool.length > 0) {
    const index = random.nextInt(0, pool.length);
    result.push(pool.splice(index, 1)[0]!);
  }
  return result;
}

/** 结算投票：并列最高票一并出局；白老鼠单独胜利优先；否则按大盗是否出局定胜负。 */
function resolveVote(
  state: CheeseThiefState,
  events: CheeseThiefEvent[],
  effects: GameEffect[],
): void {
  const counts: Record<string, number> = {};
  for (const vote of Object.values(state.votes)) {
    if (vote.kind === 'accuse') {
      counts[vote.targetPlayerId] = (counts[vote.targetPlayerId] ?? 0) + 1;
    }
  }
  const maxVotes = Math.max(0, ...state.players.map((id) => counts[id] ?? 0));
  // 平票一并出局：并列最高票的所有玩家；无人投票（全弃票）则无人出局。
  const eliminated =
    maxVotes === 0 ? [] : state.players.filter((id) => (counts[id] ?? 0) === maxVotes);

  let thiefCaught = state.thiefId !== null && eliminated.includes(state.thiefId);
  let winners: string[];
  if (state.thiefId === null) {
    // 整夜无人偷走奶酪：平台裁定为好人（村民）方获胜（全员）。
    thiefCaught = false;
    winners = [...state.players];
  } else {
    const whiteMouseId =
      Object.entries(state.roleCards).find(([, r]) => r === 'whiteMouse')?.[0] ?? null;
    if (whiteMouseId && eliminated.includes(whiteMouseId) && state.thiefId !== whiteMouseId) {
      // 白老鼠被投出 → 单独胜利（优先于其他判定）。
      thiefCaught = false;
      winners = [whiteMouseId];
    } else if (thiefCaught) {
      // 投中大盗 → 好人（村民）胜：除大盗与共犯外的全部玩家。
      winners = state.players.filter(
        (id) => id !== state.thiefId && !state.accomplices.includes(id),
      );
    } else {
      // 否则大盗 + 共犯胜。
      winners = [state.thiefId, ...state.accomplices];
    }
  }
  state.phase = 'game_over';
  state.eliminated = eliminated;
  state.thiefCaught = thiefCaught;
  state.winners = winners;
  events.push({ type: 'vote_resolved', eliminated, thiefCaught, winners });
  events.push({ type: 'game_finished', winners });
  effects.push(
    system(
      state.thiefId === null
        ? '整夜无人偷走奶酪，好人们守住了奶酪！'
        : thiefCaught
          ? '大盗被抓住了！'
          : '大盗逃之夭夭……',
    ),
  );
}

/** 夜间 6 点处理完毕后的衔接：按共犯配置进入选择或直接天亮；无盗贼时由投票结算为全员获胜。 */
function endNight(
  state: CheeseThiefState,
  events: CheeseThiefEvent[],
  effects: GameEffect[],
  ctx: ReduceCtx,
): void {
  state.currentHour = 0;
  const rule = accompliceRuleFor(state);
  if (state.thiefId !== null && rule.count > 0) {
    if (rule.known) {
      // 相识模式：进入共犯选择阶段，由大盗选择；超时自动选队首 N 人。
      state.phase = 'accomplice_select';
      events.push({ type: 'accomplice_select_started' });
      effects.push(system('大盗请选择你的共犯'));
      effects.push({
        type: 'schedule_timer',
        timerId: 'accomplice-select',
        deadlineAt: ctx.now + state.config.nightHourSeconds * 1000,
        action: { type: 'auto_select_accomplice' },
      });
      return;
    }
    // 不相识模式：服务器随机分配，无人知道完整名单。
    state.accomplices = randomAccomplices(state, rule.count, ctx.random);
    events.push({ type: 'accomplice_selected', accompliceIds: [...state.accomplices] });
  }
  enterDawn(state, events, effects, ctx);
}

function enterDawn(
  state: CheeseThiefState,
  events: CheeseThiefEvent[],
  effects: GameEffect[],
  ctx: ReduceCtx,
): void {
  state.phase = 'dawn';
  state.currentHour = 0;
  events.push({ type: 'night_finished' }, { type: 'discussion_started' });
  effects.push(system('天亮了，奶酪的踪迹只能靠讨论拼凑……'));
  effects.push({
    type: 'schedule_timer',
    timerId: 'discussion',
    deadlineAt: ctx.now + state.config.discussionSeconds * 1000,
    action: { type: 'end_discussion' },
  });
}

/** 该玩家当前是否可执行「偷看骰子」：轮到自己的时刻，若独醒即可查看场上任意一位玩家的骰子点数；若2人或以上同醒则无法查看 */
function canPeek(state: CheeseThiefState, playerId: string): boolean {
  if (state.phase !== 'night') return false;
  if (state.wakeHours[playerId] !== state.currentHour) return false;
  const solo = state.players.filter((id) => state.wakeHours[id] === state.currentHour).length === 1;
  if (!solo) return false;
  return !state.peeks.some((p) => p.viewer === playerId);
}

export function reduceCheeseThiefState(
  state: CheeseThiefState,
  actionInput: CheeseThiefAction | unknown,
  ctx: ReduceCtx,
): CheeseThiefReduceResult {
  let action: CheeseThiefAction;
  try {
    action = parseCheeseThiefAction(actionInput);
  } catch (error) {
    return deny(error instanceof Error ? error.message : '动作无效');
  }

  // 开局：4 人局进入两骰自选；否则直接进入夜晚第 1 时刻。
  if (action.type === 'begin') {
    if (state.phase === 'hour_choice') {
      return {
        ok: true,
        nextState: state,
        events: [{ type: 'hour_choice_started' }],
        effects: [
          system('每人掷出两枚骰子，请选择你的醒来时刻'),
          {
            type: 'schedule_timer',
            timerId: 'hour-choice',
            deadlineAt: ctx.now + state.config.hourChoiceSeconds * 1000,
            action: { type: 'resolve_hour_choice' },
          },
        ],
      };
    }
    return {
      ok: true,
      nextState: state,
      events: [],
      effects: [system('夜幕降临，各鼠暗自决定醒来时刻……'), nightTimer(state.config, ctx.now, 1)],
    };
  }
  if (state.phase === 'game_over') return idempotent(state);

  const next = structuredClone(state);
  const events: CheeseThiefEvent[] = [];
  const effects: GameEffect[] = [];

  // 玩家退出（系统动作，§6.7）：从局内移除；剩余玩家不足或关键角色退出 → 终局（剩余玩家获胜）
  if (action.type === 'player_forfeited') {
    const forfeited = action.playerIds.filter((id) => next.players.includes(id));
    if (forfeited.length === 0) return idempotent(state);
    for (const id of forfeited) {
      next.players = next.players.filter((p) => p !== id);
      delete next.wakeHours[id];
      delete next.votes[id];
    }
    if (next.players.length < 2 || next.thiefId === null || !next.players.includes(next.thiefId)) {
      // 大盗退出或玩家不足 → 剩余玩家获胜（中局结束）
      next.phase = 'game_over';
      next.currentHour = 0;
      next.thiefCaught = false;
      next.eliminated = [];
      next.winners = [...next.players];
      events.push({ type: 'vote_resolved', eliminated: [], thiefCaught: false, winners: [...next.players] });
      events.push({ type: 'game_finished', winners: [...next.players] });
      effects.push(system('玩家退出，对局结束'));
    }
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 4 人局：自选两骰之一
  if (action.type === 'choose_hour') {
    if (next.phase !== 'hour_choice') return deny('当前不能选择时刻');
    if (!next.hourChoices) return deny('当前不是两骰自选模式');
    if (!next.players.includes(action.playerId)) return deny('只有参局玩家可以操作');
    if (next.wakeHours[action.playerId] !== undefined) return deny('你已经选择过时刻');
    const pair = next.hourChoices[action.playerId]!;
    if (action.hour !== pair[0] && action.hour !== pair[1]) return deny('只能选择自己掷出的候选时刻');
    next.wakeHours[action.playerId] = action.hour;
    events.push({ type: 'hour_chosen', playerId: action.playerId });
    if (next.players.every((id) => next.wakeHours[id] !== undefined)) {
      next.phase = 'night';
      next.currentHour = 1;
      effects.push(system('夜幕降临，各鼠暗自决定醒来时刻……'), nightTimer(state.config, ctx.now, 1));
    }
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 4 人局超时兜底：未选择者取首候选
  if (action.type === 'resolve_hour_choice') {
    if (next.phase !== 'hour_choice') return idempotent(state);
    if (!next.hourChoices) return deny('当前不是两骰自选模式');
    for (const id of next.players) {
      if (next.wakeHours[id] === undefined) {
        next.wakeHours[id] = next.hourChoices[id]![0];
        events.push({ type: 'hour_chosen', playerId: id });
      }
    }
    next.phase = 'night';
    next.currentHour = 1;
    effects.push(system('夜幕降临，各鼠暗自决定醒来时刻……'), nightTimer(state.config, ctx.now, 1));
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 夜晚推进：处理 action.hour 时刻，并在该时刻窗口内保持 currentHour（供偷看/展示）
  if (action.type === 'advance_night') {
    // 幂等：已处理过该时刻（lastProcessedHour 推进）或已离开夜间 → 不重复处理
    if (next.phase !== 'night' || action.hour !== next.lastProcessedHour + 1) {
      return idempotent(state);
    }
    next.currentHour = action.hour;
    const wakers = next.players.filter((id) => next.wakeHours[id] === action.hour);
    if (!next.cheeseStolen && wakers.length === 1) {
      // 独醒且奶酪在场 → 取走奶酪成为大盗
      next.cheeseStolen = true;
      next.thiefId = wakers[0]!;
      next.stealHour = action.hour;
      events.push({ type: 'cheese_stolen', thiefId: next.thiefId, stealHour: action.hour });
    }
    next.lastProcessedHour = action.hour;
    events.push({ type: 'hour_revealed', hour: action.hour });
    if (action.hour === NIGHT_END_HOUR) {
      endNight(next, events, effects, ctx);
    } else {
      effects.push(nightTimer(state.config, ctx.now, action.hour + 1));
    }
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 独醒村民偷看他人骰子（奶酪已失后）
  if (action.type === 'peek_die') {
    if (!canPeek(next, action.playerId)) return deny('当前不能偷看骰子');
    if (!next.players.includes(action.targetPlayerId) || action.targetPlayerId === action.playerId) {
      return deny('目标无效');
    }
    next.peeks.push({ viewer: action.playerId, target: action.targetPlayerId });
    events.push({ type: 'peek_done', playerId: action.playerId });
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }
  if (action.type === 'skip_peek') {
    if (!canPeek(next, action.playerId)) return deny('当前不能偷看骰子');
    next.peeks.push({ viewer: action.playerId, target: action.playerId }); // 记录已处理（target=自己表示放弃）
    events.push({ type: 'peek_done', playerId: action.playerId });
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 共犯选择（相识模式）
  if (action.type === 'select_accomplice') {
    if (next.phase !== 'accomplice_select') return deny('当前不能选择共犯');
    const rule = accompliceRuleFor(next);
    if (!rule.known) return deny('本局共犯不相识，无需选择');
    if (action.playerId !== next.thiefId) return deny('只有大盗可以选择共犯');
    if (action.accompliceIds.length !== rule.count) return deny('共犯数量不符');
    if (new Set(action.accompliceIds).size !== action.accompliceIds.length) return deny('共犯不能重复');
    for (const id of action.accompliceIds) {
      if (!next.players.includes(id) || id === next.thiefId) return deny('共犯名单无效');
    }
    next.accomplices = [...action.accompliceIds];
    events.push({ type: 'accomplice_selected', accompliceIds: [...action.accompliceIds] });
    enterDawn(next, events, effects, ctx);
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 共犯选择超时兜底：自动选队首 N 人（系统动作）
  if (action.type === 'auto_select_accomplice') {
    if (next.phase !== 'accomplice_select') return idempotent(state);
    const rule = accompliceRuleFor(next);
    if (!rule.known) return idempotent(state);
    next.accomplices = next.players.filter((id) => id !== next.thiefId).slice(0, rule.count);
    events.push({ type: 'accomplice_selected', accompliceIds: [...next.accomplices] });
    enterDawn(next, events, effects, ctx);
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 天亮讨论结束 → 投票
  if (action.type === 'end_discussion') {
    if (next.phase !== 'dawn') return idempotent(state);
    next.phase = 'vote';
    events.push({ type: 'vote_started' });
    effects.push(system('请投票指认你怀疑的大盗，或选择弃票'));
    effects.push({
      type: 'schedule_timer',
      timerId: 'vote',
      deadlineAt: ctx.now + state.config.voteSeconds * 1000,
      action: { type: 'resolve_vote' },
    });
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 身份卡：猫（天亮展示并查看一名玩家骰子）
  if (action.type === 'reveal_cat') {
    if (next.phase !== 'dawn') return deny('猫只能在讨论阶段展示');
    if (next.roleCards[action.playerId] !== 'cat') return deny('你不是猫');
    if (next.catPeekTarget !== null) return deny('猫已经展示过');
    if (!next.players.includes(action.targetPlayerId) || action.targetPlayerId === action.playerId) {
      return deny('目标无效');
    }
    next.catPeekTarget = action.targetPlayerId;
    events.push({ type: 'cat_revealed', playerId: action.playerId });
    effects.push(system(`${action.playerId} 是猫！`));
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 身份卡：狗（天亮展示并指定一名玩家先投票）
  if (action.type === 'reveal_dog') {
    if (next.phase !== 'dawn') return deny('狗只能在讨论阶段展示');
    if (next.roleCards[action.playerId] !== 'dog') return deny('你不是狗');
    if (next.dogFirstVoter !== null) return deny('狗已经展示过');
    if (!next.players.includes(action.firstVoterId)) return deny('目标无效');
    next.dogFirstVoter = action.firstVoterId;
    events.push({ type: 'dog_revealed', playerId: action.playerId, firstVoterId: action.firstVoterId });
    effects.push(system(`${action.playerId} 是狗，${action.firstVoterId} 将率先投票`));
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 投票
  if (action.type === 'cast_vote' || action.type === 'cast_abstention') {
    if (next.phase !== 'vote') return deny('当前不能投票');
    const playerId = action.playerId;
    if (!next.players.includes(playerId)) return deny('只有参局玩家可以操作');
    if (next.votes[playerId] !== undefined) return deny('你已经投过票');
    if (action.type === 'cast_vote') {
      if (action.targetPlayerId === playerId) return deny('不能投给自己');
      if (!next.players.includes(action.targetPlayerId)) return deny('目标不在本局');
      next.votes[playerId] = { kind: 'accuse', targetPlayerId: action.targetPlayerId };
    } else {
      next.votes[playerId] = { kind: 'abstain' };
    }
    events.push({ type: 'vote_cast', playerId });
    if (next.players.every((id) => next.votes[id] !== undefined)) {
      resolveVote(next, events, effects);
    }
    assertCheeseThiefInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // resolve_vote（计时器或兜底）
  if (next.phase !== 'vote') return idempotent(state);
  resolveVote(next, events, effects);
  assertCheeseThiefInvariants(next);
  return { ok: true, nextState: next, events, effects };
}

export function assertCheeseThiefInvariants(state: CheeseThiefState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  // 玩家退出（player_forfeited）可致终局缩员：终局时允许少于最小人数（但 ≥1）
  if (
    (state.phase !== 'game_over' && (state.players.length < 4 || state.players.length > 8)) ||
    state.players.length < 1 ||
    new Set(state.players).size !== state.players.length
  ) {
    throw new Error('玩家列表无效');
  }
  if (state.phase === 'hour_choice') {
    if (!state.hourChoices || state.players.length !== 4) throw new Error('两骰自选阶段配置无效');
    for (const id of state.players) {
      const pair = state.hourChoices[id];
      if (!pair || pair.length !== 2 || pair.some((h) => h < 1 || h > DIE_SIDES)) {
        throw new Error('候选时刻无效');
      }
    }
  } else if (state.hourChoices) {
    // 非自选阶段已进入夜晚，wakeHours 应已填齐
  }
  if (state.phase !== 'hour_choice') {
    for (const id of state.players) {
      const hour = state.wakeHours[id];
      if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 1 || hour > DIE_SIDES) {
        throw new Error('醒来时刻无效');
      }
    }
  }
  if (state.cheeseStolen !== (state.thiefId !== null)) throw new Error('盗贼标记与奶酪状态不一致');
  if (state.thiefId !== null) {
    if (!state.players.includes(state.thiefId)) throw new Error('盗贼不在本局');
    if (
      state.stealHour === null ||
      !Number.isInteger(state.stealHour) ||
      state.stealHour < 1 ||
      state.stealHour > NIGHT_END_HOUR
    ) {
      throw new Error('盗取时刻无效');
    }
    if (state.wakeHours[state.thiefId] !== state.stealHour) throw new Error('盗贼醒来时刻与盗取时刻不一致');
  } else if (state.stealHour !== null) {
    throw new Error('未盗时盗取时刻必须为空');
  }
  for (const id of state.accomplices) {
    if (!state.players.includes(id) || id === state.thiefId) throw new Error('共犯名单无效');
  }
  if (new Set(state.accomplices).size !== state.accomplices.length) throw new Error('共犯不能重复');
  const rule = accompliceRuleFor(state);
  if (state.accomplices.length > rule.count) throw new Error('共犯数量超限');
  for (const peek of state.peeks) {
    if (!state.players.includes(peek.viewer) || !state.players.includes(peek.target)) {
      throw new Error('偷看记录无效');
    }
  }
  if (state.phase === 'night') {
    if (state.currentHour < 1 || state.currentHour > NIGHT_END_HOUR) {
      throw new Error('夜间时刻无效');
    }
    if (state.lastProcessedHour < 0 || state.lastProcessedHour > NIGHT_END_HOUR) {
      throw new Error('夜间已处理时刻无效');
    }
    // currentHour 与已处理时刻一致（窗口内），或尚未处理任何时刻时 currentHour=1
    if (state.currentHour !== state.lastProcessedHour && !(state.lastProcessedHour === 0 && state.currentHour === 1)) {
      throw new Error('夜间时刻与已处理时刻不一致');
    }
  }
  if (state.phase !== 'night' && state.phase !== 'hour_choice' && state.currentHour !== 0) {
    throw new Error('非夜间阶段时刻应为 0');
  }
  if (state.phase === 'hour_choice' && state.lastProcessedHour !== 0) {
    throw new Error('两骰自选阶段不应有已处理时刻');
  }
  for (const [id, vote] of Object.entries(state.votes)) {
    if (!state.players.includes(id)) throw new Error('投票者不在本局');
    if (vote.kind === 'accuse' && !state.players.includes(vote.targetPlayerId)) {
      throw new Error('投票目标不在本局');
    }
  }
  if (state.phase === 'game_over') {
    if (state.thiefCaught === null || state.winners.length === 0) throw new Error('终局状态无效');
    if (state.thiefId === null) {
      if (!(state.winners.length === state.players.length)) throw new Error('整夜未盗终局应为全员获胜');
    } else {
      const whiteMouseId =
        Object.entries(state.roleCards).find(([, r]) => r === 'whiteMouse')?.[0] ?? null;
      if (whiteMouseId && state.eliminated?.includes(whiteMouseId) && state.thiefId !== whiteMouseId) {
        if (!(state.winners.length === 1 && state.winners[0] === whiteMouseId)) {
          throw new Error('白老鼠单独胜利终局无效');
        }
      } else if (state.thiefCaught) {
        if (state.winners.some((id) => id === state.thiefId || state.accomplices.includes(id))) {
          throw new Error('好人胜终局不应包含大盗/共犯');
        }
      } else if (!(state.winners.length >= 1 && state.winners[0] === state.thiefId)) {
        throw new Error('大盗胜终局应包含大盗');
      }
    }
  } else {
    if (state.thiefCaught !== null || state.winners.length !== 0 || state.eliminated !== null) {
      throw new Error('未终局时结算字段应为空');
    }
  }
}
