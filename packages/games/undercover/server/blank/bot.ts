/**
 * undercover_blank_v1 — 规则机器人（只读玩家视角，纯函数）。
 * 冻结策略（digitalBoundaries）：
 * - ruleBotActiveGuessPolicy: never_submit —— 从不主动猜词；
 * - ruleBotFinalGuessPolicy: skip —— 跳过终局猜词；
 * - ruleBotReceivesStandardAnswer: false —— 白板视角 word 为 null，机器人拿不到标准答案。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { BlankAction, BlankPlayerView } from './types.ts';

export function pickBlankBotAction(input: BotDecisionInput<BlankPlayerView>): BlankAction | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || view.phase === 'game_over') return null;

  switch (view.phase) {
    case 'word_reveal':
      if (!me.confirmed) return { type: 'confirm_word' };
      return null;
    case 'speaking':
      if (view.currentSpeakerId === playerId) return { type: 'finish_speech' };
      return null;
    case 'voting':
    case 'runoff_voting': {
      if (me.hasVoted) return null;
      const alive = view.players.filter((p) => p.alive && p.playerId !== playerId);
      const eligible = view.phase === 'runoff_voting'
        ? alive.filter((p) => view.runoffCandidates.includes(p.playerId))
        : alive;
      if (eligible.length === 0) return null;
      const pick = eligible[input.random.nextInt(0, eligible.length)]!;
      return { type: 'cast_vote', targetPlayerId: pick.playerId };
    }
    case 'final_guess':
      // never_submit + skip：白板机器人在终局猜词阶段直接跳过，不猜词。
      if (me.canSubmitFinalGuess) return { type: 'skip_final_guess' };
      return null;
    default:
      return null;
  }
}
