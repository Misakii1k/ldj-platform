/**
 * 以鹅传鹅 规则机器人策略（测试用陪练）。
 *
 * 跑完完整游戏流程：
 * - 抢当头鹅（claim_head）：抢先发出 claim_head；
 * - 头鹅选卡（pick_cards）：头鹅从展示候选卡中挑选凶手与受害鹅；
 * - 动作传递（relay）：轮到当前表演者时点击 relay_done；
 * - 讨论（discussion）：跳过等待；
 * - 倒序指认（accusation）：从展示候选卡中随机选择 2 张不同的卡进行指认；
 * - 揪恶投票（vote）：从非自己的玩家中随机投出一票。
 */
import type { BotDecisionInput } from '@ldj/shared';
import {
  CHARACTERS,
  type CharacterId,
  type GooseRelayAction,
  type GooseRelayPlayerView,
} from './types.ts';

/** 从候选展示卡（或全部卡牌）中随机选一对不同的卡牌 */
function randomAccusePair(
  random: BotDecisionInput<GooseRelayPlayerView>['random'],
  candidates: readonly CharacterId[],
): { murderer: CharacterId; victim: CharacterId } {
  const pool = candidates.length >= 2 ? candidates : (CHARACTERS as readonly CharacterId[]);
  const shuffled = random.shuffle(pool);
  const murderer = shuffled[0]!;
  const victim = shuffled.find((c) => c !== murderer)!;
  return { murderer, victim };
}

/** 从候选玩家中随机选一个；候选为空时返回 null */
function pickRandom<T>(
  random: BotDecisionInput<GooseRelayPlayerView>['random'],
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;
  return candidates[random.nextInt(0, candidates.length)]!;
}

export function pickGooseRelayBotAction(
  input: BotDecisionInput<GooseRelayPlayerView>,
): GooseRelayAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me) return null;

  switch (view.phase) {
    case 'claim_head': {
      if (view.headPlayerId === null) {
        return { type: 'claim_head', playerId };
      }
      return null;
    }

    case 'pick_cards': {
      if (view.headPlayerId === playerId) {
        const { murderer, victim } = randomAccusePair(random, view.candidateCards);
        return { type: 'pick_cards', playerId, murderer, victim };
      }
      return null;
    }

    case 'relay': {
      const expectedId = view.lineOrder[view.currentIndex];
      if (expectedId !== playerId) return null;
      return { type: 'relay_done', playerId };
    }

    case 'discussion':
      return null;

    case 'accusation': {
      const expectedId = view.lineOrder[view.currentAccuserIndex];
      if (expectedId !== playerId) return null;
      const { murderer, victim } = randomAccusePair(random, view.candidateCards);
      return { type: 'accuse', playerId, murderer, victim };
    }

    case 'vote': {
      const targets = view.players.filter((p) => p !== playerId);
      if (view.votesCast >= view.players.length) return null;
      const target = pickRandom(random, targets);
      if (target === null) return null;
      return { type: 'cast_vote', playerId, targetPlayerId: target };
    }

    case 'game_over':
      return null;
  }
}
