/**
 * 投票阶段视图（Task 3）：
 * voting 显示所有存活者；runoff_voting 只显示 runoffCandidates；
 * 不能投自己/已淘汰者；已投后整列禁用并提示"已投票"。
 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props {
  view: UndercoverPlayerView;
}

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
  for (const p of view.players) playerMap.set(p.playerId, p);

  // 候选人：runoff 仅 runoffCandidates；普通投票为所有存活者
  const candidateIds = isRunoff
    ? view.runoffCandidates
    : view.players.filter((p) => p.alive).map((p) => p.playerId);

  async function handleVote(targetId: string) {
    if (busy || hasVoted) return;
    setBusy(true);
    setError(null);
    try {
      await send('game_action', { type: 'cast_vote', targetPlayerId: targetId });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const progress = `${view.votesSubmitted}/${view.votesExpected}`;

  return (
    <section className="game-phase voting">
      <h2>
        第 {view.round} 轮 · {isRunoff ? '加赛投票' : '投票'}
      </h2>

      {countdown.secondsLeft > 0 && (
        <div className={`countdown ${countdown.secondsLeft <= 5 ? 'urgent' : ''}`}>
          剩余 {countdown.secondsLeft} 秒
        </div>
      )}

      <div className="vote-progress">已投票 {progress}</div>

      <div className="vote-candidates">
        {candidateIds.map((cid) => {
          const p = playerMap.get(cid);
          if (!p) return null;
          const isSelf = cid === myId;
          const isMyVote = cid === myVote;
          const disabled = busy || hasVoted || isSelf || state.connState !== 'synced';
          return (
            <button
              key={cid}
              type="button"
              className={`vote-card ${isMyVote ? 'voted' : ''} ${isSelf ? 'self' : ''}`}
              onClick={() => void handleVote(cid)}
              disabled={disabled}
            >
              <span className="vote-seat">#{p.seat}</span>
              <span className="vote-name">{cid === myId ? '我' : `玩家 ${p.seat}`}</span>
              {isSelf && <span className="vote-tag">不能投自己</span>}
              {isMyVote && <span className="vote-tag voted-tag">已投</span>}
            </button>
          );
        })}
      </div>

      {hasVoted && (
        <div className="vote-done-hint">
          {myVote !== null && myVote !== myId
            ? '已投票，等待其他玩家'
            : '已完成投票'}
        </div>
      )}

      {me && !me.alive && (
        <div className="spectator-hint">你已淘汰，本回合不可投票</div>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}

      {state.connState !== 'synced' && (
        <div className="status-banner">连接中…部分操作可能不可用</div>
      )}
    </section>
  );
}
