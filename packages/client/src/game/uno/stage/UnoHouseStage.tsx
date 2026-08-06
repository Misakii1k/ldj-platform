/**
 * uno_platform_house_v1 主舞台（D4-U-UI）。
 * 只消费严格解析后的 house 视角（uno/types.ts parseUnoHouseView），
 * 能力位由服务端权威下发（me.capabilities），控件按能力启用，
 * 服务端仍做权威校验。手牌私有字段只在渲染本人时使用，绝不输出他人手牌。
 */
import { useState } from 'react';
import { useConnection } from '../../../connection/useConnection.ts';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { GameLeaveButton } from '../../GameLeaveButton.tsx';
import { nameFor, useGameAction, type MemberLike } from '../../useGameAction.ts';
import {
  UNO_COLORS,
  UNO_COLOR_NAMES,
  cardLabel,
  colorLabel,
  type UnoCard,
} from '../types.ts';

interface Props {
  view: import('../types.ts').UnoHousePlayerView;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'round_playing': return '回合进行中';
    case 'round_over': return '本局结束';
    case 'match_over': return '整场结束';
    default: return phase;
  }
}

function scoreTable(
  view: import('../types.ts').UnoHousePublicView,
  members: readonly MemberLike[],
): React.ReactNode {
  const { players, roundScores, cumulativeScores, matchRanking } = view;
  return (
    <section className="uno-house-scores" aria-label="比分">
      <h2>比分</h2>
      {roundScores.length > 0 && (
        <table className="uno-house-scores__table">
          <thead>
            <tr>
              <th scope="col">玩家</th>
              {roundScores.map((_, roundIndex) => (
                <th scope="col" key={roundIndex}>第 {roundIndex + 1} 局</th>
              ))}
              <th scope="col">累计</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.playerId}>
                <th scope="row">{nameFor(members, player.playerId)}</th>
                {roundScores.map((row, roundIndex) => (
                  <td key={roundIndex}>{row[players.findIndex((p) => p.playerId === player.playerId)] ?? '—'}</td>
                ))}
                <td>{cumulativeScores[players.findIndex((p) => p.playerId === player.playerId)] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {matchRanking && (
        <ol className="uno-house-scores__ranking" aria-label="最终排名">
          {matchRanking.map((entry) => (
            <li key={entry.playerId}>
              <span className="uno-house-scores__rank">第 {entry.rank} 名</span>
              <span>{nameFor(members, entry.playerId)}</span>
              <strong>{entry.total} 分</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function UnoHouseStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  const me = view.me;
  const isSpectator = me === null || me === undefined;
  const phase = view.phase;
  const turnCountdown = useCountdown(view.clockInfo.turnDeadlineAt);
  const windowCountdown = useCountdown(view.clockInfo.windowDeadlineAt);

  const caps = new Set(me?.capabilities ?? []);
  const inWindow = me?.activeWindow !== null && me?.activeWindow !== undefined;
  const canPlay = (cardId: string): boolean =>
    phase === 'round_playing'
    && me !== null
    && !inWindow
    && !busy
    && (me.playableCardIds.includes(cardId) || caps.has('canStackPenalty'));

  const cardColor = (card: UnoCard): string => ('color' in card ? card.color : 'wild');

  function play(card: UnoCard) {
    if (me === null || busy) return;
    if (inWindow && caps.has('canStackPenalty')) {
      if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
      else void act({ type: 'stack_penalty', cardId: card.id });
      return;
    }
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
  }

  function confirmWild(color: import('../types.ts').UnoColor) {
    if (wildCardId === null) return;
    if (inWindow && caps.has('canStackPenalty')) {
      void act({ type: 'stack_penalty', cardId: wildCardId, declaredColor: color });
    } else {
      void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
    }
    setWildCardId(null);
  }

  const title = view.mode === 'team' ? 'UNO 组队房规' : 'UNO 房规';
  const roundCopy = `第 ${view.round} / ${view.roundLimit} 局 · ${view.mode === 'team' ? '组队' : '个人'}模式`;
  const directionLabel = view.direction === -1 ? '逆时针' : '顺时针';

  return (
    <main className={`uno-house-stage phase-${phase}`}>
      <header className="uno-house-stage__header">
        <div className="uno-house-stage__copy">
          <span className="uno-house-stage__kicker">TABLE SESSION · UNO HOUSE</span>
          <h1>{title}</h1>
          <p>{roundCopy} · {phaseLabel(phase)}</p>
        </div>
        <GameLeaveButton />
      </header>

      {error && <p className="game-error uno-house-stage__error" role="alert">{error}</p>}

      {view.pendingPenalty && (
        <div className="uno-house-banner uno-house-banner--penalty" role="status">
          <strong>罚牌 {view.pendingPenalty.total} 张</strong>
          <span>
            由 {nameFor(members, view.pendingPenalty.responderId)} 承担
            {view.pendingPenalty.challengeable ? ' · 可质疑' : ''}
            {windowCountdown.expired ? '' : ` · ${windowCountdown.secondsLeft} 秒`}
          </span>
        </div>
      )}

      {view.unoRaceWindow && (
        <div className="uno-house-banner uno-house-banner--race" role="status">
          <strong>UNO 竞速窗口</strong>
          <span>
            有人未喊 UNO，可快速抓漏报（目标 {nameFor(members, view.unoRaceWindow.targetPlayerId)}）
            {windowCountdown.expired ? '' : ` · ${windowCountdown.secondsLeft} 秒`}
          </span>
        </div>
      )}

      <section className="uno-house-players" aria-label="玩家状态">
        {view.players.map((player, index) => (
          <div
            key={player.playerId}
            className={[
              'uno-house-player',
              player.isCurrentPlayer ? 'is-current' : '',
              player.playerId === me?.playerId ? 'is-self' : '',
              player.unoCalled ? 'is-uno-called' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="uno-house-player__seat">{index + 1}</span>
            <strong>{nameFor(members, player.playerId)}</strong>
            <span>{player.handCount} 张{player.unoCalled ? ' · UNO!' : ''}</span>
            {player.teamId !== null && <small>队伍 {player.teamId}</small>}
          </div>
        ))}
      </section>

      <section className="uno-house-center" aria-label="弃牌堆">
        <div className={`uno-house-discard color-${view.currentColor}`}>
          <strong>{cardLabel(view.topDiscard)}</strong>
          <small>{colorLabel(view.currentColor)} · {directionLabel}</small>
        </div>
        <p className="uno-house-center__meta">
          <span>当前颜色：{colorLabel(view.currentColor)}</span>
          <span>轮到 {nameFor(members, view.currentPlayerId)}</span>
          <span>牌库 {view.deckCount} · 弃牌 {view.discardCount}</span>
          {turnCountdown.expired ? null : <span>回合 {turnCountdown.secondsLeft} 秒</span>}
        </p>
      </section>

      {!isSpectator && me && (
        <section className="uno-house-hand" aria-label="我的手牌">
          {me.hand.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`uno-card color-${cardColor(card)}`}
              disabled={!canPlay(card.id)}
              onClick={() => play(card)}
            >
              <strong>{cardLabel(card)}</strong>
              <small>{colorLabel(cardColor(card))}</small>
            </button>
          ))}
        </section>
      )}

      {isSpectator && (
        <p className="uno-house-spectator-note">观战中 · 手牌仅对玩家本人显示</p>
      )}

      {!isSpectator && me && (
        <div className="uno-house-actions" aria-label="操作">
          {caps.has('canDraw') && (
            <button type="button" disabled={busy} onClick={() => void act({ type: 'draw_card' })}>
              摸牌
            </button>
          )}
          {caps.has('canPassAfterDraw') && (
            <button type="button" disabled={busy} onClick={() => void act({ type: 'pass_after_draw' })}>
              结束回合
            </button>
          )}
          {caps.has('canCallUno') && (
            <button type="button" className="is-accent" disabled={busy} onClick={() => void act({ type: 'call_uno' })}>
              喊 UNO
            </button>
          )}
          {caps.has('canCatchMissedUno') && view.unoRaceWindow && (
            <button
              type="button"
              className="is-accent"
              disabled={busy}
              onClick={() => void act({
                type: 'catch_missed_uno',
                targetPlayerId: view.unoRaceWindow!.targetPlayerId,
                windowToken: view.unoRaceWindow!.windowToken,
              })}
            >
              抓漏报 UNO
            </button>
          )}
          {caps.has('canAcceptPenalty') && view.pendingPenalty && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'accept_penalty', windowToken: view.pendingPenalty!.windowToken })}
            >
              接受罚牌
            </button>
          )}
          {caps.has('canChallenge') && view.pendingPenalty && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'challenge_penalty', windowToken: view.pendingPenalty!.windowToken })}
            >
              质疑 +4
            </button>
          )}
          {me.hand.length === 0 && <p className="uno-house-actions__hint">无牌可出</p>}
        </div>
      )}

      {wildCardId !== null && (
        <div className="color-picker uno-house-color-picker">
          <strong>选择颜色</strong>
          {UNO_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-${color}`}
              disabled={busy}
              onClick={() => confirmWild(color)}
            >
              {UNO_COLOR_NAMES[color]}
            </button>
          ))}
          <button type="button" className="color-picker-cancel" onClick={() => setWildCardId(null)}>
            取消
          </button>
        </div>
      )}

      {scoreTable(view, members)}

      {view.phase === 'match_over' && (
        <div className="uno-house-banner uno-house-banner--over" role="status">
          <strong>整场结束</strong>
          <span>按累计分低者排名，快开始下一场吧</span>
        </div>
      )}
    </main>
  );
}
