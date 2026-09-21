import type { BotActionOption, BotDecisionInput, BotPromptContext } from '@ldj/shared';
import type { WitsWagersPlayerView } from './views.ts';
import type { WitsWagersAction, BoardTarget } from './types.ts';
import { estimateGuess, pickBestBets } from './bot.ts';
import { targetLabel } from './board.ts';

const ROLE_BRIEF = '你在玩聚会博弈桌游《一智千金》（Wits & Wagers）平台适配版。游戏共 7 轮，每轮面对一个答案为正整数的问题。所有玩家秘密提交猜测后版图按数值升序排列并标明赔率，玩家用两枚筹码进行下注。判定规则：与正确答案绝对差值最小的槽位获胜（同距时两侧并列获胜）；答案高于全部猜测则「更高」槽获胜，低于全部猜测则「更低」槽获胜。';

export function buildWitsWagersBotPrompt(
  input: BotDecisionInput<WitsWagersPlayerView>,
): BotPromptContext<WitsWagersAction> | null {
  const { view, playerId, random } = input;
  const me = view.me;
  const isForfeited = view.players.find((p) => p.playerId === playerId)?.forfeited;
  if (!me || isForfeited || view.phase === 'game_over') return null;

  // 1. 作答阶段：大模型估数决策
  if (view.phase === 'answering') {
    if (!me.canGuess || me.submittedGuess !== null) return null;
    const prompt = view.question?.prompt ?? '数字竞猜题';
    const unit = view.question?.unit ?? '';
    const situation = `当前是第 ${view.round} 轮作答。题目是：「${prompt}」（单位：${unit}）。你正在进行秘密估数。`;

    const baseVal = estimateGuess(prompt, unit, random);
    const v1 = Math.max(1, Math.round(baseVal * 0.65));
    const v2 = Math.max(1, baseVal);
    const v3 = Math.max(1, Math.round(baseVal * 1.45));
    const v4 = Math.max(1, Math.round(baseVal * 2.2));

    const candidates = [v1, v2, v3, v4];
    const options: BotActionOption<WitsWagersAction>[] = candidates.map((val, idx) => ({
      id: `guess_${idx + 1}`,
      label: `估计为 ${val.toLocaleString()} ${unit}`,
      action: {
        type: 'submit_guess',
        roundToken: view.roundToken,
        expectedRevision: me.guessRevision,
        value: val,
      },
    }));

    return {
      roleBrief: ROLE_BRIEF,
      situation,
      options,
      speech: {
        maxChars: 30,
        instruction: '写一句简短好玩的作答感言（例如："这题我有印象"、"感觉在几十到几百之间"等）',
      },
    };
  }

  // 2. 下注阶段：大模型赔率决策
  if (view.phase === 'betting') {
    if (!me.canBet) return null;
    const [chipA, chipB] = me.acceptedBets;
    if (chipA.targetId !== null || chipB.targetId !== null || view.board.length === 0) {
      return null;
    }

    const boardDesc = view.board
      .map((t) => `${targetLabel(t)} (净赢 ×${t.odds})`)
      .join('，');
    const situation = `当前是第 ${view.round} 轮下注阶段。可用积分余额：${me.available} 分。公开版图槽位有：${boardDesc}。`;

    const options: BotActionOption<WitsWagersAction>[] = [];

    // 选项 1：稳健策略（主押中位数槽位）
    const midIdx = Math.floor(view.board.length / 2);
    const midTarget = view.board[midIdx]!;
    const neighborIdx = Math.max(0, midIdx - 1);
    const neighborTarget = view.board[neighborIdx]!;

    options.push({
      id: 'bet_safe',
      label: `稳健策略：筹码 A 押中位槽位 ${targetLabel(midTarget)}，筹码 B 押备选 ${targetLabel(neighborTarget)}`,
      action: {
        type: 'set_bets',
        roundToken: view.roundToken,
        expectedRevision: me.betRevision,
        chips: [
          { chipId: 'A', targetId: midTarget.id, extraStake: me.available > 0 ? 1 : 0 },
          { chipId: 'B', targetId: neighborTarget.id, extraStake: 0 },
        ],
      },
    });

    // 选项 2：高赔率博弈策略（押高赔率或全部猜高）
    const highestOddsTarget = [...view.board].sort((a, b) => b.odds - a.odds)[0]!;
    options.push({
      id: 'bet_aggressive',
      label: `博弈策略：筹码 A 押高赔率 ${targetLabel(highestOddsTarget)} (×${highestOddsTarget.odds})，筹码 B 押中位槽位`,
      action: {
        type: 'set_bets',
        roundToken: view.roundToken,
        expectedRevision: me.betRevision,
        chips: [
          { chipId: 'A', targetId: highestOddsTarget.id, extraStake: 0 },
          { chipId: 'B', targetId: midTarget.id, extraStake: 0 },
        ],
      },
    });

    // 选项 3：启发式平衡策略
    const best = pickBestBets(view.board, me.available, random);
    options.push({
      id: 'bet_balanced',
      label: '综合平衡：组合分散下注并视余额附加适量积分',
      action: {
        type: 'set_bets',
        roundToken: view.roundToken,
        expectedRevision: me.betRevision,
        chips: [
          { chipId: 'A', targetId: best.targetA, extraStake: best.stakeA },
          { chipId: 'B', targetId: best.targetB, extraStake: best.stakeB },
        ],
      },
    });

    return {
      roleBrief: ROLE_BRIEF,
      situation,
      options,
      speech: {
        maxChars: 30,
        instruction: '写一句简短幽默的下注感言（例如："这赔率太香了"、"稳妥为王压中间"等）',
      },
    };
  }

  return null;
}
