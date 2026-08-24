/**
 * echo_judge_v1 客户端主页面（线下桌游辅助与卡牌道具形态）。
 * 只消费严格解析后的伪人测试视角（echo-judge/types.ts）。
 * 视觉：赛博法庭——自由选阵营、测谎出题、秘密藏词口头发言、判官多选指认与比分板。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import type { EchoJudgePlayerView, TopicCardView } from './types.ts';

function phaseLabel(phase: EchoJudgePlayerView['phase']): string {
  switch (phase) {
    case 'judge_setup': return '身份选择与出题';
    case 'answering': return '法庭辩论';
    case 'judgment': return '审判长指认';
    case 'game_over': return '审判结案';
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

  // 移动端身份折叠展开
  const [identityExpandedMobile, setIdentityExpandedMobile] = useState(false);

  // 选卡出题状态
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  // 判官多选指认状态
  const [selectedAccuseTargets, setSelectedAccuseTargets] = useState<string[]>([]);

  const toggleAccuseTarget = (targetId: string) => {
    setSelectedAccuseTargets((prev) =>
      prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    );
  };

  const isCurrentSpeaker = view.phase === 'answering' && (view.currentSpeakerId === myId || me?.isCurrentSpeaker === true);

  const players = view.players.map((playerId) => {
    let status = '';
    const score = view.scores?.[playerId] ?? 0;
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? `获胜 · ${score}分` : `${score}分`;
    } else if (playerId === view.judgeId) {
      status = `审判长 · ${score}分`;
    } else if (view.phase === 'answering' && playerId === view.currentSpeakerId) {
      status = `正在发言 · ${score}分`;
    } else {
      status = `${score}分`;
    }

    const isActive =
      (view.phase === 'judge_setup' && playerId === view.judgeId) ||
      (view.phase === 'answering' && playerId === view.currentSpeakerId) ||
      (view.phase === 'judgment' && playerId === view.judgeId);

    return {
      id: playerId,
      name: nameFor(members, playerId),
      status,
      active: isActive,
    };
  });

  // 主导动作
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  const secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'judge_setup' && me?.isJudge && myId) {
    primary = {
      id: 'pick-topic',
      label: selectedTopicId ? '确定以此题开庭' : '请在上方 3 张题目卡中挑选 1 张',
      disabled: !selectedTopicId,
      onAction: () => {
        if (!selectedTopicId) return;
        void act({ type: 'pick_topic_card', playerId: myId, cardId: selectedTopicId });
        setSelectedTopicId(null);
      },
    };
  } else if (view.phase === 'answering' && myId) {
    if (isCurrentSpeaker) {
      primary = {
        id: 'finish-speaking',
        label: '🎙️ 我已口头发言完毕（交棒下一位）',
        disabled: false,
        onAction: () => {
          void act({ type: 'finish_speaking', playerId: myId });
        },
      };
    } else if (me?.isJudge) {
      primary = {
        id: 'judge-advance',
        label: `推进发言（当前发言人：${nameFor(members, view.currentSpeakerId ?? '')}）`,
        disabled: !view.currentSpeakerId,
        onAction: () => {
          if (view.currentSpeakerId) {
            void act({ type: 'finish_speaking', playerId: myId });
          }
        },
      };
    }
  } else if (view.phase === 'judgment' && me?.isJudge && myId) {
    const count = selectedAccuseTargets.length;
    primary = {
      id: 'accuse',
      label:
        count > 0
          ? `🎯 指认 ${selectedAccuseTargets.map((id) => nameFor(members, id)).join('、')} 为伪人（已选 ${count} 人）`
          : '⚖️ 判定场上全员皆为正常人类（0 伪人）',
      disabled: false,
      onAction: () => {
        void act({ type: 'accuse', playerId: myId, targetPlayerIds: selectedAccuseTargets });
        setSelectedAccuseTargets([]);
      },
    };
  }

  const waitingReason =
    view.phase === 'game_over'
      ? null
      : view.phase === 'judge_setup'
        ? me?.isJudge
          ? '你是本轮审判长：请从 3 张题目卡中挑选 1 张题目开庭'
          : `当前可自由选择阵营；等待审判长 ${nameFor(members, view.judgeId)} 挑选题目开庭…`
        : view.phase === 'answering'
          ? isCurrentSpeaker
            ? '轮到你口头讲述！' + (me?.role === 'impostor' ? `（切记自然藏入绝密关键词「${me.triggerWord}」）` : '')
            : `当前由 ${nameFor(members, view.currentSpeakerId ?? '')} 口头讲述，请全员仔细聆听…`
          : me?.isJudge
            ? '所有玩家发言完毕！请多选指认出潜伏的伪人（若认为全员人类可直接提交）'
            : `等待审判长 ${nameFor(members, view.judgeId)} 指认伪人…`;

  const answerTotal = Math.max(view.players.length - 1, 1);
  const answerPercent = (view.answeredCount / answerTotal) * 100;

  return (
    <TabletopShell
      title="伪人测试"
      phase={phaseLabel(view.phase)}
      gameId="echo-judge"
      phaseKey={`${view.phase}:${view.round}:${view.judgeId}:${view.phase === 'answering' ? view.answeredCount : view.phase === 'judgment' ? view.accusations?.join(',') || 'pending' : view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : 'active'}`}
      spectator={isSpectator}
      players={players}
      theme="court"
      stageFit="arena"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          📜 法庭规则
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
        <GameDrawer kind="rules" title="伪人测试 · 测谎规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>⚖️ 核心机制</h4>
          <p>1. <strong>审判长出题与自由选阵营</strong>：每轮轮流由一名玩家担任审判长。出题阶段，其余玩家可<strong>自由选择当【正常人类】或【潜伏伪人】</strong>；选择伪人者由系统派发不重复的绝密触发词。</p>
          <p>2. <strong>法庭辩论</strong>：非审判长玩家按座次依次口头发言回答。伪人必须将绝密触发词自然藏入自己的讲述中；人类可如实回答或故意混淆。</p>
          <p>3. <strong>多选指认</strong>：全部发言完毕后，审判长可<strong>多选指认 0、1 或多名伪人</strong>。</p>
          <p>4. <strong>复合计分</strong>：</p>
          <ul>
            <li>每抓对 1 名伪人：审判长 +1 分，被抓伪人 -1 分；</li>
            <li>每误抓 1 名人类：审判长扣 1 分；</li>
            <li>潜伏成功未被指认的伪人：每人 +2 分；</li>
            <li>场上原本无伪人且审判长空指认：审判长 +1 分。</li>
          </ul>
          <p>5. <strong>终局</strong>：每位玩家各担任一次审判长后结案，累计总分最高者获胜！</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage echo-judge-stage">
          {/* 移动端快捷身份卡展开/收起横条 */}
          {me && (
            <button
              type="button"
              className="echo-identity-toggle-btn"
              onClick={() => setIdentityExpandedMobile((prev) => !prev)}
            >
              <span>
                {me.isJudge
                  ? '⚖️ 我的身份：主审判官'
                  : me.role === 'impostor'
                    ? `👾 我的身份：潜伏伪人（触发词：「${me.triggerWord}」）`
                    : '👤 我的身份：正常人类'}
              </span>
              <span>{identityExpandedMobile ? '▲ 收起' : '▼ 点击展开防窥卡'}</span>
            </button>
          )}

          <div className="echo-judge-dual-col">
            {/* 左列：私密身份与触发词防窥 */}
            <div className="echo-judge-col echo-judge-col--left">
              {/* 非审判长玩家在出题阶段可自由切换阵营 */}
              {view.phase === 'judge_setup' && me && !me.isJudge && (
                <div className="echo-role-choice-panel" aria-label="自由选择本轮阵营">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>🎭</span>
                      <h3>自由选择本轮阵营</h3>
                    </div>
                    <span className="sg-badge sg-badge--highlight">开局可随时切换</span>
                  </div>
                  <div className="echo-role-choice-btns">
                    <button
                      type="button"
                      className={`echo-role-btn ${me.role === 'human' ? 'is-active-human' : ''}`}
                      onClick={() => void act({ type: 'choose_role', playerId: me.playerId, role: 'human' })}
                    >
                      <span className="echo-role-btn__title">👤 当正常人类</span>
                      <span className="echo-role-btn__desc">自由发挥 · 混淆视听</span>
                    </button>
                    <button
                      type="button"
                      className={`echo-role-btn ${me.role === 'impostor' ? 'is-active-impostor' : ''}`}
                      onClick={() => void act({ type: 'choose_role', playerId: me.playerId, role: 'impostor' })}
                    >
                      <span className="echo-role-btn__title">👾 潜伏当伪人</span>
                      <span className="echo-role-btn__desc">获取绝密词 · 隐秘藏词</span>
                    </button>
                  </div>
                </div>
              )}

              {me && (
                <section
                  className={`sg-panel echo-private-panel ${!identityExpandedMobile ? 'is-collapsed-mobile' : ''}`}
                  aria-label="我的私密身份"
                >
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>🕵️</span>
                      <h3>我的绝密身份（按住防窥）</h3>
                    </div>
                    <span className="sg-badge sg-badge--dark">第 {view.round} 轮</span>
                  </div>

                  <IdentityFlipCard
                    theme="cyber"
                    variant="compact"
                    roleName={me.isJudge ? '审判长（主持人）' : me.role === 'impostor' ? '潜伏伪人（Echo）' : '正常人类'}
                    roleSubtitle={me.isJudge ? '主持开庭 · 聆听指认' : me.role === 'impostor' ? '秘密藏词 · 伪装潜伏' : '口述作答 · 识别同伴'}
                    roleCamp={me.isJudge ? 'special' : me.role === 'impostor' ? 'echo' : 'human'}
                    secretWord={me.role === 'impostor' && me.triggerWord ? me.triggerWord : undefined}
                    secretHints={
                      me.isJudge
                        ? [
                            '【审判长】从 3 张题目卡中挑选 1 张出题。',
                            '仔细聆听所有非审判长玩家的口头发言，找出谁在讲述中生硬或巧妙地塞入了绝密触发词！',
                          ]
                        : me.role === 'impostor'
                          ? [
                              `【绝密触发词】：「${me.triggerWord}」！`,
                              '轮到你口头发言时，必须自然将该触发词说出并融入故事中。切忌过分生硬刻意，避免被审判长多选抓捕！',
                            ]
                          : [
                              '【正常人类】根据审判长题目进行口头回答。',
                              '你可以如实回答，也可以故意编造离奇故事甚至撒谎，以保护同伴并混淆审判长的判断！',
                            ]
                    }
                  />
                </section>
              )}

              {/* 实时比分榜单 */}
              <section className="sg-panel echo-score-panel" aria-label="实时计分榜">
                <div className="sg-panel__head">
                  <div className="sg-panel__title-group">
                    <span>📊</span>
                    <h3>法庭积分榜</h3>
                  </div>
                  <span className="sg-badge">实时</span>
                </div>
                <div className="echo-score-grid">
                  {view.players.map((id) => (
                    <div key={id} className={`echo-score-chip ${id === view.judgeId ? 'is-judge' : ''}`}>
                      <span className="echo-score-name">{nameFor(members, id)}</span>
                      <strong className="echo-score-val">{view.scores?.[id] ?? 0} 分</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* 右列：出题 3 选 1 / 发言指示台 / 指认大舞台 */}
            <div className="echo-judge-col echo-judge-col--right">
              {/* 1. 审判长 3 选 1 出题卡牌架 */}
              {view.phase === 'judge_setup' && me?.isJudge && me.pendingTopicChoices && (
                <section className="sg-panel echo-picker-panel" aria-label="审判长抽选题卡">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>🎴</span>
                      <h3>抽选 1 张作为本轮审问考题</h3>
                    </div>
                    <span className="sg-badge sg-badge--highlight">3 选 1</span>
                  </div>

                  <div className="echo-card-choices" role="radiogroup" aria-label="3张候选题目卡">
                    {me.pendingTopicChoices.map((card: TopicCardView) => {
                      const isSelected = selectedTopicId === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          className={`echo-topic-card ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedTopicId(card.id)}
                          aria-checked={isSelected}
                          role="radio"
                        >
                          <div className="echo-topic-card__header">
                            <span className="echo-topic-card__tag">{card.categoryLabel}</span>
                            {isSelected && <span className="echo-topic-card__check">✓ 已选</span>}
                          </div>
                          <p className="echo-topic-card__text">「{card.text}」</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 2. 等待审判长出题 */}
              {view.phase === 'judge_setup' && !me?.isJudge && (
                <div className="echo-waiting-banner">
                  <span className="echo-waiting-icon">⏳</span>
                  <div>
                    <strong>等待审判长 {nameFor(members, view.judgeId)} 挑选第 {view.round} 轮考题…</strong>
                    <span>你可以在左侧自由切换人类或伪人阵营</span>
                  </div>
                </div>
              )}

              {/* 3. 辩论发言中主舞台 */}
              {(view.phase === 'answering' || view.phase === 'judgment') && view.question && (
                <section className="sg-panel echo-active-topic-panel" aria-label="本轮法庭考题">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>⚖️</span>
                      <h3>第 {view.round} 轮法庭审问 · 审判长：{nameFor(members, view.judgeId)}</h3>
                    </div>
                    <span className="sg-badge">考题公开</span>
                  </div>

                  <div className="echo-topic-headline">
                    <span className="echo-topic-quote">“</span>
                    <strong className="echo-topic-text">{view.question}</strong>
                    <span className="echo-topic-quote">”</span>
                  </div>

                  {view.phase === 'answering' && (
                    <div className="echo-progress-box">
                      <div className="echo-progress-head">
                        <span>发言进度：{view.answeredCount} / {answerTotal} 人</span>
                        <span className="echo-speaker-tag">
                          🎙️ 当前发言：<strong>{nameFor(members, view.currentSpeakerId ?? '')}</strong>
                        </span>
                      </div>
                      <div className="echo-progress-bar-track">
                        <div className="echo-progress-bar-fill" style={{ width: `${answerPercent}%` }} />
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* 4. 审判长多选指认伪人大舞台 */}
              {view.phase === 'judgment' && (
                <section className="sg-panel echo-judgment-panel" aria-label="审判长指认">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>🎯</span>
                      <h3>全员发言完毕 · 审判长多选指认伪人</h3>
                    </div>
                    <span className="sg-badge sg-badge--warning">
                      {me?.isJudge ? `已勾选 ${selectedAccuseTargets.length} 名嫌疑人` : '等待审判长决断'}
                    </span>
                  </div>

                  <p className="sg-hint">
                    {me?.isJudge
                      ? '请点选你怀疑将触发词藏进发言里的伪人（可多选；若认为全员皆为正常人类可直接提交）：'
                      : `审判长 ${nameFor(members, view.judgeId)} 正在思考并多选指认潜伏的伪人…`}
                  </p>

                  <div className="sg-chip-row">
                    {view.players
                      .filter((id) => id !== view.judgeId)
                      .map((id) => {
                        const isSelected = selectedAccuseTargets.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={!me?.isJudge}
                            className={`sg-chip sg-chip--btn ${isSelected ? 'sg-chip--selected' : ''}`}
                            onClick={() => me?.isJudge && toggleAccuseTarget(id)}
                            aria-pressed={isSelected}
                          >
                            {isSelected ? '🎯 已指认 ' : ''}{nameFor(members, id)}
                          </button>
                        );
                      })}
                  </div>

                  {view.caughtImpostors && view.caughtImpostors.length > 0 && (
                    <div className="echo-caught-alert">
                      <span>🚨 抓获的伪人：</span>
                      <strong>{view.caughtImpostors.map((id) => nameFor(members, id)).join('、')}</strong>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 终局结算复盘 */
        view.reveal && (
          <div className="sg-stage echo-over-stage">
            <div className="winner-hero winner-hero--echo">
              <span className="winner-rays" aria-hidden="true" />
              <h2 className="winner-title">🎉 审判结案 · 胜者诞生！</h2>
              <p className="winner-names">
                🏆 获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
              </p>
            </div>

            <section className="sg-panel echo-reveal-panel">
              <div className="sg-panel__head">
                <div className="sg-panel__title-group">
                  <span>🗂️</span>
                  <h3>全员真实身份与绝密触发词公开</h3>
                </div>
                <span className="sg-badge">真相大白</span>
              </div>

              <div className="echo-reveal-grid">
                {view.players.map((playerId) => {
                  const role = view.reveal?.roles[playerId];
                  const word = view.reveal?.triggerWords[playerId];
                  const score = view.scores?.[playerId] ?? 0;
                  const isWinner = (view.winners ?? []).includes(playerId);

                  return (
                    <div key={playerId} className={`echo-reveal-card ${isWinner ? 'is-winner' : ''}`}>
                      <div className="echo-reveal-head">
                        <strong>{nameFor(members, playerId)}</strong>
                        <span className={`sg-tag ${role === 'impostor' ? 'sg-tag--echo' : 'sg-tag--human'}`}>
                          {role === 'impostor' ? '👾 伪人' : '👤 人类'}
                        </span>
                      </div>
                      <div className="echo-reveal-score">
                        <span>最终积分：</span>
                        <strong>{score} 分</strong>
                      </div>
                      {word && (
                        <div className="echo-reveal-word">
                          <span>绝密触发词：</span>
                          <strong>「{word}」</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )
      )}
    </TabletopShell>
  );
}
