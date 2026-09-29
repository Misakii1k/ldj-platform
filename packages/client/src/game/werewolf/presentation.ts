import type { WerewolfAnnouncement } from '@ldj/shared';
/**
 * 狼人杀客户端表现层映射：把服务端权威视角翻译成纯展示数据。
 * 只消费 parseWerewolfView 的结果，不读取权威快照，不合成新动作，不重算票数。
 * 目标合法性与服务端 reducer 保持一致；服务端仍是唯一裁判。
 */
import type {
  WerewolfConfigView,
  WerewolfPhase,
  WerewolfRole,
  WerewolfTeam,
  WerewolfView,
  WerewolfVoteOutcome,
} from './types.ts';
import type { ChatMessageView, WerewolfTimeline } from '@ldj/shared';
import type { MemberLike } from '../useGameAction.ts';
import { nameFor } from '../useGameAction.ts';
import { resolveMemberAvatar } from '../../user/avatar.ts';
import type { ServerClockSample, TimelineTimerDisplay } from '../../shared-ui/serverClock.ts';
import { formatTimelineTimer } from '../../shared-ui/serverClock.ts';

export const WEREWOLF_ROLE_NAMES: Record<WerewolfRole, string> = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  hunter: '猎人',
  idiot: '白痴',
};

const PHASE_LABELS: Record<WerewolfPhase, string> = {
  role_reveal: '身份确认',
  night: '夜晚行动',
  hunter_shot: '猎人开枪',
  day_announcement: '天亮公告',
  discussion: '轮流发言',
  free_discussion: '自由发言',
  voting: '放逐投票',
  runoff_voting: '加赛投票',
  vote_result: '投票结果',
  last_words: '遗言阶段',
  game_over: '对局结束',
};

const PHASE_MOODS: Record<WerewolfPhase, 'dusk' | 'night' | 'dawn' | 'day' | 'verdict'> = {
  role_reveal: 'dusk',
  night: 'night',
  hunter_shot: 'night',
  day_announcement: 'dawn',
  discussion: 'day',
  free_discussion: 'day',
  voting: 'day',
  runoff_voting: 'day',
  vote_result: 'verdict',
  last_words: 'verdict',
  game_over: 'verdict',
};

export type WerewolfMood = (typeof PHASE_MOODS)[WerewolfPhase];

export interface WerewolfSeatModel {
  readonly playerId: string;
  readonly name: string;
  readonly seatLabel: string;
  readonly alive: boolean;
  readonly statusLabel: string;
  readonly isSelf: boolean;
  readonly isSpeaking: boolean;
  readonly isWolfTeammate: boolean;
  readonly idiotRevealed: boolean;
  readonly revealedRoleLabel: string | null;
  readonly avatar?: string;
  /** 点击该席位头像后可执行的动作（如投票放逐/查验/毒杀），由 actionGroups 派生。 */
  readonly targetActions: readonly WerewolfActionOption[];
  /** 是否为本人当前锁定的目标（如已投该席/已锁定袭击/已验该席） */
  readonly isMyTarget?: boolean;
  /** 预言家查验该席位的阵营结果（仅预言家本人可见） */
  readonly seerResultTeam?: WerewolfTeam | null;
  /** 预言家查验该席位的标签（如“好人”或“狼人”，仅预言家本人可见） */
  readonly seerResultLabel?: string | null;
}

export interface WerewolfActionOption {
  readonly id: string;
  readonly label: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface WerewolfActionGroup {
  readonly id: string;
  readonly title: string;
  readonly hint: string | null;
  readonly options: readonly WerewolfActionOption[];
}

export const WEREWOLF_ROLE_ARTWORK: Record<WerewolfRole, string> = {
  wolf: '/assets/roles/werewolf.png',
  seer: '/assets/roles/seer.png',
  witch: '/assets/roles/witch.png',
  hunter: '/assets/roles/hunter.png',
  guard: '/assets/roles/guard.png',
  villager: '/assets/roles/villager.png',
  idiot: '/assets/roles/idiot.png',
};

export const WEREWOLF_ROLE_DETAILS: Record<WerewolfRole, { skill: string; win: string }> = {
  wolf: {
    skill: '夜晚与同伴商议，袭击并淘汰一名玩家。白天隐藏身份，引导放逐好人。',
    win: '屠边或屠城成功：消灭所有神职，或消灭所有村民。',
  },
  seer: {
    skill: '每晚查验一名存活玩家，得知对方属于狼人还是好人。',
    win: '好人获胜：放逐全部狼人。',
  },
  witch: {
    skill: '解药救治当晚遇袭玩家，毒药淘汰一名玩家。各用一次，同一晚通常不能同时使用两瓶药。',
    win: '好人获胜：放逐全部狼人。',
  },
  guard: {
    skill: '每晚守护一名玩家，使其免受当晚狼人袭击。不能连续两晚守护同一人。',
    win: '好人获胜：放逐全部狼人。',
  },
  hunter: {
    skill: '在被投票放逐或被狼人夜间袭击淘汰时，可以开枪带走场上一名存活玩家（被毒杀除外）。',
    win: '好人获胜：放逐全部狼人。',
  },
  villager: {
    skill: '没有夜间特殊技能，依靠白天的发言逻辑与投票放逐狼人。',
    win: '好人获胜：放逐全部狼人。',
  },
  idiot: {
    skill: '白天被放逐时翻开身份牌免于出局，但翻牌后失去之后的投票权，仍可正常发言。',
    win: '好人获胜：放逐全部狼人。',
  },
};

export interface WerewolfSelfModel {
  readonly playerId: string;
  readonly role: WerewolfRole;
  readonly roleLabel: string;
  readonly roleHint: string;
  readonly alive: boolean;
  readonly artworkUrl: string;
  readonly wolfTeammates: readonly {
    readonly playerId: string;
    readonly name: string;
    readonly seatLabel: string;
    readonly alive: boolean;
    readonly targetName: string | null;
    readonly targetSeatLabel?: string;
  }[];
  readonly seerResults: readonly {
    readonly night: number;
    readonly name: string;
    readonly seatLabel: string;
    readonly team: WerewolfTeam;
    readonly teamLabel: string;
  }[];
  readonly witchSaveUsed: boolean;
  readonly witchPoisonUsed: boolean;
  readonly nightVictimName: string | null;
  readonly nightVictimSeat: number | null;
  readonly canWitchSelfSave: boolean;
  readonly lastGuardTargetName: string | null;
  /** 守卫上一夜守护的玩家 id（剧场 W04 派生，契约 §2 引用 lastGuardTargetId；用于稳定标记席位） */
  readonly lastGuardTargetPlayerId: string | null;
  readonly pendingShoot: boolean;
  readonly idiotRevealed: boolean;
  readonly hasNightVoted: boolean;
  readonly witchSaveDecision: boolean | null;
  readonly witchPoisonDecided: boolean;
  readonly guardDecided: boolean;
}

export interface WerewolfPresentationModel {
  readonly phase: WerewolfPhase;
  readonly phaseLabel: string;
  readonly mood: WerewolfMood;
  readonly day: number;
  readonly dayLabel: string;
  readonly narrative: string;
  readonly deadlineAt: number | null;
  readonly spectator: boolean;
  readonly config: WerewolfConfigView;
  readonly seats: readonly WerewolfSeatModel[];
  readonly self: WerewolfSelfModel | null;
  readonly activeSpeakerSeat?: WerewolfSeatModel | null;
  readonly actionGroups: readonly WerewolfActionGroup[];
  readonly waitingHint: string | null;
  readonly voteProgress: {
    readonly submitted: number;
    readonly expected: number;
    readonly percent: number;
    readonly remaining: number;
    readonly isVoter: boolean;
    readonly hasVoted: boolean;
    readonly isRunoffCandidate: boolean;
    readonly isRunoff: boolean;
  } | null;
  readonly voteLedger: {
    readonly headline: string;
    readonly outcome?: WerewolfVoteOutcome;
    readonly rows: readonly {
      readonly playerId: string;
      readonly name: string;
      readonly seatLabel: string;
      readonly count: number;
    }[];
    readonly abstained: number;
    /** 被放逐者的席位号（用于法官语音播报）；翻牌免死/平票时为 null。 */
    readonly exiledSeat: number | null;
  } | null;
  /** 加赛候选人 id 列表（仅 runoff_voting 阶段非空；剧场 W05 派生，契约 §2 引用 runoffCandidates） */
  readonly runoffCandidateIds: readonly string[];
  /** 发身份确认进度（仅 role_reveal 阶段非空；剧场 W06 派生，契约 §2 引用 confirmedRolePlayerIds） */
  readonly roleRevealProgress: { readonly confirmed: number; readonly total: number } | null;
  /** 已确认身份的玩家 id（仅 role_reveal 阶段非空；用于票根「已确认」状态行） */
  readonly roleConfirmedIds: readonly string[];
  /** 昨夜死亡者的席位号列表（天亮公告语音播报用）。 */
  readonly nightDeathSeats: readonly number[];
  readonly nightStage: 'wolf' | 'witch' | 'seer' | 'guard' | 'done' | null;
  readonly pendingShooterId: string | null;
  readonly winner: WerewolfTeam | null;
  readonly reveal: {
    readonly headline: string;
    readonly rows: readonly {
      readonly playerId: string;
      readonly name: string;
      /** 以下终局扩展字段由 v2 引擎视图填充；真人主持（moderator/*）视图不填，消费方需回退 */
      readonly seatLabel?: string;
      /** 角色 key（终局揭晓票根翻面用；仅 game_over 出现） */
      readonly role?: WerewolfRole;
      readonly roleLabel: string;
      readonly team?: WerewolfTeam;
      readonly artworkUrl?: string;
      /** 死因或「存活」（终局揭晓才展示，契约 §2） */
      readonly detail?: string;
      readonly alive?: boolean;
      readonly avatar?: string;
    }[];
  } | null;
  /** 终局逐日票型小条（仅 game_over 出现；剧场 W07 派生，数据来自公开 voteHistory） */
  readonly finaleDays: readonly { readonly key: string; readonly label: string; readonly text: string }[];
  /** 胜方阵容（按角色去重 + 席位号；仅 game_over 且有胜负时出现） */
  readonly winnerLineup: readonly {
    readonly role: WerewolfRole;
    readonly roleLabel: string;
    readonly artworkUrl: string;
    readonly seatLabels: readonly string[];
  }[] | null;
  /** 当前发言者最近一条公屏，遗言阶段同样适用 */
  readonly speakerLine: string | null;
  /** 房间扩展角色池配置 */
  readonly rolesConfig: { readonly guard: boolean; readonly hunter: boolean; readonly idiot: boolean };
  /** 当日发言顺序玩家 id（仅 discussion 阶段有值；剧场 W03 派生） */
  readonly speakingOrderIds: readonly string[];
  /** 当前发言者在发言顺序中的下标（0 起；无发言者或非讨论阶段为 -1） */
  readonly speechOrderIndex: number;
  /** 下一位待发言的存活玩家 id（无则 null；已出局者会被跳过） */
  readonly nextSpeakerId: string | null;
  /** 自由发言环节已就绪玩家数量 */
  readonly freeDiscussionReadyCount?: number;
  /** 本人是否已在自由发言环节就绪 */
  readonly hasReadiedVote?: boolean;
  /** 权威公共时间线（Contract B / T08） */
  readonly timeline: WerewolfTimeline | null;
  readonly announcement?: WerewolfAnnouncement | null;
  readonly isAuthoritativeTimeline: boolean;
  readonly timelineTimer: TimelineTimerDisplay | null;
}

/**
 * 根据席位头像或座位编号解析 Wolfcha 风格人物立绘资源路径
 */
export function getSpeakerIllustrationUrl(avatar?: string | null, seatLabel?: string | null): string {
  if (avatar) {
    if (avatar.startsWith('notion_')) {
      return `/assets/avatars/notion/${avatar}.png`;
    }
    if (avatar.startsWith('preset:notion_')) {
      return `/assets/avatars/notion/${avatar.replace('preset:', '')}.png`;
    }
    if (avatar.startsWith('notion60_')) {
      return `/assets/avatars/notion60/avatar_${avatar.replace('notion60_', '')}.png`;
    }
    if (avatar.startsWith('/') || avatar.startsWith('http')) {
      return avatar;
    }
  }
  const seatNum = seatLabel ? Number(seatLabel.replace(/\D/g, '')) || 1 : 1;
  const idx = ((seatNum - 1) % 64) + 1;
  return `/assets/avatars/notion/notion_${String(idx).padStart(2, '0')}.png`;
}

function teamLabel(team: WerewolfTeam | null): string {
  if (team === 'wolves') return '狼人阵营';
  if (team === 'village') return '好人阵营';
  return '未知阵营';
}

function seatLabelOf(seat: number): string {
  return `${seat + 1} 号`;
}

function statusLabelOf(view: WerewolfView, playerId: string): string {
  const player = view.players.find((entry) => entry.playerId === playerId);
  if (!player) return '未知';
  if (!player.alive) {
    return '已出局';
  }
  if (player.idiotRevealed) return '存活 · 白痴已翻牌';
  return '存活';
}

function roleHintOf(view: WerewolfView, members: readonly MemberLike[]): string {
  const me = view.me;
  if (!me) return '等待对局视角同步';
  if (me.role === 'wolf') {
    const mates = me.wolfTeammateIds.map((id) => nameFor(members, id)).join('、');
    const scope = view.config.wolfKillScope === 'any'
      ? '本局夜间袭击可选任意存活玩家，包括你自己与同伴'
      : '本局夜间袭击不能选同伴，也不能选自己';
    return `${mates ? `同伴：${mates}` : '同伴：无'} · ${scope}`;
  }
  if (me.role === 'seer') {
    const last = me.seerResults[me.seerResults.length - 1];
    return last ? `最近查验：${nameFor(members, last.playerId)} 是 ${teamLabel(last.team)}` : '尚未查验过任何人';
  }
  if (me.role === 'witch') {
    return [me.witchSaveUsed ? '解药已用' : '解药可用', me.witchPoisonUsed ? '毒药已用' : '毒药可用'].join(' · ');
  }
  if (me.role === 'guard') {
    return me.lastGuardTargetId
      ? `上一夜守护：${nameFor(members, me.lastGuardTargetId)}（不可连守）`
      : '上一夜未守护任何人';
  }
  if (me.role === 'hunter') return me.pendingShoot ? '你可以开枪带走一名存活玩家' : '出局时可能触发开枪';
  if (me.role === 'idiot') return me.idiotRevealed ? '已翻牌免死，失去投票权' : '被放逐时会翻牌免死';
  return '你没有夜间技能，请隐藏好自己';
}

function aliveOthers(view: WerewolfView): readonly WerewolfView['players'][number][] {
  return view.players.filter((player) => player.alive && player.playerId !== view.me?.playerId);
}

function waitingHintOf(view: WerewolfView, canAct: boolean): string | null {
  if (view.phase === 'game_over') return null;
  if (canAct) return null;
  const me = view.me;
  if (!me) return '你当前处于观战状态。';
  if (!me.alive) return '你已出局，请保持安静。';
  if (view.timeline) {
    if (view.timeline.paused) return '对局已暂停，等待主持人恢复';
    if (view.timeline.mode === 'manual') return '等待主持人推进环节';
    if (view.timeline.segment === 'intro' || view.timeline.segment === 'open') return '正在播报环节指引...';
    if (view.timeline.segment === 'action' && view.timeline.role !== me.role) return '等待其他角色行动...';
    if (view.timeline.segment === 'close') return '闭眼环节，请稍候...';
  }
  if (view.phase === 'runoff_voting' && (view.runoffCandidates ?? []).includes(me.playerId)) {
    return '你是加赛候选人，本轮不投票';
  }
  if (me.idiotRevealed && (view.phase === 'voting' || view.phase === 'runoff_voting')) return '已翻牌免死，失去投票权，等待其他玩家投票...';
  if (view.phase === 'role_reveal') return '等待其他玩家确认身份...';
  if (view.phase === 'night') return '黑夜漫漫，请等待法官唤醒你的角色...';
  if (view.phase === 'day_announcement') return '等待其他玩家确认死讯...';
  if (view.phase === 'discussion') return '等待当前发言者发言完毕...';
  if (view.phase === 'voting' || view.phase === 'runoff_voting') return '等待其他玩家投票...';
  if (view.phase === 'vote_result') return '正在展示投票结果...';
  if (view.phase === 'last_words') return '正在听取遗言...';
  if (view.phase === 'hunter_shot') return '等待猎人决断...';
  return null;
}

function targetOptions(
  members: readonly MemberLike[],
  players: readonly WerewolfView['players'][number][],
  verb: string,
  payload: (playerId: string) => Readonly<Record<string, unknown>>,
): WerewolfActionOption[] {
  return players.map((player) => ({
    id: player.playerId,
    label: `${verb} ${seatLabelOf(player.seat)} ${nameFor(members, player.playerId)}`,
    payload: payload(player.playerId),
  }));
}

function narrativeOf(view: WerewolfView, members: readonly MemberLike[]): string {
  switch (view.phase) {
    case 'role_reveal':
      return `已确认身份 ${view.confirmedRolePlayerIds.length}/${view.players.length}，全部确认后进入第 1 夜。`;
    case 'night':
      return '月色最深的时刻，各角色依次行动。';
    case 'hunter_shot':
      return `${nameFor(members, view.pendingShooterId)} 正在决定是否开枪。`;
    case 'day_announcement':
      return view.lastNightDeaths.length > 0
        ? `昨夜出局：${view.lastNightDeaths.map((id) => nameFor(members, id)).join('、')}。`
        : '昨夜平安夜，无人出局。';
    case 'discussion':
      return `${nameFor(members, view.currentSpeakerId)} 正在发言。`;
    case 'free_discussion':
      return '自由发言阶段，存活玩家可自由辩论；全员准备或倒计时结束进入投票。';
    case 'voting':
      return '公开投票放逐一名玩家，也可以弃票。';
    case 'runoff_voting':
      return '最高票并列，进入加赛投票，只能投给候选人。';
    case 'vote_result':
      return '票数已封存，结果展示后自动进入下一阶段。';
    case 'last_words':
      return `${nameFor(members, view.lastWordsPlayerId)} 正在发表遗言。`;
    case 'game_over':
      return view.aborted ? '本局已中止。' : `${teamLabel(view.winner)}获胜。`;
  }
}

function buildActionGroups(view: WerewolfView, members: readonly MemberLike[]): readonly WerewolfActionGroup[] {
  const me = view.me;
  if (!me || me.forfeited) return [];
  if (view.timeline?.paused) return [];
  const timelineId = view.timeline?.id;
  const groups: WerewolfActionGroup[] = [];

  const isNightRoleAction = (role: WerewolfRole): boolean => {
    if (!view.timeline) return true;
    return view.timeline.role === role && view.timeline.segment === 'action';
  };

  if (view.phase === 'role_reveal' && me.alive) {
    groups.push({
      id: 'confirm_role',
      title: '就绪确认',
      hint: me.confirmedRole ? '已确认身份，等待全员就绪' : '请查看中央卡牌并确认身份',
      options: me.confirmedRole ? [] : [{
        id: 'confirm',
        label: '我已记住身份并就绪',
        payload: { type: 'confirm_role' },
      }],
    });
    return groups;
  }

  if (view.phase === 'night' && me.alive) {
    if (me.role === 'wolf') {
      const isMyTurn = isNightRoleAction('wolf');
      const candidates = view.config.wolfKillScope === 'any'
        ? view.players.filter((player) => player.alive)
        : aliveOthers(view).filter((player) => !(me.wolfTeammateIds ?? []).includes(player.playerId));
      const myVotedTarget = me.hasNightVoted && me.myVote ? me.myVote : null;
      const options: WerewolfActionOption[] = (me.hasNightVoted || !isMyTurn) ? [] : targetOptions(
        members,
        candidates,
        '袭击',
        (targetPlayerId) => (timelineId ? { type: 'night_kill', targetPlayerId, timelineId } : { type: 'night_kill', targetPlayerId }),
      );
      groups.push({
        id: 'night_kill',
        title: '狼人夜袭',
        hint: !isMyTurn
          ? (view.timeline?.mode === 'manual' ? '等待主持人推进' : '等待轮到狼人行动')
          : myVotedTarget
            ? `你已锁定袭击 ${nameFor(members, myVotedTarget)}，等待同伴决断`
            : view.config.wolfKillScope === 'any'
              ? '请选择今夜袭击目标（包含自己或同伴）'
              : '请选择今夜袭击目标',
        options,
      });
    }

    if (me.role === 'seer') {
      const isMyTurn = isNightRoleAction('seer');
      const candidates = aliveOthers(view);
      const latestResult = me.seerResults[me.seerResults.length - 1];
      const tonightResult = (me.seerResults ?? []).find((r) => r.night === view.day);
      const displayResult = tonightResult ?? latestResult;
      groups.push({
        id: 'seer_check',
        title: '预言家查验',
        hint: !isMyTurn
          ? (view.timeline?.mode === 'manual' ? '等待主持人推进' : '等待轮到预言家行动')
          : me.seerCheckedThisNight
            ? (displayResult
                ? `今夜查验完成：${nameFor(members, displayResult.playerId)} 是【${teamLabel(displayResult.team)}】`
                : '今晚查验已完成')
            : '请选择一名存活玩家查验阵营',
        options: (me.seerCheckedThisNight || !isMyTurn) ? [] : targetOptions(
          members,
          candidates,
          '查验',
          (targetPlayerId) => (timelineId ? { type: 'seer_check', targetPlayerId, timelineId } : { type: 'seer_check', targetPlayerId }),
        ),
      });
    }

    if (me.role === 'witch') {
      const isMyTurn = isNightRoleAction('witch');
      const victim = me.nightVictimId ? view.players.find((player) => player.playerId === me.nightVictimId) : null;
      const canSelfSave = me.nightVictimId !== me.playerId || me.witchCanSelfSave;
      const saveOptions: WerewolfActionOption[] = [];
      if (isMyTurn && !me.witchSaveUsed && victim && me.witchSaveDecision === null) {
        if (canSelfSave) saveOptions.push({
          id: 'save_yes',
          label: `使用解药救 ${seatLabelOf(victim.seat)} ${nameFor(members, victim.playerId)}`,
          payload: timelineId ? { type: 'witch_save', save: true, timelineId } : { type: 'witch_save', save: true },
        });
        saveOptions.push({
          id: 'skip_save',
          label: '不使用解药',
          payload: timelineId ? { type: 'witch_save', save: false, timelineId } : { type: 'witch_save', save: false },
        });
      }

      if (saveOptions.length > 0 || !isMyTurn) {
        groups.push({
          id: 'witch_save',
          title: '女巫用药 · 解药',
          hint: !isMyTurn
            ? (view.timeline?.mode === 'manual' ? '等待主持人推进' : '等待轮到女巫行动')
            : victim
              ? `今夜遇袭的是 ${nameFor(members, victim.playerId)}`
              : '今夜无人遇袭',
          options: isMyTurn ? saveOptions : [],
        });
      }

      if (isMyTurn && me.witchSaveDecision !== null && !me.witchPoisonUsed && !me.witchPoisonDecided) {
        const poisonCandidates = aliveOthers(view);
        const options: WerewolfActionOption[] = me.witchSaveDecision === true ? [] : targetOptions(
          members,
          poisonCandidates,
          '毒杀',
          (targetPlayerId) => (timelineId ? { type: 'witch_poison', targetPlayerId, timelineId } : { type: 'witch_poison', targetPlayerId }),
        );
        options.push({
          id: 'poison_skip',
          label: '今晚不用毒药',
          payload: timelineId ? { type: 'witch_poison', targetPlayerId: null, timelineId } : { type: 'witch_poison', targetPlayerId: null },
        });
        groups.push({
          id: 'witch_poison',
          title: '女巫用药 · 毒药',
          hint: me.witchSaveDecision === true ? '已使用解药，今夜无法再用毒药' : '请选择要毒杀的目标，或选择跳过',
          options,
        });
      }
    }

    if (me.role === 'guard') {
      const isMyTurn = isNightRoleAction('guard');
      const candidates = (view.config?.rulesetId === 'werewolf_platform_open_kill_v1'
        ? view.players.filter((p) => p.alive)
        : aliveOthers(view)
      ).filter((player) => player.playerId !== me.lastGuardTargetId);
      const options: WerewolfActionOption[] = (me.guardDecided || !isMyTurn) ? [] : targetOptions(
        members,
        candidates,
        '守护',
        (targetPlayerId) => (timelineId ? { type: 'guard_guard', targetPlayerId, timelineId } : { type: 'guard_guard', targetPlayerId }),
      );
      if (isMyTurn && !me.guardDecided) {
        options.push({
          id: 'skip_guard',
          label: '今晚空守（不守护任何人）',
          payload: timelineId ? { type: 'guard_guard', targetPlayerId: null, timelineId } : { type: 'guard_guard', targetPlayerId: null },
        });
      }
      groups.push({
        id: 'guard_guard',
        title: '守卫守护',
        hint: !isMyTurn
          ? (view.timeline?.mode === 'manual' ? '等待主持人推进' : '等待轮到守卫行动')
          : me.guardDecided
            ? '今夜守护已决断'
            : me.lastGuardTargetId
              ? `昨夜守护了 ${nameFor(members, me.lastGuardTargetId)}，今夜不可连守`
              : '请选择今晚要守护的玩家',
        options,
      });
    }

    return groups;
  }

  if (view.phase === 'hunter_shot' && me.pendingShoot) {
    const candidates = aliveOthers(view);
    const options: WerewolfActionOption[] = targetOptions(
      members,
      candidates,
      '开枪带走',
      (targetPlayerId) => (timelineId ? { type: 'hunter_shoot', targetPlayerId, timelineId } : { type: 'hunter_shoot', targetPlayerId }),
    );
    options.push({
      id: 'shoot_skip',
      label: '放弃开枪',
      payload: timelineId ? { type: 'hunter_shoot', targetPlayerId: null, timelineId } : { type: 'hunter_shoot', targetPlayerId: null },
    });
    groups.push({ id: 'hunter_shoot', title: '猎人开枪', hint: '请选择一名存活玩家开枪带走，或放弃', options });
    return groups;
  }

  if (view.phase === 'day_announcement' && me) {
    groups.push({
      id: 'confirm_announcement',
      title: '死讯确认',
      hint: me.confirmedAnnouncement ? '你已确认死讯，等待其他人完成' : '请确认已知晓昨夜结果',
      options: me.confirmedAnnouncement ? [] : [{
        id: 'confirm_day',
        label: '已知晓死讯',
        payload: timelineId ? { type: 'confirm_announcement', timelineId } : { type: 'confirm_announcement' },
      }],
    });
    return groups;
  }

  if (view.phase === 'discussion' && me.alive && view.currentSpeakerId === me.playerId) {
    groups.push({
      id: 'finish_speech',
      title: '轮到你发言',
      hint: '公屏打字发言后，点击结束发言交麦给下一位',
      options: [{
        id: 'finish_speech',
        label: '结束发言',
        payload: timelineId ? { type: 'finish_speech', timelineId } : { type: 'finish_speech' },
      }],
    });
    return groups;
  }

  if (view.phase === 'free_discussion' && me.alive) {
    const readyCount = view.freeDiscussionReadyPlayerIds?.length ?? 0;
    const aliveCount = view.players.filter((p) => p.alive).length;
    const hasReadied = Boolean(me.hasReadiedVote || (view.freeDiscussionReadyPlayerIds ?? []).includes(me.playerId));
    groups.push({
      id: 'ready_vote',
      title: '自由发言',
      hint: hasReadied
        ? `你已准备就绪（全员已就绪 ${readyCount}/${aliveCount}），可继续在公屏畅聊`
        : `自由辩论环节，存活玩家均可畅所欲言；准备好后请点击进入投票`,
      options: hasReadied ? [] : [{
        id: 'ready_vote',
        label: `准备进入投票 (${readyCount}/${aliveCount})`,
        payload: timelineId ? { type: 'ready_vote', timelineId } : { type: 'ready_vote' },
      }],
    });
    return groups;
  }

  if ((view.phase === 'voting' || view.phase === 'runoff_voting') && me.alive && !me.idiotRevealed) {
    const isRunoff = view.phase === 'runoff_voting';
    if (isRunoff && view.runoffCandidates.includes(me.playerId)) {
      return groups;
    }
    const candidates = isRunoff
      ? view.players.filter((p) => p.alive && view.runoffCandidates.includes(p.playerId) && p.playerId !== me.playerId && !p.idiotRevealed)
      : aliveOthers(view).filter((p) => !p.idiotRevealed);
    const options: WerewolfActionOption[] = me.hasVoted ? [] : targetOptions(
      members,
      candidates,
      '投票放逐',
      (targetPlayerId) => (timelineId ? { type: 'day_vote', targetPlayerId, timelineId } : { type: 'day_vote', targetPlayerId }),
    );
    if (!me.hasVoted) {
      options.push({
        id: 'abstain',
        label: '弃票',
        payload: timelineId ? { type: 'day_vote', targetPlayerId: null, timelineId } : { type: 'day_vote', targetPlayerId: null },
      });
    }
    groups.push({
      id: 'day_vote',
      title: isRunoff ? '加赛放逐投票' : '放逐投票',
      hint: me.hasVoted ? '你已完成投票，等待全场结果' : isRunoff ? '加赛只能投给平票候选人' : '请选择你要放逐的玩家',
      options,
    });
    return groups;
  }

  if (view.phase === 'last_words' && view.lastWordsPlayerId === me.playerId) {
    groups.push({
      id: 'finish_last_words',
      title: '发表遗言',
      hint: '发表完毕后，点击完成遗言进入下一阶段',
      options: [{
        id: 'finish_lw',
        label: '完成遗言',
        payload: timelineId ? { type: 'finish_last_words', timelineId } : { type: 'finish_last_words' },
      }],
    });
    return groups;
  }

  return groups;
}

function voteLedgerOf(
  view: WerewolfView,
  members: readonly MemberLike[],
): WerewolfPresentationModel['voteLedger'] {
  const summary = view.lastVoteSummary;
  if (!summary) return null;

  let headline = '本轮投票已结束';
  let exiledSeat: number | null = null;
  if (summary.outcome === 'eliminated' && summary.eliminatedPlayerId) {
    const player = view.players.find((p) => p.playerId === summary.eliminatedPlayerId);
    exiledSeat = player ? player.seat : null;
    headline = `${nameFor(members, summary.eliminatedPlayerId)} 最高票出局`;
  } else if (summary.outcome === 'idiot_saved' && summary.eliminatedPlayerId) {
    headline = `${nameFor(members, summary.eliminatedPlayerId)} 最高票但为白痴，翻牌免死`;
  } else if (summary.outcome === 'tie') {
    headline = '平票，进入加赛投票';
  } else if (summary.outcome === 'runoff_tie') {
    headline = '加赛再次平票，今日无人出局';
  } else if (summary.outcome === 'no_votes') {
    headline = '全员弃票，今日无人出局';
  }

  return {
    headline,
    outcome: summary.outcome,
    rows: Object.entries(summary.tally).map(([targetId, count]) => {
      const target = view.players.find((p) => p.playerId === targetId);
      return {
        playerId: targetId,
        name: nameFor(members, targetId),
        seatLabel: target ? seatLabelOf(target.seat) : '',
        count,
      };
    }),
    abstained: summary.abstained,
    exiledSeat,
  };
}

/** 终局死因文案（仅 game_over 后进入 DOM；放逐可从公开 voteHistory 补「第 N 天 · M 票」） */
function exitDetailOf(
  view: WerewolfView,
  playerId: string,
  player: WerewolfView['players'][number] | undefined,
): string {
  if (!player || player.alive) return '存活';
  if (player.exitReason === 'voted_out') {
    const rec = view.reveal?.voteHistory.find((r) => r.eliminatedPlayerId === playerId);
    if (rec) {
      const top = Math.max(...Object.values(rec.tally), 0);
      return `第 ${rec.day} 天 · ${top} 票放逐`;
    }
    return '被放逐';
  }
  switch (player.exitReason) {
    case 'night_kill': return '夜里被袭击';
    case 'poisoned': return '被女巫毒杀';
    case 'hunter_shot': return '被猎人带走';
    case 'disconnect_timeout': return '掉线出局';
    default: return '出局';
  }
}

/** 终局逐日票型小条（只来自公开 voteHistory；夜间死亡服务端不携带天数，故小条只列白天投票日） */
function finaleDaysOf(
  view: WerewolfView,
  members: readonly MemberLike[],
): { key: string; label: string; text: string }[] {
  if (!view.reveal) return [];
  return view.reveal.voteHistory.map((rec) => {
    let text: string;
    if (rec.outcome === 'eliminated' && rec.eliminatedPlayerId) {
      const target = view.players.find((p) => p.playerId === rec.eliminatedPlayerId);
      const top = Math.max(...Object.values(rec.tally), 0);
      text = `${target ? seatLabelOf(target.seat) : nameFor(members, rec.eliminatedPlayerId)} ${top} 票放逐`;
    } else if (rec.outcome === 'idiot_saved' && rec.eliminatedPlayerId) {
      const target = view.players.find((p) => p.playerId === rec.eliminatedPlayerId);
      text = `${target ? seatLabelOf(target.seat) : ''} 最高票翻牌免死`;
    } else if (rec.outcome === 'tie') {
      text = '平票进入加赛';
    } else if (rec.outcome === 'runoff_tie') {
      text = '加赛仍平票，无人出局';
    } else {
      text = '全员弃票，无人出局';
    }
    return { key: `d${rec.day}-${rec.kind}`, label: `第 ${rec.day} 天`, text };
  });
}

/** 胜方阵容：按角色去重，附席位号（终局揭晓的胜方插画并排） */
function winnerLineupOf(
  view: WerewolfView,
): { role: WerewolfRole; roleLabel: string; artworkUrl: string; seatLabels: string[] }[] | null {
  if (!view.winner || !view.reveal) return null;
  const byRole = new Map<WerewolfRole, string[]>();
  for (const player of view.players) {
    const role = view.reveal.roles[player.playerId];
    if (!role) continue;
    const team = role === 'wolf' ? 'wolves' : 'village';
    if (team !== view.winner) continue;
    const list = byRole.get(role) ?? [];
    list.push(seatLabelOf(player.seat));
    byRole.set(role, list);
  }
  return [...byRole.entries()].map(([role, seatLabels]) => ({
    role,
    roleLabel: WEREWOLF_ROLE_NAMES[role],
    artworkUrl: WEREWOLF_ROLE_ARTWORK[role] ?? '/assets/roles/villager.png',
    seatLabels,
  }));
}

export function latestSpeakerLine(
  speakerId: string | null,
  chat: readonly ChatMessageView[],
): string | null {
  if (!speakerId) return null;
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = chat[index];
    if (message && message.kind === 'player' && message.fromPlayerId === speakerId && !message.toPlayerId && message.text.trim()) {
      return message.text.trim();
    }
  }
  return null;
}

/** 从动作组派生每个席位的点选动作（点击头像后就地选择目标）；女巫解药额外挂到刀口席位。 */
function targetActionsByPlayer(view: WerewolfView, members: readonly MemberLike[]): Readonly<Record<string, readonly WerewolfActionOption[]>> {
  const map = new Map<string, WerewolfActionOption[]>();
  const me = view.me;
  if (!me || me.forfeited) return {};
  for (const group of buildActionGroups(view, members)) {
    for (const option of group.options) {
      const targetId = (option.payload as { targetPlayerId?: unknown }).targetPlayerId;
      if (typeof targetId !== 'string') continue;
      const list = map.get(targetId) ?? [];
      list.push(option);
      map.set(targetId, list);
    }
  }
  if (view.phase === 'night' && me.role === 'witch' && me.nightVictimId !== null && !me.witchSaveUsed && me.witchSaveDecision === null) {
    const canSelfSave = me.nightVictimId !== me.playerId || me.witchCanSelfSave;
    const timelineId = view.timeline?.id;
    if (canSelfSave) {
      const list = map.get(me.nightVictimId) ?? [];
      list.push({
        id: 'save_on_chip',
        label: '使用解药救他',
        payload: timelineId ? { type: 'witch_save', save: true, timelineId } : { type: 'witch_save', save: true },
      });
      map.set(me.nightVictimId, list);
    }
  }
  return Object.fromEntries(map);
}

export function buildWerewolfPresentation(
  view: WerewolfView,
  members: readonly MemberLike[],
  chat: readonly ChatMessageView[] = [],
  myAvatar?: string | null,
  clockSample?: ServerClockSample | null,
  currentMonotonic?: number,
): WerewolfPresentationModel {
  const me = view.me;
  const actionGroups = buildActionGroups(view, members);
  const voting = view.phase === 'voting' || view.phase === 'runoff_voting';
  const isRunoff = view.phase === 'runoff_voting';
  const isRunoffCandidate = Boolean(me && view.runoffCandidates?.includes(me.playerId));
  const isVoter = Boolean(me && me.alive && !me.idiotRevealed && (!isRunoff || !isRunoffCandidate));
  const hasVoted = Boolean(me?.hasVoted);
  const percent = view.votesExpected > 0 ? Math.round((view.votesSubmitted / view.votesExpected) * 100) : 0;
  const remaining = Math.max(0, view.votesExpected - view.votesSubmitted);
  const speakerId = view.phase === 'last_words' ? view.lastWordsPlayerId : view.currentSpeakerId;
  const targetActions = targetActionsByPlayer(view, members);
  // 剧场 W03 派生：讨论阶段的发言顺序、当前下标与下一位（跳过已出局者）
  const speakingOrderIds = view.phase === 'discussion' ? (view.speakingOrder ?? []) : [];
  const speechOrderIndex = speakingOrderIds.length > 0 && view.currentSpeakerId
    ? speakingOrderIds.indexOf(view.currentSpeakerId)
    : -1;
  const nextSpeakerId = speechOrderIndex >= 0
    ? (speakingOrderIds.slice(speechOrderIndex + 1).find((id) =>
        view.players.some((player) => player.playerId === id && player.alive)) ?? null)
    : null;

  return {
    phase: view.phase,
    phaseLabel: PHASE_LABELS[view.phase],
    mood: PHASE_MOODS[view.phase],
    day: view.day,
    dayLabel: view.day > 0 ? `第 ${view.day} 天` : '开局准备',
    narrative: narrativeOf(view, members),
    deadlineAt: view.deadlineAt,
    spectator: me === null,
    config: view.config,
    seats: view.players.map((player) => {
      const member = members.find((m) => m.playerId === player.playerId);
      const isSelf = player.playerId === me?.playerId;
      const avatar = resolveMemberAvatar(member, {
        isMe: isSelf,
        myAvatar,
        seat: player.seat,
        isZeroBased: true,
        playerId: player.playerId,
      });
      const seerResult = me?.role === 'seer'
        ? (me.seerResults ?? []).find((r) => r.playerId === player.playerId)
        : null;
      const seerResultTeam = seerResult?.team ?? null;
      const seerResultLabel = seerResult
        ? (seerResult.team === 'wolves' ? '狼人' : '好人')
        : null;
      const isMyTarget = Boolean(
        ((view.phase === 'voting' || view.phase === 'runoff_voting') && me?.myVote === player.playerId)
        || (view.phase === 'night' && me?.role === 'wolf' && me.wolfVotes?.[me.playerId] === player.playerId)
        || (view.phase === 'night' && me?.role === 'guard' && me.guardTargetId === player.playerId)
        || (view.phase === 'night' && me?.role === 'seer' && (me.seerResults ?? []).some((r) => r.night === view.day && r.playerId === player.playerId))
      );
      return {
        playerId: player.playerId,
        name: nameFor(members, player.playerId),
        seatLabel: seatLabelOf(player.seat),
        alive: player.alive,
        statusLabel: statusLabelOf(view, player.playerId),
        isSelf: player.playerId === me?.playerId,
        isSpeaking:
          (view.phase === 'discussion' && player.playerId === view.currentSpeakerId)
          || (view.phase === 'last_words' && player.playerId === view.lastWordsPlayerId),
        isWolfTeammate: (me?.wolfTeammateIds ?? []).includes(player.playerId),
        idiotRevealed: player.idiotRevealed,
        revealedRoleLabel: player.revealedRole ? WEREWOLF_ROLE_NAMES[player.revealedRole] : null,
        avatar,
        targetActions: targetActions[player.playerId] ?? [],
        isMyTarget,
        seerResultTeam,
        seerResultLabel,
      };
    }),
    self: me
      ? {
          playerId: me.playerId,
          role: me.role,
          roleLabel: WEREWOLF_ROLE_NAMES[me.role],
          roleHint: roleHintOf(view, members),
          alive: me.alive,
          artworkUrl: WEREWOLF_ROLE_ARTWORK[me.role] ?? '/assets/roles/villager.png',
          wolfTeammates: (me.wolfTeammateIds ?? []).map((id) => {
            const player = view.players.find((p) => p.playerId === id);
            const targetId = me.wolfVotes?.[id];
            const targetPlayer = targetId ? view.players.find((p) => p.playerId === targetId) : null;
            return {
              playerId: id,
              name: nameFor(members, id),
              seatLabel: player ? seatLabelOf(player.seat) : '',
              alive: player ? player.alive : false,
              targetName: targetId ? nameFor(members, targetId) : null,
              targetSeatLabel: targetPlayer ? seatLabelOf(targetPlayer.seat) : '',
            };
          }),
          seerResults: (me.seerResults ?? []).map((res) => {
            const player = view.players.find((p) => p.playerId === res.playerId);
            return {
              night: res.night,
              name: nameFor(members, res.playerId),
              seatLabel: player ? seatLabelOf(player.seat) : '',
              team: res.team,
              teamLabel: teamLabel(res.team),
            };
          }),
          witchSaveUsed: Boolean(me.witchSaveUsed),
          witchPoisonUsed: Boolean(me.witchPoisonUsed),
          nightVictimName: me.nightVictimId ? nameFor(members, me.nightVictimId) : null,
          nightVictimSeat: me.nightVictimId
            ? view.players.find((player) => player.playerId === me.nightVictimId)?.seat ?? null
            : null,
          canWitchSelfSave: Boolean(me.witchCanSelfSave),
          lastGuardTargetName: me.lastGuardTargetId ? nameFor(members, me.lastGuardTargetId) : null,
          lastGuardTargetPlayerId: me.lastGuardTargetId ?? null,
          pendingShoot: Boolean(me.pendingShoot),
          idiotRevealed: Boolean(me.idiotRevealed),
          hasNightVoted: Boolean(me.hasNightVoted),
          witchSaveDecision: me.witchSaveDecision ?? null,
          witchPoisonDecided: Boolean(me.witchPoisonDecided),
          guardDecided: Boolean(me.guardDecided),
        }
      : null,
    actionGroups,
    waitingHint: waitingHintOf(view, actionGroups.length > 0),
    voteProgress: voting
      ? {
          submitted: view.votesSubmitted,
          expected: view.votesExpected,
          percent,
          remaining,
          isVoter,
          hasVoted,
          isRunoffCandidate,
          isRunoff,
        }
      : null,
    voteLedger: view.phase === 'vote_result' ? voteLedgerOf(view, members) : null,
    runoffCandidateIds: view.phase === 'runoff_voting' ? [...view.runoffCandidates] : [],
    roleRevealProgress: view.phase === 'role_reveal'
      ? { confirmed: view.confirmedRolePlayerIds.length, total: view.players.length }
      : null,
    roleConfirmedIds: view.phase === 'role_reveal' ? [...view.confirmedRolePlayerIds] : [],
    nightDeathSeats: view.lastNightDeaths
      .map((id) => view.players.find((player) => player.playerId === id)?.seat)
      .filter((seat): seat is number => typeof seat === 'number'),
    nightStage: view.nightStage ?? null,
    pendingShooterId: view.pendingShooterId ?? null,
    winner: view.winner ?? null,
    speakerLine: latestSpeakerLine(speakerId, chat),
    reveal: view.reveal
      ? {
          headline: view.aborted ? '本局已中止' : `${teamLabel(view.winner)}获胜`,
          rows: Object.entries(view.reveal.roles ?? {}).map(([playerId, role]) => {
            const player = view.players.find((p) => p.playerId === playerId);
            const member = members.find((m) => m.playerId === playerId);
            return {
              playerId,
              name: member ? nameFor(members, playerId) : '未知玩家',
              seatLabel: player ? seatLabelOf(player.seat) : '',
              role,
              roleLabel: WEREWOLF_ROLE_NAMES[role] ?? '未知身份',
              team: role === 'wolf' ? 'wolves' as const : 'village' as const,
              artworkUrl: WEREWOLF_ROLE_ARTWORK[role] ?? '/assets/roles/villager.png',
              detail: exitDetailOf(view, playerId, player),
              alive: player ? player.alive : undefined,
              avatar: member ? resolveMemberAvatar(member) : undefined,
            };
          }),
        }
      : null,
    finaleDays: view.reveal ? finaleDaysOf(view, members) : [],
    winnerLineup: winnerLineupOf(view),
    rolesConfig: view.config?.roles ?? { guard: false, hunter: false, idiot: false },
    speakingOrderIds,
    speechOrderIndex,
    nextSpeakerId,
    freeDiscussionReadyCount: view.freeDiscussionReadyPlayerIds?.length ?? 0,
    hasReadiedVote: Boolean(
      me?.hasReadiedVote || (view.freeDiscussionReadyPlayerIds ?? []).includes(me?.playerId ?? ''),
    ),
    timeline: view.timeline ?? null,
    announcement: view.announcement ?? null,
    isAuthoritativeTimeline: view.timeline !== null && view.timeline !== undefined,
    timelineTimer: view.timeline ? formatTimelineTimer(view.timeline, clockSample, currentMonotonic) : null,
  };
}
