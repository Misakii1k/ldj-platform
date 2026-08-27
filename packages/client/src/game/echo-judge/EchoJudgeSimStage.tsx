/**
 * 伪人测试 桌面模拟模式页面（echo_judge_sim_v1）。
 * 无系统判定：词条私密分配 + 题卡抽取 + 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
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
  const dice = view.props.dice;
  const bell = view.props.bell;
  const timer = view.props.timer;

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
          📜 模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_words', playerId: myId })}>🔀 重发词条</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:draw_topic', playerId: myId })}>📜 抽题卡</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy || !view.topicArea} onClick={() => myId && void act({ type: 'sim:clear_topic', playerId: myId })}>🗑️ 收起题卡</button>
        </div>
      }
    >
      <div className="sim-board">
        {/* 我的私密触发词 */}
        {me && (
          <section className="sim-panel">
            <div className="sim-panel__head">
              <span>🕵️</span>
              <h3>我的秘密触发词（仅自己可见）</h3>
            </div>
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
          <div className="sim-panel__head">
            <span>📜</span>
            <h3>题卡区（已抽 {view.usedTopicCount} 张）</h3>
          </div>
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

        {/* 自由道具 */}
        <section className="sim-panel">
          <div className="sim-panel__head"><span>🧰</span><h3>自由道具</h3></div>
          <div className="sim-board__row sim-tools">
            <div className="sim-tool">
              <button type="button" className="sim-tool__btn" disabled={busy}
                onClick={() => myId && (webAudio.playDiceShake(), void act({ type: 'sim:roll_dice', playerId: myId }))}>🎲 掷骰</button>
              <span className="sim-tool__value">{dice?.values.length ? dice.values.join(' · ') : '—'}</span>
            </div>
            <div className="sim-tool">
              <button type="button" className="sim-tool__btn sim-tool__btn--bell" disabled={busy}
                onClick={() => myId && (webAudio.playUnoShout(), void act({ type: 'sim:ring_bell', playerId: myId }))}>🛎️ 按铃</button>
              <span className="sim-tool__value">{bell?.rungBy ? `${nameFor(members, bell.rungBy)} 首响 · ${bell.ringCount} 次` : '未按'}</span>
            </div>
            <div className="sim-tool">
              <div className="sim-tool__row">
                <button type="button" className="sim-tool__btn" disabled={busy || timer?.isRunning}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'start' })}>▶</button>
                <button type="button" className="sim-tool__btn" disabled={busy || !timer?.isRunning}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'pause' })}>⏸</button>
                <button type="button" className="sim-tool__btn" disabled={busy}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'reset' })}>↺</button>
                <button type="button" className="sim-tool__btn" disabled={busy}
                  onClick={() => myId && void act({ type: 'sim:operate_timer', playerId: myId, op: 'set', durationSeconds: 60 })}>⏱60s</button>
              </div>
              <span className={`sim-tool__value ${timer?.isExploded ? 'is-exploded' : ''}`}>
                {timer ? (timer.isExploded ? '💥 到点！' : `${timer.remainingSeconds}s`) : '未启用'}
              </span>
            </div>
          </div>
        </section>

        {/* 活动日志 */}
        <section className="sim-panel">
          <div className="sim-panel__head"><span>📜</span><h3>活动记录</h3></div>
          <ul className="sim-logs">
            {logs.map((log, i) => <li key={i} className="sim-logs__item">{log.text}</li>)}
            {logs.length === 0 && <li className="sim-logs__item sim-empty">暂无记录</li>}
          </ul>
        </section>
      </div>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>🛠️ 伪人测试 桌面模拟模式</h4>
          <p>系统只负责随机词条私密分配与题卡抽取，<strong>不判伪人、不记分</strong>。谁当判官、谁藏词、如何指认由玩家自行约定。</p>
        </div>
      )}
    </TabletopShell>
  );
}
