/** 投票阶段：候选人卡牌网格与清晰的选中反馈。 */
import { useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import { nameFor } from './useGameAction.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function VotingView({ view }: Props) {
  const { profile } = useUserProfile();
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
  const candidateIds = isRunoff
    ? view.runoffCandidates
    : view.players.filter((player) => player.alive).map((player) => player.playerId);
  const members = state.room?.members ?? [];

  async function handleVote(targetId: string) {
    if (busy || hasVoted) return;
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'cast_vote', targetPlayerId: targetId }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  const votePercent = view.votesExpected > 0 ? (view.votesSubmitted / view.votesExpected) * 100 : 0;
  return (
    <section className="game-phase voting uc-stage__body">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · ${isRunoff ? '加赛指认' : '投票指认'}`}
            title={hasVoted ? '选票已锁定' : '指认你心中的卧底'}
            description={hasVoted ? '票数在全员投完后统一公开。' : '综合发言表现，把票投给你最怀疑的人。'}
            aside={<GameCountdown seconds={countdown.secondsLeft} />}
          />

          <div className="uc-meter" role="status">
            <span className="uc-meter__label">已投 {view.votesSubmitted} / {view.votesExpected} 票</span>
            <div className="uc-meter__track" style={{ '--uc-meter': `${votePercent}%` } as CSSProperties}>
              <span />
            </div>
          </div>

          {hasVoted && (
            <div className="vote-done-hint" role="status">
              <strong>选票已锁定</strong>
              <span>等待其他玩家完成投票…</span>
            </div>
          )}
          {me !== null && !me.alive && <div className="spectator-hint">你已出局，本回合观战等待结果</div>}
        </div>

        <div className="game-phase-right-col">
          <div className="vote-candidates">
            {candidateIds.map((candidateId, index) => {
              const player = playerMap.get(candidateId);
              if (!player) return null;
              const isSelf = candidateId === myId;
              const isMyVote = candidateId === myVote;
              const disabled = busy || hasVoted || isSelf || state.connState !== 'synced' || !me?.alive;
              return (
                <button
                  key={candidateId}
                  type="button"
                  className={`vote-card ${isMyVote ? 'voted' : ''} ${isSelf ? 'self' : ''}`}
                  onClick={() => void handleVote(candidateId)}
                  disabled={disabled}
                  style={{ '--stagger-index': index } as CSSProperties}
                >
                  <UserAvatar
                    avatar={members.find((m) => m.playerId === candidateId)?.avatar ?? (isSelf ? profile.avatar : 'preset:fox')}
                    nickname={isSelf ? '我' : nameFor(members, candidateId) || `玩家 ${player.seat + 1}`}
                    size={46}
                    className="vote-avatar-box"
                  />
                  <span className="vote-seat">#{player.seat + 1}</span>
                  <span className="vote-name">{isSelf ? '我' : nameFor(members, candidateId) || `玩家 ${player.seat + 1}`}</span>
                  <span className={`vote-tag ${isMyVote ? 'voted-tag' : ''}`}>
                    {isMyVote ? '已投此人' : isSelf ? '不能投自己' : '点击投票'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
