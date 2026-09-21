import { nameFor, type MemberLike } from '../useGameAction.ts';
import type { RoundResultView, FinalResultView } from './types.ts';

export interface ResultPanelProps {
  revealed: RoundResultView | null;
  result: FinalResultView | null;
  myPlayerId?: string | null;
  members?: readonly MemberLike[];
  onReturnToLobby?: () => void;
}

export function ResultPanel({
  revealed,
  result,
  myPlayerId = null,
  members = [],
  onReturnToLobby,
}: ResultPanelProps) {
  if (result) {
    // 终局结算展示
    return (
      <div className="ww-result-panel">
        <div className="ww-result-panel__final-head">
          <h2>对局结束 · 最终排名</h2>
          <div className="ww-result-panel__champion">
            冠军：{result.winners.map((id) => nameFor(members, id)).join('、')}
          </div>
        </div>

        <table className="ww-result-panel__ledger-table">
          <thead>
            <tr>
              <th>名次</th>
              <th>玩家</th>
              <th>最终积分</th>
              <th>获胜估数次数</th>
            </tr>
          </thead>
          <tbody>
            {result.rankings.map((r) => {
              const isWinner = result.winners.includes(r.playerId);
              const isMe = r.playerId === myPlayerId;
              const rowClass = [
                isWinner ? 'ww-result-row--winner' : '',
                isMe ? 'ww-result-row--me' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={r.playerId} className={rowClass || undefined}>
                  <td>第 {r.rank} 名</td>
                  <td>
                    {nameFor(members, r.playerId)}
                    {isMe ? '（我）' : ''}
                  </td>
                  <td>{r.score} 分</td>
                  <td>{r.winningGuesses} 次</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {onReturnToLobby && (
          <div className="ww-result-panel__actions">
            <button type="button" className="ww-btn ww-btn--primary" onClick={onReturnToLobby}>
              返回房间大厅
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!revealed) {
    return <div className="ww-result-panel__waiting">正在等待结算公布…</div>;
  }

  // 单轮结算展示
  const q = revealed.question;
  const myLedger = revealed.ledger.find((l) => l.playerId === myPlayerId);
  const winningTarget = revealed.board.find((t) => t.id === revealed.winningTargetId);

  return (
    <div className="ww-result-panel">
      {/* 正确答案与题目揭晓 */}
      <div className="ww-result-panel__correct-box">
        <div className="ww-result-panel__round-tag">第 {revealed.round} 轮正确答案</div>
        <div className="ww-result-panel__answer">
          {q.answer.toLocaleString()} {q.unit}
        </div>
        <div className="ww-result-panel__winning">
          获胜槽位：
          <span>
            {winningTarget?.id === 'smaller' ? '全部猜高' : winningTarget?.value?.toLocaleString()}{' '}
            (净赢 ×{winningTarget?.odds})
          </span>
        </div>
        <div className="ww-result-panel__note">
          {q.explanation}（出处：{q.sourceNote}）
        </div>
      </div>

      {/* 我的账本明细 */}
      {myLedger && (
        <div className="ww-result-panel__my-ledger">
          <div className="ww-result-panel__my-ledger-title">我的本轮账本</div>
          <div className="ww-result-panel__my-ledger-row">
            <span>结算前积分：{myLedger.scoreBefore}</span>
            <span>
              押中净收益：
              <span className={myLedger.winProfit > 0 ? 'ww-diff-pos' : undefined}>
                +{myLedger.winProfit}
              </span>
            </span>
            <span>
              失败损失：
              <span className={myLedger.loss > 0 ? 'ww-diff-neg' : undefined}>-{myLedger.loss}</span>
            </span>
            <span>
              作者奖励：
              <span className={myLedger.authorBonus > 0 ? 'ww-diff-pos' : undefined}>
                +{myLedger.authorBonus}
              </span>
            </span>
            <span>
              结算后积分：<strong>{myLedger.scoreAfter}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 全员结算简表 */}
      <div>
        <div className="ww-result-panel__table-title">全员结算</div>
        <table className="ww-result-panel__ledger-table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>前积分</th>
              <th>收益</th>
              <th>亏损</th>
              <th>作者奖</th>
              <th>后积分</th>
            </tr>
          </thead>
          <tbody>
            {revealed.ledger.map((l) => (
              <tr key={l.playerId} className={l.playerId === myPlayerId ? 'ww-result-row--me' : undefined}>
                <td>
                  {nameFor(members, l.playerId)}
                  {l.playerId === myPlayerId ? '（我）' : ''}
                </td>
                <td>{l.scoreBefore}</td>
                <td className={l.winProfit > 0 ? 'ww-diff-pos' : undefined}>+{l.winProfit}</td>
                <td className={l.loss > 0 ? 'ww-diff-neg' : undefined}>-{l.loss}</td>
                <td className={l.authorBonus > 0 ? 'ww-diff-pos' : undefined}>+{l.authorBonus}</td>
                <td>
                  <strong>{l.scoreAfter}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
