import type { GameEffect } from '@ldj/shared';
import { parseBellClashAction, parseBellClashConfig } from './schemas.ts';
import {
  COLORS,
  type BellClashAction,
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
    '说了「有意思」',
    '把重心移到另一条腿',
    '说了「没问题」',
    '轻轻咳嗽了一声',
    '说了「听我说」',
    '把双手握成拳头',
    '说了「我也觉得」',
    '微微仰头看上方',
    '说了「那就这样」',
    '拍了拍自己的肩膀',
    '说了「算你走运」',
    '用手指敲了敲椅背',
    '说了「有把握」',
    '握着拳头锤了一下手掌',
    '说了「接着来」',
    '伸手整理了一下衣服',
  ],
  blue: [
    '说了「我出这个」',
    '说了「算你狠」',
    '说了「怎么可能」',
    '摸了一下耳朵',
    '抿嘴或撇嘴',
    '说了「等等我」',
    '说了「随便吧」',
    '手掌摊开向上',
    '说了「厉害啊」',
    '咳嗽了一声',
    '说了「看我的」',
    '说了「还有谁」',
    '双手交叉放桌上',
    '说了「你确定？」',
    '身体微微前倾',
    '说了「好险」',
    '伸手指向牌堆',
    '说了「别搞我」',
    '说了「让我看看」',
    '两手平摊在桌沿',
    '说了「我不信」',
    '用手指了指自己',
    '说了「你看着办」',
    '两手食指互碰',
    '说了「我先摸一张」',
    '拍了拍自己的胸脯',
    '说了「稳如老狗」',
    '摸了摸自己的眉毛',
    '说了「谁打的？」',
    '用手掌撑住脸颊',
    '说了「有内鬼」',
    '把牌一张张扇形展开',
    '说了「别慌」',
    '轻轻甩了一下手腕',
    '说了「我翻盘了」',
    '用右手摸了摸左肩',
    '说了「这不科学」',
    '两手在胸前比个大叉',
    '说了「你完了」',
    '用手背擦了一下下巴',
    '说了「这就很尴尬」',
    '手背朝上放在桌上',
    '说了「相信我」',
    '两只脚踝交叉叠放',
    '说了「开玩笑吧」',
    '转了转手中的某张牌',
    '说了「这波我在大气层」',
    '用手指指着对面的玩家',
    '说了「到此为止了」',
    '身体向左或向右微倾',
  ],
};

/** 兼容旧版引用 */
export const PHRASES = MASTER_PHRASE_POOL;

const deny = (message: string): BellClashReduceResult => ({
  ok: false,
  code: 'ACTION_NOT_ALLOWED',
  message,
});

const idempotent = (state: BellClashState): BellClashReduceResult => ({
  ok: true,
  nextState: state,
  events: [],
  effects: [],
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

/**
 * 构建原创牌库：4色×(6张数字卡 + 从大词库随机抽选18张聚会高频短语卡) = 96张牌（短语卡占比 75%）。
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
  if (players.length < 2 || players.length > 7) throw new Error('铃铛对决需要 2 至 7 名玩家');
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
    bellOpen: false,
    bellClaimantId: null,
    penaltyPulls: {},
    winners: [],
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
  if (state.bellOpen && (!state.discardTop || state.discardTop.kind !== 'phrase')) {
    throw new Error('按铃窗口应挂在短语卡上');
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
        effects: [
          {
            type: 'schedule_timer',
            timerId: 'turn_timeout',
            deadlineAt: now + state.config.turnSeconds * 1000,
            action: { type: 'turn_timeout', playerId: state.currentPlayerId },
          },
        ],
      };
    }

    case 'play_card': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.bellOpen) return deny('当前处于按铃抢答窗口，不可正常出牌');
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
        next.winners = [action.playerId];
        events.push({ type: 'game_finished', winners: [action.playerId] });
        effects.push(system(`玩家 ${action.playerId} 打光手牌，赢得胜利！`));
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      // 若打出的是短语卡，开启按铃抢答窗口
      if (card.kind === 'phrase') {
        next.bellOpen = true;
        next.bellClaimantId = null;
        events.push({ type: 'bell_opened' });
        effects.push(
          system(`触发短语「${card.phrase}」！若有人说了/做了牌上内容，可拍铃抢回合！`),
        );
        effects.push({
          type: 'schedule_timer',
          timerId: 'bell_timeout',
          deadlineAt: now + next.config.bellSeconds * 1000,
          action: { type: 'resolve_bell', claimantId: '' },
        });
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      // 数字牌：回合转移给下一位玩家
      const currentIdx = next.players.indexOf(action.playerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;
      events.push({ type: 'turn_passed', playerId: nextPlayerId });

      effects.push({
        type: 'schedule_timer',
        timerId: 'turn_timeout',
        deadlineAt: now + next.config.turnSeconds * 1000,
        action: { type: 'turn_timeout', playerId: nextPlayerId },
      });

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'draw_card': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (state.bellOpen) return deny('当前处于按铃窗口，不可摸牌');
      if (action.playerId !== state.currentPlayerId) return deny('非当前出牌者');

      const next = structuredClone(state) as BellClashState;
      const drawn = drawOne(next, action.playerId);
      const events: BellClashEvent[] = [{ type: 'card_drawn', playerId: action.playerId }];
      // 摸牌即消耗本回合决策：必须取消待触发的 turn_timeout，
      // 否则短语牌自动打出开启按铃窗口后，旧超时会误摸牌并过牌破坏结算
      const effects: GameEffect[] = [{ type: 'cancel_timer', timerId: 'turn_timeout' }];

      if (!drawn) {
        // 抽牌堆耗尽：以手牌最少者判定获胜
        const minCount = Math.min(...next.players.map((p) => next.hands[p]!.length));
        const winners = next.players.filter((p) => next.hands[p]!.length === minCount);
        next.phase = 'game_over';
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
          next.winners = [action.playerId];
          events.push({ type: 'game_finished', winners: [action.playerId] });
          effects.push(system(`玩家 ${action.playerId} 打光手牌获胜！`));
          assertBellClashInvariants(next);
          return { ok: true, nextState: next, events, effects };
        }

        if (drawn.kind === 'phrase') {
          next.bellOpen = true;
          next.bellClaimantId = null;
          events.push({ type: 'bell_opened' });
          effects.push({
            type: 'schedule_timer',
            timerId: 'bell_timeout',
            deadlineAt: now + next.config.bellSeconds * 1000,
            action: { type: 'resolve_bell', claimantId: '' },
          });
          assertBellClashInvariants(next);
          return { ok: true, nextState: next, events, effects };
        }
      }

      // 过牌给下一位
      const currentIdx = next.players.indexOf(action.playerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;
      events.push({ type: 'turn_passed', playerId: nextPlayerId });

      effects.push({
        type: 'schedule_timer',
        timerId: 'turn_timeout',
        deadlineAt: now + next.config.turnSeconds * 1000,
        action: { type: 'turn_timeout', playerId: nextPlayerId },
      });

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'ring_bell': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (!state.bellOpen) return deny('当前未开启按铃窗口');
      if (state.bellClaimantId !== null) return deny('已有人拍铃');

      const next = structuredClone(state) as BellClashState;
      const top = next.discardTop;
      const hand = next.hands[action.playerId] ?? [];
      const phraseIndex = hand.findIndex(
        (c) => c.kind === 'phrase' && top !== null && c.color === top.color,
      );

      // 若手中无同色短语卡，即时结算为错误拍铃并关闭窗口
      if (phraseIndex < 0) {
        drawOne(next, action.playerId);
        next.penaltyPulls[action.playerId] = (next.penaltyPulls[action.playerId] ?? 0) + 1;
        next.bellOpen = false;
        next.bellClaimantId = null;

        const currentIdx = next.players.indexOf(next.currentPlayerId);
        const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
        next.currentPlayerId = nextPlayerId;

        const events: BellClashEvent[] = [
          { type: 'bell_rung', claimantId: action.playerId },
          { type: 'bell_resolved', claimantId: action.playerId, wonTurn: false },
          { type: 'turn_passed', playerId: nextPlayerId },
        ];
        const effects: GameEffect[] = [
          system(`玩家 ${action.playerId} 错误拍铃（无同色短语卡），罚摸 1 张！`),
          { type: 'cancel_timer', timerId: 'bell_timeout' },
          {
            type: 'schedule_timer',
            timerId: 'turn_timeout',
            deadlineAt: now + next.config.turnSeconds * 1000,
            action: { type: 'turn_timeout', playerId: nextPlayerId },
          },
        ];

        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      next.bellClaimantId = action.playerId;
      const events: BellClashEvent[] = [{ type: 'bell_rung', claimantId: action.playerId }];
      const effects: GameEffect[] = [
        system(`玩家 ${action.playerId} 拍铃抢答！`),
      ];

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'resolve_bell': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (!state.bellOpen) return deny('按铃窗口未开启');

      const next = structuredClone(state) as BellClashState;
      const claimantId = action.claimantId || next.bellClaimantId;
      next.bellOpen = false;
      next.bellClaimantId = null;

      const events: BellClashEvent[] = [];
      const effects: GameEffect[] = [{ type: 'cancel_timer', timerId: 'bell_timeout' }];

      const top = next.discardTop;

      if (claimantId && next.players.includes(claimantId)) {
        // 检查拍铃者手中是否有同色短语卡
        const hand = next.hands[claimantId]!;
        const phraseIndex = hand.findIndex(
          (c) => c.kind === 'phrase' && top !== null && c.color === top.color,
        );

        if (phraseIndex >= 0) {
          // 拍铃成功：打出该短语卡并接管回合
          const playedPhrase = hand.splice(phraseIndex, 1)[0]!;
          next.discardTop = playedPhrase;
          next.currentPlayerId = claimantId;
          events.push({ type: 'bell_resolved', claimantId, wonTurn: true });
          effects.push(system(`玩家 ${claimantId} 拍铃成功！打出短语卡并接管回合！`));

          if (hand.length === 0) {
            next.phase = 'game_over';
            next.winners = [claimantId];
            events.push({ type: 'game_finished', winners: [claimantId] });
            effects.push(system(`玩家 ${claimantId} 打光手牌获胜！`));
            assertBellClashInvariants(next);
            return { ok: true, nextState: next, events, effects };
          }

          // 拍铃成功：关闭按铃窗口，回合归该玩家
          next.bellOpen = false;
          next.bellClaimantId = null;
          effects.push({
            type: 'schedule_timer',
            timerId: 'turn_timeout',
            deadlineAt: now + next.config.turnSeconds * 1000,
            action: { type: 'turn_timeout', playerId: claimantId },
          });
          assertBellClashInvariants(next);
          return { ok: true, nextState: next, events, effects };
        }

        // 错误拍铃：罚摸一张
        drawOne(next, claimantId);
        next.penaltyPulls[claimantId] = (next.penaltyPulls[claimantId] ?? 0) + 1;
        events.push({ type: 'bell_resolved', claimantId, wonTurn: false });
        effects.push(system(`玩家 ${claimantId} 错误拍铃（无同色短语卡），罚摸 1 张！`));

        // 轮到原出牌者的下一位
        const currentIdx = next.players.indexOf(next.currentPlayerId);
        const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
        next.currentPlayerId = nextPlayerId;
        events.push({ type: 'turn_passed', playerId: nextPlayerId });

        effects.push({
          type: 'schedule_timer',
          timerId: 'turn_timeout',
          deadlineAt: now + next.config.turnSeconds * 1000,
          action: { type: 'turn_timeout', playerId: nextPlayerId },
        });

        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      // 无人拍铃：回合流转到下一位
      const currentIdx = next.players.indexOf(next.currentPlayerId);
      const nextPlayerId = next.players[(currentIdx + 1) % next.players.length]!;
      next.currentPlayerId = nextPlayerId;
      events.push({ type: 'turn_passed', playerId: nextPlayerId });

      effects.push({
        type: 'schedule_timer',
        timerId: 'turn_timeout',
        deadlineAt: now + next.config.turnSeconds * 1000,
        action: { type: 'turn_timeout', playerId: nextPlayerId },
      });

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'turn_timeout': {
      if (state.phase !== 'playing') return deny('游戏已结束');
      if (action.playerId !== state.currentPlayerId) return deny('非当前玩家超时');

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
        {
          type: 'schedule_timer',
          timerId: 'turn_timeout',
          deadlineAt: now + next.config.turnSeconds * 1000,
          action: { type: 'turn_timeout', playerId: nextPlayerId },
        },
      ];

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'player_forfeited': {
      const next = structuredClone(state) as BellClashState;
      const forfeiting = new Set(action.playerIds);
      next.players = next.players.filter((id) => !forfeiting.has(id));

      const effects: GameEffect[] = [
        system(`玩家 ${action.playerIds.join('、')} 退出了对局。`),
      ];

      if (forfeiting.has(next.currentPlayerId)) {
        next.currentPlayerId = next.players[0] ?? '';
      }

      if (next.players.length <= 1) {
        next.phase = 'game_over';
        next.winners = next.players.length === 1 ? [next.players[0]!] : [];
        const events: BellClashEvent[] = [{ type: 'game_finished', winners: next.winners }];
        assertBellClashInvariants(next);
        return { ok: true, nextState: next, events, effects };
      }

      assertBellClashInvariants(next);
      return { ok: true, nextState: next, events: [], effects };
    }

    default: {
      return deny('未知的动作类型');
    }
  }
}

