/**
 * 斗地主演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 出牌、过牌、抢地主一律看 currentTrick / passCount / landlordId 的变化，
 * 而不是看用户点了按钮。
 */
import type { LandlordPlatformPlayerView } from '../types.ts';

export type StageEvent =
  /** 有人叫分 */
  | { kind: 'bidPlaced'; playerId: string; score: number }
  /** 地主诞生：底牌翻开 */
  | { kind: 'landlordDecided'; playerId: string; isMe: boolean }
  /** 有人出牌：牌从其手边飞到中央 */
  | { kind: 'cardsPlayed'; playerId: string; comboType: string; count: number; seq: number; isMe: boolean }
  /** 有人过牌：playerId 是被越过回合的那位（= 变化前的 currentPlayerId） */
  | { kind: 'passed'; playerId: string | null; passCount: number }
  /** 炸弹 / 王炸：全屏冲屏演出（倍数不变，只读 view.multiplier）；victimId 是被压的那一手的主人 */
  | { kind: 'bombDropped'; playerId: string; comboType: string; multiplier: number; victimId: string | null }
  /** 轮到我 */
  | { kind: 'myTurnStarted' }
  /** 终局；isSpring 纯客户端判定（两农民整局一张未出），只驱动春印/冲屏展示 */
  | { kind: 'gameOver'; winnerTeam: string | null; isSpring: boolean };

/** 炸弹类组合：触发全屏炸弹冲击演出。 */
const BOMB_TYPES = new Set(['bomb', 'rocket']);

/**
 * 一次性演出的去重键。
 * 出牌用「手牌总数」做序号——它单调减少，天然是这一手的唯一标识。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'landlordDecided':
      return `landlord:${event.playerId}`;
    case 'cardsPlayed':
      return `play:${event.seq}`;
    case 'gameOver':
      return 'over';
    // 叫分、过牌、炸弹、轮到我只有音效与静态表现，不占播放记忆
    case 'bidPlaced':
    case 'passed':
    case 'bombDropped':
    case 'myTurnStarted':
      return null;
  }
}

/** 本轮标识：一局一轮，用玩家名单隔离不同对局。 */
export function roundTokenOf(view: LandlordPlatformPlayerView): string {
  return `ll3:${view.players.map((p) => p.playerId).join(',')}`;
}

/** 全场手牌总数：出牌演出的单调序号（递减）。 */
function handTotal(view: LandlordPlatformPlayerView): number {
  return view.players.reduce((sum, p) => sum + p.handCount, 0);
}

export function deriveStageEvents(
  prev: LandlordPlatformPlayerView,
  next: LandlordPlatformPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  // 叫分：bids 增长
  if (next.bids.length > prev.bids.length) {
    for (let i = prev.bids.length; i < next.bids.length; i += 1) {
      const bid = next.bids[i]!;
      events.push({ kind: 'bidPlaced', playerId: bid.playerId, score: bid.score });
    }
  }

  // 地主诞生
  if (prev.landlordId === null && next.landlordId !== null) {
    events.push({
      kind: 'landlordDecided',
      playerId: next.landlordId,
      isMe: next.landlordId === myId,
    });
  }

  // 出牌：手牌总数减少且中央有新一手
  const before = handTotal(prev);
  const after = handTotal(next);
  if (after < before && next.currentTrick !== null) {
    const trick = next.currentTrick;
    const count = before - after;
    events.push({
      kind: 'cardsPlayed',
      playerId: trick.playerId,
      comboType: trick.combo.type,
      count,
      // 用剩余总手牌数做序号：单调递减，刷新重连不会重播已演过的那一手
      seq: after,
      isMe: trick.playerId === myId,
    });

    if (BOMB_TYPES.has(trick.combo.type)) {
      events.push({
        kind: 'bombDropped',
        playerId: trick.playerId,
        comboType: trick.combo.type,
        multiplier: next.multiplier,
        // 被压的是上一手的主人（契约 §4.2：上家冒气泡"啊？！"）
        victimId: prev.currentTrick && prev.currentTrick.playerId !== trick.playerId
          ? prev.currentTrick.playerId
          : null,
      });
    }
  }

  // 过牌：passCount 增长而手牌没变；被越过的是变化前握有回合的那位
  if (next.passCount > prev.passCount && after === before) {
    events.push({
      kind: 'passed',
      playerId: prev.currentPlayerId !== next.currentPlayerId ? prev.currentPlayerId : null,
      passCount: next.passCount,
    });
  }

  if (
    myId !== null &&
    prev.currentPlayerId !== myId &&
    next.currentPlayerId === myId &&
    next.phase !== 'game_over'
  ) {
    events.push({ kind: 'myTurnStarted' });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver', winnerTeam: next.winnerTeam, isSpring: isSpringWin(next) });
  }

  return events;
}

/**
 * 春天判定（纯客户端，契约 §2）：地主胜，且两个农民在整局里一张都没出过
 * —— 即 revealedHands 里两个农民都还是 17 张。只用于显示印章，不影响数值。
 */
function isSpringWin(view: LandlordPlatformPlayerView): boolean {
  if (view.winnerTeam !== 'landlord') return false;
  const revealed = view.revealedHands;
  if (!revealed) return false;
  const farmers = view.players.filter((p) => p.playerId !== view.landlordId);
  if (farmers.length !== 2) return false;
  return farmers.every((f) => (revealed[f.playerId]?.length ?? 0) === 17);
}
