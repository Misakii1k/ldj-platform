/** 发言阶段：当面发言者聚光、顺序进度环、底部操作坞。 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import { nameFor } from './useGameAction.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function SpeakingView({ view }: Props) {
  const { profile } = useUserProfile();
  const { send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = view.me;
  const myId = me?.playerId ?? null;
  const currentSpeaker = view.currentSpeakerId;
  const isMyTurn = myId !== null && currentSpeaker !== null && myId === currentSpeaker;
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map<string, PublicPlayerInfo>();
  for (const player of view.players) playerMap.set(player.playerId, player);
  const currentSpeakerInfo = currentSpeaker !== null ? playerMap.get(currentSpeaker) : undefined;
  const currentIndex = view.speakingOrder.findIndex((id) => id === currentSpeaker);
  const members = state.room?.members ?? [];

  async function handleFinish() {
    if (busy || !isMyTurn) return;
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'finish_speech' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="game-phase speaking uc-stage__body">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · 描述发言`}
            title={isMyTurn ? '轮到你发言了' : '倾听同桌玩家的描述'}
            description={isMyTurn ? '用一句话描述你的词条，既要说得清，又要藏得住。' : '留意每个人的描述与语气，找出对不上号的破绽。'}
            aside={<GameCountdown seconds={countdown.secondsLeft} />}
          />

          {currentSpeakerInfo && (
            <div className={`speaker-spotlight ${isMyTurn ? 'is-me' : ''}`} aria-live="polite">
              <div className="speaker-spotlight-top">
                <UserAvatar
                  avatar={resolveMemberAvatar(members.find((m) => m.playerId === currentSpeakerInfo.playerId), { isMe: isMyTurn, myAvatar: profile.avatar, seat: currentSpeakerInfo.seat, playerId: currentSpeakerInfo.playerId })}
                  nickname={isMyTurn ? '我' : nameFor(members, currentSpeakerInfo.playerId) || `玩家 ${currentSpeakerInfo.seat + 1}`}
                  size={58}
                  className="speaker-avatar-box"
                />
                <div className="speaker-spotlight-copy">
                  <span className="speaker-label">{isMyTurn ? '轮到你了' : '正在发言'}</span>
                  <strong className="speaker-name">{isMyTurn ? '我' : nameFor(members, currentSpeakerInfo.playerId) || `玩家 ${currentSpeakerInfo.seat + 1}`}</strong>
                  <span className="speaker-seat">#{currentSpeakerInfo.seat + 1} 号座位</span>
                </div>
                <div className="speaker-signal" aria-hidden="true"><i /><i /><i /></div>
              </div>
              <div className="speaker-spotlight-tip">
                {isMyTurn
                  ? '请用一句话描述你的词条，不要说出词语本体，防止卧底猜出！'
                  : '仔细听取描述措辞与语气，卧底拿到的词条往往存在细微偏差！'}
              </div>
            </div>
          )}
          {me !== null && (
            <div className="game-action-dock">
              <button
                type="button"
                className="game-primary-action"
                onClick={handleFinish}
                disabled={busy || !isMyTurn || !me.alive}
              >
                {!me.alive ? '你已出局，本轮观战' : isMyTurn ? (busy ? '提交中…' : '发言完毕，交棒下一位') : '等待轮到你发言'}
              </button>
              <span>{isMyTurn ? '说完后点击按钮交给下一位' : '轮到你时按钮会自动点亮'}</span>
            </div>
          )}
        </div>

        <div className="game-phase-right-col">
          <div className="uc-order" aria-label="发言顺序">
            <div className="uc-order__head">
              <div>
                <h3>发言顺序与进度</h3>
                <span className="uc-order__subtitle">按顺时针依次发表一句话描述</span>
              </div>
              <strong className="uc-order__counter">
                {Math.max(currentIndex + 1, 0)} / {view.speakingOrder.length}
              </strong>
            </div>

            <ol className="uc-order__list">
              {view.speakingOrder.map((pid, idx) => {
                const player = playerMap.get(pid);
                if (!player) return null;
                const isCurrent = pid === currentSpeaker;
                const isDone = currentIndex >= 0 && idx < currentIndex;
                const isMe = pid === myId;
                const playerAvatar = resolveMemberAvatar(members.find((m) => m.playerId === pid), { isMe, myAvatar: profile.avatar, seat: player.seat, playerId: pid });
                const playerName = isMe ? '我' : nameFor(members, pid) || `玩家 ${player.seat + 1}`;

                return (
                  <li
                    key={pid}
                    className={[
                      'uc-order-card',
                      isCurrent ? 'is-current' : '',
                      isDone ? 'is-done' : '',
                      !player.alive ? 'is-dead' : '',
                      isMe ? 'is-me' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="uc-order-card__idx">
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <UserAvatar
                      avatar={playerAvatar}
                      nickname={playerName}
                      size={40}
                      className="uc-order-card__avatar"
                    />
                    <div className="uc-order-card__meta">
                      <div className="uc-order-card__name-row">
                        <strong className="uc-order-card__name">{playerName}</strong>
                        <span className="uc-order-card__seat">#{player.seat + 1}号位</span>
                      </div>
                      <span className="uc-order-card__status-text">
                        {!player.alive
                          ? '已淘汰出局'
                          : isCurrent
                            ? '正在发言中…'
                            : isDone
                              ? '✓ 已完成本轮描述'
                              : '等待发言'}
                      </span>
                    </div>
                    <div className="uc-order-card__tag">
                      {isCurrent ? (
                        <span className="uc-order-tag uc-order-tag--speaking">发言中</span>
                      ) : isDone ? (
                        <span className="uc-order-tag uc-order-tag--done">已讲完</span>
                      ) : !player.alive ? (
                        <span className="uc-order-tag uc-order-tag--dead">已出局</span>
                      ) : (
                        <span className="uc-order-tag uc-order-tag--waiting">待发言</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
