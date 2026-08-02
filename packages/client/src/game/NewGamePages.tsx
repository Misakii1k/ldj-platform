/* eslint-disable @typescript-eslint/no-explicit-any -- 三个新游戏的服务端视图结构不同，此组件按 moduleId 消费运行时视图。 */
import { useMemo, useRef, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { PlayingCard, CardBack } from './PlayingCard.tsx';
import { parseWerewolfView, type WerewolfPlayer, type WerewolfView } from './werewolf/types.ts';
import { GameLeaveButton } from './GameLeaveButton.tsx';

type AnyView = Record<string, any>;

interface MemberLike {
  playerId: string;
  nickname: string;
}

function nameFor(members: MemberLike[], id: string | null | undefined): string {
  return members.find((m) => m.playerId === id)?.nickname ?? id ?? '—';
}

function cardLabel(card: AnyView): string {
  switch (card.kind) {
    case 'number': return String(card.value);
    case 'skip': return '跳过';
    case 'reverse': return '反转';
    case 'draw2': return '+2';
    case 'wild4': return '+4';
    default: return '万能';
  }
}

function useGameAction() {
  const { send } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      await send('game_action', payload);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return { act, busy, error };
}

function Shell({ title, subtitle, children, variant }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  variant?: string;
}) {
  return (
    <main className={`new-game-page ${variant ? `new-game-page--${variant}` : ''}`}>
      <header className="new-game-header">
        <div className="new-game-header__copy">
          <span className="new-game-kicker">局域网实时对局</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <GameLeaveButton />
      </header>
      {children}
    </main>
  );
}

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
const UNO_COLOR_NAMES: Record<string, string> = { red: '红', yellow: '黄', green: '绿', blue: '蓝' };

function colorLabel(color: string | null | undefined): string {
  return color ? UNO_COLOR_NAMES[color] ?? color : '任意色';
}

function unoSubtitle(view: AnyView, members: MemberLike[]): string {
  if (view.phase === 'game_over') return `${nameFor(members, view.winnerId)} 获胜`;
  const currentColor = view.currentColor ?? view.topDiscard?.color ?? view.lastDiscard?.color ?? view.previousDiscard?.color;
  return `当前颜色：${colorLabel(currentColor)} · ${nameFor(members, view.currentPlayerId)} 的回合`;
}

export function UnoGamePage({ view }: { view: AnyView }) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const [wildCardId, setWildCardId] = useState<string | null>(null);

  const me = view.me;
  const myTurn = Boolean(me) && view.currentPlayerId === me?.playerId;
  const top = view.topDiscard ?? view.lastDiscard ?? view.previousDiscard ?? view.previousCard ?? null;
  const currentColor = view.currentColor ?? top?.color ?? null;
  const directionLabel = view.direction === -1 ? '逆时针' : '顺时针';
  const mustDraw = view.pendingDraw > 0;

  function play(card: AnyView) {
    // 万能牌需要先选色，其余直接出。
    if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
    else void act({ type: 'play_card', cardId: card.id });
  }

  return (
    <Shell title="UNO" subtitle={unoSubtitle(view, members)} variant="uno">
      <section className="uno-table">
        <div className="uno-players" aria-label="UNO 玩家状态">
          {view.players.map((p: AnyView, index: number) => (
            <div
              key={p.playerId}
              className={[
                'new-player-chip',
                'uno-player-chip',
                p.playerId === view.currentPlayerId ? 'active' : '',
                p.playerId === me?.playerId ? 'self' : '',
                p.unoCalled ? 'uno-called' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="uno-player-chip__seat">{index + 1}</span>
              <strong>{nameFor(members, p.playerId)}</strong>
              <span>
                {p.playerId === me?.playerId ? '我 · ' : ''}{p.handCount} 张
                {p.unoCalled ? ' · UNO!' : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="uno-center-stage" aria-label="当前弃牌与上一位出牌者">
          <div className="uno-discard-copy">
            <span>上一张公开牌</span>
            <strong>{top ? `${colorLabel(top.color ?? currentColor)} · ${cardLabel(top)}` : '等待首张牌'}</strong>
            <small>{view.lastPlayedBy ? `由 ${nameFor(members, view.lastPlayedBy)} 打出 · ` : ''}当前颜色：{colorLabel(currentColor)} · {directionLabel}</small>
          </div>
          <div className={`uno-discard uno-card color-${currentColor ?? 'wild'}`}>
            <span>{top ? cardLabel(top) : '—'}</span>
            <small>{directionLabel}</small>
          </div>
        </div>

        {mustDraw && <p className="game-alert">需要摸 {view.pendingDraw} 张罚牌</p>}

        {me && (
          <div className="uno-hand" aria-label="我的手牌">
            {me.hand.map((card: AnyView) => (
              <button
                key={card.id}
                type="button"
                disabled={busy || !myTurn || mustDraw}
                className={`uno-card color-${card.color ?? 'wild'}`}
                onClick={() => play(card)}
              >
                <strong>{cardLabel(card)}</strong>
                <small>{colorLabel(card.color)}</small>
              </button>
            ))}
          </div>
        )}

        {myTurn && (
          <div className="new-game-actions">
            <button type="button" disabled={busy} onClick={() => void act({ type: 'draw_card' })}>
              摸牌
            </button>
            {me?.hasDrawnThisTurn && (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'pass_after_draw' })}>
                结束回合
              </button>
            )}
            {me?.hand.length === 1 && (
              <button type="button" className="accent" disabled={busy} onClick={() => void act({ type: 'call_uno' })}>
                喊 UNO
              </button>
            )}
          </div>
        )}

        {wildCardId && (
          <div className="color-picker">
            <strong>选择颜色</strong>
            {UNO_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-${color}`}
                disabled={busy}
                onClick={() => {
                  void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
                  setWildCardId(null);
                }}
              >
                {UNO_COLOR_NAMES[color]}
              </button>
            ))}
            <button type="button" className="color-picker-cancel" onClick={() => setWildCardId(null)}>
              取消
            </button>
          </div>
        )}

        {error && <p className="game-error">{error}</p>}
      </section>
    </Shell>
  );
}

function isRedSuit(suit: string | undefined): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** 底牌与当前牌型共用的静态牌面，两处渲染逻辑完全一致。 */
function CardFace({ card }: { card: AnyView }) {
  return <PlayingCard rank={card.rank} suit={card.suit} className="card-face-static" />;
}

function landlordSubtitle(view: AnyView, members: MemberLike[]): string {
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
  const dragRef = useRef<{
    startIndex: number;
    lastIndex: number;
    moved: boolean;
    baseSelected: string[];
  } | null>(null);
  const suppressClickRef = useRef(false);

  function toggle(id: string) {
    if (!canSelectCards || suppressClickRef.current) return;
    setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  function mergeSelectedRange(baseSelected: string[], startIndex: number, endIndex: number): string[] {
    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const picked = me.hand.slice(from, to + 1).map((card: AnyView) => card.id);
    return Array.from(new Set([...baseSelected, ...picked]));
  }

  function indexFromPointer(event: React.PointerEvent): number | null {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const button = target?.closest<HTMLButtonElement>('[data-card-index]');
    const index = Number(button?.dataset.cardIndex);
    return Number.isInteger(index) ? index : null;
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (!canSelectCards) return;
    dragRef.current = {
      startIndex: index,
      lastIndex: index,
      moved: false,
      baseSelected: selected,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const index = indexFromPointer(event);
    if (index === null || index === drag.lastIndex) return;
    drag.lastIndex = index;
    drag.moved = true;
    setSelected(mergeSelectedRange(drag.baseSelected, drag.startIndex, index));
  }

  function finishDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  return (
    <Shell title="斗地主" subtitle={landlordSubtitle(view, members)} variant="landlord">
      <section className={`landlord-table phase-${view.phase}`}>
        <div className="landlord-players">
          {view.players.map((p: AnyView) => {
            const bidding = p.playerId === view.currentBidderId;
            const playing = p.playerId === view.currentPlayerId;
            return (
              <div key={p.playerId} className={`new-player-chip ${bidding || playing ? 'active' : ''}`}>
                <strong>
                  {nameFor(members, p.playerId)}
                  {p.playerId === view.landlordId && <span aria-label="地主">👑</span>}
                </strong>
                <span>
                  {p.handCount} 张
                  {bidding ? ' · 正在叫分' : ''}
                  {playing ? ' · 正在出牌' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div className="bottom-cards landlord-panel">
          <span>{view.landlordId ? '地主底牌' : '地主底牌 · 叫分后公开'}</span>
          <div className="bottom-card-row">
            {view.landlordId
              ? view.bottomCards.map((card: AnyView) => <CardFace key={card.id} card={card} />)
              : [0, 1, 2].map((i) => (
                  <CardBack key={i} className="card-face-static" />
                ))}
          </div>
        </div>

        <div className="current-combo landlord-panel">
          {view.phase === 'bidding' ? (
            <>
              <strong>叫地主阶段</strong>
              <p>
                {myBid
                  ? '轮到你叫分，请根据手牌选择。'
                  : `等待 ${nameFor(members, view.currentBidderId)} 叫分`}
              </p>
            </>
          ) : view.currentTrick ? (
            <>
              <strong>{nameFor(members, view.currentTrick.playerId)} 出牌</strong>
              <div className="current-combo-row">
                {view.currentTrick.combo.cards.map((card: AnyView) => (
                  <CardFace key={card.id} card={card} />
                ))}
              </div>
              <small>{view.currentTrick.combo.type}</small>
            </>
          ) : (
            <>
              <strong>等待首轮出牌</strong>
              <p>{nameFor(members, view.currentPlayerId)} 可以先出任意合法牌型。</p>
            </>
          )}
        </div>

        {view.phase === 'bidding' && (
          <div className="new-game-actions landlord-bid-actions">
            {myBid
              ? [0, 1, 2, 3].map((score) => (
                  <button
                    key={score}
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'bid_score', score })}
                  >
                    {score === 0 ? '不叫' : `${score} 分`}
                  </button>
                ))
              : (
                <span className="waiting-tip">
                  等待 {nameFor(members, view.currentBidderId)} 叫分…
                </span>
              )}
          </div>
        )}

        {me && (
          <>
            <div
              className={`landlord-hand ${canSelectCards ? 'can-select' : 'readonly'}`}
              style={{ ['--hand-count' as string]: String(me.hand.length) }}
              aria-label="我的手牌，可拖动连续选择多张牌"
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onLostPointerCapture={finishDrag}
            >
              {me.hand.map((card: AnyView, index: number) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!canSelectCards}
                  data-card-index={index}
                  aria-pressed={selected.includes(card.id)}
                  className={[
                    'landlord-hand__card',
                    selected.includes(card.id) ? 'selected' : '',
                    isRedSuit(card.suit) ? 'red' : '',
                  ].filter(Boolean).join(' ')}
                  onPointerDown={(event) => startDrag(event, index)}
                  onClick={() => toggle(card.id)}
                >
                  <PlayingCard rank={card.rank} suit={card.suit} />
                </button>
              ))}
            </div>
            <p className="hand-hint">
              我的手牌 · {me.hand.length} 张
              {view.phase === 'bidding'
                ? ' · 叫分阶段暂不能出牌'
                : canSelectCards
                  ? selected.length > 0
                    ? ` · 已选 ${selected.length} 张`
                    : ' · 点击或拖拽选择要出的牌'
                  : ' · 等待你的回合'}
            </p>
            {view.phase === 'playing' && myTurn && (
              <div className="new-game-actions">
                <button
                  type="button"
                  className="accent"
                  disabled={busy || selected.length === 0}
                  onClick={() => {
                    void act({ type: 'play_combo', cardIds: selected });
                    setSelected([]);
                  }}
                >
                  出牌
                </button>
                <button
                  type="button"
                  disabled={busy || !view.currentTrick}
                  onClick={() => void act({ type: 'pass_turn' })}
                >
                  不出
                </button>
                {selected.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => setSelected([])}>
                    取消选择
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="game-error">{error}</p>}
      </section>
    </Shell>
  );
}
const ROLE_NAMES: Record<string, string> = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  hunter: '猎人',
  idiot: '白痴',
};

const WEREWOLF_PHASE_NAMES: Record<string, string> = {
  role_reveal: '身份确认',
  night: '夜晚行动',
  hunter_shot: '猎人开枪',
  day_announcement: '公布昨夜信息',
  discussion: '轮流发言',
  voting: '放逐投票',
  runoff_voting: '加赛投票',
  vote_result: '投票结果',
  last_words: '遗言阶段',
  game_over: '游戏结束',
};

const EXIT_REASON_NAMES: Record<string, string> = {
  night_kill: '夜晚遇袭',
  poisoned: '女巫毒杀',
  voted_out: '白天放逐',
  disconnect_timeout: '断线超时',
  hunter_shot: '猎人开枪',
};

function teamName(team: string | null | undefined): string {
  if (team === 'wolves') return '狼人阵营';
  if (team === 'village') return '好人阵营';
  return '未知阵营';
}

function roleHint(me: WerewolfView['me'], members: MemberLike[]): string {
  if (!me) return '等待对局视角同步';
  if (me.role === 'wolf') {
    const mates = me.wolfTeammateIds.map((id) => nameFor(members, id)).join('、');
    return `同伴：${mates || '无'}`;
  }
  if (me.role === 'seer' && me.seerResults.length > 0) {
    const last = me.seerResults[me.seerResults.length - 1]!;
    return `最近查验：${nameFor(members, last.playerId)} 是 ${teamName(last.team)}`;
  }
  if (me.role === 'witch') {
    const used = [me.witchSaveUsed ? '解药已用' : '解药可用', me.witchPoisonUsed ? '毒药已用' : '毒药可用'];
    return used.join(' · ');
  }
  if (me.role === 'guard' && me.lastGuardTargetId) {
    return `上一夜守护：${nameFor(members, me.lastGuardTargetId)}`;
  }
  if (me.role === 'idiot' && me.idiotRevealed) return '已翻牌免死，失去投票权';
  return '请隐藏好自己的身份';
}

function voteOutcomeText(summary: WerewolfView['lastVoteSummary'], members: MemberLike[]): string {
  if (!summary) return '等待投票统计';
  if (summary.outcome === 'eliminated' && summary.eliminatedPlayerId) {
    return `${nameFor(members, summary.eliminatedPlayerId)} 被放逐，进入遗言阶段`;
  }
  if (summary.outcome === 'idiot_saved' && summary.eliminatedPlayerId) {
    return `${nameFor(members, summary.eliminatedPlayerId)} 翻牌免死，失去投票权`;
  }
  if (summary.outcome === 'tie') return '最高票并列，即将进入加赛投票';
  if (summary.outcome === 'runoff_tie') return '加赛仍然平票，本轮无人出局';
  return '无人获得有效票数，本轮无人出局';
}

export function WerewolfGamePage({ view: rawView }: { view: AnyView }) {
  const view = parseWerewolfView(rawView);
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();

  if (view === null) {
    return (
      <Shell title="狼人杀" subtitle="对局数据格式异常" variant="werewolf">
        <section className="werewolf-board">
          <p className="game-error">狼人杀视图同步失败，请尝试刷新或重新进入房间。</p>
        </section>
      </Shell>
    );
  }

  const me = view.me;
  const aliveTargets = useMemo(
    () => view.players.filter((p) => p.alive && p.playerId !== me?.playerId),
    [view.players, me?.playerId],
  );

  function targets(action: string, filter?: (p: WerewolfPlayer) => boolean) {
    const list = aliveTargets.filter(filter ?? (() => true));
    if (list.length === 0) return <p className="waiting-tip">没有可选目标</p>;
    return (
      <div className="werewolf-targets">
        {list.map((p) => (
          <button
            key={p.playerId}
            type="button"
            disabled={busy}
            onClick={() => void act({ type: action, targetPlayerId: p.playerId })}
          >
            {nameFor(members, p.playerId)}
          </button>
        ))}
      </div>
    );
  }

  const phaseName = WEREWOLF_PHASE_NAMES[view.phase] ?? '同步中';
  const confirmedRoles = `${view.confirmedRolePlayerIds.length}/${view.players.length}`;
  const confirmedAnnouncements = `${view.announcementConfirmedPlayerIds.length}/${view.players.filter((p) => p.alive).length}`;

  return (
    <Shell title="狼人杀" subtitle={`第 ${view.day} 天 · ${phaseName}`} variant="werewolf">
      <section className={`werewolf-board phase-${view.phase}`}>
        {me && (
          <div className="role-card">
            <span>你的身份</span>
            <strong>{ROLE_NAMES[me.role] ?? me.role}</strong>
            <small>{roleHint(me, members)}</small>
          </div>
        )}

        <div className="werewolf-players">
          {view.players.map((p) => (
            <div
              key={p.playerId}
              className={[
                'new-player-chip',
                p.alive ? '' : 'dead',
                p.playerId === view.currentSpeakerId ? 'active' : '',
              ].filter(Boolean).join(' ')}
            >
              <strong>{nameFor(members, p.playerId)}</strong>
              <span>
                {p.alive ? '存活' : `已出局${p.exitReason ? ` · ${EXIT_REASON_NAMES[p.exitReason] ?? p.exitReason}` : ''}`}
                {p.idiotRevealed ? ' · 白痴已翻牌' : ''}
                {p.revealedRole ? ` · ${ROLE_NAMES[p.revealedRole] ?? p.revealedRole}` : ''}
              </span>
            </div>
          ))}
        </div>

        {view.phase === 'role_reveal' && (
          <div className="day-announcement">
            <h2>确认身份后进入第 1 夜</h2>
            <p className="waiting-tip">已确认 {confirmedRoles}</p>
            {me?.alive && !me.confirmedRole && (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'confirm_role' })}>
                我已记住身份
              </button>
            )}
            {me?.confirmedRole && <p className="waiting-tip">你已确认身份，等待其他玩家。</p>}
          </div>
        )}

        {view.phase === 'night' && me?.alive && (
          <div className="night-actions">
            {me.role === 'wolf' && (
              <>
                <h3>{me.hasNightVoted ? '已提交击杀票' : '选择今晚击杀目标'}</h3>
                {me.hasNightVoted
                  ? <p className="waiting-tip">等待其他狼人或夜晚结算…</p>
                  : targets('night_kill', (p) => !me.wolfTeammateIds.includes(p.playerId))}
              </>
            )}

            {me.role === 'seer' && (
              me.seerCheckedThisNight ? (
                <p className="waiting-tip">本夜已完成查验，等待其他角色行动…</p>
              ) : (
                <>
                  <h3>选择查验目标</h3>
                  {targets('seer_check')}
                </>
              )
            )}

            {me.role === 'witch' && (
              <>
                <h3>
                  {me.nightVictimId
                    ? `昨夜目标：${nameFor(members, me.nightVictimId)}`
                    : '昨夜暂无被袭击目标'}
                </h3>
                {me.nightVictimId && me.witchSaveDecision === null && (
                  <div className="new-game-actions">
                    <button
                      type="button"
                      disabled={busy || me.witchSaveUsed || !me.witchCanSelfSave && me.nightVictimId === me.playerId}
                      onClick={() => void act({ type: 'witch_save', save: true })}
                    >
                      {me.witchSaveUsed ? '解药已用完' : '使用解药'}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void act({ type: 'witch_save', save: false })}>
                      不救
                    </button>
                  </div>
                )}

                {me.witchPoisonUsed ? (
                  <p className="waiting-tip">毒药已用完</p>
                ) : me.witchPoisonDecided ? (
                  <p className="waiting-tip">毒药选择已提交</p>
                ) : me.nightVictimId ? (
                  <>
                    <h3>选择毒杀目标</h3>
                    {targets('witch_poison')}
                    <div className="new-game-actions">
                      <button type="button" disabled={busy} onClick={() => void act({ type: 'witch_poison', targetPlayerId: null })}>
                        不使用毒药
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            )}

            {me.role === 'guard' && (
              me.guardDecided ? (
                <p className="waiting-tip">
                  {me.guardTargetId ? `已决定守护 ${nameFor(members, me.guardTargetId)}` : '本夜已决定不守护'}
                </p>
              ) : (
                <>
                  <h3>选择今晚守护目标</h3>
                  {targets('guard_guard', (p) => p.playerId !== me.lastGuardTargetId)}
                  <div className="new-game-actions">
                    <button type="button" disabled={busy} onClick={() => void act({ type: 'guard_guard', targetPlayerId: null })}>
                      本夜不守护
                    </button>
                  </div>
                </>
              )
            )}

            {(me.role === 'villager' || me.role === 'hunter' || me.role === 'idiot') && (
              <p className="waiting-tip">天黑请闭眼，等待其他角色行动…</p>
            )}
          </div>
        )}

        {view.phase === 'night' && me && !me.alive && (
          <p className="waiting-tip">你已出局，安静观战即可。</p>
        )}

        {view.phase === 'hunter_shot' && (
          <div className="day-announcement">
            <h2>{nameFor(members, view.pendingShooterId)} 正在决定是否开枪</h2>
            {me?.pendingShoot ? (
              <>
                <p className="waiting-tip">选择一名存活玩家，或放弃开枪。</p>
                {targets('hunter_shoot')}
                <div className="new-game-actions">
                  <button type="button" disabled={busy} onClick={() => void act({ type: 'hunter_shoot', targetPlayerId: null })}>
                    放弃开枪
                  </button>
                </div>
              </>
            ) : (
              <p className="waiting-tip">等待猎人完成决定…</p>
            )}
          </div>
        )}

        {view.phase === 'day_announcement' && (
          <div className="day-announcement">
            <h2>
              {view.lastNightDeaths.length
                ? `昨夜出局：${view.lastNightDeaths.map((id) => nameFor(members, id)).join('、')}`
                : '昨夜平安夜'}
            </h2>
            <p className="waiting-tip">已确认 {confirmedAnnouncements}</p>
            {me?.alive && !me.confirmedAnnouncement && (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'confirm_announcement' })}>
                知道了，进入发言
              </button>
            )}
            {me?.confirmedAnnouncement && <p className="waiting-tip">你已确认天亮信息，等待其他玩家。</p>}
          </div>
        )}

        {view.phase === 'discussion' && (
          <div className="day-announcement">
            <h2>{nameFor(members, view.currentSpeakerId)} 正在发言</h2>
            {view.currentSpeakerId === me?.playerId && (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'finish_speech' })}>
                结束发言
              </button>
            )}
          </div>
        )}

        {(view.phase === 'voting' || view.phase === 'runoff_voting') && (
          me?.alive && !me.idiotRevealed
            ? (
              <>
                <h3>{view.phase === 'runoff_voting' ? '加赛：只能投给并列候选人' : '选择放逐目标'}</h3>
                {targets('day_vote', (p) => !p.idiotRevealed && (
                  view.phase !== 'runoff_voting' || view.runoffCandidates.includes(p.playerId)
                ))}
                <div className="new-game-actions">
                  <button type="button" disabled={busy || me.hasVoted} onClick={() => void act({ type: 'day_vote', targetPlayerId: null })}>
                    弃票
                  </button>
                </div>
                {me.hasVoted && <p className="waiting-tip">你已投票，等待统计。</p>}
              </>
            )
            : <p className="waiting-tip">{me?.idiotRevealed ? '你已翻牌，失去投票权。' : '你已出局，无法参与投票。'}</p>
        )}

        {view.phase === 'vote_result' && (
          <div className="day-announcement">
            <h2>{voteOutcomeText(view.lastVoteSummary, members)}</h2>
            {view.lastVoteSummary && (
              <div className="werewolf-targets">
                {Object.entries(view.lastVoteSummary.tally).map(([playerId, count]) => (
                  <button key={playerId} type="button" disabled>
                    {nameFor(members, playerId)} · {count} 票
                  </button>
                ))}
              </div>
            )}
            <p className="waiting-tip">结果展示后自动进入下一阶段。</p>
          </div>
        )}

        {view.phase === 'last_words' && (
          <div className="day-announcement">
            <h2>{nameFor(members, view.lastWordsPlayerId)} 发表遗言</h2>
            {me?.lastWordsPending ? (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'finish_last_words' })}>
                结束遗言
              </button>
            ) : (
              <p className="waiting-tip">等待遗言结束…</p>
            )}
          </div>
        )}

        {view.phase === 'game_over' && (
          <div className="day-announcement">
            <h2>{view.aborted ? '本局已中止' : `${teamName(view.winner)}获胜`}</h2>
            {view.reveal && (
              <div className="werewolf-targets">
                {Object.entries(view.reveal.roles).map(([playerId, role]) => (
                  <button key={playerId} type="button" disabled>
                    {nameFor(members, playerId)} · {ROLE_NAMES[role] ?? role}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="game-error">{error}</p>}
      </section>
    </Shell>
  );
}