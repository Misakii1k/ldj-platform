/**
 * night_testimony_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的囚徒之夜视角（night-testimony/types.ts）。
 * 定位：线下桌游辅助——App 负责身份/罪行私密分发、YES/NO 标记管理、问答轨迹公开、
 * 推理/投票计时、票出后狱警猜罪判定；问答与辩论在线下口头进行。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
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
  const [guessTarget, setGuessTarget] = useState<string | null>(null);
  const [guessCrime, setGuessCrime] = useState<CrimeId | null>(null);
  const [guesses, setGuesses] = useState<Record<string, CrimeId>>({});

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = view.winners.includes(playerId) ? '获胜' : '失败';
    } else if (playerId === myId) {
      status = me?.isWarden ? '我是狱警' : `我是${me?.crime ? CRIME_LABELS[me.crime] : '囚犯'}`;
    }
    return { id: playerId, name: nameFor(members, playerId), status, active: false };
  });

  const myIdentityLine = me === null ? null : me.isWarden ? '你是狱警，可撒谎' : `你的罪行：${me.crime ? CRIME_LABELS[me.crime] : ''}`;

  // 主导动作：按阶段唯一
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'question' && myId) {
    if (me?.pendingQuestion) {
      // 轮到我回答
      primary = { id: 'answer-yes', label: '回答 YES', disabled: (me.yesLeft ?? 0) <= 0, onAction: () => void act({ type: 'answer', playerId: myId, answer: 'yes' }) };
      secondary = [{ id: 'answer-no', label: '回答 NO', disabled: (me.noLeft ?? 0) <= 0, onAction: () => void act({ type: 'answer', playerId: myId, answer: 'no' }) }];
    } else {
      // 我可以提问
      primary = {
        id: 'ask',
        label: askTarget && questionText.trim() ? `提问 ${nameFor(members, askTarget)}` : '选择问题对象与内容',
        disabled: !(askTarget && questionText.trim()),
        onAction: () => {
          if (!askTarget || !questionText.trim()) return;
          void act({ type: 'ask', playerId: myId, targetPlayerId: askTarget, text: questionText.trim() });
          setAskTarget(null);
          setQuestionText('');
        },
      };
      secondary = view.players
        .filter((id) => id !== myId)
        .map((id) => ({
          id: `ask-${id}`,
          label: `${askTarget === id ? '✓ ' : ''}${nameFor(members, id)}`,
          disabled: false,
          onAction: () => setAskTarget(id),
        }));
    }
  } else if (view.phase === 'vote' && myId) {
    primary = voteTarget
      ? { id: 'confirm-vote', label: `票选 ${nameFor(members, voteTarget)}`, disabled: false, onAction: () => { void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget }); setVoteTarget(null); } }
      : null;
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `vote-${id}`,
        label: `${voteTarget === id ? '✓ ' : ''}${nameFor(members, id)}`,
        disabled: false,
        onAction: () => setVoteTarget(id),
      }));
  } else if (view.guessingInProgress && me?.isWarden && myId) {
    // 狱警猜罪：为每名囚犯选罪行
    const inmates = view.players.filter((id) => id !== myId);
    const guessComplete = inmates.every((id) => guesses[id] !== undefined);
    primary = {
      id: 'submit-guesses',
      label: guessComplete ? '提交猜罪' : '为每名囚犯选择一个罪行',
      disabled: !guessComplete,
      onAction: () => {
        if (!guessComplete) return;
        const payload: Record<string, CrimeId> = {};
        for (const id of inmates) payload[id] = guesses[id]!;
        void act({ type: 'submit_guesses', playerId: myId, guesses: payload });
      },
    };
    const target = guessTarget ?? inmates[0] ?? null;
    secondary = (Object.keys(CRIME_LABELS) as CrimeId[]).map((crime) => ({
      id: `guess-${crime}`,
      label: `${target && guesses[target] === crime ? '✓ ' : ''}${CRIME_LABELS[crime]}`,
      disabled: false,
      onAction: () => {
        if (target) {
          setGuesses((prev) => ({ ...prev, [target]: crime }));
          setGuessCrime(crime);
        }
      },
    }));
    // 切换被猜对象
    const targetSwitchers = inmates.map((id) => ({
      id: `guess-target-${id}`,
      label: `${target === id ? '✓ ' : ''}${nameFor(members, id)}${guesses[id] ? `（${CRIME_LABELS[guesses[id]!]}）` : ''}`,
      disabled: false,
      onAction: () => setGuessTarget(id),
    }));
    secondary = [...targetSwitchers, ...secondary];
  }

  void guessCrime;

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'question'
      ? me?.pendingQuestion
        ? `${nameFor(members, me.pendingQuestion.questionerId)} 在问你：${me.pendingQuestion.text}`
        : '问答阶段——线下口头提问，输入问题并选择被问者'
      : view.phase === 'deduction'
        ? '推理阶段——线下辩论谁可能是狱警'
        : '票选阶段——选出你怀疑的狱警';

  return (
    <TabletopShell
      title="暗夜证词"
      phase={phaseLabel(view.phase)}
      spectator={isSpectator}
      players={players}
      actions={
        primary || secondary.length > 0
          ? <ActionDock primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} secondary={secondary} busy={busy} waitingReason={waitingReason ?? undefined} />
          : <ActionDock primary={{ id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} busy={busy} waitingReason={waitingReason ?? undefined} />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>一名狱警伪装成囚犯潜伏。囚犯各有罪行卡，问答时按罪行如实回答，狱警可以撒谎。</p>
          <p>每人 3 个 YES + 1 个 NO 标记：YES 留在公开轨迹，NO 回答后收回。</p>
          <p>票选出狱警后，狱警猜全部囚犯罪行：全对单独获胜，否则囚犯获胜。</p>
        </GameDrawer>
      )}
    >
      <header className="durian-page__bar">
        <GameLeaveButton />
        <button ref={rulesRef} type="button" className="durian-page__rules" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      </header>

      {error && <p className="game-error" role="alert">{error}</p>}

      {me && (
        <section className="durian-private" aria-label="我的私密信息">
          <span className="durian-board__label">我的私密信息（仅自己可见）</span>
          <div className="durian-private__cards">
            <span className="durian-private__card">{myIdentityLine}</span>
            <span className="durian-private__card">YES <strong>{me.yesLeft}</strong> · NO <strong>{me.noLeft}</strong></span>
          </div>
        </section>
      )}

      {view.phase === 'question' && !me?.pendingQuestion && myId && (
        <section className="goose-transmit" aria-label="提问">
          <span className="durian-board__label">你的问题（线下口头问，这里记录）</span>
          <input
            className="goose-transmit__input"
            value={questionText}
            maxLength={200}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="例如：你的罪行是纵火吗？"
          />
        </section>
      )}

      {view.phase === 'question' && me?.pendingQuestion && (
        <section className="testimony-pending" aria-label="待回答的问题">
          <p className="durian-board__label">{nameFor(members, me.pendingQuestion.questionerId)} 在问你</p>
          <p className="testimony-pending__text">「{me.pendingQuestion.text}」</p>
          <p className="testimony-pending__hint">囚犯按罪行如实回答；狱警可以撒谎。</p>
        </section>
      )}

      {/* 公开轨迹：谁问了谁，YES/NO 结果 */}
      <section className="goose-chain" aria-label="问答轨迹">
        <span className="durian-board__label">问答轨迹（公开）· {view.askedCount}/{view.questionLimit}</span>
        <ol className="goose-chain__list">
          {view.yesTrack.length === 0 && <li className="testimony-empty">尚无问答</li>}
          {view.yesTrack.map((record, index) => (
            <li key={index}>
              <strong>{nameFor(members, record.questionerId)} → {nameFor(members, record.responderId)}</strong>
              <span>{record.answer === 'yes' ? 'YES' : 'NO'} · {record.question}</span>
            </li>
          ))}
        </ol>
      </section>

      {view.phase === 'deduction' && view.extraCrime && (
        <section className="durian-order" aria-label="额外罪行卡">
          <span className="durian-order__eyebrow">推理阶段</span>
          <p>额外混入的罪行卡：<strong>{CRIME_LABELS[view.extraCrime]}</strong> ——线下辩论谁可能是狱警。</p>
        </section>
      )}

      {view.guessingInProgress && me?.isWarden && (
        <section className="durian-order" aria-label="狱警猜罪">
          <span className="durian-order__eyebrow">狱警被票出了</span>
          <p>你要猜出每名囚犯的罪行：先选囚犯，再选罪行。</p>
        </section>
      )}

      {view.phase === 'game_over' && view.reveal && (() => {
        const reveal = view.reveal;
        return (
          <section className="durian-over" aria-label="对局结果">
            <h2>本局结束</h2>
            <p>
              {!reveal.wardenRevealed
                ? `狱警逃过了票选！${view.winners.map((id) => nameFor(members, id)).join('、')} 获胜`
                : reveal.crimesAllGuessed
                  ? `狱警猜中了全部罪行，单独获胜！${nameFor(members, reveal.wardenId)}`
                  : `狱警猜错了罪行，囚犯们获胜！${view.winners.map((id) => nameFor(members, id)).join('、')}`}
            </p>
            <ul className="cheese-reveal">
              <li>狱警：{nameFor(members, reveal.wardenId)}</li>
              <li>罪行：{view.players.map((id) => `${nameFor(members, id)}·${id === reveal.wardenId ? '—' : CRIME_LABELS[reveal.crimes[id] ?? 'arson']}`).join('、')}</li>
              {reveal.wardenGuesses && (
                <li>狱警猜罪：{view.players.filter((id) => id !== reveal.wardenId).map((id) => `${nameFor(members, id)}→${CRIME_LABELS[reveal.wardenGuesses![id] ?? 'arson']}`).join('、')}</li>
              )}
            </ul>
          </section>
        );
      })()}
    </TabletopShell>
  );
}
