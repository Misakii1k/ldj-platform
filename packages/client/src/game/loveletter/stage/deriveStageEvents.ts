/**
 * 情书演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 出牌、淘汰、庇护一律看 discarded / eliminatedPlayers / protectedPlayers
 * 的变化，而不是看用户点了按钮。
 *
 * 注意：这款**没有任何服务端 timer**（纯回合制），所以视图里没有 deadlineAt，
 * 也不该上倒计时环——演出时长只受自身节拍约束。
 */
import type { LoveLetterPlayerView } from '../types.ts';

export type StageEvent =
  /** 有人出牌：信封从其手边飞到中央并翻开 */
  | { kind: 'cardPlayed'; playerId: string; role: string; seq: number; isMe: boolean }
  /** 有人被淘汰：席位灰掉并翻出手牌 */
  | { kind: 'eliminated'; playerIds: string[]; seq: number }
  /** 有人被侍女庇护：盾牌亮起 */
  | { kind: 'protected'; playerIds: string[] }
  /** 轮到我 */
  | { kind: 'myTurnStarted' }
  /** 一轮结束 */
  | { kind: 'roundOver'; round: number }
  /** 终局 */
  | { kind: 'gameOver' };

/**
 * 一次性演出的去重键。
 * 出牌用弃牌总数做序号——它单调增长，天然是这一手的唯一标识。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'cardPlayed':
      return `play:${event.seq}:${event.playerId}`;
    case 'eliminated':
      return `out:${event.seq}`;
    case 'roundOver':
      return `round:${event.round}`;
    case 'gameOver':
      return 'over';
    // 庇护与轮到我只有静态表现与音效，不占播放记忆
    case 'protected':
    case 'myTurnStarted':
      return null;
  }
}

/** 本轮标识：轮次变化即换轮。 */
export function roundTokenOf(view: LoveLetterPlayerView): string {
  return `ll:${view.round}`;
}

/** 全场弃牌总数：出牌演出的单调序号。 */
function discardTotal(view: LoveLetterPlayerView): number {
  return view.players.reduce((sum, p) => sum + p.discarded.length, 0);
}

export function deriveStageEvents(
  prev: LoveLetterPlayerView,
  next: LoveLetterPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  if (next.round > prev.round) {
    events.push({ kind: 'roundOver', round: prev.round });
  }

  // 出牌：某人的弃牌堆增长
  const seq = discardTotal(next);
  if (seq > discardTotal(prev)) {
    for (const p of next.players) {
      const before = prev.players.find((q) => q.playerId === p.playerId)?.discarded.length ?? 0;
      const after = p.discarded.length;
      if (after <= before) continue;
      const card = p.discarded[after - 1];
      events.push({
        kind: 'cardPlayed',
        playerId: p.playerId,
        role: card?.role ?? '',
        seq,
        isMe: p.playerId === myId,
      });
    }
  }

  // 淘汰：本轮新增的出局者
  const newlyDead = next.eliminatedPlayers.filter((id) => !prev.eliminatedPlayers.includes(id));
  if (newlyDead.length > 0) {
    events.push({ kind: 'eliminated', playerIds: newlyDead, seq });
  }

  // 侍女庇护：本轮新增的受保护者
  const newlyProtected = next.protectedPlayers.filter((id) => !prev.protectedPlayers.includes(id));
  if (newlyProtected.length > 0) {
    events.push({ kind: 'protected', playerIds: newlyProtected });
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
    events.push({ kind: 'gameOver' });
  }

  return events;
}
