/**
 * loveletter_classic16_v1 客户端主页面（TabletopShell 消费方）。
 * 只消费严格解析后的情书视角（loveletter/types.ts parseLoveLetterView）。
 * 手牌只属于本人：观战视角不含手牌，页面仅在 me 存在时渲染手牌区。
 * 视觉：信笺宫廷主题——信封手牌、蜡封徽章、移除堆、好感红心进度。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { LOVELETTER_ROLES, type LoveLetterPlayerView, type LoveLetterRole } from './types.ts';

const ROLE_LABELS: Record<LoveLetterRole, string> = {
  guard: '守卫', priest: '牧师', baron: '男爵', handmaid: '侍女',
  prince: '王子', king: '国王', countess: '伯爵夫人', princess: '公主',
};

const NEEDS_TARGET: readonly LoveLetterRole[] = ['guard', 'priest', 'baron', 'prince', 'king'];

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [guessedRole, setGuessedRole] = useState<LoveLetterRole | null>(null);
  const [feed, setFeed] = useState<LLFeedItem[]>([]);
  const [roundBanner, setRoundBanner] = useState<LLRoundSummary | null>(null);
  const [finalSummary, setFinalSummary] = useState<LLRoundSummary | null>(null);
  const prevViewRef = useRef<LoveLetterPlayerView | null>(null);
  const feedIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  // —— 视图差分战报：把每一步操作与本轮胜负翻译成玩家能看懂的反馈。
  // 服务端每次动作都会推全量视角，相邻两帧之间的差异即"刚发生了什么"。
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (!prev || prev.phase !== 'playing') return;

    const nameOf = (id: string) => (id === myId ? '你' : nameFor(members, id));

    // 回合边界：轮次号前进或进入终局。此时弃牌堆/淘汰表已重置，
    // 唯一可靠的结算信号是好感增加值——加了的 就是本轮胜者。
    if (view.round !== prev.round || view.phase === 'game_over') {
      const winnerIds = view.players
        .filter((p) => (view.affection[p.playerId] ?? 0) > (prev.affection[p.playerId] ?? 0))
        .map((p) => p.playerId);
      if (winnerIds.length === 0) return;
      // 结算前只剩 2 名存活且牌库不止 1 张：一次出牌最多淘汰 1 人，
      // 这种局面收轮必然是"对手出局、最后存活"；否则是牌库耗尽比点数。
      const prevAlive = prev.players.filter((p) => !prev.eliminatedPlayers.includes(p.playerId)).length;
      const summary: LLRoundSummary = {
        round: prev.round,
        winnerIds,
        reason: prevAlive === 2 && prev.deckCount > 1 ? 'last-standing' : 'deck-empty',
        affection: { ...view.affection },
        affectionTarget: view.affectionTarget,
      };
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

    // 出牌者 = 上一帧的当前玩家；其弃牌堆新增的第一张就是刚打出的牌
    const actorId = prev.currentPlayerId;
    if (actorId !== null) {
      const beforePile = prev.players.find((p) => p.playerId === actorId)?.discarded.length ?? 0;
      const afterPile = view.players.find((p) => p.playerId === actorId)?.discarded ?? [];
      if (afterPile.length > beforePile) {
        additions.push({ text: `${nameOf(actorId)} 打出「${ROLE_LABELS[afterPile[beforePile]!.role]}」`, kind: 'play' });
      }
    }

    // 非出牌者弃牌堆增长且未出局 → 王子弃牌效果（出局者的弃牌增长是淘汰清手，跳过）
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
      setFeed((current) => {
        const next = [...current];
        for (const addition of additions) {
          const id = ++feedIdRef.current;
          next.push({ id, ...addition });
          const timer = window.setTimeout(() => {
            setFeed((items) => items.filter((item) => item.id !== id));
          }, FEED_TTL_MS);
          timersRef.current.push(timer);
        }
        return next.slice(-4);
      });
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
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      )}
      actions={(
        <ActionDock
          primary={{ id: 'play', label: selectedCard ? `打出「${ROLE_LABELS[selectedCard.role]}」` : '打出所选牌', disabled: canPlayDisabled, onAction: () => void play() }}
          secondary={[{ id: 'clear', label: '重选', disabled: selectedCard === null, onAction: resetSelection }]}
          busy={busy}
          waitingReason={view.phase === 'game_over' ? undefined : myTurn ? '轮到你了，从手牌中选一张打出' : `${nameFor(members, view.currentPlayerId)} 正在出牌`}
        />
      )}
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>经典 16 张牌，摸 1 打 1。伯爵夫人在手且王子/国王在手时必须先打出伯爵夫人。</p>
          <p>弃掉公主即淘汰；牌库耗尽时先比手牌点数，再比弃牌区点数。</p>
          <p>先攒够好感阈值（{view.affectionTarget}）的玩家获胜：2 人 7、3 人 5、4 人 4。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className={`sg-stage loveletter-immersive-board ${needsTargetChoice ? 'is-selecting-target' : ''}`}>
          <div className="loveletter-opponents">
            {view.players.filter((p) => p.playerId !== myId).map((player) => {
              const isTargetable = targetOptions.includes(player.playerId);
              const isSelected = targetId === player.playerId;
              const isOut = (view.eliminatedPlayers ?? []).includes(player.playerId);
              const isProtected = protectedIds.has(player.playerId);
              const points = (view.affection ?? {})[player.playerId] ?? 0;
              const showRolePicker = isSelected && isGuard && needsTargetChoice;

              return (
                <div
                  key={player.playerId}
                  className={`ll-opponent ${isOut ? 'is-out' : ''} ${isProtected ? 'is-protected' : ''} ${isTargetable ? 'is-targetable' : ''} ${isSelected ? 'is-selected' : ''}`}
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

                  {showRolePicker && (
                    <div className="ll-role-picker" onClick={(e) => e.stopPropagation()}>
                      <h4>猜测身份</h4>
                      <div className="ll-role-grid">
                        {LOVELETTER_ROLES.filter((role) => role !== 'guard').map((role) => (
                          <button
                            key={role}
                            type="button"
                            className={`ll-role-btn ${guessedRole === role ? 'is-active' : ''}`}
                            onClick={() => setGuessedRole(role)}
                          >
                            <img src={`/assets/loveletter/${role}.jpg`} alt="" className="ll-role-thumb" />
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

          <div className="loveletter-center-area">
            <div className="ll-deck-zone">
              <div className="ll-deck-stack" aria-label={`牌库剩余 ${view.deckCount} 张`}>
                <div className="ll-card-back shadow" />
                <div className="ll-card-back top" />
              </div>
            </div>
            {(view.removedCards ?? []).length > 0 && (
              <div className="ll-removed-zone">
                <div className="ll-removed-cards">
                  {(view.removedCards ?? []).map((card) => (
                    <div key={card.id} className="ll-mini-card">
                      <img src={`/assets/loveletter/${card.role}.jpg`} alt="" className="ll-mini-thumb" />
                      <span>{ROLE_LABELS[card.role]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {me && (
            <div className={`loveletter-my-area ${isPrince && needsTargetChoice ? 'can-target-self' : ''}`}>
              <div className="loveletter-my-hand">
                {(me.hand ?? []).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`env-card loveletter-card loveletter-card--${card.role} ${selectedCardId === card.id ? 'is-selected' : ''}`}
                    onClick={() => { setSelectedCardId(card.id); setTargetId(null); setGuessedRole(null); }}
                    aria-pressed={selectedCardId === card.id}
                  >
                    <span className="loveletter-card__corner-value" aria-label={`点数 ${card.value}`}>{card.value}</span>
                    <div className="loveletter-card__art">
                      <img src={`/assets/loveletter/${card.role}.jpg`} alt={ROLE_LABELS[card.role]} className="loveletter-card__img" />
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
                  王子对自己使用
                </button>
              )}
            </div>
          )}

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

          {/* 轮次结算横幅：谁赢、怎么赢、好感进度 */}
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
    </TabletopShell>
  );
}

