import type { RefObject } from 'react';
import { GameDrawer } from '../../tabletop/GameDrawer.tsx';
import { nameFor, type MemberLike } from '../../useGameAction.ts';
import type { RoundResultView } from '../types.ts';

export interface WitsHistoryDrawerProps {
  readonly history: readonly RoundResultView[];
  readonly members: readonly MemberLike[];
  readonly myPlayerId: string | null;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

function formatDelta(delta: number): string {
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : String(delta);
}

export function WitsHistoryDrawer({
  history,
  members,
  myPlayerId,
  triggerRef,
  onClose,
}: WitsHistoryDrawerProps) {
  // 最近一轮排在最前，回看时不用一路滚到底
  const rounds = [...history].reverse();

  return (
    <GameDrawer
      kind="log"
      title="历史回顾"
      triggerRef={triggerRef}
      onClose={onClose}
      className="ww-history-drawer"
    >
      {rounds.length === 0 && <p className="ww-history__empty">还没有已结算的轮次。</p>}

      {rounds.map((round) => {
        const winning = round.board.find((t) => t.id === round.winningTargetId);
        const winningLabel =
          winning?.id === 'smaller' ? '全部猜高' : (winning?.value?.toLocaleString() ?? '—');

        return (
          <section key={round.round} className="ww-history__round">
            <header className="ww-history__head">
              <span className="ww-history__round-no">第 {round.round} 轮</span>
              <span className="ww-history__answer">
                正确答案 {round.question.answer.toLocaleString()} {round.question.unit}
              </span>
            </header>

            <p className="ww-history__prompt">{round.question.prompt}</p>

            <p className="ww-history__winner">
              获胜槽位：<strong>{winningLabel}</strong>
              {winning ? `（净赢 ×${winning.odds}）` : ''}
              {round.awardedAuthors.length > 0 && (
                <>
                  ，作者奖励：{round.awardedAuthors.map((id) => nameFor(members, id)).join('、')}
                </>
              )}
            </p>

            {round.question.explanation && (
              <p className="ww-history__note">
                {round.question.explanation}
                {round.question.sourceNote ? `（出处：${round.question.sourceNote}`: ''}
                {round.question.sourceNote && round.question.asOf ? ` · ${round.question.asOf}` : ''}
                {round.question.sourceNote ? '）' : ''}
              </p>
            )}

            {round.question.sourceUrl && (
              <p className="ww-history__source">
                <a href={round.question.sourceUrl} target="_blank" rel="noreferrer noopener">
                  查看数据来源
                </a>
              </p>
            )}

            <table className="ww-history__table">
              <thead>
                <tr>
                  <th>玩家</th>
                  <th>押中</th>
                  <th>亏损</th>
                  <th>作者奖</th>
                  <th>结余</th>
                </tr>
              </thead>
              <tbody>
                {round.ledger.map((entry) => {
                  const isMe = entry.playerId === myPlayerId;
                  return (
                    <tr key={entry.playerId} className={isMe ? 'ww-history__row--me' : undefined}>
                      <td>
                        {nameFor(members, entry.playerId)}
                        {isMe ? '（我）' : ''}
                      </td>
                      <td className={entry.winProfit > 0 ? 'ww-diff-pos' : undefined}>
                        +{entry.winProfit}
                      </td>
                      <td className={entry.loss > 0 ? 'ww-diff-neg' : undefined}>-{entry.loss}</td>
                      <td className={entry.authorBonus > 0 ? 'ww-diff-pos' : undefined}>
                        +{entry.authorBonus}
                      </td>
                      <td>
                        <strong>{entry.scoreAfter}</strong>
                        <span className="ww-history__delta">
                          {' '}
                          ({formatDelta(entry.scoreAfter - entry.scoreBefore)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </GameDrawer>
  );
}
