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
  /** 'left' 表示左半放 ✓（计数），'right' 表示右半放 ✓（计数） */
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
  | 'turn_action'       // 当前玩家回合：可摸牌或质疑
  | 'choose_placement'  // 摸到水果牌，选择哪半放 ✓
  | 'choose_flip'       // 摸到翻转猴牌，选择桌上一张牌翻转
  | 'challenge_result'  // 质疑结算公示
  | 'game_over';        // 终局

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

export interface DurianConfig {
  rulesetId?: 'durian_orchard_v1';
  mode?: 'standard' | 'simulator';
  maxRounds?: number;
  customDeck?: DurianCard[];
}

export interface DurianState {
  schemaVersion: 1;
  phase: DurianPhase;
  players: string[];
  round: number;
  maxRounds: number;
  mode: 'standard' | 'simulator';
  deck: DurianCard[];
  foreheadCards: Record<string, DurianCard>;
  tablePlacements: TablePlacement[];
  drawnCard: DurianCard | null;
  currentPlayerId: string | null;
  previousPlayerId: string | null;
  lastChallenge: ChallengeDetails | null;
  penalties: Record<string, number>;
  eliminatedPlayers: string[];
  winners: string[];
}

export type DurianAction =
  | { type: 'begin' }
  | { type: 'draw_card'; playerId: string }
  | { type: 'place_fruit'; playerId: string; checkHalf: 'left' | 'right' }
  | { type: 'select_flip_target'; playerId: string; targetPlacementId: string }
  | { type: 'challenge'; playerId: string }
  | { type: 'ring_bell_sim'; playerId: string }
  | { type: 'next_round'; playerId: string };

export type DurianEvent =
  | { type: 'card_drawn'; playerId: string; cardKind: 'fruit' | 'monkey' }
  | { type: 'fruit_placed'; playerId: string; checkFruit: DurianFruit; checkQuantity: number }
  | { type: 'monkey_played'; playerId: string; special: MonkeySpecial }
  | { type: 'card_flipped'; playerId: string; targetPlacementId: string }
  | { type: 'challenge_resolved'; challengerId: string; accusedId: string; success: boolean; loserId: string; penalty: number }
  | { type: 'round_started'; round: number; starterId: string }
  | { type: 'player_eliminated'; playerId: string }
  | { type: 'bell_rung_sim'; playerId: string }
  | { type: 'game_finished'; winners: string[] };

export type DurianReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: DurianState; events: DurianEvent[] };

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

export interface DurianResult {
  winners: string[];
  penalties: Record<string, number>;
}
