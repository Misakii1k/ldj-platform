/**
 * loveletter_classic16_v1 客户端主页面（TabletopShell 消费方）。
 * 只消费严格解析后的情书视角（loveletter/types.ts parseLoveLetterView）。
 * 手牌只属于本人：观战视角不含手牌，页面仅在 me 存在时渲染手牌区。
 * 视觉：信笺宫廷主题——信封手牌、蜡封徽章、移除堆、好感红心进度。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { LOVELETTER_ROLES, type LoveLetterPlayerView, type LoveLetterRole } from './types.ts';

const ROLE_LABELS: Record<LoveLetterRole, string> = {
  guard: '守卫', priest: '牧师', baron: '男爵', handmaid: '侍女',
  prince: '王子', king: '国王', countess: '伯爵夫人', princess: '公主',
};

const NEEDS_TARGET: readonly LoveLetterRole[] = ['guard', 'priest', 'baron', 'prince', 'king'];

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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [guessedRole, setGuessedRole] = useState<LoveLetterRole | null>(null);

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
        <div className="sg-stage">
          <section className="sg-panel loveletter-afc" aria-label="好感进度">
            <div className="sg-panel__head">
              <h3>好感目标 · 先到 {view.affectionTarget} 红心者胜</h3>
              <span>牌库剩余 {view.deckCount} 张</span>
            </div>
            <div className="loveletter-afc__rows">
              {view.players.map((player) => {
                const points = (view.affection ?? {})[player.playerId] ?? 0;
                return (
                  <div key={player.playerId} className={`loveletter-afc__row ${(view.eliminatedPlayers ?? []).includes(player.playerId) ? 'is-out' : ''}`}>
                    <strong>{nameFor(members, player.playerId)}</strong>
                    <span className="loveletter-hearts" aria-label={`${points}/${view.affectionTarget} 红心`}>
                      {Array.from({ length: view.affectionTarget }, (_, i) => (
                        <i key={i} className={i < points ? 'is-lit' : ''} aria-hidden="true">♥</i>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="sg-panel loveletter-table" aria-label="本轮移除的牌">
            <div className="sg-panel__head">
              <h3>本轮移除</h3>
              <span>{(view.removedCards ?? []).length} 张</span>
            </div>
            <div className="loveletter-removed">
              {(view.removedCards ?? []).length > 0
                ? (view.removedCards ?? []).map((card) => (
                    <span key={card.id} className="loveletter-mini-card">{ROLE_LABELS[card.role]}</span>
                  ))
                : <span className="sg-hint">暂未被移除的牌</span>}
            </div>
          </section>

          {me && (
            <section className="sg-panel" aria-label="我的手牌">
              <div className="sg-panel__head">
                <h3>你的手牌{myTurn ? ' · 轮到你' : ''}</h3>
                <span>{(me.hand ?? []).length} 张</span>
              </div>
              <div className="loveletter-hand__cards">
                {(me.hand ?? []).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`env-card loveletter-card loveletter-card--${card.role} ${selectedCardId === card.id ? 'is-selected' : ''}`}
                    onClick={() => { setSelectedCardId(card.id); setTargetId(null); setGuessedRole(null); }}
                    aria-pressed={selectedCardId === card.id}
                  >
                    <span className="env-card__seal" aria-hidden="true"><i /></span>
                    <strong>{ROLE_LABELS[card.role]}</strong>
                    <span className="env-card__value loveletter-card__value">{card.value}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {me && selectedCard && needsTargetChoice && (
            <section className="sg-panel loveletter-target" aria-label="选择目标">
              <div className="sg-panel__head">
                <h3>选择目标玩家{isPrince ? '（可选自己）' : ''}</h3>
                <span>守卫不能猜守卫</span>
              </div>
              <div className="sg-chip-row">
                {targetOptions.map((playerId) => (
                  <button
                    key={playerId}
                    type="button"
                    className={`sg-chip sg-chip--btn ${targetId === playerId ? 'sg-chip--selected' : ''}`}
                    onClick={() => setTargetId(playerId)}
                    aria-pressed={targetId === playerId}
                  >
                    {playerId === myId ? '自己' : nameFor(members, playerId)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {me && selectedCard && isGuard && needsTargetChoice && (
            <section className="sg-panel loveletter-guess" aria-label="猜测身份">
              <div className="sg-panel__head">
                <h3>猜测目标身份</h3>
                <span>守卫规则</span>
              </div>
              <div className="sg-chip-row">
                {LOVELETTER_ROLES.filter((role) => role !== 'guard').map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={`sg-chip sg-chip--btn ${guessedRole === role ? 'sg-chip--selected' : ''}`}
                    onClick={() => setGuessedRole(role)}
                    aria-pressed={guessedRole === role}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {me && (me.inspections ?? []).length > 0 && (
            <section className="sg-panel loveletter-inspect" aria-label="我的查验记录">
              <div className="sg-panel__head">
                <h3>查验记录（仅你可见）</h3>
                <span>{(me.inspections ?? []).length} 条</span>
              </div>
              <ul className="sg-note-list">
                {(me.inspections ?? []).map((inspection, index) => (
                  <li key={index}>
                    第 {inspection.round} 轮 · {nameFor(members, inspection.targetPlayerId)} 是 {ROLE_LABELS[inspection.role]}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="sg-stage">
          <div className="winner-hero loveletter-over">
            <span className="winner-rays" aria-hidden="true" />
            <h2 className="winner-title">情书送达</h2>
            <p>获胜：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}</p>
          </div>
        </div>
      )}
    </TabletopShell>
  );
}
