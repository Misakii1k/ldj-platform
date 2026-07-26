import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import {
  getUndercoverActionPermissions,
  reduceSecretVisibility,
  type UndercoverConnectionState,
  type UndercoverGameView,
  type UndercoverInteractionState,
  type UndercoverPhase,
  type UndercoverRole,
} from './undercover-game-model';
import './UndercoverGameScreen.css';

export interface UndercoverGameScreenProps {
  readonly view: UndercoverGameView;
  readonly playerDisplayNames?: Readonly<Record<string, string>>;
  readonly connection: UndercoverConnectionState;
  readonly synchronized: boolean;
  readonly requestPending?: boolean;
  readonly interactionState?: UndercoverInteractionState;
  readonly onConfirmWord: () => void;
  readonly onFinishSpeech: () => void;
  readonly onLockVote: (targetPlayerId: string) => void;
}

const phaseCopy: Record<UndercoverPhase, { eyebrow: string; title: string; detail: string }> = {
  word_reveal: { eyebrow: '秘密发牌', title: '只让自己看见', detail: '按住词牌查看，记住后立即松手。' },
  speaking: { eyebrow: '轮流描述', title: '说得像，又别太像', detail: '不要直接说出词语，留意每个人的措辞。' },
  voting: { eyebrow: '开始投票', title: '选出最可疑的人', detail: '选择后再次确认；锁定的票不能更改。' },
  runoff_voting: { eyebrow: '平票加赛', title: '只在候选人中选择', detail: '这是本轮唯一一次加赛。' },
  vote_result: { eyebrow: '本轮揭晓', title: '答案落桌', detail: '结果展示结束后会自动进入下一阶段。' },
  game_over: { eyebrow: '对局结束', title: '谜底揭开', detail: '身份与词语现在全部公开。' },
};

const connectionCopy: Record<UndercoverConnectionState, { label: string; tone: string }> = {
  connected: { label: '连接稳定', tone: 'ready' },
  connecting: { label: '正在连接', tone: 'waiting' },
  recovering: { label: '正在恢复席位', tone: 'waiting' },
  disconnected: { label: '连接已中断', tone: 'danger' },
  replaced: { label: '席位已在别处接管', tone: 'danger' },
};

function roleLabel(role: UndercoverRole | undefined): string {
  if (role === 'civilian') return '平民';
  if (role === 'undercover') return '卧底';
  return '身份未公开';
}

function useCountdown(deadlineAt: number | null): number | null {
  const calculate = useCallback(
    () => (deadlineAt === null ? null : Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1_000))),
    [deadlineAt],
  );
  const [seconds, setSeconds] = useState<number | null>(calculate);

  useEffect(() => {
    setSeconds(calculate());
    if (deadlineAt === null) return;
    const interval = window.setInterval(() => setSeconds(calculate()), 1_000);
    return () => window.clearInterval(interval);
  }, [calculate, deadlineAt]);

  return seconds;
}

function playerFallbackName(seat: number): string {
  return `玩家 ${seat + 1}`;
}

export function UndercoverGameScreen({
  view,
  playerDisplayNames = {},
  connection,
  synchronized,
  requestPending = false,
  interactionState = {},
  onConfirmWord,
  onFinishSpeech,
  onLockVote,
}: UndercoverGameScreenProps) {
  const [secretVisible, setSecretVisible] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const countdown = useCountdown(view.deadlineAt);
  const permissions = getUndercoverActionPermissions(
    view,
    { connection, synchronized, requestPending },
    interactionState,
  );
  const players = useMemo(
    () => Object.entries(view.players).sort(([, left], [, right]) => left.seat - right.seat),
    [view.players],
  );
  const selectableTargets = new Set(permissions.selectableTargetIds);
  const currentPhase = phaseCopy[view.phase];
  const connectionPresentation = connectionCopy[connection];
  const isPlayer = view.viewerKind === 'player';
  const self = isPlayer ? view.players[view.self.playerId] : undefined;

  const hideSecret = useCallback(() => {
    setSecretVisible((visible) => reduceSecretVisibility(visible, 'environment_changed'));
  }, []);

  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.visibilityState !== 'visible') hideSecret();
    };
    window.addEventListener('blur', hideSecret);
    window.addEventListener('resize', hideSecret);
    window.addEventListener('orientationchange', hideSecret);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', hideSecret);
      window.removeEventListener('resize', hideSecret);
      window.removeEventListener('orientationchange', hideSecret);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [hideSecret]);

  useEffect(() => {
    hideSecret();
    setSelectedTargetId(null);
    phaseHeadingRef.current?.focus({ preventScroll: true });
  }, [hideSecret, view.phase]);

  useEffect(() => {
    if (selectedTargetId !== null && !selectableTargets.has(selectedTargetId)) {
      setSelectedTargetId(null);
    }
  }, [selectableTargets, selectedTargetId]);

  const revealSecret = (): void => {
    setSecretVisible((visible) => reduceSecretVisibility(visible, 'hold_started'));
  };
  const endSecretHold = (): void => {
    setSecretVisible((visible) => reduceSecretVisibility(visible, 'hold_ended'));
  };
  const handleSecretPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    revealSecret();
  };
  const handleSecretKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      revealSecret();
    }
  };
  const handleSecretKeyUp = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') endSecretHold();
  };

  const displayName = (playerId: string): string => {
    const player = view.players[playerId];
    const supplied = playerDisplayNames[playerId]?.trim();
    return supplied === undefined || supplied.length === 0
      ? playerFallbackName(player?.seat ?? 0)
      : supplied;
  };

  const phaseAnnouncement = `${currentPhase.eyebrow}：${currentPhase.title}`;
  const statusLine = !synchronized
    ? '正在同步最新状态，操作暂时锁定'
    : permissions.blockedReason;

  return (
    <main className="undercover-game">
      <div className="undercover-game__grain" aria-hidden="true" />
      <header className="undercover-game__topbar">
        <div>
          <p className="undercover-game__brand">闹一桌 <span>/ 谁是卧底</span></p>
          <p className="undercover-game__round">第 {view.round} 轮</p>
        </div>
        <div
          className={`undercover-game__connection undercover-game__connection--${connectionPresentation.tone}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {connectionPresentation.label}
        </div>
      </header>

      <div className="undercover-game__layout">
        <section className="undercover-game__stage" aria-labelledby="undercover-phase-title">
          <div className="undercover-game__phase-copy">
            <p>{currentPhase.eyebrow}</p>
            <h1 id="undercover-phase-title" ref={phaseHeadingRef} tabIndex={-1}>{currentPhase.title}</h1>
            <span>{currentPhase.detail}</span>
          </div>

          <div className="undercover-game__live" aria-live="polite" aria-atomic="true">
            <span className="visually-hidden">{phaseAnnouncement}</span>
            {countdown !== null && view.phase !== 'game_over' && (
              <span className="undercover-game__timer" aria-label={`本阶段剩余约 ${countdown} 秒`}>
                <b>{countdown}</b><small>秒</small>
              </span>
            )}
          </div>

          {isPlayer && view.phase !== 'game_over' && (
            <section className={`secret-card ${secretVisible ? 'secret-card--visible' : ''}`} aria-labelledby="secret-title">
              <div>
                <p id="secret-title">你的秘密词</p>
                <strong aria-hidden={!secretVisible}>{secretVisible ? view.self.word : '••••'}</strong>
                <small>{secretVisible ? '松手立即遮挡' : '默认遮挡，防止旁人瞥见'}</small>
              </div>
              <button
                type="button"
                className="secret-card__hold"
                aria-label="按住查看秘密词"
                onPointerDown={handleSecretPointerDown}
                onPointerUp={endSecretHold}
                onPointerCancel={endSecretHold}
                onPointerLeave={endSecretHold}
                onLostPointerCapture={endSecretHold}
                onKeyDown={handleSecretKeyDown}
                onKeyUp={handleSecretKeyUp}
                onBlur={endSecretHold}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span aria-hidden="true">◉</span>
                按住看词
              </button>
            </section>
          )}

          {view.phase === 'speaking' && (
            <section className="turn-card" aria-live="polite">
              <p>现在轮到</p>
              <strong>{view.currentSpeakerId === null ? '等待下一位' : displayName(view.currentSpeakerId)}</strong>
              <span>{view.currentSpeakerId !== null && view.viewerKind === 'player' && view.currentSpeakerId === view.self.playerId ? '深呼吸，你来描述' : '听关键词，也听犹豫'}</span>
            </section>
          )}

          {(view.phase === 'voting' || view.phase === 'runoff_voting') && (
            <section className="vote-panel" aria-labelledby="vote-title">
              <div className="vote-panel__heading">
                <h2 id="vote-title">投给谁？</h2>
                <span>{view.voteProgress.locked}/{view.voteProgress.eligible} 已锁定</span>
              </div>
              {permissions.lockVote ? (
                <div className="vote-grid" role="radiogroup" aria-label="选择投票对象">
                  {players.filter(([id]) => selectableTargets.has(id)).map(([playerId, player]) => (
                    <button
                      key={playerId}
                      type="button"
                      role="radio"
                      aria-checked={selectedTargetId === playerId}
                      className={selectedTargetId === playerId ? 'vote-choice vote-choice--selected' : 'vote-choice'}
                      onClick={() => setSelectedTargetId(playerId)}
                    >
                      <span>{displayName(playerId)}</span>
                      <small>{player.online ? `座位 ${player.seat + 1}` : '暂时离线'}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="undercover-game__quiet-note">{interactionState.voteLocked ? '你的票已锁定，等待其他人。' : statusLine ?? '正在等待投票阶段结束。'}</p>
              )}
            </section>
          )}

          {view.phase === 'vote_result' && view.voteResult !== null && (
            <section className="result-card" aria-live="assertive">
              {view.voteResult.kind === 'eliminated' ? (
                <>
                  <p>本轮离场</p>
                  <strong>{displayName(view.voteResult.eliminatedPlayerId)}</strong>
                  <span>身份：{roleLabel(view.voteResult.eliminatedRole)}</span>
                </>
              ) : view.voteResult.kind === 'runoff' ? (
                <><p>票数打平</p><strong>进入加赛</strong><span>候选人已缩小到 {view.voteResult.runoffCandidates.length} 位</span></>
              ) : (
                <><p>零张有效票</p><strong>本轮无人离场</strong><span>下一轮即将开始</span></>
              )}
            </section>
          )}

          {view.phase === 'game_over' && view.result !== null && (
            <section className="finale-card" aria-labelledby="finale-title">
              <p>最终结果</p>
              <h2 id="finale-title">
                {view.result.outcome === 'civilian' ? '平民阵营获胜' : view.result.outcome === 'undercover' ? '卧底阵营获胜' : '本局已中止'}
              </h2>
              <div className="finale-card__words">
                <span><small>平民词</small><strong>{view.result.civilianWord}</strong></span>
                <span><small>卧底词</small><strong>{view.result.undercoverWord}</strong></span>
              </div>
            </section>
          )}
        </section>

        <aside className="undercover-game__sidebar" aria-labelledby="player-list-title">
          <div className="player-list__heading">
            <h2 id="player-list-title">桌上玩家</h2>
            <span>{players.filter(([, player]) => player.alive).length} 人留在场上</span>
          </div>
          <ol className="game-player-list">
            {players.map(([playerId, player]) => {
              const isCurrent = view.currentSpeakerId === playerId;
              const isSelf = view.viewerKind === 'player' && view.self.playerId === playerId;
              const revealedRole = player.revealedRole ?? (view.result?.roles[playerId]);
              return (
                <li key={playerId} className={!player.alive ? 'game-player-list__out' : undefined}>
                  <span className="game-player-list__seat">{player.seat + 1}</span>
                  <span className="game-player-list__name">
                    <strong>{displayName(playerId)}{isSelf ? '（你）' : ''}</strong>
                    <small>{isCurrent ? '正在发言' : !player.online ? '离线保留中' : !player.alive ? '已离场' : '在场'}</small>
                  </span>
                  {revealedRole !== undefined && <em>{roleLabel(revealedRole)}</em>}
                </li>
              );
            })}
          </ol>
          {view.viewerKind === 'spectator' && <p className="spectator-ticket">观战席 · 仅显示公开信息</p>}
          {view.viewerKind === 'player' && self?.alive === false && <p className="spectator-ticket">你已离场 · 继续观看公开进度</p>}
        </aside>
      </div>

      <footer className="undercover-game__actions">
        {permissions.confirmWord && (
          <button type="button" className="game-action game-action--primary" onClick={onConfirmWord}>
            我已记住这个词 <span aria-hidden="true">→</span>
          </button>
        )}
        {permissions.finishSpeech && (
          <button type="button" className="game-action game-action--primary" onClick={onFinishSpeech}>
            我说完了 <span aria-hidden="true">→</span>
          </button>
        )}
        {permissions.lockVote && (
          <button
            type="button"
            className="game-action game-action--primary"
            disabled={selectedTargetId === null}
            onClick={() => {
              if (selectedTargetId !== null) onLockVote(selectedTargetId);
            }}
          >
            {selectedTargetId === null ? '先选择一位玩家' : `锁定投给 ${displayName(selectedTargetId)}`}
            <span aria-hidden="true">→</span>
          </button>
        )}
        {!permissions.confirmWord && !permissions.finishSpeech && !permissions.lockVote && view.phase !== 'game_over' && (
          <p role="status" aria-live="polite">{statusLine ?? '等待其他玩家完成操作'}</p>
        )}
      </footer>
    </main>
  );
}
