/**
 * 奶酪大盗（月夜鼠影）的机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。刻意不做推理：按 phase 给出合法的随机动作，
 * 目的是把流程跑完（两骰自选 → 偷看 → 共犯 → 身份卡 → 投票 → 结算），不是赢。
 * 任何"此刻不该我动"的情形都返回 null，让状态机自己推进或卡住。
 *
 * 设计取舍：
 * - 共犯数量 view 未暴露，按人数档硬编码默认（DEFAULT_ACCOMPLICE_RULES）：
 *   4→0, 5→1, 6→1, 7→2, 8→2；config.accomplicesByPlayers 覆盖时可能选错数量
 *   → reducer 拒绝，让平台记日志。
 * - 投票是否已投 view 未暴露；本策略在 vote 阶段总是返回动作，重复投票由 reducer 拒绝。
 *   （归类为视图能力 gap，详见 botAction.test.ts 与最终报告。）
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { CheeseThiefAction, CheeseThiefPlayerView } from './types.ts';

/** view.players 中排除自己 */
function others(view: CheeseThiefPlayerView, playerId: string): string[] {
  return view.players.filter((id) => id !== playerId);
}

/** 默认共犯数量（view 未暴露 rule.count，按人数档硬编码） */
function defaultAccompliceCount(playerCount: number): number {
  if (playerCount <= 4) return 0;
  if (playerCount <= 6) return 1;
  return 2;
}

export function pickCheeseThiefBotAction(
  input: BotDecisionInput<CheeseThiefPlayerView>,
): CheeseThiefAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局（或局外人）→ 无本人视角，无合法动作
  if (!me) return null;
  // 终局由计时器推进，机器人不掺和
  if (view.phase === 'game_over') return null;

  switch (view.phase) {
    case 'hour_choice': {
      // 4 人局变体：选两个候选之一
      const pair = me.hourChoices;
      if (pair === null) return null;
      // 已选择则不再投（reducer 会拒绝并白占一次）
      if (me.wakeHour !== 0) return null;
      const hour = random.nextInt(0, 2) === 0 ? pair[0] : pair[1];
      return { type: 'choose_hour', playerId, hour };
    }

    case 'night': {
      // canPeek 已包含"独醒 + 奶酪已失 + 未偷看"全部约束
      if (!me.canPeek) return null;
      const targets = others(view, playerId);
      if (targets.length === 0) return null;
      // 50/50 随机：peek / skip
      if (random.nextInt(0, 2) === 0) {
        return { type: 'skip_peek', playerId };
      }
      const target = targets[random.nextInt(0, targets.length)]!;
      return { type: 'peek_die', playerId, targetPlayerId: target };
    }

    case 'accomplice_select': {
      // 仅大盗在相识模式下可选择（不相识模式不会进此 phase）
      if (!me.isThief) return null;
      const count = defaultAccompliceCount(view.players.length);
      if (count <= 0) return null;
      const pool = others(view, playerId);
      if (pool.length < count) return null;
      // 随机抽 N 个不重复的共犯
      const shuffled = random.shuffle(pool);
      const accompliceIds = shuffled.slice(0, count);
      return { type: 'select_accomplice', playerId, accompliceIds };
    }

    case 'dawn': {
      // 身份卡：仅当 config.roleCards=true 时 me.roleCard 才可能非 'none'
      if (me.roleCard === 'cat' && view.revealedCat === null && me.catPeekedHour === null) {
        const targets = others(view, playerId);
        if (targets.length === 0) return null;
        const target = targets[random.nextInt(0, targets.length)]!;
        return { type: 'reveal_cat', playerId, targetPlayerId: target };
      }
      if (me.roleCard === 'dog' && view.revealedDog === null) {
        // 狗可指定任何人（含自己）作为先投票者
        const pool = view.players;
        if (pool.length === 0) return null;
        const firstVoterId = pool[random.nextInt(0, pool.length)]!;
        return { type: 'reveal_dog', playerId, firstVoterId };
      }
      return null;
    }

    case 'vote': {
      if (me.hasVoted) return null;
      // 50/50 随机：投 / 弃票
      if (random.nextInt(0, 2) === 0) {
        const targets = others(view, playerId);
        if (targets.length === 0) return null;
        const target = targets[random.nextInt(0, targets.length)]!;
        return { type: 'cast_vote', playerId, targetPlayerId: target };
      }
      return { type: 'cast_abstention', playerId };
    }
  }
}
