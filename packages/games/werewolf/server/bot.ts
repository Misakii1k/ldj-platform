import type { BotDecisionInput } from '@ldj/shared';
import type { WerewolfAction, WerewolfPlayerView } from './module.ts';

function choose(ids: readonly string[], input: BotDecisionInput<unknown>): string | null {
  return ids.length === 0 ? null : ids[input.random.nextInt(0, ids.length)]!;
}

function aliveOthers(view: WerewolfPlayerView, playerId: string): string[] {
  return view.players.filter((player) => player.alive && player.playerId !== playerId).map((player) => player.playerId);
}

/** 夜刀候选与 reducer 合法性保持一致：开放夜刀允许自己与同伴 */
function wolfKillCandidates(view: WerewolfPlayerView, playerId: string): string[] {
  const me = view.me;
  if (view.config.wolfKillScope === 'any') {
    return view.players.filter((player) => player.alive).map((player) => player.playerId);
  }
  return aliveOthers(view, playerId).filter((id) => !(me?.wolfTeammateIds ?? []).includes(id));
}

export function pickWerewolfBotAction(
  input: BotDecisionInput<WerewolfPlayerView>,
): WerewolfAction | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || me.forfeited || view.phase === 'game_over') return null;

  switch (view.phase) {
    case 'role_reveal':
      return me.confirmedRole ? null : { type: 'confirm_role' };

    case 'night': {
      if (!me.alive) return null;
      if (me.role === 'wolf') {
        if (me.hasNightVoted) return null;
        const target = choose(wolfKillCandidates(view, playerId), input);
        return target ? { type: 'night_kill', targetPlayerId: target } : null;
      }
      if (me.role === 'seer') {
        if (me.seerCheckedThisNight) return null;
        const target = choose(aliveOthers(view, playerId), input);
        return target ? { type: 'seer_check', targetPlayerId: target } : null;
      }
      if (me.role === 'witch') {
        if (me.nightVictimId === null) return null;
        if (me.witchSaveDecision === null) return { type: 'witch_save', save: false };
        if (!me.witchPoisonDecided) return { type: 'witch_poison', targetPlayerId: null };
      }
      if (me.role === 'guard') {
        if (me.guardDecided) return null;
        const target = choose(
          aliveOthers(view, playerId).filter((id) => id !== me.lastGuardTargetId),
          input,
        );
        return { type: 'guard_guard', targetPlayerId: target };
      }
      return null;
    }

    case 'hunter_shot':
      if (me.pendingShoot) {
        const target = choose(aliveOthers(view, playerId), input);
        return { type: 'hunter_shoot', targetPlayerId: target };
      }
      return null;

    case 'day_announcement':
      return me.alive && !me.confirmedAnnouncement ? { type: 'confirm_announcement' } : null;

    case 'discussion':
      return view.currentSpeakerId === playerId ? { type: 'finish_speech' } : null;

    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.idiotRevealed || me.hasVoted) return null;
      const target = choose(
        aliveOthers(view, playerId).filter((id) => {
          const candidate = view.players.find((player) => player.playerId === id);
          return !candidate?.idiotRevealed && (
            view.phase !== 'runoff_voting' || view.runoffCandidates.includes(id)
          );
        }),
        input,
      );
      return { type: 'day_vote', targetPlayerId: target };
    }

    case 'last_words':
      return me.lastWordsPending ? { type: 'finish_last_words' } : null;

    case 'vote_result':
      return null;
  }
}
