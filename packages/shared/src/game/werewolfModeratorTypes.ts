/**
 * 狼人杀「真人主持模式」（werewolf_moderator_v1）共享契约与视图结构。
 */

export type WerewolfRole = 'wolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';
export type WerewolfTeam = 'wolves' | 'village';

export interface WerewolfRoleInfo {
  readonly role: WerewolfRole;
  readonly name: string;
  readonly camp: WerewolfTeam;
  readonly campName: '狼人阵营' | '好人阵营';
  readonly description: string;
  readonly artUrl: string;
}

export const WEREWOLF_ROLE_DEFS: Readonly<Record<WerewolfRole, WerewolfRoleInfo>> = {
  wolf: {
    role: 'wolf',
    name: '狼人',
    camp: 'wolves',
    campName: '狼人阵营',
    description: '夜间与狼同伴商讨并袭击村民，白天隐藏身份混淆视听，消灭所有神职或平民即获胜。',
    artUrl: '/assets/roles/werewolf.png',
  },
  seer: {
    role: 'seer',
    name: '预言家',
    camp: 'village',
    campName: '好人阵营',
    description: '每晚可查验一名存活玩家的真实阵营（狼人或好人），带领好人找出潜伏的狼人。',
    artUrl: '/assets/roles/seer.png',
  },
  witch: {
    role: 'witch',
    name: '女巫',
    camp: 'village',
    campName: '好人阵营',
    description: '拥有一瓶解药与一瓶毒药。解药可在夜间救治被袭击者，毒药可在夜间毒杀一人。',
    artUrl: '/assets/roles/witch.png',
  },
  hunter: {
    role: 'hunter',
    name: '猎人',
    camp: 'village',
    campName: '好人阵营',
    description: '出局时可翻开身份牌发动技能开枪带走任意一名存活玩家（被毒杀出局除外）。',
    artUrl: '/assets/roles/hunter.png',
  },
  guard: {
    role: 'guard',
    name: '守卫',
    camp: 'village',
    campName: '好人阵营',
    description: '每晚可守护一名玩家免受狼人伤害，但不能连续两晚守护同一人。',
    artUrl: '/assets/roles/guard.png',
  },
  idiot: {
    role: 'idiot',
    name: '白痴',
    camp: 'village',
    campName: '好人阵营',
    description: '白天被投票出局时可翻开身份牌免除放逐继续留在场上，但失去后续投票权。',
    artUrl: '/assets/roles/idiot.png',
  },
  villager: {
    role: 'villager',
    name: '普通村民',
    camp: 'village',
    campName: '好人阵营',
    description: '没有特殊技能，依靠白天认真听取发言、逻辑推理与投票保护村庄放逐狼人。',
    artUrl: '/assets/roles/villager.png',
  },
};

export interface WerewolfModeratorConfig {
  readonly rulesetId?: 'werewolf_moderator_v1';
  readonly moderatorPlayerId?: string;
  readonly hostPlayerId?: string;
  readonly guard?: boolean;
  readonly hunter?: boolean;
  readonly idiot?: boolean;
  readonly wolfDelta?: number;
  readonly roles?: {
    readonly guard?: boolean;
    readonly hunter?: boolean;
    readonly idiot?: boolean;
  };
}

export interface WerewolfModeratorPlayerSummary {
  readonly playerId: string;
  readonly seat: number;
  readonly isEliminated: boolean;
  /** 仅限主持人，或终局 gameEnded 时公开 */
  readonly role?: WerewolfRole;
  /** 仅限主持人，或终局 gameEnded 时公开 */
  readonly roleInfo?: WerewolfRoleInfo;
}

export interface WerewolfModeratorStatistics {
  readonly aliveWolves: number;
  readonly aliveGods: number;
  readonly aliveVillagers: number;
  readonly totalAlive: number;
  readonly totalEliminated: number;
  readonly totalPlayers: number;
}

export interface WerewolfModeratorView {
  readonly rulesetId: 'werewolf_moderator_v1';
  readonly isModerator: boolean;
  readonly moderatorPlayerId: string;
  readonly gameEnded: boolean;
  readonly winner: 'werewolf' | 'good' | null;
  readonly players: readonly WerewolfModeratorPlayerSummary[];
  /** 主持人端（或终局）可见统计 */
  readonly statistics?: WerewolfModeratorStatistics;
  /** 主持人端终局辅助判定建议 */
  readonly suggestedOutcome?: 'village_win' | 'wolves_win' | null;
  readonly suggestedOutcomeReason?: string | null;
  /** 普通玩家自身底牌（主持人为 null） */
  readonly myRole?: WerewolfRoleInfo | null;
  /** 当前玩家是否已出局 */
  readonly isMeEliminated?: boolean;
}

export type WerewolfModeratorAction =
  | { readonly type: 'begin' }
  | { readonly type: 'eliminate_player'; readonly targetPlayerId: string }
  | { readonly type: 'revive_player'; readonly targetPlayerId: string }
  | { readonly type: 'end_game' };
