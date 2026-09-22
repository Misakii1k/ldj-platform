/**
 * 谁是卧底演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 交棒、开票、淘汰一律看 currentSpeakerId / phase / players[].alive 的变化，
 * 而不是看用户点了按钮。
 */
import type { UndercoverPlayerView } from '../../types.ts';

export type StageEvent =
  /** 词条揭晓：身份卡翻面 */
  | { kind: 'wordRevealed'; round: number }
  /** 交棒：聚光灯移到下一位 */
  | { kind: 'speakerAdvanced'; round: number; index: number; to: string; isMe: boolean }
  /** 进入投票 */
  | { kind: 'votingStarted'; round: number; runoff: boolean }
  /** 开票：票从各席位飞到被票出者 */
  | { kind: 'voteResolved'; round: number; eliminatedId: string | null; voterIds: string[] }
  /** 淘汰落定：该席位灰掉并翻出身份 */
  | { kind: 'eliminated'; round: number; playerIds: string[] }
  /** 新一轮 */
  | { kind: 'roundStarted'; round: number }
  /** 终局 */
  | { kind: 'gameOver' };

/**
 * 一次性演出的去重键。
 * 返回 null 表示每次都播（纯音效、无时间线的轻量反馈）。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'wordRevealed':
      return `word:${event.round}`;
    case 'speakerAdvanced':
      return `speaker:${event.round}:${event.index}`;
    case 'voteResolved':
      return `vote:${event.round}`;
    case 'eliminated':
      return `out:${event.round}`;
    case 'roundStarted':
      return `round:${event.round}`;
    case 'gameOver':
      return 'over';
    case 'votingStarted':
      return null;
  }
}

/** 本轮标识：轮次变化即换轮，用它隔离播放记忆。 */
export function roundTokenOf(view: UndercoverPlayerView): string {
  return `uc:${view.round}`;
}

export function deriveStageEvents(
  prev: UndercoverPlayerView,
  next: UndercoverPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];
  const myId = next.me?.playerId ?? null;

  if (next.round > prev.round) {
    events.push({ kind: 'roundStarted', round: next.round });
  }

  if (prev.phase !== 'word_reveal' && next.phase === 'word_reveal') {
    events.push({ kind: 'wordRevealed', round: next.round });
  }

  // 交棒：发言人变化且仍在发言阶段
  if (
    next.phase === 'speaking' &&
    next.currentSpeakerId !== null &&
    prev.currentSpeakerId !== next.currentSpeakerId
  ) {
    const index = next.speakingOrder.findIndex((id) => id === next.currentSpeakerId);
    events.push({
      kind: 'speakerAdvanced',
      round: next.round,
      index: index < 0 ? 0 : index,
      to: next.currentSpeakerId,
      isMe: next.currentSpeakerId === myId,
    });
  }

  const isVoting = (p: UndercoverPlayerView['phase']) => p === 'voting' || p === 'runoff_voting';
  if (!isVoting(prev.phase) && isVoting(next.phase)) {
    events.push({ kind: 'votingStarted', round: next.round, runoff: next.phase === 'runoff_voting' });
  }

  // 开票：进入结果阶段。被票出者是本轮新增的非存活者。
  if (prev.phase !== 'vote_result' && next.phase === 'vote_result') {
    const newlyDead = next.players
      .filter((p) => !p.alive && prev.players.find((q) => q.playerId === p.playerId)?.alive !== false)
      .map((p) => p.playerId);
    events.push({
      kind: 'voteResolved',
      round: prev.round,
      eliminatedId: newlyDead[0] ?? null,
      // 投票者取仍存活的人（开票那一刻还没灰掉的）
      voterIds: prev.players.filter((p) => p.alive).map((p) => p.playerId),
    });
    if (newlyDead.length > 0) {
      events.push({ kind: 'eliminated', round: prev.round, playerIds: newlyDead });
    }
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}
