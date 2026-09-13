/**
 * bell_clash_v1 客户端主页面（Ding · 对齐 UNO 沉浸式椭圆桌与扇形手牌引擎重构版）。
 * 深度集成 TabletopOvalShell、CardFanEngine 扇形手牌引擎、3D 金属抢铃台、弃牌堆四色光晕与 WebAudio。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopOvalShell, type PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../../shared-ui/CardFanEngine.tsx';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopEventOverlay } from '../../shared-ui/TabletopEventOverlay.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import type { BellClashCard, BellClashPlayerView, CardColor } from './types.ts';

const COLOR_LABELS: Record<CardColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

function colorLabel(color: CardColor | null | undefined): string {
  if (!color) return '无';
  return COLOR_LABELS[color] ?? color;
}

/** 卡牌展示文案 */
function cardLabel(card: BellClashCard): string {
  return card.kind === 'number'
    ? `${COLOR_LABELS[card.color]} ${card.number}`
    : `${COLOR_LABELS[card.color]}·「${card.phrase}」`;
}

/** 矢量级纯正 UNO 椭圆口令卡组件（纯白斜置椭圆 + 醒目角标 + 超高对比度文字） */
function DingPhraseCard({
  card,
  isTop = false,
}: {
  card: BellClashCard;
  isTop?: boolean;
}) {
  const isPhrase = card.kind === 'phrase';
  return (
    <div className={`ding-phrase-card-shell ding-phrase-card-shell--${card.color} ${isTop ? 'ding-phrase-card-shell--top' : ''}`}>
      {/* 四角角标：纯正 UNO 风格口令角标 */}
      <div className="ding-phrase-card-corner ding-phrase-card-corner--tl">
        <span className="ding-phrase-corner-text">口令</span>
      </div>
      <div className="ding-phrase-card-corner ding-phrase-card-corner--br">
        <span className="ding-phrase-corner-text">口令</span>
      </div>

      {/* 经典 UNO 倾斜纯白椭圆底版 */}
      <div className="ding-phrase-card-oval" />

      {/* 中心文字短语：超高对比度深墨色黑字 */}
      <div className="ding-phrase-card-core">
        <span className="ding-phrase-card-phrase">
          {isPhrase ? card.phrase : card.number}
        </span>
      </div>
    </div>
  );
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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<BellClashCard | null>(null);

  const isMyTurn = view.currentPlayerId === myId && view.phase !== 'game_over';
  const top = view.discardTop;
  const topColor = top?.color ?? 'blue';

  // 轮到自己出牌时触觉与听觉提醒
  const prevTurnRef = useRef(false);
  useEffect(() => {
    if (!prevTurnRef.current && isMyTurn) {
      webAudio.playTurnAlert();
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([30, 40, 30]);
        }
      } catch {
        // Ignored in environments without vibration support
      }
    }
    prevTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // 抢铃窗口开启时警报与震颤
  const prevBellOpenRef = useRef(false);
  useEffect(() => {
    if (!prevBellOpenRef.current && view.bellOpen && view.phase !== 'game_over') {
      webAudio.playBuzzer();
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([40, 50, 40]);
        }
      } catch {
        // Ignored in environments without vibration support
      }
    }
    prevBellOpenRef.current = view.bellOpen;
  }, [view.bellOpen, view.phase]);

  // 抢铃结果确定（有人抢到出牌权）：全屏反馈盖一次印，避免拍铃瞬间遮挡案台。
  const [bellClaim, setBellClaim] = useState<{ name: string; isMe: boolean } | null>(null);
  const prevBellClaimantRef = useRef<string | null>(null);
  useEffect(() => {
    const current = typeof view.bellClaimantId === 'string' ? view.bellClaimantId : null;
    const previous = prevBellClaimantRef.current;
    prevBellClaimantRef.current = current;
    if (current !== null && current !== previous) {
      setBellClaim({ name: nameFor(members, current), isMe: current === myId });
    }
  }, [view.bellClaimantId, members, myId]);

  // 游戏获胜音效
  const prevPhaseRef = useRef(view.phase);
  useEffect(() => {
    if (prevPhaseRef.current !== 'game_over' && view.phase === 'game_over') {
      webAudio.playVictory();
    }
    prevPhaseRef.current = view.phase;
  }, [view.phase]);

  // 判断手牌是否可合法打出
  const canPlayCard = (card: BellClashCard): boolean => {
    if (!top) return true;
    if (card.color === top.color) return true;
    if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
    return false;
  };

  // 出牌操作
  const handlePlayCardAtIndex = (cardIndex: number) => {
    if (!myId || busy || !isMyTurn) return;
    webAudio.playCardPlay();
    void act({ type: 'play_card', playerId: myId, cardIndex });
    setSelectedCardId(null);
  };

  // 摸牌操作
  const handleDrawCard = () => {
    if (!myId || busy || !isMyTurn) return;
    webAudio.playDealCards();
    void act({ type: 'draw_card', playerId: myId });
    setSelectedCardId(null);
  };

  // 拍铃操作
  const handleRingBell = () => {
    if (!myId || busy) return;
    webAudio.playBuzzer();
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([50, 60, 50]);
      }
    } catch {
      // Ignored in environments without vibration support
    }
    void act({ type: 'ring_bell', playerId: myId });
  };

  // 映射玩家席位列表（接入 TabletopOvalShell）
  const seats: PlayerSeat[] = view.players.map((playerId) => {
    const member = members.find((m) => m.playerId === playerId);
    const isCurrent = playerId === view.currentPlayerId && view.phase !== 'game_over';
    const isClaimant = view.bellClaimantId === playerId;
    const isWinner = view.phase === 'game_over' && (view.winners ?? []).includes(playerId);

    let badge: string | undefined;
    if (isWinner) badge = '获胜';
    else if (isClaimant) badge = '抢到铃！';

    return {
      id: playerId,
      name: nameFor(members, playerId),
      avatar: member?.avatar,
      isCurrentTurn: isCurrent,
      handCount: view.handCounts?.[playerId] ?? 0,
      badge,
    };
  });

  // 选中的手牌
  const selectedIndex = selectedCardId !== null ? parseInt(selectedCardId.replace('card-', ''), 10) : null;
  const selectedCard = selectedIndex !== null && me?.hand ? me.hand[selectedIndex] : null;
  const canPlaySelected = selectedCard ? canPlayCard(selectedCard) : false;

  // 当前正在查看的卡牌（选中的牌或鼠标悬停的牌）
  const inspectedCard = selectedCard ?? hoveredCard;

  // 手牌同步清理选中状态
  const handLen = me?.hand?.length ?? 0;
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= handLen) {
      setSelectedCardId(null);
    }
  }, [handLen, selectedIndex]);

  // 映射扇形手牌项
  const fanCards: CardItem[] = (me?.hand ?? []).map((card, index) => {
    const isPlayable = isMyTurn && canPlayCard(card);
    const isPhrase = card.kind === 'phrase';
    const canRingWithPhrase = view.bellOpen && isPhrase && top?.color === card.color;
    const isReady = isPlayable || canRingWithPhrase;

    return {
      id: `card-${index}`,
      label: cardLabel(card),
      sublabel: colorLabel(card.color),
      colorTheme: card.color,
      imageUrl: card.kind === 'number' ? `/assets/uno/${card.color}_${card.number}.png` : undefined,
      customContent: card.kind === 'phrase' ? <DingPhraseCard card={card} /> : undefined,
      disabled: !isReady,
      raw: card,
    };
  });

  // 顶牌文案描述（清晰简洁，避免多重括号）
  const targetLabel = top
    ? top.kind === 'phrase'
      ? `${colorLabel(top.color)}色短语【${top.phrase}】`
      : `${colorLabel(top.color)}色数字 ${top.number}`
    : '起始牌';

  // 阶段横幅文案（纯净清晰，无嵌套引号）
  let phaseBannerText = '';
  let phaseBannerSubtext = '';
  if (view.phase === 'game_over') {
    phaseBannerText = '手牌全部清空 · 对局结案！';
    phaseBannerSubtext = `获胜玩家：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`;
  } else if (view.bellOpen) {
    phaseBannerText = '抢铃窗口开启';
    phaseBannerSubtext = `口令目标：${targetLabel} —— 出现对应言行时，持有同色短语卡者立即拍铃！`;
  } else if (isMyTurn) {
    phaseBannerText = '轮到你出牌';
    phaseBannerSubtext = `当前顶牌为 ${targetLabel}。打出同色牌、同数字牌，或摸一张牌`;
  } else {
    phaseBannerText = `等待 ${nameFor(members, view.currentPlayerId)} 出牌`;
    phaseBannerSubtext = `当前顶牌为 ${targetLabel}。观察全场玩家言行随时准备抢铃！`;
  }

  // 中央案台区域
  const centerArena = (
    <div className="bell-tabletop-arena">
      {/* 方向与流光指引环 */}
      <div className="uno-direction-compass is-cw" aria-hidden="true" />

      {view.phase !== 'game_over' ? (
        <>
          {/* 牌桌中央三元核心案台（摸牌堆 + 弃牌堆 + 抢铃台） */}
          <div className="bell-center-core">
            {/* 1. 摸牌堆 */}
            <button
              type="button"
              className={`bell-draw-pile ${isMyTurn && !busy ? 'is-playable' : ''}`}
              onClick={handleDrawCard}
              disabled={!isMyTurn || busy}
              title={isMyTurn ? '点击摸一张牌' : '摸牌堆'}
            >
              <img src="/assets/uno/back.png" alt="摸牌堆" className="bell-draw-pile-img" />
              <span className="bell-pile-badge" aria-label={`剩余 ${view.drawCount} 张`}>
                {view.drawCount} 张
              </span>
            </button>

            {/* 2. 弃牌堆顶牌（纯正 UNO 风格，无任何杂质遮罩） */}
            <div className="bell-discard-wrap">
              <div className={`uno-discard-halo uno-discard-halo--${topColor}`} />
              {top ? (
                <div className="ding-uno-card ding-uno-card--top" style={{ position: 'relative', zIndex: 1 }}>
                  {top.kind === 'phrase' ? (
                    <DingPhraseCard card={top} isTop />
                  ) : (
                    <img
                      src={`/assets/uno/${top.color}_${top.number}.png`}
                      alt={cardLabel(top)}
                      className="ding-uno-card__img"
                    />
                  )}
                </div>
              ) : (
                <div className="bell-discard-empty">等待出牌</div>
              )}
              <span className="bell-discard-color-badge" style={{ zIndex: 2 }}>
                当前色 · {colorLabel(top?.color)}
              </span>
            </div>

            {/* 3. 3D 金属抢铃台 */}
            <button
              type="button"
              className={`bell-desk-bell ${view.bellOpen ? 'is-active' : ''}`}
              onClick={handleRingBell}
              disabled={busy || !myId}
              title={view.bellOpen ? '有人触发口令！立即拍铃！' : '按铃抢夺出牌权'}
            >
              {view.bellOpen && <div className="bell-sonic-shockwave" aria-hidden="true" />}
              <div className="bell-desk-bell-plunger" />
              <div className="bell-desk-bell-dome" />
              <div className="bell-desk-bell-base" />
              <span className="bell-desk-bell-label">
                {view.bellOpen ? '立即拍铃!' : (view.bellClaimantId ? `${nameFor(members, view.bellClaimantId)} 拍铃` : '抢铃台')}
              </span>
            </button>
          </div>

          {/* 案台状态元信息 */}
          <div className="bell-center-meta">
            <span>轮到：<strong>{nameFor(members, view.currentPlayerId)}</strong></span>
            {view.bellOpen && (
              <span style={{ color: '#f59e0b', fontWeight: 900 }}>
                抢铃窗口开启中
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="winner-hero" style={{ zIndex: 10, textAlign: 'center' }}>
          <span className="winner-rays" aria-hidden="true" />
          <h2 className="winner-title">手牌全部打空，游戏获胜！</h2>
          <p className="winner-names">
            获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
          </p>
        </div>
      )}

      {error && <p className="game-error" role="alert">{error}</p>}
    </div>
  );

  // 底部手牌与快捷操作栏
  const bottomBar = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {/* 卡牌清晰检视器（解决手牌旋转字小不好确认问题） */}
      {inspectedCard && view.phase !== 'game_over' && (
        <div className="bell-card-inspector" role="status" aria-live="polite">
          <span className={`bell-inspector-color-dot color-${inspectedCard.color}`} />
          <strong className="bell-inspector-title">
            {inspectedCard.kind === 'phrase'
              ? `【${colorLabel(inspectedCard.color)}色口令卡】`
              : `【${colorLabel(inspectedCard.color)}色数字牌 ${inspectedCard.number}】`}
          </strong>
          <span className="bell-inspector-phrase">
            {inspectedCard.kind === 'phrase' ? `「${inspectedCard.phrase}」` : `数字 ${inspectedCard.number}`}
          </span>
          {canPlayCard(inspectedCard) ? (
            <span className="bell-inspector-playable-tag">符合出牌规则</span>
          ) : (
            <span className="bell-inspector-unplayable-tag">
              需同为【{colorLabel(top?.color)}色】{top?.kind === 'number' ? `或同数字【${top.number}】` : ''}
            </span>
          )}
        </div>
      )}

      {/* 快捷浮条操作 */}
      {!isSpectator && me && view.phase !== 'game_over' && (
        <div className="uno-floating-controls">
          {view.bellOpen && (
            <button
              type="button"
              className="uno-floating-btn bell-floating-bell-btn"
              disabled={busy}
              onClick={handleRingBell}
            >
              <GameIcon name="uno_challenge" size={16} />
              拍铃抢回合！
            </button>
          )}

          {isMyTurn && selectedCard && (
            <button
              type="button"
              className={`uno-floating-btn ${canPlaySelected ? 'btn-primary' : 'btn-outline'}`}
              disabled={busy || !canPlaySelected}
              onClick={() => {
                if (selectedIndex !== null) handlePlayCardAtIndex(selectedIndex);
              }}
            >
              <GameIcon name="rocket" size={16} />
              {canPlaySelected
                ? (selectedCard.kind === 'phrase' ? `打出「${selectedCard.phrase}」` : `打出 ${cardLabel(selectedCard)}`)
                : `需与顶牌同为【${colorLabel(top?.color)}色】`}
            </button>
          )}

          {isMyTurn && (
            <button
              type="button"
              className={`uno-floating-btn ${selectedCard && canPlaySelected ? 'btn-outline' : 'btn-primary'}`}
              disabled={busy}
              onClick={handleDrawCard}
            >
              <GameIcon name="cards_deck" size={16} />
              摸一张牌 ({view.drawCount})
            </button>
          )}

          {!isMyTurn && !view.bellOpen && (
            <div className="uno-floating-status-chip">
              <GameIcon name="hourglass" size={14} />
              <span>等待 <strong>{nameFor(members, view.currentPlayerId)}</strong> 出牌中…</span>
            </div>
          )}
        </div>
      )}

      {/* 扇形手牌引擎 */}
      {me && view.phase !== 'game_over' && (
        <CardFanEngine
          cards={fanCards}
          selectedCardIds={selectedCardId ? [selectedCardId] : []}
          onSelectCards={(ids) => setSelectedCardId(ids.length > 0 ? ids[0]! : null)}
          onHoverCard={(card) => setHoveredCard((card?.raw as BellClashCard) ?? null)}
          onPlayCard={(card) => {
            if (card.disabled || busy || !isMyTurn) return;
            const idx = parseInt(card.id.replace('card-', ''), 10);
            if (!isNaN(idx)) {
              handlePlayCardAtIndex(idx);
            }
          }}
          disabled={busy}
          playButtonText="出牌"
          hidePlayButton
        />
      )}
    </div>
  );

  return (
    <>
      <TabletopOvalShell
        title="Ding"
        subtitle="反应出牌与拍铃抢回合"
        gameId="bell-clash"
        phaseKey={`${view.phase}:${view.currentPlayerId}:${view.bellOpen ? 'open' : 'closed'}:${view.bellClaimantId ?? 'none'}`}
        theme="sunset"
        stageFit="safe"
        players={seats}
        currentUserId={myId ?? undefined}
        centerArena={centerArena}
        bottomBar={bottomBar}
        phaseBannerText={phaseBannerText}
        phaseBannerSubtext={phaseBannerSubtext}
        onShowRules={() => setRulesOpen(true)}
        topRightControls={(
          <button
            ref={rulesRef}
            type="button"
            className="tabletop-sound-btn"
            onClick={() => setRulesOpen(true)}
            title="查看游戏规则"
          >
            <span className="tabletop-sound-btn__label">规则</span>
          </button>
        )}
      />
      <TabletopEventOverlay
        open={bellClaim !== null}
        variant={bellClaim?.isMe ? 'reveal' : 'burst'}
        label={bellClaim?.isMe ? '你抢到出牌权！' : `${bellClaim?.name ?? ''} 拍铃抢到出牌权`}
        sublabel={bellClaim?.isMe ? '立即打出口令短语卡' : '本回合由他接管出牌'}
        durationMs={1600}
        onComplete={() => setBellClaim(null)}
      />
      {rulesOpen && (
        <GameDrawer kind="rules" title="Ding · 游戏规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>核心机制（UNO 式出牌 + 抢铃）</h4>
          <p>1. <strong>UNO 出牌</strong>：打出与弃牌堆顶<strong>同颜色</strong>或<strong>同数字</strong>的牌；打不出则摸一张牌。</p>
          <p>2. <strong>行动短语卡</strong>：牌面印有一句生活短语（如「好耶！」、「等等」）。当场上有玩家在现实对话或行动中触发该内容时，持有同色短语卡的玩家可<strong>立刻拍铃抢夺回合</strong>并打出该牌！</p>
          <p>3. <strong>拍铃抢答</strong>：拍铃成功者接管出牌权；错误拍铃罚摸一张。</p>
          <p>4. <strong>获胜条件</strong>：最先打光手中所有手牌者获胜！</p>
        </GameDrawer>
      )}
    </>
  );
}

