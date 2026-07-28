/** 投票阶段：候选人卡牌、提交进度和明确的选择反馈。 */
import { useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function VotingView({ view }: Props) {
  const { send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = view.me;
  const myId = me?.playerId ?? null;
  const hasVoted = me?.hasVoted ?? false;
  const myVote = me?.myVote ?? null;
  const isRunoff = view.phase === 'runoff_voting';
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map<string, PublicPlayerInfo>();
  for (const player of view.players) playerMap.set(player.playerId, player);
  const candidateIds = isRunoff ? view.runoffCandidates : view.players.filter((player) => player.alive).map((player) => player.playerId);

  async function handleVote(targetId: string) {
    if (busy || hasVoted) return;
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'cast_vote', targetPlayerId: targetId }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  const votePercent = view.votesExpected > 0 ? view.votesSubmitted / view.votesExpected * 100 : 0;
  return (
    <section className="game-phase voting">
      <PhaseLead
        eyebrow={`${isRunoff ? 'RUNOFF' : 'ROUND'} ${view.round} · VOTE`}
        title={hasVoted ? '你的选择已锁定' : isRunoff ? '加赛：再次选择' : '谁最像卧底？'}
        description={hasVoted ? '票数将在全部提交或倒计时结束后公开。' : '结合本轮发言，选择一位你最怀疑的玩家。'}
        aside={<GameCountdown seconds={countdown.secondsLeft} />}
      />

      <div className="vote-progress-card">
        <div><span>投票进度</span><strong>{view.votesSubmitted}/{view.votesExpected}</strong></div>
        <div className="vote-progress-track" style={{ '--vote-progress': `${votePercent}%` } as CSSProperties}><span /></div>
      </div>

      <div className="vote-candidates">
        {candidateIds.map((candidateId, index) => {
          const player = playerMap.get(candidateId);
          if (!player) return null;
          const isSelf = candidateId === myId;
          const isMyVote = candidateId === myVote;
          const disabled = busy || hasVoted || isSelf || state.connState !== 'synced' || !me?.alive;
          return (
            <button key={candidateId} type="button" className={`vote-card ${isMyVote ? 'voted' : ''} ${isSelf ? 'self' : ''}`} onClick={() => void handleVote(candidateId)} disabled={disabled} style={{ '--stagger-index': index } as CSSProperties}>
              <span className="vote-card-index">SUSPECT {String(index + 1).padStart(2, '0')}</span>
              <span className="vote-avatar" aria-hidden="true"><i /></span>
              <span className="vote-seat">#{player.seat}</span>
              <span className="vote-name">{isSelf ? '我' : `玩家 ${player.seat}`}</span>
              <span className={`vote-tag ${isMyVote ? 'voted-tag' : ''}`}>{isMyVote ? '已选择' : isSelf ? '不能投自己' : '点击投票'}</span>
            </button>
          );
        })}
      </div>

      {hasVoted && <div className="vote-done-hint"><strong>选票已投入</strong><span>等待其他玩家完成投票</span></div>}
      {me && !me.alive && <div className="spectator-hint">你已淘汰，本回合以观战身份等待结果</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {state.connState !== 'synced' && <div className="status-banner">连接中…部分操作可能不可用</div>}
    </section>
  );
}
