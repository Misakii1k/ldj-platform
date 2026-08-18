/** 看词阶段：按住展示秘密词卡，松开或离开页面立即遮挡。 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { GameCountdown, PhaseLead } from './GameChrome.tsx';
import type { UndercoverPlayerView } from './types.ts';

interface Props { view: UndercoverPlayerView; }

export function WordRevealView({ view }: Props) {
  const { send } = useConnection();
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
    <section className="game-phase word-reveal uc-stage__body">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · 悄悄看词`}
            title={myWord === null ? '全员看词筹备中' : revealed ? myWord : '查看你的秘密词条'}
            description={me === null ? '你正在观战，词条仅对玩家本人显示。' : '长按词卡悄悄查看，松手立即遮挡，别让旁人看到。'}
            aside={<GameCountdown seconds={countdown.secondsLeft} />}
          />

          <div className="uc-meter" role="status">
            <span className="uc-meter__label">已就绪</span>
            <div className="uc-meter__track" style={{ '--uc-meter': `${total > 0 ? (confirmedCount / total) * 100 : 0}%` } as CSSProperties}>
              <span />
            </div>
            <strong className="uc-meter__count">{confirmedCount} / {total}</strong>
          </div>
        </div>

        <div className="game-phase-right-col">
          {myWord !== null ? (
            <button
              type="button"
              className={`word-reveal-box ${revealed ? 'revealed' : 'hidden'}`}
              onPointerDown={showWord}
              onPointerUp={hideWord}
              onPointerLeave={hideWord}
              onPointerCancel={hideWord}
              onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') showWord(); }}
              onKeyUp={hideWord}
              aria-label="长按查看秘密词"
            >
              <span className="secret-card-stamp">机密词条</span>
              <span className="secret-eye" aria-hidden="true" />
              {revealed
                ? <span className="my-word">{myWord}</span>
                : <span className="word-placeholder">长按查看秘密词</span>}
              <span className="secret-card-foot">松手立即遮挡</span>
            </button>
          ) : (
            <div className="game-waiting-card">
              <span className="waiting-orbit" aria-hidden="true" />
              <strong>{me === null ? '观战模式中' : '等待其他玩家看词'}</strong>
              <p>全员确认后自动进入描述发言。</p>
            </div>
          )}
        </div>
      </div>

      {me !== null && (
        <div className="game-action-dock">
          <button type="button" className="game-primary-action" onClick={handleConfirm} disabled={busy || confirmed}>
            {confirmed ? '已确认，等待全员就绪' : busy ? '提交中…' : '我已记下，确认就绪'}
          </button>
          <span>{confirmed ? '全员就绪后自动进入描述发言' : '只有你看得见，离开页面会自动遮挡'}</span>
        </div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
