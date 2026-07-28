/* eslint-disable @typescript-eslint/no-explicit-any -- 三个新游戏的服务端视图结构不同，此组件按 moduleId 消费运行时视图。 */
import { useMemo, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';

type AnyView = Record<string, any>;
function nameFor(members: Array<{ playerId: string; nickname: string }>, id: string | null | undefined): string { return members.find((m) => m.playerId === id)?.nickname ?? id ?? '—'; }
function cardLabel(card: AnyView): string { if (card.kind === 'number') return String(card.value); if (card.kind === 'skip') return '跳过'; if (card.kind === 'reverse') return '反转'; if (card.kind === 'draw2') return '+2'; if (card.kind === 'wild4') return '+4'; return '万能'; }
function useGameAction() { const { send } = useConnection(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); async function act(payload: unknown) { setBusy(true); setError(null); try { await send('game_action', payload); } catch (err) { setError(describeError(err)); } finally { setBusy(false); } } return { act, busy, error }; }
function Shell({ title, subtitle, children, variant }: { title: string; subtitle: string; children: React.ReactNode; variant?: string }) { return <main className={`new-game-page ${variant ? `new-game-page--${variant}` : ''}`}><header className="new-game-header"><div><span className="new-game-kicker">局域网实时对局</span><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</main>; }

export function UnoGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection(); const members = state.room?.members ?? []; const { act, busy, error } = useGameAction(); const [wildCardId, setWildCardId] = useState<string | null>(null);
  const me = view.me; const myTurn = me && view.currentPlayerId === me.playerId; const top = view.topDiscard;
  function play(card: AnyView) { if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id); else void act({ type: 'play_card', cardId: card.id }); }
  return <Shell title="UNO" subtitle={view.phase === 'game_over' ? `${nameFor(members, view.winnerId)} 获胜` : `当前颜色：${view.currentColor} · ${nameFor(members, view.currentPlayerId)} 的回合`} variant="uno">
    <section className="uno-table">
      <div className="uno-players">{view.players.map((p: AnyView) => <div key={p.playerId} className={`new-player-chip ${p.playerId === view.currentPlayerId ? 'active' : ''}`}><strong>{nameFor(members, p.playerId)}</strong><span>{p.handCount} 张 {p.unoCalled ? '· UNO!' : ''}</span></div>)}</div>
      <div className={`uno-discard uno-card color-${view.currentColor}`}><span>{cardLabel(top)}</span><small>{view.direction === 1 ? '顺时针' : '逆时针'}</small></div>
      {view.pendingDraw > 0 && <p className="game-alert">需要摸 {view.pendingDraw} 张罚牌</p>}
      {me && <div className="uno-hand">{me.hand.map((card: AnyView) => <button key={card.id} disabled={busy || !myTurn || view.pendingDraw > 0} className={`uno-card color-${card.color ?? 'wild'}`} onClick={() => play(card)}><strong>{cardLabel(card)}</strong><small>{card.color ?? '任意色'}</small></button>)}</div>}
      {myTurn && <div className="new-game-actions"><button disabled={busy} onClick={() => void act({ type: 'draw_card' })}>摸牌</button>{me?.hasDrawnThisTurn && <button disabled={busy} onClick={() => void act({ type: 'pass_after_draw' })}>结束回合</button>}{me?.hand.length === 1 && <button className="accent" disabled={busy} onClick={() => void act({ type: 'call_uno' })}>喊 UNO</button>}</div>}
      {wildCardId && <div className="color-picker"><strong>选择颜色</strong>{['red', 'yellow', 'green', 'blue'].map((color) => <button key={color} className={`color-${color}`} onClick={() => { void act({ type: 'play_card', cardId: wildCardId, declaredColor: color }); setWildCardId(null); }}>{color}</button>)}</div>}
      {error && <p className="game-error">{error}</p>}
    </section>
  </Shell>;
}

function rankLabel(rank: string): string { return rank === 'SJ' ? '小王' : rank === 'BJ' ? '大王' : rank; }
function suitLabel(suit: string | undefined): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'spades': return '♠';
    case 'clubs': return '♣';
    default: return '王';
  }
}
function isRedSuit(suit: string | undefined): boolean { return suit === 'hearts' || suit === 'diamonds'; }
function landlordSubtitle(view: AnyView, members: Array<{ playerId: string; nickname: string }>): string {
  if (view.phase === 'bidding') return `${nameFor(members, view.currentBidderId)} 正在叫分`;
  if (view.phase === 'game_over') return `${view.winnerTeam === 'landlord' ? '地主' : '农民'}阵营获胜`;
  return `${nameFor(members, view.currentPlayerId)} 的回合 · 倍率 ${view.multiplier}`;
}
export function LandlordGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [selected, setSelected] = useState<string[]>([]);
  const me = view.me;
  const myTurn = me && view.currentPlayerId === me.playerId;
  const myBid = me && view.currentBidderId === me.playerId;
  const canSelectCards = view.phase === 'playing' && myTurn;

  function toggle(id: string) {
    if (!canSelectCards) return;
    setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  return <Shell title="斗地主" subtitle={landlordSubtitle(view, members)} variant="landlord">
    <section className={`landlord-table phase-${view.phase}`}>
      <div className="landlord-players">{view.players.map((p: AnyView) => {
        const active = p.playerId === view.currentPlayerId || p.playerId === view.currentBidderId;
        return <div key={p.playerId} className={`new-player-chip ${active ? 'active' : ''}`}>
          <strong>{nameFor(members, p.playerId)} {p.playerId === view.landlordId ? '👑' : ''}</strong>
          <span>{p.handCount} 张{p.playerId === view.currentBidderId ? ' · 正在叫分' : ''}{p.playerId === view.currentPlayerId ? ' · 正在出牌' : ''}</span>
        </div>;
      })}</div>

      <div className="bottom-cards landlord-panel">
        <span>{view.landlordId ? '地主底牌' : '地主底牌 · 叫分后公开'}</span>
        <div className="bottom-card-row">
          {view.landlordId
            ? view.bottomCards.map((card: AnyView) => <b key={card.id} className={isRedSuit(card.suit) ? 'red' : ''}>{rankLabel(card.rank)}<small>{suitLabel(card.suit)}</small></b>)
            : [0, 1, 2].map((i) => <b key={i} className="card-back">?</b>)}
        </div>
      </div>

      <div className="current-combo landlord-panel">
        {view.phase === 'bidding' ? <>
          <strong>叫地主阶段</strong>
          <p>{myBid ? '轮到你叫分，请根据手牌选择。' : `等待 ${nameFor(members, view.currentBidderId)} 叫分`}</p>
        </> : view.currentTrick ? <>
          <strong>{nameFor(members, view.currentTrick.playerId)} 出牌</strong>
          <div>{view.currentTrick.combo.cards.map((card: AnyView) => <b key={card.id} className={isRedSuit(card.suit) ? 'red' : ''}>{rankLabel(card.rank)}<small>{suitLabel(card.suit)}</small></b>)}</div>
          <small>{view.currentTrick.combo.type}</small>
        </> : <>
          <strong>等待首轮出牌</strong>
          <p>{nameFor(members, view.currentPlayerId)} 可以先出任意合法牌型。</p>
        </>}
      </div>

      {view.phase === 'bidding' && <div className="new-game-actions landlord-bid-actions">
        {myBid
          ? [0, 1, 2, 3].map((score) => <button key={score} disabled={busy} onClick={() => void act({ type: 'bid_score', score })}>{score === 0 ? '不叫' : `${score} 分`}</button>)
          : <span className="waiting-tip">等待 {nameFor(members, view.currentBidderId)} 叫分…</span>}
      </div>}

      {me && <>
        <div className={`landlord-hand ${canSelectCards ? 'can-select' : 'readonly'}`} style={{ ['--hand-count' as string]: String(me.hand.length) }} aria-label="我的手牌">
          {me.hand.map((card: AnyView) => <button
            key={card.id}
            type="button"
            disabled={!canSelectCards}
            className={`${selected.includes(card.id) ? 'selected' : ''} ${isRedSuit(card.suit) ? 'red' : ''}`}
            onClick={() => toggle(card.id)}
          >
            <strong>{rankLabel(card.rank)}</strong>
            <small>{suitLabel(card.suit)}</small>
          </button>)}
        </div>
        <p className="hand-hint">我的手牌 · {me.hand.length} 张{view.phase === 'bidding' ? ' · 叫分阶段暂不能出牌' : canSelectCards ? ' · 点击选择要出的牌' : ' · 等待你的回合'}</p>
        {view.phase === 'playing' && myTurn && <div className="new-game-actions">
          <button className="accent" disabled={busy || selected.length === 0} onClick={() => { void act({ type: 'play_combo', cardIds: selected }); setSelected([]); }}>出牌</button>
          <button disabled={busy || !view.currentTrick} onClick={() => void act({ type: 'pass_turn' })}>不出</button>
        </div>}
      </>}
      {error && <p className="game-error">{error}</p>}
    </section>
  </Shell>;
}
const ROLE_NAMES: Record<string, string> = { wolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫' };
export function WerewolfGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection(); const members = state.room?.members ?? []; const { act, busy, error } = useGameAction(); const me = view.me;
  const aliveTargets = useMemo(() => view.players.filter((p: AnyView) => p.alive && p.playerId !== me?.playerId), [view.players, me?.playerId]);
  function targets(action: string, filter?: (p: AnyView) => boolean) { return <div className="werewolf-targets">{aliveTargets.filter(filter ?? (() => true)).map((p: AnyView) => <button key={p.playerId} disabled={busy} onClick={() => void act({ type: action, targetPlayerId: p.playerId })}>{nameFor(members, p.playerId)}</button>)}</div>; }
  return <Shell title="狼人杀" subtitle={`第 ${view.day} 天 · ${view.phase === 'night' ? '夜晚行动' : view.phase === 'discussion' ? '轮流发言' : view.phase === 'voting' ? '放逐投票' : view.phase === 'game_over' ? '游戏结束' : '公布昨夜信息'}`} variant="werewolf">
    <section className={`werewolf-board phase-${view.phase}`}>
      {me && <div className="role-card"><span>你的身份</span><strong>{ROLE_NAMES[me.role]}</strong><small>{me.role === 'wolf' ? `同伴：${me.wolfTeammateIds.map((id: string) => nameFor(members, id)).join('、') || '无'}` : me.role === 'seer' && me.seerResult ? `查验：${nameFor(members, me.seerResult.playerId)} 是 ${me.seerResult.team === 'wolves' ? '狼人阵营' : '好人阵营'}` : '请隐藏好自己的身份'}</small></div>}
      <div className="werewolf-players">{view.players.map((p: AnyView) => <div key={p.playerId} className={`new-player-chip ${p.alive ? '' : 'dead'} ${p.playerId === view.currentSpeakerId ? 'active' : ''}`}><strong>{nameFor(members, p.playerId)}</strong><span>{p.alive ? '存活' : '已出局'} {p.revealedRole ? `· ${ROLE_NAMES[p.revealedRole]}` : ''}</span></div>)}</div>
      {view.phase === 'night' && me?.alive && <div className="night-actions">{me.role === 'wolf' && <><h3>选择今晚击杀目标</h3>{targets('night_kill', (p) => !me.wolfTeammateIds.includes(p.playerId))}</>}{me.role === 'seer' && !me.seerResult && <><h3>选择查验目标</h3>{targets('seer_check')}</>}{me.role === 'witch' && <><h3>昨夜目标：{nameFor(members, me.nightVictimId)}</h3><div className="new-game-actions"><button disabled={busy || me.witchSaveUsed} onClick={() => void act({ type: 'witch_save', save: true })}>使用解药</button><button disabled={busy} onClick={() => void act({ type: 'witch_save', save: false })}>不救</button></div><h3>选择毒杀目标</h3>{!me.witchPoisonUsed && targets('witch_poison')}<button disabled={busy} onClick={() => void act({ type: 'witch_poison', targetPlayerId: null })}>不使用毒药</button></>}</div>}
      {view.phase === 'day_announcement' && <div className="day-announcement"><h2>{view.lastNightDeaths.length ? `昨夜出局：${view.lastNightDeaths.map((id: string) => nameFor(members, id)).join('、')}` : '昨夜平安夜'}</h2>{me?.alive && <button disabled={busy} onClick={() => void act({ type: 'finish_speech' })}>进入发言</button>}</div>}
      {view.phase === 'discussion' && <div className="day-announcement"><h2>{nameFor(members, view.currentSpeakerId)} 正在发言</h2>{view.currentSpeakerId === me?.playerId && <button disabled={busy} onClick={() => void act({ type: 'finish_speech' })}>结束发言</button>}</div>}
      {view.phase === 'voting' && me?.alive && <><h3>选择放逐目标</h3>{targets('day_vote')}</>}
      {view.phase === 'game_over' && <div className="day-announcement"><h2>{view.winner === 'wolves' ? '狼人阵营获胜' : '好人阵营获胜'}</h2></div>}
      {error && <p className="game-error">{error}</p>}
    </section>
  </Shell>;
}





