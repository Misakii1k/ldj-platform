/**
 * Ding 演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 出牌、摸牌、拍铃与质疑结算，一律看 discardTop / drawCount / challenge
 * 的权威变化。
 */
import type { BellClashPlayerView, PhraseCard } from '../types.ts';

export type StageEvent =
  /** 有人出牌：牌从其手边/席位飞到弃牌堆 */
  | { kind: 'cardPlayed'; playerId: string; seq: number; isMe: boolean }
  /** 有人摸牌：背面牌从摸牌堆飞到其手边/席位 */
  | { kind: 'cardDrawn'; playerId: string; seq: number; isMe: boolean }
  /** 有人拍铃亮卡发起质疑：铃响 + 震动 */
  | { kind: 'bellRung'; claimantId: string; card: PhraseCard; isMe: boolean; seq: number }
  /** 质疑结算：成功抢到回合 vs 拍错罚牌 */
  | { kind: 'challengeResolved'; success: boolean; claimantId: string; isMe: boolean; card: PhraseCard; seq: number }
  /** 我错拍被罚摸：检视器或手边提示 */
  | { kind: 'penaltyDrawn'; playerId: string; seq: number }
  /** 轮到我出牌 */
  | { kind: 'myTurnStarted' }
  /** 终局：各席位剩余手牌收桌 */
  | { kind: 'gameOver'; winners: string[] };

/**
 * 一次性演出的去重键。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'cardPlayed':
      return `play:${event.seq}`;
    case 'cardDrawn':
      return `draw:${event.seq}:${event.playerId}`;
    case 'penaltyDrawn':
      return `penalty:${event.seq}:${event.playerId}`;
    case 'bellRung':
      return `bellRung:${event.seq}:${event.claimantId}`;
    case 'challengeResolved':
      return `resolve:${event.seq}:${event.claimantId}:${event.success}`;
    case 'gameOver':
      return 'over';
    case 'myTurnStarted':
      return null;
  }
}

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

  // 1. 质疑结算检查（优先于常规出牌，避免结算时的顶牌变化被重叠判断为普通出牌）
  if (prev.challenge && !next.challenge) {
    const prevChallenge = prev.challenge;
    const isSuccess =
      next.discardTop !== null &&
      next.discardTop.kind === 'phrase' &&
      next.discardTop.phrase === prevChallenge.card.phrase;

    events.push({
      kind: 'challengeResolved',
      success: isSuccess,
      claimantId: prevChallenge.claimantId,
      isMe: prevChallenge.claimantId === myId,
      card: prevChallenge.card,
      seq: next.drawCount,
    });
  }

  // 2. 拍铃亮卡发起质疑
  if (!prev.challenge && next.challenge) {
    events.push({
      kind: 'bellRung',
      claimantId: next.challenge.claimantId,
      card: next.challenge.card,
      isMe: next.challenge.claimantId === myId,
      seq: next.drawCount,
    });
  }

  // 3. 常规出牌：顶牌换了且不是 challenge 结算
  const topChanged =
    JSON.stringify(prev.discardTop ?? null) !== JSON.stringify(next.discardTop ?? null);
  const wasChallengeResolution = Boolean(prev.challenge && !next.challenge);

  if (topChanged && next.discardTop !== null && !wasChallengeResolution) {
    const player = next.players.find((id) => nextHand(id) === prevHand(id) - 1);
    if (player) {
      events.push({
        kind: 'cardPlayed',
        playerId: player,
        seq: next.drawCount + next.players.reduce((sum, id) => sum + nextHand(id), 0),
        isMe: player === myId,
      });
    }
  }

  // 4. 摸牌：摸牌堆少了
  if (next.drawCount < prev.drawCount) {
    for (const id of next.players) {
      if (nextHand(id) <= prevHand(id)) continue;
      // 质疑失败后的罚摸
      const wasPenalty =
        Boolean(prev.challenge) && !next.challenge && prev.challenge?.claimantId === id;
      events.push(
        wasPenalty
          ? { kind: 'penaltyDrawn', playerId: id, seq: prev.drawCount }
          : { kind: 'cardDrawn', playerId: id, seq: prev.drawCount, isMe: id === myId },
      );
    }
  }

  // 5. 轮到我出牌
  if (
    myId !== null &&
    prev.currentPlayerId !== myId &&
    next.currentPlayerId === myId &&
    next.phase !== 'game_over'
  ) {
    events.push({ kind: 'myTurnStarted' });
  }

  // 6. 终局
  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver', winners: [...(next.winners ?? [])] });
  }

  return events;
}
