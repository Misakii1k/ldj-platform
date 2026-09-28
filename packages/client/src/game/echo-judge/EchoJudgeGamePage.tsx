/**
 * echo_judge_v1 客户端主页面：木质老法庭构图。
 * 只消费严格解析后的伪人测试视角（echo-judge/types.ts）。
 *
 * 视觉落地：docs/plans/2026-09-26-echo-judge-visual/README.md（B 老式法庭）
 * 像素参照：docs/ui-preview/echo-judge/directions/B-courtroom.html（已定稿）
 * 以及 S1-setup / S3-judgment / S4-verdict。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import type { TabletopAction } from '../tabletop/types.ts';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { usePhaseEventOverlay } from '../../shared-ui/usePhaseEventOverlay.tsx';
import { JudgeBench } from './stage/JudgeBench.tsx';
import {
  answeredSeatIds,
  seatColorOf,
  splitPews,
  CourtPew,
  type CourtSeatModel,
  type VerdictMark,
} from './stage/CourtSeats.tsx';
import {
  CaseCards,
  Dossier,
  DossierStamp,
  HeadPlacard,
  PonderStrip,
  ProgressPips,
  RoleCards,
  ScalesArt,
  SecretStrip,
  VerdictOverlay,
  type VerdictLedgerRow,
} from './stage/CourtProps.tsx';
import { buildVerdictBanner, buildVerdictLedger } from './stage/deriveStageEvents.ts';
import { useEchoJudgeStage } from './stage/useEchoJudgeStage.tsx';
import type { EchoJudgePlayerView } from './types.ts';

function phaseLabel(phase: EchoJudgePlayerView['phase']): string {
  switch (phase) {
    case 'judge_setup': return '立案';
    case 'answering': return '轮流作答';
    case 'judgment': return '审判';
    case 'game_over': return '宣判结案';
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

  // 审判长本地指认集合（提交前只有审判长自己看得到，不上网）
  const [accusedIds, setAccusedIds] = useState<ReadonlySet<string>>(new Set());
  // 立案：审判长点选卷宗的本地反馈（选中展开 + 盖章，等服务端切阶段）
  const [pickedCardId, setPickedCardId] = useState<string | null>(null);
  // 立案：自定义出题表单
  const [customOpen, setCustomOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');

  const stage = useEchoJudgeStage(view);

  const nameOf = (id: string) => nameFor(members, id);
  const isJudge = me?.isJudge === true;
  const isCurrentSpeaker = view.phase === 'answering' && (view.currentSpeakerId === myId || me?.isCurrentSpeaker === true);

  // 阶段盖印：开始作答 / 进入审判
  const { overlay: phaseOverlay } = usePhaseEventOverlay(view.phase, (phase) => {
    if (phase === 'answering') return { label: '考题公开', sublabel: '按座次依次口头作答', variant: 'stamp' };
    if (phase === 'judgment') return { label: '进入审判', sublabel: '审判长即将指认伪人', variant: 'warning' };
    return null;
  });

  // 换阶段时清掉本地瞬态
  useEffect(() => {
    setAccusedIds(new Set());
    setPickedCardId(null);
    setCustomOpen(false);
  }, [view.phase, view.round]);
  useEffect(() => {
    if (error) setPickedCardId(null);
  }, [error]);

  /* ── 席位模型 ─────────────────────────────────────────────── */

  const answerOrder = view.players.filter((id) => id !== view.judgeId);
  const answeredIds = answeredSeatIds(view.players, view.judgeId, view.answeredCount);
  const { left: leftPew, right: rightPew } = splitPews(view.players, view.judgeId);
  const verdictPlayback = stage.verdict;

  // 席位翻面标记：演出中读 playback；终局读 reveal.roles（只有这里会出现暗号）
  const finalReveal = view.phase === 'game_over' && view.reveal ? view.reveal : null;
  const seatMark = (id: string): VerdictMark | null => {
    if (verdictPlayback && verdictPlayback.shown[id]) return verdictPlayback.shown[id]!;
    if (finalReveal && !verdictPlayback) {
      return finalReveal.roles[id] === 'impostor' ? 'caught' : 'wrong';
    }
    return null;
  };
  const seatDelta = (id: string): number | null => {
    if (verdictPlayback && verdictPlayback.scored) return verdictPlayback.verdict.scoreDelta[id] ?? null;
    if (finalReveal && view.lastVerdict) return view.lastVerdict.scoreDelta[id] ?? null;
    return null;
  };
  const seatScore = (id: string): number => {
    const now = view.scores?.[id] ?? 0;
    if (verdictPlayback && !verdictPlayback.scored) return now - (verdictPlayback.verdict.scoreDelta[id] ?? 0);
    return now;
  };
  const seatWord = (id: string): string | null => {
    // 暗号只在终局从 reveal.triggerWords 取
    if (finalReveal && !verdictPlayback && finalReveal.roles[id] === 'impostor') {
      return finalReveal.triggerWords[id] ?? null;
    }
    return null;
  };

  const seatStatus = (id: string): string => {
    if (verdictPlayback) {
      const mark = verdictPlayback.shown[id];
      if (mark === 'caught') return '伪人 · 被抓';
      if (mark === 'wrong') return '人类 · 被冤枉';
      if (mark === 'escaped') return '漏网伪人';
      return '候审';
    }
    switch (view.phase) {
      case 'judge_setup':
        if (id === myId && me && !isJudge) return me.role === 'impostor' ? '伪人（仅你可见）' : '人类（仅你可见）';
        return '候审';
      case 'answering':
        if (id === view.currentSpeakerId) return '发言中';
        if (answeredIds.has(id)) return '已发言';
        return '等待';
      case 'judgment':
        if (isJudge && accusedIds.has(id)) return '被指认';
        return '已口述';
      case 'game_over':
        return finalReveal ? (finalReveal.roles[id] === 'impostor' ? '伪人' : '人类') : '';
      default:
        return '';
    }
  };

  const seatModel = (id: string): CourtSeatModel => ({
    id,
    seatNo: view.players.indexOf(id) + 1,
    name: nameOf(id),
    color: seatColorOf(view.players, id),
    score: seatScore(id),
    status: seatStatus(id),
    isMe: id === myId,
    isSpeaking: view.phase === 'answering' && id === view.currentSpeakerId,
    isDone: view.phase === 'answering' && answeredIds.has(id) && id !== view.currentSpeakerId,
  });

  const judgeStatus =
    view.phase === 'judge_setup' ? '选题中'
    : view.phase === 'answering' ? '聆听中'
    : view.phase === 'judgment' ? '斟酌中'
    : '审判长';

  const canAccuse = view.phase === 'judgment' && isJudge && !verdictPlayback;
  const toggleAccuse = (id: string) => {
    setAccusedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── 底栏动作 ─────────────────────────────────────────────── */

  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  const secondary: TabletopAction[] = [];

  if (verdictPlayback?.playing) {
    secondary.push({ id: 'skip-verdict', label: '跳过', disabled: false, onAction: () => stage.skipVerdict() });
  } else if (view.phase === 'judge_setup' && isJudge && myId && me?.pendingTopicChoices) {
    secondary.push({
      id: 'custom-topic',
      label: '自己出题',
      disabled: false,
      onAction: () => setCustomOpen((v) => !v),
    });
  } else if (view.phase === 'answering' && myId) {
    if (isCurrentSpeaker) {
      primary = {
        id: 'finish-speaking',
        label: '我说完了',
        disabled: false,
        onAction: () => void act({ type: 'finish_speaking', playerId: myId }),
      };
    } else if (isJudge) {
      secondary.push({
        id: 'judge-advance',
        label: `推进到下一位（当前：${nameOf(view.currentSpeakerId ?? '')}）`,
        disabled: !view.currentSpeakerId,
        onAction: () => void act({ type: 'finish_speaking', playerId: myId }),
      });
    }
  } else if (view.phase === 'judgment' && isJudge && myId) {
    const count = accusedIds.size;
    primary = {
      id: 'accuse',
      label: count > 0 ? `宣判 · 指认 ${count} 人` : '宣判',
      disabled: count === 0,
      onAction: () => {
        void act({ type: 'accuse', playerId: myId, targetPlayerIds: [...accusedIds] });
        setAccusedIds(new Set());
      },
    };
    secondary.push({
      id: 'accuse-none',
      label: '没人是伪人',
      disabled: false,
      onAction: () => {
        void act({ type: 'accuse', playerId: myId, targetPlayerIds: [] });
        setAccusedIds(new Set());
      },
    });
  }

  const dockText = ((): { title: string; sub: string } => {
    if (verdictPlayback) {
      if (verdictPlayback.playing) return { title: '宣判中……', sub: '' };
      return { title: '本轮结束', sub: `下一轮由 ${nameOf(view.judgeId)} 当审判长` };
    }
    switch (view.phase) {
      case 'judge_setup':
        return isJudge
          ? { title: '你是本轮审判长', sub: '挑一份卷宗，或自己出题；旁听席的人正在偷偷选身份，你看不到' }
          : { title: '选好身份，等审判长立案', sub: '立案前随时可以改；别人选了什么你看不到' };
      case 'answering':
        return isCurrentSpeaker
          ? {
              title: '轮到你了',
              sub: me?.role === 'impostor' && me.triggerWord
                ? `你是伪人：把「${me.triggerWord}」自然地说进回答里`
                : '如实作答，别硬塞词',
            }
          : {
              title: `${nameOf(view.currentSpeakerId ?? '')} 正在回答`,
              sub: '仔细听，谁在硬塞词？',
            };
      case 'judgment':
        return isJudge
          ? { title: '全员说完了，谁在硬塞词？', sub: '可以多选；觉得都是人类就点「没人是伪人」' }
          : { title: '等审判长宣判', sub: me?.role === 'impostor' && me.triggerWord ? `你硬塞了「${me.triggerWord}」，希望他没听出来` : '希望审判长明察秋毫' };
      case 'game_over':
        return { title: '审判结案', sub: `获胜玩家：${(view.winners ?? []).map(nameOf).join('、')}` };
      default:
        return { title: '', sub: '' };
    }
  })();

  /* ── 卷宗区内容 ───────────────────────────────────────────── */

  const witnessContent = (() => {
    if (view.phase === 'judge_setup') {
      if (isJudge && me?.pendingTopicChoices) {
        if (customOpen) {
          return (
            <Dossier tab="卷宗 · 自拟">
              <div className="ej-dossier__label">自己出题 · 最多 200 字</div>
              <textarea
                className="ej-custom-input"
                value={customQuestion}
                maxLength={200}
                rows={3}
                placeholder="写一道让伪人藏不住暗号的题……"
                onChange={(e) => setCustomQuestion(e.target.value)}
              />
              <div className="ej-custom-actions">
                <button type="button" className="ej-btn" onClick={() => setCustomOpen(false)}>
                  返回卷宗
                </button>
                <button
                  type="button"
                  className="ej-btn ej-btn--ink"
                  disabled={customQuestion.trim().length === 0 || busy}
                  onClick={() => {
                    if (!myId) return;
                    void act({ type: 'start_round', playerId: myId, question: customQuestion.trim() });
                  }}
                >
                  立这一案
                </button>
              </div>
            </Dossier>
          );
        }
        if (pickedCardId) {
          const picked = me.pendingTopicChoices.find((c) => c.id === pickedCardId);
          if (picked) {
            return (
              <Dossier tab="卷宗 · 已立案" opened>
                <div className="ej-dossier__label">审判长 {nameOf(view.judgeId)} 的考题 · {picked.categoryLabel}</div>
                <p className="ej-dossier__q">{picked.text}</p>
                <div className="ej-dossier__speaker">
                  第一位发言：<b>{nameOf(answerOrder[0] ?? '')}</b>
                </div>
                <DossierStamp text="立 案" />
              </Dossier>
            );
          }
        }
        return (
          <>
            <div className="ej-witness__label">挑一份卷宗立案 · 翻开后全员开始轮流口述</div>
            <CaseCards
              cards={me.pendingTopicChoices}
              pickedId={pickedCardId}
              onPick={(cardId) => {
                if (!myId) return;
                setPickedCardId(cardId);
                void act({ type: 'pick_topic_card', playerId: myId, cardId });
              }}
            />
          </>
        );
      }
      // 旁听席：封条 + 身份二选一
      return (
        <>
          <div className="ej-sealed">
            <span className="ej-sealed__seal">封</span>
            <span>审判长 {nameOf(view.judgeId)} 正在挑卷宗…… 开庭前你可以随时改身份</span>
          </div>
          {me && !isSpectator && (
            <RoleCards
              role={me.role}
              triggerWord={me.triggerWord}
              onChoose={(role) => {
                if (!myId) return;
                void act({ type: 'choose_role', playerId: myId, role });
              }}
            />
          )}
        </>
      );
    }

    if (view.phase === 'answering') {
      return (
        <>
          <Dossier tab={`卷宗 · 第 ${view.round} 案`}>
            <div className="ej-dossier__label">审判长 {nameOf(view.judgeId)} 的考题</div>
            <p className="ej-dossier__q">{view.question}</p>
            <div className="ej-dossier__speaker">
              证人席：<b>{nameOf(view.currentSpeakerId ?? '')}</b>
            </div>
            <DossierStamp text="口 述" />
          </Dossier>
          <ProgressPips
            order={answerOrder}
            colorOf={(id) => seatColorOf(view.players, id)}
            answeredCount={view.answeredCount}
            currentId={view.currentSpeakerId}
          />
        </>
      );
    }

    if (view.phase === 'judgment') {
      return (
        <>
          <Dossier tab={`卷宗 · 第 ${view.round} 案`}>
            <div className="ej-dossier__label">全员已口述</div>
            <p className="ej-dossier__q ej-dossier__q--small">{view.question}</p>
            {isJudge ? (
              <>
                <div className="ej-tally">
                  <span>已指认</span>
                  <span className="ej-tally__n">{accusedIds.size}</span>
                  <span>人</span>
                  <span className="ej-tally__names">
                    {accusedIds.size === 0
                      ? <span className="ej-tally__none">还没点人</span>
                      : [...accusedIds].map((id) => <b key={id}>{nameOf(id)}</b>)}
                  </span>
                </div>
                <p className="ej-tally__hint">点旁听席上的人来指认，再点一次取消。抓对一个伪人 +1，冤枉一个人类 −1。</p>
              </>
            ) : (
              <PonderStrip judgeName={nameOf(view.judgeId)} />
            )}
          </Dossier>
          <ProgressPips
            order={answerOrder}
            colorOf={(id) => seatColorOf(view.players, id)}
            answeredCount={answerOrder.length}
            currentId={null}
          />
        </>
      );
    }

    return null;
  })();

  /* ── 宣判告示牌与账单 ─────────────────────────────────────── */

  const overlayBanner = (() => {
    if (verdictPlayback?.showBanner) {
      return buildVerdictBanner(verdictPlayback.verdict, nameOf);
    }
    if (finalReveal && view.lastVerdict && !verdictPlayback) {
      const winners = (view.winners ?? []).map(nameOf).join('、');
      return { kind: 'caught' as const, title: `审判结案 · ${winners || '—'} 胜`, sub: '' };
    }
    return null;
  })();
  const overlayLedger: VerdictLedgerRow[] | null = verdictPlayback?.showLedger
    ? buildVerdictLedger(verdictPlayback.verdict).map((row) => ({ name: nameOf(row.id), why: row.why, delta: row.delta }))
    : null;

  const ringActive = view.phase === 'answering' || view.phase === 'judgment';

  return (
    <TabletopShell
      title="伪人测试"
      phase={phaseLabel(view.phase)}
      gameId="echo-judge"
      phaseKey={`${view.phase}:${view.round}:${view.judgeId}:${view.answeredCount}`}
      spectator={isSpectator}
      players={[]}
      theme="court"
      stageFit="arena"
      hideSeats
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          法庭规则
        </button>
      )}
      actions={(
        <div className="ej-dock">
          {me && !isSpectator && (
            <SecretStrip isJudge={isJudge} role={me.role} triggerWord={me.triggerWord} />
          )}
          <div className="ej-dock__info">
            <strong>{dockText.title}</strong>
            {dockText.sub && <span>{dockText.sub}</span>}
          </div>
          {(primary || secondary.length > 0) && (
            <ActionDock primary={primary} secondary={secondary} busy={busy} />
          )}
        </div>
      )}
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

      <div
        className="ej-court"
        ref={stage.stageRef}
        data-phase={view.phase}
        data-view={isJudge ? 'judge' : 'player'}
        data-crowded={view.players.length > 8 ? 'true' : undefined}
        data-shaking={stage.shaking ? 'true' : undefined}
        data-vignette={view.phase === 'judgment' ? 'true' : undefined}
      >
        <div className="ej-floor" aria-hidden="true" />
        <ScalesArt />
        <HeadPlacard round={view.round} rounds={view.players.length} phaseText={phaseLabel(view.phase)} />
        <div className="ej-ring-box">
          <StageCountdownRing
            deadlineAt={view.deadlineAt}
            phaseKey={`${view.phase}:${view.round}:${view.answeredCount}`}
            active={ringActive}
          />
        </div>

        <JudgeBench
          name={nameOf(view.judgeId)}
          seatNo={view.players.indexOf(view.judgeId) + 1}
          color={seatColorOf(view.players, view.judgeId)}
          status={judgeStatus}
          isMe={view.judgeId === myId}
          striking={stage.gavelStriking}
          raising={view.phase === 'judgment' && !isJudge}
        />

        {([
          ['left', leftPew],
          ['right', rightPew],
        ] as const).map(([side, ids]) => {
          const marks: Record<string, VerdictMark> = {};
          const deltas: Record<string, number | null> = {};
          const words: Record<string, string | null> = {};
          for (const id of ids) {
            const mark = seatMark(id);
            if (mark) marks[id] = mark;
            const delta = seatDelta(id);
            if (delta !== null) deltas[id] = delta;
            const word = seatWord(id);
            if (word) words[id] = word;
          }
          return (
            <CourtPew
              key={side}
              side={side}
              seats={ids.map(seatModel)}
              accusedIds={canAccuse ? accusedIds : undefined}
              verdictMarks={marks}
              deltas={deltas}
              triggerWords={words}
              onSeatClick={canAccuse ? toggleAccuse : null}
            />
          );
        })}

        <section className="ej-witness" data-stage-anchor="witness">
          {witnessContent}
        </section>

        <VerdictOverlay banner={overlayBanner} ledger={overlayLedger} />
        <span className="ej-vignette" aria-hidden="true" />
      </div>

      {/* 终局复盘：全员身份 + 暗号（只有 game_over 的 reveal 带这些字段） */}
      {finalReveal && (
        <div className="echo-over-stage">
          <section className="echo-reveal-panel">
            <h3>全员真实身份与绝密触发词公开</h3>
            <div className="echo-reveal-grid">
              {view.players.map((playerId) => {
                const role = finalReveal.roles[playerId];
                const word = finalReveal.triggerWords[playerId];
                const score = view.scores?.[playerId] ?? 0;
                const isWinner = (view.winners ?? []).includes(playerId);
                return (
                  <div key={playerId} className={`echo-reveal-card ${isWinner ? 'is-winner' : ''}`}>
                    <div className="echo-reveal-head">
                      <strong>{nameOf(playerId)}</strong>
                      <span className={`echo-tag ${role === 'impostor' ? 'echo-tag--impostor' : 'echo-tag--human'}`}>
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
      )}

      {/* 飞行层必须挂在舞台之外：舞台内若有 transform 祖先，
          position:fixed 会退化为相对定位，实测的屏幕坐标会全部失效。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
      {phaseOverlay}
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={(view.lastVerdict?.caught.length ?? 0) > 0 ? '伪人被揪出！' : '伪人成功潜伏'}
        sublabel={`获胜玩家：${(view.winners ?? []).map(nameOf).join('、')}`}
      />
    </TabletopShell>
  );
}
