/**
 * Ding 桌面模拟模式页面（bell_clash_sim_v1）。
 * 无系统判定：发牌/翻牌/出牌/按铃/骰子/计时器均为自由工具。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { SimBoard, SimPanelHead, SimToolsPanel } from '../tabletop/SimBoard.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import type { BellClashSimPlayerView, SimCard } from './simTypes.ts';

function cardLabel(card: SimCard): string {
  return card.kind === 'number' ? `${card.number} ${card.color}` : `${card.phrase}`;
}

function assetPath(card: SimCard | null): string {
  if (!card) return '/assets/uno/back.png';
  if (card.kind === 'number') return `/assets/uno/${card.color}_${card.number}.png`;
  return `/assets/uno/${card.color}_blank.png`;
}

function DingSimCard({ card, onClick, selected, small }: {
  card: SimCard | null;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
}) {
  if (!card) return null;
  return (
    <button
      type="button"
      className={`ding-uno-card ${selected ? 'is-selected' : ''} ${small ? 'ding-uno-card--small' : ''}`}
      onClick={onClick}
      title={cardLabel(card)}
      style={small ? { width: '54px', height: '76px' } : undefined}
    >
      <img src={assetPath(card)} alt={cardLabel(card)} className="ding-uno-card__img" />
      {card.kind === 'phrase' && (
        <div className="ding-phrase-center">
          <span className="ding-phrase-text" style={{ fontSize: small ? '8px' : undefined }}>{card.phrase}</span>
        </div>
      )}
    </button>
  );
}

interface Props {
  view: BellClashSimPlayerView;
}

export function BellClashSimStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const players = view.players.map((id) => ({
    id,
    name: nameFor(members, id),
    status: id === myId ? '我' : `${view.handCounts[id] ?? 0} 张`,
  }));

  // 计时器滴答驱动：running 时每秒投递一次（服务端不自走）
  useEffect(() => {
    const timer = view.props.timer;
    if (!timer || !timer.isRunning) return;
    const interval = setInterval(() => {
      void act({ type: 'sim:tick_timer' }).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [view.props.timer?.isRunning, view.props.timer?.remainingSeconds, act]);

  const logs = [...view.activityLogs].slice(-6).reverse();
  const bell = view.props.bell;

  const handlePlay = (index: number) => {
    setSelectedIndex(index);
  };

  const confirmPlay = () => {
    if (selectedIndex === null || !myId) return;
    webAudio.playCardPlay();
    void act({ type: 'sim:play_table', playerId: myId, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  return (
    <TabletopShell
      title="Ding · 桌面模拟"
      phase="自由道具 · 无判定"
      gameId="bell-clash"
      phaseKey={`sim:${view.drawCount}:${view.tableCards.length}`}
      spectator={isSpectator}
      players={players}
      theme="poker"
      stageFit="arena"
      rulesButton={
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          模拟说明
        </button>
      }
      actions={
        <div className="sim-toolbar">
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:redeal' })}>重新发牌</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:draw', playerId: myId })}>摸一张</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:deal_all', playerId: myId })}>各发一张</button>
          <button type="button" className="sim-toolbar__btn" disabled={busy} onClick={() => myId && void act({ type: 'sim:flip_top', playerId: myId })}>翻一张</button>
        </div>
      }
    >
      {/* 桌案：摸牌堆 + 翻牌区 + 桌面出牌 */}
      <SimBoard
        logs={logs}
        tools={<SimToolsPanel props={view.props} members={members} myId={myId} busy={busy} act={act} showBell={false} />}
      >
        <section className="sim-panel">
          <SimPanelHead icon="cards_deck" title={<>桌案 · 抽牌堆剩 <span className="stage-numeral">{view.drawCount}</span> 张</>} />
          <div className="sim-board__row">
            <button
              type="button"
              className="ding-draw-stack"
              onClick={() => myId && void act({ type: 'sim:draw', playerId: myId })}
              title="摸一张牌（入自己手牌）"
              disabled={busy}
            >
              <img src="/assets/uno/back.png" alt="摸牌堆" className="ding-uno-card__img" />
              <span className="ding-draw-stack__count">{view.drawCount}</span>
            </button>
            <div className="ding-discard-slot">
              {view.discardTop ? <DingSimCard card={view.discardTop} /> : <span className="ding-discard-empty">弃牌堆空</span>}
              <small>牌顶（翻牌/打出）</small>
            </div>
            <button
              type="button"
              className={`sim-bell-btn ${bell?.rungBy ? 'sim-bell-btn--rung' : ''}`}
              onClick={() => myId && (webAudio.playUnoShout(), void act({ type: 'sim:ring_bell', playerId: myId }))}
              title={`拍铃（首响：${bell?.rungBy ? nameFor(members, bell.rungBy) : '无人'} · 共 ${bell?.ringCount ?? 0} 次）`}
              disabled={busy}
            >
              按铃
              {bell?.rungBy && <small>{nameFor(members, bell.rungBy)} 首响</small>}
            </button>
          </div>
        </section>

        {/* 我的私密手牌 */}
        {me && (
          <section className="sim-panel">
            <div className="sim-panel__head">
              <h3>我的手牌（{me.hand.length} 张 · 仅自己可见）</h3>
              {selectedIndex !== null && (
                <button type="button" className="sim-toolbar__btn sim-toolbar__btn--primary" onClick={confirmPlay}>
                  打出选中的牌
                </button>
              )}
            </div>
            <div className="sim-hand">
              {me.hand.map((card, index) => (
                <DingSimCard key={index} card={card} selected={selectedIndex === index} onClick={() => handlePlay(index)} />
              ))}
              {me.hand.length === 0 && <span className="sim-empty">手牌为空，可从抽牌堆摸牌</span>}
            </div>
          </section>
        )}
      </SimBoard>

      {rulesOpen && (
        <div className="sim-rules" role="dialog" aria-label="模拟模式说明">
          <button type="button" className="sim-rules__close" onClick={() => setRulesOpen(false)}>✕</button>
          <h4>Ding 桌面模拟模式</h4>
          <p>系统只负责随机发牌、翻牌与自由道具，<strong>不判胜负、不记分</strong>。出牌/按铃/掷骰/计时等规则由玩家自行约定（可参照线下原版规则）。</p>
          <ul>
            <li>重新发牌：按当前人数重洗牌库并每人发 8 张。</li>
            <li>摸一张 / 各发一张：从抽牌堆补充手牌。</li>
            <li>按铃：记录首响与次数，仅作提示。</li>
            <li>骰子与计时器：骰子与计时器自由使用。</li>
          </ul>
        </div>
      )}
    </TabletopShell>
  );
}
