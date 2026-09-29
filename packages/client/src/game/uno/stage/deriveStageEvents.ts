/**
 * UNO 欢乐房规演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 出牌、摸牌、换色、抓漏报一律看 topDiscard / deckCount / currentColor /
 * unoRaceWindow 的变化，而不是看用户点了按钮。
 */
import type { UnoCard, UnoHousePlayerView } from '../types.ts';

export type StageEvent =
  /** 有人出牌：牌从其手边/席位飞到弃牌堆（card 为飞出的那张，供飞行层渲染实体牌） */
  | { kind: 'cardPlayed'; playerId: string | null; seq: number; isMe: boolean; card: UnoCard }
  /** 有人摸牌：背面牌从摸牌堆飞到其手边/席位 */
  | { kind: 'cardDrawn'; playerId: string; seq: number; count: number; isMe: boolean }
  /** 换色：中央牌堆按新色扫光 */
  | { kind: 'colorChanged'; color: string; seq: number }
  /** 抓漏报窗口开启：目标席位告警 */
  | { kind: 'unoRaceOpened'; targetPlayerId: string; token: string; isMe: boolean }
  /** 罚牌堆积（+2/+4 叠牌） */
  | { kind: 'penaltyStacked'; total: number; responderId: string | null; isMe: boolean }
  /** 轮到我出牌 */
  | { kind: 'myTurnStarted' }
  /** 一局结束 */
  | { kind: 'roundOver'; round: number }
  /** 整场结束 */
  | { kind: 'matchOver' };

/**
 * 一次性演出的去重键。
 * 出牌 / 摸牌用 discardCount / deckCount 做序号——它们单调变化，
 * 天然是这一手的唯一标识，刷新重连不会重播已经演过的那一手。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'cardPlayed':
      return `play:${event.seq}`;
    case 'cardDrawn':
      return `draw:${event.seq}:${event.playerId}`;
    case 'colorChanged':
      return `color:${event.seq}`;
    case 'unoRaceOpened':
      return `race:${event.token}`;
    case 'roundOver':
      return `round:${event.round}`;
    case 'matchOver':
      return 'match';
    // 罚牌堆积与轮到我只有音效震动，不占播放记忆
    case 'penaltyStacked':
    case 'myTurnStarted':
      return null;
  }
}

/** 本轮标识：一局一轮，换局即清记忆。 */
export function roundTokenOf(view: UnoHousePlayerView): string {
  return `uno:${view.round}`;
}

export function deriveStageEvents(
  prev: UnoHousePlayerView,
  next: UnoHousePlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  const prevHand = (id: string) =>
    prev.players.find((p) => p.playerId === id)?.handCount ?? 0;
  const nextHand = (id: string) =>
    next.players.find((p) => p.playerId === id)?.handCount ?? 0;

  // 出牌：弃牌堆增长
  if (next.discardCount > prev.discardCount) {
    // 谁出的看谁手牌少了（叠牌时可能少多张，取变化最大的那个）
    let player: string | null = null;
    let maxDrop = 0;
    for (const p of next.players) {
      const drop = prevHand(p.playerId) - nextHand(p.playerId);
      if (drop > maxDrop) {
        maxDrop = drop;
        player = p.playerId;
      }
    }
    events.push({
      kind: 'cardPlayed',
      playerId: player,
      seq: next.discardCount,
      isMe: player === myId,
      card: next.topDiscard,
    });
  }

  // 摸牌：摸牌堆减少
  if (next.deckCount < prev.deckCount) {
    for (const p of next.players) {
      const gain = nextHand(p.playerId) - prevHand(p.playerId);
      if (gain <= 0) continue;
      events.push({
        kind: 'cardDrawn',
        playerId: p.playerId,
        seq: prev.deckCount,
        count: gain,
        isMe: p.playerId === myId,
      });
    }
  }

  // 换色：万能牌选色后中央变色
  if (next.currentColor !== prev.currentColor && next.currentColor !== null) {
    events.push({
      kind: 'colorChanged',
      color: next.currentColor,
      seq: next.discardCount,
    });
  }

  // 抓漏报窗口开启
  const prevToken = prev.unoRaceWindow?.windowToken ?? null;
  const nextToken = next.unoRaceWindow?.windowToken ?? null;
  if (nextToken !== null && nextToken !== prevToken && next.unoRaceWindow) {
    events.push({
      kind: 'unoRaceOpened',
      targetPlayerId: next.unoRaceWindow.targetPlayerId,
      token: nextToken,
      isMe: next.unoRaceWindow.targetPlayerId === myId,
    });
  }

  // 罚牌叠加
  const prevPenalty = prev.pendingPenalty?.total ?? 0;
  const nextPenalty = next.pendingPenalty?.total ?? 0;
  if (nextPenalty > prevPenalty) {
    events.push({
      kind: 'penaltyStacked',
      total: nextPenalty,
      responderId: next.pendingPenalty?.responderId ?? null,
      isMe: next.pendingPenalty?.responderId === myId,
    });
  }

  // 轮到我：只做提醒，不排时间线
  if (
    myId !== null &&
    prev.currentPlayerId !== myId &&
    next.currentPlayerId === myId &&
    next.phase === 'round_playing'
  ) {
    events.push({ kind: 'myTurnStarted' });
  }

  if (prev.phase !== 'round_over' && next.phase === 'round_over') {
    events.push({ kind: 'roundOver', round: next.round });
  }

  if (prev.phase !== 'match_over' && next.phase === 'match_over') {
    events.push({ kind: 'matchOver' });
  }

  return events;
}
