/**
 * 以鹅传鹅 桌面模拟模式页面（goose_relay_sim_v1）。
 * 无系统判定：候选鹅卡展示 + 随机头鹅 + 案情卡私密（仅头鹅）+ 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { GOOSE_CARD_MAP } from './cardCatalog.ts';
import type { CharacterId } from './types.ts';
import type { GooseRelaySimPlayerView } from './simTypes.ts';

interface Props {
  view: GooseRelaySimPlayerView;
}

function gooseAsset(id: string): string {
  return GOOSE_CARD_MAP[id as CharacterId]?.image ?? '/goose-cards/goose_unknown.png';
}

function gooseName(id: string): string {
  return GOOSE_CARD_MAP[id as CharacterId]?.name ?? id;
}

export function GooseRelaySimStage({ view }: Props) {
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
    status: id === view.headPlayerId ? '🦆 头鹅' : '在线',
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
  const isHead = me?.isHead === true;

  return (
    <TabletopShell
      title="以鹅传鹅 · 桌面模拟"
      phase="自由道具 · 无判定"
      gameId="goose-relay"
      phaseKey={`sim:${view.candidateCards.length}:${view.headPlayerId}`}
      spectator={isSpectator}
      players={players}
      theme="party"
      stageFit="arena"
      rulesButton={
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          📜 模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:redeal', playerId: myId })}>🔀 重布置</button>
        </div>
      }
    >
      <div className="sim-board">
        {/* 我的案情卡（仅头鹅可见） */}
        {me && isHead && (
          <section className="sim-panel">
            <div className="sim-panel__head"><span>🦆</span><h3>头鹅 · 我的案情卡（仅自己可见）</h3></div>
            <div className="sim-case">
              {me.caseCard ? (
                <>
                  <div className="sim-case__item">
                    <img src={gooseAsset(me.caseCard.murderer)} alt={gooseName(me.caseCard.murderer)} className="sim-case__img" />
                    <span className="sim-case__role">🕵️ 凶手</span>
                    <span className="sim-case__name">{gooseName(me.caseCard.murderer)}</span>
                  </div>
                  <div className="sim-case__item">
                    <img src={gooseAsset(me.caseCard.victim)} alt={gooseName(me.caseCard.victim)} className="sim-case__img" />
                    <span className="sim-case__role">🕊️ 受害者</span>
                    <span className="sim-case__name">{gooseName(me.caseCard.victim)}</span>
                  </div>
                </>
              ) : <span className="sim-empty">暂无案情卡</span>}
            </div>
          </section>
        )}

        {/* 候选鹅卡（公开） */}
        <section className="sim-panel">
          <div className="sim-panel__head">
            <span>🃏</span>
            <h3>候选鹅卡 · 头鹅 {nameFor(members, view.headPlayerId)}</h3>
          </div>
          <div className="sim-goose-grid">
            {view.candidateCards.map((id) => (
              <div key={id} className="sim-goose-card" title={gooseName(id)}>
                <img src={gooseAsset(id)} alt={gooseName(id)} className="sim-goose-card__img" />
                <span className="sim-goose-card__name">{gooseName(id)}</span>
              </div>
            ))}
          </div>
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
          <h4>🛠️ 以鹅传鹅 桌面模拟模式</h4>
          <p>系统只负责随机候选鹅卡展示、随机头鹅指派与案情卡私密发放，<strong>不接力、不指认、不投票、不记分</strong>。谁抢头鹅、如何表演传递由玩家自行约定。</p>
        </div>
      )}
    </TabletopShell>
  );
}
