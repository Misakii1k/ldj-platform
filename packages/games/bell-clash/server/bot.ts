/**
 * 铃铛对决的机器人策略（测试用陪练）。
 *
 * 只读玩家视角，纯函数。规则机器人不做"推理"：
 * - 轮到自己时优先出与桌面顶牌同色或同数字的牌；没有可出牌则摸一张。
 * - 按铃窗口：仅在手中持有与顶牌同色的短语卡时才拍铃（避免错误拍铃被罚摸）。
 * - 其余一切情形返回 null（不参与、让计时器/system 推进，或让状态机卡住暴露缺陷）。
 *
 * 返回 null = 此刻不该我动；返回的动作会再过 parseAction + reduce，
 * 重复投递/错误身份会被 reducer 拒绝，所以"已出过牌"或"已拍铃"等状态都返回 null。
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

  // 按铃窗口：决定是否拍铃
  if (view.bellOpen) {
    // 已有人拍下，等系统 resolve_bell 结算 → 机器人不参与
    if (view.bellClaimantId !== null) return null;
    const top = view.discardTop;
    if (!top || top.kind !== 'phrase') return null; // 防御：窗口应挂在短语卡上
    // 仅在持有同色短语卡时才拍铃（避免被罚摸）
    const hasMatch = me.hand.some(
      (card) => card.kind === 'phrase' && card.color === top.color,
    );
    if (!hasMatch) return null;
    return { type: 'ring_bell', playerId };
  }

  // 非自己回合 → 不动
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
  // 无可出牌 → 摸一张（让 reducer 决定摸到后是否自动出）
  return { type: 'draw_card', playerId };
}
