/**
 * 伪人测试（判官模式）机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。刻意不做推理：
 * - 判官出题用一条固定中文短句（不依赖题库枚举，原型题库未提供）；
 * - 玩家回答用一条固定短句（满足 schema 长度约束，伪人身份不主动回避触发词——陪练级策略）；
 * - 判官指认从除自己外的玩家中随机选一个。
 *
 * 目的是把流程跑完（出题 → 回答 → 指认 → 计分 → 轮换 → 终局），不追求赢。
 * 任何"此刻不该我动"的情形都返回 null，让状态机自己推进或卡住。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { EchoJudgeAction, EchoJudgePlayerView } from './types.ts';

/** 陪练出题固定短句（满足 schema 1–200 字符约束，跨原型无题库时也能用） */
const FALLBACK_QUESTION = '你最喜欢什么样的食物？';
/** 陪练回答固定短句（满足 schema 1–200 字符约束，合法且不与游戏语义冲突） */
const FALLBACK_ANSWER = '我不太确定';

export function pickEchoJudgeBotAction(
  input: BotDecisionInput<EchoJudgePlayerView>,
): EchoJudgeAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局（me 为 null）或为观战者：return null
  if (!me) return null;

  switch (view.phase) {
    case 'judge_setup': {
      // 仅判官能出题；题目非空时本轮已出题，绝不重复投递
      if (!me.isJudge) return null;
      if (view.question !== '') return null;
      return { type: 'start_round', playerId, question: FALLBACK_QUESTION };
    }

    case 'answering': {
      // myTurn=false 覆盖三种情况：已答过 / 判官身份 / 未轮到自己
      if (!me.myTurn) return null;
      return { type: 'submit_answer', playerId, text: FALLBACK_ANSWER };
    }

    case 'judgment': {
      // 仅判官能指认；view.caughtImpostor 不做"已指认"判定——
      // 它是上一轮的结算结果，跨轮保留（rules.ts 注释"不随轮换清空"），
      // 真正的"本轮已指认"守卫在 reducer 的 `accusation !== null`，由状态机保证。
      if (!me.isJudge) return null;
      const targets = view.players.filter((p) => p !== playerId);
      if (targets.length === 0) return null; // 极端兜底：无可指认目标，交给计时器走 resolve_round
      const target = targets[random.nextInt(0, targets.length)]!;
      return { type: 'accuse', playerId, targetPlayerId: target };
    }

    case 'game_over':
      return null;
  }
}
