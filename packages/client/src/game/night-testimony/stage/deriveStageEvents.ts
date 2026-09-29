/**
 * 囚徒之夜演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 便签是否入板、票是否落下，一律看 history / accusedId 的变化，
 * 而不是看用户点了按钮。
 */
import type { NightTestimonyPlayerView, QuestionRecord } from '../types.ts';

export type StageEvent =
  /** 一道题全员答完：当前题同时翻开、YES 红章飞回档案袋、审讯单随后归档。
   *  record 带着归档后的完整问答，演出靠它翻出 YES / NO（此时答案已公开）。 */
  | { kind: 'docketPinned'; questionIndex: number; yesCount: number; record: QuestionRecord }
  /** 新题广播：便签翻到正面摊在焦点位 */
  | { kind: 'questionAsked'; questionIndex: number }
  /** 有人自告：席位翻牌公开身份 */
  | { kind: 'identityExposed'; playerIds: string[] }
  /** 进入投票：暗角压下 */
  | { kind: 'voteStarted' }
  /** 开票：选票落下、被票出的档案袋被抽到桌中央拆封 */
  | { kind: 'voteResolved'; accusedId: string; voterIds: string[] }
  /** 狱警猜罪开场 */
  | { kind: 'guessingStarted' }
  /** 狱警提交猜罪：逐袋核对 ✔ / ✘（wardenGuesses 由 null 变为有值） */
  | { kind: 'guessesRevealed' }
  /** 终局 */
  | { kind: 'gameOver' };

/**
 * 一次性演出的去重键。
 *
 * 返回 null 表示每次都播（纯音效、无时间线的轻量反馈）。
 * 带键的事件按 roundToken 隔离，开播即写记忆，演到一半刷新也不会重播。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'docketPinned':
      return `docket:${event.questionIndex}`;
    case 'questionAsked':
      return `ask:${event.questionIndex}`;
    case 'voteResolved':
      return `vote:${event.accusedId}`;
    case 'guessingStarted':
      return 'guessing';
    case 'guessesRevealed':
      return 'guesses-revealed';
    case 'gameOver':
      return 'over';
    // 自告与进入投票只有音效与静态表现，不占播放记忆
    case 'identityExposed':
    case 'voteStarted':
      return null;
  }
}

/** 本轮标识：一局之内不换轮，用局内进度做 token 即可隔离刷新。 */
export function roundTokenOf(view: NightTestimonyPlayerView): string {
  return `nt:${view.players.join(',')}:${view.questionLimit}`;
}

export function deriveStageEvents(
  prev: NightTestimonyPlayerView,
  next: NightTestimonyPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];

  // 便签入板：history 长度增长即代表上一题全员答完并归档
  if (next.history.length > prev.history.length) {
    for (let i = prev.history.length; i < next.history.length; i += 1) {
      const record = next.history[i]!;
      const yesCount = Object.values(record.answers).filter((a) => a === 'yes').length;
      events.push({ kind: 'docketPinned', questionIndex: record.questionIndex, yesCount, record });
    }
  }

  // 新题广播：从无当前题到有，且题号推进
  if (
    next.currentQuestion !== null &&
    (prev.currentQuestion === null || prev.currentQuestion.questionIndex !== next.currentQuestion.questionIndex)
  ) {
    events.push({ kind: 'questionAsked', questionIndex: next.currentQuestion.questionIndex });
  }

  // 自告：revealedIdentities 新增的键
  const newlyExposed = Object.keys(next.revealedIdentities).filter(
    (id) => prev.revealedIdentities[id] === undefined,
  );
  if (newlyExposed.length > 0) {
    events.push({ kind: 'identityExposed', playerIds: newlyExposed });
  }

  // 进入投票
  if (prev.phase !== 'vote' && next.phase === 'vote') {
    events.push({ kind: 'voteStarted' });
  }

  // 开票：accusedId 从无到有。投票者取开票那一刻的已投名单，
  // 服务端在结算后不会再改它，所以用 next 的快照是稳的。
  if (prev.accusedId === null && next.accusedId !== null) {
    events.push({
      kind: 'voteResolved',
      accusedId: next.accusedId,
      voterIds: [...next.votedPlayerIds],
    });
  }

  if (!prev.guessingInProgress && next.guessingInProgress) {
    events.push({ kind: 'guessingStarted' });
  }

  // 狱警提交猜罪：核对结果随 reveal.wardenGuesses 一起下发
  if ((prev.reveal?.wardenGuesses ?? null) === null && (next.reveal?.wardenGuesses ?? null) !== null) {
    events.push({ kind: 'guessesRevealed' });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}
