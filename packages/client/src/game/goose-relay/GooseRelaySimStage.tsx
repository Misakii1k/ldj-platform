/**
 * 以鹅传鹅 桌面模拟模式页面（goose_relay_sim_v1）。
 * 无系统判定：候选鹅卡展示 + 随机头鹅 + 案情卡私密（仅头鹅）+ 骰子/计时器/按铃自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { SimBoard, SimPanelHead, SimToolsPanel } from '../tabletop/SimBoard.tsx';
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
    status: id === view.headPlayerId ? '头鹅' : '在线',
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
          模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:redeal', playerId: myId })}>重布置</button>
        </div>
      }
    >
      <SimBoard
        logs={logs}
        tools={<SimToolsPanel props={view.props} members={members} myId={myId} busy={busy} act={act} />}
      >
        {/* 我的案情卡（仅头鹅可见） */}
        {me && isHead && (
          <section className="sim-panel">
            <SimPanelHead icon="crown" title="头鹅 · 我的案情卡（仅自己可见）" />
            <div className="sim-case">
              {me.caseCard ? (
                <>
                  <div className="sim-case__item">
                    <img src={gooseAsset(me.caseCard.murderer)} alt={gooseName(me.caseCard.murderer)} className="sim-case__img" />
                    <span className="sim-case__role">凶手</span>
                    <span className="sim-case__name">{gooseName(me.caseCard.murderer)}</span>
                  </div>
                  <div className="sim-case__item">
                    <img src={gooseAsset(me.caseCard.victim)} alt={gooseName(me.caseCard.victim)} className="sim-case__img" />
                    <span className="sim-case__role">受害者</span>
                    <span className="sim-case__name">{gooseName(me.caseCard.victim)}</span>
                  </div>
                </>
              ) : <span className="sim-empty">暂无案情卡</span>}
            </div>
          </section>
        )}

        {/* 候选鹅卡（公开） */}
        <section className="sim-panel">
          <SimPanelHead icon="star" title={<>候选鹅卡 · 头鹅 {nameFor(members, view.headPlayerId)}</>} />
          <div className="sim-goose-grid">
            {view.candidateCards.map((id) => (
              <div key={id} className="sim-goose-card" title={gooseName(id)}>
                <img src={gooseAsset(id)} alt={gooseName(id)} className="sim-goose-card__img" />
                <span className="sim-goose-card__name">{gooseName(id)}</span>
              </div>
            ))}
          </div>
        </section>
      </SimBoard>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>以鹅传鹅 桌面模拟模式</h4>
          <p>系统只负责随机候选鹅卡展示、随机头鹅指派与案情卡私密发放，<strong>不接力、不指认、不投票、不记分</strong>。谁抢头鹅、如何表演传递由玩家自行约定。</p>
        </div>
      )}
    </TabletopShell>
  );
}
