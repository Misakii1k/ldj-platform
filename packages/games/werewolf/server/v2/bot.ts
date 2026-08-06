/**
 * werewolf_platform_open_kill_v1 — 规则机器人（测试陪练）。
 * 只读玩家视角纯函数；开放夜刀口径：狼人约一半概率自刀尝试。
 */
import type { BotDecisionInput, RandomSource } from '@ldj/shared';
import type { V2Action, V2PlayerView } from './types.ts';

const choose = (ids: readonly string[], random: RandomSource): string | null => (ids.length === 0 ? null : ids[random.nextInt(0, ids.length)]!);
const aliveOthers = (view: V2PlayerView, playerId: string): string[] => view.players.filter((p) => p.alive && p.playerId !== playerId).map((p) => p.playerId);

export function pickV2BotAction(input: BotDecisionInput<V2PlayerView>): V2Action | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me || me.forfeited || view.phase === 'game_over') return null;
  switch (view.phase) {
    case 'role_reveal':
      return me.confirmedRole ? null : { type: 'confirm_role' };
    case 'night': {
      if (!me.alive) return null;
      if (me.role === 'wolf') {
        if (me.hasNightVoted) return null;
        if (random.nextInt(0, 2) === 1) return { type: 'night_kill', targetPlayerId: playerId };
        const t = choose(aliveOthers(view, playerId), random);
        return t ? { type: 'night_kill', targetPlayerId: t } : null;
      }
      if (me.role === 'seer') {
        if (me.seerCheckedThisNight) return null;
        const t = choose(aliveOthers(view, playerId), random);
        return t ? { type: 'seer_check', targetPlayerId: t } : null;
      }
      if (me.role === 'witch') {
        if (me.nightVictimId === null) return null;
        if (me.witchSaveDecision === null) return { type: 'witch_save', save: false };
        if (!me.witchPoisonDecided) return { type: 'witch_poison', targetPlayerId: null };
      }
      if (me.role === 'guard') {
        if (me.guardDecided) return null;
        return { type: 'guard_guard', targetPlayerId: choose(aliveOthers(view, playerId).filter((id) => id !== me.lastGuardTargetId), random) };
      }
      return null;
    }
    case 'hunter_shot':
      return me.pendingShoot ? { type: 'hunter_shoot', targetPlayerId: choose(aliveOthers(view, playerId), random) } : null;
    case 'day_announcement':
      return me.alive && !me.confirmedAnnouncement ? { type: 'confirm_announcement' } : null;
    case 'discussion':
      return view.currentSpeakerId === playerId ? { type: 'finish_speech' } : null;
    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.idiotRevealed || me.hasVoted) return null;
      return {
        type: 'day_vote',
        targetPlayerId: choose(
          aliveOthers(view, playerId).filter((id) => {
            const p = view.players.find((x) => x.playerId === id);
            return !p?.idiotRevealed && (view.phase !== 'runoff_voting' || view.runoffCandidates.includes(id));
          }),
          random,
        ),
      };
    }
    case 'last_words':
      return me.lastWordsPending ? { type: 'finish_last_words' } : null;
    default:
      return null;
  }
}
