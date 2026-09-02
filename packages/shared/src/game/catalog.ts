import type { GameRulesetSpec, GameSetupSpec } from './rules/setup.ts';
import { buildRulesetRegistry, type GameRulesetEntry, type RulesetRegistry } from './rulesetRegistry.ts';

/**
 * 首页游戏目录：同时供客户端展示和服务端校验使用。
 * `playable` 必须有对应的服务端 GameModule；其他状态均不能建房。
 */
export const GAME_AVAILABILITY = ['playable', 'coming_soon', 'internal_prototype', 'blocked_rights'] as const;
export type GameAvailability = (typeof GAME_AVAILABILITY)[number];

export const GAME_THEMES = ['berry', 'sunset', 'mint', 'violet', 'ocean', 'cyan'] as const;
export type GameTheme = (typeof GAME_THEMES)[number];

export const GAME_BOT_SUPPORT = ['none', 'rule', 'rule_and_llm'] as const;
export type GameBotSupport = (typeof GAME_BOT_SUPPORT)[number];

/**
 * 游戏成熟度等级（登记规范 M1–M4）：
 * - M1 规则就绪·UI 毛坯（通用壳占位，能跑完一局）
 * - M2 可用未美（功能 UI 完整、e2e 通过，无专属美术）
 * - M3 UI 完整（专属美术/动效/多分辨率适配，未真机实测）
 * - M4 可正常游玩（真机多人实测、弱网验证、无已知严重 bug）
 */
export const GAME_MATURITY = ['M1', 'M2', 'M3', 'M4'] as const;
export type GameMaturity = (typeof GAME_MATURITY)[number];

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
  maturity: GameMaturity;
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
  defaultRuleset: GameRulesetSpec | string,
  labelOrOptions?: string | GameSetupSpec['options'],
  optionsOrModuleConfig?: GameSetupSpec['options'] | Readonly<Record<string, string | number | boolean>>,
  moduleConfigOrExtra?: Readonly<Record<string, string | number | boolean>> | readonly GameRulesetSpec[],
  extraRulesets: readonly GameRulesetSpec[] = [],
): GameSetupSpec {
  let spec: GameRulesetSpec;
  let options: GameSetupSpec['options'] = [];
  let moduleConfig: Readonly<Record<string, string | number | boolean>> = {};
  let extras: readonly GameRulesetSpec[] = [];

  if (typeof defaultRuleset === 'object') {
    spec = defaultRuleset;
    options = (labelOrOptions as GameSetupSpec['options']) ?? [];
    moduleConfig = (optionsOrModuleConfig as Readonly<Record<string, string | number | boolean>>) ?? {};
    extras = (moduleConfigOrExtra as readonly GameRulesetSpec[]) ?? [];
  } else {
    spec = { id: defaultRuleset, label: labelOrOptions as string };
    options = (optionsOrModuleConfig as GameSetupSpec['options']) ?? [];
    moduleConfig = (moduleConfigOrExtra as Readonly<Record<string, string | number | boolean>>) ?? {};
    extras = extraRulesets;
  }

  const optionDefaults = Object.fromEntries(options.map((opt) => [opt.key, opt.defaultValue]));
  return {
    rulesets: [spec, ...extras],
    defaultRulesetId: spec.id,
    options,
    defaultConfig: { rulesetId: spec.id, ...optionDefaults, ...moduleConfig },
  };
}

export const GAME_CATALOG = [
  {
    id: 'undercover',
    displayName: '谁是卧底',
    minPlayers: 4,
    maxPlayers: 12,
    availability: 'playable',
    maturity: 'M4',
    summary: '每人获得专属词条，用巧妙描述传递信息，找出隐藏在人群中的卧底！',
    tags: ['推理', '轻松', '语言表达'],
    theme: 'berry',
    rulesets: [
      {
        id: 'undercover_classic_v1',
        label: '经典模式（每人都有词条）',
        description: '平民与卧底各获得一组相似的词条，通过语言描述找出潜伏卧底！',
        details: [
          '【平民与卧底】平民拿相同多数词，卧底拿意思相近的专属少数词。',
          '【依次发言】每轮按顺序发言描述自己的词条，不可直接说出关键词。',
          '【投票放逐】全员投票找出卧底，卧底全灭好人胜，卧底存活到最后卧底胜。',
        ],
      },
      {
        id: 'undercover_blank_v1',
        label: '白板模式（白板玩家无词条）',
        description: '加入拿到空白档案的白板玩家，全程盲猜伪装，更支持主动猜词反杀！',
        details: [
          '【白板身份】白板玩家看到的词条为空白，必须全凭听别人发言伪装。',
          '【猜词反杀】白板可在对局中随时或出局时主动猜平民词，猜对直接获胜！',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'undercover_classic_v1',
      label: '经典模式（每人都有词条）',
      description: '平民与卧底各获得一组相似的词条，通过语言描述找出潜伏卧底！',
      details: [
        '【平民与卧底】平民拿相同多数词，卧底拿意思相近的专属少数词。',
        '【依次发言】每轮按顺序发言描述自己的词条，不可直接说出关键词。',
        '【投票放逐】全员投票找出卧底，卧底全灭好人胜，卧底存活到最后卧底胜。',
      ],
    }, [
      {
        key: 'speechSeconds',
        kind: 'segmented',
        label: '每人发言时长',
        description: '默认 60 秒适合大多数局，直接开局不用调',
        defaultValue: 60,
        choices: [
          { value: 30, label: '30 秒 · 快' },
          { value: 60, label: '60 秒 · 适中' },
          { value: 90, label: '90 秒 · 细聊' },
        ],
      },
      {
        key: 'voteSeconds',
        kind: 'segmented',
        label: '投票思考时长',
        description: '默认 45 秒适合大多数局，直接开局不用调',
        defaultValue: 45,
        choices: [
          { value: 30, label: '30 秒 · 快投' },
          { value: 45, label: '45 秒 · 适中' },
          { value: 60, label: '60 秒 · 细想' },
        ],
      },
    ], { speechSeconds: 60, voteSeconds: 45 }, [
      {
        id: 'undercover_blank_v1',
        label: '白板模式（白板玩家无词条）',
        description: '加入拿到空白档案的白板玩家，全程盲猜伪装，更支持主动猜词反杀！',
        details: [
          '【白板身份】白板玩家看到的词条为空白，必须全凭听别人发言伪装。',
          '【猜词反杀】白板可在对局中随时或出局时主动猜平民词，猜对直接获胜！',
        ],
      },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'berry', surface: 'social' },
  },
  {
    id: 'uno',
    displayName: 'UNO',
    minPlayers: 2,
    maxPlayers: 6,
    availability: 'playable',
    maturity: 'M4',
    summary: '颜色、数字与功能卡牌的激情碰撞！最后一张牌时刻别忘了高喊 UNO！',
    tags: ['卡牌', '轻松', '快节奏'],
    theme: 'sunset',
    rulesets: [
      {
        id: 'uno_platform_house_v1',
        label: '欢乐房规（可叠牌 · 抓漏报 · 积分赛）',
        description: '聚会最推荐！支持 +2/+4 连续叠牌甩锅、出到剩 1 张未提前喊有 5 秒抓漏报抢按、多局积分累计决出总冠军。',
        details: [
          '【罚牌叠加】受到 +2 时可出 +2 叠给下家累积罚牌，接不上者摸走全部罚牌。',
          '【抓漏报】出到剩 1 张未提前喊 UNO，其他玩家可在 5 秒内抢按抓漏报罚摸 2 张。',
          '【质疑 +4】怀疑上家手里有同色牌却强出 +4 时可发起质疑，抓对上家摸 4 张，猜错自己摸 6 张。',
          '【多局积分】每局赢家吃掉输家手牌点数，累计积分决胜，支持 4 人组队赛。',
        ],
      },
      {
        id: 'uno_legacy_platform_v1',
        label: '经典单局（不叠牌 · 抢先出完即胜）',
        description: '适合快速来一把！单局定胜负，不支持罚牌叠加，不可抓漏报，手牌剩 1 张随时可喊 UNO。',
        details: [
          '【单局决胜】谁先出完手中所有牌直接胜出，无需计算多局累计积分。',
          '【不可叠加】上家出 +2 时必须直接摸 2 张并跳过本轮，不可出 +2 甩锅。',
          '【随时自喊】手牌剩 1 张时随时可点击喊 UNO，其他玩家不能抓漏报。',
          '【顺畅过牌】摸牌后若无可出牌自动过牌，不会出现卡局。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'uno_platform_house_v1',
      label: '欢乐房规（可叠牌 · 抓漏报 · 积分赛）',
      description: '聚会最推荐！支持 +2/+4 连续叠牌甩锅、出到剩 1 张未提前喊有 5 秒抓漏报抢按、多局积分累计决出总冠军。',
      details: [
        '【罚牌叠加】受到 +2 时可出 +2 叠给下家累积罚牌，接不上者摸走全部罚牌。',
        '【抓漏报】出到剩 1 张未提前喊 UNO，其他玩家可在 5 秒内抢按抓漏报罚摸 2 张。',
        '【质疑 +4】怀疑上家手里有同色牌却强出 +4 时可发起质疑，抓对上家摸 4 张，猜错自己摸 6 张。',
        '【多局积分】每局赢家吃掉输家手牌点数，累计积分决胜，支持 4 人组队赛。',
      ],
    }, [
      {
        key: 'mode',
        kind: 'select',
        label: '对局模式',
        defaultValue: 'individual',
        choices: [
          { value: 'individual', label: '个人赛' },
          { value: 'team', label: '组队赛（4人）' },
        ],
      },
      {
        key: 'roundCount',
        kind: 'segmented',
        label: '总局数',
        defaultValue: 3,
        choices: [
          { value: 1, label: '1 局' },
          { value: 3, label: '3 局' },
          { value: 5, label: '5 局' },
          { value: 7, label: '7 局' },
        ],
      },
    ], { mode: 'individual', roundCount: 3, variant: 'standard' }, [
      {
        id: 'uno_legacy_platform_v1',
        label: '经典单局（不叠牌 · 抢先出完即胜）',
        description: '适合快速来一把！单局定胜负，不支持罚牌叠加，不可抓漏报，手牌剩 1 张随时可喊 UNO。',
        details: [
          '【单局决胜】谁先出完手中所有牌直接胜出，无需计算多局累计积分。',
          '【不可叠加】上家出 +2 时必须直接摸 2 张并跳过本轮，不可出 +2 甩锅。',
          '【随时自喊】手牌剩 1 张时随时可点击喊 UNO，其他玩家不能抓漏报。',
          '【顺畅过牌】摸牌后若无可出牌自动过牌，不会出现卡局。',
        ],
      },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'sunset', surface: 'cards' },
  },
  {
    id: 'landlord',
    displayName: '斗地主',
    minPlayers: 3,
    maxPlayers: 3,
    availability: 'playable',
    maturity: 'M4',
    summary: '经典三人欢乐对决，叫分抢庄、妙算牌型与队友默契缺一不可！',
    tags: ['卡牌', '策略', '经典'],
    theme: 'mint',
    rulesets: [
      {
        id: 'landlord_platform_v1',
        label: '抢地主模式（叫分抢庄 · 翻倍更刺激）',
        description: '首位玩家叫地主后可继续抢地主，每次抢庄底分倍数 ×2，支持炸弹、火箭与春天翻倍。',
        details: [
          '【叫地主与抢地主】发牌后依次叫地主与抢地主，每次抢庄倍数翻倍。',
          '【炸弹火箭翻倍】打出炸弹或王炸倍数翻倍，春天与反春同样翻倍。',
          '【经典牌型】顺子、连对、飞机带翅膀、四带二、王炸全支持。',
        ],
      },
      {
        id: 'landlord_legacy_platform_v1',
        label: '经典叫分（1/2/3分直接定庄）',
        description: '传统经典三人叫分，叫最高分者（或叫 3 分）直接当局地主，无后续抢地主环节。',
        details: [
          '【叫分定地主】依次叫 1分、2分 或 3分，叫分最高者直接拿底牌当地主。',
          '【基础计分】按叫分与基础胜负结算，没有多次抢地主翻倍流程。',
          '【经典出牌】地主对战两农民，先出完手中全部牌的一方获胜。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'landlord_platform_v1',
      label: '抢地主模式（叫分抢庄 · 翻倍更刺激）',
      description: '首位玩家叫地主后可继续抢地主，每次抢庄底分倍数 ×2，支持炸弹、火箭与春天翻倍。',
      details: [
        '【叫地主与抢地主】发牌后依次叫地主与抢地主，每次抢庄倍数翻倍。',
        '【炸弹火箭翻倍】打出炸弹或王炸倍数翻倍，春天与反春同样翻倍。',
        '【经典牌型】顺子、连对、飞机带翅膀、四带二、王炸全支持。',
      ],
    }, [], { variant: 'standard' }, [
      {
        id: 'landlord_legacy_platform_v1',
        label: '经典叫分（1/2/3分直接定庄）',
        description: '传统经典三人叫分，叫最高分者（或叫 3 分）直接当局地主，无后续抢地主环节。',
        details: [
          '【叫分定地主】依次叫 1分、2分 或 3分，叫分最高者直接拿底牌当地主。',
          '【基础计分】按叫分与基础胜负结算，没有多次抢地主翻倍流程。',
          '【经典出牌】地主对战两农民，先出完手中全部牌的一方获胜。',
        ],
      },
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
    maturity: 'M4',
    summary: '暗夜交锋，白天博弈！用逻辑与敏锐洞察在真伪间探寻胜利之光。',
    tags: ['推理', '阵营', '社交'],
    theme: 'violet',
    rulesets: [
      {
        id: 'werewolf_legacy_platform_v2',
        label: '标准屠边（狼人夜间只杀好人）',
        description: '经典狼人杀规则，狼人夜间只可袭击非狼人阵营玩家；女巫首夜可自救。',
        details: [
          '【屠边胜负】狼人杀光所有神职或所有平民获胜；好人放逐所有狼人获胜。',
          '【夜刀限制】狼人夜间只能选择非狼人玩家作为袭击目标。',
          '【角色技能】支持预言家、女巫、猎人、守卫与白痴多种神职组合。',
        ],
      },
      {
        id: 'werewolf_platform_open_kill_v1',
        label: '开放夜刀（狼人夜间可刀任何人）',
        description: '策略进阶规则，狼人夜间可袭击包括狼队友在内的任意存活玩家（支持自刀骗药或深水战术）。',
        details: [
          '【开放夜刀】狼人夜间可将目标选为任意存活玩家（包含狼人自己与队友）。',
          '【战术博弈】支持狼人自刀骗取女巫解药或制造假银水身份。',
          '【胜负标准】同标准屠边胜负判定，考验更深层的逻辑与心理战。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'werewolf_legacy_platform_v2',
      label: '标准屠边（狼人夜间只杀好人）',
      description: '经典狼人杀规则，狼人夜间只可袭击非狼人阵营玩家；女巫首夜可自救。',
      details: [
        '【屠边胜负】狼人杀光所有神职或所有平民获胜；好人放逐所有狼人获胜。',
        '【夜刀限制】狼人夜间只能选择非狼人玩家作为袭击目标。',
        '【角色技能】支持预言家、女巫、猎人、守卫与白痴多种神职组合。',
      ],
    }, [
      { key: 'pace', kind: 'select', label: '对局节奏', defaultValue: 'standard', choices: [{ value: 'fast', label: '快速' }, { value: 'standard', label: '标准' }, { value: 'relaxed', label: '轻松' }] },
      { key: 'witchSelfSave', kind: 'select', label: '女巫自救', defaultValue: 'first_night', choices: [{ value: 'first_night', label: '仅首夜' }, { value: 'never', label: '禁止' }, { value: 'always', label: '允许' }] },
      { key: 'winCondition', kind: 'select', label: '胜负条件', defaultValue: 'numbers', choices: [{ value: 'numbers', label: '屠边人数' }, { value: 'roles', label: '屠神规则' }] },
      { key: 'guard', kind: 'boolean', label: '守卫加入角色池', defaultValue: false },
      { key: 'hunter', kind: 'boolean', label: '猎人加入角色池', defaultValue: false },
      { key: 'idiot', kind: 'boolean', label: '白痴加入角色池', defaultValue: false },
    ], { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers', guard: false, hunter: false, idiot: false }, [
      {
        id: 'werewolf_platform_open_kill_v1',
        label: '开放夜刀（狼人夜间可刀任何人）',
        description: '策略进阶规则，狼人夜间可袭击包括狼队友在内的任意存活玩家（支持自刀骗药或深水战术）。',
        details: [
          '【开放夜刀】狼人夜间可将目标选为任意存活玩家（包含狼人自己与队友）。',
          '【战术博弈】支持狼人自刀骗取女巫解药或制造假银水身份。',
          '【胜负标准】同标准屠边胜负判定，考验更深层的逻辑与心理战。',
        ],
      },
    ]),
    botSupport: 'rule_and_llm',
    visualTheme: { accent: 'violet', surface: 'social' },
  },
  {
    id: 'durian',
    displayName: 'DURING',
    minPlayers: 2,
    maxPlayers: 7,
    availability: 'playable',
    maturity: 'M3',
    summary: '头顶暗牌（只看别人不看自己）、翻牌自选生效、猴子捣乱与按铃质疑超卖！',
    tags: ['推理', '心理', '聚会'],
    theme: 'mint',
    rulesets: [
      {
        id: 'durian_orchard_v1',
        label: '标准规则（翻牌暗牌 · 质疑超卖）',
        description: '头顶暗牌只看别人不看自己，轮流翻牌决定水果进货，怀疑超卖即按铃质疑！',
        details: [
          '【头顶暗牌】开局每人抽一张牌扣在头顶，自己看不见，其他所有人可见。',
          '【翻牌进货】轮到自己时摸牌选择一侧水果生效，累计桌面上进货总数。',
          '【按铃质疑】认为桌面上某种水果总数超过所有人头顶该水果的总和时，按铃质疑上家。',
          '【猴子功能】猴子牌可触发翻转卡牌、跳过回合或使特定水果无效。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'durian_orchard_v1',
      label: '标准规则（翻牌暗牌 · 质疑超卖）',
      description: '头顶暗牌只看别人不看自己，轮流翻牌决定水果进货，怀疑超卖即按铃质疑！',
      details: [
        '【头顶暗牌】开局每人抽一张牌扣在头顶，自己看不见，其他所有人可见。',
        '【翻牌进货】轮到自己时摸牌选择一侧水果生效，累计桌面上进货总数。',
        '【按铃质疑】认为桌面上某种水果总数超过所有人头顶该水果的总和时，按铃质疑上家。',
        '【猴子功能】猴子牌可触发翻转卡牌、跳过回合或使特定水果无效。',
      ],
    }, [
      {
        key: 'mode',
        kind: 'select',
        label: '对局模式',
        defaultValue: 'standard',
        choices: [
          { value: 'standard', label: '标准模式（系统判定）' },
          { value: 'simulator', label: '桌面互动模式（手机立牌 + 公共看板）' },
        ],
      },
      {
        key: 'maxRounds',
        kind: 'integer',
        label: '轮数上限（轮）',
        defaultValue: 7,
        min: 1,
        max: 14,
        step: 1,
      },
    ]),
    botSupport: 'rule',
    visualTheme: { accent: 'mint', surface: 'board' },
  },
  {
    id: 'loveletter',
    displayName: '情书',
    minPlayers: 2,
    maxPlayers: 4,
    availability: 'playable',
    maturity: 'M3',
    summary: '经典 16 张手牌：揣测心意、淘汰对手，把情书送到公主手中。',
    tags: ['卡牌', '推理', '经典'],
    theme: 'sunset',
    rulesets: [
      {
        id: 'loveletter_classic16_v1',
        label: '经典 16 张（单张手牌 · 逻辑淘汰）',
        description: '16 张卡牌构成的推理神作：手中恒持 1 张牌，摸 1 出 1 发动角色技能淘汰对手。',
        details: [
          '【摸一出一】回合开始摸一张牌，从手中两张牌里打出一张并执行其效果。',
          '【角色技能】卫兵猜牌淘汰、神父看牌、男爵比点数、侍女免疫、王子弃牌、国王换牌、公主离手即死。',
          '【最终胜负】牌堆耗尽时手牌点数最大者获胜，或全场只剩最后一人存活直接获胜。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'loveletter_classic16_v1',
      label: '经典 16 张（单张手牌 · 逻辑淘汰）',
      description: '16 张卡牌构成的推理神作：手中恒持 1 张牌，摸 1 出 1 发动角色技能淘汰对手。',
      details: [
        '【摸一出一】回合开始摸一张牌，从手中两张牌里打出一张并执行其效果。',
        '【角色技能】卫兵猜牌淘汰、神父看牌、男爵比点数、侍女免疫、王子弃牌、国王换牌、公主离手即死。',
        '【最终胜负】牌堆耗尽时手牌点数最大者获胜，或全场只剩最后一人存活直接获胜。',
      ],
    }, [
      {
        key: 'cardTracker',
        kind: 'select',
        label: '记牌器辅助',
        description: '开启后在局内提供 1–8 号卡牌已出与剩余张数实时统计及历史出牌流水记录',
        defaultValue: 'enabled',
        choices: [
          { value: 'enabled', label: '开启记牌器' },
          { value: 'disabled', label: '关闭记牌器' },
        ],
      },
    ], { cardTracker: 'enabled' }),
    botSupport: 'rule',
    visualTheme: { accent: 'sunset', surface: 'cards' },
  },
  {
    id: 'cheese-thief',
    displayName: '奶酪大盗',
    minPlayers: 4,
    maxPlayers: 8,
    availability: 'playable',
    maturity: 'M4',
    summary: '掷骰决定醒来时刻、独醒偷奶酪、共犯掩护与平票同出局，欢乐聚会推理！',
    tags: ['推理', '阵营', '聚会'],
    theme: 'mint',
    rulesets: [
      {
        id: 'cheese_thief_classic_v1',
        label: '标准规则（骰子时刻 · 独醒偷吃）',
        description: '投掷骰子暗定醒来时刻，夜间独醒者偷吃奶酪成为大盗，白天全员指认大盗！',
        details: [
          '【骰盅时刻】每人掷 6 面骰扣在骰盅内，点数决定夜间第几时刻醒来。',
          '【独醒与偷看】独自醒来且奶酪在场者拿走奶酪成为怪盗并可偷看他人骰子。',
          '【共犯掩护】怪盗秘密选定一名共犯共同掩护。',
          '【投票胜负】白天讨论后投票，好人投中大盗则好人胜，否则大盗与共犯胜。',
        ],
      },
      {
        id: 'cheese_thief_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责私密掷苏醒时辰与私密分配身份角色牌，不偷奶酪不投票，规则由玩家自由定！',
        details: [
          '【时辰私密】每人私密掷 1–6 苏醒时辰，可随时重掷。',
          '【身份角色牌】可选私密分配猫/狗/白鼠身份卡。',
          '【无系统判定】不偷奶酪、不投票、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'cheese_thief_classic_v1',
      label: '标准规则（骰子时刻 · 独醒偷吃）',
      description: '投掷骰子暗定醒来时刻，夜间独醒者偷吃奶酪成为大盗，白天全员指认大盗！',
      details: [
        '【骰盅时刻】每人掷 6 面骰扣在骰盅内，点数决定夜间第几时刻醒来。',
        '【独醒与偷看】独自醒来且奶酪在场者拿走奶酪成为怪盗并可偷看他人骰子。',
        '【共犯掩护】怪盗秘密选定一名共犯共同掩护。',
        '【投票胜负】白天讨论后投票，好人投中大盗则好人胜，否则大盗与共犯胜。',
      ],
    }, [
      {
        key: 'mode',
        kind: 'select',
        label: '对局模式',
        defaultValue: 'simulator',
        choices: [
          { value: 'simulator', label: '玩家端（含 3D 骰盅）' },
          { value: 'standard', label: '标准模式（系统判定）' },
        ],
      },
      { key: 'roleCards', kind: 'boolean', label: '启用身份卡（猫/狗/白老鼠）', defaultValue: false },
      { key: 'nightHourSeconds', kind: 'integer', label: '每时刻时长（秒）', defaultValue: 20, min: 5, max: 600, step: 1 },
      { key: 'discussionSeconds', kind: 'integer', label: '讨论时长（秒）', defaultValue: 120, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
    ], {}, [
      {
        id: 'cheese_thief_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责私密掷苏醒时辰与私密分配身份角色牌，不偷奶酪不投票，规则由玩家自由定！',
        details: [
          '【时辰私密】每人私密掷 1–6 苏醒时辰，可随时重掷。',
          '【身份角色牌】可选私密分配猫/狗/白鼠身份卡。',
          '【无系统判定】不偷奶酪、不投票、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ]),
    botSupport: 'rule',
    visualTheme: { accent: 'mint', surface: 'board' },
  },
  {
    id: 'goose-relay',
    displayName: '以鹅传鹅',
    minPlayers: 5,
    maxPlayers: 9,
    availability: 'playable',
    maturity: 'M4',
    summary: '抢当头鹅、选卡指派、动作接力传递、末棒倒序指认、票选揪恶，爆笑动作传递！',
    tags: ['传递', '阵营', '聚会'],
    theme: 'sunset',
    rulesets: [
      {
        id: 'goose_relay_classic_v1',
        label: '标准规则（动作接力 · 倒序指认）',
        description: '头鹅选卡定案，全员不看牌仅靠肢体动作接力传递，潜伏恶鹅故意捣乱！',
        details: [
          '【头鹅定案】抢到头鹅的玩家从展示卡中选 1 张凶手 + 1 张受害鸭开启表演。',
          '【动作接力】后续玩家依次单向观看前一位的肢体表演并向后模仿传递。',
          '【倒序指认】由最后一棒倒序向前指认自己理解的案情。',
          '【揪出恶鹅】全员投票找出潜伏在队伍中捣乱的恶鹅。',
        ],
      },
      {
        id: 'goose_relay_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机候选鹅卡展示、随机头鹅指派与案情卡私密发放，不接力不投票，规则由玩家自由定！',
        details: [
          '【鹅卡布置】随机 9 张候选鹅卡公开展示，随机指派头鹅。',
          '【案情私密】凶手与受害者案情卡仅头鹅可见，可随时重布置。',
          '【无系统判定】不接力、不指认、不投票、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'goose_relay_classic_v1',
      label: '标准规则（动作接力 · 倒序指认）',
      description: '头鹅选卡定案，全员不看牌仅靠肢体动作接力传递，潜伏恶鹅故意捣乱！',
      details: [
        '【头鹅定案】抢到头鹅的玩家从展示卡中选 1 张凶手 + 1 张受害鸭开启表演。',
        '【动作接力】后续玩家依次单向观看前一位的肢体表演并向后模仿传递。',
        '【倒序指认】由最后一棒倒序向前指认自己理解的案情。',
        '【揪出恶鹅】全员投票找出潜伏在队伍中捣乱的恶鹅。',
      ],
    }, [
      { key: 'claimHeadSeconds', kind: 'integer', label: '抢头鹅时限（秒）', defaultValue: 15, min: 1, max: 600, step: 1 },
      { key: 'pickCardsSeconds', kind: 'integer', label: '头鹅选卡时限（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'relaySeconds', kind: 'integer', label: '每节点表演时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'discussionSeconds', kind: 'integer', label: '讨论时长（秒，0=跳过）', defaultValue: 60, min: 0, max: 600, step: 1 },
      { key: 'accuseSeconds', kind: 'integer', label: '每人指认时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
    ], {}, [
      {
        id: 'goose_relay_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机候选鹅卡展示、随机头鹅指派与案情卡私密发放，不接力不投票，规则由玩家自由定！',
        details: [
          '【鹅卡布置】随机 9 张候选鹅卡公开展示，随机指派头鹅。',
          '【案情私密】凶手与受害者案情卡仅头鹅可见，可随时重布置。',
          '【无系统判定】不接力、不指认、不投票、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ]),
    botSupport: 'rule',
    visualTheme: { accent: 'sunset', surface: 'board' },
  },
  {
    id: 'night-testimony',
    displayName: '暗夜证词',
    minPlayers: 3,
    maxPlayers: 6,
    availability: 'playable',
    maturity: 'M3',
    summary: '狱警伪装潜伏、YES/NO 问答轨迹、推理混卡、票选揪警与猜罪，阵营身份推理！',
    tags: ['推理', '身份', '聚会'],
    theme: 'violet',
    rulesets: [
      {
        id: 'night_testimony_v1',
        label: '标准规则（狱警潜伏 · 问答推理）',
        description: '狱警伪装潜伏在囚犯中，囚犯必须如实回答罪行问答，票选狱警或狱警猜罪决胜负！',
        details: [
          '【狱警潜伏】一名狱警伪装成囚犯，囚犯按各自罪行卡回答，狱警可撒谎。',
          '【问答轨迹】使用 YES/NO 记号标记问答历史，根据逻辑矛盾推理身份。',
          '【终局猜罪】票选出狱警后，若狱警能猜出所有囚犯的真实罪行则逆转获胜。',
        ],
      },
      {
        id: 'night_testimony_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机罪行私密分配（狱警标记 + 干扰卡）与问题卡抽取，不票选不猜罪，规则由玩家自由定！',
        details: [
          '【罪行分配】每人私密获得一张互异罪行，随机一人为狱警（无罪行），另有公开干扰罪行卡。',
          '【问题卡抽取】40 张审讯题卡随机抽取展示。',
          '【无系统判定】不票选、不猜罪、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'night_testimony_v1',
      label: '标准规则（狱警潜伏 · 问答推理）',
      description: '狱警伪装潜伏在囚犯中，囚犯必须如实回答罪行问答，票选狱警或狱警猜罪决胜负！',
      details: [
        '【狱警潜伏】一名狱警伪装成囚犯，囚犯按各自罪行卡回答，狱警可撒谎。',
        '【问答轨迹】使用 YES/NO 记号标记问答历史，根据逻辑矛盾推理身份。',
        '【终局猜罪】票选出狱警后，若狱警能猜出所有囚犯的真实罪行则逆转获胜。',
      ],
    }, [
      { key: 'questionSeconds', kind: 'integer', label: '问答阶段时长（秒）', defaultValue: 120, min: 1, max: 600, step: 1 },
      { key: 'deductionSeconds', kind: 'integer', label: '推理时长（秒）', defaultValue: 60, min: 1, max: 600, step: 1 },
      { key: 'voteSeconds', kind: 'integer', label: '投票时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'questionLimit', kind: 'integer', label: '问答上限（次）', defaultValue: 5, min: 1, max: 12, step: 1 },
    ], {}, [
      {
        id: 'night_testimony_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机罪行私密分配（狱警标记 + 干扰卡）与问题卡抽取，不票选不猜罪，规则由玩家自由定！',
        details: [
          '【罪行分配】每人私密获得一张互异罪行，随机一人为狱警（无罪行），另有公开干扰罪行卡。',
          '【问题卡抽取】40 张审讯题卡随机抽取展示。',
          '【无系统判定】不票选、不猜罪、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ]),
    botSupport: 'rule',
    visualTheme: { accent: 'violet', surface: 'board' },
  },
  {
    id: 'bell-clash',
    displayName: '铃铛对决',
    minPlayers: 2,
    maxPlayers: 7,
    availability: 'playable',
    maturity: 'M3',
    summary: '颜色数字出牌 + 行动短语卡 + 按铃抢回合，先出完手牌者胜，快节奏卡牌反应！',
    tags: ['反应', '卡牌', '聚会'],
    theme: 'berry',
    rulesets: [
      {
        id: 'bell_clash_v1',
        label: '标准规则（出牌短语 · 拍铃抢回合）',
        description: '同色同数字出牌，诱导其他玩家触发手牌上的行动短语，拍铃抢夺出牌权！',
        details: [
          '【卡牌出牌】打出同色或同数字手牌，无牌可出摸一张。',
          '【短语拍铃】手牌印有日常口癖或动作短语，有玩家触发即可拍铃抢出牌。',
          '【先出完胜】先将手中所有牌打光者获胜。',
        ],
      },
      {
        id: 'bell_clash_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机发牌/翻牌与按铃、骰子、计时器等道具，不判胜负不记分，规则由玩家自由定！',
        details: [
          '【随机发牌】每人 8 张主题牌，可重发/摸牌/翻牌。',
          '【自由道具】按铃、骰子、计时器随桌使用。',
          '【无系统判定】不记分、不判胜负，适合按线下原版规则自由玩。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'bell_clash_v1',
      label: '标准规则（出牌短语 · 拍铃抢回合）',
      description: '同色同数字出牌，诱导其他玩家触发手牌上的行动短语，拍铃抢夺出牌权！',
      details: [
        '【卡牌出牌】打出同色或同数字手牌，无牌可出摸一张。',
        '【短语拍铃】手牌印有日常口癖或动作短语，有玩家触发即可拍铃抢出牌。',
        '【先出完胜】先将手中所有牌打光者获胜。',
      ],
    }, [
      { key: 'handSize', kind: 'integer', label: '每人手牌数', defaultValue: 8, min: 1, max: 12, step: 1 },
      { key: 'turnSeconds', kind: 'integer', label: '出牌时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'bellSeconds', kind: 'integer', label: '按铃窗口（秒）', defaultValue: 10, min: 1, max: 600, step: 1 },
    ], {}, [
      {
        id: 'bell_clash_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机发牌/翻牌与按铃、骰子、计时器等道具，不判胜负不记分，规则由玩家自由定！',
        details: [
          '【随机发牌】每人 8 张主题牌，可重发/摸牌/翻牌。',
          '【自由道具】按铃、骰子、计时器随桌使用。',
          '【无系统判定】不记分、不判胜负，适合按线下原版规则自由玩。',
        ],
      },
    ]),
    botSupport: 'rule',
    visualTheme: { accent: 'berry', surface: 'board' },
  },
  {
    id: 'echo-judge',
    displayName: '伪人测试',
    minPlayers: 3,
    maxPlayers: 12,
    availability: 'playable',
    maturity: 'M3',
    summary: '判官出题、伪人藏触发词、依次回答、判官指认，语言伪装与逻辑推理！',
    tags: ['伪装', '推理', '聚会'],
    theme: 'sunset',
    rulesets: [
      {
        id: 'echo_judge_v1',
        label: '标准规则（判官出题 · 伪人藏词）',
        description: '判官依次向全员出题，伪人必须把秘密触发词自然藏进回答中，判官指认抓伪人！',
        details: [
          '【判官出题】轮流担任判官并提出开放式问题，其余玩家依次作答。',
          '【伪人藏词】伪人拿到专属触发词，回答时必须自然念出触发词且不被判官识破。',
          '【指认计分】判官指认抓对得分、抓错扣分；多轮后累计得分最高者获胜。',
        ],
      },
      {
        id: 'echo_judge_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机词条私密分配与题卡抽取，不判伪人不记分，规则由玩家自由定！',
        details: [
          '【词条分配】每人私密获得一个触发词，可随时重新分配。',
          '【题卡抽取】36 张主题题卡随机抽取展示。',
          '【无系统判定】不判伪人、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ],
    setup: defaultSetup({
      id: 'echo_judge_v1',
      label: '标准规则（判官出题 · 伪人藏词）',
      description: '判官依次向全员出题，伪人必须把秘密触发词自然藏进回答中，判官指认抓伪人！',
      details: [
        '【判官出题】轮流担任判官并提出开放式问题，其余玩家依次作答。',
        '【伪人藏词】伪人拿到专属触发词，回答时必须自然念出触发词且不被判官识破。',
        '【指认计分】判官指认抓对得分、抓错扣分；多轮后累计得分最高者获胜。',
      ],
    }, [
      { key: 'answerSeconds', kind: 'integer', label: '每人回答时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'judgmentSeconds', kind: 'integer', label: '判官指认时长（秒）', defaultValue: 30, min: 1, max: 600, step: 1 },
      { key: 'judgeWrongPenalty', kind: 'integer', label: '判官抓错扣分', defaultValue: -1, min: -10, max: 0, step: 1 },
    ], {}, [
      {
        id: 'echo_judge_sim_v1',
        label: '桌面模拟（无判定 · 自由道具）',
        description: '系统只负责随机词条私密分配与题卡抽取，不判伪人不记分，规则由玩家自由定！',
        details: [
          '【词条分配】每人私密获得一个触发词，可随时重新分配。',
          '【题卡抽取】36 张主题题卡随机抽取展示。',
          '【无系统判定】不判伪人、不记分，适合按线下原版规则自由玩。',
        ],
      },
    ]),
    botSupport: 'rule',
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
