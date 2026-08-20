/**
 * 狼人杀客户端表现层映射：把服务端权威视角翻译成纯展示数据。
 * 只消费 parseWerewolfView 的结果，不读取权威快照，不合成新动作，不重算票数。
 * 目标合法性与服务端 reducer 保持一致；服务端仍是唯一裁判。
 */
import type {
  WerewolfExitReason,
  WerewolfPhase,
  WerewolfRole,
  WerewolfTeam,
  WerewolfView,
} from './types.ts';
import type { MemberLike } from '../useGameAction.ts';
import { nameFor } from '../useGameAction.ts';

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
  voting: 'day',
  runoff_voting: 'day',
  vote_result: 'verdict',
  last_words: 'verdict',
  game_over: 'verdict',
};

const EXIT_REASON_LABELS: Record<WerewolfExitReason, string> = {
  night_kill: '夜晚遇袭',
  poisoned: '女巫毒杀',
  voted_out: '白天放逐',
  disconnect_timeout: '断线超时',
  hunter_shot: '猎人开枪',
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

export interface WerewolfTeammateInfo {
  readonly playerId: string;
  readonly name: string;
  readonly seatLabel: string;
  readonly alive: boolean;
  readonly targetName?: string | null;
}

export interface WerewolfSeerCheckInfo {
  readonly night: number;
  readonly name: string;
  readonly seatLabel: string;
  readonly team: WerewolfTeam;
  readonly teamLabel: string;
}

export interface WerewolfSelfModel {
  readonly playerId: string;
  readonly role: WerewolfRole;
  readonly roleLabel: string;
  readonly roleHint: string;
  readonly alive: boolean;
  readonly artworkUrl: string;
  readonly wolfTeammates: readonly WerewolfTeammateInfo[];
  readonly seerResults: readonly WerewolfSeerCheckInfo[];
  readonly witchSaveUsed: boolean;
  readonly witchPoisonUsed: boolean;
  readonly nightVictimName: string | null;
  readonly canWitchSelfSave: boolean;
  readonly lastGuardTargetName: string | null;
  readonly pendingShoot: boolean;
  readonly idiotRevealed: boolean;
}

export interface WerewolfPresentationModel {
  readonly phase: WerewolfPhase;
  readonly phaseLabel: string;
  readonly mood: WerewolfMood;
  readonly dayLabel: string;
  readonly narrative: string;
  readonly deadlineAt: number | null;
  readonly spectator: boolean;
  readonly seats: readonly WerewolfSeatModel[];
  readonly self: WerewolfSelfModel | null;
  readonly activeSpeakerSeat?: WerewolfSeatModel | null;
  readonly actionGroups: readonly WerewolfActionGroup[];
  readonly waitingHint: string | null;
  readonly voteProgress: { readonly submitted: number; readonly expected: number } | null;
  readonly voteLedger: {
    readonly headline: string;
    readonly rows: readonly { readonly name: string; readonly count: number }[];
    readonly abstained: number;
  } | null;
  readonly reveal: {
    readonly headline: string;
    readonly rows: readonly { readonly name: string; readonly roleLabel: string }[];
  } | null;
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
    const reason = player.exitReason ? EXIT_REASON_LABELS[player.exitReason] : null;
    return reason ? `已出局 · ${reason}` : '已出局';
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
      ? '本局夜刀可选任意存活玩家，包括你自己与同伴'
      : '本局夜刀不能选同伴，也不能选自己';
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

function buildActionGroups(view: WerewolfView, members: readonly MemberLike[]): WerewolfActionGroup[] {
  const me = view.me;
  if (!me || me.forfeited) return [];
  const others = aliveOthers(view);

  switch (view.phase) {
    case 'role_reveal':
      if (!me.alive || me.confirmedRole) return [];
      return [{
        id: 'confirm_role',
        title: '确认你的身份',
        hint: '所有人确认后进入第 1 夜',
        options: [{ id: 'confirm', label: '我已记住身份', payload: { type: 'confirm_role' } }],
      }];

    case 'night': {
      if (!me.alive) return [];
      if (me.role === 'wolf' && !me.hasNightVoted) {
        const targets = view.config.wolfKillScope === 'any'
          ? view.players.filter((player) => player.alive)
          : others.filter((player) => !me.wolfTeammateIds.includes(player.playerId));
        if (targets.length === 0) return [];
        return [{
          id: 'night_kill',
          title: '提交今夜的击杀票',
          hint: view.config.wolfKillScope === 'any'
            ? '每名狼人独立投票，可以选自己或同伴，最高票被袭击'
            : '每名狼人独立投票，最高票被袭击',
          options: targetOptions(members, targets, '投票击杀', (id) => ({ type: 'night_kill', targetPlayerId: id })),
        }];
      }
      if (me.role === 'seer' && !me.seerCheckedThisNight) {
        return [{
          id: 'seer_check',
          title: '选择查验目标',
          hint: '只会得知阵营，不会得知具体身份',
          options: targetOptions(members, others, '查验', (id) => ({ type: 'seer_check', targetPlayerId: id })),
        }];
      }
      if (me.role === 'witch' && me.nightVictimId !== null) {
        if (me.witchSaveDecision === null) {
          const canSelfSave = me.nightVictimId !== me.playerId || me.witchCanSelfSave;
          const options: WerewolfActionOption[] = [];
          if (!me.witchSaveUsed && canSelfSave) {
            options.push({
              id: 'save',
              label: `使用解药救 ${nameFor(members, me.nightVictimId)}`,
              payload: { type: 'witch_save', save: true },
            });
          }
          options.push({ id: 'skip_save', label: '不使用解药', payload: { type: 'witch_save', save: false } });
          return [{
            id: 'witch_save',
            title: `今夜被袭击的是 ${nameFor(members, me.nightVictimId)}`,
            hint: me.witchSaveUsed ? '解药已用完' : '同一夜不能同时使用解药和毒药',
            options,
          }];
        }
        if (!me.witchPoisonDecided) {
          const options: WerewolfActionOption[] = [];
          if (!me.witchPoisonUsed) {
            options.push(...targetOptions(members, others, '毒杀', (id) => ({ type: 'witch_poison', targetPlayerId: id })));
          }
          options.push({ id: 'skip_poison', label: '不使用毒药', payload: { type: 'witch_poison', targetPlayerId: null } });
          return [{
            id: 'witch_poison',
            title: '是否使用毒药',
            hint: me.witchPoisonUsed ? '毒药已用完' : '毒药无法被守卫挡下',
            options,
          }];
        }
        return [];
      }
      if (me.role === 'guard' && !me.guardDecided) {
        const candidates = others.filter((player) => player.playerId !== me.lastGuardTargetId);
        return [{
          id: 'guard_guard',
          title: '选择今夜守护目标',
          hint: '不能守自己，也不能连续两夜守同一人',
          options: [
            ...targetOptions(members, candidates, '守护', (id) => ({ type: 'guard_guard', targetPlayerId: id })),
            { id: 'skip_guard', label: '本夜不守护', payload: { type: 'guard_guard', targetPlayerId: null } },
          ],
        }];
      }
      return [];
    }

    case 'hunter_shot':
      if (!me.pendingShoot) return [];
      return [{
        id: 'hunter_shoot',
        title: '你可以开枪带走一人',
        hint: '也可以放弃开枪',
        options: [
          ...targetOptions(members, others, '开枪带走', (id) => ({ type: 'hunter_shoot', targetPlayerId: id })),
          { id: 'skip_shot', label: '放弃开枪', payload: { type: 'hunter_shoot', targetPlayerId: null } },
        ],
      }];

    case 'day_announcement':
      if (!me.alive || me.confirmedAnnouncement) return [];
      return [{
        id: 'confirm_announcement',
        title: '确认天亮信息',
        hint: `已确认 ${view.announcementConfirmedPlayerIds.length}/${view.players.filter((p) => p.alive).length}`,
        options: [{ id: 'confirm', label: '知道了，进入发言', payload: { type: 'confirm_announcement' } }],
      }];

    case 'discussion':
      if (view.currentSpeakerId !== me.playerId) return [];
      return [{
        id: 'finish_speech',
        title: '轮到你发言',
        hint: '发言内容走聊天通道',
        options: [{ id: 'done', label: '结束发言', payload: { type: 'finish_speech' } }],
      }];

    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.idiotRevealed || me.hasVoted) return [];
      const candidates = others.filter((player) => !player.idiotRevealed
        && (view.phase !== 'runoff_voting' || view.runoffCandidates.includes(player.playerId)));
      return [{
        id: 'day_vote',
        title: view.phase === 'runoff_voting' ? '加赛投票：只能投候选人' : '选择放逐目标',
        hint: '也可以弃票',
        options: [
          ...targetOptions(members, candidates, '投票放逐', (id) => ({ type: 'day_vote', targetPlayerId: id })),
          { id: 'abstain', label: '弃票', payload: { type: 'day_vote', targetPlayerId: null } },
        ],
      }];
    }

    case 'last_words':
      if (!me.lastWordsPending) return [];
      return [{
        id: 'finish_last_words',
        title: '发表遗言',
        hint: '结束后进入下一阶段',
        options: [{ id: 'done', label: '结束遗言', payload: { type: 'finish_last_words' } }],
      }];

    case 'vote_result':
    case 'game_over':
      return [];
  }
}

function waitingHintOf(view: WerewolfView, hasActions: boolean): string | null {
  if (hasActions) return null;
  const me = view.me;
  if (!me) return '你正在观战，看不到任何人的私密信息。';
  if (me.forfeited) return '你已退出本局。';
  if (!me.alive && view.phase !== 'game_over') return '你已出局，安静观战即可。';
  switch (view.phase) {
    case 'role_reveal':
      return '你已确认身份，等待其他玩家。';
    case 'night':
      return '天黑请闭眼，等待其他角色行动…';
    case 'hunter_shot':
      return '等待猎人完成决定…';
    case 'day_announcement':
      return '你已确认天亮信息，等待其他玩家。';
    case 'discussion':
      return '等待当前发言者结束…';
    case 'voting':
    case 'runoff_voting':
      return me.idiotRevealed ? '你已翻牌，失去投票权。' : '你已投票，等待统计。';
    case 'vote_result':
      return '结果展示后自动进入下一阶段。';
    case 'last_words':
      return '等待遗言结束…';
    case 'game_over':
      return null;
  }
}

function voteLedgerOf(view: WerewolfView, members: readonly MemberLike[]) {
  const summary = view.lastVoteSummary;
  if (!summary) return null;
  const eliminated = summary.eliminatedPlayerId ? nameFor(members, summary.eliminatedPlayerId) : null;
  const headline = summary.outcome === 'eliminated' && eliminated
    ? `${eliminated} 被放逐，进入遗言阶段`
    : summary.outcome === 'idiot_saved' && eliminated
      ? `${eliminated} 翻牌免死，失去投票权`
      : summary.outcome === 'tie'
        ? '最高票并列，即将进入加赛投票'
        : summary.outcome === 'runoff_tie'
          ? '加赛仍然平票，本轮无人出局'
          : '无人获得有效票数，本轮无人出局';
  return {
    headline,
    rows: Object.entries(summary.tally).map(([playerId, count]) => ({
      name: nameFor(members, playerId),
      count,
    })),
    abstained: summary.abstained,
  };
}

export function buildWerewolfPresentation(
  view: WerewolfView,
  members: readonly MemberLike[],
): WerewolfPresentationModel {
  const me = view.me;
  const actionGroups = buildActionGroups(view, members);
  const voting = view.phase === 'voting' || view.phase === 'runoff_voting';

  return {
    phase: view.phase,
    phaseLabel: PHASE_LABELS[view.phase],
    mood: PHASE_MOODS[view.phase],
    dayLabel: view.day > 0 ? `第 ${view.day} 天` : '开局准备',
    narrative: narrativeOf(view, members),
    deadlineAt: view.deadlineAt,
    spectator: me === null,
    seats: view.players.map((player) => {
      const member = members.find((m) => m.playerId === player.playerId);
      return {
        playerId: player.playerId,
        name: nameFor(members, player.playerId),
        seatLabel: seatLabelOf(player.seat),
        alive: player.alive,
        statusLabel: statusLabelOf(view, player.playerId),
        isSelf: player.playerId === me?.playerId,
        isSpeaking: player.playerId === view.currentSpeakerId,
        isWolfTeammate: (me?.wolfTeammateIds ?? []).includes(player.playerId),
        idiotRevealed: player.idiotRevealed,
        revealedRoleLabel: player.revealedRole ? WEREWOLF_ROLE_NAMES[player.revealedRole] : null,
        avatar: member?.avatar,
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
            return {
              playerId: id,
              name: nameFor(members, id),
              seatLabel: player ? seatLabelOf(player.seat) : '',
              alive: player ? player.alive : false,
              targetName: targetId ? nameFor(members, targetId) : null,
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
          canWitchSelfSave: Boolean(me.witchCanSelfSave),
          lastGuardTargetName: me.lastGuardTargetId ? nameFor(members, me.lastGuardTargetId) : null,
          pendingShoot: Boolean(me.pendingShoot),
          idiotRevealed: Boolean(me.idiotRevealed),
        }
      : null,
    actionGroups,
    waitingHint: waitingHintOf(view, actionGroups.length > 0),
    voteProgress: voting ? { submitted: view.votesSubmitted, expected: view.votesExpected } : null,
    voteLedger: view.phase === 'vote_result' ? voteLedgerOf(view, members) : null,
    reveal: view.reveal
      ? {
          headline: view.aborted ? '本局已中止' : `${teamLabel(view.winner)}获胜`,
          rows: Object.entries(view.reveal.roles ?? {}).map(([playerId, role]) => ({
            name: nameFor(members, playerId),
            roleLabel: WEREWOLF_ROLE_NAMES[role],
          })),
        }
      : null,
  };
}
