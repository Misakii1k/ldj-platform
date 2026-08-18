/** durian_orchard_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const DURIAN_FRUITS = ['durian', 'strawberry', 'banana', 'grape', 'apple'] as const;
export type DurianFruit = (typeof DURIAN_FRUITS)[number];

export const FRUIT_NAMES: Record<DurianFruit, string> = {
  durian: '榴莲',
  strawberry: '草莓',
  banana: '香蕉',
  grape: '葡萄',
  apple: '苹果',
};

export const FRUIT_EMOJIS: Record<DurianFruit, string> = {
  durian: '🍋',
  strawberry: '🍓',
  banana: '🍌',
  grape: '🍇',
  apple: '🍎',
};

export interface FruitHalf {
  fruit: DurianFruit;
  quantity: 1 | 2 | 3;
}

export interface FruitCard {
  id: string;
  kind: 'fruit';
  left: FruitHalf;
  right: FruitHalf;
}

export type MonkeySpecial =
  | 'flip'
  | 'do_nothing'
  | 'three_void'
  | 'banana_void';

export const MONKEY_SPECIAL_NAMES: Record<MonkeySpecial, string> = {
  flip: '翻转卡牌',
  do_nothing: '无事发生',
  three_void: '3个水果无效',
  banana_void: '所有香蕉无效',
};

export const MONKEY_SPECIAL_DESCS: Record<MonkeySpecial, string> = {
  flip: '选择桌面上已放置的一张水果牌，将其 ✓ 和 ✗ 两半互换',
  do_nothing: '无事发生，直接跳过本回合（下家仍可质疑）',
  three_void: '桌面上所有标注为 3 个的水果格子全部失效',
  banana_void: '桌面上所有 ✓ 侧的香蕉全部不计入总数',
};

export interface MonkeyCard {
  id: string;
  kind: 'monkey';
  special: MonkeySpecial;
}

export type DurianCard = FruitCard | MonkeyCard;

export interface TableFruitPlacement {
  placementId: string;
  card: FruitCard;
  checkHalf: 'left' | 'right';
  placedBy: string;
}

export interface TableMonkeyPlacement {
  placementId: string;
  card: MonkeyCard;
  placedBy: string;
  targetPlacementId?: string;
}

export type TablePlacement =
  | { kind: 'fruit'; data: TableFruitPlacement }
  | { kind: 'monkey'; data: TableMonkeyPlacement };

export type DurianPhase =
  | 'turn_action'
  | 'choose_placement'
  | 'choose_flip'
  | 'challenge_result'
  | 'game_over';

export interface ChallengeDetails {
  challengerId: string;
  accusedId: string;
  success: boolean;
  loserId: string;
  penaltyPoints: number;
  tableTotals: Record<DurianFruit, number>;
  stockTotals: Record<DurianFruit, number>;
  oversoldFruits: DurianFruit[];
}

export interface VisibleForeheadCard {
  playerId: string;
  card: DurianCard;
}

export interface DurianPublicView {
  gameId: 'durian';
  rulesetId: 'durian_orchard_v1';
  schemaVersion: 1;
  phase: DurianPhase;
  players: string[];
  round: number;
  maxRounds: number;
  mode: 'standard' | 'simulator';
  deckCount: number;
  tablePlacements: TablePlacement[];
  currentPlayerId: string | null;
  previousPlayerId: string | null;
  lastChallenge: ChallengeDetails | null;
  penalties: Record<string, number>;
  eliminatedPlayers: string[];
  winners: string[];
  activeTableTotals: Record<DurianFruit, number>;
  voidThreeActive: boolean;
  voidBananaActive: boolean;
}

export interface DurianPlayerView extends DurianPublicView {
  me: {
    playerId: string;
    ownForeheadHidden: boolean;
    drawnCard: DurianCard | null;
    visibleForeheadCards: VisibleForeheadCard[];
  } | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFruitHalf(value: unknown): FruitHalf | null {
  if (!isObject(value)) return null;
  const { fruit, quantity } = value;
  if (typeof fruit !== 'string' || !(DURIAN_FRUITS as readonly string[]).includes(fruit)) return null;
  if (quantity !== 1 && quantity !== 2 && quantity !== 3) return null;
  return { fruit: fruit as DurianFruit, quantity };
}

function parseDurianCard(value: unknown): DurianCard | null {
  if (!isObject(value)) return null;
  const { id, kind } = value;
  if (typeof id !== 'string') return null;
  if (kind === 'fruit') {
    const left = parseFruitHalf(value.left);
    const right = parseFruitHalf(value.right);
    if (!left || !right) return null;
    return { id, kind: 'fruit', left, right };
  }
  if (kind === 'monkey') {
    const special = value.special;
    if (special !== 'flip' && special !== 'do_nothing' && special !== 'three_void' && special !== 'banana_void') {
      return null;
    }
    return { id, kind: 'monkey', special };
  }
  return null;
}

function parseTablePlacement(value: unknown): TablePlacement | null {
  if (!isObject(value)) return null;
  const { kind, data } = value;
  if (!isObject(data)) return null;

  if (kind === 'fruit') {
    const card = parseDurianCard(data.card);
    if (!card || card.kind !== 'fruit') return null;
    if (typeof data.placementId !== 'string' || typeof data.placedBy !== 'string') return null;
    if (data.checkHalf !== 'left' && data.checkHalf !== 'right') return null;
    return {
      kind: 'fruit',
      data: {
        placementId: data.placementId,
        card,
        checkHalf: data.checkHalf,
        placedBy: data.placedBy,
      },
    };
  }

  if (kind === 'monkey') {
    const card = parseDurianCard(data.card);
    if (!card || card.kind !== 'monkey') return null;
    if (typeof data.placementId !== 'string' || typeof data.placedBy !== 'string') return null;
    return {
      kind: 'monkey',
      data: {
        placementId: data.placementId,
        card,
        placedBy: data.placedBy,
        targetPlacementId: typeof data.targetPlacementId === 'string' ? data.targetPlacementId : undefined,
      },
    };
  }

  return null;
}

function parseChallengeDetails(value: unknown): ChallengeDetails | null {
  if (!isObject(value)) return null;
  const { challengerId, accusedId, success, loserId, penaltyPoints, tableTotals, stockTotals, oversoldFruits } = value;
  if (typeof challengerId !== 'string' || typeof accusedId !== 'string' || typeof success !== 'boolean' || typeof loserId !== 'string') {
    return null;
  }
  if (typeof penaltyPoints !== 'number') return null;
  if (!isObject(tableTotals) || !isObject(stockTotals) || !Array.isArray(oversoldFruits)) return null;

  return {
    challengerId,
    accusedId,
    success,
    loserId,
    penaltyPoints,
    tableTotals: tableTotals as Record<DurianFruit, number>,
    stockTotals: stockTotals as Record<DurianFruit, number>,
    oversoldFruits: oversoldFruits as DurianFruit[],
  };
}

export function parseDurianPlayerView(input: unknown): DurianPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'durian' || input.rulesetId !== 'durian_orchard_v1' || input.schemaVersion !== 1) return null;

  const phase = input.phase;
  if (phase !== 'turn_action' && phase !== 'choose_placement' && phase !== 'choose_flip' && phase !== 'challenge_result' && phase !== 'game_over') {
    return null;
  }

  if (!Array.isArray(input.players)) return null;
  const players = input.players.filter((p): p is string => typeof p === 'string');

  if (typeof input.round !== 'number' || typeof input.maxRounds !== 'number' || typeof input.deckCount !== 'number') return null;
  const mode = input.mode === 'simulator' ? 'simulator' : 'standard';

  if (!Array.isArray(input.tablePlacements)) return null;
  const tablePlacements: TablePlacement[] = [];
  for (const item of input.tablePlacements) {
    const parsed = parseTablePlacement(item);
    if (!parsed) return null;
    tablePlacements.push(parsed);
  }

  const currentPlayerId = typeof input.currentPlayerId === 'string' ? input.currentPlayerId : null;
  const previousPlayerId = typeof input.previousPlayerId === 'string' ? input.previousPlayerId : null;
  const lastChallenge = input.lastChallenge ? parseChallengeDetails(input.lastChallenge) : null;

  if (!isObject(input.penalties)) return null;
  const penalties = input.penalties as Record<string, number>;

  const eliminatedPlayers = Array.isArray(input.eliminatedPlayers)
    ? input.eliminatedPlayers.filter((p): p is string => typeof p === 'string')
    : [];

  const winners = Array.isArray(input.winners)
    ? input.winners.filter((p): p is string => typeof p === 'string')
    : [];

  if (!isObject(input.activeTableTotals)) return null;
  const activeTableTotals = input.activeTableTotals as Record<DurianFruit, number>;

  const voidThreeActive = Boolean(input.voidThreeActive);
  const voidBananaActive = Boolean(input.voidBananaActive);

  let me: DurianPlayerView['me'] = null;
  if (isObject(input.me)) {
    const playerId = typeof input.me.playerId === 'string' ? input.me.playerId : '';
    const drawnCard = input.me.drawnCard ? parseDurianCard(input.me.drawnCard) : null;

    const visibleForeheadCards: VisibleForeheadCard[] = [];
    if (Array.isArray(input.me.visibleForeheadCards)) {
      for (const item of input.me.visibleForeheadCards) {
        if (isObject(item) && typeof item.playerId === 'string') {
          const card = parseDurianCard(item.card);
          if (card) visibleForeheadCards.push({ playerId: item.playerId, card });
        }
      }
    }

    me = {
      playerId,
      ownForeheadHidden: true,
      drawnCard,
      visibleForeheadCards,
    };
  }

  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase,
    players,
    round: input.round,
    maxRounds: input.maxRounds,
    mode,
    deckCount: input.deckCount,
    tablePlacements,
    currentPlayerId,
    previousPlayerId,
    lastChallenge,
    penalties,
    eliminatedPlayers,
    winners,
    activeTableTotals,
    voidThreeActive,
    voidBananaActive,
    me,
  };
}

export function parseDurianSpectatorView(input: unknown): DurianPublicView | null {
  const playerView = parseDurianPlayerView(input);
  if (!playerView) return null;
  const { me, ...publicView } = playerView;
  return publicView;
}

export function parseDurianView(input: unknown, role: 'player' | 'spectator'): DurianPlayerView | DurianPublicView | null {
  return role === 'player' ? parseDurianPlayerView(input) : parseDurianSpectatorView(input);
}
