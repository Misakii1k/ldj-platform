import type { GameEffect } from '@ldj/shared';
import { parseBellClashAction, parseBellClashConfig } from './schemas.ts';
import {
  COLORS,
  type BellClashCard,
  type BellClashEvent,
  type BellClashReduceResult,
  type BellClashState,
  type CardColor,
} from './types.ts';

export interface BellRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * 庞大聚会高频易触发行动大词库（200+ 条目，类似《不要做挑战》与《爱你在心口难开》日常言语及微动作）。
 * 每局游戏每色从中随机抽选 18 张，占牌库总量的 75%（72张短语卡 + 24张数字卡 = 96张）。
 */
export const MASTER_PHRASE_POOL: Record<CardColor, readonly string[]> = {
  red: [
    '说出「你」字',
    '说出「我」字',
    '说「真的假的」',
    '发出笑声或微笑',
    '喊某人的名字',
    '说「好的」或「行」',
    '拍一下桌子',
    '摸一下头发',
    '说「哈哈」',
    '双手抱胸',
    '说「等等」或「慢点」',
    '叹了一口气',
    '说「对」或「是的」',
    '摇了摇头',
    '说「为什么」',
    '身体向后靠',
    '说「好耶」或「太棒了」',
    '看了一眼自己的手牌',
    '说了「啊？」',
    '用手指指着天花板',
    '说「我发誓」',
    '做了一个鬼脸',
    '大声说「停！」',
    '用手拍了拍大腿',
    '说了「不是吧阿sir」',
    '把两只手放在脑后',
    '说了「太难了」',
    '摸了摸自己的额头',
    '说了「我先出」',
    '做了一个比心动作',
    '说了「谁怕谁」',
    '向某人眨了下单眼',
    '说了「这把稳了」',
    '举起了右手',
    '说了「别闹」',
    '把手平放在桌上',
    '说了「算你厉害」',
    '吹了声口哨或吸气',
    '说了「我的天」',
    '两手合十拜一下',
    '说了「真的假的呀」',
    '把下巴贴在锁骨前',
    '说了「别催了」',
    '举起双手投降状',
    '说了「我看看谁在叫」',
    '把手背在身后',
    '说了「绝了」',
    '用舌头顶腮或舔唇',
    '说了「救命」',
    '猛地抬起头',
  ],
  yellow: [
    '摸鼻子或揉眼睛',
    '说出「然后」',
    '打了个哈欠',
    '用手托着下巴',
    '说「不是吧」',
    '拿起水杯或喝水',
    '问了一个问题',
    '用手指着某人',
    '说出「什么」',
    '耸了耸肩',
    '扶眼镜或摸脸',
    '说「我看看」',
    '说了「没牌」',
    '翘起二郎腿',
    '说「算了吧」',
    '发出「呃」或「嗯」',
    '敲了两下桌面',
    '低头看手机或桌面',
    '说了「为啥呀」',
    '用手指敲自己的下巴',
    '说了「随便」',
    '抓了抓耳朵',
    '说了「我思考一下」',
    '把手插进裤兜或口袋',
    '说了「你猜」',
    '挑了一下眉毛',
    '说了「大概吧」',
    '咬了一下指甲或嘴唇',
    '说了「差不多」',
    '揉了揉自己的手腕',
    '说了「好像是」',
    '伸了一个懒腰',
    '说了「无语」',
    '晃了晃水杯或瓶子',
    '说了「不知道」',
    '用右手摸左手手背',
    '说了「我找找」',
    '扶了一下椅子扶手',
    '说了「真服了」',
    '深吸一口气又呼出',
    '说了「怎么说」',
    '低头看了看自己的脚',
    '说了「真的假的啊」',
    '双手交叉手指相扣',
    '说了「就这？」',
    '把桌上的牌理整齐',
    '说了「离谱」',
    '侧头看了看旁边的人',
    '说了「稍等一下」',
    '用食指按住嘴唇',
  ],
  green: [
    '说了「快点」催促',
    '做了一个摊手动作',
    '说了「其实」',
    '说了「不可能」',
    '说出「加油」',
    '说了「懂了」',
    '摸了一下下巴',
    '说了「谁的回合」',
    '换了一个坐姿',
    '说了「可以」',
    '深吸了一口气',
    '说了「没事」',
    '眨了眨眼睛',
    '说了「别急」',
    '点了点头',
    '把牌放在桌上',
    '说了「确实」',
    '打了个响指',
    '说了「我懂了」',
    '用手指指着牌堆',
    '说了「等等看」',
    '摸了摸自己的脖子',
    '说了「好嘞」',
    '向左转了转头',
    '说了「就这样吧」',
    '向右转了转头',
    '说了「还行吧」',
    '推了推桌面上的筹码或卡牌',
    '说了「你先来」',
    '搓了搓双手',
    '说了「真行」',
    '把手放在胸口',
    '说了「别搞」',
    '两手张开掌心向上',
    '说了「要不起」',
    '摸了摸自己的下嘴唇',
    '说了「看我的」',
    '轻轻咳了一下',
    '说了「给个机会」',
    '把双手平摊在桌面两侧',
    '说了「搞快点」',
    '抓了抓后脑勺',
    '说了「我服了」',
    '低头看着双手',
    '说了「真有你的」',
    '两手手腕交叉',
    '说了「不会吧」',
    '身体向左倾斜',
    '说了「承让」',
    '身体向右倾斜',
  ],
  blue: [
    '用手摸了摸桌沿',
    '说出「好的吧」',
    '做了一个推眼镜的动作',
    '说了「好吧」',
    '喝了一口饮料或水',
    '说了「怎么会」',
    '手托着右脸颊',
    '说了「过」',
    '手托着左脸颊',
    '说了「快出」',
    '看了看天花板或上方',
    '说了「有意思」',
    '用手按住胸口',
    '说了「等等我」',
    '双手手指交叉放在脑后',
    '说了「哎呀」',
    '用食指敲了敲桌面',
    '说了「行吧」',
    '深吸一口气',
    '说了「难办」',
    '整理了一下衣领或袖口',
    '说了「别这样」',
    '把手肘放在桌上支撑',
    '说了「真假」',
    '轻轻摇了摇头',
    '说了「好家伙」',
    '看了看旁边的玩家',
    '说了「不至于」',
    '手指轻轻敲击大腿',
    '说了「这就来」',
    '微笑着点了点头',
    '说了「厉害」',
    '用手背贴了贴自己的脸颊',
    '说了「让我看看」',
    '轻轻咬了咬牙',
    '说了「行啊」',
    '把一张手牌挪到了最前面',
    '说了「就来」',
    '把一张手牌挪到了最后面',
    '说了「我看看牌」',
    '双手握成拳头放在桌上',
    '说了「可以的」',
    '闭了闭眼睛又睁开',
    '说了「算你狠」',
    '低头看了一眼自己的手指',
    '说了「怎么说呢」',
    '把两张牌调换了位置',
    '说了「别慌」',
    '用手指轻轻划了划桌面',
    '说了「这就对了」',
  ],
};

export interface BellRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * 构建原创牌库（4色×(6张数字卡 + 从大词库随机抽选18张聚会高频短语卡) = 96张牌，短语卡占比 75%）。
 * 支持传入 PRNG 随机抽选，保证开局多局不重样；无参调用时确定性取各色前 18 张。
 */
export function buildDeck(random?: BellRandom): BellClashCard[] {
  const deck: BellClashCard[] = [];
  for (const color of COLORS) {
    // 6 张数字卡（1–6 各 1 张，占 25%）
    for (let number = 1; number <= 6; number += 1) {
      deck.push({ kind: 'number', color, number });
    }
    // 18 张高频易触发短语卡（从 50+ 大词库中随机抽选 18 张，占 75%）
    const colorPool = MASTER_PHRASE_POOL[color];
    const sampledPhrases = random
      ? random.shuffle([...colorPool]).slice(0, 18)
      : colorPool.slice(0, 18);

    for (const phrase of sampledPhrases) {
      deck.push({ kind: 'phrase', color, phrase });
    }
  }
  return deck;
}

function system(text: string): GameEffect {
  return { type: 'system_message', text };
}

function deny(message: string): BellClashReduceResult {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

function idempotent(state: BellClashState): BellClashReduceResult {
  return { ok: true, nextState: state, events: [], effects: [] };
}

/**
 * 回合超时。顺便把截止时刻与类别写进 state：客户端的倒计时环需要它们，
 * 而 effect 里的 deadlineAt 只有运行时看得见，视图拿不到。两处必须同值。
 */
function scheduleTurnTimeout(state: BellClashState, playerId: string, now: number): GameEffect {
  const deadlineAt = now + state.config.turnSeconds * 1000;
  state.deadlineAt = deadlineAt;
  state.deadlineKind = 'turn';
  return {
    type: 'schedule_timer',
    timerId: 'turn_timeout',
    deadlineAt,
    action: { type: 'turn_timeout', playerId },
  };
}

/**
 * 质疑投票判定超时。
 * deadlineKind 标为 'challenge'，客户端据此换 phaseKey 重测满格。
 */
function scheduleChallengeTimeout(state: BellClashState, now: number): GameEffect {
  const deadlineAt = now + state.config.challengeSeconds * 1000;
  state.deadlineAt = deadlineAt;
  state.deadlineKind = 'challenge';
  return {
    type: 'schedule_timer',
    timerId: 'challenge_timeout',
    deadlineAt,
    action: { type: 'challenge_timeout' },
  };
}

/**
 * 构建原创牌库：4色×(6张数字卡 + 从大词库随机抽选18张聚会高频短语卡) = 96张牌（短语卡占比 75%）。
 * 支持传入 PRNG 随机抽选，保证开局多局不重样；无参调用时确定性取各色前 18 张。
 */
export function buildStandardDeck(rng?: BellRandom): BellClashCard[] {
  const deck: BellClashCard[] = [];
  for (const color of COLORS) {
    // 6 张数字卡（1–6）
    for (let n = 1; n <= 6; n++) {
      deck.push({ kind: 'number', color, number: n });
    }
    // 18 张高频短语卡
    const pool = MASTER_PHRASE_POOL[color];
    const pickedPhrases = rng ? rng.shuffle(pool).slice(0, 18) : pool.slice(0, 18);
    for (const phrase of pickedPhrases) {
      deck.push({ kind: 'phrase', color, phrase });
    }
  }
  return deck;
}

/** 出牌合法性：同颜色或同数字（短语卡按颜色匹配） */
export function canPlay(card: BellClashCard, top: BellClashCard | null): boolean {
  if (top === null) return true;
  if (card.color === top.color) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
  return false;
}

export function createBellClashState(
  players: readonly string[],
  configInput: unknown = {},
  deck: BellClashCard[],
  hands: Record<string, BellClashCard[]>,
  discardTop: BellClashCard | null,
): BellClashState {
  if (players.length < 2 || players.length > 7) throw new Error('Ding 需要 2 至 7 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) {
    throw new Error('玩家列表无效');
  }
  const config = parseBellClashConfig(configInput);
  for (const id of players) {
    if (!hands[id] || hands[id].length !== config.handSize) throw new Error('手牌数量与配置不一致');
  }
  const state: BellClashState = {
    schemaVersion: 1,
    phase: 'playing',
    players: [...players],
    config,
    hands: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, [...cards]])),
    drawPile: [...deck],
    discardTop,
    currentPlayerId: players[0]!,
    challenge: null,
    penaltyPulls: {},
    winners: [],
    deadlineAt: null,
    deadlineKind: null,
  };
  assertBellClashInvariants(state);
  return state;
}

/** 从抽牌堆摸一张；空则返回 null（由调用方结算抽牌堆耗尽） */
function drawOne(state: BellClashState, playerId: string): BellClashCard | null {
  const card = state.drawPile.pop() ?? null;
  if (card) state.hands[playerId]!.push(card);
  return card;
}

export function assertBellClashInvariants(state: BellClashState): void {
  if (state.schemaVersion !== 1) throw new Error('schemaVersion 必须为 1');
  if (state.phase !== 'game_over') {
    if (state.players.length < 2 || state.players.length > 7) {
      throw new Error(`玩家人数 ${state.players.length} 超出范围 [2, 7]`);
    }
    if (!state.players.includes(state.currentPlayerId)) {
      throw new Error(`当前出牌者不在本局: ${state.currentPlayerId}`);
    }
  }
  if (new Set(state.players).size !== state.players.length) {
    throw new Error('玩家列表存在重复 ID');
  }
  if (state.challenge) {
    const ch = state.challenge;
    if (!state.players.includes(ch.claimantId)) {
      throw new Error('拍铃者不在本局');
    }
    if (ch.card.kind !== 'phrase') {
      throw new Error('拍铃亮出的卡必须是短语卡');
    }
    if (ch.voters.includes(ch.claimantId)) {
      throw new Error('拍铃者不可作为投票人');
    }
    const voterSet = new Set(ch.voters);
    for (const d of ch.doubts) {
      if (!voterSet.has(d)) throw new Error('质疑者不在投票人列表中');
    }
    for (const c of ch.confirms) {
      if (!voterSet.has(c)) throw new Error('确认者不在投票人列表中');
    }
  }
  for (const id of state.players) {
    if (!Array.isArray(state.hands[id])) {
      throw new Error(`玩家 ${id} 缺少手牌列表`);
    }
  }
  if (state.phase === 'game_over') {
    // 全员退出的对局（players 为空）没有胜者；其余终局必须至少一名获胜者
    if (!Array.isArray(state.winners) || (state.winners.length < 1 && state.players.length > 0)) {
      throw new Error('终局状态必须包含至少一名获胜者');
    }
    for (const w of state.winners) {
      if (!state.players.includes(w)) throw new Error(`获胜者 ${w} 不在玩家列表中`);
    }
  }
}

export interface ReduceContext {
  now?: number;
}

/**
 * 拍铃判定结算：成功
 */
function resolveChallengeSuccess(
  next: BellClashState,
  events: BellClashEvent[],
  effects: GameEffect[],
  now: number,
): BellClashReduceResult {
  const ch = next.challenge!;
  const claimantId = ch.claimantId;

  // 弃牌堆顶换为亮出的短语卡
  next.discardTop = ch.card;
  next.currentPlayerId = claimantId;
  const doubts = [...ch.doubts];
  next.challenge = null;

  events.push({ type: 'bell_resolved', claimantId, success: true, doubts });
  effects.push({ type: 'cancel_timer', timerId: 'challenge_timeout' });
  effects.push(system(`玩家 ${claimantId} 拍铃成功！短语卡打出并接管回合！`));

  // 获胜判定：拍铃成功打出手牌，若手牌打光即赢
  if (next.hands[claimantId]!.length === 0) {
    next.phase = 'game_over';
    next.deadlineAt = null;
    next.deadlineKind = null;
    next.winners = [claimantId];
    events.push({ type: 'game_finished', winners: [claimantId] });
    effects.push(system(`玩家 ${claimantId} 打光手牌，赢得胜利！`));
    assertBellClashInvariants(next);
    return { ok: true, nextState: next, events, effects };
  }

  // 接管回合后排上新回合计时
  effects.push(scheduleTurnTimeout(next, claimantId, now));
  assertBellClashInvariants(next);
  return { ok: true, nextState: next, events, effects };
}

/**
 * 拍铃判定结算：拍错（严格过半质疑）
 */
function resolveChallengeFailure(
  next: BellClashState,
  events: BellClashEvent[],
  effects: GameEffect[],
  now: number,
): BellClashReduceResult {
  const ch = next.challenge!;
  const claimantId = ch.claimantId;

  // 卡牌放回原位
  const hand = next.hands[claimantId]!;
  const safeIdx = Math.min(ch.handIndex, hand.length);
  hand.splice(safeIdx, 0, ch.card);

  // 罚摸 1 张
  drawOne(next, claimantId);
  next.penaltyPulls[claimantId] = (next.penaltyPulls[claimantId] ?? 0) + 1;

  // 回合回到原本被打断的人
  next.currentPlayerId = ch.interruptedPlayerId;
  const doubts = [...ch.doubts];
  next.challenge = null;

  events.push({ type: 'bell_resolved', claimantId, success: false, doubts });
  effects.push({ type: 'cancel_timer', timerId: 'challenge_timeout' });
  effects.push(system(`玩家 ${claimantId} 拍错短语卡，被超过半数质疑！卡牌收回手牌并罚摸 1 张！`));

  // 为被打断者重新开启完整回合计时
  effects.push(scheduleTurnTimeout(next, ch.interruptedPlayerId, now));
  assertBellClashInvariants(next);
  return { ok: true, nextState: next, events, effects };
}

/**
 * 状态转移主函数。
 */
export function reduceBellClashState(
  state: BellClashState,
  actionInput: unknown,
  context: ReduceContext = {},
): BellClashReduceResult {
  const action = parseBellClashAction(actionInput);
  const now = context.now ?? Date.now();

  switch (action.type) {
    case 'begin': {
      // 开局即武装首回合超时：首位玩家挂机时由系统自动摸牌过牌，避免整局卡死
      if (state.phase !== 'playing') return idempotent(state);
      return {
        ok: true,
        nextState: state,
        events: [],
        effects: [scheduleTurnTimeout(state, state.currentPlayerId, now)],
      };
    }

    case 'play_card': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.challenge !== null) return deny('当前处于拍铃质疑判定，不可出牌');
      if (action.playerId !== state.currentPlayerId) return deny('非当前出牌者');

      const hand = state.hands[action.playerId];
      if (!hand || action.cardIndex < 0 || action.cardIndex >= hand.length) {
        return deny('卡牌索引越界');
      }

      const card = hand[action.cardIndex]!;
      if (!canPlay(card, state.discardTop)) {
        return deny('卡牌不符合出牌规则（需同色或同数字）');
      }

      const next = structuredClone(state) as BellClashState;
      next.hands[action.playerId]!.splice(action.cardIndex, 1);
      next.discardTop = card;

      const events: BellClashEvent[] = [{ type: 'card_played', playerId: action.playerId, card }];
      const effects: GameEffect[] = [{ type: 'cancel_timer', timerId: 'turn_timeout' }];

      // 获胜判定：手牌打光即赢
      if (next.hands[action.playerId]!.length === 0) {
        next.phase = 'game_over';
        next.deadlineAt = null;
        next.deadlineKind = null;
        next.winners = [action.playerId];
        events.push({ type: 'game_finished', winners: [action.playerId] });
        effects.push(system(`玩家 ${action.playerId} 打光手牌，赢得胜利！`));
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      // 普通出牌（无论数字牌还是短语卡当普通牌打）都不开按铃窗口，回合转下一位
      const currentIdx = next.players.indexOf(action.playerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;
      events.push({ type: 'turn_passed', playerId: nextPlayerId });

      effects.push(scheduleTurnTimeout(next, nextPlayerId, now));

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'draw_card': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.challenge !== null) return deny('当前处于拍铃质疑判定，不可摸牌');
      if (action.playerId !== state.currentPlayerId) return deny('非当前出牌者');

      const next = structuredClone(state) as BellClashState;
      const drawn = drawOne(next, action.playerId);
      const events: BellClashEvent[] = [{ type: 'card_drawn', playerId: action.playerId }];
      const effects: GameEffect[] = [{ type: 'cancel_timer', timerId: 'turn_timeout' }];

      if (!drawn) {
        // 抽牌堆耗尽：以手牌最少者判定获胜
        const minCount = Math.min(...next.players.map((p) => next.hands[p]!.length));
        const winners = next.players.filter((p) => next.hands[p]!.length === minCount);
        next.phase = 'game_over';
        next.deadlineAt = null;
        next.deadlineKind = null;
        next.winners = winners;
        events.push({ type: 'game_finished', winners });
        effects.push(system(`抽牌堆耗尽，手牌最少者获胜：${winners.join('、')}`));
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      // 若摸到的牌可直接打出，自动打出；否则轮到下一位
      if (canPlay(drawn, next.discardTop)) {
        const drawnIdx = next.hands[action.playerId]!.length - 1;
        next.hands[action.playerId]!.splice(drawnIdx, 1);
        next.discardTop = drawn;
        events.push({ type: 'card_played', playerId: action.playerId, card: drawn });
        effects.push(system(`摸到可打出牌，自动打出！`));

        if (next.hands[action.playerId]!.length === 0) {
          next.phase = 'game_over';
          next.deadlineAt = null;
          next.deadlineKind = null;
          next.winners = [action.playerId];
          events.push({ type: 'game_finished', winners: [action.playerId] });
          effects.push(system(`玩家 ${action.playerId} 打光手牌获胜！`));
          assertBellClashInvariants(next);
          return { ok: true, nextState: next, events, effects };
        }
      }

      // 过牌给下一位
      const currentIdx = next.players.indexOf(action.playerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;
      events.push({ type: 'turn_passed', playerId: nextPlayerId });

      effects.push(scheduleTurnTimeout(next, nextPlayerId, now));

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'ring_bell': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.challenge !== null) return deny('已有拍铃判定正在进行');
      if (!state.players.includes(action.playerId)) return deny('非本局玩家');

      const hand = state.hands[action.playerId];
      if (!hand || action.cardIndex < 0 || action.cardIndex >= hand.length) {
        return deny('卡牌索引越界');
      }

      const card = hand[action.cardIndex]!;
      if (card.kind !== 'phrase') {
        return deny('拍铃只能亮出手中的短语卡');
      }

      const next = structuredClone(state) as BellClashState;
      // 从手牌中移出这张短语卡，放进判定区暂存
      next.hands[action.playerId]!.splice(action.cardIndex, 1);

      const voters = next.players.filter((p) => p !== action.playerId);

      next.challenge = {
        claimantId: action.playerId,
        card,
        handIndex: action.cardIndex,
        voters,
        doubts: [],
        confirms: [],
        interruptedPlayerId: next.currentPlayerId,
      };

      const events: BellClashEvent[] = [{ type: 'bell_rung', claimantId: action.playerId, card }];
      const effects: GameEffect[] = [
        { type: 'cancel_timer', timerId: 'turn_timeout' },
        system(`玩家 ${action.playerId} 拍铃并亮出短语卡「${card.phrase}」！等待他人质疑…`),
      ];

      // 若在局只有拍铃者 1 人（极特殊），直接成功
      if (voters.length === 0) {
        return resolveChallengeSuccess(next, events, effects, now);
      }

      effects.push(scheduleChallengeTimeout(next, now));
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'challenge_vote': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.challenge === null) return deny('当前没有正在进行的拍铃判定');

      const ch = state.challenge;
      if (!ch.voters.includes(action.playerId)) return deny('非本次拍铃判定的投票人');
      if (ch.doubts.includes(action.playerId) || ch.confirms.includes(action.playerId)) {
        return deny('您已投过票');
      }

      const next = structuredClone(state) as BellClashState;
      if (action.doubt) {
        next.challenge!.doubts.push(action.playerId);
      } else {
        next.challenge!.confirms.push(action.playerId);
      }

      const totalVoters = ch.voters.length;
      const doubtCount = next.challenge!.doubts.length;
      const confirmCount = next.challenge!.confirms.length;
      const remainingVotes = totalVoters - doubtCount - confirmCount;

      const events: BellClashEvent[] = [];
      const effects: GameEffect[] = [];

      // 判定 1：质疑票已严格过半（doubts * 2 > totalVoters）-> 立即判定拍错提前结算！
      if (doubtCount * 2 > totalVoters) {
        return resolveChallengeFailure(next, events, effects, now);
      }

      // 判定 2：即使剩余所有未投票全部质疑，也绝不可能过半 -> 立即判定成功提前结算！
      if ((doubtCount + remainingVotes) * 2 <= totalVoters) {
        return resolveChallengeSuccess(next, events, effects, now);
      }

      // 否则继续等待其他投票或超时
      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'challenge_timeout': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.challenge === null) return deny('当前没有正在进行的拍铃判定');

      const next = structuredClone(state) as BellClashState;
      const totalVoters = next.challenge!.voters.length;
      const doubtCount = next.challenge!.doubts.length;

      const events: BellClashEvent[] = [];
      const effects: GameEffect[] = [];

      // 超时判定：质疑数严格过半则拍错，否则拍铃成功
      if (doubtCount * 2 > totalVoters) {
        return resolveChallengeFailure(next, events, effects, now);
      } else {
        return resolveChallengeSuccess(next, events, effects, now);
      }
    }

    case 'turn_timeout': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (action.playerId !== state.currentPlayerId) return deny('非当前玩家超时');
      if (state.challenge !== null) return deny('当前处于拍铃判定，回合超时暂停');

      // 超时自动摸一张并过牌
      const next = structuredClone(state) as BellClashState;
      drawOne(next, action.playerId);

      const currentIdx = next.players.indexOf(action.playerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;

      const events: BellClashEvent[] = [
        { type: 'card_drawn', playerId: action.playerId },
        { type: 'turn_passed', playerId: nextPlayerId },
      ];
      const effects: GameEffect[] = [
        system(`玩家 ${action.playerId} 出牌超时，自动摸一张牌并过牌。`),
        scheduleTurnTimeout(next, nextPlayerId, now),
      ];

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'player_forfeited': {
      const next = structuredClone(state) as BellClashState;
      const forfeiting = new Set(action.playerIds);
      next.players = next.players.filter((id) => !forfeiting.has(id));

      const events: BellClashEvent[] = [];
      const effects: GameEffect[] = [
        system(`玩家 ${action.playerIds.join('、')} 退出了对局。`),
      ];

      // 处理正在进行的判定
      if (next.challenge) {
        if (forfeiting.has(next.challenge.claimantId)) {
          // 拍铃者退出：判定取消，卡作废，回合归被打断者
          const resumeId = forfeiting.has(next.challenge.interruptedPlayerId)
            ? (next.players[0] ?? '')
            : next.challenge.interruptedPlayerId;
          next.challenge = null;
          effects.push({ type: 'cancel_timer', timerId: 'challenge_timeout' });
          if (resumeId) {
            next.currentPlayerId = resumeId;
            effects.push(scheduleTurnTimeout(next, resumeId, now));
          }
        } else {
          // 投票人退出：从投票人集合中移除
          next.challenge.voters = next.challenge.voters.filter((id) => !forfeiting.has(id));
          next.challenge.doubts = next.challenge.doubts.filter((id) => !forfeiting.has(id));
          next.challenge.confirms = next.challenge.confirms.filter((id) => !forfeiting.has(id));

          const totalVoters = next.challenge.voters.length;
          const doubtCount = next.challenge.doubts.length;
          const confirmCount = next.challenge.confirms.length;
          const remainingVotes = totalVoters - doubtCount - confirmCount;

          if (doubtCount * 2 > totalVoters) {
            return resolveChallengeFailure(next, events, effects, now);
          } else if ((doubtCount + remainingVotes) * 2 <= totalVoters) {
            return resolveChallengeSuccess(next, events, effects, now);
          }
        }
      } else {
        if (forfeiting.has(next.currentPlayerId)) {
          next.currentPlayerId = next.players[0] ?? '';
          if (next.currentPlayerId && next.phase === 'playing') {
            effects.push(scheduleTurnTimeout(next, next.currentPlayerId, now));
          }
        }
      }

      if (next.players.length <= 1) {
        next.phase = 'game_over';
        next.deadlineAt = null;
        next.deadlineKind = null;
        next.winners = next.players.length === 1 ? [next.players[0]!] : [];
        events.push({ type: 'game_finished', winners: next.winners });
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    default: {
      return deny('未知的动作类型');
    }
  }
}
