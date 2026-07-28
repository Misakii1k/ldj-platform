/**
 * 看词阶段视图（Task 3）：
 * 按住显示词语、松开立即遮挡、visibilitychange/blur 立即遮挡（§7.2 秘密信息展示）。
 * 词语不出现在页面标题、URL、控制台日志。
 */
import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import type { UndercoverPlayerView } from './types.ts';

interface Props {
  view: UndercoverPlayerView;
}

export function WordRevealView({ view }: Props) {
  const { send, state } = useConnection();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = view.me;
  const myWord = me?.word ?? null;
  const confirmed = me?.confirmed ?? false;
  const countdown = useCountdown(view.deadlineAt);

  // 立即遮挡：visibilitychange / blur
  useEffect(() => {
    function hide() {
      setRevealed(false);
    }
    function onVis() {
      if (document.visibilityState === 'hidden') hide();
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', hide);
    };
  }, []);

  const showWord = useCallback(() => {
    if (myWord === null) return;
    setRevealed(true);
  }, [myWord]);

  const hideWord = useCallback(() => {
    setRevealed(false);
  }, []);

  async function handleConfirm() {
    if (busy || confirmed) return;
    hideWord();
    setBusy(true);
    setError(null);
    try {
      await send('game_action', { type: 'confirm_word' });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // 观战者或无词语：等待状态
  if (myWord === null) {
    const confirmedCount = view.confirmedPlayerIds.length;
    const total = view.players.filter((p) => p.alive).length;
    return (
      <section className="game-phase word-reveal">
        <h2>看词阶段</h2>
        <p className="phase-hint">
          {me === null ? '观战中' : '等待其他玩家看词'}
        </p>
        <div className="progress">
          已确认 {confirmedCount}/{total}
        </div>
        {countdown.secondsLeft > 0 && (
          <div className="countdown">剩余 {countdown.secondsLeft} 秒</div>
        )}
      </section>
    );
  }

  const confirmedCount = view.confirmedPlayerIds.length;
  const total = view.players.filter((p) => p.alive).length;

  return (
    <section className="game-phase word-reveal">
      <h2>看词阶段</h2>
      <div className="progress">
        已确认 {confirmedCount}/{total}
      </div>
      {countdown.secondsLeft > 0 && (
        <div className={`countdown ${countdown.secondsLeft <= 5 ? 'urgent' : ''}`}>
          剩余 {countdown.secondsLeft} 秒
        </div>
      )}

      <div
        className={`word-reveal-box ${revealed ? 'revealed' : 'hidden'}`}
        onPointerDown={showWord}
        onPointerUp={hideWord}
        onPointerLeave={hideWord}
        onPointerCancel={hideWord}
        role="button"
        aria-label="按住查看你的词"
      >
        {revealed ? (
          <span className="my-word">{myWord}</span>
        ) : (
          <span className="word-placeholder">按住查看你的词</span>
        )}
      </div>

      <p className="secret-tip">
        词语仅自己可见，请勿截图或朗读。松开或切走页面即自动遮挡。
      </p>

      <button
        type="button"
        className="primary-btn"
        onClick={handleConfirm}
        disabled={busy || confirmed}
      >
        {confirmed ? '已确认' : busy ? '处理中…' : '我已看完'}
      </button>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {state.connState !== 'synced' && (
        <div className="status-banner">连接中…部分操作可能不可用</div>
      )}
    </section>
  );
}
