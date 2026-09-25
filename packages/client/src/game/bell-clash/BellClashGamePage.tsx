/**
 * bell_clash_v1 客户端主页面（Ding）。
 *
 * 视觉：3D 透视毡面牌桌。中央三元核心（摸牌堆 / 弃牌堆 / 案台铃），
 * 出牌与摸牌走共享飞行层，抢铃窗口有可见倒计时环。
 * 详见 docs/plans/2026-09-22-game-ui-uplift/contracts/bell-clash.md
 */
import { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { TabletopOvalShell, type PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../../shared-ui/CardFanEngine.tsx';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopEventOverlay } from '../../shared-ui/TabletopEventOverlay.tsx';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { DeskBell } from './stage/DeskBell.tsx';
import { PhraseCard, cardLabel, colorLabel } from './stage/PhraseCard.tsx';
import { BellArt, ClaimBoard, DiscardTrail } from './stage/TableProps.tsx';
import { useBellClashStage } from './stage/useBellClashStage.tsx';
import type { BellClashCard, BellClashPlayerView } from './types.ts';

/** 一张牌的通用渲染：数字牌用 UNO 图片，口令牌用同框的 PhraseCard */
function renderCardFace(card: BellClashCard, className: string) {
  return card.kind === 'phrase' ? (
    <PhraseCard card={card} />
  ) : (
    <img src={`/assets/uno/${card.color}_${card.number}.png`} alt={cardLabel(card)} className={className} />
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

  // 音效、震动、飞行、铃按压全部由演出层按服务端差分驱动，
  // 页面不再自己用 prevRef 边沿触发——那样会和服务端的权威状态脱节。
  const stage = useBellClashStage(view, (id) => nameFor(members, id));

  // 判断手牌是否可合法打出
  const canPlayCard = (card: BellClashCard): boolean => {
    if (!top) return true;
    if (card.color === top.color) return true;
    if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
    return false;
  };

  const handlePlayCardAtIndex = (cardIndex: number) => {
    if (!myId || busy || !isMyTurn) return;
    void act({ type: 'play_card', playerId: myId, cardIndex });
    setSelectedCardId(null);
  };

  const handleDrawCard = () => {
    if (!myId || busy || !isMyTurn) return;
    void act({ type: 'draw_card', playerId: myId });
    setSelectedCardId(null);
  };

  const handleRingBell = () => {
    if (!myId || busy) return;
    void act({ type: 'ring_bell', playerId: myId });
  };

  // 映射玩家席位列表
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

  const selectedIndex = selectedCardId !== null ? parseInt(selectedCardId.replace('card-', ''), 10) : null;
  const selectedCard = selectedIndex !== null && me?.hand ? me.hand[selectedIndex] : null;
  const canPlaySelected = selectedCard ? canPlayCard(selectedCard) : false;
  const inspectedCard = selectedCard ?? hoveredCard;

  // 手牌同步清理选中状态
  const handLen = me?.hand?.length ?? 0;
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= handLen) {
      setSelectedCardId(null);
    }
  }, [handLen, selectedIndex]);

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
      customContent: card.kind === 'phrase' ? <PhraseCard card={card} /> : undefined,
      disabled: !isReady,
      raw: card,
    };
  });

  const targetLabel = top
    ? top.kind === 'phrase'
      ? `${colorLabel(top.color)}色短语【${top.phrase}】`
      : `${colorLabel(top.color)}色数字 ${top.number}`
    : '起始牌';

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

  // 中央案台：3D 透视毡面。三区——左弃牌历史带 / 中央铃 + 牌堆 / 右记分板。
  // 之前整张毡面只有一个 200px 的三件岛，左右三分之一是空的。
  const trailEntries = stage.discardTrail.map((entry) => ({
    ...entry,
    playerName: nameFor(members, entry.playerId),
  }));
  const boardRows = view.players.map((playerId) => ({
    playerId,
    name: nameFor(members, playerId),
    claims: stage.claimCounts[playerId] ?? 0,
    handCount: view.handCounts?.[playerId] ?? 0,
    isCurrent: playerId === view.currentPlayerId && view.phase !== 'game_over',
    isClaimant: view.bellClaimantId === playerId,
    isMe: playerId === myId,
  }));

  const centerArena = (
    <div className="bc-arena stage-felt-3d" ref={stage.stageRef}>
      {/* 装饰层：铃身剪影压在毡面正中，12% 透明度，这是填空白的那一层 */}
      <div className="stage-art bc-art">
        <BellArt />
      </div>

      {/* 倒计时环：抢铃窗口最需要它——玩家现在完全不知道还剩多久。
          deadlineKind 换 phaseKey：两类计时时长差很多，混用会让满格测量错乱。 */}
      <StageCountdownRing
        deadlineAt={view.deadlineAt}
        phaseKey={`${view.deadlineKind ?? 'none'}:${view.currentPlayerId}:${view.bellOpen ? 'open' : 'closed'}`}
        active={view.phase !== 'game_over' && (view.bellOpen || isMyTurn)}
        className="bc-countdown"
      />

      <div className="bc-arena__plane stage-felt-3d__plane">
        {view.phase !== 'game_over' ? (
          <div className="bc-table">
            {/* 左：弃牌历史带 */}
            <DiscardTrail
              entries={trailEntries}
              renderCard={(card) => renderCardFace(card, 'bc-trail__img')}
            />

            {/* 中：木托盘上的铃，两侧牌堆 */}
            <div className="bc-core">
              {/* 1. 摸牌堆 */}
              <button
                type="button"
                className="bc-draw"
                data-stage-anchor="draw"
                data-playable={isMyTurn && !busy ? 'true' : undefined}
                onClick={handleDrawCard}
                disabled={!isMyTurn || busy}
                title={isMyTurn ? '点击摸一张牌' : '摸牌堆'}
              >
                <img src="/assets/uno/back.png" alt="摸牌堆" className="bc-draw__img" />
                <span className="bc-draw__badge stage-numeral" aria-label={`剩余 ${view.drawCount} 张`}>
                  {view.drawCount}
                </span>
              </button>

              {/* 2. 木托盘 + 案台铃 */}
              <div className="bc-plate" data-open={view.bellOpen ? 'true' : undefined}>
                <span className="bc-plate__rim" aria-hidden="true" />
                <DeskBell
                  open={view.bellOpen}
                  pressing={stage.bellPressing}
                  disabled={busy || !myId}
                  onRing={handleRingBell}
                  label={
                    view.bellOpen
                      ? '立即拍铃!'
                      : view.bellClaimantId
                        ? `${nameFor(members, view.bellClaimantId)} 拍铃`
                        : '抢铃台'
                  }
                />
              </div>

              {/* 3. 弃牌堆顶牌 + 四色光晕 */}
              <div className="bc-discard" data-stage-anchor="discard">
                <span className="bc-halo" data-color={topColor} aria-hidden="true" />
                {top ? (
                  <div className="bc-discard__card">
                    {top.kind === 'phrase' ? (
                      <PhraseCard card={top} isTop />
                    ) : (
                      <img
                        src={`/assets/uno/${top.color}_${top.number}.png`}
                        alt={cardLabel(top)}
                        className="bc-discard__img"
                      />
                    )}
                  </div>
                ) : (
                  <div className="bc-discard__empty">等待出牌</div>
                )}
                <span className="bc-discard__badge">当前色 · {colorLabel(top?.color)}</span>
              </div>
            </div>

            {/* 右：抢铃记分板 */}
            <ClaimBoard rows={boardRows} />
          </div>
        ) : (
          <div className="winner-hero bc-winner">
            <span className="winner-rays" aria-hidden="true" />
            <h2 className="winner-title stage-title">手牌全部打空，游戏获胜！</h2>
            <p className="winner-names">
              获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
            </p>
          </div>
        )}
      </div>

      {view.phase !== 'game_over' && (
        <div className="bc-meta">
          <span>轮到：<strong>{nameFor(members, view.currentPlayerId)}</strong></span>
          {view.bellOpen && <span className="bc-meta__alert">抢铃窗口开启中</span>}
        </div>
      )}

      {error && <p className="game-error" role="alert">{error}</p>}
    </div>
  );

  // 底部：检视器 + 浮条 + 扇形手牌
  const bottomBar = (
    <div className="bc-bottom">
      {/* 检视器：扇形手牌旋转后字太小，这里给一份看得清的 */}
      {inspectedCard && view.phase !== 'game_over' && (
        <div className="bc-inspector" role="status" aria-live="polite">
          <span className="bc-inspector__dot" data-color={inspectedCard.color} aria-hidden="true" />
          <strong className="bc-inspector__title">
            {inspectedCard.kind === 'phrase'
              ? `【${colorLabel(inspectedCard.color)}色口令卡】`
              : `【${colorLabel(inspectedCard.color)}色数字牌 ${inspectedCard.number}】`}
          </strong>
          <span className="bc-inspector__phrase">
            {inspectedCard.kind === 'phrase' ? `「${inspectedCard.phrase}」` : `数字 ${inspectedCard.number}`}
          </span>
          {canPlayCard(inspectedCard) ? (
            <span className="bc-inspector__tag" data-ok="true">符合出牌规则</span>
          ) : (
            <span className="bc-inspector__tag">
              需同为【{colorLabel(top?.color)}色】{top?.kind === 'number' ? `或同数字【${top.number}】` : ''}
            </span>
          )}
        </div>
      )}

      {/* 我错拍被罚摸 */}
      {stage.penalty && (
        <p className="bc-penalty" role="status">错拍，罚摸一张</p>
      )}

      {/* 快捷浮条。黄色主 CTA 同一时刻只有一个：
          bellOpen 时出牌被服务端禁止，!bellOpen 时拍铃被拒，状态本身互斥。 */}
      {!isSpectator && me && view.phase !== 'game_over' && (
        <div className="bc-controls">
          {view.bellOpen && (
            <button
              type="button"
              className="bc-btn bc-btn--primary bc-bell-btn"
              disabled={busy}
              onClick={handleRingBell}
            >
              <GameIcon name="uno_challenge" size={16} />
              拍铃抢回合！
            </button>
          )}

          {!view.bellOpen && isMyTurn && selectedCard && (
            <button
              type="button"
              className="bc-btn"
              data-variant={canPlaySelected ? 'primary' : 'outline'}
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

          {!view.bellOpen && isMyTurn && (
            <button
              type="button"
              className="bc-btn"
              data-variant={selectedCard && canPlaySelected ? 'outline' : 'primary'}
              disabled={busy}
              onClick={handleDrawCard}
            >
              <GameIcon name="cards_deck" size={16} />
              摸一张牌 ({view.drawCount})
            </button>
          )}

          {!isMyTurn && !view.bellOpen && (
            <div className="bc-status-chip">
              <GameIcon name="hourglass" size={14} />
              <span>等待 <strong>{nameFor(members, view.currentPlayerId)}</strong> 出牌中…</span>
            </div>
          )}
        </div>
      )}

      {/* 扇形手牌引擎。锚点供飞行层测量我这一侧的起终点。 */}
      {me && view.phase !== 'game_over' && (
        <div className="bc-fan" data-stage-anchor="hand">
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
        </div>
      )}
    </div>
  );

  return (
    <div className="bc-game" data-bell-open={view.bellOpen ? 'true' : undefined} data-my-turn={isMyTurn ? 'true' : undefined}>
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
            <BookOpen className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
            <span className="tabletop-sound-btn__label">规则</span>
          </button>
        )}
      />

      {/* 飞行层必须挂在牌桌外壳之外：毡面是 perspective 容器，
          一旦有 transform 祖先，position:fixed 会退化为相对定位。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />

      <TabletopEventOverlay
        open={stage.claimBanner !== null}
        variant={stage.claimBanner?.isMe ? 'reveal' : 'burst'}
        label={stage.claimBanner?.isMe ? '你抢到出牌权！' : `${stage.claimBanner?.name ?? ''} 拍铃抢到出牌权`}
        sublabel={stage.claimBanner?.isMe ? '立即打出口令短语卡' : '本回合由他接管出牌'}
        durationMs={1600}
        onComplete={stage.dismissClaim}
      />
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={myId && (view.winners ?? []).includes(myId) ? '手牌清空，你赢了！' : '对局结案'}
        sublabel={`获胜玩家：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`}
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
    </div>
  );
}
