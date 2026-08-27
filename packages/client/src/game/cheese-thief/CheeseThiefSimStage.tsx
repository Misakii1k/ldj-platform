/**
 * 奶酪大盗 桌面模拟模式页面（cheese_thief_sim_v1）。
 * 无系统判定：苏醒时辰/身份角色牌私密分配 + 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { ROLE_LABELS, type CheeseThiefSimPlayerView } from './simTypes.ts';

interface Props {
  view: CheeseThiefSimPlayerView;
}

export function CheeseThiefSimStage({ view }: Props) {
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
      title="奶酪大盗 · 桌面模拟"
      phase="自由道具 · 无判定"
      gameId="cheese-thief"
      phaseKey={`sim:${view.roleCardsEnabled ? 'role' : 'plain'}`}
      spectator={isSpectator}
      players={players}
      theme="night"
      stageFit="arena"
      rulesButton={
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          📜 模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_wake', playerId: myId })}>🌙 重掷时辰</button>
          {view.roleCardsEnabled && (
            <>
              <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_roles', playerId: myId })}>🎭 重发身份卡</button>
              <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:clear_roles', playerId: myId })}>🗑️ 收起身份卡</button>
            </>
          )}
        </div>
      }
    >
      <div className="sim-board">
        {/* 我的私密身份 */}
        {me && (
          <section className="sim-panel">
            <div className="sim-panel__head">
              <span>🌙</span>
              <h3>我的秘密（仅自己可见）</h3>
            </div>
            <div className="sim-secret-card">
              <span className="sim-secret-card__label">我的苏醒时辰</span>
              <span className="sim-secret-card__word">{me.wakeHour !== null ? `${me.wakeHour} 点` : '未掷'}</span>
              {view.roleCardsEnabled && (
                <>
                  <span className="sim-secret-card__label" style={{ marginTop: '10px' }}>我的身份角色牌</span>
                  <span className="sim-secret-card__word sim-secret-card__word--role">
                    {me.roleCard ? ROLE_LABELS[me.roleCard] : '未分配'}
                  </span>
                </>
              )}
            </div>
          </section>
        )}

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
          <h4>🛠️ 奶酪大盗 桌面模拟模式</h4>
          <p>系统只负责私密掷苏醒时辰与私密分配身份角色牌，<strong>不偷奶酪、不投票、不记分</strong>。谁偷奶酪、如何指认由玩家自行约定（可参照线下原版规则）。</p>
        </div>
      )}
    </TabletopShell>
  );
}
