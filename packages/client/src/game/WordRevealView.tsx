/** 看词阶段：使用通用 IdentityFlipCard 3D 翻牌引擎展示机密档案，防窥与音效联动。 */
import { useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { IdentityFlipCard } from '../shared-ui/IdentityFlipCard.tsx';
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

  async function handleConfirm() {
    if (busy || confirmed) return;
    setBusy(true);
    setError(null);
    try { await send('game_action', { type: 'confirm_word' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  const isBlank = myWord === '';

  return (
    <section className="game-phase word-reveal uc-stage__body">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · 悄悄看词`}
            title={myWord === null ? '全员看词筹备中' : revealed ? (isBlank ? '你是白板' : myWord) : '查看你的机密词条'}
            description={me === null ? '你正在观战，词条仅对玩家本人显示。' : '按住机密档案卡悄悄翻开，松手立即遮挡，别让旁人看到。'}
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
          {me !== null && myWord !== null ? (
            <IdentityFlipCard
              theme="confidential"
              roleName={isBlank ? '白板' : myWord}
              roleSubtitle={isBlank ? '特殊身份 · 白板' : '秘密词条'}
              roleCamp={isBlank ? 'special' : 'neutral'}
              secretWord={!isBlank && myWord ? myWord : undefined}
              secretHints={
                isBlank
                  ? ['你没有词条！请仔细聆听其他人的描述，推测出词条并伪装自己。']
                  : ['牢记你的专属词条。在后续发言中适度描述，切勿直接念出。']
              }
              confirmed={confirmed}
              onConfirm={handleConfirm}
              confirmButtonText="我已记下，确认就绪"
              onRevealChange={setRevealed}
            />
          ) : (
            <div className="game-waiting-card">
              <span className="waiting-orbit" aria-hidden="true" />
              <strong>{me === null ? '观战模式中' : '等待其他玩家看词'}</strong>
              <p>全员确认后自动进入描述发言。</p>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
