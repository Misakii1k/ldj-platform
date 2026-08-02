/** 看词阶段：按住展示秘密词卡，松开或离开页面立即遮挡。 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function WordRevealView({ view }: Props) {
  const { send, state } = useConnection();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = view.me;
  const myWord = me?.word ?? null;
  const confirmed = me?.confirmed ?? false;
  const countdown = useCountdown(view.deadlineAt);
  const confirmedCount = view.confirmedPlayerIds.length;
  const total = view.players.filter((player) => player.alive).length;

  useEffect(() => {
    const hide = () => setRevealed(false);
    const onVisibility = () => { if (document.visibilityState === 'hidden') hide(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', hide); };
  }, []);

  const showWord = useCallback(() => { if (myWord !== null) setRevealed(true); }, [myWord]);
  const hideWord = useCallback(() => setRevealed(false), []);

  async function handleConfirm() {
    if (busy || confirmed) return;
    hideWord();
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'confirm_word' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="game-phase word-reveal">
      <PhaseLead
        eyebrow="SECRET FILE · 绝密档案"
        title={myWord === null ? '全员看词筹备中' : '查看你的秘密词条'}
        description={me === null ? '你正在观战，秘密词条仅对玩家本人显示。' : '请确保周围无人偷看，长按下方词卡悄悄查阅。'}
        aside={<GameCountdown seconds={countdown.secondsLeft} />}
      />

      <div className="reveal-progress-card">
        <div><strong>{confirmedCount}</strong><span>/ {total} 人已完成查阅</span></div>
        <div className="reveal-progress-track" style={{ '--reveal-progress': `${total > 0 ? confirmedCount / total * 100 : 0}%` } as CSSProperties}><span /></div>
      </div>

      {myWord !== null ? (
        <>
          <div
            className={`word-reveal-box ${revealed ? 'revealed' : 'hidden'}`}
            onPointerDown={showWord}
            onPointerUp={hideWord}
            onPointerLeave={hideWord}
            onPointerCancel={hideWord}
            role="button"
            tabIndex={0}
            aria-label="长按查看秘密词"
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') showWord(); }}
            onKeyUp={hideWord}
          >
            <span className="secret-card-stamp">TOP SECRET</span>
            <span className="secret-eye" aria-hidden="true" />
            {revealed ? <span className="my-word">{myWord}</span> : <span className="word-placeholder">长按查看秘密词</span>}
            <span className="secret-card-foot">松手立即遮挡保护</span>
          </div>
          <p className="secret-tip">提示：词条仅自己可见，切勿朗读或截图；离开页面会自动隐藏。</p>
          <div className="game-action-dock">
            <button type="button" className="game-primary-action" onClick={handleConfirm} disabled={busy || confirmed}>
              {confirmed ? '已确认，等待全员就绪' : busy ? '提交中…' : '我已记下，确认就绪'}
            </button>
            <span>{confirmed ? '全员就绪后将自动进入描述发言环节' : '确认就绪前可以随时再次长按查阅'}</span>
          </div>
        </>
      ) : (
        <div className="game-waiting-card"><span className="waiting-orbit" aria-hidden="true" /><strong>{me === null ? '观战模式中' : '等待其他玩家看词'}</strong><p>全员确认后，系统将自动切入描述发言阶段。</p></div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {state.connState !== 'synced' && <div className="status-banner">连接中…部分操作可能不可用</div>}
    </section>
  );
}
