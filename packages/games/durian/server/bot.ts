import type { BotDecisionInput } from '@ldj/shared';
import { DURIAN_FRUITS, type DurianAction, type DurianFruit, type DurianPlayerView } from './types.ts';

export function pickDurianBotAction(
  input: BotDecisionInput<DurianPlayerView>,
): DurianAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me) return null;
  if (view.phase === 'game_over') return null;

  if (view.phase === 'turn_action') {
    if (view.currentPlayerId !== playerId) return null;

    // 如果还没有人出过牌，必须摸牌
    if (!view.previousPlayerId) {
      return { type: 'draw_card', playerId };
    }

    // 统计能看到的其他所有人的水果数量
    const visibleTotals: Record<DurianFruit, number> = {
      durian: 0,
      strawberry: 0,
      banana: 0,
      grape: 0,
      apple: 0,
    };

    for (const entry of me.visibleForeheadCards) {
      if (entry.card.kind === 'fruit') {
        visibleTotals[entry.card.left.fruit] += entry.card.left.quantity;
        visibleTotals[entry.card.right.fruit] += entry.card.right.quantity;
      }
    }

    // 检查桌面上是否有某种水果明显超卖（桌面数 > 可见总数 + 期望自己可能拥有的数量）
    let highRisk = false;
    for (const fruit of DURIAN_FRUITS) {
      const tableCount = view.activeTableTotals[fruit] ?? 0;
      const seenCount = visibleTotals[fruit];
      // 假设自己头上最多贡献 2~3 个某种水果
      if (tableCount >= seenCount + 3) {
        highRisk = true;
        break;
      }
    }

    // 高风险时 85% 概率质疑，否则 20% 概率质疑，其余摸牌
    const shouldChallenge = highRisk ? random.nextInt(0, 100) < 85 : random.nextInt(0, 100) < 20;

    if (shouldChallenge) {
      return { type: 'challenge', playerId };
    }

    return { type: 'draw_card', playerId };
  }

  if (view.phase === 'choose_placement') {
    if (view.currentPlayerId !== playerId) return null;
    const checkHalf = random.nextInt(0, 2) === 0 ? 'left' : 'right';
    return { type: 'place_fruit', playerId, checkHalf };
  }

  if (view.phase === 'choose_flip') {
    if (view.currentPlayerId !== playerId) return null;
    const fruitPlacements = view.tablePlacements.filter((p) => p.kind === 'fruit');
    if (fruitPlacements.length === 0) return null;
    const picked = fruitPlacements[random.nextInt(0, fruitPlacements.length)]!;
    return {
      type: 'select_flip_target',
      playerId,
      targetPlacementId: picked.data.placementId,
    };
  }

  if (view.phase === 'challenge_result') {
    return { type: 'next_round', playerId };
  }

  return null;
}
