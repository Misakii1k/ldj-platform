/**
 * 伪人测试演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 交棒、宣判是否发生，一律看 currentSpeakerId / accusations 的变化，
 * 而不是看用户点了按钮。
 */
import type { EchoJudgeLastVerdict, EchoJudgePlayerView } from '../types.ts';

export type StageEvent =
  /** 考题公开：卷宗摊开在判词台上 */
  | { kind: 'topicRevealed'; round: number }
  /** 交棒：话筒从旧发言人飞到新发言人 */
  | { kind: 'speakerAdvanced'; round: number; answeredCount: number; from: string | null; to: string }
  /** 进入审判：暗角压下，木槌上台 */
  | { kind: 'judgmentStarted'; round: number }
  /** 宣判：木槌敲下、被指认者翻面、漏网伪人浮出、分数滚动（数据取自 lastVerdict 快照） */
  | {
      kind: 'verdictDelivered';
      round: number;
      judgeId: string;
      accusations: string[];
      caught: string[];
      wrong: string[];
      escaped: string[];
      scoreDelta: Record<string, number>;
    }
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

  // 宣判（T0）：以 lastVerdict 快照为唯一数据源，round 变化即代表新一轮判决产生。
  // 中途轮次 accuse 后阶段立刻进入下一轮 judge_setup，旧的
  // 「accusations null → 数组」判断在 answering → judgment 时会误触发，已废弃。
  if (next.lastVerdict && next.lastVerdict.round !== prev.lastVerdict?.round) {
    events.push({
      kind: 'verdictDelivered',
      round: next.lastVerdict.round,
      judgeId: next.lastVerdict.judgeId,
      accusations: [...next.lastVerdict.accusations],
      caught: [...next.lastVerdict.caught],
      wrong: [...next.lastVerdict.wrong],
      escaped: [...next.lastVerdict.escaped],
      scoreDelta: { ...next.lastVerdict.scoreDelta },
    });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}

/* ── 宣判序列（T5，纯函数可单测） ────────────────────────────── */

export type VerdictFlipKind = 'caught' | 'wrong' | 'escaped';

export interface VerdictFlip {
  readonly id: string;
  readonly kind: VerdictFlipKind;
}

/**
 * 翻面顺序：被指认者按指认顺序先翻（伪人 → 红「伪人」章；人类 → 蓝「人类」章），
 * 随后没被指认的伪人依次浮出（逃脱章）。与 S4-verdict.html 时间线一致。
 */
export function buildVerdictSequence(verdict: EchoJudgeLastVerdict): VerdictFlip[] {
  const flips: VerdictFlip[] = [];
  const caughtSet = new Set(verdict.caught);
  for (const id of verdict.accusations) {
    flips.push({ id, kind: caughtSet.has(id) ? 'caught' : 'wrong' });
  }
  for (const id of verdict.escaped) {
    flips.push({ id, kind: 'escaped' });
  }
  return flips;
}

export interface VerdictBannerSpec {
  readonly kind: 'caught' | 'escaped';
  readonly title: string;
  readonly sub: string;
}

/** 中央告示牌文案（四种情形，与 S4-verdict.html 的 bannerText 对齐） */
export function buildVerdictBanner(verdict: EchoJudgeLastVerdict, nameOf: (id: string) => string): VerdictBannerSpec {
  const { caught, wrong, escaped, accusations } = verdict;
  if (caught.length > 0 && escaped.length === 0) {
    return { kind: 'caught', title: '伪人全部落网！', sub: `抓到 ${caught.map(nameOf).join('、')}` };
  }
  if (caught.length > 0) {
    return {
      kind: 'caught',
      title: `抓到 ${caught.length} 个伪人`,
      sub: `还有 ${escaped.length} 个伪人漏网${wrong.length > 0 ? ` · 冤枉了 ${wrong.length} 个人类` : ''}`,
    };
  }
  if (accusations.length === 0 && escaped.length === 0 && wrong.length === 0) {
    return { kind: 'caught', title: '明察秋毫', sub: '场上本来就没有伪人' };
  }
  if (escaped.length === 0) {
    // 场上本无伪人但冤枉了人（S4 未覆盖的组合，文案保持同一语调）
    return { kind: 'escaped', title: '场上本无伪人', sub: `冤枉了 ${wrong.map(nameOf).join('、')}` };
  }
  return {
    kind: 'escaped',
    title: '伪人全员潜伏成功',
    sub: wrong.length > 0 ? `冤枉了 ${wrong.map(nameOf).join('、')}` : '审判长谁也没指认',
  };
}

export interface VerdictLedgerRowSpec {
  readonly id: string;
  readonly why: string;
  readonly delta: number;
}

/** 账单卡行：审判长一行 + 被抓伪人 + 逃脱伪人（分差取自 lastVerdict.scoreDelta，与服务端计分一致） */
export function buildVerdictLedger(verdict: EchoJudgeLastVerdict): VerdictLedgerRowSpec[] {
  const rows: VerdictLedgerRowSpec[] = [];
  const judgeDelta = verdict.scoreDelta[verdict.judgeId] ?? 0;
  rows.push({ id: verdict.judgeId, why: `抓对 ${verdict.caught.length} · 冤枉 ${verdict.wrong.length}`, delta: judgeDelta });
  for (const id of verdict.caught) {
    rows.push({ id, why: '伪人被抓', delta: verdict.scoreDelta[id] ?? -1 });
  }
  for (const id of verdict.escaped) {
    rows.push({ id, why: '伪人逃脱', delta: verdict.scoreDelta[id] ?? 2 });
  }
  return rows;
}
