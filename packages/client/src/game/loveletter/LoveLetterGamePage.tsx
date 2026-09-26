/**
 * loveletter_classic16_v1 客户端主页面（TabletopShell 消费方）。
 * 只消费严格解析后的情书视角（loveletter/types.ts parseLoveLetterView）。
 * 手牌只属于本人：观战视角不含手牌，页面仅在 me 存在时渲染手牌区。
 * 视觉：信笺宫廷主题——信封手牌、蜡封徽章、移除堆、好感红心进度、实时记牌器与卡牌技能悬浮。
 *
 * U08 演出层（stage/）：书信桌 3D 毡面、出牌时信封飞向中央、淘汰翻手牌、
 * 侍女庇护盾牌亮起。这款**没有服务端 timer**（纯回合制），故不上倒计时环。
 *
 * V03 宫廷桌面：中央从「56px 的两张牌背」改成牌库 + 弃牌堆 + 蜡封进度板；
 * 对手弃牌改用角色插画缩略；手牌改成真信封（翻盖 + 蜡封）；
 * 记牌器 / 技能详情 / 查验记录三套弹窗归一到 GameDrawer。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { UserAvatar } from '../../user/UserAvatar.tsx';
import { resolveMemberAvatar } from '../../user/avatar.ts';
import { useLoveLetterStage } from './stage/useLoveLetterStage.tsx';
import { AffectionLedger, DeckPile, DiscardPile, QuillArt, WaxSeal, type LastPlayed } from './stage/CourtProps.tsx';
import { LOVELETTER_ROLES, type LoveLetterPlayerView, type LoveLetterRole, type LoveLetterCard } from './types.ts';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';

import { ROLE_LABELS, ROLE_ABILITIES, NEEDS_TARGET } from './roleMeta.ts';


/** 战报条目：一次出牌 / 淘汰 / 庇护 / 查验的可读描述 */
interface LLFeedItem {
  id: number;
  text: string;
  kind: 'play' | 'out' | 'protect' | 'peek';
}

/** 轮次结算摘要：谁赢、怎么赢、赢后好感进度 */
interface LLRoundSummary {
  round: number;
  winnerIds: string[];
  reason: 'last-standing' | 'deck-empty';
  affection: Record<string, number>;
  affectionTarget: number;
}

/** 历史各轮出牌与结算归档 */
interface LLHistoricalRound {
  round: number;
  winnerIds: string[];
  discards: Array<{ playerId: string; cards: LoveLetterCard[] }>;
}

const FEED_TTL_MS = 6000;
const ROUND_BANNER_TTL_MS = 4200;

interface Props {
  view: LoveLetterPlayerView;
}

export function LoveLetterGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const trackerRef = useRef<HTMLButtonElement | null>(null);
  const historyRef = useRef<HTMLButtonElement | null>(null);
  // 技能详情抽屉从哪里打开就还焦点到哪里（手牌、弃牌缩略、记牌器行都能开）
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [guessedRole, setGuessedRole] = useState<LoveLetterRole | null>(null);
  const [feed, setFeed] = useState<LLFeedItem[]>([]);
  const feedRef = useRef<LLFeedItem[]>([]);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);
  const [roundBanner, setRoundBanner] = useState<LLRoundSummary | null>(null);
  const [finalSummary, setFinalSummary] = useState<LLRoundSummary | null>(null);
  const [roundHistory, setRoundHistory] = useState<LLHistoricalRound[]>([]);
  const [hoveredRole, setHoveredRole] = useState<LoveLetterRole | null>(null);
  const [detailRole, setDetailRole] = useState<LoveLetterRole | null>(null);
  const [activeTrackerTab, setActiveTrackerTab] = useState<'tracker' | 'history'>('tracker');

  // 出牌 / 淘汰 / 庇护的演出由服务端差分驱动，避免与权威状态脱节
  const stage = useLoveLetterStage(view);
  const prevViewRef = useRef<LoveLetterPlayerView | null>(null);
  const feedIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const longPressTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
  }, []);

  function openDetail(role: LoveLetterRole, trigger: HTMLElement | null) {
    detailTriggerRef.current = trigger;
    setHoveredRole(null);
    setDetailRole(role);
  }

  function handleTouchStart(role: LoveLetterRole, trigger: HTMLElement) {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      openDetail(role, trigger);
    }, 450);
  }

  function handleTouchEnd() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // —— 视图差分战报与轮次历史归档
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (!prev || prev.phase !== 'playing') return;

    const nameOf = (id: string) => (id === myId ? '你' : nameFor(members, id));

    // 回合边界：轮次号前进或进入终局
    if (view.round !== prev.round || view.phase === 'game_over') {
      const winnerIds = view.players
        .filter((p) => (view.affection[p.playerId] ?? 0) > (prev.affection[p.playerId] ?? 0))
        .map((p) => p.playerId);
      if (winnerIds.length === 0) return;

      const prevAlive = prev.players.filter((p) => !prev.eliminatedPlayers.includes(p.playerId)).length;
      const summary: LLRoundSummary = {
        round: prev.round,
        winnerIds,
        reason: prevAlive === 2 && prev.deckCount > 1 ? 'last-standing' : 'deck-empty',
        affection: { ...view.affection },
        affectionTarget: view.affectionTarget,
      };

      // 归档上一轮出牌记录
      setRoundHistory((prevHist) => [
        ...prevHist,
        {
          round: prev.round,
          winnerIds,
          discards: prev.players.map((p) => ({
            playerId: p.playerId,
            cards: [...p.discarded],
          })),
        },
      ]);

      if (view.phase === 'game_over') {
        setFinalSummary(summary);
      } else {
        setRoundBanner(summary);
        const timer = window.setTimeout(() => setRoundBanner(null), ROUND_BANNER_TTL_MS);
        timersRef.current.push(timer);
      }
      if (myId !== null) {
        if (winnerIds.includes(myId)) webAudio.playVictory();
        else webAudio.playBuzzer();
      }
      return;
    }

    const additions: { text: string; kind: LLFeedItem['kind'] }[] = [];

    // 出牌者 = 上一帧的当前玩家
    const actorId = prev.currentPlayerId;
    if (actorId !== null) {
      const beforePile = prev.players.find((p) => p.playerId === actorId)?.discarded.length ?? 0;
      const afterPile = view.players.find((p) => p.playerId === actorId)?.discarded ?? [];
      if (afterPile.length > beforePile) {
        additions.push({ text: `${nameOf(actorId)} 打出「${ROLE_LABELS[afterPile[beforePile]!.role]}」`, kind: 'play' });
      }
    }

    // 王子弃牌
    for (const player of view.players) {
      if (player.playerId === actorId) continue;
      const before = prev.players.find((p) => p.playerId === player.playerId)?.discarded.length ?? 0;
      const newlyOut = view.eliminatedPlayers.includes(player.playerId)
        && !prev.eliminatedPlayers.includes(player.playerId);
      if (!newlyOut && player.discarded.length > before) {
        additions.push({ text: `${nameOf(player.playerId)} 被迫弃掉手牌`, kind: 'play' });
      }
    }

    for (const id of view.eliminatedPlayers) {
      if (!prev.eliminatedPlayers.includes(id)) additions.push({ text: `${nameOf(id)} 出局`, kind: 'out' });
    }
    for (const id of view.protectedPlayers) {
      if (!prev.protectedPlayers.includes(id)) additions.push({ text: `${nameOf(id)} 获得侍女庇护`, kind: 'protect' });
    }
    if (me) {
      const beforePeeks = prev.me?.inspections.length ?? 0;
      const peeks = me.inspections ?? [];
      if (peeks.length > beforePeeks) {
        const last = peeks[peeks.length - 1]!;
        additions.push({
          text: `你查验了 ${nameFor(members, last.targetPlayerId)}：是「${ROLE_LABELS[last.role]}」`,
          kind: 'peek',
        });
      }
    }

    if (additions.length > 0) {
      // 先算好数组与定时器，再一次性 setFeed——副作用（setTimeout/timersRef）不进 updater
      const next = [...feedRef.current];
      for (const addition of additions) {
        const id = ++feedIdRef.current;
        next.push({ id, ...addition });
        const timer = window.setTimeout(() => {
          setFeed((items) => items.filter((item) => item.id !== id));
        }, FEED_TTL_MS);
        timersRef.current.push(timer);
      }
      setFeed(next.slice(-4));
      if (additions.some((addition) => addition.kind === 'play')) webAudio.playCardPlay();
    }
  }, [view]);

  const myTurn = view.phase === 'playing' && view.currentPlayerId === myId;
  const selectedCard = me?.hand.find((card) => card.id === selectedCardId) ?? null;
  const needsTarget = selectedCard !== null && NEEDS_TARGET.includes(selectedCard.role);
  const isGuard = selectedCard?.role === 'guard';
  const isPrince = selectedCard?.role === 'prince';
  const protectedIds = new Set(view.protectedPlayers ?? []);
  const eliminatedIds = new Set(view.eliminatedPlayers ?? []);
  const targetOptions = selectedCard === null
    ? []
    : isPrince
      ? [myId!, ...view.players
          .filter((player) => player.playerId !== myId && !eliminatedIds.has(player.playerId) && !protectedIds.has(player.playerId))
          .map((player) => player.playerId)]
      : view.players
          .filter((player) => player.playerId !== myId && !eliminatedIds.has(player.playerId) && !protectedIds.has(player.playerId))
          .map((player) => player.playerId);
  const needsTargetChoice = needsTarget && targetOptions.length > 0;
  const canPlay = myTurn && selectedCard !== null
    && (!needsTargetChoice || targetId !== null)
    && (!isGuard || !needsTargetChoice || guessedRole !== null);

  function resetSelection() {
    setSelectedCardId(null);
    setTargetId(null);
    setGuessedRole(null);
  }

  async function play() {
    if (!selectedCard || !myId) return;
    await act({
      type: 'play_card',
      playerId: myId,
      cardId: selectedCard.id,
      ...(needsTargetChoice && targetId ? { targetPlayerId: targetId } : {}),
      ...(isGuard && needsTargetChoice && guessedRole ? { guessedRole } : {}),
    });
    resetSelection();
  }


  // —— 最近一张打出的牌：只从服务端差分得来（出牌者 = 弃牌堆增长的那位）。
  // 刷新后第一帧没有差分，退而取「当前行动者的上家」最后一张弃牌，绝大多数时候就是它。
  const [lastPlayed, setLastPlayed] = useState<{ round: number; playerId: string; card: LoveLetterCard } | null>(null);
  const lastViewRef = useRef<LoveLetterPlayerView | null>(null);
  useEffect(() => {
    const prev = lastViewRef.current;
    lastViewRef.current = view;
    if (!prev || prev.round !== view.round) return;
    const grown = view.players.filter((player) =>
      player.discarded.length > (prev.players.find((p) => p.playerId === player.playerId)?.discarded.length ?? 0));
    // 王子令对手弃牌时两人弃牌堆同时增长，出牌者自己那张才代表「这一手」
    const actor = grown.find((p) => p.playerId === prev.currentPlayerId) ?? grown[0];
    const card = actor?.discarded[actor.discarded.length - 1];
    if (actor && card) setLastPlayed({ round: view.round, playerId: actor.playerId, card });
  }, [view]);

  function fallbackLastPlayed(): { playerId: string; card: LoveLetterCard } | null {
    const order = view.players;
    const currentIndex = order.findIndex((p) => p.playerId === view.currentPlayerId);
    for (let step = 1; step <= order.length; step += 1) {
      const candidate = order[(currentIndex - step + order.length * 2) % order.length];
      const card = candidate?.discarded[candidate.discarded.length - 1];
      if (candidate && card) return { playerId: candidate.playerId, card };
    }
    return null;
  }

  const lastEntry = lastPlayed && lastPlayed.round === view.round ? lastPlayed : fallbackLastPlayed();
  const lastForPile: LastPlayed | null = lastEntry
    ? { card: lastEntry.card, playerName: lastEntry.playerId === myId ? '你' : nameFor(members, lastEntry.playerId) }
    : null;
  const discardTotal = view.players.reduce((sum, p) => sum + p.discarded.length, 0);

  const ledgerRows = view.players.map((player) => ({
    playerId: player.playerId,
    name: nameFor(members, player.playerId),
    points: view.affection[player.playerId] ?? 0,
    isMe: player.playerId === myId,
    isCurrent: view.phase === 'playing' && player.playerId === view.currentPlayerId,
    isOut: eliminatedIds.has(player.playerId),
  }));

  const players = view.players.map((player) => ({
    id: player.playerId,
    name: nameFor(members, player.playerId),
    status: `${player.handCount} 张${(view.protectedPlayers ?? []).includes(player.playerId) ? ' · 侍女庇护' : ''}`,
    active: player.playerId === view.currentPlayerId,
    eliminated: (view.eliminatedPlayers ?? []).includes(player.playerId),
  }));

  const canPlayDisabled = !canPlay;

  // —— 实时牌池统计计算 (Card Tracker Calculation)
  const trackerStats = LOVELETTER_ROLES.map((role) => {
    const meta = ROLE_ABILITIES[role];
    const playerDiscards: Record<string, number> = {};
    let totalDiscarded = 0;
    for (const p of view.players) {
      const count = (p.discarded ?? []).filter((c) => c.role === role).length;
      if (count > 0) playerDiscards[p.playerId] = count;
      totalDiscarded += count;
    }
    const removedCount = 0;
    const myCount = (me?.hand ?? []).filter((c) => c.role === role).length;
    const knownTotal = totalDiscarded + removedCount + myCount;
    const remainingUnknown = Math.max(0, meta.totalCount - knownTotal);
    const isExhausted = knownTotal >= meta.totalCount;

    return {
      role,
      meta,
      playerDiscards,
      totalDiscarded,
      removedCount,
      myCount,
      knownTotal,
      remainingUnknown,
      isExhausted,
      totalCount: meta.totalCount,
    };
  });

  const inspections = me?.inspections ?? [];

  return (
    <TabletopShell
      title="情书"
      phase={view.phase === 'game_over' ? '对局结束' : `第 ${view.round} 轮`}
      gameId="loveletter"
      phaseKey={`${view.phase}:${view.round}:${view.currentPlayerId ?? 'idle'}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : view.roundWinners.join(',') || 'active'}`}
      spectator={isSpectator}
      players={players}
      hideSeats={true}
      theme="letter"
      rulesButton={(
        <div className="tabletop-btn-group">
          {inspections.length > 0 && (
            <button
              ref={historyRef}
              type="button"
              className={`tabletop-rules-btn ll-tracker-toggle-btn ${historyOpen ? 'is-active' : ''}`}
              onClick={() => setHistoryOpen(true)}
              title="仅你可见的查验记录"
            >
              查验 {inspections.length}
            </button>
          )}
          <button
            ref={trackerRef}
            type="button"
            className={`tabletop-rules-btn ll-tracker-toggle-btn ${trackerOpen ? 'is-active' : ''}`}
            onClick={() => setTrackerOpen(true)}
            title="实时记牌器与出牌记录"
          >
            记牌器
          </button>
          <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
            本局规则
          </button>
        </div>
      )}
      actions={(
        <ActionDock
          primary={{
            id: 'play',
            label: !selectedCard
              ? '请先选牌'
              : (needsTargetChoice && targetId === null)
              ? `打出「${ROLE_LABELS[selectedCard.role]}」（请选目标）`
              : (isGuard && needsTargetChoice && guessedRole === null)
              ? '打出「卫兵」（请猜身份）'
              : `打出「${ROLE_LABELS[selectedCard.role]}」`,
            disabled: canPlayDisabled,
            onAction: () => void play(),
          }}
          secondary={[{ id: 'clear', label: '重选', disabled: selectedCard === null, onAction: resetSelection }]}
          busy={busy}
          waitingReason={view.phase === 'game_over' ? undefined : myTurn ? '轮到你了，从手牌中选一张打出（悬浮/长按可看技能）' : `${nameFor(members, view.currentPlayerId)} 正在出牌`}
        />
      )}
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" className="ll-dialog" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>经典 16 张牌，摸 1 打 1。伯爵夫人在手且王子/国王在手时必须先打出伯爵夫人。</p>
          <p>弃掉公主即淘汰；牌库耗尽时先比手牌点数，再比弃牌区点数。</p>
          <p>先攒够好感阈值（{view.affectionTarget}）的玩家获胜：2 人 7、3 人 5、4 人 4。两人局开局暗置移除 1 张牌，牌面不对任何人公开。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div
          className={`sg-stage loveletter-immersive-board ll-board stage-felt-3d ${needsTargetChoice ? 'is-selecting-target' : ''}`}
          ref={stage.stageRef}
        >
          <div className="stage-art ll-art">
            <QuillArt />
          </div>

          <div className="loveletter-opponents">
            {view.players.filter((p) => p.playerId !== myId).map((player, opponentIndex) => {
              const isTargetable = targetOptions.includes(player.playerId);
              const isSelected = targetId === player.playerId;
              const isOut = (view.eliminatedPlayers ?? []).includes(player.playerId);
              const isProtected = protectedIds.has(player.playerId);
              const isCurrent = view.phase === 'playing' && player.playerId === view.currentPlayerId;
              const points = (view.affection ?? {})[player.playerId] ?? 0;
              const showRolePicker = isSelected && isGuard && needsTargetChoice;
              const name = nameFor(members, player.playerId);

              return (
                <div
                  key={player.playerId}
                  className={`ll-opponent ${isOut ? 'is-out' : ''} ${isProtected ? 'is-protected' : ''} ${isTargetable ? 'is-targetable' : ''} ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current-turn' : ''}`}
                  style={{ ['--i' as string]: opponentIndex }}
                  // 飞行层按 data-player-id 定位对手手边，作为出牌与淘汰演出的起终点
                  data-player-id={player.playerId}
                  data-eliminating={stage.eliminatingIds.includes(player.playerId) ? 'true' : undefined}
                  data-shielding={stage.shieldingIds.includes(player.playerId) ? 'true' : undefined}
                  onClick={() => {
                    if (isTargetable) setTargetId(player.playerId);
                  }}
                  onKeyDown={(event) => {
                    if (isTargetable && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setTargetId(player.playerId);
                    }
                  }}
                  role="button"
                  tabIndex={isTargetable ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-disabled={!isTargetable}
                >
                  <div className="ll-opponent-avatar stage-chip" data-active={isCurrent ? 'true' : undefined} data-out={isOut ? 'true' : undefined}>
                    <UserAvatar
                      avatar={resolveMemberAvatar(members.find((m) => m.playerId === player.playerId), { playerId: player.playerId })}
                      nickname={name}
                      size={34}
                      className="ll-opponent-face"
                    />
                    <div className="ll-opponent-meta">
                      <span className="ll-opponent-name">{name}</span>
                      <span className="ll-opponent-status">
                        {isOut ? '— 已出局' : isCurrent ? '● 执笔中' : isProtected ? '◆ 侍女庇护' : `· 手牌 ${player.handCount}`}
                      </span>
                      <div className="ll-opponent-affection" aria-label={`${points} 点好感`}>
                        {Array.from({ length: view.affectionTarget }, (_, i) => (
                          <WaxSeal key={i} lit={i < points} size="sm" />
                        ))}
                      </div>
                    </div>
                    {isProtected && <span className="ll-ward" title="侍女庇护中" aria-hidden="true" />}
                  </div>

                  <div className="ll-opponent-hand" aria-label={`手牌 ${player.handCount} 张`}>
                    {Array.from({ length: player.handCount }, (_, i) => (
                      <div key={i} className="ll-card-back" />
                    ))}
                  </div>

                  {/* 对手本轮已打出的弃牌：角色插画缩略，和我手里的信是同一套画 */}
                  {(player.discarded ?? []).length > 0 && (
                    <div className="ll-opponent-discards" title={`${name} 本轮已出牌`}>
                      {(player.discarded ?? []).map((card, idx) => (
                        <button
                          type="button"
                          key={`${card.id}-${idx}`}
                          className="ll-discard-thumb"
                          style={{ ['--i' as string]: idx }}
                          onMouseEnter={() => setHoveredRole(card.role)}
                          onMouseLeave={() => setHoveredRole(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(card.role, e.currentTarget);
                          }}
                          aria-label={`${ROLE_LABELS[card.role]}（${card.value} 点），点击查看技能`}
                        >
                          <img src={`/assets/loveletter/${card.role}.png`} alt="" />
                          <span className="ll-discard-thumb__val">{card.value}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showRolePicker && (
                    <div className="ll-role-picker" onClick={(e) => e.stopPropagation()}>
                      <h4>猜测对手手牌身份</h4>
                      <div className="ll-role-grid">
                        {LOVELETTER_ROLES.filter((role) => role !== 'guard').map((role) => (
                          <button
                            key={role}
                            type="button"
                            className={`ll-role-btn ${guessedRole === role ? 'is-active' : ''}`}
                            onClick={() => setGuessedRole(role)}
                            onMouseEnter={() => setHoveredRole(role)}
                            onMouseLeave={() => setHoveredRole(null)}
                          >
                            <img src={`/assets/loveletter/${role}.png`} alt="" className="ll-role-thumb" />
                            <span>{ROLE_LABELS[role]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 宫廷桌面：牌库 | 弃牌堆 | 蜡封进度板 */}
          <div className="loveletter-center-area ll-court stage-felt-3d__plane">
            <div className="ll-court__piles">
              <DeckPile count={view.deckCount} />
              <DiscardPile
                last={lastForPile}
                total={discardTotal}
                onInspect={(card, target) => openDetail(card.role, target)}
              />
              {(view.removedCount ?? 0) > 0 && (
                <div className="ll-removed-zone" aria-label={`暗置移除 ${view.removedCount} 张，牌面不公开`}>
                  {Array.from({ length: view.removedCount }, (_, index) => (
                    <div key={`removed-${index}`} className="ll-court-card ll-court-card--back ll-court-card--removed" />
                  ))}
                  <span className="stage-eyebrow">Set aside</span>
                </div>
              )}
            </div>
            <AffectionLedger rows={ledgerRows} target={view.affectionTarget} round={view.round} />
          </div>

          {me && (
            <div className={`loveletter-my-area ${isPrince && needsTargetChoice ? 'can-target-self' : ''}`}>
              <div className="loveletter-my-hand" data-stage-anchor="hand">
                {(me.hand ?? []).map((card, handIndex) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`ll-envelope loveletter-card loveletter-card--${card.role} ${selectedCardId === card.id ? 'is-selected' : ''}`}
                    style={{ ['--i' as string]: handIndex }}
                    onClick={() => { setSelectedCardId(card.id); setTargetId(null); setGuessedRole(null); }}
                    onMouseEnter={() => setHoveredRole(card.role)}
                    onMouseLeave={() => setHoveredRole(null)}
                    onTouchStart={(event) => handleTouchStart(card.role, event.currentTarget)}
                    onTouchEnd={handleTouchEnd}
                    aria-pressed={selectedCardId === card.id}
                  >
                    {/* 自后向前：敞开的翻盖 → 露出的信纸（角色插画） → 信封正面口袋 → 蜡封 */}
                    <span className="ll-envelope__flap" aria-hidden="true" />
                    <span className="ll-envelope__letter" aria-hidden="true">
                      <img src={`/assets/loveletter/${card.role}.png`} alt="" className="loveletter-card__img" />
                    </span>
                    <span className="ll-envelope__pocket">
                      <strong className="ll-envelope__name">{ROLE_LABELS[card.role]}</strong>
                    </span>
                    <span className="ll-envelope__seal stage-numeral" aria-label={`点数 ${card.value}`}>{card.value}</span>
                    <span
                      className="ll-envelope__info"
                      title="点击查看技能详情"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(card.role, e.currentTarget.closest('button'));
                      }}
                    >
                      ?
                    </span>
                  </button>
                ))}
              </div>

              {isPrince && needsTargetChoice && targetOptions.includes(myId!) && (
                <button
                  type="button"
                  className={`ll-target-self-btn ${targetId === myId ? 'is-selected' : ''}`}
                  onClick={() => setTargetId(myId!)}
                >
                  王子对自己使用（重摸）
                </button>
              )}
            </div>
          )}

          {/* 悬浮技能即时预览卡片 (Hover Preview Card) */}
          {hoveredRole && !detailRole && (
            <div className="ll-hover-ability-popover" aria-hidden="true">
              <div className="ll-hover-ability-popover__header">
                <span className="ll-hover-ability-popover__badge stage-numeral">{ROLE_ABILITIES[hoveredRole].value}</span>
                <strong>{ROLE_ABILITIES[hoveredRole].name}</strong>
                <span className="ll-hover-ability-popover__count">全局 {ROLE_ABILITIES[hoveredRole].totalCount} 张</span>
              </div>
              <p className="ll-hover-ability-popover__desc">{ROLE_ABILITIES[hoveredRole].description}</p>
              <span className="ll-hover-ability-popover__tip">技巧：{ROLE_ABILITIES[hoveredRole].tips}</span>
            </div>
          )}

          {/* 本步操作战报 */}
          {feed.length > 0 && (
            <div className="ll-feed" aria-live="polite">
              {feed.map((item) => (
                <div key={item.id} className={`ll-feed__item ll-feed__item--${item.kind}`}>{item.text}</div>
              ))}
            </div>
          )}

          {/* 轮次结算横幅 */}
          {roundBanner && (
            <div
              className={`ll-round-banner ${myId && roundBanner.winnerIds.includes(myId) ? 'is-me-win' : myId ? 'is-me-lose' : ''}`}
              aria-live="assertive"
            >
              <div className="ll-round-banner__card">
                <span className="stage-eyebrow ll-round-banner__round">Round {roundBanner.round} · 第 {roundBanner.round} 轮结束</span>
                <span className="stage-title ll-round-banner__title">
                  {myId && roundBanner.winnerIds.includes(myId)
                    ? '你赢下本轮！'
                    : `${roundBanner.winnerIds.map((id) => nameFor(members, id)).join('、')} 获胜`}
                </span>
                <span className="ll-round-banner__reason">
                  {roundBanner.reason === 'last-standing' ? '对手出局 · 最后存活' : '牌库耗尽 · 手牌点数最高'} · 蜡封 +1
                </span>
                <span className="ll-round-banner__progress">
                  {roundBanner.winnerIds
                    .map((id) => `${nameFor(members, id)} ${roundBanner.affection[id] ?? 0}/${roundBanner.affectionTarget}`)
                    .join(' · ')}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="sg-stage">
          <div className="winner-hero loveletter-over">
            <span className="winner-rays" aria-hidden="true" />
            <h2 className="winner-title">情书送达</h2>
            <p>获胜：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}</p>
            {finalSummary && (
              <p className="ll-over-note">
                最终轮：{finalSummary.winnerIds.map((id) => nameFor(members, id)).join('、')}
                {finalSummary.reason === 'last-standing' ? ' 最后存活' : ' 手牌点数最高'}
                {' · '}好感 {finalSummary.affection[finalSummary.winnerIds[0]!] ?? 0}/{finalSummary.affectionTarget}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 三套弹窗统一走 GameDrawer：同一套焦点陷阱、Esc 关闭、遮罩点击关闭，
          主题由 .ll-dialog 挂在遮罩层上统一着色。 */}
      {trackerOpen && (
        <GameDrawer kind="log" title="记牌器与出牌记录" className="ll-dialog" triggerRef={trackerRef} onClose={() => setTrackerOpen(false)}>
          <div className="ll-tracker-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTrackerTab === 'tracker'}
              className={`ll-tracker-tab ${activeTrackerTab === 'tracker' ? 'is-active' : ''}`}
              onClick={() => setActiveTrackerTab('tracker')}
            >
              牌池统计（16 张）
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTrackerTab === 'history'}
              className={`ll-tracker-tab ${activeTrackerTab === 'history' ? 'is-active' : ''}`}
              onClick={() => setActiveTrackerTab('history')}
            >
              出牌记录（{roundHistory.length + 1} 轮）
            </button>
          </div>

          {activeTrackerTab === 'tracker' ? (
            <div className="ll-tracker-table__rows">
              {trackerStats.map((item) => (
                <button
                  type="button"
                  key={item.role}
                  className={`ll-tracker-row ${item.isExhausted ? 'is-exhausted' : ''}`}
                  onClick={() => {
                    setTrackerOpen(false);
                    openDetail(item.role, trackerRef.current);
                  }}
                >
                  <span className="ll-tracker-row__val stage-numeral">{item.meta.value}</span>
                  <img src={`/assets/loveletter/${item.role}.png`} alt="" className="ll-tracker-row__thumb" />
                  <span className="ll-tracker-row__name">
                    <strong>{ROLE_LABELS[item.role]}</strong>
                    <small>{item.meta.badge}</small>
                  </span>
                  <span className="ll-tracker-row__known">
                    <span className="ll-tracker-row__bar" aria-hidden="true">
                      <span className="ll-tracker-row__bar-fill" style={{ width: `${(item.knownTotal / item.totalCount) * 100}%` }} />
                    </span>
                    <span className="ll-tracker-row__who">
                      {Object.entries(item.playerDiscards).map(([pid, count]) => (
                        <span key={pid} className="ll-tracker-player-tag">
                          {pid === myId ? '你' : nameFor(members, pid)} ×{count}
                        </span>
                      ))}
                      {item.myCount > 0 && <span className="ll-tracker-player-tag is-hand">手牌 ×{item.myCount}</span>}
                    </span>
                  </span>
                  <span className={`ll-tracker-row__remain ${item.remainingUnknown === 0 ? 'is-zero' : ''}`}>
                    {item.remainingUnknown === 0 ? (
                      '已打光'
                    ) : (
                      <>
                        <span className="stage-numeral">{item.remainingUnknown}</span>
                        <small>/{item.totalCount}</small>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ll-history-rounds-list">
              <div className="ll-history-round-card is-current">
                <div className="ll-history-round-card__header">
                  <strong>第 {view.round} 轮</strong>
                  <span className="ll-history-round-badge">进行中</span>
                </div>
                {view.players.map((p) => (
                  <div key={p.playerId} className="ll-history-player-line">
                    <span className="ll-history-player-name">{p.playerId === myId ? '你' : nameFor(members, p.playerId)}</span>
                    {(p.discarded ?? []).length === 0 ? (
                      <span className="ll-history-empty">暂未出牌</span>
                    ) : (
                      <span className="ll-history-cards-flow">
                        {(p.discarded ?? []).map((card, i) => (
                          <span key={i} className="ll-history-card-tag">{card.value} {ROLE_LABELS[card.role]}</span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {roundHistory.length === 0 ? (
                <p className="sg-hint">每轮结束后，这一轮的出牌会沉淀在这里。</p>
              ) : (
                roundHistory.slice().reverse().map((roundItem) => (
                  <div key={roundItem.round} className="ll-history-round-card">
                    <div className="ll-history-round-card__header">
                      <strong>第 {roundItem.round} 轮</strong>
                      <span className="ll-history-round-winner">
                        获胜：{roundItem.winnerIds.map((id) => nameFor(members, id)).join('、')}
                      </span>
                    </div>
                    {roundItem.discards.map((p) => (
                      <div key={p.playerId} className="ll-history-player-line">
                        <span className="ll-history-player-name">{p.playerId === myId ? '你' : nameFor(members, p.playerId)}</span>
                        <span className="ll-history-cards-flow">
                          {p.cards.map((card, i) => (
                            <span key={i} className="ll-history-card-tag">{card.value} {ROLE_LABELS[card.role]}</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </GameDrawer>
      )}

      {detailRole && (
        <GameDrawer
          kind="rules"
          title={ROLE_LABELS[detailRole]}
          className="ll-dialog"
          triggerRef={detailTriggerRef}
          onClose={() => setDetailRole(null)}
        >
          <div className="ll-ability-detail-banner">
            <img src={`/assets/loveletter/${detailRole}.png`} alt="" className="ll-ability-detail-img" />
            <div className="ll-ability-detail-meta">
              <span className="stage-eyebrow">Value</span>
              <span className="stage-numeral ll-ability-detail-value">{ROLE_ABILITIES[detailRole].value}</span>
              <span className="ll-ability-detail-tag">牌库共 {ROLE_ABILITIES[detailRole].totalCount} 张 · {ROLE_ABILITIES[detailRole].badge}</span>
            </div>
          </div>
          <div className="ll-ability-detail-section">
            <span className="stage-eyebrow">Ability · 技能</span>
            <p>{ROLE_ABILITIES[detailRole].description}</p>
          </div>
          <div className="ll-ability-detail-section">
            <span className="stage-eyebrow">Tactics · 实战提示</span>
            <p>{ROLE_ABILITIES[detailRole].tips}</p>
          </div>
        </GameDrawer>
      )}

      {historyOpen && me && (
        <GameDrawer kind="private" title="查验记录（仅你可见）" className="ll-dialog" triggerRef={historyRef} onClose={() => setHistoryOpen(false)}>
          <ul className="ll-inspection-list">
            {inspections.map((inspection, index) => (
              <li key={index}>
                <img src={`/assets/loveletter/${inspection.role}.png`} alt="" />
                <span>
                  <span className="stage-eyebrow">Round {inspection.round}</span>
                  <strong>{nameFor(members, inspection.targetPlayerId)}</strong> 手里是「{ROLE_LABELS[inspection.role]}」
                </span>
              </li>
            ))}
          </ul>
        </GameDrawer>
      )}

      {/* 飞行层必须挂在毡面之外：毡面是 perspective 容器，
          一旦有 transform 祖先，position:fixed 会退化为相对定位。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={myId && (view.winners ?? []).includes(myId) ? '你赢得了公主的芳心！' : '情书送达'}
        sublabel={`获胜：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`}
      />
    </TabletopShell>
  );
}
