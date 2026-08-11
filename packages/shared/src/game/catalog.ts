import type { GameRulesetSpec, GameSetupSpec } from './rules/setup.ts';
import { buildRulesetRegistry, type GameRulesetEntry, type RulesetRegistry } from './rulesetRegistry.ts';

/**
 * 首页游戏目录：同时供客户端展示和服务端校验使用。
 * `playable` 必须有对应的服务端 GameModule；其他状态均不能建房。
 */
export const GAME_AVAILABILITY = ['playable', 'coming_soon', 'internal_prototype', 'blocked_rights'] as const;
export type GameAvailability = (typeof GAME_AVAILABILITY)[number];

export const GAME_THEMES = ['berry', 'sunset', 'mint', 'violet', 'ocean'] as const;
export type GameTheme = (typeof GAME_THEMES)[number];

export const GAME_BOT_SUPPORT = ['none', 'rule', 'rule_and_llm'] as const;
export type GameBotSupport = (typeof GAME_BOT_SUPPORT)[number];

export interface GameVisualTheme {
  accent: GameTheme;
  surface: 'cards' | 'social' | 'board';
}

export interface GameCatalogEntry {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  availability: GameAvailability;
  summary: string;
  tags: readonly string[];
  theme: GameTheme;
  rulesets: readonly GameRulesetSpec[];
  setup: GameSetupSpec;
  botSupport: GameBotSupport;
  visualTheme: GameVisualTheme;
  comingSoonMessage?: string;
}

function defaultSetup(
  rulesetId: string,
  label: string,
  options: GameSetupSpec['options'] = [],
  moduleConfig: Readonly<Record<string, string | number | boolean>> = {},
  extraRulesets: readonly GameRulesetSpec[] = [],
): GameSetupSpec {
  return {
    rulesets: [{ id: rulesetId, label }, ...extraRulesets],
    defaultRulesetId: rulesetId,
    options,
    defaultConfig: { rulesetId, ...moduleConfig },
  };
}

export const GAME_CATALOG = [
  {
    id: 'undercover',
    displayName: '谁是卧底',
    minPlayers: 4,
    maxPlayers: 12,
    availability: 'playable',
    summary: '每人获得专属词条，用巧妙描述传递信息，找出隐藏在人群中的卧底！',
    tags: ['推理', '轻松', '语言表达'],
    theme: 'berry',
    rulesets: [
      { id: 'undercover_classic_v1', label: '平台经典兼容基线' },
      { id: 'undercover_blank_v1', label: '白板变体' },
    ],
    setup: defaultSetup('undercover_classic_v1', '平台经典兼容基线', [
      { key: 'speechSeconds', kind: 'integer', label: '发言时间（秒）', defaultValue: 60, min: 30, max: 90, step: 30 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时间（秒）', defaultValue: 45, min: 30, max: 60, step: 15 },
    ], { speechSeconds: 60, voteSeconds: 45 }, [
      { id: 'undercover_blank_v1', label: '白板变体' },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'berry', surface: 'social' },
  },
  {
    id: 'uno',
    displayName: 'UNO',
    minPlayers: 2,
    maxPlayers: 6,
    availability: 'blocked_rights',
    summary: '颜色、数字与功能卡牌的激情碰撞！最后一张牌时刻别忘了高喊 UNO！',
    tags: ['卡牌', '轻松', '快节奏'],
    theme: 'sunset',
    rulesets: [
      { id: 'uno_legacy_platform_v1', label: 'Legacy 兼容基线' },
      { id: 'uno_platform_house_v1', label: '平台房规' },
    ],
    setup: defaultSetup('uno_legacy_platform_v1', 'Legacy 兼容基线', [], { variant: 'standard' }, [
      { id: 'uno_platform_house_v1', label: '平台房规' },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'sunset', surface: 'cards' },
    comingSoonMessage: '权利证据未完成，暂不开放',
  },
  {
    id: 'landlord',
    displayName: '斗地主',
    minPlayers: 3,
    maxPlayers: 3,
    availability: 'playable',
    summary: '经典三人欢乐对决，叫分抢庄、妙算牌型与队友默契缺一不可！',
    tags: ['卡牌', '策略', '经典'],
    theme: 'mint',
    rulesets: [
      { id: 'landlord_platform_v1', label: '平台规则' },
      { id: 'landlord_legacy_platform_v1', label: 'Legacy 兼容基线' },
    ],
    setup: defaultSetup('landlord_platform_v1', '平台规则', [], { variant: 'standard' }, [
      { id: 'landlord_legacy_platform_v1', label: 'Legacy 兼容基线' },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'mint', surface: 'cards' },
  },
  {
    id: 'werewolf',
    displayName: '狼人杀',
    minPlayers: 6,
    maxPlayers: 12,
    availability: 'playable',
    summary: '暗夜交锋，白天博弈！用逻辑与敏锐洞察在真伪间探寻胜利之光。',
    tags: ['推理', '阵营', '社交'],
    theme: 'violet',
    rulesets: [
      { id: 'werewolf_legacy_platform_v2', label: 'Legacy v2 兼容基线' },
      { id: 'werewolf_platform_open_kill_v1', label: '开放夜刀' },
    ],
    setup: defaultSetup('werewolf_legacy_platform_v2', 'Legacy v2 兼容基线', [
      { key: 'pace', kind: 'select', label: '对局节奏', defaultValue: 'standard', choices: [{ value: 'fast', label: '快速' }, { value: 'standard', label: '标准' }, { value: 'relaxed', label: '轻松' }] },
      { key: 'witchSelfSave', kind: 'select', label: '女巫自救', defaultValue: 'first_night', choices: [{ value: 'first_night', label: '仅首夜' }, { value: 'never', label: '禁止' }, { value: 'always', label: '允许' }] },
      { key: 'winCondition', kind: 'select', label: '胜负条件', defaultValue: 'numbers', choices: [{ value: 'numbers', label: '屠边人数' }, { value: 'roles', label: '屠神规则' }] },
    ], { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers' }, [
      { id: 'werewolf_platform_open_kill_v1', label: '开放夜刀' },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'violet', surface: 'social' },
  },
  {
    id: 'durian',
    displayName: 'Durian：榴莲店长',
    minPlayers: 2,
    maxPlayers: 7,
    availability: 'playable',
    summary: '原创水果卡牌经营对局：按铃接单、管理库存与怒气，小心超卖赔穿！',
    tags: ['卡牌', '经营', '原创'],
    theme: 'ocean',
    rulesets: [
      { id: 'durian_orchard_v1', label: '平台规则' },
    ],
    setup: defaultSetup('durian_orchard_v1', '平台规则'),
    botSupport: 'none',
    visualTheme: { accent: 'ocean', surface: 'board' },
  },
  {
    id: 'loveletter',
    displayName: '情书：密函心意',
    minPlayers: 2,
    maxPlayers: 4,
    availability: 'playable',
    summary: '经典 16 张密函手牌：揣测心意、淘汰对手，把情书送到公主手中。',
    tags: ['卡牌', '推理', '经典'],
    theme: 'sunset',
    rulesets: [
      { id: 'loveletter_classic16_v1', label: '平台规则' },
    ],
    setup: defaultSetup('loveletter_classic16_v1', '平台规则'),
    botSupport: 'none',
    visualTheme: { accent: 'sunset', surface: 'cards' },
  },
  {
    id: 'cheese-thief',
    displayName: '奶酪大盗：月夜鼠影',
    minPlayers: 4,
    maxPlayers: 8,
    availability: 'playable',
    summary: '原版《Cheese Thief》机制：掷骰定醒来时刻、独醒偷奶酪、共犯与平票同出局。线下桌游辅助工具。',
    tags: ['推理', '阵营', '聚会'],
    theme: 'mint',
    rulesets: [
      { id: 'cheese_thief_classic_v1', label: '原版规则基线' },
    ],
    setup: defaultSetup('cheese_thief_classic_v1', '原版规则基线', [
      { key: 'roleCards', kind: 'boolean', label: '启用身份卡（猫/狗/白老鼠）', defaultValue: false },
      { key: 'nightHourSeconds', kind: 'integer', label: '每时刻时长（秒）', defaultValue: 10, min: 1, max: 600, step: 1 },
      { key: 'discussionSeconds', kind: 'integer', label: '讨论时长（秒）', defaultValue: 120, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
    ]),
    botSupport: 'none',
    visualTheme: { accent: 'mint', surface: 'board' },
  },
  {
    id: 'goose-relay',
    displayName: '以鹅传鹅：鹅鹅密令',
    minPlayers: 5,
    maxPlayers: 9,
    availability: 'playable',
    summary: '原版《以鹅传鹅》机制：头鹅读案、逐棒传递、从末位逐一指认、投票揪恶。线下桌游辅助工具。',
    tags: ['传递', '阵营', '聚会'],
    theme: 'sunset',
    rulesets: [
      { id: 'goose_relay_classic_v1', label: '原版规则基线' },
    ],
    setup: defaultSetup('goose_relay_classic_v1', '原版规则基线', [
      { key: 'relaySeconds', kind: 'integer', label: '每节点传递时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'discussionSeconds', kind: 'integer', label: '讨论时长（秒，0=跳过）', defaultValue: 60, min: 0, max: 600, step: 1 },
      { key: 'accuseSeconds', kind: 'integer', label: '每人指认时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
    ]),
    botSupport: 'none',
    visualTheme: { accent: 'sunset', surface: 'board' },
  },
  {
    id: 'night-testimony',
    displayName: '暗夜证词',
    minPlayers: 3,
    maxPlayers: 6,
    availability: 'playable',
    summary: '原版《囚徒之夜》机制：狱警伪装潜伏、YES/NO 问答轨迹、推理混卡、票选揪警与猜罪。线下桌游辅助工具。',
    tags: ['推理', '身份', '聚会'],
    theme: 'violet',
    rulesets: [
      { id: 'night_testimony_v1', label: '原版规则基线' },
    ],
    setup: defaultSetup('night_testimony_v1', '原版规则基线', [
      { key: 'questionSeconds', kind: 'integer', label: '问答阶段时长（秒）', defaultValue: 120, min: 1, max: 600, step: 1 },
      { key: 'deductionSeconds', kind: 'integer', label: '推理时长（秒）', defaultValue: 60, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'questionLimit', kind: 'integer', label: '问答上限（次）', defaultValue: 5, min: 1, max: 12, step: 1 },
    ]),
    botSupport: 'none',
    visualTheme: { accent: 'violet', surface: 'board' },
  },
  {
    id: 'bell-clash',
    displayName: '铃铛对决',
    minPlayers: 2,
    maxPlayers: 7,
    availability: 'playable',
    summary: '原版《Ding! 眼急脑快》机制：UNO 式出牌 + 行动短语卡 + 按铃抢回合，先打完手牌者胜。线下桌游辅助工具。',
    tags: ['反应', '卡牌', '聚会'],
    theme: 'berry',
    rulesets: [
      { id: 'bell_clash_v1', label: '原版规则基线' },
    ],
    setup: defaultSetup('bell_clash_v1', '原版规则基线', [
      { key: 'handSize', kind: 'integer', label: '每人手牌数', defaultValue: 8, min: 1, max: 12, step: 1 },
      { key: 'turnSeconds', kind: 'integer', label: '出牌时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'bellSeconds', kind: 'integer', label: '按铃窗口（秒）', defaultValue: 10, min: 1, max: 600, step: 1 },
    ]),
    botSupport: 'none',
    visualTheme: { accent: 'berry', surface: 'board' },
  },
  {
    id: 'echo-judge',
    displayName: '伪人测试',
    minPlayers: 3,
    maxPlayers: 12,
    availability: 'playable',
    summary: '原版《伪人测试》判官模式：判官出题、伪人藏触发词、依次回答、判官指认。线下桌游辅助工具。',
    tags: ['伪装', '推理', '聚会'],
    theme: 'sunset',
    rulesets: [
      { id: 'echo_judge_v1', label: '原版规则基线' },
    ],
    setup: defaultSetup('echo_judge_v1', '原版规则基线', [
      { key: 'answerSeconds', kind: 'integer', label: '每人回答时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'judgmentSeconds', kind: 'integer', label: '判官指认时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'judgeWrongPenalty', kind: 'integer', label: '判官抓错扣分', defaultValue: -1, min: -10, max: 0, step: 1 },
    ]),
    botSupport: 'none',
    visualTheme: { accent: 'sunset', surface: 'social' },
  },
] as const satisfies readonly GameCatalogEntry[];

export type GameId = (typeof GAME_CATALOG)[number]['id'];

/** 依据规则集 ID 推断其在平台中的类别（legacy/classic 兼容基线 vs 平台变体）。 */
function classifyRulesetKind(rulesetId: string): GameRulesetEntry['kind'] {
  return rulesetId.includes('legacy') || rulesetId.includes('classic')
    ? 'legacy_compatibility'
    : 'platform_variant';
}

function catalogEntriesForGame(game: GameCatalogEntry): readonly GameRulesetEntry[] {
  return game.rulesets.map((ruleset) => ({
    gameId: game.id,
    rulesetId: ruleset.id,
    kind: classifyRulesetKind(ruleset.id),
    defaultForGame: ruleset.id === game.setup.defaultRulesetId,
  }));
}

/**
 * 用共享规则集注册表校验目录：每款游戏至少一个规则集、规则集 ID 每游戏唯一、必须有默认规则集。
 * 传入非法目录（空规则集、重复 ID、缺默认）会直接抛错。
 */
export function buildCatalogRulesetRegistry(
  catalog: readonly GameCatalogEntry[] = GAME_CATALOG,
): RulesetRegistry {
  const entries = catalog.flatMap((game) => {
    if (game.rulesets.length === 0) {
      throw new Error(`目录游戏 ${game.id} 没有任何规则集`);
    }
    return catalogEntriesForGame(game);
  });
  return buildRulesetRegistry(entries);
}

/** 模块加载时即校验目录规则集一致性；目录非法直接抛错。 */
export const CATALOG_RULESET_REGISTRY: RulesetRegistry = buildCatalogRulesetRegistry();

/** 首页提供的精确人数筛选项。 */
export const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type PlayerCount = (typeof PLAYER_COUNT_OPTIONS)[number];

/** 判断一款游戏是否适合当前精确人数。 */
export function matchesPlayerCount(game: GameCatalogEntry, playerCount: number): boolean {
  return Number.isInteger(playerCount) && playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
}

/** 返回生产目录中适合当前人数的可展示游戏。 */
export function listGamesForPlayerCount(playerCount: number | null | undefined): readonly GameCatalogEntry[] {
  const catalog: readonly GameCatalogEntry[] = GAME_CATALOG;
  const visible = catalog.filter((game) => game.availability === 'playable' || game.availability === 'coming_soon');
  if (playerCount === null || playerCount === undefined) return visible;
  return visible.filter((game) => matchesPlayerCount(game, playerCount));
}

export const DEFAULT_PLAYABLE_GAME_ID: GameId | null = null;

export function listGameCatalog(): readonly GameCatalogEntry[] {
  return GAME_CATALOG;
}

export function getGameCatalogEntry(id: string | null | undefined): GameCatalogEntry | undefined {
  return GAME_CATALOG.find((game) => game.id === id);
}

export function getPlayableGameCatalogEntry(id: string | null | undefined): GameCatalogEntry | undefined {
  const game = getGameCatalogEntry(id);
  return game?.availability === 'playable' ? game : undefined;
}

export function isKnownGameId(id: string): id is GameId {
  return getGameCatalogEntry(id) !== undefined;
}
