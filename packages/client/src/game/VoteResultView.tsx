/** 投票结果：以票数筹码和身份档案展示本轮结论。 */
import type { CSSProperties } from 'react';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView, PublicPlayerInfo, VoteSummary } from './types.ts';

interface Props { view: UndercoverPlayerView; }
function outcomeText(summary: VoteSummary): string {
  switch (summary.outcome) {
    case 'eliminated': return summary.eliminatedRole === 'undercover' ? '众人慧眼如炬！卧底被成功投出' : '抱憾！平民同伴不幸被误伤淘汰';
    case 'tie': return '最高票数相同，即将进入加赛PK';
    case 'no_votes': return '无人投出选票，本轮全员平安';
    case 'runoff_tie': return '加赛依然平票，本轮无人出局';
    default: return '结果结算中';
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
      <PhaseLead eyebrow={`第 ${summary.round} 轮 · 结果揭晓`} title="本轮投票统计" description={summary.kind === 'runoff' ? '此为加赛PK投票的最终统计结果。' : '公开选票已完成精准统计。'} />
      <div className={`result-banner ${summary.outcome}`}>
        <span className="result-seal" aria-hidden="true">{summary.outcome === 'eliminated' ? '!' : '='}</span>
        <div><strong>{outcomeText(summary)}</strong><span>{eliminatedPlayer ? `#${eliminatedPlayer.seat} 号玩家离场` : '准备进入下一阶段'}</span></div>
      </div>

      {eliminatedPlayer && (
        <div className="eliminated-info">
          <span className="eliminated-avatar" aria-hidden="true" />
          <div><span>身份揭晓</span><strong>#{eliminatedPlayer.seat} 号玩家 · {summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}</strong></div>
          <span className={`role-badge ${summary.eliminatedRole ?? ''}`}>{summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}</span>
        </div>
      )}

      {sortedTally.length > 0 && (
        <div className="tally-box">
          <div className="section-heading-row"><div><span className="section-kicker">公开票型</span><h3>得票分布</h3></div><span className="section-count">共 {sortedTally.reduce((sum, [, count]) => sum + count, 0)} 票</span></div>
          <ul className="tally-list">
            {sortedTally.map(([playerId, count], index) => {
              const player = playerMap.get(playerId);
              return <li key={playerId} className="tally-item" style={{ '--stagger-index': index } as CSSProperties}><span className="tally-player">#{player?.seat ?? '?'}<small>玩家 {player?.seat ?? '?'}</small></span><span className="tally-bar"><i style={{ '--fill-percent': `${count / maxVotes * 100}%` } as CSSProperties} /></span><strong className="tally-count">{count} 票</strong></li>;
            })}
          </ul>
        </div>
      )}
      {countdown.secondsLeft > 0 && <div className="countdown-hint"><span className="waiting-dot" />{countdown.secondsLeft} 秒后自动推进下一步</div>}
    </section>
  );
}
