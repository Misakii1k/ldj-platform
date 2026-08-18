/**
 * 以鹅传鹅（鹅鹅密令）goose_relay_classic_v1 —— v2 规则重构类型定义。
 *
 * 核心机制：
 * - 抢当头鹅（claim_head）：开局所有玩家可点击「我要当头鹅」，先到先得（或超时随机指派）。
 * - 头鹅选卡（pick_cards）：头鹅从展示的 9 张随机特征鸭卡中，选出 1 张凶手与 1 张受害者确立案情。
 * - 线下动作传递（relay）：首棒（头鹅）开始纯肢体表演，逐棒向后传递，每棒表演完成点击确认推进。
 * - 线下讨论（discussion）：传递结束后全员讨论。
 * - 末棒倒序指认（accusation）：从队尾玩家起逐个向前指认凶手与受害者（从 9 张展示候选卡中挑选）。
 *   若有人指对则立即进入揪恶投票；若全员指完无人指对则进入投票。
 * - 票选揪恶（vote）：全员投票找出潜伏的恶鹅（所有人数统一为 1 只恶鹅）。
 * - 结算规则（OR 逻辑）：白鹅阵营获胜条件为「指对了案情」或「投票揪出了恶鹅」；恶鹅获胜条件为「案情未被指对且恶鹅未被投出」。
 */
import type { GameEffect } from '@ldj/shared';

export const CHARACTERS = [
  'detective',
  'astronaut',
  'pirate',
  'chef',
  'doctor',
  'firefighter',
  'miner',
  'wizard',
  'samurai',
  'king',
  'diver',
  'painter',
  'rockstar',
  'ninja',
  'racer',
  'ballerina',
  'fried_chicken',
  'fried_egg',
  'boba_tea',
  'burger',
  'cactus',
  'ice_cream',
  'toast',
  'puddle',
  'watermelon',
  'popcorn',
  'sushi',
  'balloon',
  'chili',
  'coffee',
  'durian',
  'potted_plant',
  'cthulhu',
  'bodybuilder',
  'magic_student',
  'batman',
  'sailor_moon',
  'wukong',
  'mummy',
  'dracula',
  'angel',
  'devil',
  'cyborg',
  'zombie',
  'mermaid',
  'spartan',
  'god_of_wealth',
  'ghost',
  'boxer',
  'weightlifter',
  'skater',
  'fisherman',
  'onsen',
  'skier',
  'yoga',
  'spy',
  'tennis',
  'birthday',
  'pajama',
  'hiker',
  'soccer',
  'cyclist',
  'graffiti',
  'gardener',
  'blue_hood',
  'floral_coat',
  'rapper',
  'box_head',
  'dinosaur',
  'noble_lady',
  'bag_head',
  'monocle',
  'sumo',
  'raincoat',
  'white_beard',
  'mao_suit',
  'maid',
  'viking',
  'bee',
  'gamer_headset',
] as const;

export type CharacterId = (typeof CHARACTERS)[number];

export interface CaseCard {
  murderer: CharacterId;
  victim: CharacterId;
}

export type GooseRole = 'head' | 'evil' | 'white';

export type GooseRelayPhase =
  | 'claim_head' // 抢当头鹅
  | 'pick_cards' // 头鹅从展示候选卡中选凶手与受害者
  | 'relay' // 逐棒线下表演接力
  | 'discussion' // 线下讨论（App 只计时）
  | 'accusation' // 从末位起逐一倒序指认
  | 'vote' // 投票投恶鹅
  | 'game_over';

export interface GooseRelayConfig {
  rulesetId?: 'goose_relay_classic_v1';
  /** 抢头鹅时长（秒），默认 15 */
  claimHeadSeconds?: number;
  /** 头鹅选卡时长（秒），默认 30 */
  pickCardsSeconds?: number;
  /** 每个传递节点的时长（秒），默认 30 */
  relaySeconds?: number;
  /** 讨论时长（秒），默认 60；为 0 则跳过讨论阶段 */
  discussionSeconds?: number;
  /** 每人指认时长（秒），默认 30 */
  accuseSeconds?: number;
  /** 揪恶投票时长（秒），默认 30 */
  voteSeconds?: number;
}

/** 解析后的配置：schema default 已补齐，计时器秒数必填 */
export interface ResolvedGooseRelayConfig {
  rulesetId?: 'goose_relay_classic_v1';
  claimHeadSeconds: number;
  pickCardsSeconds: number;
  relaySeconds: number;
  discussionSeconds: number;
  accuseSeconds: number;
  voteSeconds: number;
}

export interface GooseRelayState {
  schemaVersion: 2;
  phase: GooseRelayPhase;
  players: string[];
  /** 解析后的配置（含默认值；计时器秒数由此读取） */
  config: ResolvedGooseRelayConfig;
  /** 抢到的头鹅玩家 ID（未产生前为 null） */
  headPlayerId: string | null;
  /** 本局展示给头鹅与末棒指认的候选特征卡池（固定 6 张） */
  candidateCards: CharacterId[];
  /** 传递队列：首位为头鹅，其余按顺序排列 */
  lineOrder: string[];
  /** 原始案情（终局前仅头鹅可见） */
  case: CaseCard;
  /** 当前应表演接力的队列下标（0 = 头鹅） */
  currentIndex: number;
  /** 当前应指认的队列下标（accusation 阶段，从末位倒序） */
  currentAccuserIndex: number;
  /** 已指认记录：玩家 → 其指认的案情（含是否指对） */
  accusations: Array<{ playerId: string; guess: CaseCard; correct: boolean }>;
  /** 是否已有人指对 */
  caseMatched: boolean | null;
  /** 潜伏的恶鹅（固定 1 名） */
  evilGeese: string[];
  votes: Record<string, string>;
  winners: string[];
  /** 揪恶投票是否投中（并列最高票包含恶鹅）；未结算为 null */
  evilIdentified: boolean | null;
}

export type GooseRelayAction =
  | { type: 'begin' }
  | { type: 'claim_head'; playerId: string }
  | { type: 'claim_head_timeout' }
  | { type: 'pick_cards'; playerId: string; murderer: CharacterId; victim: CharacterId }
  | { type: 'pick_cards_timeout' }
  | { type: 'relay_done'; playerId: string }
  | { type: 'relay_timeout'; index: number }
  | { type: 'end_discussion'; playerId?: string }
  | { type: 'accuse'; playerId: string; murderer: CharacterId; victim: CharacterId }
  | { type: 'accusation_timeout' }
  | { type: 'cast_vote'; playerId: string; targetPlayerId: string }
  | { type: 'resolve_vote' }
  | { type: 'player_forfeited'; playerIds: string[] };

export type GooseRelayEvent =
  | { type: 'claim_head_started' }
  | { type: 'head_claimed'; playerId: string }
  | { type: 'cards_picked'; murderer: CharacterId; victim: CharacterId }
  | { type: 'relay_started' }
  | { type: 'relay_step_done'; playerId: string; index: number }
  | { type: 'relay_finished' }
  | { type: 'discussion_started' }
  | { type: 'accusation_started' }
  | { type: 'accused'; playerId: string; correct: boolean; index: number }
  | { type: 'case_matched'; playerId: string }
  | { type: 'vote_started' }
  | { type: 'vote_cast'; playerId: string }
  | { type: 'settled'; caseMatched: boolean; evilIdentified: boolean; winners: string[] }
  | { type: 'game_finished'; winners: string[] };

export type GooseRelayReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: GooseRelayState; events: GooseRelayEvent[]; effects: GameEffect[] };

/** 终局披露（原始案情、候选卡池、恶鹅、指认、投票） */
export interface GooseRelayReveal {
  case: CaseCard;
  candidateCards: CharacterId[];
  evilGeese: string[];
  accusations: Array<{ playerId: string; guess: CaseCard; correct: boolean }>;
  voteCounts: Record<string, number>;
  caseMatched: boolean;
  evilIdentified: boolean;
}

export interface GooseRelayPublicView {
  gameId: 'goose-relay';
  rulesetId: 'goose_relay_classic_v1';
  schemaVersion: 2;
  phase: GooseRelayPhase;
  players: string[];
  lineOrder: string[];
  headPlayerId: string | null;
  candidateCards: CharacterId[];
  /** 当前应演绎的队列下标（relay 阶段） */
  currentIndex: number;
  /** 当前应指认的队列下标（accusation 阶段） */
  currentAccuserIndex: number;
  evilCount: number;
  /** 已完成的指认（含是否指对） */
  accusations: Array<{ playerId: string; correct: boolean }>;
  /** 是否已有人指对 */
  caseMatched: boolean | null;
  /** 已投票人数（vote 阶段） */
  votesCast: number;
  winners: string[];
  reveal: GooseRelayReveal | null;
}

export interface GooseRelayPlayerView extends GooseRelayPublicView {
  me: {
    playerId: string;
    role: GooseRole | null;
    /** 本轮我应看到的案情（仅头鹅在选卡后可见）；未到我的回合为 null */
    observed: CaseCard | null;
  } | null;
}

export interface GooseRelayResult {
  winners: string[];
  caseMatched: boolean;
  evilIdentified: boolean;
}
