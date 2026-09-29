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

  // 单轮结算：答案在黄铜牌匾（WitsAnswerPlaque）、分数落在席位卡上（X06，A2 结构），
  // 账本列表不再重复渲染；推进由服务端计时器驱动（下一轮自动开始，无本地按钮可沿用）。
  return (
    <div className="ww-result-panel ww-result-panel--bare">
      <div className="ww-result-panel__waiting">排牌结算完毕，即将进入下一轮…</div>
    </div>
  );
}
