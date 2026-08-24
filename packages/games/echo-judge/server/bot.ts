/**
 * 伪人测试（判官模式）机器人策略（测试用陪练与人机畅玩）。
 *
 * 覆盖的 phase：
 * - judge_setup：判官从 3 张候选题目卡中挑 1 张；非判官可自由选择阵营
 * - answering：当前发言者提交 finish_speaking 推进
 * - judgment：判官多选指认嫌疑人
 * - game_over：null
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { EchoJudgeAction, EchoJudgePlayerView } from './types.ts';

const FALLBACK_QUESTION = '你最喜欢什么样的食物？';

export function pickEchoJudgeBotAction(
  input: BotDecisionInput<EchoJudgePlayerView>,
): EchoJudgeAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me) return null;

  switch (view.phase) {
    case 'judge_setup': {
      if (!me.isJudge) return null;
      if (view.question !== '') return null;

      if (me.pendingTopicChoices && me.pendingTopicChoices.length > 0) {
        const card = me.pendingTopicChoices[random.nextInt(0, me.pendingTopicChoices.length)]!;
        return { type: 'pick_topic_card', playerId, cardId: card.id };
      }
      return { type: 'start_round', playerId, question: FALLBACK_QUESTION };
    }

    case 'answering': {
      if (view.currentSpeakerId === playerId || me.myTurn || me.isCurrentSpeaker) {
        return { type: 'finish_speaking', playerId };
      }
      return null;
    }

    case 'judgment': {
      if (!me.isJudge) return null;
      const targets = view.players.filter((p) => p !== playerId);
      if (targets.length === 0) return null;
      const count = Math.max(1, random.nextInt(1, Math.min(2, targets.length) + 1));
      const shuffled = random.shuffle(targets);
      const selected = shuffled.slice(0, count);
      return { type: 'accuse', playerId, targetPlayerIds: selected };
    }

    case 'game_over':
      return null;
  }
}
