import { useGameVisibility } from '../tabletop/useGameVisibility.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotion } from '../../motion/MotionContext.tsx';
import { useConnection } from '../../connection/useConnection.ts';
import { resolveInitialDeviceRole } from '../../app/appMode.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import { useTabletopMenu } from '../../shared-ui/useTabletopMenu.ts';
import { TabletopMenuDrawer } from '../../shared-ui/TabletopMenuDrawer.tsx';
import { ConfirmDialog } from '../../shared-ui/ConfirmDialog.tsx';
import { Menu, LayoutGrid, History } from 'lucide-react';
import { FruitIcon } from './FruitGraphic.tsx';
import {
  DURIAN_FRUITS,
  FRUIT_NAMES,
  MONKEY_SPECIAL_DESCS,
  MONKEY_SPECIAL_NAMES,
  type DurianFruit,
  type DurianPlayerView,
} from './types.ts';

function playTurnCue() {
  webAudio.playTurnAlert();
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([40, 30, 40]);
    } catch {
      // ignore
    }
  }
}

interface Props {
  readonly view: DurianPlayerView;
}

type DeviceRole = 'table' | 'player';
type DurianDensity = 'compact' | 'comfortable';

export function DurianGamePage({ view }: Props) {
  useGameVisibility();
  const { state, me: connMe } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const menu = useTabletopMenu();
  const { level: _motionLevel } = useMotion();

  // 1. 排版密度：紧凑总览 vs 舒展牌面（偏好持久化）
  const [density, setDensity] = useState<DurianDensity>(() => {
    if (typeof window === 'undefined') return 'compact';
    try {
      return localStorage.getItem('ldj_durian_density') === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact';
    }
  });

  const handleDensityChange = useCallback((nextDensity: DurianDensity) => {
    setDensity(nextDensity);
    try {
      localStorage.setItem('ldj_durian_density', nextDensity);
    } catch {
      // ignore
    }
  }, []);

  const me = view.me;
  const myId = me?.playerId ?? null;
  const myMember = state.room?.members.find((m) => m.playerId === (connMe?.playerId ?? myId));
  const isSpectator = me === null || myMember?.seatRole === 'spectator' || state.game?.role === 'spectator';

  // 2. 设备角色（模拟器大屏 vs 玩家端）
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(
    () => resolveInitialDeviceRole('ldj_durian_device_role'),
  );

  const isSimulator = view.mode === 'simulator';
  const isTableScreen = isSpectator || me === null || (isSimulator && deviceRole === 'table');

  const _selectDeviceRole = useCallback((role: DeviceRole) => {
    setDeviceRole(role);
    try {
      localStorage.setItem('ldj_durian_device_role', role);
    } catch {
      // ignore
    }
  }, []);

  // 3. 弹窗控制与操作状态
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingHalf, setPendingHalf] = useState<'left' | 'right' | null>(null);
  const [selectedFlipPlacementId, setSelectedFlipPlacementId] = useState<string | null>(null);
  const [dismissedTurnKey, setDismissedTurnKey] = useState<string | null>(null);

  const turnDialogRef = useRef<HTMLDialogElement>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  const rulesDialogRef = useRef<HTMLDialogElement>(null);

  const isMyTurn = view.currentPlayerId === myId;
  const currentActorName = nameFor(members, view.currentPlayerId);
  const prevActorName = nameFor(members, view.previousPlayerId);

  const mySeatIndex = view.players.indexOf(myId ?? '');

  // 轮到自己行动时的唯一 TurnKey（换轮次/摸牌后自动更新）
  const drawnCardId = me?.drawnCard
    ? me.drawnCard.kind === 'fruit'
      ? `${me.drawnCard.left.fruit}:${me.drawnCard.left.quantity}-${me.drawnCard.right.fruit}:${me.drawnCard.right.quantity}`
      : `monkey:${me.drawnCard.special}`
    : null;
  const turnKey = `${view.round}:${view.phase}:${drawnCardId ?? 'none'}`;

  // 轮次切换或摸牌后重置选择
  useEffect(() => {
    setPendingHalf(null);
    setSelectedFlipPlacementId(null);
  }, [turnKey]);

  const isMyActionPhase = isMyTurn
    && (view.phase === 'turn_action' || view.phase === 'choose_placement' || view.phase === 'choose_flip')
    && Boolean(myId)
    && !isSpectator
    && !isTableScreen;

  const turnSheetOpen = isMyActionPhase && dismissedTurnKey !== turnKey;

  // 轮到行动时震动与提示音
  const prevTurnRef = useRef<boolean>(false);
  useEffect(() => {
    if (isMyTurn && !prevTurnRef.current) {
      playTurnCue();
    }
    prevTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // 同步原生 Dialog 开闭状态
  useEffect(() => {
    const dlg = turnDialogRef.current;
    if (!dlg) return;
    if (turnSheetOpen) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [turnSheetOpen]);

  useEffect(() => {
    const dlg = historyDialogRef.current;
    if (!dlg) return;
    if (historyOpen) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [historyOpen]);

  useEffect(() => {
    const dlg = resultDialogRef.current;
    if (!dlg) return;
    const shouldOpenResult = view.phase === 'challenge_result' && !isTableScreen;
    if (shouldOpenResult) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [view.phase, isTableScreen]);

  useEffect(() => {
    const dlg = rulesDialogRef.current;
    if (!dlg) return;
    if (rulesOpen) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [rulesOpen]);

  // 出牌操作
  const handleConfirmPlacement = useCallback(() => {
    if (!myId || !pendingHalf || busy || view.phase !== 'choose_placement') return;
    void act({ type: 'place_fruit', playerId: myId, checkHalf: pendingHalf });
  }, [act, busy, myId, pendingHalf, view.phase]);

  // 下一轮操作
  const handleNextRound = useCallback(async () => {
    if (!myId || isSpectator || busy) return;
    await act({ type: 'next_round', playerId: myId });
  }, [act, busy, myId, isSpectator]);

  // 其他玩家的头顶牌映射表
  const foreheadMap = useMemo(() => {
    const map = new Map<string, { left: { fruit: DurianFruit; quantity: number }; right: { fruit: DurianFruit; quantity: number } }>();
    me?.visibleForeheadCards?.forEach((entry) => {
      if (entry.card.kind === 'fruit') {
        map.set(entry.playerId, {
          left: entry.card.left,
          right: entry.card.right,
        });
      }
    });
    return map;
  }, [me?.visibleForeheadCards]);

  // 上一手出牌摘要
  const lastPlacementItem = view.tablePlacements.at(-1);
  const lastActionText = useMemo(() => {
    if (!lastPlacementItem) return '新一轮 · 桌面需求已清空';
    if (lastPlacementItem.kind === 'fruit') {
      const { placedBy, card, checkHalf } = lastPlacementItem.data;
      const checked = card[checkHalf];
      const pIndex = view.players.indexOf(placedBy);
      return `${String(pIndex + 1).padStart(2, '0')} 号${nameFor(members, placedBy)}，${FRUIT_NAMES[checked.fruit]} +${checked.quantity}`;
    }
    const { placedBy, card } = lastPlacementItem.data;
    const pIndex = view.players.indexOf(placedBy);
    return `${String(pIndex + 1).padStart(2, '0')} 号${nameFor(members, placedBy)}，打出猴子牌【${MONKEY_SPECIAL_NAMES[card.special]}】`;
  }, [lastPlacementItem, view.players, members]);

  // ── 玩家端与大屏端公共状态 ──
  const otherPlayers = view.players.filter((p) => p !== myId);
  const currentTotals = view.activeTableTotals ?? {};
  const isSimulatorPlayer = isSimulator && !isSpectator;

  return (
    <div className="durian-native-page" data-game="durian" data-card-layout={density}>
      {isTableScreen ? (
        <main className="d-game dt-game" aria-label="榴莲公共桌面">
          <div className="d-page dt-page">
            <header className="d-header dt-header">
              <div className="d-brand">
                <img src="/assets/fruits/fruit-durian.svg" alt="榴莲图标" width={48} height={48} />
                <div>
                  <span className="d-eyebrow">THE FRUIT PARTY</span>
                  <h1>榴莲<span>公共桌面 · 房间共用大屏</span></h1>
                </div>
              </div>
              <div className="dt-head-right">
                <span className="tabletop-screen-badge dt-badge" title="当前设备为房间公共大屏">📺 公共大屏</span>
                <div className="d-round">
                  <span>ROUND</span>
                  <strong id="dt-round">{String(view.round).padStart(2, '0')}</strong>
                  <small>/ <b id="dt-max-round">{String(view.maxRounds || 7).padStart(2, '0')}</b></small>
                </div>
                <button
                  type="button"
                  className="d-button"
                  style={{ minHeight: '36px', padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => setRulesOpen(true)}
                >
                  规则 ↗
                </button>
                <button
                  type="button"
                  className="d-button d-menu-btn"
                  onClick={menu.openMenu}
                  aria-label="打开设置与房间菜单"
                >
                  <Menu size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>菜单</span>
                </button>
              </div>
            </header>

            {/* 全桌累计需求大看板 */}
            <section className="dt-demand" aria-labelledby="dt-demand-title">
              <div className="d-section-heading">
                <h2 id="dt-demand-title">全桌累计需求</h2>
                <span id="dt-demand-note">下家认为某种水果超卖时，可以按铃质疑。</span>
              </div>
              <div className="dt-demand-grid" id="dt-totals">
                {DURIAN_FRUITS.map((fruit) => (
                  <div key={fruit} className="d-total">
                    <FruitIcon fruit={fruit} size={32} />
                    <span className="d-total-name">{FRUIT_NAMES[fruit]}</span>
                    <strong>{view.activeTableTotals?.[fruit] ?? 0}</strong>
                  </div>
                ))}
              </div>
            </section>

            {/* 左右主体：已出牌列 vs 侧边状态 */}
            <div className="dt-body durian-tabletop-arena">
              <section className="dt-placements" aria-labelledby="dt-placements-title">
                <div className="d-section-heading">
                  <h2 id="dt-placements-title">已出牌列</h2>
                  <span id="dt-placement-note">绿底半边计入需求</span>
                </div>
                <div className="dt-placement-list" id="dt-placements">
                  {view.tablePlacements.map((item, idx) => {
                    if (item.kind !== 'fruit') return null;
                    const { card, checkHalf, placedBy } = item.data;
                    const pIndex = view.players.indexOf(placedBy);
                    return (
                      <div key={item.data.placementId || idx} className="dt-placement">
                        <span className="dt-placement__no">{String(pIndex + 1).padStart(2, '0')}</span>
                        <div className="dt-placement__halves">
                          <div className={`dt-half-mini ${checkHalf === 'left' ? 'is-active' : 'is-void'}`}>
                            <FruitIcon fruit={card.left.fruit} size={22} />
                            <span>{FRUIT_NAMES[card.left.fruit]}</span>
                            <b>×{card.left.quantity}</b>
                          </div>
                          <div className={`dt-half-mini ${checkHalf === 'right' ? 'is-active' : 'is-void'}`}>
                            <FruitIcon fruit={card.right.fruit} size={22} />
                            <span>{FRUIT_NAMES[card.right.fruit]}</span>
                            <b>×{card.right.quantity}</b>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <aside className="dt-side">
                <div className="dt-turn" id="dt-turn" role="status">
                  <strong>当前行动 · {currentActorName}</strong>
                  <span>
                    {view.phase === 'game_over'
                      ? '对局结束，胜者诞生！'
                      : view.phase === 'challenge_result'
                        ? '本轮质疑已结算'
                        : `正在进行回合决策（${lastActionText}）`}
                  </span>
                </div>

                <div className="dt-deck" id="dt-deck">
                  <img src="/assets/fruits/fruit-durian.svg" alt="" width={28} height={28} />
                  <div>
                    <span>牌堆剩余</span>
                    <b>{view.deckCount} 张</b>
                  </div>
                </div>

                <section className="dt-players" aria-labelledby="dt-players-title">
                  <div className="d-section-heading">
                    <h2 id="dt-players-title">玩家罚分</h2>
                    <span>超过 7 分淘汰</span>
                  </div>
                  <div className="dt-player-list" id="dt-players">
                    {view.players.map((playerId, idx) => {
                      const isEliminated = (view.eliminatedPlayers ?? []).includes(playerId);
                      const isCurrent = playerId === view.currentPlayerId && view.phase !== 'game_over';
                      const pen = (view.penalties ?? {})[playerId] ?? 0;
                      return (
                        <div
                          key={playerId}
                          className={`dt-player ${isCurrent ? 'is-current' : ''} ${isEliminated ? 'is-eliminated' : ''}`}
                        >
                          <span className="dt-player__no">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="dt-player__name" title={nameFor(members, playerId)}>
                            {nameFor(members, playerId)}
                          </span>
                          <span className="dt-player__pen">
                            罚 <b>{pen}</b>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </aside>
            </div>

            <footer className="dt-footer">
              <p>
                公共桌面只展示全桌公开信息：累计需求、已出牌列、罚分与轮次。
                <b>任何人的头顶牌与当前摸到的牌都不会出现在这块屏幕上。</b>
              </p>
            </footer>
          </div>
        </main>
      ) : (
        <main
          className={`d-game ${isSimulatorPlayer ? 'durian-player-arena durian-player-fullscreen-stand' : ''}`}
          aria-label="榴莲个人操作界面"
        >
          <div className="d-page">
            {/* Header 顶栏 */}
            <header className="d-header">
              <div className="d-brand">
                <img src="/assets/fruits/fruit-durian.svg" alt="榴莲图标" width={48} height={48} />
                <div>
                  <span className="d-eyebrow">THE FRUIT PARTY</span>
                  <h1>榴莲<span>水果生意，心里有数。</span></h1>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="d-round">
                  <span>ROUND</span>
                  <strong id="d-round">{String(view.round).padStart(2, '0')}</strong>
                  <small>/ {String(view.maxRounds || 7).padStart(2, '0')}</small>
                </div>
                <button
                  type="button"
                  className="d-button"
                  style={{ minHeight: '36px', padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => setRulesOpen(true)}
                >
                  规则 ↗
                </button>
                <button
                  type="button"
                  className="d-button d-menu-btn"
                  onClick={menu.openMenu}
                  aria-label="打开设置与房间菜单"
                >
                  <Menu size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>菜单</span>
                </button>
              </div>
            </header>

          <div className="d-layout">
            <section className="d-players-area" aria-labelledby="d-players-heading">
              {/* 玩家区域顶栏 */}
              <div className="d-section-heading">
                <h2 id="d-players-heading">这一桌的水果</h2>
                <label className="d-card-layout">
                  <span>{view.players.length} 人同桌</span>
                  <select
                    id="d-card-layout"
                    aria-label="玩家牌面排版"
                    value={density}
                    onChange={(e) => handleDensityChange(e.target.value as DurianDensity)}
                  >
                    <option value="compact">紧凑总览</option>
                    <option value="comfortable">舒展牌面</option>
                  </select>
                </label>
              </div>

              {/* 其他玩家网格（带头顶牌卡片） */}
              <div className="d-player-grid durian-forehead-bar" id="d-players">
                {otherPlayers.map((playerId) => {
                  const pIndex = view.players.indexOf(playerId);
                  const pName = nameFor(members, playerId);
                  const pen = (view.penalties ?? {})[playerId] ?? 0;
                  const fCard = foreheadMap.get(playerId);

                  return (
                    <article
                      key={playerId}
                      className="d-player"
                      aria-label={`${pIndex + 1}号 ${pName}`}
                    >
                      <div className="d-player-head">
                        <span className="d-number">{String(pIndex + 1).padStart(2, '0')}</span>
                        <span className="d-player-name" title={pName}>{pName}</span>
                        <span className="d-player-penalty">罚 {pen}</span>
                      </div>
                      <div className="d-mini-card">
                        {fCard ? (
                          <>
                            <div className="d-mini-half">
                              <FruitIcon fruit={fCard.left.fruit} size={36} />
                              <span>{FRUIT_NAMES[fCard.left.fruit]} <b>×{fCard.left.quantity}</b></span>
                            </div>
                            <div className="d-mini-half">
                              <FruitIcon fruit={fCard.right.fruit} size={36} />
                              <span>{FRUIT_NAMES[fCard.right.fruit]} <b>×{fCard.right.quantity}</b></span>
                            </div>
                          </>
                        ) : (
                          <div className="d-mini-half" style={{ gridColumn: '1 / -1' }}>
                            <span style={{ color: 'var(--d-muted)' }}>隐藏中</span>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* 本人小果摊 */}
              <div className="d-self">
                <span className="d-number">{String(mySeatIndex + 1).padStart(2, '0')}</span>
                <strong>你的小果摊</strong>
                <span className="d-hidden-card" aria-hidden="true">?</span>
                <span id="d-self-state">
                  {view.phase === 'challenge_result' ? '已在结算中揭晓' : '本人牌已隐藏'}
                </span>
                <span className="d-score">
                  罚分 <b id="d-own-score">{(view.penalties ?? {})[myId ?? ''] ?? 0}</b>
                </span>
              </div>

              {/* 桌面累计需求 */}
              <section className="d-demand durian-center-board" aria-labelledby="d-demand-heading">
                {isMyTurn && view.phase === 'turn_action' && (
                  <span style={{ display: 'none' }}>从牌堆摸一张牌</span>
                )}
                <div className="d-section-heading">
                  <h2 id="d-demand-heading">桌面累计需求</h2>
                  <button
                    type="button"
                    className="d-history-button"
                    id="d-history"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <span>牌列 <b id="d-placement-count">{view.tablePlacements.length}</b> 张</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
                <div className="d-demand-grid" id="d-totals">
                  {DURIAN_FRUITS.map((fruit) => {
                    const count = currentTotals[fruit] ?? 0;
                    const drawn = me?.drawnCard?.kind === 'fruit' ? me.drawnCard : null;
                    const addCount = isMyTurn && view.phase === 'choose_placement' && pendingHalf && drawn && drawn[pendingHalf].fruit === fruit
                      ? drawn[pendingHalf].quantity
                      : null;

                    return (
                      <div key={fruit} className="d-total">
                        <FruitIcon fruit={fruit} size={28} />
                        <span className="d-total-name">{FRUIT_NAMES[fruit]}</span>
                        <strong>{count}</strong>
                        {addCount !== null && <small>+{addCount}</small>}
                      </div>
                    );
                  })}
                </div>
              </section>
            </section>
          </div>
        </div>

        {/* 底部收起后的恢复条 */}
        <div
          id="d-resume-bar"
          className="d-actions"
          hidden={!isMyActionPhase || turnSheetOpen}
        >
          <span id="d-turn-summary" role="status">
            {view.phase === 'turn_action'
              ? '轮到你 · 摸牌或质疑'
              : view.phase === 'choose_flip'
                ? selectedFlipPlacementId
                  ? '已选翻牌目标 · 尚未提交'
                  : '摸到翻转猴 · 请选择翻牌目标'
                : pendingHalf
                  ? '已选半边 · 尚未提交'
                  : '已摸牌 · 请选择半边'}
          </span>
          <button
            type="button"
            id="d-resume"
            className="d-button d-primary"
            onClick={() => setDismissedTurnKey(null)}
          >
            继续我的回合 →
          </button>
        </div>

        {/* 默认常驻底部操作栏（等待中或非自己回合时） */}
        {!isMyActionPhase && (
          <footer className="d-actions" id="d-actions">
            <div className="d-action-copy">
              <strong>
                {view.phase === 'game_over'
                  ? '本场水果派对已结束'
                  : `轮到 ${currentActorName}`}
              </strong>
              <span>
                {view.phase === 'challenge_result'
                  ? '正在进行本轮质疑结算'
                  : '等待当前玩家摸牌或质疑'}
              </span>
            </div>
            {view.phase === 'challenge_result' && myId && (
              <button
                type="button"
                className="d-button d-primary"
                onClick={handleNextRound}
                disabled={busy}
              >
                开始下一轮 →
              </button>
            )}
          </footer>
        )}
      </main>
    )}

      {/* ── 原生弹窗 1：轮到你的回合操作弹窗（d-turn-dialog） ── */}
      <dialog
        ref={turnDialogRef}
        className="d-dialog d-turn-dialog"
        id="d-turn-dialog"
        aria-labelledby="d-turn-title"
      >
        <header className="d-dialog-header">
          <strong>你的回合 · {String(mySeatIndex + 1).padStart(2, '0')} 号</strong>
          <button
            type="button"
            className="d-button"
            onClick={() => setDismissedTurnKey(turnKey)}
          >
            收起看桌面
          </button>
        </header>
        <div className="d-dialog-body">
          <section className="d-play-area" aria-labelledby="d-turn-title">
            <div className="d-turn-heading">
              <span className="d-turn-dot" aria-hidden="true" />
              <div>
                <span className="d-eyebrow" id="d-turn-caption">
                  轮到你了 · {String(mySeatIndex + 1).padStart(2, '0')} 号
                </span>
                <h2 id="d-turn-title">
                  {view.phase === 'turn_action'
                    ? '再接一单，还是按铃？'
                    : view.phase === 'choose_flip'
                      ? '猴子功能牌'
                      : '哪一半，算数？'}
                </h2>
              </div>
              <span className="d-deck-count">
                牌堆 <b id="d-deck-count">{view.deckCount}</b>
              </span>
            </div>

            {/* 舞台卡片区域 */}
            <div className="d-card-stage" id="d-card-stage">
              {view.phase === 'turn_action' && (
                <div className="d-deck" aria-label="待抽牌堆">
                  <FruitIcon fruit="durian" size={60} />
                  <strong>DURIAN</strong>
                  <small>FRUIT MARKET</small>
                </div>
              )}

              {view.phase === 'choose_placement' && me?.drawnCard?.kind === 'fruit' && (
                <div className="d-drawn-card" role="group" aria-label="选择当前抽牌的生效半边">
                  {(['left', 'right'] as const).map((side) => {
                    const half = me.drawnCard!.kind === 'fruit' ? me.drawnCard![side] : null;
                    if (!half) return null;
                    const isSelected = pendingHalf === side;
                    return (
                      <button
                        key={side}
                        type="button"
                        className="d-half"
                        aria-pressed={isSelected}
                        onClick={() => setPendingHalf(side)}
                      >
                        <span className="d-half-label">{side === 'left' ? '左半边' : '右半边'}</span>
                        <FruitIcon fruit={half.fruit} size={64} />
                        <span className="d-half-fruit">
                          {FRUIT_NAMES[half.fruit]} <b>×{half.quantity}</b>
                        </span>
                        <span className="d-check">
                          {isSelected ? '✓ 选中生效' : '选择这半边'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {view.phase === 'choose_flip' && me?.drawnCard?.kind === 'monkey' && (
                <div className="d-monkey-stage" style={{ textAlign: 'center', width: '100%' }}>
                  <FruitIcon fruit="monkey" size={54} />
                  <h3 style={{ margin: '8px 0 4px', fontSize: '16px' }}>{MONKEY_SPECIAL_NAMES[me.drawnCard.special]}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--d-muted)', marginBottom: '12px' }}>
                    {MONKEY_SPECIAL_DESCS[me.drawnCard.special]}
                  </p>

                  {me.drawnCard.special === 'flip' && (
                    <div className="d-flip-targets" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', textAlign: 'left', padding: '4px' }}>
                      {view.tablePlacements.filter((p) => p.kind === 'fruit').map((item, idx) => {
                        if (item.kind !== 'fruit') return null;
                        const { placementId, card, checkHalf, placedBy } = item.data;
                        const isSelected = selectedFlipPlacementId === placementId;
                        const pIndex = view.players.indexOf(placedBy);
                        const pName = nameFor(members, placedBy);
                        const flippedHalf = checkHalf === 'left' ? 'right' : 'left';
                        return (
                          <button
                            key={placementId}
                            type="button"
                            className={`d-flip-target-item ${isSelected ? 'is-selected' : ''}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              border: isSelected ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
                              background: isSelected ? 'rgba(34, 197, 94, 0.18)' : 'rgba(0,0,0,0.25)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              color: '#fff',
                            }}
                            onClick={() => setSelectedFlipPlacementId(placementId)}
                          >
                            <span>{pIndex + 1}号 {pName}（第{idx + 1}手）</span>
                            <span style={{ fontSize: '12px' }}>
                              生效: {FRUIT_NAMES[card[checkHalf].fruit]} ×{card[checkHalf].quantity}
                              {' → 翻转为: '}
                              <strong style={{ color: '#4ade80' }}>{FRUIT_NAMES[card[flippedHalf].fruit]} ×{card[flippedHalf].quantity}</strong>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="d-play-hint" id="d-play-hint">
              {view.phase === 'turn_action'
                ? (view.tablePlacements.length ? '相信库存够，就摸牌；觉得超卖，就质疑上一家。' : '新一轮开始，摸一张牌，开张吧。')
                : view.phase === 'choose_flip'
                  ? (selectedFlipPlacementId ? '已选定翻转目标牌，点击下方确认翻转。' : '请在上方列表中点击选择一张桌面水果牌翻面。')
                  : pendingHalf && me?.drawnCard?.kind === 'fruit'
                    ? `本手增加 ${me.drawnCard[pendingHalf].quantity} 个${FRUIT_NAMES[me.drawnCard[pendingHalf].fruit]}；另一半不计入。`
                    : '选一半水果，加入这桌的需求。'}
            </p>

            <div className="d-turn-footnote">
              <span id="d-last-action">上一手 · {lastActionText}</span>
              <span>第 <b id="d-turn-number">{view.tablePlacements.length + 1}</b> 手</span>
            </div>
          </section>
        </div>

        {/* 弹窗底部操作 */}
        <div id="d-turn-action-host">
          <footer className="d-actions" style={{ position: 'static' }}>
            {view.phase === 'turn_action' && (
              <>
                <div className="d-action-copy">
                  <strong>{String(mySeatIndex + 1).padStart(2, '0')} 号 · 由你决定</strong>
                  <span>{view.tablePlacements.length ? '摸牌后本回合不能再质疑' : '这一轮的第一单'}</span>
                </div>
                {view.previousPlayerId && (
                  <button
                    type="button"
                    className="d-button d-bell-button"
                    id="d-challenge"
                    disabled={busy}
                    onClick={() => {
                      if (myId) void act({ type: 'challenge', playerId: myId });
                    }}
                  >
                    🔔 按铃质疑 ({prevActorName})
                  </button>
                )}
                <button
                  type="button"
                  className="d-button d-primary"
                  id="d-draw"
                  disabled={busy || view.deckCount === 0}
                  onClick={() => {
                    if (myId) void act({ type: 'draw_card', playerId: myId });
                  }}
                >
                  摸一张牌 →
                </button>
              </>
            )}

            {view.phase === 'choose_placement' && (
              <>
                <div className="d-action-copy">
                  <strong>
                    {pendingHalf && me?.drawnCard?.kind === 'fruit'
                      ? `已选${FRUIT_NAMES[me.drawnCard[pendingHalf].fruit]} +${me.drawnCard[pendingHalf].quantity}`
                      : '你已摸牌，请选一半'}
                  </strong>
                  <span>确认后轮到下一位玩家</span>
                </div>
                <button
                  type="button"
                  className="d-button d-primary"
                  id="d-place"
                  disabled={busy || !pendingHalf}
                  onClick={handleConfirmPlacement}
                >
                  {pendingHalf ? '确认出牌 →' : '请选择生效半边'}
                </button>
              </>
            )}

            {view.phase === 'choose_flip' && (
              <>
                <div className="d-action-copy">
                  <strong>猴子出动 · 翻转桌面</strong>
                  <span>{selectedFlipPlacementId ? '已选定目标水果牌，点击确认生效' : '请在上方列表中选择要翻转的水果牌'}</span>
                </div>
                <button
                  type="button"
                  className="d-button d-primary"
                  id="d-flip"
                  disabled={busy || !selectedFlipPlacementId}
                  onClick={() => {
                    if (myId && selectedFlipPlacementId) {
                      void act({
                        type: 'select_flip_target',
                        playerId: myId,
                        targetPlacementId: selectedFlipPlacementId,
                      });
                    }
                  }}
                >
                  {selectedFlipPlacementId ? '确认翻转 →' : '请先选牌'}
                </button>
              </>
            )}
          </footer>
        </div>
      </dialog>

      {/* ── 原生弹窗 2：已出牌列历史（d-history-dialog） ── */}
      <dialog
        ref={historyDialogRef}
        className="d-dialog"
        id="d-history-dialog"
        aria-labelledby="d-history-title"
      >
        <header className="d-dialog-header">
          <div>
            <span className="d-eyebrow">TABLE CARDS</span>
            <h2 id="d-history-title">已出牌列</h2>
          </div>
          <button
            type="button"
            className="d-close"
            onClick={() => setHistoryOpen(false)}
            aria-label="关闭已出牌列"
          >
            ×
          </button>
        </header>
        <div className="d-dialog-body">
          <p className="d-dialog-intro">绿色半边计入需求；另一半不计入。</p>
          <div className="d-history-list" id="d-history-list">
            {view.tablePlacements.length > 0 ? (
              view.tablePlacements.map((item, idx) => {
                if (item.kind !== 'fruit') return null;
                const { card, checkHalf, placedBy } = item.data;
                const pIndex = view.players.indexOf(placedBy);
                return (
                  <div key={item.data.placementId || idx} className="d-history-row">
                    <div className="d-history-meta">
                      <strong>第 {idx + 1} 手</strong>
                      <span>{String(pIndex + 1).padStart(2, '0')} 号</span>
                    </div>
                    <div className={`d-history-half ${checkHalf === 'left' ? 'is-active' : ''}`}>
                      <FruitIcon fruit={card.left.fruit} size={24} />
                      <span>{FRUIT_NAMES[card.left.fruit]}</span>
                      <b>×{card.left.quantity}</b>
                    </div>
                    <div className={`d-history-half ${checkHalf === 'right' ? 'is-active' : ''}`}>
                      <FruitIcon fruit={card.right.fruit} size={24} />
                      <span>{FRUIT_NAMES[card.right.fruit]}</span>
                      <b>×{card.right.quantity}</b>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="d-dialog-intro">新一轮尚未出牌，桌面需求为 0。</p>
            )}
          </div>
        </div>
        <footer className="d-dialog-footer">
          <button
            type="button"
            className="d-button d-primary"
            onClick={() => setHistoryOpen(false)}
          >
            返回桌面
          </button>
        </footer>
      </dialog>

      {/* ── 原生弹窗 3：质疑结算弹窗（d-result-dialog） ── */}
      <dialog
        ref={resultDialogRef}
        className="d-dialog"
        id="d-result-dialog"
        aria-labelledby="d-result-title"
      >
        <header className="d-dialog-header">
          <div>
            <span className="d-eyebrow">THE BELL HAS RUNG</span>
            <h2 id="d-result-title">
              {view.lastChallenge?.success ? '质疑成功' : '质疑失败'}
            </h2>
          </div>
          <button
            type="button"
            className="d-close"
            onClick={() => resultDialogRef.current?.close()}
            aria-label="关闭结算"
          >
            ×
          </button>
        </header>
        <div className="d-dialog-body" id="d-result-body">
          {view.lastChallenge && (
            <>
              <div className="d-verdict">
                <strong>
                  {view.lastChallenge.oversoldFruits.length > 0 && view.lastChallenge.oversoldFruits[0]
                    ? `${FRUIT_NAMES[view.lastChallenge.oversoldFruits[0]]}不够了！需求超出库存`
                    : '所有水果库存充足'}
                </strong>
                <p>
                  {nameFor(members, view.lastChallenge.challengerId)} 按铃，质疑{' '}
                  {nameFor(members, view.lastChallenge.accusedId)}。
                  {view.lastChallenge.success
                    ? '有水果桌面需求超出了全场总库存，质疑成立！'
                    : '桌面需求均未超出全场实际总库存，质疑不成立。'}
                </p>
              </div>

              <table className="d-result-table">
                <thead>
                  <tr>
                    <th>水果</th>
                    <th>桌面需求</th>
                    <th>实际库存</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {DURIAN_FRUITS.map((fruit) => {
                    const dCount = view.lastChallenge!.tableTotals[fruit] ?? 0;
                    const sCount = view.lastChallenge!.stockTotals[fruit] ?? 0;
                    const isOver = view.lastChallenge!.oversoldFruits.includes(fruit);
                    return (
                      <tr key={fruit} className={isOver ? 'is-over' : ''}>
                        <td>
                          <span>
                            <FruitIcon fruit={fruit} size={20} />
                            {FRUIT_NAMES[fruit]}
                          </span>
                        </td>
                        <td>{dCount}</td>
                        <td>{sCount}</td>
                        <td>{isOver ? `超卖 ${dCount - sCount}` : '充足'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="d-penalty">
                <span>
                  {nameFor(members, view.lastChallenge.loserId)} · 累计罚分{' '}
                  {(view.penalties ?? {})[view.lastChallenge.loserId] ?? 0} 分
                </span>
                <b>罚 +{view.lastChallenge.penaltyPoints}</b>
              </div>
              <p className="d-result-note">
                第 {view.round} 轮罚 {view.lastChallenge.penaltyPoints} 分。点击下方按钮进入下一轮。
              </p>
            </>
          )}
        </div>
        <footer className="d-dialog-footer">
          <span>罚分越少越好</span>
          <button
            type="button"
            className="d-button d-primary"
            id="d-next-round"
            onClick={handleNextRound}
            disabled={busy}
          >
            开始下一轮 →
          </button>
        </footer>
      </dialog>

      {/* ── 原生弹窗 4：本局规则说明（rules-dialog） ── */}
      <dialog
        ref={rulesDialogRef}
        className="d-dialog"
        id="d-rules-dialog"
        aria-labelledby="d-rules-title"
      >
        <header className="d-dialog-header">
          <div>
            <span className="d-eyebrow">RULEBOOK</span>
            <h2 id="d-rules-title">榴莲 · 规则说明</h2>
          </div>
          <button
            type="button"
            className="d-close"
            onClick={() => setRulesOpen(false)}
            aria-label="关闭规则"
          >
            ×
          </button>
        </header>
        <div className="d-dialog-body">
          <h3 style={{ fontSize: '14px', margin: '0 0 6px', color: 'var(--d-green-dark)' }}>
            1. 头顶暗牌与公共可见
          </h3>
          <p className="d-dialog-intro">
            开局每位玩家获得一张头顶牌（自己看不到，全桌其他人看得清清楚楚）。全桌所有人的头顶牌总和即为本店「实际总库存」。
          </p>

          <h3 style={{ fontSize: '14px', margin: '12px 0 6px', color: 'var(--d-green-dark)' }}>
            2. 出牌生效与桌面需求
          </h3>
          <p className="d-dialog-intro">
            轮到自己时摸一张水果牌，选择绿色的一半作为「生效」，另一半作废。生效的水果数量累计加入桌面的「累计需求」。
          </p>

          <h3 style={{ fontSize: '14px', margin: '12px 0 6px', color: 'var(--d-green-dark)' }}>
            3. 按铃质疑与罚分
          </h3>
          <p className="d-dialog-intro">
            如果你认为桌面上某种水果的需求已经超过了全桌库存，可以在摸牌前按铃质疑上家！
            质疑成功，上家受罚；质疑失败，自己受罚。第 N 轮受罚扣 N 分，累计超过 7 分淘汰！
          </p>
        </div>
        <footer className="d-dialog-footer">
          <button
            type="button"
            className="d-button d-primary"
            onClick={() => setRulesOpen(false)}
          >
            知道了，返回对局
          </button>
        </footer>
      </dialog>

      {/* ── 平台标准快捷菜单抽屉 ── */}
      <TabletopMenuDrawer
        isOpen={menu.isOpen}
        onClose={menu.closeMenu}
        gameTitle="榴莲（DURIAN）"
        muted={menu.muted}
        onToggleSound={menu.toggleSound}
        onShowRules={() => setRulesOpen(true)}
        onStepOut={menu.stepOut}
        onLeaveRoom={menu.requestLeave}
        onDissolveRoom={menu.requestDissolve}
        isHost={menu.isHost}
        customActions={
          <>
            <button
              type="button"
              className="tabletop-drawer-item"
              onClick={() => {
                handleDensityChange(density === 'compact' ? 'comfortable' : 'compact');
              }}
            >
              <span className="tabletop-drawer-item__icon" aria-hidden="true">
                <LayoutGrid size={20} strokeWidth={2.2} />
              </span>
              <div className="tabletop-drawer-item__text">
                <strong>卡牌排版：{density === 'compact' ? '紧凑总览' : '舒展牌面'}</strong>
                <span>点击切换为{density === 'compact' ? '舒展大牌面' : '紧凑总览模式'}</span>
              </div>
            </button>

            <button
              type="button"
              className="tabletop-drawer-item"
              onClick={() => {
                menu.closeMenu();
                setHistoryOpen(true);
              }}
            >
              <span className="tabletop-drawer-item__icon" aria-hidden="true">
                <History size={20} strokeWidth={2.2} />
              </span>
              <div className="tabletop-drawer-item__text">
                <strong>对局出牌历史</strong>
                <span>查看本局桌面放置的全部水果与猴子牌</span>
              </div>
            </button>
          </>
        }
      />

      {/* ── 退出 / 解散确认对话框 ── */}
      {menu.confirmKind && (
        <ConfirmDialog
          title={
            menu.confirmKind === 'dissolve'
              ? '解散房间'
              : menu.isHost
              ? '房主退出 / 解散选项'
              : '暂离或退出房间'
          }
          message={
            menu.confirmKind === 'dissolve'
              ? '确定要解散当前房间吗？对局将立即终止，所有玩家将被移出。'
              : menu.isHost
              ? '您是房主。选择「暂离返回主页」可保持房间在后台运行，其他朋友可继续正常游玩；选择「仅退出」将自动转让房主；选择「解散房间」将关闭房间。'
              : '选择「暂离返回主页」将保留您的席位，可在主页顶部随时一键返回；选择「退出房间」将释放席位。'
          }
          confirmLabel="暂离返回主页"
          secondaryLabel={
            menu.confirmKind === 'dissolve'
              ? '确认解散'
              : menu.isHost
              ? '解散房间'
              : '彻底退出'
          }
          onSecondary={
            menu.confirmKind === 'dissolve'
              ? menu.confirmDissolveRoom
              : menu.isHost
              ? menu.confirmDissolveRoom
              : menu.confirmLeaveRoom
          }
          destructive={menu.confirmKind === 'dissolve' || menu.isHost}
          busy={menu.busy}
          onConfirm={menu.confirmKind === 'dissolve' ? menu.cancelConfirm : menu.stepOut}
          onCancel={menu.cancelConfirm}
        />
      )}

      {/* 错误提示浮层 */}
      {error && (
        <aside
          role="alert"
          style={{
            position: 'fixed',
            bottom: '75px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#832731',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 100,
          }}
        >
          {error}
        </aside>
      )}
    </div>
  );
}
