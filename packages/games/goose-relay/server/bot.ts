/**
 * 以鹅传鹅 规则机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。刻意不做推理：
 * - 头鹅读卡后如实传递；其他玩家在轮到时如实复述上一位的演绎；
 * - 指认时随机选一对（凶手、被害人）角色（保证两者不同以满足 schema 约束）；
 * - 投票时从非自己玩家中随机选一个。
 *
 * 目的是把流程跑完（读卡 → 传递 → 讨论 → 指认 → 投票 → 结算），不追求赢。
 * 任何"此刻不该我动"的情形都返回 null，让状态机自己推进或卡住。
 *
 * 设计取舍：
 * - case_view/relay 用 `lineOrder[currentIndex] === playerId` 判断是否轮到自己；
 *   轮次推进后下标自然错位，"已动作后再次调用"自然返回 null。
 * - accusation 同理，用 `lineOrder[currentAccuserIndex] === playerId` 判断。
 * - vote 阶段视图未暴露"我是否已投票"（见 me 字段仅有 playerId/role/observed），
 *   机器人始终返回一票；reducer 的「已投票」校验会拒绝重复投递（这是有意的设计
 *   限制，详见最终报告"规则卡点"段）。
 * - discussion 是线下讨论环节，App 只计时，机器人无事可做。
 */
import type { BotDecisionInput } from '@ldj/shared';
import { CHARACTERS, type CaseCard, type CharacterId, type GooseRelayAction, type GooseRelayPlayerView } from './types.ts';

/** 随机生成一对不同的凶手/被害人（满足 accuse 动作 schema 与 case 卡的凶手≠被害人约束） */
function randomAccusePair(random: BotDecisionInput<GooseRelayPlayerView>['random']): {
  murderer: CharacterId;
  victim: CharacterId;
} {
  const shuffled = random.shuffle(CHARACTERS as readonly CharacterId[]);
  const murderer = shuffled[0]!;
  // shuffle 至少产生 1 个不等于 murderer 的元素（CHARACTERS.length=6 ≥ 2）
  const victim = shuffled.find((c) => c !== murderer)!;
  return { murderer, victim };
}

/** 从候选玩家中随机选一个；候选为空时返回 null */
function pickRandom<T>(random: BotDecisionInput<GooseRelayPlayerView>['random'], candidates: readonly T[]): T | null {
  if (candidates.length === 0) return null;
  return candidates[random.nextInt(0, candidates.length)]!;
}

export function pickGooseRelayBotAction(
  input: BotDecisionInput<GooseRelayPlayerView>,
): GooseRelayAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局或被移除：me 为 null，不应返回任何动作
  if (!me) return null;

  switch (view.phase) {
    case 'case_view':
    case 'relay': {
      // 轮到当前 index 的人传递；轮次推进后下标自然错位 → 已动作自动返回 null
      const expectedId = view.lineOrder[view.currentIndex];
      if (expectedId !== playerId) return null;
      const observed = me.observed;
      if (!observed) return null; // 防御：没看到上下文就不传，让计时器兜底
      const caseCopy: CaseCard = { ...observed };
      return { type: 'transmit', playerId, case: caseCopy };
    }

    case 'discussion':
      // 线下讨论环节，App 只计时，机器人无事可做
      return null;

    case 'accusation': {
      // 轮到当前指认下标的人指认；倒序指认，前一人指对/指错后下标自然推进
      const expectedId = view.lineOrder[view.currentAccuserIndex];
      if (expectedId !== playerId) return null;
      const { murderer, victim } = randomAccusePair(random);
      return { type: 'accuse', playerId, murderer, victim };
    }

    case 'vote': {
      // 不能投自己；视图未暴露"我是否已投票"（见文件头注释），reducer 会拒绝重复票
      const targets = view.players.filter((p) => p !== playerId);
      // 全员已投完则返回 null（避免无意义投递，reducer 也会幂等拒绝）
      if (view.votesCast >= view.players.length) return null;
      const target = pickRandom(random, targets);
      if (target === null) return null;
      return { type: 'cast_vote', playerId, targetPlayerId: target };
    }

    case 'game_over':
      return null;
  }
}
