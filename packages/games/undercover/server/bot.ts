/**
 * 谁是卧底的机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。刻意不做推理：机器人随机投票，
 * 目的是把流程跑完（看词 → 发言 → 投票 → 加赛 → 结算），不是赢。
 * 任何"此刻不该我动"的情形都返回 null，让状态机自己推进或卡住。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { UndercoverAction } from './state.ts';
import type { UndercoverPlayerView } from './views.ts';

/** 可投的目标：存活、不是自己；加赛时还必须在候选名单内 */
function votableTargets(view: UndercoverPlayerView, playerId: string): string[] {
  const runoff = view.phase === 'runoff_voting';
  return view.players
    .filter((p) => p.alive && p.playerId !== playerId)
    .filter((p) => !runoff || view.runoffCandidates.includes(p.playerId))
    .map((p) => p.playerId);
}

export function pickUndercoverBotAction(
  input: BotDecisionInput<UndercoverPlayerView>,
): UndercoverAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局或已被淘汰：淘汰者不再有任何合法动作
  if (!me || !me.alive) return null;

  switch (view.phase) {
    case 'word_reveal':
      // 已确认过就别再投：reduce 视重复确认为幂等，但重复投递会白占一次房间队列
      return me.confirmed ? null : { type: 'confirm_word' };

    case 'speaking':
      // 机器人不发言（聊天是真人的事），轮到自己就直接过
      return view.currentSpeakerId === playerId ? { type: 'finish_speech' } : null;

    case 'voting':
    case 'runoff_voting': {
      if (me.hasVoted) return null; // 选票锁定，重复投递必被拒
      const targets = votableTargets(view, playerId);
      if (targets.length === 0) return null; // 无合法目标：弃票，交给计时器结算
      return { type: 'cast_vote', targetPlayerId: targets[random.nextInt(0, targets.length)]! };
    }

    // 结果展示与终局由计时器推进，机器人无事可做
    case 'vote_result':
    case 'game_over':
      return null;
  }
}
