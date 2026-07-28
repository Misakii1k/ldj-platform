/**
 * 首页游戏目录：同时供客户端展示和服务端校验使用。
 * `playable` 必须有对应的服务端 GameModule；`coming_soon` 只能展示，不能建房。
 */
export const GAME_AVAILABILITY = ['playable', 'coming_soon'] as const;
export type GameAvailability = (typeof GAME_AVAILABILITY)[number];

export const GAME_THEMES = ['berry', 'sunset', 'mint', 'violet', 'ocean'] as const;
export type GameTheme = (typeof GAME_THEMES)[number];

export interface GameCatalogEntry {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  availability: GameAvailability;
  summary: string;
  tags: readonly string[];
  theme: GameTheme;
  comingSoonMessage?: string;
}

export const GAME_CATALOG = [
  {
    id: 'undercover',
    displayName: '谁是卧底',
    minPlayers: 4,
    maxPlayers: 12,
    availability: 'playable',
    summary: '每个人拿到一个词，用机智发言找出隐藏在人群中的卧底。',
    tags: ['推理', '轻松', '语言表达'],
    theme: 'berry',
  },
  {
    id: 'uno',
    displayName: 'UNO',
    minPlayers: 2,
    maxPlayers: 6,
    availability: 'playable',
    summary: '颜色、数字与行动牌快速接力，最后一张牌别忘了喊 UNO。',
    tags: ['卡牌', '轻松', '快节奏'],
    theme: 'sunset',
    comingSoonMessage: '正在准备卡牌与规则支持',
  },
  {
    id: 'landlord',
    displayName: '斗地主',
    minPlayers: 3,
    maxPlayers: 3,
    availability: 'playable',
    summary: '经典三人牌局，叫分、配合与出牌节奏缺一不可。',
    tags: ['卡牌', '策略', '经典'],
    theme: 'mint',
    comingSoonMessage: '正在准备牌局与结算支持',
  },
  {
    id: 'werewolf',
    displayName: '狼人杀',
    minPlayers: 6,
    maxPlayers: 12,
    availability: 'playable',
    summary: '白天推理、夜晚行动，在真话与谎言之间找出同伴。',
    tags: ['推理', '阵营', '社交'],
    theme: 'violet',
    comingSoonMessage: '正在准备角色与夜晚流程',
  },
  {
    id: 'avalon',
    displayName: '阿瓦隆',
    minPlayers: 5,
    maxPlayers: 10,
    availability: 'coming_soon',
    summary: '组队、投票与隐藏身份，忠臣和邪恶阵营都在等待时机。',
    tags: ['阵营', '推理', '角色'],
    theme: 'ocean',
    comingSoonMessage: '正在准备任务与角色支持',
  },
] as const satisfies readonly GameCatalogEntry[];

export type GameId = (typeof GAME_CATALOG)[number]['id'];

/** 首页提供的精确人数筛选项。 */
export const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type PlayerCount = (typeof PLAYER_COUNT_OPTIONS)[number];

/** 判断一款游戏是否适合当前精确人数。 */
export function matchesPlayerCount(game: GameCatalogEntry, playerCount: number): boolean {
  return Number.isInteger(playerCount) && playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
}

/**
 * 返回适合当前人数的游戏；未选择人数时按目录顺序返回全部游戏。
 * 目录本身保证已上线游戏排在即将推出游戏之前。
 */
export function listGamesForPlayerCount(playerCount: number | null | undefined): readonly GameCatalogEntry[] {
  if (playerCount === null || playerCount === undefined) return GAME_CATALOG;
  return GAME_CATALOG.filter((game) => matchesPlayerCount(game, playerCount));
}

/** 兼容旧客户端与历史房间时使用的默认首发游戏。 */
export const DEFAULT_PLAYABLE_GAME_ID: GameId = 'undercover';

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

