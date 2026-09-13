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

/**
 * 谁是卧底的拟真公屏发言兜底。
 *
 * 当大模型超时、不可用或异常时，基于当前轮次、席位、发言次序与加赛状态，
 * 从多维度情境化语料池中分散挑选短句，彻底杜绝所有机器人机械重复“先听大家发言”。
 */
export function cannedUndercoverSpeech(view: UndercoverPlayerView, playerId: string): string {
  const player = view.players.find((p) => p.playerId === playerId);
  const seat = player ? player.seat : 0;
  const orderIndex = view.speakingOrder.indexOf(playerId);
  const isFirst = orderIndex === 0;
  const round = view.round;
  const isRunoff = view.phase === 'runoff_voting' || (view.runoffCandidates && view.runoffCandidates.includes(playerId));

  if (isRunoff) {
    const runoffPool = [
      '我绝对是平民，我的描述完全合情合理，大家别投偏了！',
      '我手里的词就是日常大家最熟悉的那种，投我平民阵营就亏了。',
      '大家仔细琢磨一下我的描述，我真没偏，信我一次！',
      '我真不是卧底，我的词很生活化，投我平民就危险了。',
    ];
    return runoffPool[(seat + round) % runoffPool.length]!;
  }

  if (round === 1) {
    if (isFirst) {
      const firstPool = [
        '我先起个头，这个东西平时生活中挺常见的。',
        '作为第一个发言的，我只能说大家基本都接触过，比较普及。',
        '日常物品，实用性挺强的，先不多说了。',
        '我这个词感觉挺接地气的，听听后面朋友怎么说。',
        '普遍且常见的东西，大部分人平时都会用到，先过。',
      ];
      return firstPool[seat % firstPool.length]!;
    }
    const followPool = [
      '听了前面的描述，感觉我的和大家差不多，比较常见。',
      '我也同意前面说的，这东西确实日常经常能见到或者用到。',
      '我这个特征蛮明显的，暂时先不透漏太多细节，看后面怎么聊。',
      '生活化比较强的一个事物，目前没听出谁特别异常，先过。',
      '我觉得前面几位的描述挺贴切的，我手里这个也差不多是这个方向。',
      '日常使用频率挺高的，大家应该都不陌生，先听听后面的。',
      '跟前面几位对得上，挺常见的一个东西，不多说了过。',
    ];
    return followPool[(seat + orderIndex) % followPool.length]!;
  }

  // round >= 2
  const laterPool = [
    '上一轮淘汰之后局势清楚了点，我这个词依然和大部分人一致。',
    '继续观望一下，我这词特点比较鲜明，目前没觉得谁特别不对劲。',
    '听了一圈感觉大家的词都很接近，先听后面的继续表述。',
    '上一轮的票型有点微妙，我先保持保守描述，过。',
    '我这边没问题，日常大家都会用到，先听听重点怀疑对象怎么说。',
    '还是坚持上一轮的观点，我这个词非常生活化，过。',
    '感觉卧底隐藏得挺深的，我再听听这轮谁的描述出现破绽。',
  ];
  return laterPool[(seat + round * 3 + orderIndex) % laterPool.length]!;
}
