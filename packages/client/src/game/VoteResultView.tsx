/** 投票结果：以票数筹码和身份档案展示本轮结论。 */
import type { CSSProperties } from 'react';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView, PublicPlayerInfo, VoteSummary } from './types.ts';

interface Props { view: UndercoverPlayerView; }
function outcomeText(summary: VoteSummary): string {
  switch (summary.outcome) {
    case 'eliminated': return summary.eliminatedRole === 'undercover' ? '卧底被找到了' : '平民被误伤';
    case 'tie': return '票数相同，进入加赛';
    case 'no_votes': return '无人投票，本轮平安';
    case 'runoff_tie': return '加赛仍平票，无人淘汰';
    default: return '结果未知';
  }
}

export function VoteResultView({ view }: Props) {
  const summary = view.lastVoteSummary;
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map<string, PublicPlayerInfo>();
  for (const player of view.players) playerMap.set(player.playerId, player);
  if (summary === null) return <section className="game-phase vote-result"><div className="game-waiting-card"><strong>正在统计票数</strong><p>请稍候，结果马上揭晓。</p></div></section>;
  const eliminatedPlayer = summary.eliminatedPlayerId !== null ? playerMap.get(summary.eliminatedPlayerId) : null;
  const sortedTally = Object.entries(summary.tally).sort(([, left], [, right]) => right - left);
  const maxVotes = Math.max(...sortedTally.map(([, count]) => count), 1);

  return (
    <section className="game-phase vote-result">
      <PhaseLead eyebrow={`ROUND ${summary.round} · RESULT`} title="本轮投票结果" description={summary.kind === 'runoff' ? '这是加赛投票的最终统计。' : '所有公开票数已完成统计。'} />
      <div className={`result-banner ${summary.outcome}`}>
        <span className="result-seal" aria-hidden="true">{summary.outcome === 'eliminated' ? '!' : '='}</span>
        <div><strong>{outcomeText(summary)}</strong><span>{eliminatedPlayer ? `#${eliminatedPlayer.seat} 玩家离场` : '进入下一阶段'}</span></div>
      </div>

      {eliminatedPlayer && (
        <div className="eliminated-info">
          <span className="eliminated-avatar" aria-hidden="true" />
          <div><span>身份档案</span><strong>#{eliminatedPlayer.seat} · {summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}</strong></div>
          <span className={`role-badge ${summary.eliminatedRole ?? ''}`}>{summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}</span>
        </div>
      )}

      {sortedTally.length > 0 && (
        <div className="tally-box">
          <div className="section-heading-row"><div><span className="section-kicker">公开票型</span><h3>本轮票数</h3></div><span className="section-count">{sortedTally.reduce((sum, [, count]) => sum + count, 0)} 票</span></div>
          <ul className="tally-list">
            {sortedTally.map(([playerId, count], index) => {
              const player = playerMap.get(playerId);
              return <li key={playerId} className="tally-item" style={{ '--stagger-index': index } as CSSProperties}><span className="tally-player">#{player?.seat ?? '?'}<small>玩家 {player?.seat ?? '?'}</small></span><span className="tally-bar"><i style={{ '--fill-percent': `${count / maxVotes * 100}%` } as CSSProperties} /></span><strong className="tally-count">{count} 票</strong></li>;
            })}
          </ul>
        </div>
      )}
      {countdown.secondsLeft > 0 && <div className="countdown-hint"><span className="waiting-dot" />{countdown.secondsLeft} 秒后自动继续</div>}
    </section>
  );
}
