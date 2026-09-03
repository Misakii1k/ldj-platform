/**
 * 狼人杀客户端表现层映射：把服务端权威视角翻译成纯展示数据。
 * 只消费 parseWerewolfView 的结果，不读取权威快照，不合成新动作，不重算票数。
 * 目标合法性与服务端 reducer 保持一致；服务端仍是唯一裁判。
 */
import type {
  WerewolfConfigView,
  WerewolfExitReason,
  WerewolfPhase,
  WerewolfRole,
  WerewolfTeam,
  WerewolfView,
  WerewolfVoteOutcome,
} from './types.ts';
import type { ChatMessageView } from '@ldj/shared';
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
  /** 点击该席位头像后可执行的动作（如投票放逐/查验/毒杀），由 actionGroups 派生。 */
  readonly targetActions: readonly WerewolfActionOption[];
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
    skill: '夜晚与同伴商议，刀死一名玩家。白天隐藏身份，引导放逐好人。',
    win: '屠边或屠城成功：消灭所有神职，或消灭所有村民。',
  },
  seer: {
    skill: '每晚查验一名存活玩家，得知对方属于狼人还是好人。',
    win: '好人获胜：放逐全部狼人。',
  },
  witch: {
    skill: '解药救当晚刀口，毒药毒死一名玩家。各用一次，同一晚通常不能又救又毒。',
    win: '好人获胜：放逐全部狼人。',
  },
  guard: {
    skill: '每晚守护一名玩家，使其免疫当晚刀杀。不能连续两晚守同一人。',
    win: '好人获胜：放逐全部狼人。',
  },
  hunter: {
    skill: '在被投票出局或被狼人夜刀出局时，可以开枪带走场上一名存活玩家（被毒杀除外）。',
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
  readonly voteProgress: { readonly submitted: number; readonly expected: number } | null;
  readonly voteLedger: {
    readonly headline: string;
    readonly outcome?: WerewolfVoteOutcome;
    readonly rows: readonly { readonly name: string; readonly count: number }[];
    readonly abstained: number;
    /** 被放逐者的席位号（用于法官语音播报）；翻牌免死/平票时为 null。 */
    readonly exiledSeat: number | null;
  } | null;
  /** 昨夜死亡者的席位号列表（天亮公告语音播报用）。 */
  readonly nightDeathSeats: readonly number[];
  readonly winner: WerewolfTeam | null;
  readonly reveal: {
    readonly headline: string;
    readonly rows: readonly { readonly name: string; readonly roleLabel: string }[];
  } | null;
  /** 当前发言者最近一条公屏，遗言阶段同样适用 */
  readonly speakerLine: string | null;
  /** 房间扩展角色池配置 */
  readonly rolesConfig: { readonly guard: boolean; readonly hunter: boolean; readonly idiot: boolean };
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

function waitingHintOf(view: WerewolfView, canAct: boolean): string | null {
  if (view.phase === 'game_over') return null;
  if (canAct) return null;
  const me = view.me;
  if (!me) return '你当前处于观战状态。';
  if (!me.alive) return '你已出局，请保持安静。';
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

function buildActionGroups(view: WerewolfView, members: readonly MemberLike[]): readonly WerewolfActionGroup[] {
  const me = view.me;
  if (!me || me.forfeited) return [];
  const groups: WerewolfActionGroup[] = [];

  if (view.phase === 'role_reveal' && me.alive) {
    groups.push({
      id: 'confirm_role',
      title: '身份确认',
      hint: me.confirmedRole ? '你已确认身份，等待其他人完成' : '请确认已知晓你的身份',
      options: me.confirmedRole ? [] : [{ id: 'confirm', label: '我已记住身份', payload: { type: 'confirm_role' } }],
    });
    return groups;
  }

  if (view.phase === 'night' && me.alive) {
    if (me.role === 'wolf') {
      const candidates = view.config.wolfKillScope === 'any'
        ? view.players.filter((player) => player.alive)
        : aliveOthers(view).filter((player) => !me.wolfTeammateIds.includes(player.playerId));
      const hint = me.hasNightVoted
        ? '你已选择目标，可随时修改，直到夜晚结算'
        : (view.config.wolfKillScope === 'any' ? '请选择今晚要袭击的玩家（可选择自己或同伴）' : '请选择今晚要袭击的玩家');
      groups.push({
        id: 'night_kill',
        title: '狼人夜刀',
        hint,
        options: targetOptions(members, candidates, '袭击', (targetPlayerId) => ({ type: 'night_kill', targetPlayerId })),
      });
    }

    if (me.role === 'seer') {
      const candidates = aliveOthers(view).filter((player) => !me.seerResults.some((res) => res.playerId === player.playerId));
      groups.push({
        id: 'seer_check',
        title: '预言家查验',
        hint: me.seerCheckedThisNight ? '今晚查验已完成' : '请选择一名存活玩家查验阵营',
        options: me.seerCheckedThisNight ? [] : targetOptions(members, candidates, '查验', (targetPlayerId) => ({ type: 'seer_check', targetPlayerId })),
      });
    }

    if (me.role === 'witch') {
      const victim = me.nightVictimId ? view.players.find((player) => player.playerId === me.nightVictimId) : null;
      const canSelfSave = me.nightVictimId !== me.playerId || me.witchCanSelfSave;
      const saveOptions: WerewolfActionOption[] = [];
      if (!me.witchSaveUsed && victim && me.witchSaveDecision === null) {
        if (canSelfSave) saveOptions.push({ id: 'save_yes', label: `使用解药救 ${seatLabelOf(victim.seat)} ${nameFor(members, victim.playerId)}`, payload: { type: 'witch_save', save: true } });
        saveOptions.push({ id: 'skip_save', label: '不使用解药', payload: { type: 'witch_save', save: false } });
      }

      if (saveOptions.length > 0) {
        groups.push({
          id: 'witch_save',
          title: '女巫用药 · 解药',
          hint: victim ? `今夜遇袭的是 ${nameFor(members, victim.playerId)}` : '今夜无人遇袭',
          options: saveOptions,
        });
      }

      if (me.witchSaveDecision !== null && !me.witchPoisonUsed && !me.witchPoisonDecided) {
        const poisonCandidates = aliveOthers(view);
        const options: WerewolfActionOption[] = me.witchSaveDecision === true ? [] : targetOptions(members, poisonCandidates, '毒杀', (targetPlayerId) => ({ type: 'witch_poison', targetPlayerId }));
        options.push({ id: 'poison_skip', label: '今晚不用毒药', payload: { type: 'witch_poison', targetPlayerId: null } });
        groups.push({
          id: 'witch_poison',
          title: '女巫用药 · 毒药',
          hint: me.witchSaveDecision === true ? '已使用解药，今夜无法再用毒药' : '请选择要毒杀的目标，或选择跳过',
          options,
        });
      }
    }

    if (me.role === 'guard') {
      const candidates = aliveOthers(view).filter((player) => player.playerId !== me.lastGuardTargetId);
      const options: WerewolfActionOption[] = me.guardDecided ? [] : targetOptions(members, candidates, '守护', (targetPlayerId) => ({ type: 'guard_guard', targetPlayerId }));
      if (!me.guardDecided) options.push({ id: 'skip_guard', label: '今晚空守（不守护任何人）', payload: { type: 'guard_guard', targetPlayerId: null } });
      groups.push({
        id: 'guard_guard',
        title: '守卫守护',
        hint: me.guardDecided ? '今夜守护已决断' : me.lastGuardTargetId ? `昨夜守护了 ${nameFor(members, me.lastGuardTargetId)}，今夜不可连守` : '请选择今晚要守护的玩家',
        options,
      });
    }

    return groups;
  }

  if (view.phase === 'hunter_shot' && me.pendingShoot) {
    const candidates = aliveOthers(view);
    const options: WerewolfActionOption[] = targetOptions(members, candidates, '开枪带走', (targetPlayerId) => ({ type: 'hunter_shoot', targetPlayerId }));
    options.push({ id: 'shoot_skip', label: '放弃开枪', payload: { type: 'hunter_shoot', targetPlayerId: null } });
    groups.push({ id: 'hunter_shoot', title: '猎人开枪', hint: '请选择一名存活玩家开枪带走，或放弃', options });
    return groups;
  }

  if (view.phase === 'day_announcement' && me) {
    groups.push({
      id: 'confirm_announcement',
      title: '死讯确认',
      hint: me.confirmedAnnouncement ? '你已确认死讯，等待其他人完成' : '请确认已知晓昨夜结果',
      options: me.confirmedAnnouncement ? [] : [{ id: 'confirm_day', label: '已知晓死讯', payload: { type: 'confirm_announcement' } }],
    });
    return groups;
  }

  if (view.phase === 'discussion' && me.alive && view.currentSpeakerId === me.playerId) {
    groups.push({ id: 'finish_speech', title: '轮到你发言', hint: '公屏打字发言后，点击结束发言交麦给下一位', options: [{ id: 'finish_speech', label: '结束发言', payload: { type: 'finish_speech' } }] });
    return groups;
  }

  if ((view.phase === 'voting' || view.phase === 'runoff_voting') && me.alive && !me.idiotRevealed) {
    const isRunoff = view.phase === 'runoff_voting';
    const candidates = isRunoff
      ? view.players.filter((p) => p.alive && view.runoffCandidates.includes(p.playerId) && p.playerId !== me.playerId && !p.idiotRevealed)
      : aliveOthers(view).filter((p) => !p.idiotRevealed);
    const options: WerewolfActionOption[] = me.hasVoted ? [] : targetOptions(members, candidates, '投票放逐', (targetPlayerId) => ({ type: 'day_vote', targetPlayerId }));
    if (!me.hasVoted) options.push({ id: 'abstain', label: '弃票', payload: { type: 'day_vote', targetPlayerId: null } });
    groups.push({
      id: 'day_vote',
      title: isRunoff ? '加赛放逐投票' : '放逐投票',
      hint: me.hasVoted ? '你已完成投票，等待全场结果' : isRunoff ? '加赛只能投给平票候选人' : '请选择你要放逐的玩家',
      options,
    });
    return groups;
  }

  if (view.phase === 'last_words' && view.lastWordsPlayerId === me.playerId) {
    groups.push({ id: 'finish_last_words', title: '发表遗言', hint: '发表完毕后，点击完成遗言进入下一阶段', options: [{ id: 'finish_lw', label: '完成遗言', payload: { type: 'finish_last_words' } }] });
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
    headline = '平票，进入加赛发言与投票';
  } else if (summary.outcome === 'runoff_tie') {
    headline = '加赛再次平票，今日无人出局';
  } else if (summary.outcome === 'no_votes') {
    headline = '全员弃票，今日无人出局';
  }

  return {
    headline,
    outcome: summary.outcome,
    rows: Object.entries(summary.tally).map(([targetId, count]) => ({
      name: nameFor(members, targetId),
      count,
    })),
    abstained: summary.abstained,
    exiledSeat,
  };
}

export function latestSpeakerLine(
  speakerId: string | null,
  chat: readonly ChatMessageView[],
): string | null {
  if (!speakerId) return null;
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = chat[index];
    if (message && message.kind === 'player' && message.fromPlayerId === speakerId && message.text.trim()) {
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
    if (canSelfSave) {
      const list = map.get(me.nightVictimId) ?? [];
      list.push({ id: 'save_on_chip', label: '使用解药救他', payload: { type: 'witch_save', save: true } });
      map.set(me.nightVictimId, list);
    }
  }
  return Object.fromEntries(map);
}

export function buildWerewolfPresentation(
  view: WerewolfView,
  members: readonly MemberLike[],
  chat: readonly ChatMessageView[] = [],
): WerewolfPresentationModel {
  const me = view.me;
  const actionGroups = buildActionGroups(view, members);
  const voting = view.phase === 'voting' || view.phase === 'runoff_voting';
  const speakerId = view.phase === 'last_words' ? view.lastWordsPlayerId : view.currentSpeakerId;
  const targetActions = targetActionsByPlayer(view, members);

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
      return {
        playerId: player.playerId,
        name: nameFor(members, player.playerId),
        seatLabel: seatLabelOf(player.seat),
        alive: player.alive,
        statusLabel: statusLabelOf(view, player.playerId),
        isSelf: player.playerId === me?.playerId,
        isSpeaking:
          player.playerId === view.currentSpeakerId
          || (view.phase === 'last_words' && player.playerId === view.lastWordsPlayerId),
        isWolfTeammate: (me?.wolfTeammateIds ?? []).includes(player.playerId),
        idiotRevealed: player.idiotRevealed,
        revealedRoleLabel: player.revealedRole ? WEREWOLF_ROLE_NAMES[player.revealedRole] : null,
        avatar: member?.avatar,
        targetActions: targetActions[player.playerId] ?? [],
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
          nightVictimSeat: me.nightVictimId
            ? view.players.find((player) => player.playerId === me.nightVictimId)?.seat ?? null
            : null,
          canWitchSelfSave: Boolean(me.witchCanSelfSave),
          lastGuardTargetName: me.lastGuardTargetId ? nameFor(members, me.lastGuardTargetId) : null,
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
    voteProgress: voting ? { submitted: view.votesSubmitted, expected: view.votesExpected } : null,
    voteLedger: view.phase === 'vote_result' ? voteLedgerOf(view, members) : null,
    nightDeathSeats: view.lastNightDeaths
      .map((id) => view.players.find((player) => player.playerId === id)?.seat)
      .filter((seat): seat is number => typeof seat === 'number'),
    winner: view.winner ?? null,
    speakerLine: latestSpeakerLine(speakerId, chat),
    reveal: view.reveal
      ? {
          headline: view.aborted ? '本局已中止' : `${teamLabel(view.winner)}获胜`,
          rows: Object.entries(view.reveal.roles ?? {}).map(([playerId, role]) => ({
            name: nameFor(members, playerId),
            roleLabel: WEREWOLF_ROLE_NAMES[role],
          })),
        }
      : null,
    rolesConfig: view.config?.roles ?? { guard: false, hunter: false, idiot: false },
  };
}
