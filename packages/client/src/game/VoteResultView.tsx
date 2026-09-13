/** 投票结果：结论印章、出局档案与公开票型。 */
import type { CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { PhaseLead, GameCountdown } from './GameChrome.tsx';
import { nameFor } from './useGameAction.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import type { UndercoverPlayerView, PublicPlayerInfo, VoteSummary } from './types.ts';

interface Props { view: UndercoverPlayerView; }

function outcomeText(summary: VoteSummary): string {
  switch (summary.outcome) {
    case 'eliminated': return summary.eliminatedRole === 'undercover' ? '众人慧眼如炬，卧底被投出！' : '抱憾，平民同伴被误伤淘汰';
    case 'tie': return '最高票平票，进入加赛对决';
    case 'no_votes': return '本轮无人投票，全员平安';
    case 'runoff_tie': return '加赛依然平票，本轮无人出局';
    default: return '结果结算中';
  }
}

export function VoteResultView({ view }: Props) {
  const { state } = useConnection();
  const summary = view.lastVoteSummary;
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map<string, PublicPlayerInfo>();
  for (const player of view.players ?? []) playerMap.set(player.playerId, player);
  const members = state.room?.members ?? [];

  if (summary === null) {
    return (
      <section className="game-phase vote-result uc-stage__body">
        <div className="game-waiting-card">
          <span className="waiting-orbit" aria-hidden="true" />
          <strong>正在统计票数</strong>
          <p>请稍候，结果马上揭晓。</p>
        </div>
      </section>
    );
  }

  const eliminatedPlayer = summary.eliminatedPlayerId !== null ? (playerMap.get(summary.eliminatedPlayerId) ?? null) : null;
  const sortedTally = Object.entries(summary.tally ?? {}).sort(([, left], [, right]) => right - left);
  const maxVotes = Math.max(...sortedTally.map(([, count]) => count), 1);
  const totalVotes = sortedTally.reduce((sum, [, count]) => sum + count, 0);

  return (
    <section className="game-phase vote-result uc-stage__body">
      <PhaseLead
        eyebrow={`第 ${summary.round} 轮 · 结果揭晓`}
        title="本轮投票统计"
        description={summary.kind === 'runoff' ? '这是加赛对决的公开票型。' : '选票已按公开规则完成统计。'}
        aside={<GameCountdown seconds={countdown.secondsLeft} label="即将推进" />}
      />

      <div className={`result-banner ${summary.outcome}`}>
        <span className="result-seal" aria-hidden="true">{summary.outcome === 'eliminated' ? '!' : '='}</span>
        <div>
          <strong>{outcomeText(summary)}</strong>
          <span>{eliminatedPlayer ? `${nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1}`} 离场` : '准备进入下一阶段'}</span>
        </div>
      </div>

      {eliminatedPlayer !== null && (
        <div className="eliminated-info">
          <UserAvatar
            avatar={resolveMemberAvatar(members.find((m) => m.playerId === eliminatedPlayer.playerId), { seat: eliminatedPlayer.seat, playerId: eliminatedPlayer.playerId })}
            nickname={nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1} 号玩家`}
            size={44}
            className="eliminated-avatar-box"
          />
          <div>
            <span>身份揭晓</span>
            <strong>{nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1} 号玩家`}</strong>
          </div>
          <span className={`role-badge ${summary.eliminatedRole ?? ''}`}>{summary.eliminatedRole === 'undercover' ? '卧底' : '平民'}</span>
        </div>
      )}

      {sortedTally.length > 0 && (
        <div className="uc-panel">
          <div className="uc-panel__head">
            <h3>公开票型</h3>
            <span>共 {totalVotes} 票</span>
          </div>
          <ul className="tally-list">
            {sortedTally.map(([playerId, count], index) => {
              const player = playerMap.get(playerId);
              return (
                <li key={playerId} className="tally-item" style={{ '--stagger-index': index } as CSSProperties}>
                  <span className="tally-player">#{player !== undefined ? player.seat + 1 : '?'}<small>{nameFor(members, playerId)}</small></span>
                  <span className="tally-bar"><i style={{ '--fill-percent': `${count / maxVotes * 100}%` } as CSSProperties} /></span>
                  <strong className="tally-count">{count} 票</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
