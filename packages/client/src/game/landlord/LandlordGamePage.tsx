/**
 * 斗地主（landlord_platform_v1）页面 —— 老茶馆正堂。
 *
 * 视觉契约：contracts/landlord.md
 * 隐喻：坐在老茶馆正堂的八仙桌前打牌（第一人称视角，透视八仙桌，墙面花窗梁托）。
 * 演出层：stage/useLandlordStage.tsx（叫分、出牌飞行、炸弹全屏冲屏、底牌翻开、终局捷报）。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 服务端原始视图透传适配 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { useCountdown } from '../../shared-ui/useCountdown.ts';
import { resolveMemberAvatar } from '../../user/avatar.ts';
import { RollingNumber } from '../../shared-ui/RollingNumber.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { useLandlordStage } from './stage/useLandlordStage.tsx';
import {
  TeahouseScene,
  PokerCard,
  OpponentFigure,
  LandlordPlate,
  RotateHint,
  BidChips,
  VictoryScroll,
  IngotDrop,
  computeTeahouseHandOverlap,
  type LandlordRole,
} from './teahouse/index.ts';
import type { LandlordCard, LandlordPlatformPlayerView } from './types.ts';
import './landlord.css';

type AnyView = Record<string, any>;

const RANK_ORDER: Record<string, number> = {
  BJ: 17,
  大王: 17,
  SJ: 16,
  小王: 16,
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
  '♠': 4,
  hearts: 3,
  '♥': 3,
  clubs: 2,
  '♣': 2,
  diamonds: 1,
  '♦': 1,
};

function comboName(type: string): string {
  switch (type) {
    case 'single': return '单张';
    case 'pair': return '对子';
    case 'triple': return '三张';
    case 'triple_single': return '三带一';
    case 'triple_pair': return '三带对';
    case 'straight': return '顺子';
    case 'pair_sequence': return '连对';
    case 'bomb': return '炸弹';
    case 'rocket': return '王炸';
    default: return type || '出牌';
  }
}

export function LandlordGamePage({ view }: { view: AnyView }) {
  const { state, send } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();

  const me = view.me;
  const myId = me?.playerId ?? null;
  const myTurn = Boolean(me) && view.currentPlayerId === myId;
  const myBid = Boolean(me) && view.currentBidderId === myId;
  const isMyTurn = (view.phase === 'bidding' && myBid) || (view.phase === 'playing' && myTurn);

  // 舞台动效编排（音效、飞行、炸弹）
  const stage = useLandlordStage(view as unknown as LandlordPlatformPlayerView);

  // 倒计时
  const hasDeadline = typeof view.deadlineAt === 'number' && Number.isFinite(view.deadlineAt);
  const countdown = useCountdown(hasDeadline ? view.deadlineAt : null);
  const remainSeconds = hasDeadline && Number.isFinite(countdown.secondsLeft)
    ? Math.max(0, countdown.secondsLeft)
    : null;

  // 手牌选中状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const handContainerRef = useRef<HTMLDivElement | null>(null);
  const [cardOverlap, setCardOverlap] = useState(-38);

  // 整理手牌：大牌在左（大王 > 小王 > 2 > A > ... > 3）
  const sortedHand: LandlordCard[] = useMemo(() => {
    if (!me?.hand) return [];
    return [...me.hand].sort((a: AnyView, b: AnyView) => {
      const diff = (RANK_ORDER[b.rank] ?? 0) - (RANK_ORDER[a.rank] ?? 0);
      if (diff !== 0) return diff;
      return (SUIT_ORDER[b.suit] ?? 0) - (SUIT_ORDER[a.suit] ?? 0);
    });
  }, [me?.hand]);

  // 左右对手映射（顺时针：右家为下家，左家为上家）
  const { leftPlayer, rightPlayer } = useMemo(() => {
    const allPlayers: AnyView[] = view.players || [];
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
  }, [view.players, myId]);

  // 叫分最高分
  const maxBidScore = useMemo(() => {
    const bids: Array<{ score: number }> = view.bids || [];
    if (!bids.length) return 0;
    return Math.max(...bids.map((b) => b.score));
  }, [view.bids]);

  // 角色判定
  const getRole = useCallback((playerId: string | null): LandlordRole => {
    if (!view.landlordId) return 'unknown';
    return view.landlordId === playerId ? 'lord' : 'farmer';
  }, [view.landlordId]);

  const myRole = getRole(myId);

  // 动态重叠度计算（严格使用 computeTeahouseHandOverlap）
  useEffect(() => {
    const updateOverlap = () => {
      const isLandscape = typeof window !== 'undefined'
        && window.innerWidth > window.innerHeight
        && window.innerHeight <= 520;
      const cardWidth = isLandscape ? 50 : 78;
      const availableWidth = isLandscape ? (view.phase === 'bidding' ? 340 : 400) : 900;
      const baseOverlap = isLandscape ? -24 : -38;
      const overlap = computeTeahouseHandOverlap({
        count: sortedHand.length,
        cardWidth,
        availableWidth,
        baseOverlap,
      });
      setCardOverlap(overlap);
    };

    updateOverlap();
    window.addEventListener('resize', updateOverlap);
    return () => window.removeEventListener('resize', updateOverlap);
  }, [sortedHand.length, view.phase]);

  // 选牌切换
  const handleToggleCard = (cardId: string) => {
    if (busy || view.phase !== 'playing' || !myTurn) return;
    webAudio.playCardFlip();
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    );
  };

  // 出牌
  const handlePlaySelected = () => {
    if (busy || selectedIds.length === 0) return;
    webAudio.playCardPlay();
    void act({ type: 'play_combo', cardIds: selectedIds });
    setSelectedIds([]);
  };

  // 春天判定：地主胜且两个农民在 revealedHands 均为 17 张
  const isSpring = useMemo(() => {
    if (view.phase !== 'game_over' || view.winnerTeam !== 'landlord') return false;
    if (!view.revealedHands) return false;
    const farmers = (view.players || []).filter((p: AnyView) => p.playerId !== view.landlordId);
    if (farmers.length !== 2) return false;
    return farmers.every((f: AnyView) => (view.revealedHands?.[f.playerId]?.length ?? 0) === 17);
  }, [view.phase, view.winnerTeam, view.revealedHands, view.players, view.landlordId]);

  // 最高叫分：从公开的 bids 派生（服务端只保证 multiplier = max(1, 最高叫分)，
  // 三家都不叫时倍数是兜底的 1，但并没人叫过 1 分，所以要分开显示）。
  const topBid = useMemo(() => {
    const scores = (view.bids || []).map((b: AnyView) => b.score as number);
    return scores.length === 0 ? 0 : Math.max(...scores);
  }, [view.bids]);

  // 气泡推导（优先级：瞬时气泡 > 叫分常驻气泡）
  const getPlayerBubble = useCallback((playerId: string | null) => {
    if (!playerId) return null;
    // 炸弹落地：被压一手的主人冒"啊？！"（契约 §4.2：上家冒气泡，延迟 700ms 由 stage 承载）
    if (stage.bombAck?.playerId === playerId) {
      return { text: '啊？！', sticky: false, hot: true };
    }
    // 过牌：被越过回合那家冒"不出"（1.6 秒淡出；服务端不含"能出但不出"信息，统一用动作名）
    if (stage.passNotice?.playerId === playerId) {
      return { text: '不出', sticky: false, hot: false };
    }
    if (view.phase === 'bidding') {
      const bid = (view.bids || []).find((b: AnyView) => b.playerId === playerId);
      if (bid) {
        return {
          text: bid.score === 0 ? '不叫' : `${bid.score} 分`,
          sticky: true,
          hot: bid.score === 3,
        };
      }
    }
    return null;
  }, [view.phase, view.bids, stage.bombAck, stage.passNotice]);

  // 底牌是否属于我的新入手牌（高亮描金边）
  const bottomCardIds = useMemo(() => {
    if (view.landlordId !== myId) return new Set<string>();
    return new Set((view.bottomCards || []).map((c: AnyView) => c.id));
  }, [view.landlordId, myId, view.bottomCards]);

  // 阶段大字与说明
  let phaseTitle = '聚乐茶馆';
  let phaseSubtitle = '斗地主正堂';
  if (view.phase === 'bidding') {
    if (myBid) {
      phaseTitle = '轮到你叫分';
      phaseSubtitle = maxBidScore > 0 ? `当前最高 ${maxBidScore} 分，可叫更高或不叫` : '叫 3 分立即定地主，或叫 1-2 分';
    } else {
      const currentName = view.currentBidderId ? nameFor(members, view.currentBidderId) : '对手';
      phaseTitle = '等待叫分';
      phaseSubtitle = `等待 ${currentName} 叫分`;
    }
  } else if (view.phase === 'playing') {
    if (myTurn) {
      phaseTitle = '轮到你出牌';
      phaseSubtitle = view.currentTrick ? '压过当前牌型，或者不出' : '自由出牌';
    } else {
      const currentName = view.currentPlayerId ? nameFor(members, view.currentPlayerId) : '对手';
      phaseTitle = '等待出牌';
      phaseSubtitle = `等 ${currentName} 出牌`;
    }
  } else if (view.phase === 'game_over') {
    phaseTitle = '对局结束';
    phaseSubtitle = view.winnerTeam === 'landlord' ? '地主阵营获胜' : '农民阵营获胜';
  }

  // 农民名字列表
  const farmerNames = useMemo(() => {
    return (view.players || [])
      .filter((p: AnyView) => p.playerId !== view.landlordId)
      .map((p: AnyView) => nameFor(members, p.playerId));
  }, [view.players, view.landlordId, members]);

  // 离开房间与再来一局处理
  const handleReturnRoom = useCallback(() => {
    void send('leave_room', {}).catch(() => {});
  }, [send]);

  const handlePlayAgain = useCallback(() => {
    void send('room_command', { command: 'start_game' }).catch(() => {});
  }, [send]);

  return (
    <div
      className="landlord-teahouse landlord-game-page tabletop-shell"
      ref={stage.stageRef}
      data-box="teahouse-stage"
      data-testid="landlord-teahouse"
      data-phase={view.phase}
    >
      {/* 1. 茶馆全景舞台装饰（墙面、八仙桌、花窗、对联、牌匾、灯笼、盖碗茶） */}
      <TeahouseScene />

      {/* 2. 左侧对手（上家）：data-player-id 直接挂在 .th-opp 上（无包装层，避免流内白条） */}
      {leftPlayer && (
        <OpponentFigure
          side="left"
          playerId={leftPlayer.playerId}
          flinch={stage.flinchIds.includes(leftPlayer.playerId)}
          nickname={nameFor(members, leftPlayer.playerId)}
          avatar={resolveMemberAvatar(
            members.find((m) => m.playerId === leftPlayer.playerId),
            { playerId: leftPlayer.playerId },
          )}
          role={getRole(leftPlayer.playerId)}
          handCount={leftPlayer.handCount ?? 0}
          active={
            (view.phase === 'bidding' && view.currentBidderId === leftPlayer.playerId) ||
            (view.phase === 'playing' && view.currentPlayerId === leftPlayer.playerId)
          }
          deadlineAt={view.deadlineAt}
          bubble={getPlayerBubble(leftPlayer.playerId)}
          revealedCards={view.revealedHands?.[leftPlayer.playerId]}
        />
      )}

      {/* 3. 右侧对手（下家） */}
      {rightPlayer && (
        <OpponentFigure
          side="right"
          playerId={rightPlayer.playerId}
          flinch={stage.flinchIds.includes(rightPlayer.playerId)}
          nickname={nameFor(members, rightPlayer.playerId)}
          avatar={resolveMemberAvatar(
            members.find((m) => m.playerId === rightPlayer.playerId),
            { playerId: rightPlayer.playerId },
          )}
          role={getRole(rightPlayer.playerId)}
          handCount={rightPlayer.handCount ?? 0}
          active={
            (view.phase === 'bidding' && view.currentBidderId === rightPlayer.playerId) ||
            (view.phase === 'playing' && view.currentPlayerId === rightPlayer.playerId)
          }
          deadlineAt={view.deadlineAt}
          bubble={getPlayerBubble(rightPlayer.playerId)}
          revealedCards={view.revealedHands?.[rightPlayer.playerId]}
        />
      )}

      {/* 4. 桌心区域：底牌、叫分木牌、出牌区、捷报 */}
      {/* 底牌展示：叫分阶段背面扣着；定地主后逐张翻开飞进地主手里，正面留在桌心做公开记录 */}
      <div
        className={`th-kitty${view.landlordId ? ' th-kitty--open' : ''}`}
        data-box="kitty"
        data-stage-anchor="kitty"
      >
        <span className="th-tag">底牌</span>
        <div className="th-kitty__cards">
          {view.landlordId && view.bottomCards && view.bottomCards.length === 3 ? (
            view.bottomCards.map((card: AnyView, idx: number) => (
              <PokerCard
                key={card.id ?? idx}
                rank={card.rank}
                suit={card.suit}
                flip={stage.revealingBottom}
                /* 底牌间隔 160ms 逐张翻开（契约 §4.1） */
                style={stage.revealingBottom ? { animationDelay: `${idx * 160}ms` } : undefined}
              />
            ))
          ) : (
            [0, 1, 2].map((idx) => (
              <PokerCard key={idx} back />
            ))
          )}
        </div>
      </div>

      {/* 叫分阶段：桌心三块木牌 */}
      {view.phase === 'bidding' && (
        <BidChips
          currentScore={maxBidScore}
          onSelect={myBid && !busy ? (score) => void act({ type: 'bid_score', score }) : undefined}
        />
      )}

      {/* 出牌阶段：桌心出牌区（终局时作为最后一手移到卷轴下方） */}
      {view.currentTrick && (
        <div
          className={`th-trick${view.phase === 'game_over' ? ' th-trick--final' : ''}`}
          data-box="pile"
          data-stage-anchor="trick"
        >
          <div className="th-trick__cards">
            {view.currentTrick.combo.cards.map((c: AnyView, idx: number) => (
              <PokerCard
                key={c.id ?? idx}
                rank={c.rank}
                suit={c.suit}
                /* 炸弹落地：出牌区每张牌依次再弹一下（契约 §4.2） */
                className={stage.trickPop ? 'is-bomb-pop' : undefined}
                style={stage.trickPop ? { animationDelay: `${idx * 70}ms` } : undefined}
              />
            ))}
          </div>
          <span className={`th-tag${stage.trickFlash ? ' is-bomb-flash' : ''}`}>
            {nameFor(members, view.currentTrick.playerId)} · {comboName(view.currentTrick.combo.type)}
          </span>
        </div>
      )}

      {/* 终局结算：朱红捷报展开 */}
      {view.phase === 'game_over' && (
        <VictoryScroll
          winnerTeam={view.winnerTeam}
          winnerName={view.winnerId ? nameFor(members, view.winnerId) : undefined}
          landlordName={view.landlordId ? nameFor(members, view.landlordId) : undefined}
          farmerNames={farmerNames}
          multiplier={view.multiplier}
          topBid={topBid}
          isSpring={isSpring}
        />
      )}

      {/* 5. HUD：左阶段大字 / 右倍数牌 + 倒计时 */}
      <div className="th-phase" data-box="phase">
        <div className="th-phase__title">{phaseTitle}</div>
        <div className="th-phase__sub">{phaseSubtitle}</div>
      </div>
      <div className="th-hud" data-box="hud">
        <div className="th-mult">
          <small>倍数</small>
          <span className="th-mult__num">
            <RollingNumber value={view.multiplier} prefix="×" />
          </span>
        </div>
        {isMyTurn && typeof remainSeconds === 'number' && (
          <div className={`th-turn-ring ${remainSeconds <= 5 ? 'is-last' : remainSeconds <= 10 ? 'is-low' : ''}`}>
            <svg viewBox="0 0 60 60">
              <circle className="track" cx="30" cy="30" r="26" />
              <circle
                className="bar"
                cx="30"
                cy="30"
                r="26"
                style={{
                  strokeDasharray: 2 * Math.PI * 26,
                  strokeDashoffset: 2 * Math.PI * 26 * (1 - Math.max(0, Math.min(1, remainSeconds / 20))),
                }}
              />
            </svg>
            <span className="ring-num">{remainSeconds}</span>
          </div>
        )}
      </div>

      {/* 6. 底部我的手牌与操作坞 */}
      <div className="th-me-zone">
        {me && (
          <div
            className={`th-hand${view.phase === 'bidding' ? ' th-hand--bidding' : ''}`}
            data-box="hand"
            data-stage-anchor="hand"
            ref={handContainerRef}
            style={{
              ['--overlap' as string]: `${cardOverlap}px`,
              ['--mid' as string]: String((sortedHand.length - 1) / 2),
            }}
          >
            {sortedHand.map((card, idx) => {
              const isSelected = selectedIds.includes(card.id);
              const isNew = bottomCardIds.has(card.id);
              return (
                <PokerCard
                  key={card.id}
                  rank={card.rank}
                  suit={card.suit}
                  selected={isSelected}
                  isNew={isNew}
                  onClick={() => handleToggleCard(card.id)}
                  style={{ ['--i' as string]: String(idx) }}
                />
              );
            })}
          </div>
        )}

        {/* 底部操作坞 */}
        <div className="th-dock" data-box="dock">
          {/* 叫分阶段 */}
          {view.phase === 'bidding' && (
            myBid ? (
              <>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={busy}
                  onClick={() => void act({ type: 'bid_score', score: 0 })}
                >
                  不叫
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={busy || maxBidScore >= 1}
                  onClick={() => void act({ type: 'bid_score', score: 1 })}
                >
                  1 分
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={busy || maxBidScore >= 2}
                  onClick={() => void act({ type: 'bid_score', score: 2 })}
                >
                  2 分
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn--primary"
                  disabled={busy}
                  onClick={() => void act({ type: 'bid_score', score: 3 })}
                >
                  3 分
                </button>
              </>
            ) : (
              <span className="th-tag">等待对手叫分</span>
            )
          )}

          {/* 出牌阶段 */}
          {view.phase === 'playing' && (
            myTurn ? (
              <>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={busy || !view.currentTrick}
                  onClick={() => void act({ type: 'pass_turn' })}
                  title={!view.currentTrick ? '首出必须出牌' : '不出本轮'}
                >
                  不出
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn--primary card-fan-play-btn"
                  disabled={busy || selectedIds.length === 0}
                  onClick={handlePlaySelected}
                >
                  {busy ? '出牌中…' : selectedIds.length > 0 ? `出牌 (${selectedIds.length})` : '出牌'}
                </button>
              </>
            ) : (
              <span className="th-tag">等待对手出牌</span>
            )
          )}

          {/* 终局结算阶段 */}
          {view.phase === 'game_over' && (
            <>
              <button
                type="button"
                className="gp-btn"
                onClick={handleReturnRoom}
              >
                返回房间
              </button>
              <button
                type="button"
                className="gp-btn gp-btn--primary"
                onClick={handlePlayAgain}
              >
                再来一局
              </button>
            </>
          )}
        </div>
      </div>

      {/* 7. 左下角我的名牌：data-player-id 直接挂在 .th-me-plate 上 */}
      {me && (
        <LandlordPlate
          playerId={me.playerId}
          nickname={nameFor(members, me.playerId)}
          role={myRole}
          handCount={me.hand?.length}
          active={isMyTurn}
          bubble={getPlayerBubble(me.playerId)}
        />
      )}

      {/* 8. 冲屏演出：炸弹/王炸、"你是地主"、春天（按事件自动回收，条件挂载即重启动画；勿加 key——见下方 IngotDrop 注释） */}
      {stage.slam && (
        <div className="th-slam" data-slam-key={stage.slam.key} aria-hidden="true">
          <span className="th-slam__word">{stage.slam.label}</span>
        </div>
      )}

      {/* 9. 金元宝落定：地主诞生时落到地主名牌上（条件挂载即重启动画；勿加 key——React 19 对带 key 的条件子节点在与兄弟节点并发增删时会插入重复节点，2026-09-28 实测） */}
      {stage.ingot && (
        <IngotDrop top={stage.ingot.top} left={stage.ingot.left} />
      )}

      {/* 10. 手机竖屏遮罩提示（仅在竖屏窄视口激活） */}
      <RotateHint />

      {/* 11. 卡牌飞行演出层 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
    </div>
  );
}
