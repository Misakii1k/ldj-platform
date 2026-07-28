/** 看词阶段：按住展示秘密词卡，松开或离开页面立即遮挡。 */
import { useCallback, useEffect, useState } from 'react';
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
        eyebrow="SECRET FILE · 仅限本人"
        title={myWord === null ? '等待玩家确认' : '查看你的秘密词'}
        description={me === null ? '你正在观战，词语不会对观战者显示。' : '确认四周无人偷看，再按住下方卡片。'}
        aside={<GameCountdown seconds={countdown.secondsLeft} />}
      />

      <div className="reveal-progress-card">
        <div><strong>{confirmedCount}</strong><span>/ {total} 人已确认</span></div>
        <div className="reveal-progress-track"><span style={{ width: `${total > 0 ? confirmedCount / total * 100 : 0}%` }} /></div>
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
            aria-label="按住查看你的词"
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') showWord(); }}
            onKeyUp={hideWord}
          >
            <span className="secret-card-stamp">TOP SECRET</span>
            <span className="secret-eye" aria-hidden="true" />
            {revealed ? <span className="my-word">{myWord}</span> : <span className="word-placeholder">按住查看你的词</span>}
            <span className="secret-card-foot">松开立即隐藏</span>
          </div>
          <p className="secret-tip">词语仅自己可见，请勿截图或朗读；切走页面会自动遮挡。</p>
          <div className="game-action-dock">
            <button type="button" className="game-primary-action" onClick={handleConfirm} disabled={busy || confirmed}>
              {confirmed ? '已确认，等待开局' : busy ? '正在确认…' : '我已看完'}
            </button>
            <span>{confirmed ? '其他人确认后将自动进入发言' : '确认前可以再次按住查看'}</span>
          </div>
        </>
      ) : (
        <div className="game-waiting-card"><span className="waiting-orbit" aria-hidden="true" /><strong>{me === null ? '观战中' : '等待其他玩家看词'}</strong><p>全部确认后，系统会自动进入发言阶段。</p></div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {state.connState !== 'synced' && <div className="status-banner">连接中…部分操作可能不可用</div>}
    </section>
  );
}
