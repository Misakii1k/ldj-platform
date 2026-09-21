/**
 * 演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 提交估数、保存下注是否被接受，一律看 me.submittedGuess / betRevision 的变化，
 * 而不是看用户点了按钮。
 */
import type {
  BetPairView,
  ChipId,
  PlayerRoundLedgerView,
  TargetId,
  WitsWagersPlayerView,
} from '../types.ts';

export type StageEvent =
  /** 换轮：清桌、收手、丢弃上一轮的演出记忆 */
  | { kind: 'roundReset'; round: number }
  /** 我的估数被服务端接受：手把背面牌推上桌 */
  | { kind: 'guessAccepted'; round: number; revision: number }
  /** 其他人交牌：座位徽章与桌面背面牌数 +1 */
  | { kind: 'otherSubmitted'; playerIds: string[] }
  /** 版图揭晓：收拢、归位、逐张翻面 */
  | { kind: 'boardRevealed'; round: number; phaseEpoch: number; targetIds: TargetId[] }
  /** 我的下注被接受：手放置/拿回/移动筹码 */
  | { kind: 'myBetsAccepted'; round: number; revision: number; moves: ChipMove[] }
  /** 他人下注变化：筹码无手飞入 */
  | { kind: 'publicBetsChanged'; playerIds: string[] }
  /** 正确答案揭晓：高亮获胜槽位（等距双胜时两个，作废轮为空） */
  | { kind: 'winningRevealed'; round: number; winningTargetIds: TargetId[] }
  /** 银行收付：先收后派，按账本逐笔 */
  | { kind: 'settlementLedger'; round: number; ledger: PlayerRoundLedgerView[] }
  /** 终局 */
  | { kind: 'gameOver' };

export type ChipMove =
  | { type: 'place'; chipId: ChipId; to: TargetId; extraStake: number }
  | { type: 'pickUp'; chipId: ChipId; from: TargetId }
  | { type: 'move'; chipId: ChipId; from: TargetId; to: TargetId; extraStake: number }
  | { type: 'restake'; chipId: ChipId; at: TargetId; from: number; to: number };

/** 比较两份下注，得出手该做哪些动作。 */
export function diffBets(before: BetPairView | null, after: BetPairView): ChipMove[] {
  const moves: ChipMove[] = [];

  (['A', 'B'] as const).forEach((chipId) => {
    const index = chipId === 'A' ? 0 : 1;
    const prev = before?.[index] ?? null;
    const next = after[index];

    const prevTarget = prev?.targetId ?? null;
    const nextTarget = next.targetId;

    if (prevTarget === nextTarget) {
      if (nextTarget !== null && prev && prev.extraStake !== next.extraStake) {
        moves.push({
          type: 'restake',
          chipId,
          at: nextTarget,
          from: prev.extraStake,
          to: next.extraStake,
        });
      }
      return;
    }

    if (prevTarget === null && nextTarget !== null) {
      moves.push({ type: 'place', chipId, to: nextTarget, extraStake: next.extraStake });
      return;
    }

    if (prevTarget !== null && nextTarget === null) {
      moves.push({ type: 'pickUp', chipId, from: prevTarget });
      return;
    }

    if (prevTarget !== null && nextTarget !== null) {
      moves.push({
        type: 'move',
        chipId,
        from: prevTarget,
        to: nextTarget,
        extraStake: next.extraStake,
      });
    }
  });

  return moves;
}

function submittedIds(view: WitsWagersPlayerView): Set<string> {
  return new Set(view.players.filter((p) => p.hasSubmitted).map((p) => p.playerId));
}

function betsSignature(bets: BetPairView | undefined): string {
  if (!bets) return '-';
  return bets.map((chip) => `${chip.targetId ?? 'none'}@${chip.extraStake}`).join('|');
}

/**
 * 推导从 prev 到 next 应当播放的事件序列。
 *
 * prev 为 null 表示首帧（含刷新重连）：此时不推导任何演出，
 * 调用方应直接落终态，否则重连会把上一笔派奖重演一遍。
 */
export function deriveStageEvents(
  prev: WitsWagersPlayerView | null,
  next: WitsWagersPlayerView,
): StageEvent[] {
  if (prev === null) return [];

  const events: StageEvent[] = [];

  // 换轮：先清桌，后续事件在新一轮的语境里演
  if (prev.roundToken !== next.roundToken) {
    events.push({ kind: 'roundReset', round: next.round });
  }

  const sameRound = prev.roundToken === next.roundToken;

  // 我的估数被接受
  const prevGuess = prev.me?.submittedGuess ?? null;
  const nextGuess = next.me?.submittedGuess ?? null;
  const prevGuessRev = prev.me?.guessRevision ?? 0;
  const nextGuessRev = next.me?.guessRevision ?? 0;
  if (nextGuess !== null && (prevGuess === null || nextGuessRev > prevGuessRev || !sameRound)) {
    events.push({ kind: 'guessAccepted', round: next.round, revision: nextGuessRev });
  }

  // 其他人交牌（只用公开的 hasSubmitted，不碰任何人的数值）
  if (sameRound) {
    const before = submittedIds(prev);
    const newlySubmitted = [...submittedIds(next)].filter(
      (id) => !before.has(id) && id !== next.me?.playerId,
    );
    if (newlySubmitted.length > 0) {
      events.push({ kind: 'otherSubmitted', playerIds: newlySubmitted });
    }
  }

  // 版图揭晓：从无版图到有版图
  if (prev.board.length === 0 && next.board.length > 0) {
    events.push({
      kind: 'boardRevealed',
      round: next.round,
      phaseEpoch: next.phaseEpoch,
      targetIds: next.board.map((t) => t.id),
    });
  }

  // 我的下注被接受
  const prevBetRev = prev.me?.betRevision ?? 0;
  const nextBetRev = next.me?.betRevision ?? 0;
  if (sameRound && next.me && nextBetRev > prevBetRev) {
    events.push({
      kind: 'myBetsAccepted',
      round: next.round,
      revision: nextBetRev,
      moves: diffBets(prev.me?.acceptedBets ?? null, next.me.acceptedBets),
    });
  }

  // 他人下注变化
  if (sameRound) {
    const changed = Object.keys(next.publicBets).filter(
      (playerId) =>
        playerId !== next.me?.playerId &&
        betsSignature(prev.publicBets[playerId]) !== betsSignature(next.publicBets[playerId]),
    );
    if (changed.length > 0) {
      events.push({ kind: 'publicBetsChanged', playerIds: changed });
    }
  }

  // 揭晓与收付：revealed 从无到有（或换到新一轮的结算）
  const prevRevealedRound = prev.revealed?.round ?? null;
  const nextRevealed = next.revealed;
  if (nextRevealed && prevRevealedRound !== nextRevealed.round) {
    events.push({
      kind: 'winningRevealed',
      round: nextRevealed.round,
      winningTargetIds: nextRevealed.winningTargetIds,
    });
    events.push({
      kind: 'settlementLedger',
      round: nextRevealed.round,
      ledger: nextRevealed.ledger,
    });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}

/**
 * 一次性演出的去重键。同一 round + phaseEpoch 只演一次，
 * 刷新重连或 React 重复渲染都不会重播。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'boardRevealed':
      return `board:${event.round}:${event.phaseEpoch}`;
    case 'settlementLedger':
      return `settle:${event.round}`;
    case 'winningRevealed':
      return `reveal:${event.round}`;
    case 'guessAccepted':
      return `guess:${event.round}:${event.revision}`;
    case 'myBetsAccepted':
      return `bets:${event.round}:${event.revision}`;
    default:
      // roundReset / otherSubmitted / publicBetsChanged / gameOver
      // 是可以重复播放的轻量反馈，不占用记忆
      return null;
  }
}
