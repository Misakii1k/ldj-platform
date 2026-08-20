/**
 * undercover_blank_v1 白板模式主舞台实现（接入共享机密桌体系）。
 * e2e 挂钩类名（blank-*）原样保留。
 */
import { useState, type CSSProperties } from 'react';
import { useConnection } from '../../../connection/useConnection.ts';
import { GameActionFeedback, GameCountdownPulse } from '../../../shared-ui/GameMotion.tsx';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { GameLeaveButton } from '../../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../../useGameAction.ts';
import { GameCountdown, GamePhaseRail, PhaseLead } from '../../GameChrome.tsx';
import { TabletopOvalShell } from '../../../shared-ui/TabletopOvalShell.tsx';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { useUserProfile } from '../../../user/UserProfileContext.tsx';
import { buildBlankPhaseKey } from '../motion.ts';
import type { BlankPlayerView, BlankRole, BlankVoteSummary } from '../types.ts';
import '../../focused-game-motion.css';

interface Props {
  view: BlankPlayerView;
}

type Act = ReturnType<typeof useGameAction>['act'];

function blankRoleBadge(role: BlankRole | null): string {
  if (role === 'blank') return '白板';
  if (role === 'civilian') return '平民';
  return '身份暂不公开';
}

function blankRoleLabel(role: BlankRole | null): string {
  return blankRoleBadge(role);
}

function blankOutcomeText(summary: BlankVoteSummary): string {
  switch (summary.outcome) {
    case 'eliminated': return summary.eliminatedRole === 'blank' ? '神之一手，白板被揪出局！' : '抱憾，无辜平民被误伤淘汰';
    case 'tie': return '最高票平票，进入加赛对决';
    case 'no_votes': return '本轮无人投票，全员平安';
    case 'runoff_tie': return '加赛依然平票，本轮无人出局';
    default: return '结果结算中';
  }
}

function blankPhaseLabel(phase: BlankPlayerView['phase']): string {
  switch (phase) {
    case 'word_reveal': return '查看词条';
    case 'speaking': return '描述发言';
    case 'voting': return '投票指认';
    case 'runoff_voting': return '加赛投票';
    case 'vote_result': return '结果揭晓';
    case 'final_guess': return '最终猜词';
    case 'game_over': return '对局结算';
  }
}

function FocusedCountdown({ seconds, label }: { seconds: number; label?: string }) {
  return (
    <GameCountdownPulse
      secondsLeft={seconds}
      urgentAt={5}
      className="focused-game-countdown"
      aria-live="off"
    >
      <GameCountdown seconds={seconds} label={label} />
    </GameCountdownPulse>
  );
}

export function BlankStageArena({ view }: Props) {
  const { profile } = useUserProfile();
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const phaseKey = buildBlankPhaseKey(view);
  const currentSpeaker = view.currentSpeakerId === null
    ? null
    : view.players.find((player) => player.playerId === view.currentSpeakerId) ?? null;
  const currentSpeakerName = currentSpeaker === null
    ? null
    : (currentSpeaker.playerId === me?.playerId
        ? '你'
        : nameFor(members, currentSpeaker.playerId) || `${currentSpeaker.seat + 1} 号玩家`);
  const liveStatus = error
    ? `操作失败：${error}`
    : busy
      ? `${blankPhaseLabel(view.phase)}，正在提交操作。`
      : view.phase === 'speaking' && currentSpeakerName !== null
        ? `${blankPhaseLabel(view.phase)}，当前由${currentSpeakerName}发言。`
        : `${blankPhaseLabel(view.phase)}，第 ${view.round} 轮。`;

  const seats = view.players.map((player) => {
    const member = members.find((m) => m.playerId === player.playerId);
    return {
      id: player.playerId,
      name: nameFor(members, player.playerId) || `玩家 ${player.seat + 1}`,
      avatar: member?.avatar ?? (player.playerId === me?.playerId ? profile.avatar : 'preset:fox'),
      isCurrentTurn: player.playerId === view.currentSpeakerId,
      isSpeaking: view.phase === 'speaking' && player.playerId === view.currentSpeakerId,
      isEliminated: !player.alive,
      badge: player.revealedRole !== null ? blankRoleBadge(player.revealedRole) : undefined,
    };
  });

  let body;
  switch (view.phase) {
    case 'word_reveal':
      body = <BlankPeekCard view={view} act={act} busy={busy} />;
      break;
    case 'speaking':
      body = <BlankSpeechPanel view={view} act={act} busy={busy} />;
      break;
    case 'voting':
    case 'runoff_voting':
      body = <BlankVotePanel view={view} act={act} busy={busy} />;
      break;
    case 'vote_result':
      body = <BlankResultPanel view={view} />;
      break;
    case 'final_guess':
      body = <BlankFinalPanel view={view} act={act} busy={busy} />;
      break;
    case 'game_over':
      body = <BlankOverPanel view={view} />;
      break;
    default:
      body = <div className="game-loading-card">未知阶段</div>;
  }

  return (
    <TabletopOvalShell
      title="谁是卧底 · 白板"
      subtitle={`第 ${view.round} 轮 · 白板之局`}
      gameId="undercover"
      theme="mystery"
      stageFit="arena"
      players={seats}
      currentUserId={me === null ? undefined : me.playerId}
      topRightControls={<GameLeaveButton />}
      phaseKey={phaseKey}
      centerArena={
        <div
          className="uc-stage focused-game-stage"
          data-uc-phase={view.phase}
          data-current-actor={view.currentSpeakerId ?? undefined}
          aria-busy={busy}
        >
          <p className="focused-game-sr-live" role="status" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </p>
          {view.phase !== 'game_over' && <GamePhaseRail phase={railOf(view.phase)} />}
          <GameActionFeedback
            active={busy}
            feedbackKey={`${phaseKey}:busy`}
            variant="info"
            className="focused-game-feedback"
            aria-live="polite"
            aria-atomic="true"
          >
            {busy ? '正在同步操作，请勿重复点击…' : null}
          </GameActionFeedback>
          {error && (
            <GameActionFeedback
              active
              feedbackKey={`${phaseKey}:${error}`}
              variant="error"
              className="error-banner focused-game-feedback focused-game-feedback--error"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              {error}
            </GameActionFeedback>
          )}
          {body}
        </div>
      }
    />
  );
}

/** 最终猜词在进度条上映射到“揭晓”段；其余阶段直显。 */
function railOf(phase: BlankPlayerView['phase']) {
  if (phase === 'final_guess') return 'vote_result' as const;
  return phase;
}

/** 看词阶段：平民长按偷看词卡；白板拿到的是「空白档案」卡。 */
function BlankPeekCard({ view, act, busy }: { view: BlankPlayerView; act: Act; busy: boolean }) {
  const [peeking, setPeeking] = useState(false);
  const me = view.me;
  const countdown = useCountdown(view.deadlineAt);
  const ownWord = me !== null && !me.isBlank ? me.word : null;
  const confirmed = me?.confirmed ?? false;
  const total = view.players.filter((player) => player.alive).length;
  const confirmedCount = (view.confirmedPlayerIds ?? []).length;

  return (
    <section className="game-phase word-reveal uc-stage__body">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · 白板档案`}
            title={me?.isBlank ? '你是白板' : '查看你的秘密词条'}
            description={me === null
              ? '你正在观战，词条仅对玩家本人显示。'
              : me?.isBlank
                ? '本局你没有词条。靠拢大家的描述，把自己藏进人群。'
                : '长按词卡悄悄查看，松手立即遮挡，别让旁人看到。'}
            aside={<FocusedCountdown seconds={countdown.secondsLeft} />}
          />

          <div className="uc-meter" role="status" aria-live="polite" aria-atomic="true">
            <span className="uc-meter__label">已就绪</span>
            <div className="uc-meter__track" style={{ '--uc-meter': `${total > 0 ? (confirmedCount / total) * 100 : 0}%` } as CSSProperties}>
              <span />
            </div>
            <strong className="uc-meter__count">{confirmedCount} / {total}</strong>
          </div>
        </div>

        <div className="game-phase-right-col">
          {me?.isBlank ? (
            <div className="word-reveal-box word-reveal-box--blank blank-word-card__blank">
              <span className="secret-card-stamp">空白档案</span>
              <span className="blank-dossier__glyph" aria-hidden="true">?</span>
              <strong className="blank-dossier__title">你是白板</strong>
              <span className="blank-dossier__hint">观察并模仿他人的描述，别让同桌发现你「无词」。</span>
            </div>
          ) : ownWord !== null ? (
            <button
              type="button"
              className={`word-reveal-box blank-word-card__box ${peeking ? 'revealed' : 'hidden'}`}
              aria-label="长按查看秘密词"
              onPointerDown={() => setPeeking(true)}
              onPointerUp={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
              onPointerCancel={() => setPeeking(false)}
              onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setPeeking(true); }}
              onKeyUp={() => setPeeking(false)}
            >
              <span className="secret-card-stamp">机密词条</span>
              <span className="secret-eye" aria-hidden="true" />
              {peeking
                ? <span className="blank-word-card__word my-word">{ownWord}</span>
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
          <button type="button" className="game-primary-action" aria-busy={busy} disabled={busy || confirmed} onClick={() => void act({ type: 'confirm_word' })}>
            {confirmed ? '已确认，等待全员就绪' : busy ? '提交中…' : '我已记下，确认就绪'}
          </button>
          <span>{confirmed ? '全员就绪后自动进入描述发言' : '确认前可以随时长按查阅'}</span>
        </div>
      )}
    </section>
  );
}

/** 白板猜词输入条：主动猜词与 30 秒终局猜词共用形态。 */
function GuessPanel({ kind, busy, draft, setDraft, onSubmit }: {
  kind: 'active' | 'final';
  busy: boolean;
  draft: string;
  setDraft: (next: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="uc-panel uc-guess">
      <div className="uc-panel__head">
        <h3>{kind === 'final' ? '最终猜词 · 猜中即胜' : '白板特权 · 猜词机会（仅一次）'}</h3>
        <span>猜中即胜，猜错代价在握</span>
      </div>
      <div className="uc-guess__row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入你认为的平民词"
          aria-label={kind === 'final' ? '最终猜词输入' : '主动猜词输入'}
          disabled={busy}
        />
        <button type="button" className="uc-guess__btn" disabled={busy || draft.trim().length === 0} onClick={onSubmit}>
          提交猜词
        </button>
      </div>
    </div>
  );
}

/** 发言阶段：聚光当前发言者，顺序进度环，白板猜词特权可随时出手。 */
function BlankSpeechPanel({ view, act, busy }: { view: BlankPlayerView; act: Act; busy: boolean }) {
  const { profile } = useUserProfile();
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const [activeDraft, setActiveDraft] = useState('');
  const sessionId = state.game?.sessionId;
  const me = view.me;
  const countdown = useCountdown(view.deadlineAt);
  const currentSpeaker = view.currentSpeakerId;
  const isMyTurn = me !== null && currentSpeaker === me.playerId;
  const playerMap = new Map(view.players.map((player) => [player.playerId, player] as const));
  const speakerInfo = currentSpeaker !== null ? playerMap.get(currentSpeaker) : undefined;
  const currentIndex = view.speakingOrder.findIndex((id) => id === currentSpeaker);

  async function submitActive() {
    const clean = activeDraft.trim();
    if (clean.length === 0) return;
    await act({ type: 'submit_guess', guess: clean, ...(sessionId ? { sessionId } : {}) });
  }

  return (
    <section className="game-phase speaking uc-stage__body blank-speaking">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · 描述发言`}
            title={isMyTurn ? '轮到你发言了' : '倾听同桌玩家的描述'}
            description={isMyTurn ? '用一句话描述，说清又不露底。' : '留意描述与语气，找出对不上号的破绽。'}
            aside={<FocusedCountdown seconds={countdown.secondsLeft} />}
          />

          {speakerInfo !== undefined && (
            <div className={`speaker-spotlight focused-current-actor ${isMyTurn ? 'is-me' : ''}`} aria-live="polite" aria-atomic="true">
              <div className="speaker-spotlight-top">
                <UserAvatar
                  avatar={members.find((m) => m.playerId === speakerInfo.playerId)?.avatar ?? (isMyTurn ? profile.avatar : 'preset:fox')}
                  nickname={isMyTurn ? '我' : nameFor(members, speakerInfo.playerId) || `玩家 ${speakerInfo.seat + 1}`}
                  size={58}
                  className="speaker-avatar-box"
                />
                <div className="speaker-spotlight-copy">
                  <span className="speaker-label">{isMyTurn ? '🎯 轮到你了' : '🎙️ 正在发言'}</span>
                  <strong className="speaker-name">{isMyTurn ? '我' : nameFor(members, speakerInfo.playerId) || `玩家 ${speakerInfo.seat + 1}`}</strong>
                  <span className="speaker-seat">#{speakerInfo.seat + 1} 号座位</span>
                </div>
                <div className="speaker-signal" aria-hidden="true"><i /><i /><i /></div>
              </div>
              <div className="speaker-spotlight-tip">
                {isMyTurn
                  ? (me?.isBlank ? '💡 你是白板：参考前人描述，模糊发言，隐藏自身无词特征！' : '💡 请用一句话描述词条，切勿透露本体！')
                  : '💡 仔细听取描述措辞与语气，白板或卧底往往描述过于空泛！'}
              </div>
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
              {view.speakingOrder.map((pid, index) => {
                const player = playerMap.get(pid);
                if (!player) return null;
                const isCurrent = pid === currentSpeaker;
                const isDone = currentIndex >= 0 && index < currentIndex;
                const isMe = pid === me?.playerId;
                const playerAvatar = members.find((m) => m.playerId === pid)?.avatar ?? (isMe ? profile.avatar : 'preset:fox');
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
                      {isDone ? '✓' : index + 1}
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
                            ? '🎙️ 正在发言中…'
                            : isDone
                              ? '✓ 已完成本轮描述'
                              : '⏳ 等待发言'}
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

          {me?.canGuess && (
            <GuessPanel
              kind="active"
              busy={busy}
              draft={activeDraft}
              setDraft={setActiveDraft}
              onSubmit={() => void submitActive()}
            />
          )}
        </div>
      </div>

      {me !== null && (
        <div className="game-action-dock">
          <button
            type="button"
            className="game-primary-action"
            disabled={busy || !isMyTurn || !me.alive}
            onClick={() => void act({ type: 'finish_speech' })}
          >
            {!me.alive ? '你已出局，本轮观战' : isMyTurn ? (busy ? '提交中…' : '结束发言') : '等待轮到你发言'}
          </button>
          <span>{isMyTurn ? '说完后点击按钮交接给下一位' : '轮到你时按钮会自动点亮'}</span>
        </div>
      )}
    </section>
  );
}

/** 投票阶段：候选人卡网格，一样的贴纸投票卡；白板可在任何时候出手猜词。 */
function BlankVotePanel({ view, act, busy }: { view: BlankPlayerView; act: Act; busy: boolean }) {
  const { profile } = useUserProfile();
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const [activeDraft, setActiveDraft] = useState('');
  const sessionId = state.game?.sessionId;
  const me = view.me;
  const isRunoff = view.phase === 'runoff_voting';
  const myId = me?.playerId ?? null;
  const hasVoted = me?.hasVoted ?? false;
  const myVote = me?.myVote ?? null;
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map(view.players.map((player) => [player.playerId, player] as const));
  const candidateIds = isRunoff
    ? (view.runoffCandidates ?? [])
    : view.players.filter((player) => player.alive).map((player) => player.playerId);

  async function submitActive() {
    const clean = activeDraft.trim();
    if (clean.length === 0) return;
    await act({ type: 'submit_guess', guess: clean, ...(sessionId ? { sessionId } : {}) });
  }

  const votePercent = view.votesExpected > 0 ? (view.votesSubmitted / view.votesExpected) * 100 : 0;
  return (
    <section className="game-phase voting uc-stage__body blank-voting">
      <div className="game-phase-main-grid">
        <div className="game-phase-left-col">
          <PhaseLead
            eyebrow={`第 ${view.round} 轮 · ${isRunoff ? '加赛指认' : '投票指认'}`}
            title={hasVoted ? '选票已锁定' : '指认你心中的白板'}
            description={hasVoted ? '票数在全员投完后统一公开。' : '综合发言表现，把票投给你最怀疑的人。'}
            aside={<FocusedCountdown seconds={countdown.secondsLeft} />}
          />

          <div className="uc-meter" role="status" aria-live="polite" aria-atomic="true">
            <span className="uc-meter__label">已投 {view.votesSubmitted} / {view.votesExpected} 票</span>
            <div className="uc-meter__track" style={{ '--uc-meter': `${votePercent}%` } as CSSProperties}>
              <span />
            </div>
          </div>

          {hasVoted && (
            <GameActionFeedback
              active
              feedbackKey={`vote:${view.round}:${myVote ?? 'abstain'}`}
              variant="success"
              className="vote-done-hint"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>选票已锁定</strong>
              <span>等待其他玩家完成投票…</span>
            </GameActionFeedback>
          )}
          {me !== null && !me.alive && <div className="spectator-hint">你已出局，本回合观战等待结果</div>}
        </div>

        <div className="game-phase-right-col">
          <div className="vote-candidates blank-voting__options">
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
                  onClick={() => void act({ type: 'cast_vote', targetPlayerId: candidateId })}
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

          {me?.canGuess && (
            <GuessPanel
              kind="active"
              busy={busy}
              draft={activeDraft}
              setDraft={setActiveDraft}
              onSubmit={() => void submitActive()}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** 投票结果：结论印章、出局档案与公开票型。 */
function BlankResultPanel({ view }: { view: BlankPlayerView }) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const summary = view.lastVoteSummary;
  const countdown = useCountdown(view.deadlineAt);
  const playerMap = new Map(view.players.map((player) => [player.playerId, player] as const));

  if (summary === null) {
    return (
      <section className="game-phase vote-result uc-stage__body">
        <div className="game-waiting-card">
          <span className="waiting-orbit" aria-hidden="true" />
          <strong>正在统计票数</strong>
          <p>请稍候，结果马上揭晓。</p>
        </div>
      </section>
    );
  }

  const eliminatedPlayer = summary.eliminatedPlayerId !== null ? (playerMap.get(summary.eliminatedPlayerId) ?? null) : null;
  const sortedTally = Object.entries(summary.tally ?? {}).sort(([, left], [, right]) => right - left);
  const maxVotes = Math.max(...sortedTally.map(([, count]) => count), 1);
  const totalVotes = sortedTally.reduce((sum, [, count]) => sum + count, 0);

  return (
    <section className="game-phase vote-result uc-stage__body">
      <PhaseLead
        eyebrow={`第 ${summary.round} 轮 · 结果揭晓`}
        title="本轮投票统计"
        description={summary.kind === 'runoff' ? '这是加赛对决的公开票型。' : '选票已按公开规则完成统计。'}
        aside={<FocusedCountdown seconds={countdown.secondsLeft} label="即将推进" />}
      />

      <div className={`result-banner ${summary.outcome}`}>
        <span className="result-seal" aria-hidden="true">{summary.outcome === 'eliminated' ? '!' : '='}</span>
        <div>
          <strong>{blankOutcomeText(summary)}</strong>
          <span>{eliminatedPlayer ? `${nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1}`} 离场` : '准备进入下一阶段'}</span>
        </div>
      </div>

      {eliminatedPlayer !== null && (
        <div className="eliminated-info">
          <UserAvatar
            avatar={members.find((m) => m.playerId === eliminatedPlayer.playerId)?.avatar ?? 'preset:fox'}
            nickname={nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1} 号玩家`}
            size={44}
            className="eliminated-avatar-box"
          />
          <div>
            <span>身份揭晓</span>
            <strong>{nameFor(members, eliminatedPlayer.playerId) || `#${eliminatedPlayer.seat + 1} 号玩家`}</strong>
          </div>
          <span className={`role-badge ${summary.eliminatedRole ?? ''}`}>{blankRoleLabel(summary.eliminatedRole)}</span>
        </div>
      )}

      {sortedTally.length > 0 && (
        <div className="uc-panel">
          <div className="uc-panel__head">
            <h3>公开票型</h3>
            <span>共 {totalVotes} 票</span>
          </div>
          <ul className="tally-list">
            {sortedTally.map(([playerId, count], index) => {
              const player = playerMap.get(playerId);
              return (
                <li key={playerId} className="tally-item" style={{ '--stagger-index': index } as CSSProperties}>
                  <span className="tally-player">#{player !== undefined ? player.seat + 1 : '?'}<small>{nameFor(members, playerId)}</small></span>
                  <span className="tally-bar"><i style={{ '--fill-percent': `${count / maxVotes * 100}%` } as CSSProperties} /></span>
                  <strong className="tally-count">{count} 票</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 终局猜词：白板被投出后的 30 秒背水一战；他人等待外部裁判裁决。 */
function BlankFinalPanel({ view, act, busy }: { view: BlankPlayerView; act: Act; busy: boolean }) {
  const { state } = useConnection();
  const sessionId = state.game?.sessionId;
  const [finalDraft, setFinalDraft] = useState('');
  const me = view.me;
  const countdown = useCountdown(view.deadlineAt);
  const pending = (me?.guessPending ?? false) || view.guessPending;

  async function submitFinal() {
    const clean = finalDraft.trim();
    if (clean.length === 0) return;
    await act({ type: 'submit_final_guess', guess: clean, ...(sessionId ? { sessionId } : {}) });
  }

  return (
    <section className="game-phase final-guess uc-stage__body blank-final-guess">
      <PhaseLead
        eyebrow="背水一战 · 最终猜词"
        title={me?.canSubmitFinalGuess ? '最后一搏，猜对即胜' : '等待白板最终猜词'}
        description={me?.canSubmitFinalGuess ? '30 秒内猜中平民词，白板方直接锁定胜局。' : '白板正在做最后判断，猜词提交后等待裁判揭晓。'}
        aside={<FocusedCountdown seconds={countdown.secondsLeft} />}
      />

      {me?.canSubmitFinalGuess ? (
        <div className="uc-panel">
          <p className="blank-final-guess__timer">
            <strong>剩余 {countdown.expired ? '0' : countdown.secondsLeft} 秒</strong>
          </p>
          <small className="blank-final-guess__hint">时间到未提交视为放弃，平民方直接获胜</small>
          <GuessPanel
            kind="final"
            busy={busy}
            draft={finalDraft}
            setDraft={setFinalDraft}
            onSubmit={() => void submitFinal()}
          />
          <div className="game-action-dock">
            <button type="button" className="game-primary-action uc-guess__skip" aria-busy={busy} disabled={busy} onClick={() => void act({ type: 'skip_final_guess' })}>
              跳过，接受出局
            </button>
            <span>跳过视为放弃猜词机会</span>
          </div>
        </div>
      ) : pending ? (
        <div className="blank-waiting-adjudication" role="status" aria-live="polite" aria-atomic="true">
          <span className="blank-waiting-adjudication__pulse" aria-hidden="true" />
          <strong>等待裁判判定</strong>
          <span>最终猜词已提交，裁判结果回来后自动结算本局。</span>
        </div>
      ) : (
        <div className="game-waiting-card">
          <span className="waiting-orbit" aria-hidden="true" />
          <strong>白板正在做最终猜词</strong>
          <p>30 秒倒计时结束后自动进入结算。</p>
        </div>
      )}
    </section>
  );
}

/** 结算：胜方横幅、平民词、全员身份档案（白板的身份档案一目了然）。 */
function BlankOverPanel({ view }: { view: BlankPlayerView }) {
  const { profile } = useUserProfile();
  const { me, send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = state.room?.members ?? [];
  const reveal = view.reveal;
  const isHost = me !== null && state.room !== null && (state.room?.members ?? []).some((member) => member.playerId === me.playerId && member.isHost);
  const myId = me?.playerId ?? null;

  async function handleReturnToLobby() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await send('room_command', { command: 'return_to_lobby' }); }
    catch (err) { setError(err instanceof Error ? err.message : '返回大厅失败'); }
    finally { setBusy(false); }
  }

  const sortedPlayers = [...view.players].sort((left, right) => left.seat - right.seat);

  return (
    <section className={`game-phase game-over winner-${view.winner ?? 'draw'} uc-stage__body`}>
      <div className="uc-gameover-main-grid">
        <div className="uc-gameover-left-col">
          <div className="winner-hero">
            <span className="winner-rays" aria-hidden="true" />
            <span className="winner-tag">对局已结算</span>
            <h2 className="winner-title">{view.aborted ? '对局已中止' : view.winner === 'blank' ? '白板方获胜！' : view.winner === 'civilian' ? '平民方获胜！' : '双方平局！'}</h2>
            <p>{view.aborted ? '本局中途中止，身份档案全面公开。' : view.winner === 'blank' ? '白板藏到了最后，或猜中了平民词！' : '白板被众人合力揪出桌面！'}</p>
          </div>

          {reveal !== null && (
            <div className="word-pair">
              <div className="word-item civilian">
                <span className="word-label">平民词条</span>
                <strong className="word-text">{reveal.civilianWord}</strong>
                <span className="word-corner">CIVILIAN</span>
              </div>
              <div className="word-item undercover">
                <span className="word-label">白板词条</span>
                <strong className="word-text">空 白</strong>
                <span className="word-corner">BLANK</span>
              </div>
            </div>
          )}

          <div className="game-action-dock">
            {isHost ? (
              <button type="button" className="game-primary-action" onClick={handleReturnToLobby} disabled={busy || state.connState !== 'synced'}>
                {busy ? '正在返回…' : '返回大厅准备下一局'}
              </button>
            ) : (
              <div className="waiting-host">等待房主返回大厅…</div>
            )}
            <span>{isHost ? '大厅内可调整规则或直接再开一局' : '房主操作后全员自动返回大厅'}</span>
          </div>
        </div>

        <div className="uc-gameover-right-col">
          <div className="uc-panel">
            <div className="uc-panel__head">
              <h3>全员身份档案</h3>
              <span>共 {sortedPlayers.length} 人</span>
            </div>
            <ul className="roles-list">
              {sortedPlayers.map((player, index) => {
                const role = reveal !== null ? reveal.roles?.[player.playerId] : (player.revealedRole ?? null);
                const isMe = player.playerId === myId;
                const member = members.find((m) => m.playerId === player.playerId);
                return (
                  <li key={player.playerId} className={`role-item ${!player.alive ? 'dead' : ''}`} style={{ '--stagger-index': index } as CSSProperties}>
                    <UserAvatar
                      avatar={member?.avatar ?? (isMe ? profile.avatar : 'preset:fox')}
                      nickname={nameFor(members, player.playerId)}
                      size={36}
                      className="role-avatar"
                    />
                    <span className="role-seat">#{player.seat + 1}</span>
                    <span className="role-name">
                      <strong>{isMe ? '我' : nameFor(members, player.playerId) || `玩家 ${player.seat + 1}`}</strong>
                      <small>{!player.alive ? '本局已淘汰' : '存活至结算'}</small>
                    </span>
                    <span className={`role-badge ${role === 'blank' ? 'blank' : role === 'civilian' ? 'civilian' : ''}`}>{blankRoleLabel(role ?? null)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
