/**
 * 发言阶段视图（Task 3）：
 * speakingOrder 列表 + 当前发言者高亮 + 倒计时（基于 deadlineAt）；
 * 当前发言者可点击"我已说完"（finish_speech）。
 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props {
  view: UndercoverPlayerView;
}

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
  for (const p of view.players) playerMap.set(p.playerId, p);

  const currentSpeakerInfo = currentSpeaker !== null ? playerMap.get(currentSpeaker) : undefined;

  async function handleFinish() {
    if (busy || !isMyTurn) return;
    setBusy(true);
    setError(null);
    try {
      await send('game_action', { type: 'finish_speech' });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="game-phase speaking">
      <h2>第 {view.round} 轮 · 发言</h2>

      {countdown.secondsLeft > 0 && (
        <div className={`countdown ${countdown.secondsLeft <= 5 ? 'urgent' : ''}`}>
          剩余 {countdown.secondsLeft} 秒
        </div>
      )}

      {currentSpeakerInfo && (
        <div className="current-speaker">
          <span className="speaker-label">当前发言</span>
          <span className="speaker-name">
            #{currentSpeakerInfo.seat} {currentSpeakerInfo.alive ? '' : '（已淘汰）'}
          </span>
        </div>
      )}

      <ol className="speaking-order">
        {view.speakingOrder.map((pid, idx) => {
          const p = playerMap.get(pid);
          if (!p) return null;
          const isCurrent = pid === currentSpeaker;
          const isMe = pid === myId;
          return (
            <li
              key={pid}
              className={`speaking-item ${isCurrent ? 'current' : ''} ${!p.alive ? 'dead' : ''}`}
            >
              <span className="speaking-idx">{idx + 1}</span>
              <span className="speaking-seat">#{p.seat}</span>
              <span className="speaking-name">
                {isMe ? '我' : `玩家 ${p.seat}`}
                {isCurrent && <span className="speaking-marker">▶</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {me && (
        <button
          type="button"
          className="primary-btn"
          onClick={handleFinish}
          disabled={busy || !isMyTurn || !me.alive}
        >
          {!me.alive
            ? '已淘汰'
            : isMyTurn
              ? busy ? '处理中…' : '我已说完'
              : '等待其他玩家发言'}
        </button>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}

      {state.connState !== 'synced' && (
        <div className="status-banner">连接中…部分操作可能不可用</div>
      )}
    </section>
  );
}
