/* eslint-disable @typescript-eslint/no-explicit-any -- 三个新游戏的服务端视图结构不同，此组件按 moduleId 消费运行时视图。 */
import { useRef, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { PlayingCard, CardBack } from './PlayingCard.tsx';
import { GameLeaveButton } from './GameLeaveButton.tsx';
import { nameFor, useGameAction, type MemberLike } from './useGameAction.ts';
import { UNO_COLORS, UNO_COLOR_NAMES, cardLabel, colorLabel, type UnoCard } from './uno/types.ts';

type AnyView = Record<string, any>;

/** legacy UNO 运行时视图未做类型收窄，转成共享牌面标签的稳定适配。 */
function cardFaceLabel(card: AnyView): string {
  return cardLabel(card as unknown as UnoCard);
}

function Shell({ title, subtitle, children, variant }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  variant?: string;
}) {
  return (
    <main className={`new-game-page ${variant ? `new-game-page--${variant}` : ''}`}>
      <header className="new-game-header">
        <div className="new-game-header__copy">
          <span className="new-game-kicker">局域网实时对局</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <GameLeaveButton />
      </header>
      {children}
    </main>
  );
}

function unoSubtitle(view: AnyView, members: MemberLike[]): string {
  if (view.phase === 'game_over') return `${nameFor(members, view.winnerId)} 获胜`;
  const currentColor = view.currentColor ?? view.topDiscard?.color ?? view.lastDiscard?.color ?? view.previousDiscard?.color;
  return `当前颜色：${colorLabel(currentColor)} · ${nameFor(members, view.currentPlayerId)} 的回合`;
}

export function UnoGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [wildCardId, setWildCardId] = useState<string | null>(null);

  const me = view.me;
  const myTurn = Boolean(me) && view.currentPlayerId === me?.playerId;
  const top = view.topDiscard ?? view.lastDiscard ?? view.previousDiscard ?? view.previousCard ?? null;
  const currentColor = view.currentColor ?? top?.color ?? null;
  const directionLabel = view.direction === -1 ? '逆时针' : '顺时针';
  const mustDraw = view.pendingDraw > 0;

  function play(card: AnyView) {
    // 万能牌需要先选色，其余直接出。
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
  }

  return (
    <Shell title="UNO" subtitle={unoSubtitle(view, members)} variant="uno">
      <section className="uno-table">
        <div className="uno-players" aria-label="UNO 玩家状态">
          {view.players.map((p: AnyView, index: number) => (
            <div
              key={p.playerId}
              className={[
                'new-player-chip',
                'uno-player-chip',
                p.playerId === view.currentPlayerId ? 'active' : '',
                p.playerId === me?.playerId ? 'self' : '',
                p.unoCalled ? 'uno-called' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="uno-player-chip__seat">{index + 1}</span>
              <strong>{nameFor(members, p.playerId)}</strong>
              <span>
                {p.playerId === me?.playerId ? '我 · ' : ''}{p.handCount} 张
                {p.unoCalled ? ' · UNO!' : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="uno-center-stage" aria-label="当前弃牌与上一位出牌者">
          <div className="uno-discard-copy">
            <span>上一张公开牌</span>
            <strong>{top ? `${colorLabel(top.color ?? currentColor)} · ${cardFaceLabel(top)}` : '等待首张牌'}</strong>
            <small>{view.lastPlayedBy ? `由 ${nameFor(members, view.lastPlayedBy)} 打出 · ` : ''}当前颜色：{colorLabel(currentColor)} · {directionLabel}</small>
          </div>
          <div className={`uno-discard uno-card color-${currentColor ?? 'wild'}`}>
            <span>{top ? cardFaceLabel(top) : '—'}</span>
            <small>{directionLabel}</small>
          </div>
        </div>

        {mustDraw && <p className="game-alert">需要摸 {view.pendingDraw} 张罚牌</p>}

        {me && (
          <div className="uno-hand" aria-label="我的手牌">
            {me.hand.map((card: AnyView) => (
              <button
                key={card.id}
                type="button"
                disabled={busy || !myTurn || mustDraw}
                className={`uno-card color-${card.color ?? 'wild'}`}
                onClick={() => play(card)}
              >
                <strong>{cardFaceLabel(card)}</strong>
                <small>{colorLabel(card.color)}</small>
              </button>
            ))}
          </div>
        )}

        {myTurn && (
          <div className="new-game-actions">
            <button type="button" disabled={busy} onClick={() => void act({ type: 'draw_card' })}>
              摸牌
            </button>
            {me?.hasDrawnThisTurn && (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'pass_after_draw' })}>
                结束回合
              </button>
            )}
            {me?.hand.length === 1 && (
              <button type="button" className="accent" disabled={busy} onClick={() => void act({ type: 'call_uno' })}>
                喊 UNO
              </button>
            )}
          </div>
        )}

        {wildCardId && (
          <div className="color-picker">
            <strong>选择颜色</strong>
            {UNO_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-${color}`}
                disabled={busy}
                onClick={() => {
                  void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
                  setWildCardId(null);
                }}
              >
                {UNO_COLOR_NAMES[color]}
              </button>
            ))}
            <button type="button" className="color-picker-cancel" onClick={() => setWildCardId(null)}>
              取消
            </button>
          </div>
        )}

        {error && <p className="game-error">{error}</p>}
      </section>
    </Shell>
  );
}

function isRedSuit(suit: string | undefined): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** 底牌与当前牌型共用的静态牌面，两处渲染逻辑完全一致。 */
function CardFace({ card }: { card: AnyView }) {
  return <PlayingCard rank={card.rank} suit={card.suit} className="card-face-static" />;
}

function landlordSubtitle(view: AnyView, members: MemberLike[]): string {
  if (view.phase === 'bidding') return `${nameFor(members, view.currentBidderId)} 正在叫分`;
  if (view.phase === 'game_over') return `${view.winnerTeam === 'landlord' ? '地主' : '农民'}阵营获胜`;
  return `${nameFor(members, view.currentPlayerId)} 的回合 · 倍率 ${view.multiplier}`;
}
export function LandlordGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [selected, setSelected] = useState<string[]>([]);
  const me = view.me;
  const myTurn = me && view.currentPlayerId === me.playerId;
  const myBid = me && view.currentBidderId === me.playerId;
  const canSelectCards = view.phase === 'playing' && myTurn;
  const dragRef = useRef<{
    startIndex: number;
    lastIndex: number;
    moved: boolean;
    baseSelected: string[];
  } | null>(null);
  const suppressClickRef = useRef(false);

  function toggle(id: string) {
    if (!canSelectCards || suppressClickRef.current) return;
    setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  function mergeSelectedRange(baseSelected: string[], startIndex: number, endIndex: number): string[] {
    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const picked = me.hand.slice(from, to + 1).map((card: AnyView) => card.id);
    return Array.from(new Set([...baseSelected, ...picked]));
  }

  function indexFromPointer(event: React.PointerEvent): number | null {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const button = target?.closest<HTMLButtonElement>('[data-card-index]');
    const index = Number(button?.dataset.cardIndex);
    return Number.isInteger(index) ? index : null;
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (!canSelectCards) return;
    dragRef.current = {
      startIndex: index,
      lastIndex: index,
      moved: false,
      baseSelected: selected,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const index = indexFromPointer(event);
    if (index === null || index === drag.lastIndex) return;
    drag.lastIndex = index;
    drag.moved = true;
    setSelected(mergeSelectedRange(drag.baseSelected, drag.startIndex, index));
  }

  function finishDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  return (
    <Shell title="斗地主" subtitle={landlordSubtitle(view, members)} variant="landlord">
      <section className={`landlord-table phase-${view.phase}`}>
        <div className="landlord-players">
          {view.players.map((p: AnyView) => {
            const bidding = p.playerId === view.currentBidderId;
            const playing = p.playerId === view.currentPlayerId;
            return (
              <div key={p.playerId} className={`new-player-chip ${bidding || playing ? 'active' : ''}`}>
                <strong>
                  {nameFor(members, p.playerId)}
                  {p.playerId === view.landlordId && <span aria-label="地主">👑</span>}
                </strong>
                <span>
                  {p.handCount} 张
                  {bidding ? ' · 正在叫分' : ''}
                  {playing ? ' · 正在出牌' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div className="bottom-cards landlord-panel">
          <span>{view.landlordId ? '地主底牌' : '地主底牌 · 叫分后公开'}</span>
          <div className="bottom-card-row">
            {view.landlordId
              ? view.bottomCards.map((card: AnyView) => <CardFace key={card.id} card={card} />)
              : [0, 1, 2].map((i) => (
                  <CardBack key={i} className="card-face-static" />
                ))}
          </div>
        </div>

        <div className="current-combo landlord-panel">
          {view.phase === 'bidding' ? (
            <>
              <strong>叫地主阶段</strong>
              <p>
                {myBid
                  ? '轮到你叫分，请根据手牌选择。'
                  : `等待 ${nameFor(members, view.currentBidderId)} 叫分`}
              </p>
            </>
          ) : view.currentTrick ? (
            <>
              <strong>{nameFor(members, view.currentTrick.playerId)} 出牌</strong>
              <div className="current-combo-row">
                {view.currentTrick.combo.cards.map((card: AnyView) => (
                  <CardFace key={card.id} card={card} />
                ))}
              </div>
              <small>{view.currentTrick.combo.type}</small>
            </>
          ) : (
            <>
              <strong>等待首轮出牌</strong>
              <p>{nameFor(members, view.currentPlayerId)} 可以先出任意合法牌型。</p>
            </>
          )}
        </div>

        {view.phase === 'bidding' && (
          <div className="new-game-actions landlord-bid-actions">
            {myBid
              ? [0, 1, 2, 3].map((score) => (
                  <button
                    key={score}
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'bid_score', score })}
                  >
                    {score === 0 ? '不叫' : `${score} 分`}
                  </button>
                ))
              : (
                <span className="waiting-tip">
                  等待 {nameFor(members, view.currentBidderId)} 叫分…
                </span>
              )}
          </div>
        )}

        {me && (
          <>
            <div
              className={`landlord-hand ${canSelectCards ? 'can-select' : 'readonly'}`}
              style={{ ['--hand-count' as string]: String(me.hand.length) }}
              aria-label="我的手牌，可拖动连续选择多张牌"
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onLostPointerCapture={finishDrag}
            >
              {me.hand.map((card: AnyView, index: number) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!canSelectCards}
                  data-card-index={index}
                  aria-pressed={selected.includes(card.id)}
                  className={[
                    'landlord-hand__card',
                    selected.includes(card.id) ? 'selected' : '',
                    isRedSuit(card.suit) ? 'red' : '',
                  ].filter(Boolean).join(' ')}
                  onPointerDown={(event) => startDrag(event, index)}
                  onClick={() => toggle(card.id)}
                >
                  <PlayingCard rank={card.rank} suit={card.suit} />
                </button>
              ))}
            </div>
            <p className="hand-hint">
              我的手牌 · {me.hand.length} 张
              {view.phase === 'bidding'
                ? ' · 叫分阶段暂不能出牌'
                : canSelectCards
                  ? selected.length > 0
                    ? ` · 已选 ${selected.length} 张`
                    : ' · 点击或拖拽选择要出的牌'
                  : ' · 等待你的回合'}
            </p>
            {view.phase === 'playing' && myTurn && (
              <div className="new-game-actions">
                <button
                  type="button"
                  className="accent"
                  disabled={busy || selected.length === 0}
                  onClick={() => {
                    void act({ type: 'play_combo', cardIds: selected });
                    setSelected([]);
                  }}
                >
                  出牌
                </button>
                <button
                  type="button"
                  disabled={busy || !view.currentTrick}
                  onClick={() => void act({ type: 'pass_turn' })}
                >
                  不出
                </button>
                {selected.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => setSelected([])}>
                    取消选择
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="game-error">{error}</p>}
      </section>
    </Shell>
  );
}
