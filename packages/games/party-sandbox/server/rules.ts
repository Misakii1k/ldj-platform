import type { GameEffect } from '@ldj/shared';
import { parsePartySandboxAction, parsePartySandboxConfig } from './schemas.ts';
import type {
  ActivityLogItem,
  BellProp,
  CoinProp,
  DeckProp,
  DiceProp,
  PartySandboxAction,
  PartySandboxEvent,
  PartySandboxReduceResult,
  PartySandboxState,
  RevolverProp,
  SandboxCard,
  SandboxProp,
  ScoreboardProp,
  TimerProp,
  WheelProp,
} from './types.ts';

export interface SandboxRandom {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

const deny = (message: string): PartySandboxReduceResult => ({
  ok: false,
  error: message,
});

const system = (text: string): GameEffect => ({ type: 'system_message', text });

function addLog(
  state: PartySandboxState,
  playerId: string,
  kind: ActivityLogItem['kind'],
  text: string,
  now: number,
) {
  const item: ActivityLogItem = {
    id: `log_${now}_${state.activityLogs.length}_${playerId}`,
    timestamp: now,
    playerId,
    kind,
    text,
  };
  state.activityLogs = [item, ...state.activityLogs].slice(0, 50);
}

export function createDefaultRevolver(
  id = 'prop_revolver_1',
  chambers = 6,
  liveCount = 1,
): RevolverProp {
  const cylinder: ('live' | 'blank')[] = [];
  for (let i = 0; i < chambers; i++) {
    cylinder.push(i < liveCount ? 'live' : 'blank');
  }
  return {
    id,
    kind: 'revolver',
    title: `左轮手枪 (${liveCount}/${chambers} 实弹)`,
    chambers,
    currentChamber: 0,
    cylinder,
    lastAction: null,
  };
}

export function createDefaultDice(
  id = 'prop_dice_1',
  diceCount = 3,
  diceType: 'd6' | 'd20' = 'd6',
): DiceProp {
  return {
    id,
    kind: 'dice',
    title: '摇骰盅',
    diceCount,
    diceType,
    values: Array.from({ length: diceCount }, () => 1),
    isCupCovered: false,
    lastRollBy: null,
    lastRollTimestamp: null,
  };
}

export function createDefaultBell(id = 'prop_bell_1'): BellProp {
  return {
    id,
    kind: 'bell',
    title: '抢答铃',
    rungBy: null,
    rungTimestamp: null,
    ringCount: 0,
  };
}

export function createDefaultTimer(id = 'prop_timer_1', durationSeconds = 30): TimerProp {
  return {
    id,
    kind: 'timer',
    title: '定时炸弹',
    durationSeconds,
    remainingSeconds: durationSeconds,
    isRunning: false,
    isExploded: false,
    startedBy: null,
    startedAt: null,
  };
}

export function createDefaultCoin(id = 'prop_coin_1'): CoinProp {
  return {
    id,
    kind: 'coin',
    title: '幸运硬币',
    lastFlipResult: null,
    flippedBy: null,
    flipTimestamp: null,
  };
}

export function createDefaultDeck(
  id = 'prop_deck_1',
  title = '真心话大冒险',
  cards: SandboxCard[] = [],
): DeckProp {
  return {
    id,
    kind: 'deck',
    title,
    drawPile: [...cards],
    discardPile: [],
    tableCards: [],
  };
}

export function createDefaultWheel(
  id = 'prop_wheel_1',
  title = '指名大转盘',
  segments?: Array<{ label: string; color?: string }>,
): WheelProp {
  const defaultSegments = segments ?? [
    { label: '喝半杯', color: '#ef4444' },
    { label: '真心话', color: '#ec4899' },
    { label: '大冒险', color: '#8b5cf6' },
    { label: '指定他人喝', color: '#3b82f6' },
    { label: '全场干杯', color: '#10b981' },
    { label: '免罚幸运', color: '#f59e0b' },
  ];
  return {
    id,
    kind: 'wheel',
    title,
    segments: defaultSegments,
    rotationAngle: 0,
    isSpinning: false,
    lastResult: null,
    spunBy: null,
    spinTimestamp: null,
  };
}

export function createDefaultScoreboard(
  id = 'prop_scoreboard_1',
  title = '筹码计分板',
  players: string[] = [],
  initialScore = 100,
  currencyName = '筹码',
): ScoreboardProp {
  const scores: Record<string, number> = {};
  for (const pid of players) {
    scores[pid] = initialScore;
  }
  return {
    id,
    kind: 'scoreboard',
    title,
    currencyName,
    scores,
  };
}

export function createPartySandboxState(
  players: readonly string[],
  configInput: unknown = {},
  initialProps?: SandboxProp[],
): PartySandboxState {
  if (players.length < 1 || players.length > 12) {
    throw new Error('聚会沙盒支持 1 至 12 名玩家');
  }
  const config = parsePartySandboxConfig(configInput);

  const defaultProps: SandboxProp[] = initialProps ?? [
    createDefaultRevolver(),
    createDefaultDice(),
    createDefaultBell(),
  ];

  const props: Record<string, SandboxProp> = {};
  const propOrder: string[] = [];
  for (const p of defaultProps) {
    props[p.id] = p;
    propOrder.push(p.id);
  }

  const hands: Record<string, SandboxCard[]> = {};
  for (const id of players) {
    hands[id] = [];
  }

  const now = Date.now();
  const state: PartySandboxState = {
    schemaVersion: 1,
    phase: 'sandbox',
    players: [...players],
    config,
    props,
    propOrder,
    hands,
    activityLogs: [
      {
        id: `init_${now}`,
        timestamp: now,
        playerId: 'system',
        kind: 'table',
        text: '🎪 聚会创意工坊已就绪！道具自由选择，随时召唤 AI 助手「锵锵」！',
      },
    ],
    assistantMessage: {
      text: '你好！我是 AI 小助手「锵锵」🤖！告诉我你想玩什么（比如“来一套真心话大冒险”、“准备一把1发实弹的左轮”），我随时为你布置桌面！',
      timestamp: now,
    },
  };

  assertPartySandboxInvariants(state);
  return state;
}

export function assertPartySandboxInvariants(state: PartySandboxState): void {
  if (state.schemaVersion !== 1) throw new Error('schemaVersion 必须为 1');
  if (state.phase !== 'sandbox') throw new Error('phase 必须为 sandbox');
  if (state.players.length < 1 || state.players.length > 12) {
    throw new Error(`玩家人数 ${state.players.length} 超出范围 [1, 12]`);
  }
  if (new Set(state.players).size !== state.players.length) {
    throw new Error('玩家列表中存在重复 ID');
  }
  for (const pId of state.players) {
    if (!Array.isArray(state.hands[pId])) {
      throw new Error(`玩家 ${pId} 缺少手牌列表`);
    }
  }
  for (const propId of state.propOrder) {
    const prop = state.props[propId];
    if (!prop) {
      throw new Error(`propOrder 中引用的道具 ${propId} 不在 props 字典中`);
    }
    if (prop.kind === 'wheel' && prop.segments.length < 2) {
      throw new Error(`转盘道具 ${propId} 扇区数必须至少为 2`);
    }
    if (prop.kind === 'scoreboard' && typeof prop.scores !== 'object') {
      throw new Error(`计分板道具 ${propId} 缺少 scores 字典`);
    }
  }
}

export interface ReduceContext {
  now?: number;
  random?: SandboxRandom;
}

export function reducePartySandboxState(
  state: PartySandboxState,
  actionInput: unknown,
  context: ReduceContext = {},
): PartySandboxReduceResult {
  const action = parsePartySandboxAction(actionInput);
  const now = context.now ?? Date.now();

  const pseudoRandom: SandboxRandom = context.random ?? {
    nextInt: (min, max) => Math.floor(Math.random() * (max - min)) + min,
    shuffle: (items) => [...items].sort(() => Math.random() - 0.5),
  };

  switch (action.type) {
    case 'begin': {
      return { ok: true, nextState: structuredClone(state), events: [], effects: [] };
    }

    case 'spawn_prop': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = action.prop;
      // 若是计分板，补充当前缺少的玩家键
      if (prop.kind === 'scoreboard') {
        for (const pid of next.players) {
          if (prop.scores[pid] === undefined) {
            prop.scores[pid] = 100;
          }
        }
      }
      next.props[prop.id] = prop;
      if (!next.propOrder.includes(prop.id)) {
        next.propOrder.push(prop.id);
      }
      addLog(next, action.playerId, 'table', `✨ 放置了道具【${prop.title}】`, now);

      const events: PartySandboxEvent[] = [
        { type: 'prop_spawned', propId: prop.id, kind: prop.kind },
      ];
      const effects: GameEffect[] = [
        system(`✨ 玩家 ${action.playerId} 在桌面上放置了【${prop.title}】`),
      ];
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'remove_prop': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop) return deny('道具不存在');

      delete next.props[action.propId];
      next.propOrder = next.propOrder.filter((id) => id !== action.propId);
      addLog(next, action.playerId, 'table', `🗑️ 收回了道具【${prop.title}】`, now);

      const events: PartySandboxEvent[] = [{ type: 'prop_removed', propId: action.propId }];
      const effects: GameEffect[] = [system(`🗑️ 玩家 ${action.playerId} 收回了【${prop.title}】`)];
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_revolver': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'revolver') return deny('道具不存在或不是左轮手枪');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'load') {
        const chambers = action.chambers ?? prop.chambers;
        const liveCount = action.liveCount ?? 1;
        const cylinder: ('live' | 'blank')[] = [];
        for (let i = 0; i < chambers; i++) {
          cylinder.push(i < liveCount ? 'live' : 'blank');
        }
        prop.chambers = chambers;
        prop.cylinder = pseudoRandom.shuffle(cylinder);
        prop.currentChamber = 0;
        prop.title = `左轮手枪 (${liveCount}/${chambers} 实弹)`;
        addLog(
          next,
          action.playerId,
          'revolver',
          `🔄 重新装填了左轮手枪 (${liveCount}/${chambers} 发实弹) 并旋转弹巢`,
          now,
        );
        effects.push(system(`🔄 玩家 ${action.playerId} 重新装填左轮手枪并洗乱了弹巢！`));
      } else if (action.subAction === 'spin') {
        prop.currentChamber = pseudoRandom.nextInt(0, prop.chambers);
        prop.lastAction = {
          playerId: action.playerId,
          result: 'spin',
          timestamp: now,
        };
        addLog(next, action.playerId, 'revolver', `🌀 旋转了左轮手枪的弹巢（哗啦啦——）`, now);
        effects.push(system(`🌀 玩家 ${action.playerId} 帅气地旋转了弹巢！`));
      } else if (action.subAction === 'shoot') {
        const chamberIndex = prop.currentChamber % prop.chambers;
        const bullet = prop.cylinder[chamberIndex] ?? 'blank';
        // 击发后空膛化
        prop.cylinder[chamberIndex] = 'blank';
        prop.currentChamber = (prop.currentChamber + 1) % prop.chambers;

        const targetDesc = action.targetPlayerId ? ` 对准 玩家 ${action.targetPlayerId}` : '';
        if (bullet === 'live') {
          prop.lastAction = {
            playerId: action.playerId,
            targetPlayerId: action.targetPlayerId,
            result: 'live',
            timestamp: now,
          };
          addLog(
            next,
            action.playerId,
            'revolver',
            `💥 扣动扳机${targetDesc}——【砰！实弹击发！】💥`,
            now,
          );
          effects.push(system(`💥 玩家 ${action.playerId} 扣动扳机${targetDesc}——【砰！实弹击发！】`));
        } else {
          prop.lastAction = {
            playerId: action.playerId,
            targetPlayerId: action.targetPlayerId,
            result: 'blank',
            timestamp: now,
          };
          addLog(
            next,
            action.playerId,
            'revolver',
            `💨 扣动扳机${targetDesc}——【咔哒！空包弹安全！】💨`,
            now,
          );
          effects.push(
            system(`💨 玩家 ${action.playerId} 扣动扳机${targetDesc}——【咔哒！是空包弹，安全！】`),
          );
        }
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_dice': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'dice') return deny('道具不存在或不是骰盅');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'roll') {
        const sides = prop.diceType === 'd20' ? 20 : 6;
        prop.values = Array.from({ length: prop.diceCount }, () =>
          pseudoRandom.nextInt(1, sides + 1),
        );
        prop.lastRollBy = action.playerId;
        prop.lastRollTimestamp = now;

        const sum = prop.values.reduce((a, b) => a + b, 0);
        if (prop.isCupCovered) {
          addLog(next, action.playerId, 'dice', `🎲 疯狂摇晃了骰盅（暗盅已盖住，等待揭晓）`, now);
          effects.push(system(`🎲 玩家 ${action.playerId} 疯狂摇晃了骰盅！点数已锁定在暗盅内！`));
        } else {
          addLog(
            next,
            action.playerId,
            'dice',
            `🎲 摇出了骰子点数：[${prop.values.join(', ')}]，合计 ${sum} 点！`,
            now,
          );
          effects.push(
            system(
              `🎲 玩家 ${action.playerId} 摇出 [${prop.values.join(', ')}]，合计 ${sum} 点！`,
            ),
          );
        }
      } else if (action.subAction === 'toggle_cup') {
        prop.isCupCovered = !prop.isCupCovered;
        const sum = prop.values.reduce((a, b) => a + b, 0);
        if (prop.isCupCovered) {
          addLog(next, action.playerId, 'dice', `🔒 盖上了骰盅`, now);
          effects.push(system(`🔒 玩家 ${action.playerId} 盖上了骰盅！`));
        } else {
          addLog(
            next,
            action.playerId,
            'dice',
            `✨ 开盅揭晓！骰子点数：[${prop.values.join(', ')}]，合计 ${sum} 点！`,
            now,
          );
          effects.push(
            system(
              `✨ 玩家 ${action.playerId} 开盅揭晓：[${prop.values.join(', ')}]，合计 ${sum} 点！`,
            ),
          );
        }
      } else if (action.subAction === 'set_count' && action.count) {
        prop.diceCount = action.count;
        prop.values = Array.from({ length: action.count }, () => 1);
        addLog(next, action.playerId, 'dice', `⚙️ 设置骰子数量为 ${action.count} 颗`, now);
      } else if (action.subAction === 'set_type' && action.diceType) {
        prop.diceType = action.diceType;
        prop.values = Array.from({ length: prop.diceCount }, () => 1);
        addLog(next, action.playerId, 'dice', `⚙️ 切换骰子类型为 ${action.diceType}`, now);
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_bell': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'bell') return deny('道具不存在或不是抢答铃');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'ring') {
        if (prop.rungBy === null) {
          prop.rungBy = action.playerId;
          prop.rungTimestamp = now;
        }
        prop.ringCount += 1;
        addLog(
          next,
          action.playerId,
          'bell',
          `🔔 叮铃铃！抢答铃被拍响（首位：【玩家 ${prop.rungBy}】）！`,
          now,
        );
        effects.push(system(`🔔 叮铃铃！玩家 ${action.playerId} 拍响了抢答铃！`));
      } else if (action.subAction === 'reset') {
        prop.rungBy = null;
        prop.rungTimestamp = null;
        prop.ringCount = 0;
        addLog(next, action.playerId, 'bell', `🔄 重置了抢答铃`, now);
        effects.push(system(`🔄 玩家 ${action.playerId} 重置了抢答铃，准备下一轮抢答！`));
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_deck': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'deck') return deny('道具不存在或不是卡牌堆');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'shuffle') {
        prop.drawPile = pseudoRandom.shuffle(prop.drawPile);
        addLog(next, action.playerId, 'deck', `🔀 洗乱了卡牌堆【${prop.title}】`, now);
        effects.push(system(`🔀 玩家 ${action.playerId} 洗乱了【${prop.title}】牌堆！`));
      } else if (action.subAction === 'draw') {
        if (prop.drawPile.length === 0) return deny('牌堆已空，请先洗回弃牌堆或导入卡牌');
        const card = prop.drawPile.shift()!;
        if (!next.hands[action.playerId]) next.hands[action.playerId] = [];
        next.hands[action.playerId]!.push(card);
        addLog(next, action.playerId, 'deck', `🎴 抽取了 1 张卡牌放入手牌`, now);
        effects.push(system(`🎴 玩家 ${action.playerId} 从【${prop.title}】抽了 1 张卡牌`));
      } else if (action.subAction === 'deal_all') {
        if (prop.drawPile.length < next.players.length) return deny('牌堆余量不足以全员发牌');
        for (const pId of next.players) {
          const card = prop.drawPile.shift()!;
          if (!next.hands[pId]) next.hands[pId] = [];
          next.hands[pId]!.push(card);
        }
        addLog(next, action.playerId, 'deck', `🃏 给全场每位玩家各分发了 1 张卡牌`, now);
        effects.push(system(`🃏 玩家 ${action.playerId} 为在场所有玩家各发了 1 张卡牌！`));
      } else if (action.subAction === 'play_hand') {
        const myHand = next.hands[action.playerId] ?? [];
        const cardId = action.cardId ?? myHand[0]?.id;
        if (!cardId) return deny('手牌为空，无法出牌');
        const cardIdx = myHand.findIndex((c) => c.id === cardId);
        if (cardIdx === -1) return deny('手牌中不存在该卡牌');
        const [playedCard] = myHand.splice(cardIdx, 1);
        if (!playedCard) return deny('出牌失败');

        const isPublic = action.isPublic ?? true;
        prop.tableCards.push({
          card: playedCard,
          playedBy: action.playerId,
          isPublic,
        });
        addLog(
          next,
          action.playerId,
          'deck',
          `📤 打出了卡牌【${playedCard.title}】${isPublic ? '：' + playedCard.content : '（暗置桌面）'}`,
          now,
        );
        effects.push(
          system(
            `📤 玩家 ${action.playerId} 打出了【${playedCard.title}】${isPublic ? '（公开）' : '（暗置）'}`,
          ),
        );
      } else if (action.subAction === 'discard_table') {
        const discarded = prop.tableCards.map((tc) => tc.card);
        prop.discardPile.push(...discarded);
        prop.tableCards = [];
        addLog(next, action.playerId, 'deck', `🧹 清理了桌面打出的卡牌至弃牌堆`, now);
      } else if (action.subAction === 'load_cards' && action.cards) {
        prop.drawPile = [...action.cards];
        prop.discardPile = [];
        prop.tableCards = [];
        if (action.title) prop.title = action.title;
        addLog(
          next,
          action.playerId,
          'deck',
          `📥 装载了新卡组【${prop.title}】（共 ${action.cards.length} 张）`,
          now,
        );
        effects.push(
          system(
            `📥 玩家 ${action.playerId} 为桌面装载了卡组【${prop.title}】（${action.cards.length} 张）！`,
          ),
        );
      } else if (action.subAction === 'add_card' && action.card) {
        prop.drawPile.push(action.card);
        addLog(next, action.playerId, 'deck', `➕ 追加了 1 张新卡牌【${action.card.title}】`, now);
      } else if (action.subAction === 'remove_card' && action.cardId) {
        prop.drawPile = prop.drawPile.filter((c) => c.id !== action.cardId);
        prop.discardPile = prop.discardPile.filter((c) => c.id !== action.cardId);
        prop.tableCards = prop.tableCards.filter((tc) => tc.card.id !== action.cardId);
        addLog(next, action.playerId, 'deck', `➖ 删除了 1 张卡牌`, now);
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_timer': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'timer') return deny('道具不存在或不是定时器');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'start') {
        prop.isRunning = true;
        prop.isExploded = false;
        prop.startedBy = action.playerId;
        prop.startedAt = now;
        addLog(next, action.playerId, 'timer', `⏱️ 启动了定时炸弹倒计时（${prop.remainingSeconds} 秒）`, now);
        effects.push(
          system(
            `⏱️ 玩家 ${action.playerId} 启动了【定时炸弹】倒计时！还有 ${prop.remainingSeconds} 秒！`,
          ),
        );
      } else if (action.subAction === 'pause') {
        prop.isRunning = false;
        addLog(next, action.playerId, 'timer', `⏸️ 暂停了定时炸弹`, now);
      } else if (action.subAction === 'reset') {
        prop.isRunning = false;
        prop.isExploded = false;
        prop.remainingSeconds = prop.durationSeconds;
        addLog(next, action.playerId, 'timer', `🔄 重置了定时炸弹为 ${prop.durationSeconds} 秒`, now);
      } else if (action.subAction === 'set_duration' && action.seconds) {
        prop.durationSeconds = action.seconds;
        prop.remainingSeconds = action.seconds;
        prop.isRunning = false;
        prop.isExploded = false;
        addLog(next, action.playerId, 'timer', `⚙️ 设置定时炸弹时长为 ${action.seconds} 秒`, now);
      } else if (action.subAction === 'tick') {
        if (prop.isRunning && prop.remainingSeconds > 0) {
          prop.remainingSeconds -= 1;
          if (prop.remainingSeconds <= 0) {
            prop.isRunning = false;
            prop.isExploded = true;
            addLog(next, 'system', 'timer', `💣 轰！！！定时炸弹爆炸了！时间到！`, now);
            effects.push(system(`💣 轰！！！【定时炸弹】爆炸了！时间到！`));
          }
        }
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_coin': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'coin') return deny('道具不存在或不是金币');

      const isHeads = pseudoRandom.nextInt(0, 2) === 1;
      const result = isHeads ? 'heads' : 'tails';
      prop.lastFlipResult = result;
      prop.flippedBy = action.playerId;
      prop.flipTimestamp = now;

      const desc = isHeads ? '🟡 正面（金色徽章）' : '⚪ 反面（花纹背面）';
      addLog(next, action.playerId, 'coin', `🪙 抛掷了幸运硬币，结果为：【${desc}】！`, now);

      const events: PartySandboxEvent[] = [
        { type: 'prop_operated', propId: prop.id, subAction: 'flip', playerId: action.playerId },
      ];
      const effects: GameEffect[] = [
        system(`🪙 玩家 ${action.playerId} 抛掷了硬币——【${desc}】！`),
      ];
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_wheel': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'wheel') return deny('道具不存在或不是指名转盘');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'spin') {
        const segCount = prop.segments.length;
        const pickedIdx = pseudoRandom.nextInt(0, segCount);
        const segment = prop.segments[pickedIdx] ?? { label: '中奖' };
        const segAngle = 360 / segCount;
        const targetAngle =
          (action.targetAngle ??
            prop.rotationAngle + 360 * 4 + (segCount - pickedIdx) * segAngle - segAngle / 2) %
          36000;

        prop.rotationAngle = targetAngle;
        prop.lastResult = action.result ?? segment.label;
        prop.spunBy = action.playerId;
        prop.spinTimestamp = now;
        prop.isSpinning = false;

        addLog(
          next,
          action.playerId,
          'wheel',
          `🎡 旋转了【${prop.title}】，指针最终停在：👉【${prop.lastResult}】！`,
          now,
        );
        effects.push(
          system(
            `🎡 玩家 ${action.playerId} 旋转了【${prop.title}】—— 指针停在：👉【${prop.lastResult}】！`,
          ),
        );
      } else if (action.subAction === 'set_segments' && action.segments) {
        prop.segments = action.segments;
        addLog(
          next,
          action.playerId,
          'wheel',
          `⚙️ 更新了【${prop.title}】的扇区选项（共 ${action.segments.length} 项）`,
          now,
        );
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'operate_scoreboard': {
      const next = structuredClone(state) as PartySandboxState;
      const prop = next.props[action.propId];
      if (!prop || prop.kind !== 'scoreboard') return deny('道具不存在或不是筹码计分板');

      const events: PartySandboxEvent[] = [];
      const effects: GameEffect[] = [];

      if (action.subAction === 'modify_score' && action.targetPlayerId && action.delta !== undefined) {
        const current = prop.scores[action.targetPlayerId] ?? 0;
        prop.scores[action.targetPlayerId] = current + action.delta;
        const symbol = action.delta >= 0 ? `+${action.delta}` : `${action.delta}`;
        addLog(
          next,
          action.playerId,
          'scoreboard',
          `💰 为玩家 ${action.targetPlayerId} 变更 ${prop.currencyName}：${symbol}（当前：${prop.scores[action.targetPlayerId]}）`,
          now,
        );
      } else if (action.subAction === 'reset_scores') {
        const init = action.initialScore ?? 100;
        for (const p of next.players) {
          prop.scores[p] = init;
        }
        addLog(
          next,
          action.playerId,
          'scoreboard',
          `🔄 重置全员 ${prop.currencyName} 为初始 ${init}`,
          now,
        );
        effects.push(
          system(`🔄 玩家 ${action.playerId} 重置了全员 ${prop.currencyName} 为 ${init}！`),
        );
      } else if (action.subAction === 'set_currency' && action.currencyName) {
        prop.currencyName = action.currencyName;
        addLog(next, action.playerId, 'scoreboard', `⚙️ 设置计分单位为【${action.currencyName}】`, now);
      }

      events.push({
        type: 'prop_operated',
        propId: prop.id,
        subAction: action.subAction,
        playerId: action.playerId,
      });
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'ai_setup_table': {
      const next = structuredClone(state) as PartySandboxState;
      next.assistantMessage = {
        text: action.reply,
        timestamp: now,
        prompt: action.prompt,
      };

      if (action.newProps && action.newProps.length > 0) {
        next.props = {};
        next.propOrder = [];
        for (const p of action.newProps) {
          if (p.kind === 'scoreboard') {
            for (const pid of next.players) {
              if (p.scores[pid] === undefined) p.scores[pid] = 100;
            }
          }
          next.props[p.id] = p;
          next.propOrder.push(p.id);
        }
      }

      if (action.replaceDeckCards) {
        const deckId = action.replaceDeckCards.deckId ?? 'prop_deck_1';
        next.props[deckId] = createDefaultDeck(
          deckId,
          action.replaceDeckCards.title,
          action.replaceDeckCards.cards,
        );
        if (!next.propOrder.includes(deckId)) {
          next.propOrder.unshift(deckId);
        }
      }

      addLog(
        next,
        action.playerId,
        'ai',
        `🤖 召唤了 AI 助手「锵锵」重布桌面：“${action.prompt}”`,
        now,
      );

      const events: PartySandboxEvent[] = [{ type: 'table_reset', playerId: action.playerId }];
      const effects: GameEffect[] = [
        system(`🤖 AI 助手「锵锵」响应了玩家 ${action.playerId} 的需求：“${action.prompt}”！`),
      ];
      assertPartySandboxInvariants(next);
      return { ok: true, nextState: next, events, effects };
    }

    case 'reset_table': {
      const next = createPartySandboxState(state.players, state.config);
      addLog(next, action.playerId, 'table', `🧹 清空并重置了桌面到初始状态`, now);
      const events: PartySandboxEvent[] = [{ type: 'table_reset', playerId: action.playerId }];
      const effects: GameEffect[] = [
        system(`🧹 玩家 ${action.playerId} 清空并重置了桌面道具至初始状态！`),
      ];
      return { ok: true, nextState: next, events, effects };
    }

    case 'player_forfeited': {
      const next = structuredClone(state) as PartySandboxState;
      addLog(next, 'system', 'table', `🚪 玩家离场结算`, now);
      return { ok: true, nextState: next, events: [], effects: [] };
    }

    default:
      return deny('未知沙盒动作');
  }
}
