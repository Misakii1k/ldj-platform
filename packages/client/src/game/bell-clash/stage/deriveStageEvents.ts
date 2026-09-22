/**
 * Ding 演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 出牌、摸牌、抢铃是否成立，一律看 discardTop / drawCount / bellClaimantId
 * 的变化，而不是看用户点了按钮。
 *
 * 本游戏 phase 只有 playing | game_over，真正的状态由三个正交字段承载：
 * currentPlayerId（谁的回合）、bellOpen（抢铃窗口）、bellClaimantId（谁抢到）。
 */
import type { BellClashPlayerView } from '../types.ts';

export type StageEvent =
  /** 有人出牌：牌从其手边/席位飞到弃牌堆 */
  | { kind: 'cardPlayed'; playerId: string; seq: number; isMe: boolean }
  /** 有人摸牌：背面牌从摸牌堆飞到其手边/席位 */
  | { kind: 'cardDrawn'; playerId: string; seq: number; isMe: boolean }
  /** 抢铃窗口开启 */
  | { kind: 'bellOpened'; seq: number }
  /** 有人抢到铃：铃按下 + 声波扩散 */
  | { kind: 'bellClaimed'; claimantId: string; isMe: boolean; seq: number }
  /** 我错拍被罚摸：铃不按下，只飞一张罚牌 */
  | { kind: 'penaltyDrawn'; playerId: string; seq: number }
  /** 轮到我出牌 */
  | { kind: 'myTurnStarted' }
  /** 终局：各席位剩余手牌飞回弃牌堆收桌 */
  | { kind: 'gameOver'; winners: string[] };

/**
 * 一次性演出的去重键。
 *
 * 出牌 / 摸牌用 seq（弃牌堆张数或摸牌堆余量）做序号——它单调变化，
 * 天然是这一手的唯一标识，刷新重连不会重播已经演过的那一手。
 * 返回 null 表示每次都播（纯音效与震动，无时间线）。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'cardPlayed':
      return `play:${event.seq}`;
    case 'cardDrawn':
      return `draw:${event.seq}:${event.playerId}`;
    case 'penaltyDrawn':
      return `penalty:${event.seq}:${event.playerId}`;
    case 'bellClaimed':
      return `claim:${event.seq}`;
    case 'gameOver':
      return 'over';
    // 窗口开启与轮到我只有音效震动，不占播放记忆
    case 'bellOpened':
    case 'myTurnStarted':
      return null;
  }
}

/**
 * 本轮标识。
 *
 * 一局之内不换轮，但摸牌堆余量单调减少，可以用它把记忆切成段，
 * 避免一局打很久后 sessionStorage 里堆积上百个键。
 */
export function roundTokenOf(view: BellClashPlayerView): string {
  return `bc:${view.players.join(',')}`;
}

export function deriveStageEvents(
  prev: BellClashPlayerView,
  next: BellClashPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  const prevHand = (id: string) => prev.handCounts?.[id] ?? 0;
  const nextHand = (id: string) => next.handCounts?.[id] ?? 0;

  // 出牌：顶牌换了。谁出的看谁手牌少了一张。
  const topChanged =
    JSON.stringify(prev.discardTop ?? null) !== JSON.stringify(next.discardTop ?? null);
  if (topChanged && next.discardTop !== null) {
    const player = next.players.find((id) => nextHand(id) === prevHand(id) - 1);
    if (player) {
      events.push({
        kind: 'cardPlayed',
        playerId: player,
        // 摸牌堆余量 + 全场手牌数是单调的，用它当这一手的序号
        seq: next.drawCount + next.players.reduce((sum, id) => sum + nextHand(id), 0),
        isMe: player === myId,
      });
    }
  }

  // 摸牌：摸牌堆少了，某人手牌多了。
  // 错拍罚摸与正常摸牌都走这条差分，靠 bellOpen 的状态区分。
  if (next.drawCount < prev.drawCount) {
    for (const id of next.players) {
      if (nextHand(id) <= prevHand(id)) continue;
      // 抢铃窗口刚关且这人没抢到 → 是错拍罚摸
      const wasPenalty = prev.bellOpen && !next.bellOpen && next.bellClaimantId !== id;
      events.push(
        wasPenalty
          ? { kind: 'penaltyDrawn', playerId: id, seq: prev.drawCount }
          : { kind: 'cardDrawn', playerId: id, seq: prev.drawCount, isMe: id === myId },
      );
    }
  }

  // 抢铃窗口开启
  if (!prev.bellOpen && next.bellOpen) {
    events.push({ kind: 'bellOpened', seq: next.drawCount });
  }

  // 有人抢到铃
  if (next.bellClaimantId !== null && prev.bellClaimantId !== next.bellClaimantId) {
    events.push({
      kind: 'bellClaimed',
      claimantId: next.bellClaimantId,
      isMe: next.bellClaimantId === myId,
      seq: next.drawCount,
    });
  }

  // 轮到我：只做提醒，不排时间线
  if (myId !== null && prev.currentPlayerId !== myId && next.currentPlayerId === myId && next.phase !== 'game_over') {
    events.push({ kind: 'myTurnStarted' });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver', winners: [...(next.winners ?? [])] });
  }

  return events;
}
