/**
 * 奶酪大盗（月夜鼠影）cheese_thief_classic_v1 —— 原版规则基线类型。
 *
 * 原版《Cheese Thief》核心机制（2026-08-10 多源交叉验证，证据 A/B/C）：
 * - 每人私密掷 6 面骰，决定夜间醒来时刻（1–6）；4 人局变体掷两骰自选其一。
 * - 夜间按时刻 1→6 推进：独醒且奶酪在场 → 该玩家取走奶酪成为大盗；
 *   独醒且奶酪已失 → 可秘密查看一名玩家骰子；多人同醒 → 互相目击、无人偷成。
 * - 共犯机制（按人数配置）：大盗在夜晚秘密选择共犯，共犯胜利条件同大盗。
 * - 白天讨论 → 全体秘密投票指认大盗；平票时并列最高票一并出局。
 * - 结算：出局者含大盗 → 好人（村民）胜；否则大盗 + 共犯胜。
 * - 可选身份卡（默认关闭）：猫（展示后查看一名玩家骰子）、
 *   狗（展示后指定一名玩家先投票）、白老鼠（被投出则单独胜利）。
 */
import type { GameEffect } from '@ldj/shared';

export const DIE_SIDES = 6;
export const NIGHT_END_HOUR = 6;
export const FOUR_PLAYER_HOUR_CHOICE_SECONDS = 30;

export type CheeseThiefPhase =
  | 'hour_choice' // 仅 4 人局变体：每人两骰自选醒来时刻
  | 'night'
  | 'accomplice_select' // 大盗秘密选择共犯（配置启用时）
  | 'dawn'
  | 'vote'
  | 'game_over';

export type RoleCard = 'cat' | 'dog' | 'whiteMouse';

export interface AccompliceRule {
  /** 该人数档共犯数量 */
  count: number;
  /** 大盗与共犯是否相识（互认身份） */
  known: boolean;
}

export interface CheeseThiefConfig {
  rulesetId?: 'cheese_thief_classic_v1';
  /** 对局模式：standard 纯手机标准模式，simulator 桌面中央+手牌双端模拟模式，默认 standard */
  mode?: 'standard' | 'simulator';
  /** 开场确认骰子与身份时长（秒），默认 10 */
  roleRevealSeconds?: number;
  /** 每个夜间时刻的展示时长（秒），默认 10 */
  nightHourSeconds?: number;
  /** 天亮讨论时长（秒），默认 120 */
  discussionSeconds?: number;
  /** 投票时长（秒），默认 30 */
  voteSeconds?: number;
  /** 4 人局两骰自选窗口（秒），默认 30 */
  hourChoiceSeconds?: number;
  /** 大盗选择共犯时长（秒），默认 15 */
  accompliceSelectSeconds?: number;
  /** 是否启用可选身份卡（猫/狗/白老鼠），默认 false */
  roleCards?: boolean;
  /** 共犯配置覆盖（按人数），默认见 DEFAULT_ACCOMPLICE_RULES */
  accomplicesByPlayers?: Record<number, AccompliceRule>;
}

/** 解析后的配置：schema default 已补齐，计时器秒数必填 */
export interface ResolvedCheeseThiefConfig {
  rulesetId?: 'cheese_thief_classic_v1';
  mode: 'standard' | 'simulator';
  roleRevealSeconds: number;
  nightHourSeconds: number;
  accompliceSelectSeconds: number;
  discussionSeconds: number;
  voteSeconds: number;
  hourChoiceSeconds: number;
  roleCards: boolean;
  accomplicesByPlayers: Record<number, AccompliceRule>;
}

/** 原版共犯配置（153桌游工具分P + 北瓜丸子专栏交叉，B/C 级；可被 config 覆盖） */
export const DEFAULT_ACCOMPLICE_RULES: Record<number, AccompliceRule> = {
  4: { count: 0, known: false },
  5: { count: 1, known: true },
  6: { count: 1, known: true },
  7: { count: 2, known: false },
  8: { count: 2, known: true },
};

export type Vote =
  | { kind: 'accuse'; targetPlayerId: string }
  | { kind: 'abstain' };

export interface CheeseThiefState {
  schemaVersion: 1;
  phase: CheeseThiefPhase;
  players: string[];
  /** 解析后的配置（含默认值；计时器秒数由此读取） */
  config: ResolvedCheeseThiefConfig;
  /** 每位玩家的私密醒来时刻（1–6）；终局前不进入任何公开视图 */
  wakeHours: Record<string, number>;
  /** 4 人局变体：每人私密掷出的两个候选时刻 */
  hourChoices: Record<string, [number, number]> | null;
  /** 夜间当前时刻（1–6）；仅 night 阶段有意义 */
  currentHour: number;
  /** 已处理完的时刻（0 = 尚未处理）；用于 idempotency 与偷看窗口判定 */
  lastProcessedHour: number;
  /** 奶酪是否已被取走 */
  cheeseStolen: boolean;
  /** 盗贼玩家 ID；整夜未盗时为 null */
  thiefId: string | null;
  /** 盗取发生的时刻（1–6）；未盗时为 null */
  stealHour: number | null;
  /** 共犯玩家 ID 列表（大盗选择后填充；未配置/未选择时为空） */
  accomplices: string[];
  /** 共犯是否与大盗互认（按人数档规则） */
  accomplicesKnown: boolean;
  /** 独醒村民偷看他人骰子的记录：查看者 → 被查看者（只用于终局披露） */
  peeks: Array<{ viewer: string; target: string }>;
  /** 身份卡分配（启用 roleCards 时）：玩家 → 角色卡（'none' 表示无卡） */
  roleCards: Record<string, RoleCard | 'none'>;
  /** 猫已展示并查看的目标玩家 */
  catPeekTarget: string | null;
  /** 狗已展示，并指定先投票的玩家 */
  dogFirstVoter: string | null;
  votes: Record<string, Vote>;
  /** 平票同出局：并列最高票的所有玩家（结算前为 null） */
  eliminated: string[] | null;
  /** 大盗是否被投出（未结算前为 null） */
  thiefCaught: boolean | null;
  winners: string[];
}

export type CheeseThiefAction =
  | { type: 'begin' }
  | { type: 'choose_hour'; playerId: string; hour: number }
  | { type: 'resolve_hour_choice' } // 系统：4 人局超时，未选择者取首候选
  | { type: 'advance_night'; hour: number }
  | { type: 'steal_cheese'; playerId: string }
  | { type: 'peek_die'; playerId: string; targetPlayerId: string }
  | { type: 'skip_peek'; playerId: string }
  | { type: 'select_accomplice'; playerId: string; accompliceIds: string[] }
  | { type: 'auto_select_accomplice' } // 系统：共犯选择超时，自动选队首 N 人
  | { type: 'end_discussion' }
  | { type: 'reveal_cat'; playerId: string; targetPlayerId: string }
  | { type: 'reveal_dog'; playerId: string; firstVoterId: string }
  | { type: 'cast_vote'; playerId: string; targetPlayerId: string }
  | { type: 'cast_abstention'; playerId: string }
  | { type: 'resolve_vote' }
  | { type: 'player_forfeited'; playerIds: string[] };

export type CheeseThiefEvent =
  | { type: 'hour_choice_started' }
  | { type: 'hour_chosen'; playerId: string }
  | { type: 'hour_revealed'; hour: number }
  | { type: 'cheese_stolen'; thiefId: string; stealHour: number }
  | { type: 'peek_done'; playerId: string }
  | { type: 'night_finished' }
  | { type: 'accomplice_select_started' }
  | { type: 'accomplice_selected'; accompliceIds: string[] }
  | { type: 'discussion_started' }
  | { type: 'vote_started' }
  | { type: 'cat_revealed'; playerId: string }
  | { type: 'dog_revealed'; playerId: string; firstVoterId: string }
  | { type: 'vote_cast'; playerId: string }
  | { type: 'vote_resolved'; eliminated: string[]; thiefCaught: boolean; winners: string[] }
  | { type: 'game_finished'; winners: string[] };

export type CheeseThiefReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: CheeseThiefState; events: CheeseThiefEvent[]; effects: GameEffect[] };

/** 终局前不公开；game_over 时完整披露用于复盘 */
export interface CheeseThiefReveal {
  thiefId: string | null;
  stealHour: number | null;
  wakeHours: Record<string, number>;
  accomplices: string[];
  peeks: Array<{ viewer: string; target: string }>;
}

export interface CheeseThiefPublicView {
  gameId: 'cheese-thief';
  rulesetId: 'cheese_thief_classic_v1';
  schemaVersion: 1;
  phase: CheeseThiefPhase;
  players: string[];
  /** 奶酪是否已被取走（夜间公开：桌台与各端可见；大盗身份仍保密） */
  cheeseStolen: boolean;
  mode: 'standard' | 'simulator';
  /** night 阶段当前时刻；其余阶段为 0 */
  currentHour: number;
  /** 是否启用身份卡 */
  roleCardsEnabled: boolean;
  /** 已展示的猫玩家（公开信息） */
  revealedCat: string | null;
  /** 已展示的狗玩家与指定先投票者（公开信息） */
  revealedDog: string | null;
  dogFirstVoter: string | null;
  /** 投票已结算时为布尔；未结算为 null */
  thiefCaught: boolean | null;
  winners: string[];
  /** 仅 game_over 时披露完整真相（复盘） */
  reveal: CheeseThiefReveal | null;
}

export interface CheeseThiefPlayerView extends CheeseThiefPublicView {
  me: {
    playerId: string;
    /** 自己的醒来时刻 */
    wakeHour: number;
    /** 4 人局变体：自己掷出的两个候选时刻 */
    hourChoices: [number, number] | null;
    /** 与我同一时刻醒来的其他玩家（目击名单） */
    coWakers: string[];
    /** 我醒来时奶酪已不在（真凶已先得手） */
    cheeseWasMissing: boolean;
    /** 我是大盗 */
    isThief: boolean;
    /** 我是共犯 */
    isAccomplice: boolean;
    /** 相识配置下可见的共犯名单；不相识时仅本人可见 */
    knownAccomplices: string[];
    /** 我的身份卡（'none' 表示无） */
    roleCard: RoleCard | 'none';
    /** 我是独醒村民且奶酪已失时，可偷看他人骰子的窗口标志 */
    canPeek: boolean;
    /** 我偷看到的玩家骰点（peek 完成后） */
    peekedHour: { target: string; hour: number } | null;
    /** 猫偷看到的玩家骰点（我是猫且已展示时） */
    catPeekedHour: { target: string; hour: number } | null;
    /** 当前投票阶段是否已投过票 */
    hasVoted: boolean;
  } | null;
}

export interface CheeseThiefResult {
  winners: string[];
  thiefId: string | null;
  thiefCaught: boolean;
  eliminated: string[];
}
