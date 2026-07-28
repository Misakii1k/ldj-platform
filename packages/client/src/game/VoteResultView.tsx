/**
 * 投票结果视图（Task 3）：展示 lastVoteSummary 摘要 + 倒计时提示。
 * outcome: eliminated / tie / no_votes / runoff_tie
 */
import { useCountdown } from '../shared-ui/useCountdown.ts';
import type { UndercoverPlayerView, PublicPlayerInfo, VoteSummary } from './types.ts';

interface Props {
  view: UndercoverPlayerView;
}

function outcomeText(s: VoteSummary): string {
  switch (s.outcome) {
    case 'eliminated':
      return s.eliminatedRole === 'undercover' ? '卧底被淘汰' : '平民被淘汰';
    case 'tie':
      return '平票，进入加赛';
    case 'no_votes':
      return '无人投票，本轮无人淘汰';
    case 'runoff_tie':
      return '加赛仍平票，本轮无人淘汰';
    default:
      return '结果未知';
  }
}

export function VoteResultView({ view }: Props) {
  const summary = view.lastVoteSummary;
  const countdown = useCountdown(view.deadlineAt);

  const playerMap = new Map<string, PublicPlayerInfo>();
  for (const p of view.players) playerMap.set(p.playerId, p);

  if (summary === null) {
    return (
      <section className="game-phase vote-result">
        <h2>投票结果</h2>
        <p>等待结果…</p>
      </section>
    );
  }

  const eliminatedPlayer =
    summary.eliminatedPlayerId !== null ? playerMap.get(summary.eliminatedPlayerId) : null;

  return (
    <section className="game-phase vote-result">
      <h2>第 {summary.round} 轮 · 投票结果{summary.kind === 'runoff' ? '（加赛）' : ''}</h2>

      <div className={`result-banner ${summary.outcome}`}>
        {outcomeText(summary)}
      </div>

      {eliminatedPlayer && (
        <div className="eliminated-info">
          <span className="eliminated-seat">#{eliminatedPlayer.seat}</span>
          <span className="eliminated-role">
            身份：{summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}
          </span>
        </div>
      )}

      {Object.keys(summary.tally).length > 0 && (
        <div className="tally-box">
          <h3>票数</h3>
          <ul className="tally-list">
            {Object.entries(summary.tally)
              .sort(([, a], [, b]) => b - a)
              .map(([pid, count]) => {
                const p = playerMap.get(pid);
                return (
                  <li key={pid} className="tally-item">
                    <span>#{p?.seat ?? '?'}</span>
                    <span className="tally-count">{count} 票</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {countdown.secondsLeft > 0 && (
        <div className="countdown-hint">{countdown.secondsLeft} 秒后继续</div>
      )}
    </section>
  );
}
