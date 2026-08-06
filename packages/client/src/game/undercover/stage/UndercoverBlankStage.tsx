/**
 * undercover_blank_v1 主舞台（D4-B-UI）。
 * 只消费严格解析后的 blank 视角（undercover/types.ts parseBlankView）。
 * 要点：有词方（平民共享词）与无词方（白板显式无词）区分、
 * 白板主动猜词入口、30 秒终局猜词 UI、等待裁判层（guessPending）。
 * 猜词明文与服务端裁判结果永不进入本组件之外的可信数据流。
 */
import { useState } from 'react';
import { useConnection } from '../../../connection/useConnection.ts';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { GameLeaveButton } from '../../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../../useGameAction.ts';
import type { BlankPhase, BlankPlayerView, BlankRole } from '../types.ts';

interface Props {
  view: BlankPlayerView;
}

function phaseLabel(phase: BlankPhase): string {
  switch (phase) {
    case 'word_reveal': return '查看词条';
    case 'speaking': return '描述发言';
    case 'voting': return '投票';
    case 'runoff_voting': return '加赛投票';
    case 'vote_result': return '投票结果';
    case 'final_guess': return '最终猜词';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

function roleLabel(role: BlankRole | null): string {
  if (role === 'blank') return '白板';
  if (role === 'civilian') return '平民';
  return '未知';
}

export function UndercoverBlankStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [guess, setGuess] = useState('');
  const [revealedWord, setRevealedWord] = useState(false);
  const me = view.me;
  const isSpectator = me === null || me === undefined;
  const countdown = useCountdown(view.deadlineAt);

  const alivePlayers = view.players.filter((p) => p.alive);
  const meAlive = me?.alive ?? false;
  const pendingAdjudication = view.guessPending;
  // 裁判任务 effect 要求 sessionId 与会话一致（平台校验），取自 game_state 信封。
  const sessionId = state.game?.sessionId;

  async function submitFinal() {
    if (guess.trim().length === 0) return;
    await act({
      type: 'submit_final_guess',
      guess: guess.trim(),
      ...(sessionId ? { sessionId } : {}),
    });
  }

  async function submitActive() {
    if (guess.trim().length === 0) return;
    await act({
      type: 'submit_guess',
      guess: guess.trim(),
      ...(sessionId ? { sessionId } : {}),
    });
  }

  return (
    <main className={`blank-stage phase-${view.phase}`}>
      <header className="blank-stage__header">
        <div className="blank-stage__copy">
          <span className="blank-stage__kicker">SECRET FILE · 白板规则</span>
          <h1>谁是卧底 · 白板</h1>
          <p>第 {view.round} 轮 · {phaseLabel(view.phase)}</p>
        </div>
        <GameLeaveButton />
      </header>

      {error && <p className="game-error blank-stage__error" role="alert">{error}</p>}

      {pendingAdjudication && view.phase !== 'final_guess' && (
        <div className="blank-waiting-adjudication" role="status">
          <span className="blank-waiting-adjudication__pulse" aria-hidden="true" />
          <strong>等待裁判判定</strong>
          <span>白板已提交猜词，结果返回后自动继续（不影响发言/投票流程）</span>
        </div>
      )}

      <section className="blank-players" aria-label="玩家列表">
        {view.players.map((player) => (
          <div
            key={player.playerId}
            className={[
              'blank-player',
              player.alive ? 'is-alive' : 'is-out',
              player.playerId === me?.playerId ? 'is-self' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="blank-player__seat">{player.seat}</span>
            <strong>{nameFor(members, player.playerId)}</strong>
            <span>{player.alive ? '在场' : '已出局'}</span>
            {player.revealedRole !== null && (
              <small className="blank-player__role">{roleLabel(player.revealedRole)}</small>
            )}
          </div>
        ))}
      </section>

      {view.phase === 'word_reveal' && (
        <section className="blank-word-card" aria-label="我的词条">
          {me?.isBlank ? (
            <div className="blank-word-card__blank">
              <strong>你是白板</strong>
              <span>你没有词。不要暴露「无词」这件事，仔细观察并模仿他人的描述。</span>
            </div>
          ) : me?.word ? (
            <>
              <p className="blank-word-card__hint">你的词条（长按查看，松手立即遮挡）</p>
              <div
                className={`blank-word-card__box ${revealedWord ? 'revealed' : 'hidden'}`}
                role="button"
                tabIndex={0}
                aria-label="长按查看秘密词"
                onPointerDown={() => setRevealedWord(true)}
                onPointerUp={() => setRevealedWord(false)}
                onPointerLeave={() => setRevealedWord(false)}
                onPointerCancel={() => setRevealedWord(false)}
                onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setRevealedWord(true); }}
                onKeyUp={() => setRevealedWord(false)}
              >
                {revealedWord ? <span className="blank-word-card__word">{me.word}</span> : <span>长按查看秘密词</span>}
              </div>
            </>
          ) : (
            <p className="blank-waiting-card">等待其他玩家看词…</p>
          )}
          {!isSpectator && me && !me.confirmed && (
            <button
              type="button"
              className="game-primary-action"
              disabled={busy}
              onClick={() => void act({ type: 'confirm_word' })}
            >
              我已记下，确认就绪
            </button>
          )}
        </section>
      )}

      {view.phase === 'speaking' && (
        <section className="blank-speaking" aria-label="发言阶段">
          <p>
            当前发言：{nameFor(members, view.currentSpeakerId)}
            {view.deadlineAt !== null && !countdown.expired ? ` · ${countdown.secondsLeft} 秒` : ''}
          </p>
          {me && me.playerId === view.currentSpeakerId && (
            <button type="button" disabled={busy} onClick={() => void act({ type: 'finish_speech' })}>
              结束发言
            </button>
          )}
          {me?.canGuess && (
            <div className="blank-guess-box">
              <p>你是白板：可在本轮主动提交猜词（唯一一次机会）</p>
              <input
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder="输入你认为的平民词"
                aria-label="主动猜词输入"
              />
              <button type="button" disabled={busy || guess.trim().length === 0} onClick={() => void submitActive()}>
                提交猜词
              </button>
            </div>
          )}
        </section>
      )}

      {(view.phase === 'voting' || view.phase === 'runoff_voting') && (
        <section className="blank-voting" aria-label="投票阶段">
          <p>已投 {view.votesSubmitted} / {view.votesExpected}</p>
          {view.phase === 'runoff_voting' && (
            <p>加赛候选：{view.runoffCandidates.map((id) => nameFor(members, id)).join('、')}</p>
          )}
          <div className="blank-voting__options">
            {alivePlayers
              .filter((p) => p.playerId !== me?.playerId)
              .map((player) => (
                <button
                  key={player.playerId}
                  type="button"
                  disabled={busy || !meAlive}
                  onClick={() => void act({ type: 'cast_vote', targetPlayerId: player.playerId })}
                >
                  投给 {nameFor(members, player.playerId)}
                </button>
              ))}
          </div>
          {me?.canGuess && (
            <div className="blank-guess-box">
              <p>你是白板：可提交主动猜词（唯一一次机会）</p>
              <input
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder="输入你认为的平民词"
                aria-label="主动猜词输入"
              />
              <button type="button" disabled={busy || guess.trim().length === 0} onClick={() => void submitActive()}>
                提交猜词
              </button>
            </div>
          )}
        </section>
      )}

      {view.phase === 'vote_result' && (
        <section className="blank-vote-result" aria-label="投票结果">
          {view.lastVoteSummary ? (
            <>
              <p>
                出局：{nameFor(members, view.lastVoteSummary.eliminatedPlayerId)}
                {view.lastVoteSummary.eliminatedRole !== null
                  ? ` · 身份 ${roleLabel(view.lastVoteSummary.eliminatedRole)}`
                  : ' · 身份暂不公开'}
              </p>
              {Object.entries(view.lastVoteSummary.tally).map(([target, count]) => (
                <span key={target}>{nameFor(members, target)}：{count} 票</span>
              ))}
            </>
          ) : (
            <p>本轮无人被淘汰</p>
          )}
        </section>
      )}

      {view.phase === 'final_guess' && (
        <section className="blank-final-guess" aria-label="最终猜词">
          {me?.canSubmitFinalGuess ? (
            <>
              <p>你是白板：被投票淘汰，进入 30 秒最终猜词。猜对即白板方获胜。</p>
              <p className="blank-final-guess__timer">
                剩余 {countdown.expired ? '0' : countdown.secondsLeft} 秒
              </p>
              <input
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder="输入你认为的平民词"
                aria-label="最终猜词输入"
                disabled={busy}
              />
              <div className="blank-final-guess__actions">
                <button type="button" disabled={busy || guess.trim().length === 0} onClick={() => void submitFinal()}>
                  提交猜词
                </button>
                <button type="button" className="is-secondary" disabled={busy} onClick={() => void act({ type: 'skip_final_guess' })}>
                  跳过
                </button>
              </div>
            </>
          ) : me?.guessPending || view.guessPending ? (
            <div className="blank-waiting-adjudication" role="status">
              <span className="blank-waiting-adjudication__pulse" aria-hidden="true" />
              <strong>等待裁判判定</strong>
              <span>白板的最终猜词已提交，等待外部裁判结果…</span>
            </div>
          ) : (
            <p className="blank-waiting-card">白板正在做最终猜词…</p>
          )}
        </section>
      )}

      {view.phase === 'game_over' && (
        <section className="blank-game-over" aria-label="对局结果">
          <h2>{view.winner === 'blank' ? '白板方获胜' : view.winner === 'civilian' ? '平民方获胜' : '对局结束'}</h2>
          {view.reveal && (
            <>
              <p>平民词：{view.reveal.civilianWord}</p>
              <ul className="blank-game-over__roles">
                {Object.entries(view.reveal.roles).map(([playerId, role]) => (
                  <li key={playerId}>{nameFor(members, playerId)} · {roleLabel(role)}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {isSpectator && view.phase !== 'game_over' && (
        <p className="blank-spectator-note">观战中 · 词条与猜词仅对玩家本人显示</p>
      )}
    </main>
  );
}
