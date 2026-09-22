/**
 * 以鹅传鹅演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 传递是否到位、指认是否对，一律看 currentIndex / accusations 的变化，
 * 而不是看用户点了按钮。
 */
import type { GooseRelayPlayerView } from '../types.ts';

export type StageEvent =
  /** 头鹅诞生：队首确定 */
  | { kind: 'headClaimed'; playerId: string; isMe: boolean }
  /** 案情卡选定：传递轨道亮起 */
  | { kind: 'caseLocked' }
  /** 传递到位：鹅卡沿轨道飞到下一棒，接收席位光晕 */
  | { kind: 'relayPassed'; fromIndex: number; toIndex: number; toPlayerId: string; isMeNext: boolean }
  /** 传递完成，进入讨论 */
  | { kind: 'relayFinished' }
  /** 进入指认 */
  | { kind: 'accusationStarted' }
  /** 一次指认落定：对/错的印章 */
  | { kind: 'accusationMade'; playerId: string; correct: boolean; seq: number }
  /** 进入投票 */
  | { kind: 'voteStarted' }
  /** 终局：鹅群列队 */
  | { kind: 'gameOver'; winners: string[] };

/**
 * 一次性演出的去重键。
 * 返回 null 表示每次都播（纯音效、无时间线的轻量反馈）。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'headClaimed':
      return `head:${event.playerId}`;
    case 'caseLocked':
      return 'case';
    case 'relayPassed':
      return `relay:${event.toIndex}`;
    case 'accusationMade':
      return `accuse:${event.seq}`;
    case 'gameOver':
      return 'over';
    // 阶段切换只有静态表现，不占播放记忆
    case 'relayFinished':
    case 'accusationStarted':
    case 'voteStarted':
      return null;
  }
}

/** 本轮标识：一局一轮，用队序做 token 即可隔离刷新。 */
export function roundTokenOf(view: GooseRelayPlayerView): string {
  return `gr:${view.lineOrder.join(',') || view.players.join(',')}`;
}

export function deriveStageEvents(
  prev: GooseRelayPlayerView,
  next: GooseRelayPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  // 头鹅诞生
  if (prev.headPlayerId === null && next.headPlayerId !== null) {
    events.push({
      kind: 'headClaimed',
      playerId: next.headPlayerId,
      isMe: next.headPlayerId === myId,
    });
  }

  // 案情选定：从选卡进入传递
  if (prev.phase === 'pick_cards' && next.phase === 'relay') {
    events.push({ kind: 'caseLocked' });
  }

  // 传递到位：棒次推进
  if (next.phase === 'relay' && next.currentIndex > prev.currentIndex) {
    const toPlayerId = next.lineOrder[next.currentIndex] ?? '';
    events.push({
      kind: 'relayPassed',
      fromIndex: prev.currentIndex,
      toIndex: next.currentIndex,
      toPlayerId,
      isMeNext: toPlayerId === myId,
    });
  }

  if (prev.phase === 'relay' && next.phase === 'discussion') {
    events.push({ kind: 'relayFinished' });
  }

  if (prev.phase !== 'accusation' && next.phase === 'accusation') {
    events.push({ kind: 'accusationStarted' });
  }

  // 指认落定：accusations 数组增长
  if (next.accusations.length > prev.accusations.length) {
    for (let i = prev.accusations.length; i < next.accusations.length; i += 1) {
      const a = next.accusations[i]!;
      events.push({ kind: 'accusationMade', playerId: a.playerId, correct: a.correct, seq: i });
    }
  }

  if (prev.phase !== 'vote' && next.phase === 'vote') {
    events.push({ kind: 'voteStarted' });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver', winners: [...(next.winners ?? [])] });
  }

  return events;
}
