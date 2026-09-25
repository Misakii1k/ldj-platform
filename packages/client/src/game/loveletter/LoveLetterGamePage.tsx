/**
 * loveletter_classic16_v1 客户端主页面（TabletopShell 消费方）。
 * 只消费严格解析后的情书视角（loveletter/types.ts parseLoveLetterView）。
 * 手牌只属于本人：观战视角不含手牌，页面仅在 me 存在时渲染手牌区。
 * 视觉：信笺宫廷主题——信封手牌、蜡封徽章、移除堆、好感红心进度、实时记牌器与卡牌技能悬浮。
 *
 * U08 演出层（stage/）：书信桌 3D 毡面、出牌时信封飞向中央、淘汰翻手牌、
 * 侍女庇护盾牌亮起。这款**没有服务端 timer**（纯回合制），故不上倒计时环。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { useLoveLetterStage } from './stage/useLoveLetterStage.tsx';
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

  function handleTouchStart(role: LoveLetterRole) {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setDetailRole(role);
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
          <button
            type="button"
            className={`tabletop-rules-btn ll-tracker-toggle-btn ${trackerOpen ? 'is-active' : ''}`}
            onClick={() => setTrackerOpen(!trackerOpen)}
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
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
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
          <div className="loveletter-opponents">
            {view.players.filter((p) => p.playerId !== myId).map((player, opponentIndex) => {
              const isTargetable = targetOptions.includes(player.playerId);
              const isSelected = targetId === player.playerId;
              const isOut = (view.eliminatedPlayers ?? []).includes(player.playerId);
              const isProtected = protectedIds.has(player.playerId);
              const points = (view.affection ?? {})[player.playerId] ?? 0;
              const showRolePicker = isSelected && isGuard && needsTargetChoice;

              return (
                <div
                  key={player.playerId}
                  className={`ll-opponent ${isOut ? 'is-out' : ''} ${isProtected ? 'is-protected' : ''} ${isTargetable ? 'is-targetable' : ''} ${isSelected ? 'is-selected' : ''} ${view.phase === 'playing' && player.playerId === view.currentPlayerId ? 'is-current-turn' : ''}`}
                  style={{ ['--i' as string]: opponentIndex }}
                  // 飞行层按 data-player-id 定位对手手边，作为出牌与淘汰演出的起终点
                  data-player-id={player.playerId}
                  data-eliminating={stage.eliminatingIds.includes(player.playerId) ? 'true' : undefined}
                  data-shielding={stage.shieldingIds.includes(player.playerId) ? 'true' : undefined}
                  onClick={() => {
                    if (isTargetable) setTargetId(player.playerId);
                  }}
                  role="button"
                  tabIndex={isTargetable ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-disabled={!isTargetable}
                >
                  <div className="ll-opponent-avatar">
                    <span className="ll-opponent-name">{nameFor(members, player.playerId)}</span>
                    <div className="ll-opponent-affection" aria-label={`${points} 点好感`}>
                      {Array.from({ length: view.affectionTarget }, (_, i) => (
                        <i key={i} className={`ll-token-heart ${i < points ? 'is-lit' : ''}`} aria-hidden="true" />
                      ))}
                    </div>
                    {isProtected && <span className="ll-shield-icon" title="侍女庇护中">🛡️</span>}
                  </div>

                  <div className="ll-opponent-hand">
                    {Array.from({ length: player.handCount }, (_, i) => (
                      <div key={i} className="ll-card-back" />
                    ))}
                  </div>

                  {/* 对手本轮已打出的弃牌 */}
                  {(player.discarded ?? []).length > 0 && (
                    <div className="ll-opponent-discards" title={`${nameFor(members, player.playerId)} 本轮已出牌`}>
                      {(player.discarded ?? []).map((card, idx) => (
                        <div
                          key={`${card.id}-${idx}`}
                          className="ll-discard-pill"
                          onMouseEnter={() => setHoveredRole(card.role)}
                          onMouseLeave={() => setHoveredRole(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailRole(card.role);
                          }}
                        >
                          <span className="ll-discard-pill__val">{card.value}</span>
                          <span className="ll-discard-pill__name">{ROLE_LABELS[card.role]}</span>
                        </div>
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

          <div className="loveletter-center-area stage-felt-3d__plane" data-stage-anchor="discard">
            <div className="ll-deck-zone" data-stage-anchor="deck">
              <div className="ll-deck-stack" aria-label={`牌库剩余 ${view.deckCount} 张`}>
                <div className="ll-card-back shadow" />
                <div className="ll-card-back top" />
              </div>
            </div>
            {(view.removedCount ?? 0) > 0 && (
              <div className="ll-removed-zone">
                <span className="ll-zone-label">移除弃牌（不公开）</span>
                <div className="ll-removed-cards">
                  {Array.from({ length: view.removedCount }, (_, index) => (
                    <div key={`removed-${index}`} className="ll-mini-card ll-mini-card--hidden" aria-label="暗置移除的牌">
                      <div className="ll-card-back ll-mini-thumb" />
                      <span>暗置</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {me && (
            <div className={`loveletter-my-area ${isPrince && needsTargetChoice ? 'can-target-self' : ''}`}>
              <div className="loveletter-my-hand" data-stage-anchor="hand">
                {(me.hand ?? []).map((card, handIndex) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`env-card loveletter-card loveletter-card--${card.role} ${selectedCardId === card.id ? 'is-selected' : ''}`}
                    style={{ ['--i' as string]: handIndex }}
                    onClick={() => { setSelectedCardId(card.id); setTargetId(null); setGuessedRole(null); }}
                    onMouseEnter={() => setHoveredRole(card.role)}
                    onMouseLeave={() => setHoveredRole(null)}
                    onTouchStart={() => handleTouchStart(card.role)}
                    onTouchEnd={handleTouchEnd}
                    aria-pressed={selectedCardId === card.id}
                  >
                    <span className="loveletter-card__corner-value" aria-label={`点数 ${card.value}`}>{card.value}</span>
                    <div
                      className="ll-card-info-badge"
                      title="点击查看技能详情"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailRole(card.role);
                      }}
                    >
                      ℹ️
                    </div>
                    <div className="loveletter-card__art">
                      <img src={`/assets/loveletter/${card.role}.png`} alt={ROLE_LABELS[card.role]} className="loveletter-card__img" />
                    </div>
                    <div className="loveletter-card__info">
                      <span className="env-card__seal" aria-hidden="true"><i /></span>
                      <strong>{ROLE_LABELS[card.role]}</strong>
                    </div>
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
                <span className="ll-hover-ability-popover__badge">{ROLE_ABILITIES[hoveredRole].value} 点</span>
                <strong>{ROLE_ABILITIES[hoveredRole].name}</strong>
                <span className="ll-hover-ability-popover__count">全剧 {ROLE_ABILITIES[hoveredRole].totalCount} 张</span>
              </div>
              <p className="ll-hover-ability-popover__desc">{ROLE_ABILITIES[hoveredRole].description}</p>
              <span className="ll-hover-ability-popover__tip">技巧：{ROLE_ABILITIES[hoveredRole].tips}</span>
            </div>
          )}

          {/* 查验记录抽屉 */}
          {me && (me.inspections ?? []).length > 0 && (
            <div className={`ll-history-notebook ${historyOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="ll-history-toggle"
                onClick={() => setHistoryOpen(!historyOpen)}
                aria-expanded={historyOpen}
              >
                <span>查验</span>
                <span>记录</span>
              </button>
              {historyOpen && (
                <div className="ll-history-drawer">
                  <h4>查验记录（仅你可见）</h4>
                  <ul>
                    {(me.inspections ?? []).map((inspection, index) => (
                      <li key={index}>
                        第 {inspection.round} 轮 · <strong>{nameFor(members, inspection.targetPlayerId)}</strong> 是 <span>{ROLE_LABELS[inspection.role]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 牌库剩余张数：置于棋盘右上角暗区 */}
          <div
            className={`ll-deck-corner ${view.deckCount <= 3 ? 'is-low' : ''}`}
            aria-label={`牌库剩余 ${view.deckCount} 张`}
          >
            <span className="ll-deck-corner__num" key={view.deckCount}>{view.deckCount}</span>
            <span className="ll-deck-corner__label">牌库</span>
          </div>

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
                <span className="ll-round-banner__round">第 {roundBanner.round} 轮结束</span>
                <span className="ll-round-banner__title">
                  {myId && roundBanner.winnerIds.includes(myId)
                    ? '你赢下本轮！'
                    : `${roundBanner.winnerIds.map((id) => nameFor(members, id)).join('、')} 获胜`}
                </span>
                <span className="ll-round-banner__reason">
                  {roundBanner.reason === 'last-standing' ? '对手出局 · 最后存活' : '牌库耗尽 · 手牌点数最高'} · 好感 +1
                </span>
                <span className="ll-round-banner__progress">
                  {roundBanner.winnerIds
                    .map((id) => `${nameFor(members, id)} ${roundBanner.affection[id] ?? 0}/${roundBanner.affectionTarget}`)
                    .join(' · ')}
                </span>
              </div>
            </div>
          )}

          {/* 实时记牌器与出牌历史抽屉面板 (Card Tracker Modal / Drawer) */}
          {trackerOpen && (
            <div className="ll-tracker-backdrop" onClick={() => setTrackerOpen(false)}>
              <div className="ll-tracker-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ll-tracker-modal__head">
                  <div className="ll-tracker-modal__title">
                    <h3>情书实时记牌器 &amp; 出牌记录</h3>
                  </div>
                  <button type="button" className="ll-tracker-modal__close" onClick={() => setTrackerOpen(false)}>✕</button>
                </div>

                <div className="ll-tracker-tabs">
                  <button
                    type="button"
                    className={`ll-tracker-tab ${activeTrackerTab === 'tracker' ? 'is-active' : ''}`}
                    onClick={() => setActiveTrackerTab('tracker')}
                  >
                    牌池实时统计（16张）
                  </button>
                  <button
                    type="button"
                    className={`ll-tracker-tab ${activeTrackerTab === 'history' ? 'is-active' : ''}`}
                    onClick={() => setActiveTrackerTab('history')}
                  >
                    历史出牌记录（{roundHistory.length + 1} 轮）
                  </button>
                </div>

                <div className="ll-tracker-content">
                  {activeTrackerTab === 'tracker' ? (
                    <div className="ll-tracker-table">
                      <div className="ll-tracker-table__header">
                        <span>卡牌与点数</span>
                        <span>总数</span>
                        <span>已明示 (弃/手/除)</span>
                        <span>未知剩余</span>
                        <span>出牌详情</span>
                      </div>
                      <div className="ll-tracker-table__rows">
                        {trackerStats.map((item) => (
                          <div
                            key={item.role}
                            className={`ll-tracker-row ${item.isExhausted ? 'is-exhausted' : ''}`}
                            onClick={() => setDetailRole(item.role)}
                          >
                            <div className="ll-tracker-row__name">
                              <span className="ll-tracker-row__val">{item.meta.value}</span>
                              <img src={`/assets/loveletter/${item.role}.png`} alt="" className="ll-tracker-row__thumb" />
                              <div>
                                <strong>{ROLE_LABELS[item.role]}</strong>
                                <small>{item.meta.badge}</small>
                              </div>
                            </div>
                            <span className="ll-tracker-row__total">{item.totalCount} 张</span>
                            <div className="ll-tracker-row__known">
                              <span className="ll-tracker-row__known-num">{item.knownTotal} 张</span>
                              <div className="ll-tracker-row__bar">
                                <div
                                  className="ll-tracker-row__bar-fill"
                                  style={{ width: `${(item.knownTotal / item.totalCount) * 100}%` }}
                                />
                              </div>
                            </div>
                            <span className={`ll-tracker-row__remain ${item.remainingUnknown === 0 ? 'is-zero' : ''}`}>
                              {item.remainingUnknown === 0 ? '已打光 ✓' : `${item.remainingUnknown} 张`}
                            </span>
                            <div className="ll-tracker-row__who">
                              {Object.entries(item.playerDiscards).map(([pid, count]) => (
                                <span key={pid} className="ll-tracker-player-tag">
                                  {pid === myId ? '你' : nameFor(members, pid)}: {count}
                                </span>
                              ))}
                              {item.removedCount > 0 && <span className="ll-tracker-player-tag is-removed">移除: {item.removedCount}</span>}
                              {item.myCount > 0 && <span className="ll-tracker-player-tag is-hand">手牌: {item.myCount}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="ll-history-rounds-list">
                      {/* 当前轮出牌记录 */}
                      <div className="ll-history-round-card is-current">
                        <div className="ll-history-round-card__header">
                          <strong>第 {view.round} 轮（当前进行中）</strong>
                          <span className="ll-history-round-badge">进行中</span>
                        </div>
                        <div className="ll-history-round-card__discards">
                          {view.players.map((p) => (
                            <div key={p.playerId} className="ll-history-player-line">
                              <span className="ll-history-player-name">{nameFor(members, p.playerId)}:</span>
                              {(p.discarded ?? []).length === 0 ? (
                                <span className="ll-history-empty">暂未出牌</span>
                              ) : (
                                <div className="ll-history-cards-flow">
                                  {(p.discarded ?? []).map((card, i) => (
                                    <span key={i} className="ll-history-card-tag" onClick={() => setDetailRole(card.role)}>
                                      {card.value} {ROLE_LABELS[card.role]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 往期各轮完整记录 */}
                      {roundHistory.length === 0 ? (
                        <p className="sg-hint">暂无往轮记录，每轮对局结束后历史将自动沉淀于此。</p>
                      ) : (
                        roundHistory.slice().reverse().map((roundItem) => (
                          <div key={roundItem.round} className="ll-history-round-card">
                            <div className="ll-history-round-card__header">
                              <strong>第 {roundItem.round} 轮</strong>
                              <span className="ll-history-round-winner">
                                获胜：{roundItem.winnerIds.map((id) => nameFor(members, id)).join('、')}
                              </span>
                            </div>
                            <div className="ll-history-round-card__discards">
                              {roundItem.discards.map((p) => (
                                <div key={p.playerId} className="ll-history-player-line">
                                  <span className="ll-history-player-name">{nameFor(members, p.playerId)}:</span>
                                  <div className="ll-history-cards-flow">
                                    {p.cards.map((card, i) => (
                                      <span key={i} className="ll-history-card-tag" onClick={() => setDetailRole(card.role)}>
                                        {card.value} {ROLE_LABELS[card.role]}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 卡牌能力详细弹窗 (Detail Ability Modal) */}
          {detailRole && (
            <div className="ll-ability-detail-backdrop" onClick={() => setDetailRole(null)}>
              <div className="ll-ability-detail-modal" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ll-ability-detail-close" onClick={() => setDetailRole(null)}>✕</button>
                <div className="ll-ability-detail-banner">
                  <img src={`/assets/loveletter/${detailRole}.png`} alt="" className="ll-ability-detail-img" />
                  <div className="ll-ability-detail-meta">
                    <span className="ll-ability-detail-value">{ROLE_ABILITIES[detailRole].value} 点</span>
                    <h3>{ROLE_ABILITIES[detailRole].name}</h3>
                    <span className="ll-ability-detail-tag">牌库共有 {ROLE_ABILITIES[detailRole].totalCount} 张 · {ROLE_ABILITIES[detailRole].badge}</span>
                  </div>
                </div>
                <div className="ll-ability-detail-body">
                  <div className="ll-ability-detail-section">
                    <h4>【角色技能】</h4>
                    <p>{ROLE_ABILITIES[detailRole].description}</p>
                  </div>
                  <div className="ll-ability-detail-section">
                    <h4>【实战战术提示】</h4>
                    <p>{ROLE_ABILITIES[detailRole].tips}</p>
                  </div>
                </div>
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

