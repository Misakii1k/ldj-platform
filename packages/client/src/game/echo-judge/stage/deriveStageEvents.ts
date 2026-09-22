/**
 * 伪人测试演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 交棒、宣判是否发生，一律看 currentSpeakerId / accusations 的变化，
 * 而不是看用户点了按钮。
 */
import type { EchoJudgePlayerView } from '../types.ts';

export type StageEvent =
  /** 考题公开：卷宗摊开在判词台上 */
  | { kind: 'topicRevealed'; round: number }
  /** 交棒：话筒从旧发言人飞到新发言人 */
  | { kind: 'speakerAdvanced'; round: number; answeredCount: number; from: string | null; to: string }
  /** 进入审判：暗角压下，木槌上台 */
  | { kind: 'judgmentStarted'; round: number }
  /** 宣判：木槌敲下、被指认者揭晓、分数滚动 */
  | { kind: 'verdictDelivered'; round: number; accusations: string[]; caught: string[] }
  /** 新一轮开场 */
  | { kind: 'roundStarted'; round: number }
  /** 终局 */
  | { kind: 'gameOver' };

/**
 * 一次性演出的去重键。
 *
 * 返回 null 表示每次都播（纯音效、无时间线的轻量反馈）。
 * 带键的事件开播即写记忆，演到一半刷新也不会重播。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'topicRevealed':
      return `topic:${event.round}`;
    case 'speakerAdvanced':
      return `speaker:${event.round}:${event.answeredCount}`;
    case 'verdictDelivered':
      return `verdict:${event.round}`;
    case 'roundStarted':
      return `round:${event.round}`;
    case 'gameOver':
      return 'over';
    // 进入审判只有暗角与静态表现，不占播放记忆
    case 'judgmentStarted':
      return null;
  }
}

/** 本轮标识：审判长轮换即换轮，用轮次隔离播放记忆。 */
export function roundTokenOf(view: EchoJudgePlayerView): string {
  return `ej:${view.round}`;
}

export function deriveStageEvents(
  prev: EchoJudgePlayerView,
  next: EchoJudgePlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];

  // 新一轮：审判长换人，清台
  if (next.round > prev.round) {
    events.push({ kind: 'roundStarted', round: next.round });
  }

  // 考题公开：从出题阶段进入发言阶段
  if (prev.phase === 'judge_setup' && next.phase === 'answering') {
    events.push({ kind: 'topicRevealed', round: next.round });
  }

  // 交棒：发言人变化且仍在发言阶段
  if (
    next.phase === 'answering' &&
    next.currentSpeakerId !== null &&
    prev.currentSpeakerId !== next.currentSpeakerId
  ) {
    events.push({
      kind: 'speakerAdvanced',
      round: next.round,
      answeredCount: next.answeredCount,
      from: prev.currentSpeakerId,
      to: next.currentSpeakerId,
    });
  }

  // 进入审判
  if (prev.phase !== 'judgment' && next.phase === 'judgment') {
    events.push({ kind: 'judgmentStarted', round: next.round });
  }

  // 宣判：accusations 从 null 变成数组即代表审判长已提交
  // （空数组也算提交——判定全员人类）
  if (prev.accusations === null && next.accusations !== null) {
    events.push({
      kind: 'verdictDelivered',
      round: prev.round,
      accusations: [...next.accusations],
      caught: [...(next.caughtImpostors ?? [])],
    });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}
