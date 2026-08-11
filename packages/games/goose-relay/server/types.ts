/**
 * 以鹅传鹅（鹅鹅密令）goose_relay_classic_v1 —— 原版规则基线类型。
 *
 * 原版《以鹅传鹅》（地核桌游，5–9 人）核心机制（2026-08-10 调研，B/C 级）：
 * - 头鹅（队首，公开）秘密查看案情卡（凶手鹅 + 受害鹅），随后闭眼逐棒传递
 *   （线下为比划+鹅叫，数字版为私密文字演绎）；恶鹅 1–2 只故意传错。
 * - 传递完成后，**从最后一人起逐一向前指认**「凶手鹅 + 受害鹅」，
 *   每指认一人公开对比——有人指对则立即停止并进入投票；全部指完无人指对 → 恶鹅获胜。
 * - 指对后进入**投票投恶鹅**：投中（并列最高票均为恶鹅）→ 头鹅 + 好鹅获胜；
 *   投错 → 恶鹅获胜。
 * - 原版含计分系统（细则缺失，平台裁定：胜方 +1/+2、负方 −1，见 RULES_ORIGINAL.md）。
 */
import type { GameEffect } from '@ldj/shared';

export const CHARACTERS = ['grey_goose', 'white_goose', 'brown_goose', 'black_goose', 'duck_goose', 'swan_goose'] as const;
export const TOOLS = ['knife', 'rope', 'candle', 'bell'] as const;
export const SCENES = ['barn', 'pond', 'forest', 'mill'] as const;

export type CharacterId = (typeof CHARACTERS)[number];
export type ToolId = (typeof TOOLS)[number];
export type SceneId = (typeof SCENES)[number];

export interface CaseCard {
  murderer: CharacterId;
  victim: CharacterId;
  tool: ToolId;
  scene: SceneId;
}

export type GooseRole = 'head' | 'evil' | 'white';

export type GooseRelayPhase =
  | 'case_view' // 头鹅读案情卡
  | 'relay' // 逐棒传递
  | 'discussion' // 演绎链公开，线下讨论（App 只计时）
  | 'accusation' // 从末位起逐一指认，直到有人指对
  | 'vote' // 指对后投票投恶鹅
  | 'game_over';

export interface GooseRelayConfig {
  rulesetId?: 'goose_relay_classic_v1';
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
  relaySeconds: number;
  discussionSeconds: number;
  accuseSeconds: number;
  voteSeconds: number;
}

export interface GooseRelayState {
  schemaVersion: 1;
  phase: GooseRelayPhase;
  players: string[];
  /** 解析后的配置（含默认值；计时器秒数由此读取） */
  config: ResolvedGooseRelayConfig;
  /** 传递队列：首位为头鹅，其余按座位顺序 */
  lineOrder: string[];
  /** 原始案情（终局前仅头鹅可见） */
  case: CaseCard;
  /** 每位鹅的演绎（传递结果）；未提交前为 null */
  transmissions: (CaseCard | null)[];
  /** 当前应演绎的队列下标（0 = 头鹅） */
  currentIndex: number;
  /** 当前应指认的队列下标（accusation 阶段，从末位倒序） */
  currentAccuserIndex: number;
  /** 已指认记录：玩家 → 其指认的案情（含是否指对） */
  accusations: Array<{ playerId: string; guess: CaseCard; correct: boolean }>;
  /** 是否已有人指对（true 后进入投票） */
  caseMatched: boolean | null;
  evilGeese: string[];
  votes: Record<string, string>;
  winners: string[];
  /** 揪恶投票是否投中（并列最高票均为恶鹅）；未结算为 null */
  evilIdentified: boolean | null;
}

export type GooseRelayAction =
  | { type: 'begin' }
  | { type: 'transmit'; playerId: string; case: CaseCard }
  | { type: 'relay_timeout'; index: number }
  | { type: 'end_discussion' }
  | { type: 'accuse'; playerId: string; murderer: CharacterId; victim: CharacterId }
  | { type: 'accusation_timeout' }
  | { type: 'cast_vote'; playerId: string; targetPlayerId: string }
  | { type: 'resolve_vote' }
  | { type: 'player_forfeited'; playerIds: string[] };

export type GooseRelayEvent =
  | { type: 'case_view_started'; headPlayerId: string }
  | { type: 'transmitted'; playerId: string; index: number }
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

/** 终局披露（原始案情、演绎链、恶鹅、指认、投票） */
export interface GooseRelayReveal {
  case: CaseCard;
  transmissions: CaseCard[];
  evilGeese: string[];
  accusations: Array<{ playerId: string; guess: CaseCard; correct: boolean }>;
  voteCounts: Record<string, number>;
  caseMatched: boolean;
  evilIdentified: boolean;
}

export interface GooseRelayPublicView {
  gameId: 'goose-relay';
  rulesetId: 'goose_relay_classic_v1';
  schemaVersion: 1;
  phase: GooseRelayPhase;
  players: string[];
  lineOrder: string[];
  /** 当前应演绎的队列下标（relay 阶段） */
  currentIndex: number;
  /** 当前应指认的队列下标（accusation 阶段） */
  currentAccuserIndex: number;
  evilCount: number;
  /** 讨论起公开的演绎链；此前为 null */
  transmissions: CaseCard[] | null;
  /** 已完成的指认（含是否指对，指对后公开） */
  accusations: Array<{ playerId: string; correct: boolean }> | null;
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
    /** 本轮我应看到的案情（头鹅=原始案情；传递者=上一位演绎）；未到我的回合为 null */
    observed: CaseCard | null;
  } | null;
}

export interface GooseRelayResult {
  winners: string[];
  caseMatched: boolean;
  evilIdentified: boolean;
}
