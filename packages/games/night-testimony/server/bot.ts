import type { BotDecisionInput } from '@ldj/shared';
import { CRIMES, type CrimeId, type NightTestimonyAction, type NightTestimonyPlayerView } from './types.ts';

export function pickNightTestimonyBotAction(
  input: BotDecisionInput<NightTestimonyPlayerView>,
): NightTestimonyAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me) return null;

  switch (view.phase) {
    case 'question': {
      // 若当前 bot 已自告身份，不参与问题回答或出题
      if (view.revealedIdentities[playerId]) return null;

      // 1. 待抽选问题卡
      if (view.currentQuestion === null) {
        if (view.currentQuestionerId === playerId && me.pendingCardChoices && me.pendingCardChoices.length > 0) {
          const card = me.pendingCardChoices[random.nextInt(0, me.pendingCardChoices.length)]!;
          return {
            type: 'pick_question_card',
            playerId,
            cardId: card.id,
          };
        }
        return null;
      }

      // 2. 待全员作答
      if (!me.hasAnsweredCurrent) {
        const answer: 'yes' | 'no' = random.nextInt(0, 2) === 0 ? 'yes' : 'no';
        return {
          type: 'answer_question',
          playerId,
          answer,
        };
      }

      return null;
    }

    case 'deduction':
      return null;

    case 'vote': {
      if (me.hasVoted) return null;
      // 排除已自告身份的已确认罪犯
      const candidates = view.players.filter((p) => p !== playerId && view.revealedIdentities[p] === undefined);
      const targetPool = candidates.length > 0 ? candidates : view.players.filter((p) => p !== playerId);
      if (targetPool.length === 0) return null;
      const target = targetPool[random.nextInt(0, targetPool.length)]!;
      return {
        type: 'cast_vote',
        playerId,
        targetPlayerId: target,
      };
    }

    case 'game_over': {
      if (view.guessingInProgress && me.isWarden) {
        const inmates = view.players.filter((p) => p !== playerId);
        const crimePool = view.availableGuessCrimes && view.availableGuessCrimes.length > 0
          ? [...view.availableGuessCrimes]
          : [...CRIMES];
        const shuffled = random.shuffle(crimePool);
        const guesses: Record<string, CrimeId> = {};
        inmates.forEach((inmateId, index) => {
          guesses[inmateId] = (shuffled[index] ?? CRIMES[0]) as CrimeId;
        });
        return {
          type: 'submit_guesses',
          playerId,
          guesses,
        };
      }
      return null;
    }
  }
}
