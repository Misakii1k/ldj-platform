/**
 * loveletter_classic16_v1 客户端主页面（D7-C，TabletopShell 消费方）。
 * 只消费严格解析后的情书视角（loveletter/types.ts parseLoveLetterView）。
 * 手牌只属于本人：观战视角不含手牌，页面仅在 me 存在时渲染手牌区。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
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
  const protectedIds = new Set(view.protectedPlayers);
  const eliminatedIds = new Set(view.eliminatedPlayers);
  // 目标合法性：守卫/牧师/男爵/国王只能选其他存活且未被侍女庇护的玩家；王子可选自己或他人。
  const targetOptions = selectedCard === null
    ? []
    : isPrince
      ? [myId!, ...view.players
          .filter((player) => player.playerId !== myId && !eliminatedIds.has(player.playerId) && !protectedIds.has(player.playerId))
          .map((player) => player.playerId)]
      : view.players
          .filter((player) => player.playerId !== myId && !eliminatedIds.has(player.playerId) && !protectedIds.has(player.playerId))
          .map((player) => player.playerId);
  // 目标合法性：守卫/牧师/男爵/国王无合法目标时可无目标打出；王子可选自己。
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
    status: `${player.handCount} 张${view.protectedPlayers.includes(player.playerId) ? ' · 侍女庇护' : ''}`,
    active: player.playerId === view.currentPlayerId,
    eliminated: view.eliminatedPlayers.includes(player.playerId),
  }));

  const canPlayDisabled = !canPlay;

  return (
    <TabletopShell
      title="情书：密函心意"
      phase={view.phase === 'game_over' ? '对局结束' : `第 ${view.round} 轮`}
      spectator={isSpectator}
      players={players}
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
      <header className="loveletter-page__bar">
        <GameLeaveButton />
        <button ref={rulesRef} type="button" className="loveletter-page__rules" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      </header>

      {error && <p className="game-error" role="alert">{error}</p>}

      <section className="loveletter-afc" aria-label="好感进度">
        <span className="loveletter-afc__label">好感目标 {view.affectionTarget}</span>
        <div className="loveletter-afc__rows">
          {view.players.map((player) => (
            <div key={player.playerId} className={`loveletter-afc__row ${view.eliminatedPlayers.includes(player.playerId) ? 'is-out' : ''}`}>
              <strong>{nameFor(members, player.playerId)}</strong>
              <span>{view.affection[player.playerId] ?? 0} / {view.affectionTarget}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="loveletter-table" aria-label="桌面牌区">
        <div className="loveletter-table__pile">
          <span className="loveletter-table__label">牌库剩余</span>
          <strong>{view.deckCount}</strong>
        </div>
        <div className="loveletter-table__pile">
          <span className="loveletter-table__label">本轮移除</span>
          <div className="loveletter-table__removed">
            {view.removedCards.map((card) => (
              <span key={card.id} className="loveletter-mini-card">{ROLE_LABELS[card.role]}</span>
            ))}
          </div>
        </div>
      </section>

      {me && (
        <>
          <section className="loveletter-hand" aria-label="我的手牌">
            <span className="loveletter-hand__label">你的手牌{myTurn ? ' · 轮到你' : ''}</span>
            <div className="loveletter-hand__cards">
              {me.hand.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`loveletter-card loveletter-card--${card.role} ${selectedCardId === card.id ? 'is-selected' : ''}`}
                  onClick={() => { setSelectedCardId(card.id); setTargetId(null); setGuessedRole(null); }}
                  aria-pressed={selectedCardId === card.id}
                >
                  <span className="loveletter-card__value">{card.value}</span>
                  <strong>{ROLE_LABELS[card.role]}</strong>
                </button>
              ))}
            </div>
          </section>

          {selectedCard && needsTargetChoice && (
            <section className="loveletter-target" aria-label="选择目标">
              <span className="loveletter-hand__label">选择目标玩家{isPrince ? '（可选自己）' : ''}</span>
              <div className="loveletter-target__options">
                {targetOptions.map((playerId) => (
                  <button
                    key={playerId}
                    type="button"
                    className={targetId === playerId ? 'is-selected' : ''}
                    onClick={() => setTargetId(playerId)}
                    aria-pressed={targetId === playerId}
                  >
                    {playerId === myId ? '自己' : nameFor(members, playerId)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {selectedCard && isGuard && needsTargetChoice && (
            <section className="loveletter-guess" aria-label="猜测身份">
              <span className="loveletter-hand__label">猜测目标身份（守卫不能猜守卫）</span>
              <div className="loveletter-target__options">
                {LOVELETTER_ROLES.filter((role) => role !== 'guard').map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={guessedRole === role ? 'is-selected' : ''}
                    onClick={() => setGuessedRole(role)}
                    aria-pressed={guessedRole === role}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </section>
          )}

          {me.inspections.length > 0 && (
            <section className="loveletter-inspect" aria-label="我的查验记录">
              <span className="loveletter-hand__label">查验记录（仅你可见）</span>
              <ul>
                {me.inspections.map((inspection, index) => (
                  <li key={index}>
                    第 {inspection.round} 轮 · {nameFor(members, inspection.targetPlayerId)} 是 {ROLE_LABELS[inspection.role]}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {view.phase === 'game_over' && (
        <section className="loveletter-over" aria-label="对局结果">
          <h2>情书送达</h2>
          <p>获胜：{view.winners.map((id) => nameFor(members, id)).join('、')}</p>
        </section>
      )}
    </TabletopShell>
  );
}
