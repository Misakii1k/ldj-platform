/**
 * echo_judge_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的伪人测试视角（echo-judge/types.ts）。
 * 定位：线下桌游辅助——App 负责身份/触发词私密分发、判官出题、依次回答计时、
 * 判官指认、计分与终局判定；讨论在线下口头进行。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import type { EchoJudgePlayerView } from './types.ts';

function phaseLabel(phase: EchoJudgePlayerView['phase']): string {
  switch (phase) {
    case 'judge_setup': return '判官出题';
    case 'answering': return '依次回答';
    case 'judgment': return '判官指认';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

interface Props {
  view: EchoJudgePlayerView;
}

export function EchoJudgeGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [accuseTarget, setAccuseTarget] = useState<string | null>(null);

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = view.winners.includes(playerId) ? '获胜' : '失败';
    } else if (playerId === view.judgeId) {
      status = '判官';
    }
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status: `${status}${view.scores[playerId] !== undefined ? ` · ${view.scores[playerId]}分` : ''}`,
      active: playerId === view.judgeId,
    };
  });

  const myIdentityLine = me === null ? null : me.isJudge ? '你是判官' : me.role === 'impostor' ? `你是伪人（触发词：${me.triggerWord}）` : '你是人类';

  // 主导动作：判官出题 / 玩家回答 / 判官指认
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'judge_setup' && me?.isJudge && myId) {
    primary = {
      id: 'start-round',
      label: question.trim() ? `出题：${question.trim()}` : '输入题目',
      disabled: !question.trim(),
      onAction: () => { if (question.trim()) { void act({ type: 'start_round', playerId: myId, question: question.trim() }); setQuestion(''); } },
    };
  } else if (view.phase === 'answering' && me?.myTurn && myId) {
    primary = {
      id: 'submit-answer',
      label: answer.trim() ? '提交回答' : '输入回答',
      disabled: !answer.trim(),
      onAction: () => { if (answer.trim()) { void act({ type: 'submit_answer', playerId: myId, text: answer.trim() }); setAnswer(''); } },
    };
  } else if (view.phase === 'judgment' && me?.isJudge && myId) {
    primary = {
      id: 'accuse',
      label: accuseTarget ? `指认 ${nameFor(members, accuseTarget)} 是伪人` : '选择要指认的玩家',
      disabled: !accuseTarget,
      onAction: () => { if (accuseTarget) { void act({ type: 'accuse', playerId: myId, targetPlayerId: accuseTarget }); setAccuseTarget(null); } },
    };
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `accuse-${id}`,
        label: `${accuseTarget === id ? '✓ ' : ''}${nameFor(members, id)}`,
        disabled: false,
        onAction: () => setAccuseTarget(id),
      }));
  }

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'judge_setup'
      ? `等待判官 ${nameFor(members, view.judgeId)} 出题`
      : view.phase === 'answering'
        ? me?.myTurn ? `回答题目：「${view.question}」` : '等待其他玩家回答'
        : `等待判官 ${nameFor(members, view.judgeId)} 指认伪人`;

  return (
    <TabletopShell
      title="伪人测试"
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
          <p>判官出题，其余玩家依次回答；混有伪人（须把秘密触发词自然藏进话里）。</p>
          <p>判官指认一名伪人：抓对 +1、抓错 −1；被抓伪人 −1、隐藏成功 +2。</p>
          <p>每人当一次判官后结束，最高分获胜。</p>
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

      {me && myIdentityLine && (
        <section className="durian-private" aria-label="我的私密信息">
          <span className="durian-board__label">我的私密信息（仅自己可见）</span>
          <div className="durian-private__cards">
            <span className="durian-private__card">{myIdentityLine}</span>
          </div>
        </section>
      )}

      {view.question && (
        <section className="durian-order" aria-label="当前题目">
          <span className="durian-order__eyebrow">第 {view.round} 轮 · 判官 {nameFor(members, view.judgeId)}</span>
          <p>题目：「{view.question}」</p>
          <p className="goose-accusation__empty">已回答 {view.answeredCount}/{view.players.length - 1} 人</p>
        </section>
      )}

      {view.phase === 'judge_setup' && me?.isJudge && (
        <section className="goose-transmit" aria-label="判官出题">
          <span className="durian-board__label">你的题目（线下口头念出，这里记录）</span>
          <input
            className="goose-transmit__input"
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：你最喜欢哪个季节？"
          />
        </section>
      )}

      {view.phase === 'answering' && me?.myTurn && (
        <section className="goose-transmit" aria-label="我的回答">
          <span className="durian-board__label">你的回答（人类可说谎，伪人须把触发词藏进话里）</span>
          <input
            className="goose-transmit__input"
            value={answer}
            maxLength={200}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="输入你的回答……"
          />
        </section>
      )}

      {view.caughtImpostor !== null && (
        <section className="cheese-dawn" aria-label="上一轮结果">
          <p>{view.caughtImpostor ? '上一轮：判官抓对了伪人！' : '上一轮：判官未抓中，伪人隐藏成功。'}</p>
        </section>
      )}

      {view.phase === 'game_over' && view.reveal && (
        <section className="durian-over" aria-label="对局结果">
          <h2>本局结束</h2>
          <p>最高分获胜：{view.winners.map((id) => nameFor(members, id)).join('、')}</p>
          <ul className="cheese-reveal">
            <li>伪人：{view.players.filter((id) => view.reveal?.roles[id] === 'impostor').map((id) => `${nameFor(members, id)}（触发词：${view.reveal?.triggerWords[id]}）`).join('、')}</li>
          </ul>
        </section>
      )}
    </TabletopShell>
  );
}
