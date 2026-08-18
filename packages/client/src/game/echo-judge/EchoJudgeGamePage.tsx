/**
 * echo_judge_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的伪人测试视角（echo-judge/types.ts）。
 * 定位：线下桌游辅助——App 负责身份/触发词私密分发、判官出题、依次回答计时、
 * 判官指认、计分与终局判定；讨论在线下口头进行。
 * 视觉：判庭主题——判官题板、测谎进度、指认矩阵。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
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
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === view.judgeId) {
      status = '判官';
    }
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status: `${status}${view.scores?.[playerId] !== undefined ? ` · ${view.scores?.[playerId]}分` : ''}`,
      active: playerId === view.judgeId,
    };
  });

  // 主导动作：判官出题 / 玩家回答 / 判官指认（指认对象在舞台面板点选，不再塞操作坞）
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  const secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

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
      label: accuseTarget ? `指认 ${nameFor(members, accuseTarget)} 是伪人` : '在本页选择要指认的玩家',
      disabled: !accuseTarget,
      onAction: () => { if (accuseTarget) { void act({ type: 'accuse', playerId: myId, targetPlayerId: accuseTarget }); setAccuseTarget(null); } },
    };
  }

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'judge_setup'
      ? `等待判官 ${nameFor(members, view.judgeId)} 出题`
      : view.phase === 'answering'
        ? me?.myTurn ? `回答题目：「${view.question}」` : '等待其他玩家回答'
        : `等待判官 ${nameFor(members, view.judgeId)} 指认伪人`;

  const answerTotal = Math.max(view.players.length - 1, 1);
  const answerPercent = (view.answeredCount / answerTotal) * 100;

  return (
    <TabletopShell
      title="伪人测试"
      phase={phaseLabel(view.phase)}
      spectator={isSpectator}
      players={players}
      theme="court"
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
          <p>判官出题，其余玩家依次回答；混有伪人（须把秘密触发词自然藏进话里）。</p>
          <p>判官指认一名伪人：抓对 +1、抓错 −1；被抓伪人 −1、隐藏成功 +2。</p>
          <p>每人当一次判官后结束，最高分获胜。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage">
          {me && (
            <section className="sg-panel" aria-label="我的私密身份">
              <div className="sg-panel__head">
                <h3>我的私密身份（按住翻开 · 防窥）</h3>
                <span>测谎协议</span>
              </div>
              <IdentityFlipCard
                theme="cyber"
                variant="compact"
                roleName={me.isJudge ? '判官' : me.role === 'impostor' ? '伪人（Echo）' : '人类'}
                roleSubtitle={me.isJudge ? '审判者阵营' : me.role === 'impostor' ? '异常伪人阵营' : '正常人类阵营'}
                roleCamp={me.isJudge ? 'special' : me.role === 'impostor' ? 'echo' : 'human'}
                secretWord={me.role === 'impostor' && me.triggerWord ? me.triggerWord : undefined}
                secretHints={
                  me.isJudge
                    ? ['向全员出题并聆听回答，指认出将触发词藏进话里的伪人。']
                    : me.role === 'impostor'
                      ? ['【绝密】你必须在回答中自然藏入秘密触发词，切勿被判官察觉！']
                      : ['如实或策略性回答判官题目；人类可以故意撒谎误导判官保护同伴。']
                }
              />
            </section>
          )}

          {view.question && (
            <section className="sg-panel" aria-label="当前题目">
              <div className="sg-panel__head">
                <h3>第 {view.round} 轮题目</h3>
                <span>判官 {nameFor(members, view.judgeId)}</span>
              </div>
              <p className="echo-question">「{view.question}」</p>
              <div className="uc-meter" role="status">
                <span className="uc-meter__label">已回答 {view.answeredCount} / {answerTotal} 人</span>
                <div className="uc-meter__track" style={{ '--uc-meter': `${answerPercent}%` } as never}>
                  <span />
                </div>
              </div>
            </section>
          )}

          {view.phase === 'judge_setup' && me?.isJudge && (
            <section className="sg-panel" aria-label="判官出题">
              <div className="sg-panel__head">
                <h3>出题</h3>
                <span>线下口头念出 · 本页记录</span>
              </div>
              <input
                className="goose-transmit__input"
                value={question}
                maxLength={200}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如：你最喜欢哪个季节？"
                aria-label="题目内容"
              />
            </section>
          )}

          {view.phase === 'answering' && me?.myTurn && (
            <section className="sg-panel" aria-label="我的回答">
              <div className="sg-panel__head">
                <h3>轮到你回答</h3>
                <span>{me.role === 'impostor' ? '伪人须把触发词藏进话里' : '人类可说谎'}</span>
              </div>
              <input
                className="goose-transmit__input"
                value={answer}
                maxLength={200}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="输入你的回答……"
                aria-label="回答内容"
              />
            </section>
          )}

          {view.phase === 'judgment' && me?.isJudge && (
            <section className="sg-panel" aria-label="指认伪人">
              <div className="sg-panel__head">
                <h3>谁把触发词藏进了回答？</h3>
                <span>点选后在下方栏指认</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`sg-chip sg-chip--btn ${accuseTarget === id ? 'sg-chip--selected' : ''}`}
                    onClick={() => setAccuseTarget(id)}
                    aria-pressed={accuseTarget === id}
                  >
                    {nameFor(members, id)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {view.caughtImpostor !== null && (
            <div className={`result-banner ${view.caughtImpostor ? 'eliminated' : 'tie'}`}>
              <span className="result-seal" aria-hidden="true">{view.caughtImpostor ? '✓' : '×'}</span>
              <div>
                <strong>{view.caughtImpostor ? '上一轮：判官抓对了伪人！' : '上一轮：判官未抓中'}</strong>
                <span>{view.caughtImpostor ? '伪人 −1 分，判官 +1 分' : '伪人隐藏成功 +2 分'}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        view.reveal && (
          <div className="sg-stage">
            <div className="winner-hero">
              <span className="winner-rays" aria-hidden="true" />
              <h2 className="winner-title">最高分获胜</h2>
              <p>{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}</p>
            </div>
            <section className="sg-panel">
              <div className="sg-panel__head">
                <h3>本局档案</h3>
                <span>伪人身份公开</span>
              </div>
              <ul className="sg-note-list">
                <li>伪人：{view.players.filter((id) => view.reveal?.roles?.[id] === 'impostor').map((id) => `${nameFor(members, id)}（触发词：${view.reveal?.triggerWords?.[id]}）`).join('、')}</li>
              </ul>
            </section>
          </div>
        )
      )}
    </TabletopShell>
  );
}
