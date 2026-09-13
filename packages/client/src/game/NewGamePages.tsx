/* eslint-disable @typescript-eslint/no-explicit-any -- 三个新游戏的服务端视图结构不同，此组件按 moduleId 消费运行时视图。 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { PlayingCard, CardBack } from './PlayingCard.tsx';
import { nameFor, useGameAction, type MemberLike } from './useGameAction.ts';
import { UNO_COLORS, cardLabel, colorLabel, getUnoCardAssetPath, type UnoCard } from './uno/types.ts';
import { TabletopOvalShell, type PlayerSeat } from '../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../shared-ui/CardFanEngine.tsx';
import { GameIcon } from '../shared-ui/GameIcon.tsx';
import { webAudio } from '../shared-ui/WebAudioManager.ts';
import { useCountdown } from '../shared-ui/useCountdown.ts';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import { GameActionFeedback } from '../shared-ui/GameMotion.tsx';
import { ArenaBoard } from '../shared-ui/ArenaBoard.tsx';
import { TabletopEventOverlay } from '../shared-ui/TabletopEventOverlay.tsx';

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


const RANK_ORDER: Record<string, number> = {
  BJ: 17,
  SJ: 16,
  '2': 15,
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
};

const SUIT_ORDER: Record<string, number> = {
  spades: 4,
  hearts: 3,
  clubs: 2,
  diamonds: 1,
};

function comboName(type: string): React.ReactNode {
  switch (type) {
    case 'single': return '单张';
    case 'pair': return '对子';
    case 'triple': return '三张';
    case 'triple_single': return '三带一';
    case 'triple_pair': return '三带对';
    case 'straight': return '顺子';
    case 'pair_sequence': return '连对';
    case 'bomb':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <GameIcon name="bomb" size={14} />
          炸弹
        </span>
      );
    case 'rocket':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <GameIcon name="rocket" size={14} />
          王炸
        </span>
      );
    default: return type;
  }
}

/** 默认保持紧叠；只有整排超出可用宽度时才加大重叠，绝不比原间距更疏 */
function computeLandlordHandOverlap(count: number, containerWidth: number, cardWidth: number): number {
  if (count <= 1 || cardWidth <= 0) return 0;
  const preferredOverlap = Math.min(34, Math.round(cardWidth * 0.53));
  const minStep = Math.max(16, Math.round(cardWidth * 0.28));
  const preferredStep = Math.max(minStep, cardWidth - preferredOverlap);
  const usable = Math.max(cardWidth, containerWidth - 16);
  const fitStep = (usable - cardWidth) / (count - 1);
  const step = Math.min(preferredStep, Math.max(minStep, fitStep));
  return Math.max(0, Math.round(cardWidth - step));
}

/** 底牌与当前牌型共用的静态牌面 */
function CardFace({ card, className }: { card: AnyView; className?: string }) {
  return <PlayingCard rank={card.rank} suit={card.suit} className={className ?? 'card-face-static'} />;
}

function landlordSubtitle(view: AnyView, members: MemberLike[]): string {
  if (view.phase === 'bidding') return `${nameFor(members, view.currentBidderId)} 正在叫分`;
  if (view.phase === 'game_over') return `${view.winnerTeam === 'landlord' ? '地主' : '农民'}阵营获胜`;
  return `${nameFor(members, view.currentPlayerId)} 的回合 · 倍率 ${view.multiplier}`;
}

/** 左右对手席位组件 */
function formatCountdownSuffix(seconds: number | null): string {
  return seconds === null ? '' : ` (${seconds}s)`;
}

function OpponentStation({
  player,
  position,
  view,
  members,
  remainSeconds,
}: {
  player: AnyView;
  position: 'left' | 'right';
  view: AnyView;
  members: MemberLike[];
  remainSeconds: number | null;
}) {
  const isTurn = player.playerId === view.currentPlayerId || player.playerId === view.currentBidderId;
  const isLandlord = player.playerId === view.landlordId;
  const name = nameFor(members, player.playerId);
  const bid = (view.bids || []).find((b: AnyView) => b.playerId === player.playerId);

  let statusBubble: React.ReactNode = null;
  if (view.phase === 'bidding') {
    if (bid) {
      statusBubble = bid.score === 0 ? '不叫' : `${bid.score} 分`;
    } else if (isTurn) {
      statusBubble = (
        <span className="landlord-countdown-pill">
          <GameIcon name="hourglass" size={12} />
          {remainSeconds === null ? '思考中' : `${remainSeconds}s`}
        </span>
      );
    }
  } else if (view.phase === 'playing') {
    if (isTurn) {
      statusBubble = (
        <span className="landlord-countdown-pill">
          <GameIcon name="hourglass" size={12} />
          {remainSeconds === null ? '思考中' : `${remainSeconds}s`}
        </span>
      );
    }
  }

  return (
    <div className={`landlord-opponent landlord-opponent--${position} ${isTurn ? 'is-turn' : ''}`}>
      {/* 气泡提示 / 倒计时 */}
      {statusBubble && (
        <div className={`landlord-bubble landlord-bubble--${position}`}>
          {statusBubble}
        </div>
      )}

      {/* 头像与光圈 */}
      <div className="landlord-opponent-avatar-box">
        <UserAvatar
          avatar={resolveMemberAvatar(
            (members as any[]).find((m) => m.playerId === player.playerId),
            { seat: player.seat, playerId: player.playerId },
          )}
          nickname={name}
          size={46}
          className="landlord-opponent-avatar"
        />
        {isTurn && <div className="tabletop-turn-halo" />}
        <span className="landlord-opponent-hand-count" title="剩余手牌">
          <GameIcon name="cards_deck" size={11} style={{ marginRight: '3px' }} />
          {player.handCount}
        </span>
      </div>

      {/* 玩家信息 */}
      <div className="landlord-opponent-info">
        <span className="landlord-opponent-name" title={name}>{name}</span>
        {view.landlordId ? (
          <span className={`landlord-role-badge ${isLandlord ? 'is-landlord' : 'is-farmer'}`}>
            <GameIcon name={isLandlord ? 'crown' : 'farmer'} size={12} style={{ marginRight: '3px' }} />
            {isLandlord ? '地主' : '农民'}
          </span>
        ) : (
          <span className="landlord-role-badge">待定</span>
        )}
      </div>
    </div>
  );
}

/** 玩家独立出牌与行动展示区（左家在左边、右家在右边、自己在下方） */
function PlayerActionDrop({
  playerId,
  position,
  view,
  remainSeconds,
}: {
  playerId: string;
  position: 'left' | 'right' | 'self';
  view: AnyView;
  remainSeconds: number | null;
}) {
  const isBidding = view.phase === 'bidding';
  const isPlaying = view.phase === 'playing';
  const isCurrentTurn = view.currentPlayerId === playerId || view.currentBidderId === playerId;

  // 叫分阶段
  if (isBidding) {
    const bid = (view.bids || []).find((b: AnyView) => b.playerId === playerId);
    if (bid) {
      return (
        <div className={`landlord-drop-zone landlord-drop-zone--${position} is-bidded`}>
          <span className="landlord-drop-badge landlord-drop-badge--bid">
            {bid.score === 0 ? '不叫' : `${bid.score} 分`}
          </span>
        </div>
      );
    }
    if (isCurrentTurn) {
      return (
        <div className={`landlord-drop-zone landlord-drop-zone--${position} is-thinking`}>
          <span className="landlord-drop-badge landlord-drop-badge--thinking landlord-countdown-badge">
            <GameIcon name="hourglass" size={13} style={{ marginRight: '3px' }} />
            {position === 'self' ? `轮到你叫分${formatCountdownSuffix(remainSeconds)}` : `叫分倒计时${formatCountdownSuffix(remainSeconds)}`}
          </span>
        </div>
      );
    }
    return <div className={`landlord-drop-zone landlord-drop-zone--${position} is-empty`} />;
  }

  // 出牌阶段
  if (isPlaying) {
    const isTrickOwner = view.currentTrick && view.currentTrick.playerId === playerId;

    if (isTrickOwner && view.currentTrick) {
      return (
        <div className={`landlord-drop-zone landlord-drop-zone--${position} is-played`}>
          <div className="landlord-drop-combo-header">
            <span className="landlord-drop-combo-tag">
              {comboName(view.currentTrick.combo?.type ?? '')}
            </span>
          </div>
          <div className="landlord-drop-cards">
            {(view.currentTrick.combo?.cards ?? []).map((card: AnyView) => (
              <CardFace key={card.id} card={card} />
            ))}
          </div>
        </div>
      );
    }

    if (isCurrentTurn) {
      return (
        <div className={`landlord-drop-zone landlord-drop-zone--${position} is-thinking`}>
          <span className="landlord-drop-badge landlord-drop-badge--thinking landlord-countdown-badge">
            <GameIcon name="hourglass" size={13} style={{ marginRight: '3px' }} />
            {position === 'self' ? `轮到你出牌${formatCountdownSuffix(remainSeconds)}` : `出牌倒计时${formatCountdownSuffix(remainSeconds)}`}
          </span>
        </div>
      );
    }

    return <div className={`landlord-drop-zone landlord-drop-zone--${position} is-empty`} />;
  }

  return <div className={`landlord-drop-zone landlord-drop-zone--${position} is-empty`} />;
}

export function LandlordGamePage({ view }: { view: AnyView }) {
  const { profile } = useUserProfile();
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const handContainerRef = useRef<HTMLDivElement | null>(null);
  const [cardOverlap, setCardOverlap] = useState(34);
  const me = view.me;
  const myTurn = Boolean(me) && view.currentPlayerId === me?.playerId;
  const myBid = Boolean(me) && view.currentBidderId === me?.playerId;

  const hasDeadline = typeof view.deadlineAt === 'number' && Number.isFinite(view.deadlineAt);
  const countdown = useCountdown(hasDeadline ? view.deadlineAt : null);
  const remainSeconds = hasDeadline && Number.isFinite(countdown.secondsLeft)
    ? Math.max(0, countdown.secondsLeft)
    : null;

  useEffect(() => {
    if (view.phase !== 'playing' || !myTurn) setSelectedIds([]);
  }, [myTurn, view.phase]);

  // 叫分结束、地主确定的关键瞬间：用共享全屏反馈盖一次印（仅在地主 id 从无到有时触发）。
  const [landlordReveal, setLandlordReveal] = useState<{ name: string; isMe: boolean } | null>(null);
  const prevLandlordIdRef = useRef<string | null>(null);
  useEffect(() => {
    const current = typeof view.landlordId === 'string' ? view.landlordId : null;
    const previous = prevLandlordIdRef.current;
    prevLandlordIdRef.current = current;
    if (current !== null && previous === null) {
      setLandlordReveal({ name: nameFor(members, current), isMe: current === me?.playerId });
    }
  }, [view.landlordId, members, me?.playerId]);

  // 整理手牌：按大王>小王>2>A>K>Q>J>10>9>8>7>6>5>4>3 降序排列
  const sortedHand = useMemo(() => {
    if (!me?.hand) return [];
    return [...me.hand].sort((a: AnyView, b: AnyView) => {
      const diff = (RANK_ORDER[b.rank] ?? 0) - (RANK_ORDER[a.rank] ?? 0);
      if (diff !== 0) return diff;
      return (SUIT_ORDER[b.suit] ?? 0) - (SUIT_ORDER[a.suit] ?? 0);
    });
  }, [me?.hand]);

  useEffect(() => {
    const el = handContainerRef.current;
    if (!el) return;
    const read = () => {
      const card = el.querySelector<HTMLElement>('.landlord-hand-card .playing-card, .landlord-hand-card svg');
      const cardWidth = card?.getBoundingClientRect().width || 64;
      setCardOverlap(computeLandlordHandOverlap(sortedHand.length, el.clientWidth, cardWidth));
    };
    read();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (observer) observer.observe(el);
    window.addEventListener('resize', read);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [sortedHand.length]);

  // 映射左家（上家）与右家（下家）
  const { leftPlayer, rightPlayer } = useMemo(() => {
    const allPlayers: AnyView[] = view.players || [];
    const myId = me?.playerId;
    const myIndex = allPlayers.findIndex((p: AnyView) => p.playerId === myId);

    if (allPlayers.length === 3 && myIndex !== -1) {
      return {
        rightPlayer: allPlayers[(myIndex + 1) % 3] ?? null,
        leftPlayer: allPlayers[(myIndex + 2) % 3] ?? null,
      };
    }
    const others = allPlayers.filter((p: AnyView) => p.playerId !== myId);
    return {
      leftPlayer: others[0] ?? null,
      rightPlayer: others[1] ?? null,
    };
  }, [view.players, me?.playerId]);

  const handleCardToggle = (cardId: string) => {
    if (busy || view.phase !== 'playing' || !myTurn) return;
    webAudio.playCardFlip();
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  // 手牌拖拽区间多选：按住起牌横向划过，途经区间内的牌全部选中；原地松开等同点击切换单牌
  const dragRef = useRef<{ index: number; startX: number; moved: boolean; initialSelected: string[]; toggleMode: 'select' | 'deselect' } | null>(null);
  const lastDragRangeRef = useRef<string>('');

  const selectRange = (from: number, to: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const rangeIds = sortedHand.slice(lo, hi + 1).map((card: AnyView) => card.id);
    const key = `${lo}:${hi}`;
    if (key !== lastDragRangeRef.current) {
      lastDragRangeRef.current = key;
      webAudio.playCardFlip();
    }
    
    let newSelected = [...drag.initialSelected];
    if (drag.toggleMode === 'select') {
      rangeIds.forEach(id => {
        if (!newSelected.includes(id)) newSelected.push(id);
      });
    } else {
      newSelected = newSelected.filter(id => !rangeIds.includes(id));
    }
    setSelectedIds(newSelected);
  };

  const handleHandPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || view.phase !== 'playing') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.landlord-hand-card');
    if (!el) return;
    const index = Number(el.dataset.index);
    if (Number.isNaN(index)) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    const cardId = sortedHand[index].id;
    const isSelected = selectedIds.includes(cardId);
    
    dragRef.current = { 
      index, 
      startX: e.clientX, 
      moved: false, 
      initialSelected: [...selectedIds],
      toggleMode: isSelected ? 'deselect' : 'select'
    };
    lastDragRangeRef.current = '';
  };

  const handleHandPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.landlord-hand-card');
    if (!el) return;
    const index = Number(el.dataset.index);
    if (Number.isNaN(index)) return;
    if (Math.abs(e.clientX - drag.startX) > 6) drag.moved = true;
    if (drag.moved) selectRange(drag.index, index);
  };

  const handleHandPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!drag) return;
    if (!drag.moved) {
      const card = sortedHand[drag.index];
      if (card) handleCardToggle((card as AnyView).id);
    }
  };

  const handlePlaySelected = () => {
    if (busy || selectedIds.length === 0) return;
    webAudio.playCardPlay();
    void act({ type: 'play_combo', cardIds: selectedIds });
    setSelectedIds([]);
  };

  const centerArena = (
    <div className="landlord-battlefield">
      {/* 桌面背景专属水印：大号“斗地主”艺术书法与小幅“聚乐桌游”品牌徽章 */}
      <div className="landlord-table-watermark" aria-hidden="true">
        <div className="landlord-table-watermark__logo">
          <span className="landlord-table-watermark__icon">✦</span>
          <span>聚乐桌游 · 经典棋牌</span>
        </div>
        <div className="landlord-table-watermark__title">斗地主</div>
        <div className="landlord-table-watermark__badge">CLASSIC LANDLORD</div>
      </div>

      {/* 顶部：地主底牌与倍率 */}
      <div className="landlord-top-bar">
        <div className="landlord-bottom-cards-panel bottom-cards">
          <span className="landlord-bottom-cards-label">
            <GameIcon name="crown" size={13} style={{ marginRight: '4px' }} />
            {view.landlordId ? '地主底牌' : '地主底牌 · 叫分后公开'}
          </span>
          <div className="landlord-bottom-cards-row">
            {view.landlordId
              ? (view.bottomCards ?? []).map((card: AnyView) => <CardFace key={card.id} card={card} className="card-face-static" />)
              : [0, 1, 2].map((i) => <CardBack key={i} className="card-face-static" />)}
          </div>
        </div>
        <div className="landlord-multiplier-badge">
          <span>倍率 <strong>x{view.multiplier}</strong></span>
        </div>
      </div>

      {/* 中间战场：左翼（左家头像 + 左家出牌区）+ 中心开阔区 + 右翼（右家出牌区 + 右家头像） */}
      <div className="landlord-mid-arena">
        {/* 左家区域（上家）：左侧头像 + 右侧出牌 */}
        <div className="landlord-station-group landlord-station-group--left">
          {leftPlayer && (
            <>
              <OpponentStation
                player={leftPlayer}
                position="left"
                view={view}
                members={members}
                remainSeconds={remainSeconds}
              />
              <PlayerActionDrop
                playerId={leftPlayer.playerId}
                position="left"
                view={view}
                remainSeconds={remainSeconds}
              />
            </>
          )}
        </div>

        {/* 中心开阔区：叫分/自由出牌轮次的焦点提示 */}
        <div className="landlord-center-nexus">
          {(view.phase === 'bidding' || (view.phase === 'playing' && !view.currentTrick)) && (
            <ArenaBoard
              className="landlord-nexus-board"
              tone={view.phase === 'bidding' ? 'accent' : 'paper'}
              compact
              headline={
                view.phase === 'bidding'
                  ? `等待 ${nameFor(members, view.currentBidderId)} 叫分`
                  : '自由出牌轮次'
              }
              hint={
                view.phase === 'bidding'
                  ? '按顺序叫分，最高分者成为地主并公开 3 张底牌'
                  : '无人接牌，你可以出任意合法牌型'
              }
            />
          )}
{error && (
            <GameActionFeedback
              active
              feedbackKey={error}
              variant="error"
              className="game-error landlord-arena-error"
              role="alert"
            >
              {error}
            </GameActionFeedback>
          )}
        </div>

        {/* 右家区域（下家）：左侧出牌 + 右侧头像 */}
        <div className="landlord-station-group landlord-station-group--right">
          {rightPlayer && (
            <>
              <PlayerActionDrop
                playerId={rightPlayer.playerId}
                position="right"
                view={view}
                remainSeconds={remainSeconds}
              />
              <OpponentStation
                player={rightPlayer}
                position="right"
                view={view}
                members={members}
                remainSeconds={remainSeconds}
              />
            </>
          )}
        </div>
      </div>

      {/* 底部：我的出牌展示区（位于操作栏与手牌上方） */}
      <div className="landlord-self-drop-bar">
        {me && (
          <PlayerActionDrop
            playerId={me.playerId}
            position="self"
            view={view}
            remainSeconds={remainSeconds}
          />
        )}
      </div>
    </div>
  );

  const bottomBar = (
    <div className="landlord-player-dashboard">
      {/* 自身状态与动作操作栏 */}
      <div className="landlord-self-bar">
        {/* 我的身份标识 */}
        {me && (
          <div className="landlord-self-badge">
            <UserAvatar avatar={profile.avatar} nickname={nameFor(members, me.playerId)} size={24} style={{ marginRight: '6px' }} />
            <span className="landlord-self-name">{nameFor(members, me.playerId)} (我)</span>
            {view.landlordId && (
              <span className={`landlord-role-badge ${me.playerId === view.landlordId ? 'is-landlord' : 'is-farmer'}`}>
                {me.playerId === view.landlordId ? '地主' : '农民'}
              </span>
            )}
          </div>
        )}

        {/* 动作操作面板 */}
        <div className="landlord-action-dock">
          {view.phase === 'bidding' && (
            myBid ? (
              <div className="landlord-bid-row">
                <button
                  type="button"
                  className="landlord-btn landlord-btn--pass"
                  disabled={busy}
                  onClick={() => void act({ type: 'bid_score', score: 0 })}
                >
                  不叫
                </button>
                {[1, 2, 3].map((score) => (
                  <button
                    key={score}
                    type="button"
                    className={`landlord-btn ${score === 3 ? 'landlord-btn--primary' : 'landlord-btn--bid'}`}
                    disabled={busy}
                    onClick={() => void act({ type: 'bid_score', score })}
                  >
                    {score} 分
                  </button>
                ))}
              </div>
            ) : (
              <div className="landlord-wait-tag">
                等待 {nameFor(members, view.currentBidderId)} 叫分{formatCountdownSuffix(remainSeconds)}
              </div>
            )
          )}

          {view.phase === 'playing' && (
            myTurn ? (
              <div className="landlord-play-row">
                <button
                  type="button"
                  className="landlord-btn landlord-btn--pass"
                  disabled={busy || !view.currentTrick}
                  onClick={() => void act({ type: 'pass_turn' })}
                  title={!view.currentTrick ? '当前为自由出牌，必须出牌' : '不出本轮'}
                >
                  不出
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    className="landlord-btn landlord-btn--reset"
                    disabled={busy}
                    onClick={() => setSelectedIds([])}
                  >
                    重选
                  </button>
                )}
                <button
                  type="button"
                  className="landlord-btn landlord-btn--primary"
                  disabled={busy || selectedIds.length === 0}
                  onClick={handlePlaySelected}
                  title={selectedIds.length === 0 ? '请先在下方手牌中点击选择要打出的牌' : undefined}
                >
                  {busy ? '提交中…' : selectedIds.length > 0 ? `出牌 (${selectedIds.length}张)` : '请先选牌'}
                </button>
              </div>
            ) : (
              <div className="landlord-wait-tag">
                等待 {nameFor(members, view.currentPlayerId)} 出牌{formatCountdownSuffix(remainSeconds)}
              </div>
            )
          )}

          {view.phase === 'game_over' && (
            <div className="landlord-game-over-tag">
              {view.winnerTeam === 'landlord' ? '地主阵营' : '农民阵营'} 获胜！
            </div>
          )}
        </div>
      </div>

      {/* 手牌横向展开牌架（支持点击切换 / 按住横向拖动区间多选） */}
      {me && (
        <div className="landlord-hand-container card-fan-container" ref={handContainerRef}>
          <div
            className="landlord-hand-rack"
            role="region"
            aria-label="我的手牌"
            style={{ touchAction: 'pan-y', ['--landlord-card-overlap' as string]: `${cardOverlap}px` }}
            onPointerDown={handleHandPointerDown}
            onPointerMove={handleHandPointerMove}
            onPointerUp={handleHandPointerUp}
            onPointerCancel={handleHandPointerUp}
          >
            {sortedHand.map((card: AnyView, idx: number) => {
              const isSelected = selectedIds.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  data-index={idx}
                  className={`landlord-hand-card card-fan-item ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    zIndex: isSelected ? 100 + idx : idx + 1,
                  }}
                  aria-disabled={busy || view.phase !== 'playing'}
                  aria-pressed={isSelected}
                  title={`${card.rank} ${card.suit ?? ''}`}
                >
                  <PlayingCard rank={card.rank} suit={card.suit} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const seats = useMemo(() => {
    const allPlayers: AnyView[] = view.players || [];
    return allPlayers.map((p: AnyView) => ({
      id: p.playerId,
      name: nameFor(members, p.playerId),
      isCurrentTurn: (view.phase === 'bidding' && view.currentBidderId === p.playerId) || (view.phase === 'playing' && view.currentPlayerId === p.playerId),
      // 手牌数：外壳席位条的手牌徽章，斗地主三人局看对手剩牌是关键信息
      handCount: typeof p.handCount === 'number' ? p.handCount : undefined,
      badge: p.playerId === view.landlordId ? '地主' : view.landlordId ? '农民' : undefined,
    }));
  }, [view.players, view.phase, view.currentBidderId, view.currentPlayerId, view.landlordId, members]);

  return (
    <>
      <TabletopOvalShell
        title="斗地主"
        subtitle={landlordSubtitle(view, members)}
        gameId="landlord"
        theme="poker"
        recommendLandscape
        players={seats}
        currentUserId={me?.playerId}
        centerArena={centerArena}
        bottomBar={bottomBar}
        phaseKey={`${view.phase}:${view.currentBidderId ?? view.currentPlayerId ?? view.winnerTeam ?? 'idle'}`}
      />
      <TabletopEventOverlay
        open={landlordReveal !== null}
        variant={landlordReveal?.isMe ? 'reveal' : 'stamp'}
        label={landlordReveal?.isMe ? '你成为地主！' : `地主是 ${landlordReveal?.name ?? ''}`}
        sublabel={landlordReveal?.isMe ? '底牌已归你所有，先手出牌' : '底牌已公开，地主先手出牌'}
        durationMs={1900}
        onComplete={() => setLandlordReveal(null)}
      />
    </>
  );
}

