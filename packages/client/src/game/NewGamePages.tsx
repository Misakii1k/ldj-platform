/* eslint-disable @typescript-eslint/no-explicit-any -- 三个新游戏的服务端视图结构不同，此组件按 moduleId 消费运行时视图。 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { PlayingCard, CardBack } from './PlayingCard.tsx';
import { nameFor, useGameAction, type MemberLike } from './useGameAction.ts';
import { UNO_COLORS, UNO_COLOR_NAMES, cardLabel, colorLabel, type UnoCard } from './uno/types.ts';
import { TabletopOvalShell, type PlayerSeat } from '../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../shared-ui/CardFanEngine.tsx';

type AnyView = Record<string, any>;

/** legacy UNO 运行时视图未做类型收窄，转成共享牌面标签的稳定适配。 */
function cardFaceLabel(card: AnyView): string {
  return cardLabel(card as unknown as UnoCard);
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
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
  }

  // 映射环形桌玩家座位
  const playerSeats: PlayerSeat[] = (view.players || []).map((p: AnyView) => ({
    id: p.playerId,
    name: nameFor(members, p.playerId),
    isCurrentTurn: p.playerId === view.currentPlayerId,
    handCount: p.handCount,
    badge: p.unoCalled ? '喊 UNO!' : undefined,
  }));

  // 映射 CSS 3D 扇形手牌
  const fanCards: CardItem[] = (me?.hand || []).map((card: AnyView) => ({
    id: card.id,
    label: cardFaceLabel(card),
    sublabel: colorLabel(card.color),
    colorTheme: card.color ?? 'wild',
    raw: card,
  }));

  const centerArena = (
    <div className="uno-center-stage" style={{ textAlign: 'center' }}>
      <div className="uno-discard-copy">
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>上一张公开牌</span>
        <h2 style={{ margin: '4px 0', color: '#ffd166' }}>
          {top ? `${colorLabel(top.color ?? currentColor)} · ${cardFaceLabel(top)}` : '等待首张牌'}
        </h2>
        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
          {view.lastPlayedBy ? `由 ${nameFor(members, view.lastPlayedBy)} 打出 · ` : ''}
          当前颜色：{colorLabel(currentColor)} · {directionLabel}
        </p>
      </div>

      {mustDraw && <div style={{ color: '#ef476f', fontWeight: 800, marginTop: '12px' }}>需要摸 {view.pendingDraw} 张罚牌</div>}
      {error && <div className="game-error" style={{ marginTop: '8px' }}>{error}</div>}
    </div>
  );

  const bottomBar = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      {me && (
        <CardFanEngine
          cards={fanCards}
          disabled={busy || !myTurn || mustDraw}
          onPlayCard={(c) => play(c.raw as AnyView)}
          playButtonText="出牌"
        />
      )}

      {myTurn && (
        <div className="new-game-actions" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
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
              喊 UNO!
            </button>
          )}
        </div>
      )}

      {wildCardId && (
        <div className="color-picker" style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.8)', padding: '10px 16px', borderRadius: '20px' }}>
          <strong style={{ color: '#fff', alignSelf: 'center' }}>选择颜色:</strong>
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
    </div>
  );

  return (
    <TabletopOvalShell
      title="UNO"
      subtitle={unoSubtitle(view, members)}
      theme="poker"
      players={playerSeats}
      currentUserId={me?.playerId}
      centerArena={centerArena}
      bottomBar={bottomBar}
      phaseBannerText={myTurn ? '👉 轮到你的回合' : undefined}
    />
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const me = view.me;
  const myTurn = me && view.currentPlayerId === me.playerId;
  const myBid = me && view.currentBidderId === me.playerId;

  // 座位映射
  const playerSeats: PlayerSeat[] = (view.players || []).map((p: AnyView) => ({
    id: p.playerId,
    name: nameFor(members, p.playerId),
    isCurrentTurn: p.playerId === view.currentPlayerId || p.playerId === view.currentBidderId,
    handCount: p.handCount,
    badge: p.playerId === view.landlordId ? '👑 地主' : '👨‍🌾 农民',
  }));

  // 扇形卡牌映射
  const fanCards: CardItem[] = (me?.hand || []).map((card: AnyView) => ({
    id: card.id,
    label: `${card.rank ?? ''}`,
    sublabel: card.suit ?? '',
    colorTheme: isRedSuit(card.suit) ? 'red' : 'blue',
    raw: card,
  }));

  const centerArena = (
    <div className="landlord-center-arena" style={{ textAlign: 'center', width: '100%' }}>
      {/* 地主底牌 */}
      <div className="bottom-cards" style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
          {view.landlordId ? '👑 地主底牌' : '👑 地主底牌 · 叫分后公开'}
        </span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '6px' }}>
          {view.landlordId
            ? view.bottomCards.map((card: AnyView) => <CardFace key={card.id} card={card} />)
            : [0, 1, 2].map((i) => <CardBack key={i} className="card-face-static" />)}
        </div>
      </div>

      {/* 当前桌面牌型组合 */}
      <div className="current-combo-box" style={{ background: 'rgba(0,0,0,0.5)', padding: '12px 24px', borderRadius: '16px', backdropFilter: 'blur(8px)' }}>
        {view.phase === 'bidding' ? (
          <>
            <strong style={{ color: '#ffd166' }}>📢 叫地主阶段</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
              {myBid ? '轮到你叫分，请根据手牌选择' : `等待 ${nameFor(members, view.currentBidderId)} 叫分...`}
            </p>
          </>
        ) : view.currentTrick ? (
          <>
            <strong style={{ color: '#06d6a0' }}>{nameFor(members, view.currentTrick.playerId)} 打出:</strong>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', margin: '8px 0' }}>
              {view.currentTrick.combo.cards.map((card: AnyView) => (
                <CardFace key={card.id} card={card} />
              ))}
            </div>
            <small style={{ color: '#ffd166' }}>牌型: {view.currentTrick.combo.type}</small>
          </>
        ) : (
          <>
            <strong style={{ color: '#ffd166' }}>🃏 自由出牌</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>{nameFor(members, view.currentPlayerId)} 可以出任意合法牌型</p>
          </>
        )}
      </div>

      {error && <div className="game-error" style={{ marginTop: '12px' }}>{error}</div>}
    </div>
  );

  const bottomBar = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
      {/* 叫分阶段按钮 */}
      {view.phase === 'bidding' && myBid && (
        <div style={{ display: 'flex', gap: '12px' }}>
          {[0, 1, 2, 3].map((score) => (
            <button
              key={score}
              type="button"
              disabled={busy}
              style={{ padding: '8px 16px', borderRadius: '16px', fontWeight: 800 }}
              onClick={() => void act({ type: 'bid_score', score })}
            >
              {score === 0 ? '不叫' : `${score} 分`}
            </button>
          ))}
        </div>
      )}

      {/* 出牌阶段 3D 扇形手牌引擎 */}
      {me && view.phase === 'playing' && (
        <CardFanEngine
          cards={fanCards}
          selectedCardIds={selectedIds}
          onSelectCards={(ids) => setSelectedIds(ids)}
          allowMultiSelect={true}
          disabled={busy || !myTurn}
          onPlayCard={() => {
            void act({ type: 'play_combo', cardIds: selectedIds });
            setSelectedIds([]);
          }}
          playButtonText="出牌"
        />
      )}

      {/* 出牌操作逻辑 */}
      {view.phase === 'playing' && myTurn && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            disabled={busy || !view.currentTrick}
            onClick={() => void act({ type: 'pass_turn' })}
          >
            不出
          </button>
          {selectedIds.length > 0 && (
            <button type="button" disabled={busy} onClick={() => setSelectedIds([])}>
              取消选择
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <TabletopOvalShell
      title="斗地主"
      subtitle={landlordSubtitle(view, members)}
      theme="poker"
      players={playerSeats}
      currentUserId={me?.playerId}
      centerArena={centerArena}
      bottomBar={bottomBar}
      phaseBannerText={myTurn ? '👉 轮到你出牌' : myBid ? '📢 轮到你叫分' : undefined}
    />
  );
}

