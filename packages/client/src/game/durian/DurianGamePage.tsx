import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { FruitIcon, FruitGroup } from './FruitGraphic.tsx';
import {
  DURIAN_FRUITS,
  FRUIT_EMOJIS,
  FRUIT_NAMES,
  MONKEY_SPECIAL_DESCS,
  MONKEY_SPECIAL_NAMES,
  type DurianCard,
  type DurianPlayerView,
} from './types.ts';

function phaseLabel(phase: DurianPlayerView['phase']): string {
  switch (phase) {
    case 'turn_action': return '回合行动';
    case 'choose_placement': return '选择生效方向';
    case 'choose_flip': return '选择翻转目标';
    case 'challenge_result': return '质疑结算';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

type DeviceRole = 'table' | 'player';

interface Props {
  view: DurianPlayerView;
}

function RollingNumber({ value, delay = 0 }: { value: number; delay?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    let startTimestamp: number | null = null;
    let animationFrameId: number;
    const duration = 650;
    const timer = setTimeout(() => {
      setIsRolling(true);
      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(ease * value);
        setDisplayValue(current);
        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setDisplayValue(value);
          setIsRolling(false);
        }
      };
      animationFrameId = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [value, delay]);

  return (
    <span className={`durian-rolling-number ${isRolling ? 'is-rolling' : 'is-landed'}`}>
      {displayValue}
    </span>
  );
}

export function DurianGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => {
    const saved = localStorage.getItem('ldj_durian_device_role');
    return saved === 'table' || saved === 'player' ? saved : 'player';
  });

  const selectDeviceRole = (role: DeviceRole) => {
    setDeviceRole(role);
    localStorage.setItem('ldj_durian_device_role', role);
  };

  const isMyTurn = view.currentPlayerId === myId;
  const currentActorName = nameFor(members, view.currentPlayerId);
  const prevActorName = nameFor(members, view.previousPlayerId);

  const isRevealed = view.mode === 'standard' && (view.phase === 'challenge_result' || view.phase === 'game_over');

  const activeShowdownFruits = view.lastChallenge
    ? DURIAN_FRUITS.filter(
        (fruit) => (view.lastChallenge?.tableTotals?.[fruit] ?? 0) > 0 || (view.lastChallenge?.stockTotals?.[fruit] ?? 0) > 0,
      )
    : [];

  const [animPlaying, setAnimPlaying] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(5);
  useEffect(() => {
    if (view.phase !== 'challenge_result' || view.mode !== 'standard') {
      setAnimPlaying(false);
      setCountdown(5);
      return;
    }
    // 特效播放阶段（中间所有卡牌翻牌、数字翻滚、盖章砸落）总计约 1.8 秒
    setAnimPlaying(true);
    setCountdown(5);
    const totalAnimDurationMs = Math.max(1800, 1200 + activeShowdownFruits.length * 150);

    const delayTimer = setTimeout(() => {
      setAnimPlaying(false);
      setCountdown(5);

      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            if (myId && !isSpectator) {
              void act({ type: 'next_round', playerId: myId });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }, totalAnimDurationMs);

    return () => {
      clearTimeout(delayTimer);
    };
  }, [view.phase, view.round, view.mode, myId, isSpectator, activeShowdownFruits.length]);

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'choose_placement'
      ? isMyTurn
        ? '请选择你要将哪半边水果放在 ✓（生效清单）'
        : `等待 ${currentActorName} 选择水果牌生效方向`
      : view.phase === 'choose_flip'
        ? isMyTurn
          ? '请在桌面上点选一张水果牌以翻转其生效方向'
          : `等待 ${currentActorName} 选择翻转哪张水果牌`
        : view.phase === 'challenge_result'
          ? (view.mode === 'standard' ? (animPlaying ? '正在结算动效…' : `本轮质疑已结算，${countdown} 秒后开始下一轮`) : '本轮质疑已结算，点击下方按钮开始下一轮')
          : isMyTurn
            ? '轮到你的回合，可选择摸牌或质疑上家'
            : `等待 ${currentActorName} 思考（摸牌或质疑）`;

  const players = view.players.map((playerId) => {
    const isEliminated = (view.eliminatedPlayers ?? []).includes(playerId);
    const penalty = (view.penalties ?? {})[playerId] ?? 0;
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status: isEliminated ? '已淘汰' : `罚分 ${penalty}/7`,
      active: playerId === view.currentPlayerId && view.phase !== 'game_over',
    };
  });

  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];
  let equalOptions: Parameters<typeof ActionDock>[0]['equalOptions'] = undefined;

  if (view.phase === 'turn_action' && isMyTurn && myId) {
    primary = {
      id: 'draw',
      label: '从牌堆摸一张牌 🎴',
      disabled: view.deckCount === 0,
      onAction: () => void act({ type: 'draw_card', playerId: myId }),
    };
    if (view.previousPlayerId) {
      secondary = [
        {
          id: 'challenge',
          label: `🔔 质疑上家 (${prevActorName})`,
          disabled: false,
          onAction: () => void act({ type: 'challenge', playerId: myId }),
        },
      ];
    }
  } else if (view.phase === 'choose_placement' && isMyTurn && myId && me?.drawnCard && me.drawnCard.kind === 'fruit') {
    const card = me.drawnCard;
    // 左右两侧选项均设为白色中立控件，避免给玩家产生引导偏差
    equalOptions = [
      {
        id: 'place-left',
        label: `✓ 生效左边【${FRUIT_EMOJIS[card.left.fruit]} ${FRUIT_NAMES[card.left.fruit]} ×${card.left.quantity}】`,
        disabled: false,
        onAction: () => void act({ type: 'place_fruit', playerId: myId, checkHalf: 'left' }),
      },
      {
        id: 'place-right',
        label: `✓ 生效右边【${FRUIT_EMOJIS[card.right.fruit]} ${FRUIT_NAMES[card.right.fruit]} ×${card.right.quantity}】`,
        disabled: false,
        onAction: () => void act({ type: 'place_fruit', playerId: myId, checkHalf: 'right' }),
      },
    ];
  } else if (view.phase === 'challenge_result' && myId) {
    primary = {
      id: 'next-round',
      label: view.mode === 'standard' && countdown > 0 ? `开始下一轮 (${countdown}s) ➡️` : '开始下一轮 ➡️',
      disabled: false,
      onAction: () => void act({ type: 'next_round', playerId: myId }),
    };
  }

  function renderCardGraphic(
    card: DurianCard,
    checkHalf?: 'left' | 'right',
    options: { showBadge?: boolean; size?: number; isLarge?: boolean } = {},
  ) {
    const { showBadge = true, size = 44, isLarge = false } = options;

    if (card.kind === 'monkey') {
      return (
        <div className={`durian-card durian-card--monkey ${isLarge ? 'durian-card--large' : ''}`}>
          <FruitIcon fruit="monkey" size={isLarge ? 64 : 36} />
          <div className="durian-card-monkey__details">
            <span className="durian-card-monkey__label">{MONKEY_SPECIAL_NAMES[card.special]}</span>
            {isLarge && <small style={{ opacity: 0.85 }}>{MONKEY_SPECIAL_DESCS[card.special]}</small>}
          </div>
        </div>
      );
    }

    let leftHalf = card.left;
    let rightHalf = card.right;
    let isLeftChecked = checkHalf === 'left';
    let isRightChecked = checkHalf === 'right';

    if (checkHalf === 'left') {
      leftHalf = card.right;
      rightHalf = card.left;
      isLeftChecked = false;
      isRightChecked = true;
    }

    return (
      <div className={`durian-card ${isLarge ? 'durian-card--large' : ''}`}>
        <div
          className={`durian-card-half durian-card-half--${leftHalf.fruit} ${
            checkHalf !== undefined ? (isLeftChecked ? 'durian-card-half--checked' : 'durian-card-half--crossed') : ''
          }`}
        >
          <FruitGroup fruit={leftHalf.fruit} quantity={leftHalf.quantity} size={size} stacked={false} />
          <span className="durian-card-half__name">{FRUIT_NAMES[leftHalf.fruit]}</span>
          {showBadge && <span className="durian-card-half__badge">×{leftHalf.quantity}</span>}
        </div>

        <div
          className={`durian-card-half durian-card-half--${rightHalf.fruit} ${
            checkHalf !== undefined ? (isRightChecked ? 'durian-card-half--checked' : 'durian-card-half--crossed') : ''
          }`}
        >
          <FruitGroup fruit={rightHalf.fruit} quantity={rightHalf.quantity} size={size} stacked={false} />
          <span className="durian-card-half__name">{FRUIT_NAMES[rightHalf.fruit]}</span>
          {showBadge && <span className="durian-card-half__badge">×{rightHalf.quantity}</span>}
        </div>
      </div>
    );
  }

  const headerControls = (
    <div className="durian-top-controls">
      {view.mode === 'simulator' && (
        <div className="durian-role-switch" role="group" aria-label="设备用途选择">
          <button
            type="button"
            className={`durian-role-pill ${deviceRole === 'player' ? 'is-active' : ''}`}
            onClick={() => selectDeviceRole('player')}
            title="作为玩家个人设备使用（持在手中/置于面前）"
          >
            <span className="durian-btn-icon">📱</span>
            <span className="durian-btn-text">玩家端</span>
          </button>
          <button
            type="button"
            className={`durian-role-pill ${deviceRole === 'table' ? 'is-active' : ''}`}
            onClick={() => selectDeviceRole('table')}
            title="作为桌面中央公共设备使用（平放于桌面正中）"
          >
            <span className="durian-btn-icon">🖥️</span>
            <span className="durian-btn-text">桌面端</span>
          </button>
        </div>
      )}
      <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
        <span className="durian-btn-icon">📜</span>
        <span className="durian-btn-text">本局规则</span>
      </button>
    </div>
  );

  const isSimulator = view.mode === 'simulator';
  const isSimulatorTable = isSimulator && deviceRole === 'table';
  const isSimulatorPlayer = isSimulator && deviceRole === 'player';

  const myForeheadEntry = me?.visibleForeheadCards?.find((e) => e.playerId === myId);

  return (
    <TabletopShell
      title="During"
      phase={`第 ${view.round}/${view.maxRounds} 轮 · ${phaseLabel(view.phase)}${
        isSimulator ? (deviceRole === 'table' ? ' · 🖥️ 桌面中央端' : ' · 📱 玩家手牌端') : ''
      }`}
      gameId="durian"
      phaseKey={`${view.phase}:${view.round}:${view.currentPlayerId ?? view.previousPlayerId ?? 'idle'}:${view.lastChallenge ? `${view.lastChallenge.challengerId}:${view.lastChallenge.loserId}` : view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : 'active'}`}
      spectator={isSpectator}
      players={players}
      theme="orchard"
      hideSeats={isSimulator}
      rulesButton={headerControls}
      actions={
        !isSimulatorTable ? (
          primary || (equalOptions && equalOptions.length > 0) ? (
            <ActionDock primary={primary} secondary={secondary} equalOptions={equalOptions} busy={busy} waitingReason={waitingReason ?? undefined} />
          ) : (
            <ActionDock primary={{ id: 'wait', label: '等待本回合推进…', disabled: true, onAction: () => {} }} busy={busy} waitingReason={waitingReason ?? undefined} />
          )
        ) : undefined
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>🎮 印度扑克式翻牌质疑机制</h4>
          <p>1. <strong>头顶暗牌</strong>：开局每人抽一张牌顶在头上，自己看不到，其他所有人都看得到。</p>
          <p>2. <strong>翻牌与生效</strong>：轮到自己时摸一张牌，选择将左侧还是右侧放在 ✓ 计入桌面总数（另一侧 ✗ 作废）。</p>
          <p>3. <strong>质疑判定</strong>：如果认为桌面上某种水果的累计数量已经超过了所有人头顶牌中该水果的总和，即可按铃质疑上家。</p>
          <p>4. <strong>胜负与扣分</strong>：质疑成功则上家输，质疑失败则质疑者输。第 1 轮输家扣 1 分、第 2 轮扣 2 分…累计超 7 分淘汰！7 轮后罚分最少者获胜。</p>
          <h4>🐒 猴子功能牌</h4>
          <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
            <li><strong>翻转卡牌</strong>：选择桌面上已放置的一张水果牌，将其 ✓ 和 ✗ 方向互换。</li>
            <li><strong>无事发生</strong>：跳过本回合，直接轮到下家（下家仍可质疑你）。</li>
            <li><strong>3个水果无效</strong>：桌面上所有标注为 3 个的水果格子全部失效。</li>
            <li><strong>所有香蕉无效</strong>：桌面上所有香蕉全部不计入总数。</li>
          </ul>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      <div className={`durian-stage ${isSimulatorTable ? 'durian-stage--simulator-table' : ''} ${isSimulatorPlayer ? 'durian-stage--simulator-player' : ''}`}>
        
        {isSimulatorTable ? (
          <div className="durian-tabletop-arena">
            <aside className="durian-table-counter durian-table-counter--left" aria-label="桌面生效水果统计（正向）">
              <div className="durian-counter-header">
                <span className="durian-counter-header__icon">🍎</span>
                <span className="durian-counter-header__title">桌面需求 (✓)</span>
              </div>
              <div className="durian-counter-list">
                {DURIAN_FRUITS.map((fruit) => (
                  <div key={fruit} className="durian-counter-item">
                    <FruitIcon fruit={fruit} size={26} />
                    <span className="durian-counter-name">{FRUIT_NAMES[fruit]}</span>
                    <span className="durian-counter-pill">{(view.activeTableTotals ?? {})[fruit] ?? 0}</span>
                  </div>
                ))}
              </div>
            </aside>

            <section className="durian-table-center-board" aria-label="中央出牌看板">
              <div className="durian-board-header">
                <div className="durian-board-header__half durian-board-header__half--crossed">
                  <span className="durian-board-header__sign">❌</span>
                  <span className="durian-board-header__label">作废不计 (✗)</span>
                </div>
                <div className="durian-board-header__spine" />
                <div className="durian-board-header__half durian-board-header__half--checked">
                  <span className="durian-board-header__sign">✅</span>
                  <span className="durian-board-header__label">桌面生效 (✓)</span>
                </div>
              </div>

              <div className="durian-board-stack-scroll">
                <div className="durian-board-cards-stack">
                  {(view.tablePlacements ?? []).length === 0 ? (
                    <div className="durian-board-empty">
                      <span style={{ fontSize: '2rem' }}>🎴</span>
                      <strong>桌面上暂无出牌</strong>
                      <small>点击左下角摸牌并选择生效半边</small>
                    </div>
                  ) : (
                    (view.tablePlacements ?? []).map((placement, index) => {
                      const isFlipTarget = view.phase === 'choose_flip' && isMyTurn && placement.kind === 'fruit';
                      // 前 4 张完整展示；第 5 张起 (index >= 4) 切换为精简紧凑条展示 (带 ×几 标识)
                      const isCompact = index >= 4;

                      if (placement.kind === 'monkey') {
                        return (
                          <div
                            key={placement.data.placementId}
                            className={`durian-board-card-row ${isCompact ? 'is-compact' : 'is-stacked'}`}
                            style={{ zIndex: index + 1 }}
                          >
                            <span className="durian-board-card-index">#{index + 1}</span>
                            {isCompact ? (
                              <div className="durian-card-compact durian-card-compact--monkey">
                                <FruitIcon fruit="monkey" size={20} />
                                <span className="durian-compact-label">🐒 {MONKEY_SPECIAL_NAMES[placement.data.card.special]}</span>
                              </div>
                            ) : (
                              renderCardGraphic(placement.data.card, undefined, { showBadge: false, size: 36 })
                            )}
                          </div>
                        );
                      }

                      const fruitCard = placement.data.card;
                      const isLeftChecked = placement.data.checkHalf === 'left';
                      const crossedHalf = isLeftChecked ? fruitCard.right : fruitCard.left;
                      const checkedHalf = isLeftChecked ? fruitCard.left : fruitCard.right;

                      return (
                        <div
                          key={placement.data.placementId}
                          className={`durian-board-card-row ${isCompact ? 'is-compact' : 'is-stacked'} ${isFlipTarget ? 'is-flip-target' : ''}`}
                          style={{ zIndex: index + 1 }}
                          onClick={() => {
                            if (isFlipTarget && myId) {
                              void act({
                                type: 'select_flip_target',
                                playerId: myId,
                                targetPlacementId: placement.data.placementId,
                              });
                            }
                          }}
                        >
                          <span className="durian-board-card-index">#{index + 1}</span>
                          {isCompact ? (
                            <div className="durian-card-compact">
                              <div className="durian-compact-half durian-compact-half--crossed">
                                <FruitIcon fruit={crossedHalf.fruit} size={20} />
                                <span className="durian-compact-name">{FRUIT_NAMES[crossedHalf.fruit]} ×{crossedHalf.quantity}</span>
                                <span className="durian-compact-tag">✗</span>
                              </div>
                              <div className="durian-compact-divider" />
                              <div className="durian-compact-half durian-compact-half--checked">
                                <FruitIcon fruit={checkedHalf.fruit} size={20} />
                                <span className="durian-compact-name">{FRUIT_NAMES[checkedHalf.fruit]} ×{checkedHalf.quantity}</span>
                                <span className="durian-compact-tag">✓ 生效</span>
                              </div>
                            </div>
                          ) : (
                            renderCardGraphic(fruitCard, placement.data.checkHalf, { showBadge: false, size: 38 })
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="durian-table-bottom-bar">
                <div className="durian-sim-deck-dock">
                  {view.phase === 'choose_placement' && isMyTurn && me?.drawnCard && me.drawnCard.kind === 'fruit' ? (
                    <div className="durian-sim-choice-popup">
                      <div className="durian-sim-choice-title">🎴 请选择哪半边放在 ✅ 对号生效侧：</div>
                      <div className="durian-sim-choice-btns">
                        <button
                          type="button"
                          className="durian-sim-choice-opt"
                          onClick={() => void act({ type: 'place_fruit', playerId: myId!, checkHalf: 'left' })}
                        >
                          <FruitIcon fruit={me.drawnCard.left.fruit} size={28} />
                          <span>左边：{FRUIT_NAMES[me.drawnCard.left.fruit]}</span>
                        </button>
                        <button
                          type="button"
                          className="durian-sim-choice-opt"
                          onClick={() => void act({ type: 'place_fruit', playerId: myId!, checkHalf: 'right' })}
                        >
                          <FruitIcon fruit={me.drawnCard.right.fruit} size={28} />
                          <span>右边：{FRUIT_NAMES[me.drawnCard.right.fruit]}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="durian-sim-draw-btn"
                      disabled={view.deckCount === 0 || (view.phase !== 'turn_action' && view.phase !== 'choose_placement')}
                      onClick={() => {
                        if (myId) void act({ type: 'draw_card', playerId: myId });
                      }}
                    >
                      <span className="durian-sim-draw-btn__icon">🎴</span>
                      <div className="durian-sim-draw-btn__text">
                        <strong>从牌堆摸牌</strong>
                        <small>剩余 {view.deckCount} 张</small>
                      </div>
                    </button>
                  )}
                </div>

                <div className="durian-sim-bell-dock">
                  <button
                    type="button"
                    className="durian-sim-bell-btn-compact"
                    onClick={() => {
                      if (myId) void act({ type: 'ring_bell_sim', playerId: myId });
                    }}
                    aria-label="抢单按铃"
                    title="点击抢单拍铃"
                  >
                    <span className="durian-sim-bell-icon">🔔</span>
                    <span className="durian-sim-bell-text">抢单按铃</span>
                  </button>
                </div>
              </div>
            </section>

            <aside className="durian-table-counter durian-table-counter--right" aria-label="桌面生效水果统计（对面玩家反向）">
              <div className="durian-counter-header">
                <span className="durian-counter-header__icon">🍎</span>
                <span className="durian-counter-header__title">桌面需求 (✓)</span>
              </div>
              <div className="durian-counter-list">
                {DURIAN_FRUITS.map((fruit) => (
                  <div key={fruit} className="durian-counter-item">
                    <FruitIcon fruit={fruit} size={26} />
                    <span className="durian-counter-name">{FRUIT_NAMES[fruit]}</span>
                    <span className="durian-counter-pill">{(view.activeTableTotals ?? {})[fruit] ?? 0}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : isSimulatorPlayer ? (
          <div className="durian-player-arena">
            <div className="durian-player-card-container">
              <div className="durian-player-card-hero">
                <span className="durian-player-card-hero__icon">👑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>我的面前暗牌（面向其他玩家展示）</h3>
                  <small style={{ opacity: 0.9 }}>请将设备立于面前或平放供他人观看，自己请勿偷看</small>
                </div>
              </div>

              <div className="durian-player-large-card-wrap">
                {myForeheadEntry ? (
                  renderCardGraphic(myForeheadEntry.card, undefined, { showBadge: false, size: 76, isLarge: true })
                ) : (
                  <div className="durian-card durian-card--secret durian-card--large">
                    <span className="durian-secret-icon" style={{ fontSize: '3rem' }}>❓</span>
                    <span className="durian-secret-text" style={{ fontSize: '1.2rem' }}>
                      我的头顶暗牌（他人可见）
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="durian-forehead-bar" aria-label="玩家头顶手牌">
              {view.players.map((playerId) => {
                const isMe = playerId === myId;
                const isCurrent = playerId === view.currentPlayerId;
                const isEliminated = (view.eliminatedPlayers ?? []).includes(playerId);
                const penalty = (view.penalties ?? {})[playerId] ?? 0;
                const visibleEntry = me?.visibleForeheadCards?.find((e) => e.playerId === playerId);

                return (
                  <div
                    key={playerId}
                    className={`durian-forehead-slot ${isCurrent ? 'durian-forehead-slot--current' : ''} ${isEliminated ? 'durian-forehead-slot--eliminated' : ''}`}
                  >
                    <div className="durian-forehead-slot__header">
                      <span className="durian-forehead-slot__name">
                        {isMe ? (isRevealed ? '👑 我 (暗牌已揭示)' : '👑 我') : nameFor(members, playerId)}
                        {isCurrent && ' (行动中)'}
                      </span>
                      <span className="durian-forehead-slot__penalty">
                        💥 {penalty}/7 分
                      </span>
                    </div>

                    {isMe && !isRevealed ? (
                      <div className="durian-card durian-card--secret">
                        <span className="durian-secret-icon">❓</span>
                        <span className="durian-secret-text">我的头顶暗牌（他人可见）</span>
                      </div>
                    ) : visibleEntry ? (
                      renderCardGraphic(visibleEntry.card, undefined, { showBadge: true, size: 34 })
                    ) : (
                      <div className="durian-card durian-card--secret">
                        <span className="durian-secret-icon">🎴</span>
                        <span className="durian-secret-text">未知手牌</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="durian-center-board" aria-label="桌面已放置卡牌">
              <div className="durian-board-headline">
                <span className="durian-board-title">📜 桌面已放置卡牌 ({(view.tablePlacements ?? []).length} 张)</span>
                <span className="durian-board-deck-info">牌堆剩余: <strong>{view.deckCount}</strong> 张</span>
              </div>

              <div className="durian-placements-wrap">
                {(view.tablePlacements ?? []).length === 0 ? (
                  <div className="durian-placements-empty">
                    <span className="durian-placements-empty__icon">🎴</span>
                    <strong className="durian-placements-empty__title">桌面上暂无出牌</strong>
                    <span className="durian-placements-empty__desc">轮到先手玩家开始摸牌并选择生效半边</span>
                  </div>
                ) : (
                  <div className="durian-placements-grid">
                    {(view.tablePlacements ?? []).map((placement, index) => {
                      const isFlipTarget = view.phase === 'choose_flip' && isMyTurn && placement.kind === 'fruit';

                      if (placement.kind === 'monkey') {
                        return (
                          <div key={placement.data.placementId} className="durian-placement-item">
                            <span className="durian-placement-item__author">
                              #{index + 1} {nameFor(members, placement.data.placedBy)} 打出功能牌
                            </span>
                            {renderCardGraphic(placement.data.card, undefined, { showBadge: false, size: 34 })}
                          </div>
                        );
                      }

                      const fruitCard = placement.data.card;
                      return (
                        <div
                          key={placement.data.placementId}
                          className={`durian-placement-item ${isFlipTarget ? 'durian-placement-item--flip-target' : ''}`}
                          onClick={() => {
                            if (isFlipTarget && myId) {
                              void act({
                                type: 'select_flip_target',
                                playerId: myId,
                                targetPlacementId: placement.data.placementId,
                              });
                            }
                          }}
                        >
                          <span className="durian-placement-item__author">
                            #{index + 1} {nameFor(members, placement.data.placedBy)} 放置 {isFlipTarget && '👈 点击翻转'}
                          </span>
                          {renderCardGraphic(fruitCard, placement.data.checkHalf, { showBadge: true, size: 34 })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* 质疑结算全屏背部遮罩舞台（超紧凑一屏全显、免翻页滑动） */}
        {view.phase === 'challenge_result' && view.lastChallenge && (
          <div className="durian-verdict-overlay" role="dialog" aria-modal="true" aria-label="质疑结算结果">
            <div className="durian-verdict-modal">
              {/* 顶部胜负一体化横幅 */}
              <div className={`durian-verdict-hero ${view.lastChallenge.success ? 'durian-verdict-hero--success' : 'durian-verdict-hero--failed'}`}>
                <span className="durian-verdict-hero__icon">{view.lastChallenge.success ? '💥' : '🛡️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="durian-verdict-hero__title">
                    {view.lastChallenge.success
                      ? `质疑成功！${nameFor(members, view.lastChallenge.accusedId)} 导致水果超卖（+${view.lastChallenge.penaltyPoints} 罚分）`
                      : `质疑失败！${nameFor(members, view.lastChallenge.challengerId)} 误判库存充足（+${view.lastChallenge.penaltyPoints} 罚分）`}
                  </h2>
                  <div className="durian-verdict-hero__meta">
                    <span>质疑者：<strong>{nameFor(members, view.lastChallenge.challengerId)}</strong></span>
                    <span>·</span>
                    <span>被质疑上家：<strong>{nameFor(members, view.lastChallenge.accusedId)}</strong></span>
                    {view.mode === 'standard' && (
                      <span className="durian-verdict-hero__timer">
                        ⏱️ {countdown > 0 ? `${countdown}s 后自动进入下一轮` : '即将进入下一轮'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 水果比对卡片舞台（多列等高自适应） */}
              <div className="durian-showdown-grid" aria-label="水果需求与库存对决">
                {activeShowdownFruits.length === 0 ? (
                  <div className="durian-showdown-empty">本轮桌面上暂无生效的水果需求。</div>
                ) : (
                  activeShowdownFruits.map((fruit, index) => {
                    const tableCount = (view.lastChallenge?.tableTotals?.[fruit] ?? 0);
                    const stockCount = (view.lastChallenge?.stockTotals?.[fruit] ?? 0);
                    const isOversold = tableCount > stockCount;
                    const diff = tableCount - stockCount;

                    return (
                      <div
                        key={fruit}
                        className={`durian-showdown-card durian-showdown-card--${fruit} ${isOversold ? 'is-oversold' : 'is-safe'}`}
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="durian-showdown-card__header">
                          <FruitIcon fruit={fruit} size={24} />
                          <span className="durian-showdown-card__name">{FRUIT_NAMES[fruit]}</span>
                        </div>

                        <div className="durian-showdown-card__pk">
                          <div className="durian-showdown-side durian-showdown-side--table">
                            <span className="durian-showdown-side__label">桌面需求</span>
                            <span className="durian-showdown-side__val">
                              <RollingNumber value={tableCount} delay={250 + index * 80} />
                            </span>
                          </div>

                          <div className="durian-showdown-vs">VS</div>

                          <div className="durian-showdown-side durian-showdown-side--stock">
                            <span className="durian-showdown-side__label">头顶库存</span>
                            <span className="durian-showdown-side__val">
                              <RollingNumber value={stockCount} delay={400 + index * 80} />
                            </span>
                          </div>
                        </div>

                        <div
                          className={`durian-showdown-stamp ${isOversold ? 'durian-showdown-stamp--danger' : 'durian-showdown-stamp--safe'}`}
                          style={{ animationDelay: `${600 + index * 100}ms` }}
                        >
                          {isOversold ? (
                            <>
                              <span className="durian-stamp-icon">💥</span>
                              <span className="durian-stamp-text">超卖 +{diff}</span>
                            </>
                          ) : (
                            <>
                              <span className="durian-stamp-icon">✓</span>
                              <span className="durian-stamp-text">余 {stockCount - tableCount}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 底部操作条 */}
              {myId && !isSpectator && (
                <div className="durian-verdict-footer">
                  <button
                    type="button"
                    className="durian-verdict-btn"
                    onClick={() => void act({ type: 'next_round', playerId: myId })}
                  >
                    {view.mode === 'standard' && countdown > 0 ? `开始下一轮 (${countdown}s) ➡️` : '开始下一轮 ➡️'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 终局结算英雄榜 */}
        {view.phase === 'game_over' && (
          <div className="winner-hero durian-over">
            <div className="durian-floating-fruits" aria-hidden="true">
              <span className="durian-floating-item f1">🍋</span>
              <span className="durian-floating-item f2">🍓</span>
              <span className="durian-floating-item f3">🍌</span>
              <span className="durian-floating-item f4">🍇</span>
              <span className="durian-floating-item f5">🍎</span>
              <span className="durian-floating-item f6">🐒</span>
              <span className="durian-floating-item f7">🍋</span>
              <span className="durian-floating-item f8">🍓</span>
              <span className="durian-floating-item f9">🍌</span>
              <span className="durian-floating-item f10">🍇</span>
              <span className="durian-floating-item f11">🍎</span>
              <span className="durian-floating-item f12">🎴</span>
            </div>
            <h2 className="winner-title">🎉 游戏结束！罚分最低者获胜</h2>
            <p style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e293b' }}>
              🏆 获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
            </p>
          </div>
        )}
      </div>
    </TabletopShell>
  );
}
