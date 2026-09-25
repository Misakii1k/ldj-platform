/**
 * echo_judge_v1 客户端主页面（线下桌游辅助与卡牌道具形态）。
 * 只消费严格解析后的伪人测试视角（echo-judge/types.ts）。
 *
 * 视觉：法庭。中央是常驻的「判词台」，考题像一份卷宗摊在台上；
 * 宣判时木槌敲下、台面下沉回弹，审判阶段聚光判词台压暗旁听席。
 * 详见 docs/plans/2026-09-22-game-ui-uplift/contracts/echo-judge.md
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import { ArenaRail } from '../../shared-ui/ArenaRail.tsx';
import { SeatTargetPicker } from '../../shared-ui/SeatTargetPicker.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { JudgeBench } from './stage/JudgeBench.tsx';
import { useEchoJudgeStage } from './stage/useEchoJudgeStage.tsx';
import type { EchoJudgePlayerView, TopicCardView } from './types.ts';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { usePhaseEventOverlay } from '../../shared-ui/usePhaseEventOverlay.tsx';

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

  // 判官多选指认状态（选中集合由共享 SeatTargetPicker 直接写回）
  const [selectedAccuseTargets, setSelectedAccuseTargets] = useState<string[]>([]);

  const stage = useEchoJudgeStage(view);

  const isCurrentSpeaker = view.phase === 'answering' && (view.currentSpeakerId === myId || me?.isCurrentSpeaker === true);

  // 阶段切换全屏盖印：开始作答 / 进入审判
  const { overlay: phaseOverlay } = usePhaseEventOverlay(view.phase, (phase) => {
    if (phase === 'answering') return { label: '考题公开', sublabel: '按座次依次口头作答', variant: 'stamp' };
    if (phase === 'judgment') return { label: '进入审判', sublabel: '审判长即将指认伪人', variant: 'warning' };
    return null;
  });

  const players = view.players.map((playerId) => {
    let status = '';
    const score = view.scores?.[playerId] ?? 0;
    // 得分交给外壳的 score 字段渲染，status 只留身份/状态文字，避免同一信息出现两次。
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === view.judgeId) {
      status = '审判长';
    } else if (view.phase === 'answering' && playerId === view.currentSpeakerId) {
      status = '正在发言';
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
      score,
      isSpeaking: view.phase === 'answering' && playerId === view.currentSpeakerId,
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
        label: '我已口头发言完毕（交棒下一位）',
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
          ? `指认 ${selectedAccuseTargets.map((id) => nameFor(members, id)).join('、')} 为伪人（已选 ${count} 人）`
          : '判定场上全员皆为正常人类（0 伪人）',
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

  /**
   * 台上内容：同一时刻只有一种，但判词台容器常驻。
   * 顺序即优先级——指认 > 考题（发言/审判共用） > 卷宗三选一 > 等待。
   */
  const benchContent = (() => {
    if (view.phase === 'judgment') {
      return (
        <div className="ej-focus ej-focus--judgment">
          <div className="ej-topic" data-quiet="true">
            <strong className="ej-topic__text">{view.question}</strong>
          </div>
          <h3 className="ej-focus__title">谁是伪人？</h3>
          <p className="ej-focus__hint">
            {me?.isJudge
              ? '点选你怀疑把触发词藏进发言里的伪人（可多选；认为全员是人类时直接提交即可）'
              : `审判长 ${nameFor(members, view.judgeId)} 正在思考并多选指认潜伏的伪人…`}
          </p>
          <SeatTargetPicker
            label="指认潜伏的伪人"
            max={Math.max(view.players.length - 1, 1)}
            selectedIds={selectedAccuseTargets}
            onSelect={(ids) => setSelectedAccuseTargets(ids)}
            disabled={!me?.isJudge}
            options={view.players
              .filter((id) => id !== view.judgeId)
              .map((id) => ({ id, name: nameFor(members, id) }))}
          />

          {view.caughtImpostors && view.caughtImpostors.length > 0 && (
            <div className="ej-caught" data-revealing={stage.revealing ? 'true' : undefined}>
              <span>抓获的伪人：</span>
              <strong>{view.caughtImpostors.map((id) => nameFor(members, id)).join('、')}</strong>
            </div>
          )}
        </div>
      );
    }

    if (view.phase === 'answering' && view.question) {
      return (
        <div className="ej-focus ej-focus--answering">
          <div className="ej-topic">
            <span className="ej-topic__quote" aria-hidden="true">“</span>
            <strong className="ej-topic__text">{view.question}</strong>
            <span className="ej-topic__quote" aria-hidden="true">”</span>
          </div>

          <div className="ej-progress">
            <div className="ej-progress__head">
              <span>发言进度：{view.answeredCount} / {answerTotal} 人</span>
              <span className="ej-progress__speaker">
                当前发言：<strong>{nameFor(members, view.currentSpeakerId ?? '')}</strong>
              </span>
            </div>
            {/* 只动 transform：scaleX 而不是改 width */}
            <div className="ej-progress__track">
              <div
                className="ej-progress__fill"
                style={{ ['--ej-progress' as string]: answerPercent / 100 }}
              />
            </div>
          </div>
        </div>
      );
    }

    if (view.phase === 'judge_setup' && me?.isJudge && me.pendingTopicChoices) {
      return (
        <div className="ej-focus ej-focus--pick">
          <h3 className="ej-focus__title">抽选本轮考题</h3>
          <p className="ej-focus__hint">出题后全员依次口头发言</p>
          <div className="ej-card-choices" role="radiogroup" aria-label="3 张候选题目卡">
            {me.pendingTopicChoices.map((card: TopicCardView, index: number) => (
              <button
                key={card.id}
                type="button"
                className="ej-topic-card"
                style={{ ['--i' as string]: index }}
                data-selected={selectedTopicId === card.id ? 'true' : undefined}
                onClick={() => setSelectedTopicId(card.id)}
                aria-checked={selectedTopicId === card.id}
                role="radio"
              >
                <span className="ej-topic-card__tag">{card.categoryLabel}</span>
                <p className="ej-topic-card__text">「{card.text}」</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="ej-focus ej-focus--wait">
        <p className="ej-focus__waiting">
          等待审判长 {nameFor(members, view.judgeId)} 挑选第 {view.round} 轮考题…
        </p>
      </div>
    );
  })();

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
          法庭规则
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
          <h4>核心机制</h4>
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
        <div className="ej-game" data-phase={view.phase}>
          {/* 移动端快捷身份卡展开/收起横条 */}
          {me && (
            <button
              type="button"
              className="ej-identity-toggle"
              onClick={() => setIdentityExpandedMobile((prev) => !prev)}
            >
              <span>
                {me.isJudge
                  ? '我的身份：主审判官'
                  : me.role === 'impostor'
                    ? `我的身份：潜伏伪人（触发词：「${me.triggerWord}」）`
                    : '我的身份：正常人类'}
              </span>
              <span>{identityExpandedMobile ? '▲ 收起' : '▼ 点击展开防窥卡'}</span>
            </button>
          )}

          {/* 辅区：侧栏（阵营选择 + 身份卡 + 积分榜） */}
          <div className="ej-sidebar">
            {/* 非审判长玩家在出题阶段可自由切换阵营 */}
            {view.phase === 'judge_setup' && me && !me.isJudge && (
              <section className="ej-role-choice" aria-label="选择本轮阵营">
                <h3 className="ej-role-choice__title">自由选择本轮阵营</h3>
                <div className="ej-role-btns">
                  <button
                    type="button"
                    className="ej-role-btn"
                    data-active={me.role === 'human' ? 'human' : undefined}
                    onClick={() => void act({ type: 'choose_role', playerId: me.playerId, role: 'human' })}
                  >
                    <span className="ej-role-btn__title">当正常人类</span>
                    <span className="ej-role-btn__desc">自由发挥 · 混淆视听</span>
                  </button>
                  <button
                    type="button"
                    className="ej-role-btn"
                    data-active={me.role === 'impostor' ? 'impostor' : undefined}
                    onClick={() => void act({ type: 'choose_role', playerId: me.playerId, role: 'impostor' })}
                  >
                    <span className="ej-role-btn__title">潜伏当伪人</span>
                    <span className="ej-role-btn__desc">获取绝密词 · 隐秘藏词</span>
                  </button>
                </div>
              </section>
            )}

            {me && (
              <section
                className={`sg-panel echo-private-panel ej-private ${!identityExpandedMobile ? 'is-collapsed-mobile' : ''}`}
                aria-label="我的私密身份"
              >
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

            <ArenaRail
              label="法庭积分榜"
              className="ej-score-rail"
              items={view.players.map((id) => {
                const score = view.scores?.[id] ?? 0;
                const isJudge = id === view.judgeId;
                return {
                  key: id,
                  label: `${nameFor(members, id)}${isJudge ? ' · 审判长' : ''}`,
                  value: `${score} 分`,
                  state: isJudge ? 'active' : score > 0 ? 'done' : score < 0 ? 'warning' : 'idle',
                };
              })}
            />
          </div>

          {/* 主区：判词台 */}
          <div className="ej-main">
            {/* 只在需要玩家行动的阶段催时间；出题阶段不催审判长 */}
            <StageCountdownRing
              deadlineAt={view.deadlineAt}
              phaseKey={`${view.phase}:${view.round}:${view.answeredCount}`}
              active={view.phase === 'answering' || view.phase === 'judgment'}
              className="ej-countdown"
            />

            <JudgeBench
              stageRef={stage.stageRef}
              striking={stage.gavelStriking}
              showGavel={view.phase === 'judgment'}
              vignette={stage.vignette}
            >
              {benchContent}
            </JudgeBench>
          </div>
        </div>
      ) : (
        /* 终局结算复盘 */
        view.reveal && (
          <div className="sg-stage echo-over-stage">
            <div className="winner-hero winner-hero--echo">
              <span className="winner-rays" aria-hidden="true" />
              <h2 className="winner-title">审判结案 · 胜者诞生！</h2>
              <p className="winner-names">
                获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
              </p>
            </div>

            <section className="sg-panel echo-reveal-panel">
              <div className="sg-panel__head">
                <div className="sg-panel__title-group">
                  <h3>全员真实身份与绝密触发词公开</h3>
                </div>
                <span className="sg-badge">真相大白</span>
              </div>

              <div className="echo-reveal-grid">
                {view.players.map((playerId, revealIndex) => {
                  const role = view.reveal?.roles[playerId];
                  const word = view.reveal?.triggerWords[playerId];
                  const score = view.scores?.[playerId] ?? 0;
                  const isWinner = (view.winners ?? []).includes(playerId);

                  return (
                    <div key={playerId} className={`echo-reveal-card ${isWinner ? 'is-winner' : ''}`} style={{ ['--i' as string]: revealIndex }}>
                      <div className="echo-reveal-head">
                        <strong>{nameFor(members, playerId)}</strong>
                        <span className={`sg-tag ${role === 'impostor' ? 'sg-tag--echo' : 'sg-tag--human'}`}>
                          {role === 'impostor' ? '伪人' : '人类'}
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

      {/* 飞行层必须挂在舞台之外：舞台内若有 transform 祖先，
          position:fixed 会退化为相对定位，实测的屏幕坐标会全部失效。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
      {phaseOverlay}
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={(view.caughtImpostors ?? []).length > 0 ? '伪人被揪出！' : '伪人成功潜伏'}
        sublabel={`获胜玩家：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`}
      />
    </TabletopShell>
  );
}
