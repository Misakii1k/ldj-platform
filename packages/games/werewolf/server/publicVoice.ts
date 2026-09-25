import { createWerewolfAnnouncement, getVoiceCueDurationMs, type GameEffect, type WerewolfAnnouncement, type WerewolfTimelineState } from '@ldj/shared';

/** Deliberately restricted to public game views: no role, potion or night-target information. */
export interface VoiceView {
  phase: string; day: number; players: readonly { playerId: string; seat: number }[];
  currentSpeakerId: string | null; lastWordsPlayerId: string | null; lastNightDeaths: readonly string[];
  lastVoteSummary: { outcome: string; eliminatedPlayerId: string | null } | null;
  winner: string | null; aborted: boolean;
}
export function publicSceneCues(previous: VoiceView, next: VoiceView): string[] {
  const seat = (id: string) => next.players.find(p => p.playerId === id)?.seat;
  // Both automatic rulesets expose zero-based seats. Never use array indices.
  const numbered = (prefix: string, id: string) => { const n = seat(id); return n === undefined ? [] : [`${prefix}_${n + 1}`]; };
  const entered = previous.phase !== next.phase || previous.day !== next.day;
  if (entered && next.phase === 'game_over') return !next.aborted && next.winner ? [next.winner === 'village' ? 'game_over_good' : 'game_over_wolf'] : [];
  if (entered && next.phase === 'day_announcement') {
    const ids = [...next.lastNightDeaths].sort((a,b) => (seat(a) ?? 0) - (seat(b) ?? 0));
    return ['dawn', ...(ids.length === 0 ? ['day_peaceful'] : ids.length === 1 ? numbered('day_death', ids[0]!) : ['day_death_intro', ...ids.flatMap(id => numbered('day_death_number', id))])];
  }
  if (next.phase === 'discussion' && next.currentSpeakerId && (entered || next.currentSpeakerId !== previous.currentSpeakerId)) return numbered('speak_normal', next.currentSpeakerId);
  if (entered && ['voting','runoff_voting'].includes(next.phase)) return ['vote_start'];
  if (entered && next.phase === 'vote_result') {
    if (next.lastVoteSummary?.outcome === 'runoff_tie') return ['vote_tie_night'];
    if (next.lastVoteSummary?.outcome === 'idiot_saved') return ['idiot_reveal'];
  }
  if (entered && next.phase === 'hunter_shot') return ['hunter_shoot'];
  if (next.phase === 'last_words' && next.lastWordsPlayerId && (entered || next.lastWordsPlayerId !== previous.lastWordsPlayerId)) {
    if (next.lastVoteSummary?.eliminatedPlayerId === next.lastWordsPlayerId) return numbered('exile', next.lastWordsPlayerId);
    return ['day_last_words', ...numbered('speak_normal', next.lastWordsPlayerId)];
  }
  return [];
}

export interface VoiceState { phase: string; day: number; deadlineAt: number | null; timelineState: WerewolfTimelineState | null; announcement?: WerewolfAnnouncement | null }
export function applyPublicSceneVoice<S extends VoiceState>(previous: S, next: S, before: VoiceView, after: VoiceView,
  now: number, effects: readonly GameEffect[], hunterPassed: boolean): { state: S; effects: GameEffect[] } {
  if (previous === next || !next.timelineState) return { state: next, effects: [...effects] };
  const nextTimeline = next.timelineState.current;
  if (next.phase === 'night' && nextTimeline.role === 'witch' && nextTimeline.segment === 'action' && previous.timelineState?.current.id !== nextTimeline.id) {
    return {state: {...next, announcement: createWerewolfAnnouncement('witch:' + nextTimeline.id, ['witch_cure_prompt','witch_poison_prompt'], now)}, effects: [...effects]};
  }
  const cues = [...(hunterPassed ? ['hunter_pass'] : []), ...publicSceneCues(before, after)];
  const changed = (next.phase === 'night' && previous.timelineState?.current.id !== next.timelineState?.current.id) || before.phase !== after.phase || before.day !== after.day || before.currentSpeakerId !== after.currentSpeakerId || before.lastWordsPlayerId !== after.lastWordsPlayerId;
  if (!cues.length && !changed) return { state: next, effects: [...effects] };
  const announcement = createWerewolfAnnouncement(`voice:${next.day}:${next.phase}:${now}:${next.timelineState.revision}:${after.currentSpeakerId ?? after.lastWordsPlayerId ?? ''}`, cues, now);
  const state = { ...next, announcement };
  const duration = cues.reduce((sum,cue) => sum + getVoiceCueDurationMs(cue),0);
  let nextEffects = [...effects];
  if (duration && state.deadlineAt !== null) {
    state.deadlineAt += duration;
    nextEffects = nextEffects.map(effect => effect.type === 'schedule_timer' && effect.deadlineAt === next.deadlineAt ? { ...effect, deadlineAt: state.deadlineAt! } : effect);
  }
  if (state.timelineState && state.phase !== 'night') {
    const current = state.timelineState.current;
    state.timelineState = { ...state.timelineState, current: { ...current, id: `day:${state.day}:${state.phase}:${now}`, period: 'day', role: null,
      segment: state.phase === 'day_announcement' ? 'dawn' : 'day', cue: null,
      label: ({day_announcement:'天亮公告',discussion:'轮流发言',free_discussion:'自由讨论',voting:'放逐投票',runoff_voting:'平票加赛',vote_result:'投票结果',last_words:'遗言',hunter_shot:'猎人开枪',game_over:'对局结束'} as Record<string,string>)[state.phase] ?? '白天环节', startedAt: now,
      endsAt: current.mode === 'auto' ? state.deadlineAt : null, actionDeadlineAt: null } };
  } else if (state.timelineState && duration) {
    // A public hunter-pass message may precede the next night. Shift the entire first step.
    const current = state.timelineState.current;
    state.timelineState = { ...state.timelineState, current: { ...current, startedAt: current.startedAt + duration,
      endsAt: current.endsAt === null ? null : current.endsAt + duration } };
  }
  return { state, effects: nextEffects };
}
