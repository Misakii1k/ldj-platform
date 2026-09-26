/**
 * 奶酪大盗 桌面模拟模式页面（cheese_thief_sim_v1）。
 * 无系统判定：苏醒时辰/身份角色牌私密分配 + 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { SimBoard, SimPanelHead, SimToolsPanel } from '../tabletop/SimBoard.tsx';
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
          模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_wake', playerId: myId })}>重掷时辰</button>
          {view.roleCardsEnabled && (
            <>
              <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:assign_roles', playerId: myId })}>重发身份卡</button>
              <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:clear_roles', playerId: myId })}>收起身份卡</button>
            </>
          )}
        </div>
      }
    >
      <SimBoard
        logs={logs}
        tools={<SimToolsPanel props={view.props} members={members} myId={myId} busy={busy} act={act} />}
      >
        {/* 我的私密身份 */}
        {me && (
          <section className="sim-panel">
            <SimPanelHead icon="pointer" title={<>我的秘密（仅自己可见）</>} />
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
      </SimBoard>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>奶酪大盗 桌面模拟模式</h4>
          <p>系统只负责私密掷苏醒时辰与私密分配身份角色牌，<strong>不偷奶酪、不投票、不记分</strong>。谁偷奶酪、如何指认由玩家自行约定（可参照线下原版规则）。</p>
        </div>
      )}
    </TabletopShell>
  );
}
