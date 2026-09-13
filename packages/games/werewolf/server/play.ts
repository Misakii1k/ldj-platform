/**
 * 狼人杀陪练启发式与发言套话。
 * 不依赖冻结的 legacy bot.ts；v2 模块与平台 BotRunner 共用。
 * 只读玩家视角，产出仍须过 parseAction + reduce。
 */
import type { BotChatLine, BotDecisionInput, BotPromptContext, RandomSource } from '@ldj/shared';

export type WerewolfPlayRole = 'wolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';

export interface WerewolfPlayPlayer {
  playerId: string;
  alive: boolean;
  seat: number;
  idiotRevealed?: boolean;
}

export interface WerewolfPlaySeerResult {
  playerId: string;
  team: 'wolves' | 'village';
}

export interface WerewolfPlayMe {
  role: WerewolfPlayRole;
  alive: boolean;
  forfeited: boolean;
  confirmedRole?: boolean;
  confirmedAnnouncement?: boolean;
  hasVoted?: boolean;
  lastWordsPending?: boolean;
  idiotRevealed?: boolean;
  wolfTeammateIds?: readonly string[];
  hasNightVoted?: boolean;
  seerResults?: readonly WerewolfPlaySeerResult[];
  seerCheckedThisNight?: boolean;
  nightVictimId?: string | null;
  witchSaveUsed?: boolean;
  witchPoisonUsed?: boolean;
  witchSaveDecision?: boolean | null;
  witchPoisonDecided?: boolean;
  witchCanSelfSave?: boolean;
  guardDecided?: boolean;
  lastGuardTargetId?: string | null;
  pendingShoot?: boolean;
}

export interface WerewolfPlayView {
  phase: string;
  day: number;
  currentSpeakerId?: string | null;
  lastWordsPlayerId?: string | null;
  runoffCandidates?: readonly string[];
  lastNightDeaths?: readonly string[];
  freeDiscussionReadyPlayerIds?: readonly string[];
  players: readonly WerewolfPlayPlayer[];
  config?: {
    wolfKillScope?: 'any' | 'non_wolf';
  };
  me: WerewolfPlayMe | null;
}

export type WerewolfPlayAction =
  | { type: 'confirm_role' }
  | { type: 'night_kill'; targetPlayerId: string }
  | { type: 'seer_check'; targetPlayerId: string }
  | { type: 'witch_save'; save: boolean }
  | { type: 'witch_poison'; targetPlayerId: string | null }
  | { type: 'guard_guard'; targetPlayerId: string | null }
  | { type: 'hunter_shoot'; targetPlayerId: string | null }
  | { type: 'confirm_announcement' }
  | { type: 'finish_speech' }
  | { type: 'ready_vote' }
  | { type: 'day_vote'; targetPlayerId: string | null }
  | { type: 'finish_last_words' };

export function asWerewolfPlayView(view: unknown): WerewolfPlayView | null {
  if (typeof view !== 'object' || view === null) return null;
  const record = view as Record<string, unknown>;
  if (typeof record.phase !== 'string' || !Array.isArray(record.players)) return null;
  return view as WerewolfPlayView;
}

function choose(ids: readonly string[], random: RandomSource): string | null {
  return ids.length === 0 ? null : ids[random.nextInt(0, ids.length)]!;
}

function seatOf(view: WerewolfPlayView, playerId: string): number | null {
  const seat = view.players.find((player) => player.playerId === playerId)?.seat;
  return typeof seat === 'number' ? seat : null;
}

export function seatLabel(view: WerewolfPlayView, playerId: string): string {
  const seat = seatOf(view, playerId);
  return seat === null ? '未知玩家' : `${seat + 1} 号`;
}

function aliveOthers(view: WerewolfPlayView, playerId: string): WerewolfPlayPlayer[] {
  return view.players.filter((player) => player.alive && player.playerId !== playerId);
}

function wolfKillTargets(view: WerewolfPlayView, playerId: string, me: WerewolfPlayMe): string[] {
  const teammates = new Set(me.wolfTeammateIds ?? []);
  if (view.config?.wolfKillScope === 'any') {
    return view.players
      .filter((player) => player.alive && player.playerId !== playerId && !teammates.has(player.playerId))
      .map((player) => player.playerId);
  }
  return aliveOthers(view, playerId)
    .filter((player) => !teammates.has(player.playerId))
    .map((player) => player.playerId);
}

function voteCandidates(view: WerewolfPlayView, playerId: string, me: WerewolfPlayMe): string[] {
  const runoff = view.phase === 'runoff_voting';
  const runoffSet = new Set(view.runoffCandidates ?? []);
  const teammates = new Set(me.role === 'wolf' ? (me.wolfTeammateIds ?? []) : []);
  return aliveOthers(view, playerId)
    .filter((player) => !player.idiotRevealed)
    .filter((player) => !runoff || runoffSet.has(player.playerId))
    .filter((player) => !teammates.has(player.playerId))
    .map((player) => player.playerId);
}

function mentionedPlayerIds(view: WerewolfPlayView, chat: readonly BotChatLine[]): string[] {
  const counts = new Map<string, number>();
  for (const line of chat) {
    if (!line.text) continue;
    for (const player of view.players) {
      const label = `${player.seat + 1} 号`;
      if (line.text.includes(label) || (line.fromPlayerId !== null && line.text.includes(player.playerId))) {
        counts.set(player.playerId, (counts.get(player.playerId) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([playerId]) => playerId);
}

function pickVote(view: WerewolfPlayView, playerId: string, me: WerewolfPlayMe, input: BotDecisionInput<unknown>): string | null {
  const candidates = voteCandidates(view, playerId, me);
  if (candidates.length === 0) return null;
  const candidateSet = new Set(candidates);

  if (me.role === 'seer') {
    const wolf = (me.seerResults ?? []).find((result) => result.team === 'wolves' && candidateSet.has(result.playerId));
    if (wolf) return wolf.playerId;
  }

  const mentioned = mentionedPlayerIds(view, input.recentChat ?? []).find((id) => candidateSet.has(id) && id !== playerId);
  if (mentioned) return mentioned;
  return choose(candidates, input.random);
}

export function pickWerewolfPlayAction(input: BotDecisionInput<unknown>): WerewolfPlayAction | null {
  const view = asWerewolfPlayView(input.view);
  if (!view) return null;
  const me = view.me;
  const { playerId, random } = input;
  if (!me || me.forfeited || view.phase === 'game_over') return null;

  switch (view.phase) {
    case 'role_reveal':
      return me.confirmedRole ? null : { type: 'confirm_role' };

    case 'night': {
      if (!me.alive) return null;
      if (me.role === 'wolf') {
        if (me.hasNightVoted) return null;
        const target = choose(wolfKillTargets(view, playerId, me), random)
          ?? choose(aliveOthers(view, playerId).map((player) => player.playerId), random);
        return target ? { type: 'night_kill', targetPlayerId: target } : null;
      }
      if (me.role === 'seer') {
        if (me.seerCheckedThisNight) return null;
        const checked = new Set((me.seerResults ?? []).map((result) => result.playerId));
        const fresh = aliveOthers(view, playerId).filter((player) => !checked.has(player.playerId)).map((player) => player.playerId);
        const target = choose(fresh, random) ?? choose(aliveOthers(view, playerId).map((player) => player.playerId), random);
        return target ? { type: 'seer_check', targetPlayerId: target } : null;
      }
      if (me.role === 'witch') {
        if (me.witchSaveDecision === null) {
          if (me.nightVictimId === null || me.nightVictimId === undefined) return null;
          const victimIsSelf = me.nightVictimId === playerId;
          const canSave = !me.witchSaveUsed && (!victimIsSelf || Boolean(me.witchCanSelfSave));
          const shouldSave = canSave && (view.day <= 1 || victimIsSelf);
          return { type: 'witch_save', save: shouldSave };
        }
        if (!me.witchPoisonDecided) return { type: 'witch_poison', targetPlayerId: null };
      }
      if (me.role === 'guard') {
        if (me.guardDecided) return null;
        const blocked = me.lastGuardTargetId;
        const candidates = (view.config?.wolfKillScope === 'any' ? view.players.filter((p) => p.alive) : aliveOthers(view, playerId))
          .filter((player) => player.playerId !== blocked)
          .map((player) => player.playerId);
        return { type: 'guard_guard', targetPlayerId: choose(candidates, random) };
      }
      return null;
    }

    case 'hunter_shot':
      return me.pendingShoot
        ? { type: 'hunter_shoot', targetPlayerId: choose(aliveOthers(view, playerId).map((player) => player.playerId), random) }
        : null;

    case 'day_announcement':
      return me.alive && !me.confirmedAnnouncement ? { type: 'confirm_announcement' } : null;

    case 'discussion':
      return view.currentSpeakerId === playerId ? { type: 'finish_speech' } : null;

    case 'free_discussion':
      return me.alive && !(view.freeDiscussionReadyPlayerIds ?? []).includes(playerId) ? { type: 'ready_vote' } : null;

    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.idiotRevealed || me.hasVoted) return null;
      if (view.phase === 'runoff_voting' && (view.runoffCandidates ?? []).includes(playerId)) return null;
      return { type: 'day_vote', targetPlayerId: pickVote(view, playerId, me, input) };
    }

    case 'last_words':
      return me.lastWordsPending ? { type: 'finish_last_words' } : null;

    default:
      return null;
  }
}

export function cannedWerewolfSpeech(view: WerewolfPlayView, _playerId: string): string {
  const me = view.me;
  if (!me) return '先听大家把话说完。';
  const deaths = (view.lastNightDeaths ?? []).map((id) => seatLabel(view, id)).join('、');
  if (view.phase === 'last_words') {
    return me.role === 'wolf' ? '我不是狼，你们投错人了。' : '听预言家的，别被带偏。';
  }
  if (me.role === 'wolf') return '我是村民，先听身份再投票。';
  if (me.role === 'seer') {
    const wolf = (me.seerResults ?? []).find((result) => result.team === 'wolves');
    if (wolf) return `${seatLabel(view, wolf.playerId)} 我查过了，先重点看他。`;
    return '我先听发言，再对一下夜间信息。';
  }
  if (me.role === 'witch') {
    return deaths ? `昨夜出局是${deaths}，先对一下谁在带节奏。` : '昨夜平安，先听身份再投票。';
  }
  if (me.role === 'guard') return '先听发言，别急着站边。';
  if (me.role === 'hunter') return '先把票型理清楚，别乱冲。';
  return deaths ? `昨夜出局是${deaths}，先听完再投票。` : '先听身份再投票。';
}

export const WEREWOLF_SPEECH_INSTRUCTION =
  '用 1 到 2 句口语化的中文发言或留遗言，像线下聚会随口说话：可以带语气词、可以有半句话，接前面人的话茬；不要复述别人说过的内容，也不要直接说出自己的身份、查验结果或队友名单。座位号从 1 开始。';

/**
 * 狼人共享装饰层：只负责注入近期公屏与阶段化 speech 声明。
 * 身份/天数帧由各 builder 自己的 situation 头部提供，这里不重复叠，BotRunner 只调用一次。
 */
export function overlayWerewolfBotPrompt<A>(
  input: BotDecisionInput<unknown>,
  prompt: BotPromptContext<A> | null,
): BotPromptContext<A> | null {
  if (!prompt) return null;
  const view = asWerewolfPlayView(input.view);
  if (!view || !view.me) return prompt;

  const chat = (input.recentChat ?? [])
    .slice(-12)
    .map((line) => {
      const who = line.fromPlayerId ? seatLabel(view, line.fromPlayerId) : '系统';
      return `${who}：${line.text}`;
    })
    .join('\n');

  const extras: string[] = [];
  if (chat) extras.push(`近期公屏：\n${chat}`);
  else extras.push('近期公屏还没有玩家发言。');

  const needsSpeech = view.phase === 'discussion' || view.phase === 'last_words';
  return {
    ...prompt,
    situation: `${prompt.situation}\n${extras.join('\n')}`,
    ...(needsSpeech
      ? { speech: { maxChars: 300, instruction: WEREWOLF_SPEECH_INSTRUCTION } }
      : {}),
  };
}
