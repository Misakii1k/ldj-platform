/**
 * 铃铛对决的机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。规则机器人不做"推理"：
 * - 质疑投票判定中：若自己是投票人且尚未投票，默认相信（doubt: false，返回 challenge_vote）。机器人不主动拍铃（看不到线下动作）。
 * - 轮到自己时优先出与桌面顶牌同色或同数字的牌；没有可出牌则摸一张。
 * - 其余一切情形返回 null（不参与、让计时器/system 推进，或让状态机卡住暴露缺陷）。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { BellClashAction, BellClashCard, BellClashPlayerView } from './types.ts';

/** 牌是否可打出：与 rules.canPlay 等价（手牌不公开时 bot 只能依赖自己的 view） */
function canPlayCard(card: BellClashCard, top: BellClashCard | null): boolean {
  if (top === null) return true;
  if (card.color === top.color) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
  return false;
}

export function pickBellClashBotAction(
  input: BotDecisionInput<BellClashPlayerView>,
): BellClashAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  // 不在本局（me === null）或对局已结束 → 不动
  if (!me) return null;
  if (view.phase === 'game_over') return null;

  // 拍铃判定进行中：若自己是投票人且未投票，返回 challenge_vote { doubt: false }
  if (view.challenge !== null) {
    const ch = view.challenge;
    if (
      ch.voterIds.includes(playerId) &&
      !ch.doubtIds.includes(playerId) &&
      !ch.confirmIds.includes(playerId)
    ) {
      return { type: 'challenge_vote', playerId, doubt: false };
    }
    return null;
  }

  // 非自己回合 → 不动（机器人不在线下拍铃）
  if (view.currentPlayerId !== playerId) return null;

  // 自己回合：在手牌中找可打出的牌（按颜色 / 数字匹配）
  const top = view.discardTop;
  const playableIndices: number[] = [];
  me.hand.forEach((card, idx) => {
    if (canPlayCard(card, top)) playableIndices.push(idx);
  });
  if (playableIndices.length > 0) {
    // 多个候选时用 random 选一个，避免总是出第一张
    const chosen = playableIndices[random.nextInt(0, playableIndices.length)]!;
    return { type: 'play_card', playerId, cardIndex: chosen };
  }
  // 无可出牌 → 摸一张
  return { type: 'draw_card', playerId };
}
