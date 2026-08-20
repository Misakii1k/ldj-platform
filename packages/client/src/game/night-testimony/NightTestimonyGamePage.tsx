/**
 * night_testimony_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的囚徒之夜视角（night-testimony/types.ts）。
 * 定位：线下桌游辅助——App 负责身份/罪行私密分发、YES/NO 标记管理、问答轨迹公开、
 * 推理/投票计时、票出后狱警猜罪判定；问答与辩论在线下口头进行。
 * 视觉：狱审档案——私密记号牌、问答回执、狱警猜罪矩阵。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import type { CrimeId, NightTestimonyPlayerView } from './types.ts';

const CRIME_LABELS: Record<CrimeId, string> = {
  arson: '纵火犯',
  theft: '盗窃犯',
  forgery: '伪造犯',
  smuggling: '走私犯',
  fraud: '诈骗犯',
  kidnap: '绑架犯',
};

function phaseLabel(phase: NightTestimonyPlayerView['phase']): string {
  switch (phase) {
    case 'question': return '问答盘问';
    case 'deduction': return '推理辩论';
    case 'vote': return '票选';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

interface Props {
  view: NightTestimonyPlayerView;
}

export function NightTestimonyGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [askTarget, setAskTarget] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [guessTarget, setGuessTarget] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<Record<string, CrimeId>>({});

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === myId) {
      status = me?.isWarden ? '我是狱警' : `我是${me?.crime ? CRIME_LABELS[me.crime] : '囚犯'}`;
    }
    return { id: playerId, name: nameFor(members, playerId), status, active: false };
  });

  // 主导动作：按阶段唯一
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'question' && myId) {
    if (me?.pendingQuestion) {
      primary = { id: 'answer-yes', label: '回答 YES', disabled: (me.yesLeft ?? 0) <= 0, onAction: () => void act({ type: 'answer', playerId: myId, answer: 'yes' }) };
      secondary = [{ id: 'answer-no', label: '回答 NO', disabled: (me.noLeft ?? 0) <= 0, onAction: () => void act({ type: 'answer', playerId: myId, answer: 'no' }) }];
    } else {
      primary = {
        id: 'ask',
        label: askTarget && questionText.trim() ? `提问 ${nameFor(members, askTarget)}` : '在本页选择对象并输入问题',
        disabled: !(askTarget && questionText.trim()),
        onAction: () => {
          if (!askTarget || !questionText.trim()) return;
          void act({ type: 'ask', playerId: myId, targetPlayerId: askTarget, text: questionText.trim() });
          setAskTarget(null);
          setQuestionText('');
        },
      };
    }
  } else if (view.phase === 'vote' && myId) {
    if (hasVoted) {
      primary = {
        id: 'has-voted',
        label: voteTarget ? `已票选 ${nameFor(members, voteTarget)}` : '已投票，等待开票…',
        disabled: true,
        onAction: () => {},
      };
    } else {
      primary = voteTarget
        ? { id: 'confirm-vote', label: `票选 ${nameFor(members, voteTarget)}`, disabled: false, onAction: () => { void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget }); setHasVoted(true); } }
        : { id: 'wait', label: '在本页选择票选对象', disabled: true, onAction: () => {} };
    }
  } else if (view.guessingInProgress && me?.isWarden && myId) {
    const inmates = view.players.filter((id) => id !== myId);
    const guessComplete = inmates.every((id) => guesses[id] !== undefined);
    primary = {
      id: 'submit-guesses',
      label: guessComplete ? '提交猜罪' : `为每名囚犯选择罪行（${Object.keys(guesses).length}/${inmates.length}）`,
      disabled: !guessComplete,
      onAction: () => {
        if (!guessComplete) return;
        const payload: Record<string, CrimeId> = {};
        for (const id of inmates) payload[id] = guesses[id]!;
        void act({ type: 'submit_guesses', playerId: myId, guesses: payload });
      },
    };
  }

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'question'
      ? me?.pendingQuestion
        ? `${nameFor(members, me.pendingQuestion.questionerId)} 在问你：${me.pendingQuestion.text}`
        : '问答阶段——线下口头提问，本页记录问题与对象'
      : view.phase === 'deduction'
        ? '推理阶段——线下辩论谁可能是狱警'
        : hasVoted
          ? '你已完成投票，等待其他玩家完成投票…'
          : '票选阶段——选出你怀疑的狱警';

  const guessInmate = view.guessingInProgress && me?.isWarden
    ? (guessTarget ?? view.players.find((id) => id !== myId && guesses[id] === undefined) ?? view.players.find((id) => id !== myId) ?? null)
    : null;

  return (
    <TabletopShell
      title="囚徒之夜"
      phase={phaseLabel(view.phase)}
      gameId="night-testimony"
      phaseKey={`${view.phase}:${me?.pendingQuestion?.questionerId ?? view.accusedId ?? (view.guessingInProgress ? view.reveal?.wardenId ?? 'warden' : 'table')}:${view.askedCount}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : view.hasPendingQuestion ? 'question-pending' : view.guessingInProgress ? 'guessing' : 'active'}`}
      spectator={isSpectator}
      players={players}
      theme="mystery"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      )}
      actions={
        <ActionDock
          primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }}
          secondary={secondary}
          busy={busy}
          waitingReason={waitingReason ?? undefined}
        />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>一名狱警伪装成囚犯潜伏。囚犯各有罪行卡，问答时按罪行如实回答，狱警可以撒谎。</p>
          <p>每人 3 个 YES + 1 个 NO 标记：YES 留在公开轨迹，NO 回答后收回。</p>
          <p>票选出狱警后，狱警猜全部囚犯罪行：全对单独获胜，否则囚犯获胜。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage">
          {me && (
            <section className="sg-panel testimony-private" aria-label="我的私密身份">
              <div className="sg-panel__head">
                <h3>我的私密档案（按住翻开 · 防窥）</h3>
                <span>记号余量</span>
              </div>
              <IdentityFlipCard
                theme="prison"
                variant="compact"
                roleName={me.isWarden ? '狱警' : me.crime ? CRIME_LABELS[me.crime] : '囚犯'}
                roleSubtitle={me.isWarden ? '卧底潜伏 · 可撒谎' : '嫌疑囚犯 · 须如实应答'}
                roleCamp={me.isWarden ? 'evil' : 'good'}
                secretHints={
                  me.isWarden
                    ? ['【绝密】你是潜伏在囚犯中的狱警！回答问题时可以撒谎误导他人，避免被票出。']
                    : ['你是囚犯！面对其他人的提问必须根据你的真实罪行如实回答 YES/NO。']
                }
              >
                <div className="sg-chip-row" style={{ marginTop: '8px', justifyContent: 'center' }}>
                  <span className="sg-chip testimony-token testimony-token--yes">
                    YES 记号余量：
                    {Array.from({ length: 3 }, (_, i) => (
                      <i key={i} className={i < (me.yesLeft ?? 0) ? 'is-left' : ''} aria-hidden="true">Y</i>
                    ))}
                  </span>
                  <span className="sg-chip testimony-token testimony-token--no">
                    NO 记号余量：
                    {Array.from({ length: 1 }, (_, i) => (
                      <i key={i} className={i < (me.noLeft ?? 0) ? 'is-left' : ''} aria-hidden="true">N</i>
                    ))}
                  </span>
                </div>
              </IdentityFlipCard>
            </section>
          )}

          {view.phase === 'question' && !me?.pendingQuestion && myId && (
            <section className="sg-panel" aria-label="提问">
              <div className="sg-panel__head">
                <h3>提出你的问题</h3>
                <span>线下口头问 · 本页记录</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`sg-chip sg-chip--btn ${askTarget === id ? 'sg-chip--selected' : ''}`}
                    onClick={() => setAskTarget(id)}
                    aria-pressed={askTarget === id}
                  >
                    问 {nameFor(members, id)}
                  </button>
                ))}
              </div>
              <input
                className="goose-transmit__input"
                value={questionText}
                maxLength={200}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="例如：你的罪行是纵火吗？"
                aria-label="问题内容"
              />
            </section>
          )}

          {view.phase === 'question' && me?.pendingQuestion && (
            <section className="testimony-pending" aria-label="待回答的问题">
              <span className="testimony-pending__seal" aria-hidden="true">?</span>
              <div>
                <span className="testimony-pending__label">{nameFor(members, me.pendingQuestion.questionerId)} 在问你</span>
                <strong className="testimony-pending__text">「{me.pendingQuestion.text}」</strong>
                <span className="testimony-pending__hint">囚犯按罪行如实回答；狱警可以撒谎。</span>
              </div>
            </section>
          )}

          <section className="sg-panel" aria-label="问答轨迹">
            <div className="sg-panel__head">
              <h3>问答轨迹（公开）</h3>
              <span>{view.askedCount}/{view.questionLimit} 问</span>
            </div>
            {(view.yesTrack ?? []).length === 0
              ? <p className="sg-hint">尚无问答记录</p>
              : (
                <ol className="testimony-track">
                  {(view.yesTrack ?? []).map((record, index) => (
                    <li key={index}>
                      <span className="testimony-track__idx">{index + 1}</span>
                      <div className="testimony-track__body">
                        <strong>{nameFor(members, record.questionerId)} → {nameFor(members, record.responderId)}</strong>
                        <span>{record.question}</span>
                      </div>
                      <span className={`testimony-track__mark testimony-track__mark--${record.answer === 'yes' ? 'yes' : 'no'}`}>
                        {record.answer === 'yes' ? 'YES' : 'NO'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
          </section>

          {view.phase === 'deduction' && view.extraCrime && (
            <section className="sg-panel" aria-label="额外罪行卡">
              <div className="sg-panel__head">
                <h3>额外混入的罪行卡</h3>
                <span>推理阶段</span>
              </div>
              <div className="testimony-crime-row">
                <span className="testimony-crime">{CRIME_LABELS[view.extraCrime]}</span>
              </div>
              <p className="sg-hint">线下辩论：谁最像伪装的狱警？</p>
            </section>
          )}

          {view.guessingInProgress && me?.isWarden && guessInmate && (
            <section className="sg-panel" aria-label="狱警猜罪">
              <div className="sg-panel__head">
                <h3>狱警猜罪 · 点选罪行</h3>
                <span>先选囚犯，再点罪行</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`sg-chip sg-chip--btn ${guessInmate === id ? 'sg-chip--selected' : ''}`}
                    onClick={() => setGuessTarget(id)}
                    aria-pressed={guessInmate === id}
                  >
                    {nameFor(members, id)}{guesses[id] ? `（${CRIME_LABELS[guesses[id]!]}）` : ''}
                  </button>
                ))}
              </div>
              <div className="sg-chip-row testimony-crime-picks">
                {(Object.keys(CRIME_LABELS) as CrimeId[]).map((crime) => (
                  <button
                    key={crime}
                    type="button"
                    className={`sg-chip sg-chip--btn ${guesses[guessInmate] === crime ? 'sg-chip--m' : ''}`}
                    onClick={() => setGuesses((prev) => ({ ...prev, [guessInmate]: crime }))}
                  >
                    {CRIME_LABELS[crime]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {view.phase === 'vote' && myId && (
            <section className="sg-panel" aria-label="票选狱警">
              <div className="sg-panel__head">
                <h3>{hasVoted ? '✓ 你的投票已完成' : '票选你怀疑的狱警'}</h3>
                <span>{hasVoted ? '已提交，等待开票' : '点选后在下方栏确认'}</span>
              </div>
              {hasVoted && (
                <p className="sg-hint" style={{ color: 'var(--brand-accent, #10b981)', fontWeight: 800 }}>
                  ✓ {voteTarget ? `你已票选 ${nameFor(members, voteTarget)}` : '已投票'}，正在等待其他玩家完成投票…
                </p>
              )}
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={hasVoted}
                    className={`sg-chip sg-chip--btn ${voteTarget === id ? 'sg-chip--selected' : ''}`}
                    style={{ opacity: hasVoted && voteTarget !== id ? 0.45 : 1, cursor: hasVoted ? 'not-allowed' : 'pointer' }}
                    onClick={() => !hasVoted && setVoteTarget(id)}
                    aria-pressed={voteTarget === id}
                  >
                    {voteTarget === id ? '✓ ' : ''}{nameFor(members, id)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        view.reveal && (() => {
          const reveal = view.reveal;
          return (
            <div className="sg-stage testimony-over">
              <div className={`winner-hero ${reveal.wardenRevealed && reveal.crimesAllGuessed ? '' : 'winner-draw'}`}>
                <span className="winner-rays" aria-hidden="true" />
                <h2 className="winner-title">
                  {!reveal.wardenRevealed
                    ? '狱警逃过了票选！'
                    : reveal.crimesAllGuessed
                      ? '狱警猜中了全部罪行，单独获胜！'
                      : '狱警猜错了罪行，囚犯们获胜！'}
                </h2>
                <p>
                  {!reveal.wardenRevealed || !reveal.crimesAllGuessed
                    ? `${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')} 获胜`
                    : nameFor(members, reveal.wardenId)}
                </p>
              </div>
              <section className="sg-panel">
                <div className="sg-panel__head">
                  <h3>本局档案</h3>
                  <span>全员罪行公开</span>
                </div>
                <ul className="sg-note-list">
                  <li>狱警：{nameFor(members, reveal.wardenId)}</li>
                  <li>罪行：{view.players.map((id) => `${nameFor(members, id)}·${id === reveal.wardenId ? '—' : CRIME_LABELS[reveal.crimes?.[id] ?? 'arson']}`).join('、')}</li>
                  {reveal.wardenGuesses && (
                    <li>狱警猜罪：{view.players.filter((id) => id !== reveal.wardenId).map((id) => `${nameFor(members, id)}→${CRIME_LABELS[reveal.wardenGuesses?.[id] ?? 'arson']}`).join('、')}</li>
                  )}
                </ul>
              </section>
            </div>
          );
        })()
      )}
    </TabletopShell>
  );
}
