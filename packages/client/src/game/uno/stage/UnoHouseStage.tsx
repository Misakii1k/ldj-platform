/**
 * uno_platform_house_v1 主舞台（D4-U-UI 全面沉浸式重构）。
 * 深度集成 TabletopOvalShell、CardFanEngine、四色选色轮盘、UNO 暴击动效与 WebAudio。
 */
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, RotateCw, RotateCcw } from 'lucide-react';
import { useConnection } from '../../../connection/useConnection.ts';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { TabletopOvalShell, type PlayerSeat } from '../../../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../../../shared-ui/CardFanEngine.tsx';
import { StageCountdownRing } from '../../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../../shared-ui/stage/FlightLayer.tsx';
import { useUnoHouseStage } from './useUnoHouseStage.tsx';
import { RollingNumber } from '../../../shared-ui/RollingNumber.tsx';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import { nameFor, useGameAction } from '../../useGameAction.ts';
import { TabletopVictoryBurst } from '../../../shared-ui/TabletopVictoryBurst.tsx';
import { TabletopCountdownText } from '../../../shared-ui/TabletopCountdownText.tsx';
import { usePhaseEventOverlay } from '../../../shared-ui/usePhaseEventOverlay.tsx';
import {
  UNO_COLORS,
  UNO_COLOR_NAMES,
  cardLabel,
  colorLabel,
  getUnoCardAssetPath,
  type UnoCard,
  type UnoColor,
  type UnoHousePlayerView,
} from '../types.ts';
import { computeRingPositions } from './ringLayout.ts';

interface Props {
  view: UnoHousePlayerView;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'round_playing': return '对局中';
    case 'round_over': return '本局结束';
    case 'match_over': return '整场结束';
    default: return phase;
  }
}

export function UnoHouseStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  /** 预喊确认：手上剩 2 张时点牌，先问喊不喊 UNO 再出。 */
  const [preCallCardId, setPreCallCardId] = useState<string | null>(null);
  /** 万能牌走「选色」二段确认时，暂存上一步的预喊意图。 */
  const [pendingPreCall, setPendingPreCall] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [unoShouter, setUnoShouter] = useState<string | null>(null);
  const prevUnoCallersRef = useRef<Set<string>>(new Set());

  const me = view.me;
  const isSpectator = me === null || me === undefined;
  const phase = view.phase;

  // 局间 / 整场结束盖印（单局结束时整场未结束才弹，整场结束交给 VictoryBurst）
  const { overlay: phaseOverlay } = usePhaseEventOverlay(`${phase}:${view.round}`, (key) => {
    if (key.startsWith('round_over')) return { label: `第 ${view.round} 局结束`, sublabel: '结算积分，准备下一局', variant: 'stamp' };
    if (key.startsWith('round_playing') && view.round > 1) return { label: `第 ${view.round} 局开始`, variant: 'stamp' };
    return null;
  });
  const turnCountdown = useCountdown(view.clockInfo?.turnDeadlineAt);
  const windowCountdown = useCountdown(view.clockInfo?.windowDeadlineAt);

  // 出牌 / 摸牌 / 换色的演出由服务端差分驱动，避免与权威状态脱节
  const stage = useUnoHouseStage(view);

  const caps = new Set(me?.capabilities ?? []);
  const inWindow = me?.activeWindow !== null && me?.activeWindow !== undefined;
  const isMyTurn = me?.isCurrentPlayer ?? false;

  // 监听谁喊了 UNO，触发全屏金色爆裂印章动效与号角音效
  useEffect(() => {
    const currentCallers = new Set(
      view.players.filter((p) => p.unoCalled).map((p) => p.playerId),
    );
    const fresh = Array.from(currentCallers).filter((c) => !prevUnoCallersRef.current.has(c));
    if (fresh.length > 0) {
      // 本批新增的喊 UNO 者只触发一次动效；多个同时喊时印章显示最后一个
      setUnoShouter(nameFor(members, fresh[fresh.length - 1]!));
      webAudio.playUnoShout();
    }
    // 无论有无新增都要推进 prev ref，否则同一玩家会反复触发音效/印章
    prevUnoCallersRef.current = currentCallers;
    const t = setTimeout(() => setUnoShouter(null), 1800);
    return () => clearTimeout(t);
  }, [view.players, members]);

  const canPlay = (cardId: string): boolean =>
    phase === 'round_playing'
    && me !== null
    && !busy
    && (
      // 罚牌/质疑窗口内：仅响应者可点击任意牌叠加罚牌（走 stack_penalty 分支）
      (inWindow && caps.has('canStackPenalty'))
      // 正常回合：只能出可出的牌
      || (!inWindow && (me.playableCardIds ?? []).includes(cardId))
    );

  const cardColor = (card: UnoCard): string => ('color' in card ? card.color : 'wild');

  /** 真正提交出牌：preCallUno 为 true 时同时喊 UNO（落地即安全，不开抓捕窗口）。 */
  function submitPlay(card: UnoCard, preCallUno: boolean) {
    if (card.kind === 'wild' || card.kind === 'wild4') {
      // 万能牌还需选色，把预喊意图带到选色确认那一步
      setWildCardId(card.id);
      setPendingPreCall(preCallUno);
      return;
    }
    if (preCallUno) webAudio.playUnoShout();
    void act(preCallUno
      ? { type: 'play_card', cardId: card.id, preCallUno: true }
      : { type: 'play_card', cardId: card.id });
  }

  function handlePlayCard(card: UnoCard) {
    if (me === null || busy) return;

    if (card.kind === 'skip') webAudio.playUnoSkip();
    else if (card.kind === 'reverse') webAudio.playUnoReverse();
    else if (card.kind === 'draw2' || card.kind === 'wild4') webAudio.playUnoDrawPenalty();
    else webAudio.playCardPlay();

    if (inWindow && caps.has('canStackPenalty')) {
      if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
      else void act({ type: 'stack_penalty', cardId: card.id });
      setSelectedCardIds([]);
      return;
    }
    // 剩 2 张：这张打出去就只剩 1 张，先问喊不喊 UNO
    if (caps.has('canPreCallUno')) {
      setPreCallCardId(card.id);
      setSelectedCardIds([]);
      return;
    }
    submitPlay(card, false);
    setSelectedCardIds([]);
  }

  function confirmWild(color: UnoColor) {
    if (wildCardId === null) return;
    webAudio.playCardPlay();
    if (inWindow && caps.has('canStackPenalty')) {
      void act({ type: 'stack_penalty', cardId: wildCardId, declaredColor: color });
    } else if (pendingPreCall) {
      webAudio.playUnoShout();
      void act({ type: 'play_card', cardId: wildCardId, declaredColor: color, preCallUno: true });
    } else {
      void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
    }
    setWildCardId(null);
    setPendingPreCall(false);
    setSelectedCardIds([]);
  }

  // 轮到自己时触发轻微触觉反馈
  useEffect(() => {
    if (isMyTurn && phase === 'round_playing') {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([30, 40, 30]);
        }
      } catch {
        // Ignored in environments without vibration support
      }
    }
  }, [isMyTurn, phase]);

  // 键盘快捷键监听（选色轮盘 1/2/3/4 或 R/Y/G/B，ESC 关闭弹窗）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (wildCardId !== null) {
        if (e.key === '1' || e.key === 'r' || e.key === 'R') {
          confirmWild('red');
        } else if (e.key === '2' || e.key === 'y' || e.key === 'Y') {
          confirmWild('yellow');
        } else if (e.key === '3' || e.key === 'g' || e.key === 'G') {
          confirmWild('green');
        } else if (e.key === '4' || e.key === 'b' || e.key === 'B') {
          confirmWild('blue');
        } else if (e.key === 'Escape') {
          setWildCardId(null);
        }
      } else if (showRules && e.key === 'Escape') {
        setShowRules(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wildCardId, showRules]);

  // 映射玩家席位
  const raceTargetId = view.unoRaceWindow?.targetPlayerId ?? null;
  const seats: PlayerSeat[] = view.players.map((player) => {
    const member = members.find((m) => m.playerId === player.playerId);
    const isCurrent = player.playerId === view.currentPlayerId;
    const playerIdx = view.players.findIndex((p) => p.playerId === player.playerId);
    const isMissedTarget = player.playerId === raceTargetId;
    return {
      id: player.playerId,
      name: nameFor(members, player.playerId),
      avatar: member?.avatar,
      isCurrentTurn: isCurrent,
      handCount: player.handCount,
      roleTag: player.teamId !== null ? `队伍 ${player.teamId}` : undefined,
      // 漏报中优先显示警示徽章，提示其他人可以抓他
      badge: isMissedTarget ? '漏报!' : player.unoCalled ? 'UNO!' : undefined,
      score: view.cumulativeScores?.[playerIdx],
    };
  });

  const handIds = (me?.hand ?? []).map((card) => card.id).join('|');
  useEffect(() => {
    setSelectedCardIds((prev) => {
      const next = prev.filter((id) => (me?.hand ?? []).some((card) => card.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [handIds, me?.hand]);

  // 映射手牌扇形
  const fanCards: CardItem[] = (me?.hand ?? []).map((card) => ({
    id: card.id,
    label: cardLabel(card),
    sublabel: colorLabel(cardColor(card)),
    colorTheme: cardColor(card),
    imageUrl: getUnoCardAssetPath(card),
    disabled: !canPlay(card.id),
    raw: card,
  }));

  const directionLabel = view.direction === -1 ? '逆时针' : '顺时针';
  const isCW = view.direction === 1;

  // 对手按「座次 + 方向」环绕取出，数组顺序 = 真实出牌顺序。
  // view.players 的顺序即座次，direction 语义与服务端 nextTurnParticipant 一致
  // （shared/game/rules/turns.ts 的 wrapIndex(index + direction)），客户端可自行推算。
  const myIndex = view.players.findIndex((p) => p.playerId === me?.playerId);
  const total = view.players.length;
  const opponents = myIndex < 0
    ? view.players.filter((p) => p.playerId !== me?.playerId)
    : Array.from({ length: Math.max(total - 1, 0) }, (_, step) =>
        view.players[(((myIndex + view.direction * (step + 1)) % total) + total) % total]!);

  // 下一位玩家：house 视图没有 nextPlayerId，同样按座次 + 方向推算
  const curIndex = view.players.findIndex((p) => p.playerId === view.currentPlayerId);
  const nextPlayerId = curIndex < 0 || total === 0
    ? null
    : view.players[(((curIndex + view.direction) % total) + total) % total]!.playerId;

  // 环形站位定位：需要容器与中央牌堆的实际几何，随窗口/旋转变化重算。
  // 一律用 getBoundingClientRect 统一基准；牌堆位置也必须实测——
  // 它在容器里并非垂直居中，且偏移量随视口变化，写死比例会让站位压上牌堆。
  const ringRef = useRef<HTMLDivElement>(null);
  const pileRef = useRef<HTMLDivElement>(null);
  const [ringGeom, setRingGeom] = useState({
    width: 0, height: 0, pileLeft: 0, pileRight: 0, pileTop: 0, pileBottom: 0,
  });
  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const p = pileRef.current?.getBoundingClientRect();
      const next = {
        width: rect.width,
        height: rect.height,
        pileLeft: p ? p.left - rect.left : rect.width / 2 - 80,
        pileRight: p ? p.right - rect.left : rect.width / 2 + 80,
        pileTop: p ? p.top - rect.top : rect.height / 2 - 56,
        pileBottom: p ? p.bottom - rect.top : rect.height / 2 + 56,
      };
      setRingGeom((prev) => (
        (Object.keys(next) as (keyof typeof next)[]).every((k) => Math.abs(prev[k] - next[k]) < 0.5)
          ? prev
          : next
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (pileRef.current) observer.observe(pileRef.current);
    return () => observer.disconnect();
  }, [opponents.length]);

  const ringPositions = computeRingPositions(
    opponents.length,
    ringGeom.width,
    ringGeom.height,
    {
      left: ringGeom.pileLeft,
      right: ringGeom.pileRight,
      top: ringGeom.pileTop,
      bottom: ringGeom.pileBottom,
    },
  );

  // 中央舞台牌桌
  const centerArena = (
    <div className="uno-tabletop-arena uno-arena stage-felt-3d" ref={stage.stageRef}>
      {/* 抓漏报窗口与回合两类计时时长差很多，用 phaseKey 区分避免满格测量错乱 */}
      <StageCountdownRing
        deadlineAt={view.clockInfo?.windowDeadlineAt ?? view.clockInfo?.turnDeadlineAt ?? null}
        phaseKey={`${view.clockInfo?.windowDeadlineAt ? 'window' : 'turn'}:${view.currentPlayerId}:${view.round}`}
        active={view.phase === 'round_playing'}
        className="uno-countdown"
      />
      {/* 顺时针 / 逆时针流光旋转方向环 */}
      <div className={`uno-direction-compass ${isCW ? 'is-cw' : 'is-ccw'}`} aria-hidden="true" />

      {/* 牌桌对手环绕席位：按座次 + 方向沿椭圆弧摆放，方位即出牌顺序 */}
      {opponents.length > 0 && (
        <div className="uno-opponents-ring" data-count={opponents.length} ref={ringRef}>
          {opponents.map((opp, oppIndex) => {
            const oppMember = members.find((m) => m.playerId === opp.playerId);
            const isCurrent = opp.playerId === view.currentPlayerId;
            const isNext = !isCurrent && opp.playerId === nextPlayerId;
            const isMissedTarget = opp.playerId === raceTargetId;
            const oppIdx = view.players.findIndex((p) => p.playerId === opp.playerId);
            const oppScore = view.cumulativeScores?.[oppIdx];
            const pos = ringPositions[oppIndex];
            // 手牌少即危险：2 张转橙、1 张转红
            const danger = opp.handCount === 1 ? 'is-danger-1' : opp.handCount === 2 ? 'is-danger-2' : '';

            return (
              <div
                key={opp.playerId}
                className={`uno-opponent-station ${isCurrent ? 'is-active-turn' : ''} ${
                  isNext ? 'is-next-turn' : ''
                } ${danger} ${opp.unoCalled ? 'is-uno-shout' : ''}`}
                style={pos ? {
                  left: `${pos.left}px`,
                  top: `${pos.top}px`,
                  // 容器放不下全尺寸站位时整体缩小；--ring-scale 供 CSS 同步负 margin
                  ['--ring-scale' as string]: pos.scale,
                } : undefined}
                data-player-id={opp.playerId}
              >
                {isNext && <span className="uno-opponent-next-tag">下一位</span>}
                <div className="uno-opponent-avatar-box">
                  <UserAvatar
                    avatar={oppMember?.avatar}
                    nickname={nameFor(members, opp.playerId)}
                    size={Math.round(40 * (pos?.scale ?? 1))}
                    className="uno-opponent-avatar"
                  />
                  {isCurrent && <div className="uno-opponent-turn-halo" />}
                </div>

                <div className="uno-opponent-info">
                  <span className="uno-opponent-name">{nameFor(members, opp.playerId)}</span>
                  <div className="uno-opponent-cards-tag">
                    <strong>{opp.handCount}</strong> 张
                  </div>
                  {view.roundLimit > 1 && oppScore !== undefined && (
                    <RollingNumber className="uno-opponent-score" value={oppScore} suffix="分" />
                  )}
                </div>
                {isMissedTarget
                  ? <span className="uno-opponent-uno-badge is-missed">漏报!</span>
                  : opp.unoCalled && <span className="uno-opponent-uno-badge">UNO!</span>}
              </div>
            );
          })}

          {/* 站位之间的方向箭头：沿出牌顺序指向下一位 */}
          {ringPositions.slice(0, -1).map((pos, i) => {
            const next = ringPositions[i + 1]!;
            const angle = Math.atan2(next.top - pos.top, next.left - pos.left) * 180 / Math.PI;
            return (
              <div
                key={`arrow-${i}`}
                className="uno-ring-arrow"
                aria-hidden="true"
                style={{
                  left: `${(pos.left + next.left) / 2}px`,
                  top: `${(pos.top + next.top) / 2}px`,
                  transform: `translate(-50%,-50%) rotate(${angle}deg)`,
                }}
              >
                <ArrowRight size={17} strokeWidth={3.4} />
              </div>
            );
          })}
        </div>
      )}

      {/* 罚牌与竞速横幅 */}
      {view.pendingPenalty && (
        <div className="uno-house-banner uno-house-banner--penalty" role="status" style={{ zIndex: 10 }}>
          <GameIcon name="uno_draw4" size={20} style={{ marginRight: '6px' }} />
          <strong>罚牌累积 {view.pendingPenalty.total} 张</strong>
          <span>
            由 <strong>{nameFor(members, view.pendingPenalty.responderId)}</strong> 承担
            {view.pendingPenalty.challengeable ? ' · 可质疑' : ''}
            {windowCountdown.expired ? '' : ` · ${windowCountdown.secondsLeft}s`}
          </span>
        </div>
      )}

      {view.unoRaceWindow && (
        <div className="uno-house-banner uno-house-banner--race" role="status" style={{ zIndex: 10 }}>
          <GameIcon name="horn" size={20} style={{ marginRight: '6px' }} />
          <strong>UNO 抓漏报窗口</strong>
          <span>
            抓 <strong>{nameFor(members, view.unoRaceWindow.targetPlayerId)}</strong>
            {windowCountdown.expired ? '' : ` · ${windowCountdown.secondsLeft}s`}
          </span>
        </div>
      )}

      {/* 牌堆与弃牌堆 */}
      <div className="uno-deck-pile-wrap stage-felt-3d__plane" ref={pileRef} style={{ position: 'relative', zIndex: 5 }}>
        {/* 摸牌堆 */}
        <button
          type="button"
          className={`uno-house-draw-pile ${caps.has('canDraw') ? 'is-my-turn-playable' : ''}`}
          data-stage-anchor="draw"
          disabled={!caps.has('canDraw') || busy}
          onClick={() => {
            webAudio.playDealCards();
            void act({ type: 'draw_card' });
          }}
          title={caps.has('canDraw') ? '点击摸牌' : '暂不可摸牌'}
        >
          <img src="/assets/uno/back.png" alt="摸牌堆" className="uno-house-card-img" />
          <span className="uno-house-pile-badge" aria-label={`剩余 ${view.deckCount} 张`}>
            {view.deckCount}
          </span>
        </button>

        {/* 弃牌堆顶牌 */}
        <div
          className={`uno-house-discard color-${view.currentColor}`}
          data-stage-anchor="discard"
          data-sweep={stage.sweepColor ?? undefined}
        >
          <div className={`uno-discard-halo uno-discard-halo--${view.currentColor}`} />
          {view.topDiscard ? (
            <img
              src={getUnoCardAssetPath(view.topDiscard)}
              alt={`${colorLabel(view.currentColor)} ${cardLabel(view.topDiscard)}`}
              className="uno-house-card-img"
              style={{ position: 'relative', zIndex: 1 }}
            />
          ) : (
            <div className="uno-house-discard-empty">空</div>
          )}
          <small className="uno-house-discard-color-badge" style={{ zIndex: 2 }}>
            当前色 · {colorLabel(view.currentColor)}
          </small>
        </div>
      </div>

      {/* 回合与状态信息 */}
      <p className="uno-house-center__meta" style={{ zIndex: 5 }}>
        <span className="uno-direction-badge">
          {isCW
            ? <RotateCw size={15} strokeWidth={2.6} aria-hidden="true" />
            : <RotateCcw size={15} strokeWidth={2.6} aria-hidden="true" />}
          {directionLabel}
        </span>
        <span className="uno-turn-badge">轮到 <strong>{nameFor(members, view.currentPlayerId)}</strong></span>
        {turnCountdown.expired ? null : <TabletopCountdownText as="span" secondsLeft={turnCountdown.secondsLeft} style={{ color: '#c2410c', fontWeight: 800 }} />}
      </p>

      {error && <p className="game-error uno-house-stage__error" role="alert">{error}</p>}
    </div>
  );

  // 底部手牌与操作栏
  const bottomBar = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      {/* 快捷操作浮条 */}
      {!isSpectator && me && (
        <div className="uno-floating-controls">
          {selectedCardIds.length > 0 && (
            <button
              type="button"
              className="uno-floating-btn btn-primary"
              disabled={busy || phase !== 'round_playing'}
              onClick={() => {
                const target = (me?.hand ?? []).find((card) => selectedCardIds.includes(card.id));
                if (target) handlePlayCard(target);
              }}
            >
              <GameIcon name="rocket" size={16} />
              出牌
            </button>
          )}
          {caps.has('canDraw') && (
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
              摸牌
            </button>
          )}

          {caps.has('canPassAfterDraw') && (
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

          {caps.has('canCallUno') && (
            <button
              type="button"
              className="uno-floating-btn btn-danger"
              disabled={busy}
              title={me?.activeWindow === 'race'
                ? '你漏喊了 UNO，趁还没被抓赶紧补喊'
                : '你只剩 1 张牌，喊一声 UNO'}
              onClick={() => void act({ type: 'call_uno' })}
            >
              <GameIcon name="uno_alert" size={16} />
              {me?.activeWindow === 'race' ? '补喊 UNO!' : '喊 UNO!'}
            </button>
          )}

          {caps.has('canCatchMissedUno') && view.unoRaceWindow && (
            <button
              type="button"
              className="uno-floating-btn btn-danger"
              disabled={busy}
              title={`${nameFor(members, view.unoRaceWindow.targetPlayerId)} 只剩 1 张却没喊 UNO，抓他罚摸 2 张`}
              onClick={() => void act({
                type: 'catch_missed_uno',
                targetPlayerId: view.unoRaceWindow!.targetPlayerId,
                windowToken: view.unoRaceWindow!.windowToken,
              })}
            >
              <GameIcon name="horn" size={16} />
              抓 {nameFor(members, view.unoRaceWindow.targetPlayerId)} 漏报
            </button>
          )}

          {caps.has('canAcceptPenalty') && view.pendingPenalty && (
            <button
              type="button"
              className="uno-floating-btn btn-outline"
              disabled={busy}
              onClick={() => void act({ type: 'accept_penalty', windowToken: view.pendingPenalty!.windowToken })}
            >
              <GameIcon name="uno_draw2" size={16} />
              接受罚牌 ({view.pendingPenalty.total}张)
            </button>
          )}

          {caps.has('canChallenge') && view.pendingPenalty && (
            <button
              type="button"
              className="uno-floating-btn btn-danger"
              disabled={busy}
              onClick={() => void act({ type: 'challenge_penalty', windowToken: view.pendingPenalty!.windowToken })}
            >
              <GameIcon name="uno_challenge" size={16} />
              质疑 +4
            </button>
          )}

          <button
            type="button"
            className="uno-floating-btn btn-outline"
            onClick={() => setShowRules(true)}
          >
            <GameIcon name="star" size={14} />
            规则
          </button>
        </div>
      )}

      {/* 3D 扇形手牌渲染 */}
      {!isSpectator && me && (
        <div className="uno-fan-anchor" data-stage-anchor="hand">
        <CardFanEngine
          cards={fanCards}
          selectedCardIds={selectedCardIds}
          onSelectCards={setSelectedCardIds}
          hidePlayButton
          /* 罚牌链容易把手牌堆到 20+ 张，开启稠密策略：
             可出牌抬升前置、不可出牌压成色条，再多则拆双排 */
          denseWhenCrowded
          disabled={busy || phase !== 'round_playing'}
        />
        </div>
      )}

      {isSpectator && (
        <p className="uno-house-spectator-note">观战模式中 · 手牌仅对玩家本人显示</p>
      )}
    </div>
  );

  const title = view.mode === 'team' ? 'UNO 组队房规' : 'UNO 房规模式';
  const subtitle = `第 ${view.round} / ${view.roundLimit} 局 · ${view.mode === 'team' ? '组队赛' : '个人赛'} · ${phaseLabel(phase)}`;

  return (
    <>
      <TabletopOvalShell
        title={title}
        subtitle={subtitle}
        gameId="uno"
        theme="sunset"
        players={seats}
        currentUserId={me?.playerId}
        // 对手改由毡面上的环形站位呈现（.uno-opponent-station 自带 data-player-id，
        // 飞行层仍能定位），席位条会与之重复
        hideSeats
        centerArena={centerArena}
        bottomBar={bottomBar}
        onShowRules={() => setShowRules(true)}
      />
      {phaseOverlay}
      <TabletopVictoryBurst
        gameOver={phase === 'match_over'}
        isWinner={me && view.matchRanking ? view.matchRanking.find((entry) => entry.rank === 1)?.playerId === me.playerId : null}
        label="整场结束"
        sublabel={
          view.matchRanking
            ? `冠军：${nameFor(members, view.matchRanking.find((entry) => entry.rank === 1)?.playerId ?? '')}`
            : undefined
        }
      />

      {/* 飞行层必须挂在牌桌外壳之外：毡面是 perspective 容器，
          一旦有 transform 祖先，position:fixed 会退化为相对定位。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />

      {/* 四色大轮盘选色弹窗 */}
      {wildCardId !== null && (
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
                  onClick={() => confirmWild(c)}
                >
                  <span style={{ fontSize: '1.4rem' }}>●</span>
                  {UNO_COLOR_NAMES[c]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="uno-color-wheel-cancel"
              onClick={() => { setWildCardId(null); setPendingPreCall(false); }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 预喊确认：手上剩 2 张，这张打出去就只剩 1 张 */}
      {preCallCardId !== null && (
        <div className="uno-color-wheel-backdrop" role="dialog" aria-modal="true" aria-label="是否喊 UNO">
          <div className="uno-color-wheel-dialog uno-precall-dialog">
            <h3>
              <GameIcon name="uno_alert" size={24} />
              这张打出后只剩 1 张
            </h3>
            <p className="uno-precall-hint">
              现在喊 UNO 就安全了；不喊的话，出牌后 5 秒内会被其他人抓到，罚摸 2 张。
            </p>
            <div className="uno-precall-actions">
              <button
                type="button"
                className="uno-precall-btn uno-precall-btn--call"
                disabled={busy}
                onClick={() => {
                  const card = (me?.hand ?? []).find((c) => c.id === preCallCardId);
                  setPreCallCardId(null);
                  if (card) submitPlay(card, true);
                }}
              >
                <GameIcon name="horn" size={18} />
                喊 UNO 并出牌
              </button>
              <button
                type="button"
                className="uno-precall-btn uno-precall-btn--silent"
                disabled={busy}
                onClick={() => {
                  const card = (me?.hand ?? []).find((c) => c.id === preCallCardId);
                  setPreCallCardId(null);
                  if (card) submitPlay(card, false);
                }}
              >
                静默出牌（冒险）
              </button>
            </div>
            <button
              type="button"
              className="uno-color-wheel-cancel"
              onClick={() => setPreCallCardId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* UNO 喊牌全屏金色印章暴击动效 */}
      {unoShouter && (
        <div className="uno-shout-overlay" aria-live="assertive">
          <div className="uno-shout-stamp">
            <h2 className="uno-shout-stamp__title">UNO!</h2>
            <div className="uno-shout-stamp__sub">玩家 {unoShouter} 喊牌！</div>
          </div>
        </div>
      )}

      {/* 规则快速查阅弹窗 */}
      {showRules && (
        <div className="uno-color-wheel-backdrop" role="dialog" aria-modal="true" aria-label="UNO 规则说明">
          <div className="uno-color-wheel-dialog" style={{ maxWidth: '420px', textAlign: 'left', alignItems: 'stretch' }}>
            <h3>
              <GameIcon name="star" size={20} />
              UNO 规则速查
            </h3>
            <div style={{ fontSize: '0.86rem', color: '#4b5563', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>● 出牌规则：</strong>打出与顶牌同颜色、同数字或同功能的牌，也可随时打出万能牌。</div>
              <div><strong>● 罚牌叠加：</strong>出 +2 或 +4 牌时，下家若有同类罚牌可连环叠加升级（如 +2 接 +2 变 +4）。</div>
              <div><strong>● 质疑 +4：</strong>若怀疑上家手中有当前颜色牌却违规出 +4，可发起质疑。质疑成功上家摸 4 张，失败质疑者额外罚摸 2 张。</div>
              <div><strong>● 喊 UNO：</strong>剩 1 张手牌时必须预喊或抢喊 UNO；漏喊被抓罚摸 2 张！</div>
            </div>
            <button
              type="button"
              className="uno-color-wheel-cancel"
              style={{ alignSelf: 'center', marginTop: '12px' }}
              onClick={() => setShowRules(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
