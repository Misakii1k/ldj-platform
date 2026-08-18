/**
 * bell_clash_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的铃铛对决视角（bell-clash/types.ts）。
 * 定位：线下桌游辅助——App 负责发牌/出牌合法性/摸牌/按铃窗口计时/终局判定；
 * 短语卡"口头触发"由线下玩家判断后拍铃。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import type { BellClashCard, BellClashPlayerView, CardColor } from './types.ts';

const COLOR_LABELS: Record<CardColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

/** 卡牌展示：数字卡「红3」；短语卡「红·好耶！」 */
function cardLabel(card: BellClashCard): string {
  return card.kind === 'number' ? `${COLOR_LABELS[card.color]}${card.number}` : `${COLOR_LABELS[card.color]}·${card.phrase}`;
}

function phaseLabel(phase: BellClashPlayerView['phase']): string {
  return phase === 'game_over' ? '对局结束' : '出牌中';
}

interface Props {
  view: BellClashPlayerView;
}

export function BellClashGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const isMyTurn = view.currentPlayerId === myId;

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === view.currentPlayerId) {
      status = view.bellOpen ? '按铃中' : '出牌中';
    }
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status,
      active: playerId === view.currentPlayerId,
    };
  });

  // 主导动作：出牌 / 摸牌 / 拍铃 / 结算
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.bellOpen) {
    // 按铃窗口：任何玩家可拍铃（线下先判断是否有人说出短语）
    primary = {
      id: 'ring-bell',
      label: '拍铃抢回合',
      disabled: false,
      onAction: () => { if (myId) void act({ type: 'ring_bell', playerId: myId }); },
    };
  } else if (isMyTurn && myId) {
    const selected = selectedIndex !== null ? me?.hand?.[selectedIndex] : undefined;
    const top = view.discardTop;
    const canPlaySelected = selected !== undefined && (top === null || selected.color === top.color || (selected.kind === 'number' && top.kind === 'number' && selected.number === top.number));
    primary = {
      id: 'play-card',
      label: selected ? `打出 ${cardLabel(selected)}` : '选择一张手牌打出',
      disabled: selectedIndex === null || !canPlaySelected,
      onAction: () => { if (myId && selectedIndex !== null) { void act({ type: 'play_card', playerId: myId, cardIndex: selectedIndex }); setSelectedIndex(null); } },
    };
    secondary = [
      { id: 'draw', label: '打不出，摸一张', disabled: false, onAction: () => { if (myId) void act({ type: 'draw_card', playerId: myId }); } },
    ];
  }

  const topLabel = view.discardTop ? cardLabel(view.discardTop) : '—';

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.bellOpen
      ? `「${topLabel}」行动短语卡——若有人说了/做了牌上内容，可拍铃抢回合`
      : isMyTurn
        ? '轮到你出牌：打出同色或同数字的牌，或摸一张'
        : `等待 ${nameFor(members, view.currentPlayerId)} 出牌`;

  return (
    <TabletopShell
      title="Ding"
      phase={view.phase === 'game_over' ? '对局结束' : `第 ${view.round} 轮`}
      spectator={isSpectator}
      players={players}
      theme="arena"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      )}
      actions={
        primary || secondary.length > 0
          ? <ActionDock primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} secondary={secondary} busy={busy} waitingReason={waitingReason ?? undefined} />
          : <ActionDock primary={{ id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} busy={busy} waitingReason={waitingReason ?? undefined} />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>UNO 式出牌：打出同颜色或同数字的牌；打不出就摸一张。先打完手牌者获胜。</p>
          <p>行动短语卡：牌上印一句话；若有人说了/做了牌上内容，其他玩家可拍铃抢回合。</p>
          <p>拍铃者须持有同色短语卡；错误拍铃罚摸一张。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage">
          <section className="sg-panel" aria-label="弃牌堆顶">
            <div className="sg-panel__head">
              <h3>弃牌堆顶</h3>
              <span>抽牌堆剩 {view.drawCount} 张</span>
            </div>
            <div className="bell-board">
              <div className={`bell-card bell-card--top bell-card--c-${view.discardTop?.color ?? 'empty'}`}>
                <strong>{view.discardTop ? topLabel : '开局'}</strong>
                <span>{view.discardTop ? (view.discardTop.kind === 'number' ? '数字牌' : '行动短语卡') : '等待首张'}</span>
              </div>
            </div>
          </section>

          {view.bellOpen && (
            <section className="bell-window" aria-label="按铃窗口">
              <span className="bell-window__icon" aria-hidden="true">🔔</span>
              <div className="bell-window__copy">
                <strong>按铃窗口开启</strong>
                <span>「{topLabel}」——若有人说了/做了牌上内容，拍铃抢回合（须持有同色短语卡）。</span>
              </div>
            </section>
          )}

          {me && (
            <section className="sg-panel" aria-label="我的手牌">
              <div className="sg-panel__head">
                <h3>我的手牌（仅自己可见）</h3>
                <span>{(me.hand ?? []).length} 张</span>
              </div>
              <div className="bell-hand">
                {(me.hand ?? []).map((card, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`bell-card bell-card--hand bell-card--c-${card.color} ${selectedIndex === index ? 'is-selected' : ''}`}
                    onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
                    aria-pressed={selectedIndex === index}
                  >
                    <strong>{card.kind === 'number' ? card.number : card.phrase}</strong>
                    <span>{COLOR_LABELS[card.color]}{card.kind === 'number' ? '' : ' · 短语'}</span>
                  </button>
                ))}
              </div>
              {isMyTurn && <p className="sg-hint">轮到你：点一张同色或同数字的牌打出，或摸一张。</p>}
            </section>
          )}
        </div>
      ) : (
        <div className="sg-stage">
          <div className="winner-hero">
            <span className="winner-rays" aria-hidden="true" />
            <h2 className="winner-title">手牌清空！</h2>
            <p>{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')} 获胜</p>
          </div>
        </div>
      )}
    </TabletopShell>
  );
}
