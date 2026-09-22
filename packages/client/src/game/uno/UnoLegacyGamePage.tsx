/**
 * UNO 经典单局（uno_legacy_platform_v1）页面。
 *
 * U07 从 NewGamePages.tsx 抽出。这个规则集仍在 catalog 上架
 * （「经典单局 · 不叠牌 · 抢先出完即胜」），视图形状与欢乐房规
 * （uno_platform_house_v1，走 uno/stage/UnoHouseStage）完全不同：
 * 没有 roundScores / clockInfo / pendingPenalty，无法共用同一组件。
 * 所以这里是抽出而非删除——删掉会让一个在售玩法渲染不出来。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- legacy 服务端视图未做类型收窄，按运行时视图消费。 */
import { useEffect, useState, useRef } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction, type MemberLike } from '../useGameAction.ts';
import { UNO_COLORS, cardLabel, colorLabel, getUnoCardAssetPath, type UnoCard } from './types.ts';
import { TabletopOvalShell, type PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../../shared-ui/CardFanEngine.tsx';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';

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
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const me = view.me;
  const myTurn = Boolean(me) && view.currentPlayerId === me?.playerId;
  const top = view.topDiscard ?? view.lastDiscard ?? view.previousDiscard ?? view.previousCard ?? null;
  const currentColor = view.currentColor ?? top?.color ?? null;
  const directionLabel = view.direction === -1 ? '逆时针' : '顺时针';
  const playableCardIds: string[] = me?.playableCardIds ?? [];
  const hasDrawnThisTurn = Boolean(me?.hasDrawnThisTurn);

  const mySeat = (view.players || []).find((p: AnyView) => p.playerId === me?.playerId);
  const unoCalled = Boolean(mySeat?.unoCalled);
  const canCallUno = Boolean(me) && me.hand?.length === 1 && !unoCalled;

  // 摸牌后无可出牌自动过牌（800ms 延迟让摸牌动画可见，useRef+busy 防重）
  const autoPassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPassedRef = useRef(false);

  useEffect(() => {
    if (myTurn && hasDrawnThisTurn && playableCardIds.length === 0 && !busy && !autoPassedRef.current) {
      autoPassTimerRef.current = setTimeout(() => {
        autoPassedRef.current = true;
        void act({ type: 'pass_after_draw' });
      }, 800);
      return () => {
        if (autoPassTimerRef.current) {
          clearTimeout(autoPassTimerRef.current);
          autoPassTimerRef.current = null;
        }
      };
    }
    if (!myTurn || !hasDrawnThisTurn) {
      autoPassedRef.current = false;
      if (autoPassTimerRef.current) {
        clearTimeout(autoPassTimerRef.current);
        autoPassTimerRef.current = null;
      }
    }
  }, [myTurn, hasDrawnThisTurn, playableCardIds.length, busy, act]);

  function play(card: AnyView) {
    if (card.kind === 'skip') webAudio.playUnoSkip();
    else if (card.kind === 'reverse') webAudio.playUnoReverse();
    else if (card.kind === 'draw2' || card.kind === 'wild4') webAudio.playUnoDrawPenalty();
    else webAudio.playCardPlay();

    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
    setSelectedCardIds([]);
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
  const fanCards: CardItem[] = (me?.hand || []).map((card: AnyView) => {
    const isPlayable = myTurn && playableCardIds.includes(card.id);
    return {
      id: card.id,
      label: cardFaceLabel(card),
      sublabel: colorLabel(card.color),
      colorTheme: card.color ?? 'wild',
      imageUrl: getUnoCardAssetPath(card as unknown as UnoCard),
      disabled: !isPlayable,
      badge: isPlayable ? '可出' : undefined,
      raw: card,
    };
  });

  const centerArena = (
    <div className="uno-arena-arena" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <div className="uno-deck-area" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
        {/* 摸牌堆 */}
        <button
          type="button"
          className="uno-draw-pile"
          onClick={() => {
            if (myTurn && !busy) void act({ type: 'draw_card' });
          }}
          disabled={!myTurn || busy}
          style={{
            width: '84px',
            height: '124px',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: myTurn ? 'pointer' : 'default',
            boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <img src="/assets/uno/back.png" alt="摸牌" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>

        {/* 弃牌堆顶牌 */}
        <div
          className={`uno-discard-card uno-card--${currentColor ?? 'wild'}`}
          style={{
            width: '84px',
            height: '124px',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {top ? (
            <img
              src={getUnoCardAssetPath(top as unknown as UnoCard)}
              alt={cardFaceLabel(top)}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ color: '#fff', fontWeight: 900 }}>空</span>
          )}
        </div>
      </div>

      <div className="uno-info-bar" style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
        <span>方向: <strong>{directionLabel}</strong></span>
        {view.pendingDraw > 0 && <span style={{ color: '#ef476f' }}>待摸牌: {view.pendingDraw} 张</span>}
      </div>

      {error && <div className="game-error">{error}</div>}
    </div>
  );

  const bottomBar = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      {wildCardId && (
        <div className="uno-color-wheel-backdrop" role="dialog" aria-modal="true" aria-label="万能牌选色">
          <div className="uno-color-wheel-dialog">
            <h3>
              <GameIcon name="uno_wild" size={24} />
              请选择声明颜色
            </h3>
            <div className="uno-color-wheel-grid">
              {UNO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`uno-color-wheel-btn color-${c}`}
                  disabled={busy}
                  onClick={() => {
                    webAudio.playCardPlay();
                    void act({ type: 'play_card', cardId: wildCardId, declaredColor: c });
                    setWildCardId(null);
                    setSelectedCardIds([]);
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>●</span>
                  {colorLabel(c)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="uno-color-wheel-cancel"
              onClick={() => setWildCardId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {(canCallUno || myTurn) && (
        <div className="uno-floating-controls">
          {selectedCardIds.length > 0 && (
            <button
              type="button"
              className="uno-floating-btn btn-primary"
              disabled={busy || !myTurn}
              onClick={() => {
                const target = (me?.hand ?? []).find((card: AnyView) => selectedCardIds.includes(card.id));
                if (target) play(target);
              }}
            >
              <GameIcon name="rocket" size={16} />
              出牌
            </button>
          )}
          {canCallUno && (
            <button
              type="button"
              className="uno-floating-btn btn-danger"
              disabled={busy}
              onClick={() => {
                webAudio.playUnoShout();
                void act({ type: 'call_uno' });
              }}
            >
              <GameIcon name="uno_alert" size={16} />
              喊 UNO!
            </button>
          )}

          {myTurn && !hasDrawnThisTurn && (
            <button
              type="button"
              className={`uno-floating-btn ${selectedCardIds.length > 0 ? 'btn-outline' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => {
                webAudio.playDealCards();
                void act({ type: 'draw_card' });
              }}
            >
              <GameIcon name="cards_deck" size={16} />
              摸一张牌
            </button>
          )}

          {myTurn && hasDrawnThisTurn && (
            <button
              type="button"
              className="uno-floating-btn btn-outline"
              disabled={busy}
              onClick={() => void act({ type: 'pass_after_draw' })}
            >
              <GameIcon name="door_exit" size={16} />
              过牌结束
            </button>
          )}
        </div>
      )}

      {me && (
        <CardFanEngine
          cards={fanCards}
          selectedCardIds={selectedCardIds}
          onSelectCards={setSelectedCardIds}
          hidePlayButton
          disabled={busy || !myTurn}
        />
      )}
    </div>
  );

  return (
    <TabletopOvalShell
      title="UNO"
      subtitle={unoSubtitle(view, members)}
      gameId="uno"
      theme="sunset"
      players={playerSeats}
      currentUserId={me?.playerId}
      centerArena={centerArena}
      bottomBar={bottomBar}
      phaseBannerText={myTurn ? '轮到你的回合' : undefined}
      phaseBannerSubtext={busy ? '正在提交操作…' : undefined}
      phaseKey={`${view.phase}:${view.currentPlayerId ?? view.winnerId ?? 'idle'}`}
    />
  );
}
