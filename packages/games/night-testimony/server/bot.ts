/**
 * 暗夜证词（囚徒之夜）的机器人策略（测试用陪练）。
 *
 * 纯函数：只读玩家视角，随机选动作，目的是把流程跑完（问答 → 推理 → 投票 → 结算），
 * 不是赢。任何"此刻不该我动"的情形都返回 null，让状态机自己推进或卡住。
 *
 * 覆盖的 phase：
 * - question：当 me.pendingQuestion 非空（即"我被问了"）→ 随机 YES/NO（前提标记还有余量）
 * - deduction：纯讨论计时，无玩家动作 → null
 * - vote：随机投一名非自己玩家
 * - game_over：狱警被票出后需猜罪 → 陪练直接按终局披露猜罪以闭环结算；其余不动
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { CrimeId, NightTestimonyAction, NightTestimonyPlayerView } from './types.ts';

function votableTargets(view: NightTestimonyPlayerView, playerId: string): string[] {
  return view.players.filter((id) => id !== playerId);
}

export function pickNightTestimonyBotAction(
  input: BotDecisionInput<NightTestimonyPlayerView>,
): NightTestimonyAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局 → 不该动
  if (!me) return null;

  switch (view.phase) {
    case 'question': {
      // 没人问我 → 不该动
      if (me.pendingQuestion === null) return null;
      // 标记都耗尽（防御性，理论上 pendingQuestion 不会出现）→ 退回 null
      const choices: Array<'yes' | 'no'> = [];
      if (me.yesLeft > 0) choices.push('yes');
      if (me.noLeft > 0) choices.push('no');
      if (choices.length === 0) return null;
      return {
        type: 'answer',
        playerId,
        answer: choices[random.nextInt(0, choices.length)]!,
      };
    }

    case 'deduction':
      // 纯讨论计时，机器人不发言也不动手
      return null;

    case 'vote': {
      const targets = votableTargets(view, playerId);
      if (targets.length === 0) return null; // 无合法目标 → 弃权，交给计时器结算
      return {
        type: 'cast_vote',
        playerId,
        targetPlayerId: targets[random.nextInt(0, targets.length)]!,
      };
    }

    case 'game_over':
      // 狱警被票出后停在 game_over 等狱警猜罪（无计时器兜底）。
      // view 在终局披露 crimes（reveal），陪练策略直接按披露猜，保证对局能闭环结算；
      // 其余情况（囚犯胜、非狱警、无需猜罪）不动。
      if (view.guessingInProgress && me?.isWarden && view.reveal !== null) {
        const inmates = view.players.filter((id) => id !== playerId);
        if (inmates.length === 0) return null;
        const guesses: Record<string, CrimeId> = {};
        for (const inmate of inmates) {
          const crime = view.reveal.crimes[inmate];
          if (crime === undefined) return null;
          guesses[inmate] = crime;
        }
        return { type: 'submit_guesses', playerId, guesses };
      }
      return null;
  }
}
