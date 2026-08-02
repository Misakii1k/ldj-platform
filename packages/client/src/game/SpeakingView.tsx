/** 发言阶段：突出当前发言者、顺序轮转和移动端底部操作。 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function SpeakingView({ view }: Props) {
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

  async function handleFinish() {
    if (busy || !isMyTurn) return;
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'finish_speech' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="game-phase speaking">
      <PhaseLead
        eyebrow={`第 ${view.round} 轮 · 描述发言`}
        title={isMyTurn ? '轮到你发言了' : '倾听同桌玩家的描述'}
        description={isMyTurn ? '巧妙描述你的词条，注意隐蔽身份并捕捉可疑蛛丝马迹。' : '细心留意大家的描述词与语气停顿，寻找破绽。'}
        aside={<GameCountdown seconds={countdown.secondsLeft} />}
      />

      {currentSpeakerInfo && (
        <div className={`speaker-spotlight ${isMyTurn ? 'is-me' : ''}`} aria-live="polite">
          <div className="speaker-avatar" aria-hidden="true"><span /></div>
          <div className="speaker-spotlight-copy">
            <span className="speaker-label">当前发言者</span>
            <strong className="speaker-name">{isMyTurn ? '我' : `玩家 ${currentSpeakerInfo.seat}`}</strong>
            <span className="speaker-seat">#{currentSpeakerInfo.seat} 号座位</span>
          </div>
          <div className="speaker-signal" aria-hidden="true"><i /><i /><i /></div>
        </div>
      )}

      <div className="speaking-board">
        <div className="section-heading-row">
          <div><span className="section-kicker">发言顺序</span><h3>顺时针轮流发言</h3></div>
          <span className="section-count">{Math.max(currentIndex + 1, 0)}/{view.speakingOrder.length}</span>
        </div>
        <ol className="speaking-order">
          {view.speakingOrder.map((pid, idx) => {
            const player = playerMap.get(pid);
            if (!player) return null;
            const isCurrent = pid === currentSpeaker;
            const isMe = pid === myId;
            const isDone = currentIndex >= 0 && idx < currentIndex;
            return (
              <li key={pid} className={`speaking-item ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''} ${!player.alive ? 'dead' : ''}`}>
                <span className="speaking-idx">{isDone ? '✓' : idx + 1}</span>
                <span className="speaking-mini-avatar" aria-hidden="true" />
                <span className="speaking-person"><strong>{isMe ? '我' : `玩家 ${player.seat}`}</strong><small>#{player.seat} 号座位</small></span>
                <span className="speaking-state">{isCurrent ? '发言中' : isDone ? '已发言' : '等待中'}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="game-tip-card">
        <span className="tip-pin" aria-hidden="true" />
        <strong>本轮小提示</strong>
        <p>提示：从一个侧面或特征入手描述。言多必失容易暴露词条，过度含糊也会招致怀疑哦！</p>
      </aside>

      {me && (
        <div className="game-action-dock">
          <button type="button" className="game-primary-action" onClick={handleFinish} disabled={busy || !isMyTurn || !me.alive}>
            {!me.alive ? '本轮观战中' : isMyTurn ? (busy ? '提交中…' : '发言完毕，交棒下一位') : '等待其他玩家发言'}
          </button>
          <span>{isMyTurn ? '发言结束后点击按钮交给下一位玩家' : '轮到你发言时按钮会自动点亮'}</span>
        </div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {state.connState !== 'synced' && <div className="status-banner">连接中…部分操作可能不可用</div>}
    </section>
  );
}
