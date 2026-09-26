/**
 * 伪人测试 桌面模拟模式页面（echo_judge_sim_v1）。
 * 无系统判定：词条私密分配 + 题卡抽取 + 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { SimBoard, SimPanelHead, SimToolsPanel } from '../tabletop/SimBoard.tsx';
import type { EchoJudgeSimPlayerView } from './simTypes.ts';

interface Props {
  view: EchoJudgeSimPlayerView;
}

export function EchoJudgeSimStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef<HTMLButtonElement | null>(null);

  const players = view.players.map((id) => ({
    id,
    name: nameFor(members, id),
    status: id === myId ? '我' : '在线',
  }));

  useEffect(() => {
    const timer = view.props.timer;
    if (!timer || !timer.isRunning) return;
    const interval = setInterval(() => {
      void act({ type: 'sim:tick_timer' }).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [view.props.timer?.isRunning, view.props.timer?.remainingSeconds, act]);

  const logs = [...view.activityLogs].slice(-6).reverse();

  return (
    <TabletopShell
      title="伪人测试 · 桌面模拟"
      phase="自由道具 · 无判定"
      gameId="echo-judge"
      phaseKey={`sim:${view.usedTopicCount}`}
      spectator={isSpectator}
      players={players}
      theme="mystery"
      stageFit="arena"
      rulesButton={
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_words', playerId: myId })}>重发词条</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:draw_topic', playerId: myId })}>抽题卡</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy || !view.topicArea} onClick={() => myId && void act({ type: 'sim:clear_topic', playerId: myId })}>收起题卡</button>
        </div>
      }
    >
      <SimBoard
        logs={logs}
        tools={<SimToolsPanel props={view.props} members={members} myId={myId} busy={busy} act={act} />}
      >
        {/* 我的私密触发词 */}
        {me && (
          <section className="sim-panel">
            <SimPanelHead icon="pointer" title={<>我的秘密触发词（仅自己可见）</>} />
            <div className="sim-secret-card">
              {me.triggerWord ? (
                <>
                  <span className="sim-secret-card__label">藏进回答里的词</span>
                  <span className="sim-secret-card__word">{me.triggerWord}</span>
                </>
              ) : (
                <span className="sim-empty">未分配触发词</span>
              )}
            </div>
          </section>
        )}

        {/* 题卡展示区 */}
        <section className="sim-panel">
          <SimPanelHead icon="cards_deck" title={<>题卡区（已抽 {view.usedTopicCount} 张）</>} />
          {view.topicArea ? (
            <div className="sim-topic-card">
              <span className="sim-topic-card__category">{view.topicArea.card.categoryLabel}</span>
              <p className="sim-topic-card__text">{view.topicArea.card.text}</p>
              <small>由 {nameFor(members, view.topicArea.revealedBy)} 抽出</small>
            </div>
          ) : (
            <span className="sim-empty">点击「抽题卡」随机抽一张主题题卡</span>
          )}
        </section>
      </SimBoard>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>伪人测试 桌面模拟模式</h4>
          <p>系统只负责随机词条私密分配与题卡抽取，<strong>不判伪人、不记分</strong>。谁当判官、谁藏词、如何指认由玩家自行约定。</p>
        </div>
      )}
    </TabletopShell>
  );
}
