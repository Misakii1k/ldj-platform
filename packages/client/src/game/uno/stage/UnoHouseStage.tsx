/**
 * uno_platform_house_v1 主舞台（D4-U-UI 全面沉浸式重构）。
 * 深度集成 TabletopOvalShell、CardFanEngine、四色选色轮盘、UNO 暴击动效与 WebAudio。
 */
import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../../../connection/useConnection.ts';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { TabletopOvalShell, type PlayerSeat } from '../../../shared-ui/TabletopOvalShell.tsx';
import { CardFanEngine, type CardItem } from '../../../shared-ui/CardFanEngine.tsx';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import { nameFor, useGameAction } from '../../useGameAction.ts';
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
  const [showRules, setShowRules] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [unoShouter, setUnoShouter] = useState<string | null>(null);
  const prevUnoCallersRef = useRef<Set<string>>(new Set());

  const me = view.me;
  const isSpectator = me === null || me === undefined;
  const phase = view.phase;
  const turnCountdown = useCountdown(view.clockInfo?.turnDeadlineAt);
  const windowCountdown = useCountdown(view.clockInfo?.windowDeadlineAt);

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
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
    setSelectedCardIds([]);
  }

  function confirmWild(color: UnoColor) {
    if (wildCardId === null) return;
    webAudio.playCardPlay();
    if (inWindow && caps.has('canStackPenalty')) {
      void act({ type: 'stack_penalty', cardId: wildCardId, declaredColor: color });
    } else {
      void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
    }
    setWildCardId(null);
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
  const seats: PlayerSeat[] = view.players.map((player) => {
    const member = members.find((m) => m.playerId === player.playerId);
    const isCurrent = player.playerId === view.currentPlayerId;
    const playerIdx = view.players.findIndex((p) => p.playerId === player.playerId);
    return {
      id: player.playerId,
      name: nameFor(members, player.playerId),
      avatar: member?.avatar,
      isCurrentTurn: isCurrent,
      handCount: player.handCount,
      roleTag: player.teamId !== null ? `队伍 ${player.teamId}` : undefined,
      badge: player.unoCalled ? 'UNO!' : undefined,
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

  const opponents = view.players.filter((p) => p.playerId !== me?.playerId);

  // 中央舞台牌桌
  const centerArena = (
    <div className="uno-tabletop-arena">
      {/* 顺时针 / 逆时针流光旋转方向环 */}
      <div className={`uno-direction-compass ${isCW ? 'is-cw' : 'is-ccw'}`} aria-hidden="true" />

      {/* 牌桌对手环绕席位（竖屏/小屏核心对手展示） */}
      {opponents.length > 0 && (
        <div className="uno-opponents-ring" data-count={opponents.length}>
          {opponents.map((opp) => {
            const oppMember = members.find((m) => m.playerId === opp.playerId);
            const isCurrent = opp.playerId === view.currentPlayerId;
            const oppIdx = view.players.findIndex((p) => p.playerId === opp.playerId);
            const oppScore = view.cumulativeScores?.[oppIdx];

            return (
              <div
                key={opp.playerId}
                className={`uno-opponent-station ${isCurrent ? 'is-active-turn' : ''} ${opp.unoCalled ? 'is-uno-shout' : ''}`}
                data-player-id={opp.playerId}
              >
                <div className="uno-opponent-avatar-box">
                  <UserAvatar
                    avatar={oppMember?.avatar}
                    nickname={nameFor(members, opp.playerId)}
                    size={34}
                    className="uno-opponent-avatar"
                  />
                  {isCurrent && <div className="uno-opponent-turn-halo" />}
                  {opp.unoCalled && <span className="uno-opponent-uno-badge">UNO!</span>}
                </div>

                <div className="uno-opponent-info">
                  <span className="uno-opponent-name">{nameFor(members, opp.playerId)}</span>
                  <div className="uno-opponent-cards-tag">
                    <GameIcon name="cards_deck" size={11} style={{ marginRight: '2px' }} />
                    <strong>{opp.handCount}</strong> 张
                  </div>
                  {oppScore !== undefined && (
                    <span className="uno-opponent-score">{oppScore}分</span>
                  )}
                </div>
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
      <div className="uno-deck-pile-wrap" style={{ position: 'relative', zIndex: 5 }}>
        {/* 摸牌堆 */}
        <button
          type="button"
          className={`uno-house-draw-pile ${caps.has('canDraw') ? 'is-my-turn-playable' : ''}`}
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
        <div className={`uno-house-discard color-${view.currentColor}`}>
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
        <span>方向：<strong>{directionLabel}</strong></span>
        <span>轮到：<strong>{nameFor(members, view.currentPlayerId)}</strong></span>
        {turnCountdown.expired ? null : <span style={{ color: '#ea580c' }}>{turnCountdown.secondsLeft}s</span>}
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
              onClick={() => void act({ type: 'call_uno' })}
            >
              <GameIcon name="uno_alert" size={16} />
              喊 UNO!
            </button>
          )}

          {caps.has('canCatchMissedUno') && view.unoRaceWindow && (
            <button
              type="button"
              className="uno-floating-btn btn-danger"
              disabled={busy}
              onClick={() => void act({
                type: 'catch_missed_uno',
                targetPlayerId: view.unoRaceWindow!.targetPlayerId,
                windowToken: view.unoRaceWindow!.windowToken,
              })}
            >
              <GameIcon name="horn" size={16} />
              抓漏报 UNO
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
        <CardFanEngine
          cards={fanCards}
          selectedCardIds={selectedCardIds}
          onSelectCards={setSelectedCardIds}
          hidePlayButton
          disabled={busy || phase !== 'round_playing'}
        />
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
        centerArena={centerArena}
        bottomBar={bottomBar}
        onShowRules={() => setShowRules(true)}
      />

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
              onClick={() => setWildCardId(null)}
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
