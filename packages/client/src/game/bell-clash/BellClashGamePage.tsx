/**
 * bell_clash_v1 客户端主页面（Ding 铃铛对决 · 官方 UNO 牌面 + 椭圆遮罩重构版）。
 * 只消费严格解析后的铃铛对决视角（bell-clash/types.ts）。
 * 视觉：直接复用 UNO 高清图片立绘，短语卡叠加契合中心角度的白色椭圆遮罩以书写行动短语。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import type { BellClashCard, BellClashPlayerView, CardColor } from './types.ts';

const COLOR_LABELS: Record<CardColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

/** 卡牌展示文案 */
function cardLabel(card: BellClashCard): string {
  return card.kind === 'number' ? `${COLOR_LABELS[card.color]} ${card.number}` : `${COLOR_LABELS[card.color]}·「${card.phrase}」`;
}

function phaseLabel(phase: BellClashPlayerView['phase']): string {
  return phase === 'game_over' ? '对局结案' : '出牌辩论';
}

/** 获取卡牌对应的官方 UNO 图片立绘路径 */
function getDingCardAssetPath(card: BellClashCard | null | undefined): string {
  if (!card) return '/assets/uno/back.png';
  if (card.kind === 'number') {
    return `/assets/uno/${card.color}_${card.number}.png`;
  }
  // 短语卡使用该颜色的官方原生纯白椭圆底版（无多余数字遮罩与缝隙错位）
  return `/assets/uno/${card.color}_blank.png`;
}

/** 经典 UNO 风格单张卡牌组件（搭载官方原生立绘 + 短语居中文案） */
function DingUnoCardView({
  card,
  isTop = false,
  isSelected = false,
  isPlayable = false,
  onClick,
}: {
  card: BellClashCard | null;
  isTop?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  onClick?: () => void;
}) {
  if (!card) {
    return (
      <div className={`ding-uno-card ding-uno-card--empty ${isTop ? 'ding-uno-card--top' : ''}`}>
        <img src="/assets/uno/back.png" alt="等待首张" className="ding-uno-card__img" />
      </div>
    );
  }

  const isPhrase = card.kind === 'phrase';
  const imgPath = getDingCardAssetPath(card);

  return (
    <button
      type="button"
      className={`ding-uno-card ${isTop ? 'ding-uno-card--top' : ''} ${isSelected ? 'is-selected' : ''} ${isPlayable ? 'is-playable' : ''}`}
      onClick={onClick}
      disabled={isTop}
      aria-pressed={isSelected}
      title={cardLabel(card)}
    >
      <img src={imgPath} alt={cardLabel(card)} className="ding-uno-card__img" />

      {/* 短语卡中心文案：直接依托原生 UNO 官方纯白椭圆底版，完美契合 */}
      {isPhrase && (
        <div className="ding-phrase-center">
          <span className="ding-phrase-icon">🔔</span>
          <span className="ding-phrase-text">{card.phrase}</span>
        </div>
      )}
    </button>
  );
}

interface Props {
  view: BellClashPlayerView;
}

export function BellClashGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const isMyTurn = view.currentPlayerId === myId;
  const top = view.discardTop;

  // 判断手牌是否可合法打出
  const canPlayCard = (card: BellClashCard): boolean => {
    if (!top) return true;
    if (card.color === top.color) return true;
    if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
    return false;
  };

  const players = view.players.map((playerId) => {
    let status = '';
    const handCount = view.handCounts?.[playerId] ?? 0;
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '🏆 获胜' : '失败';
    } else if (playerId === view.currentPlayerId) {
      status = view.bellOpen ? `按铃中 · ${handCount}张` : `出牌中 · ${handCount}张`;
    } else {
      status = `${handCount}张`;
    }
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status,
      active: playerId === view.currentPlayerId,
    };
  });

  // 主导动作：出牌 / 摸牌 / 拍铃
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.bellOpen) {
    primary = {
      id: 'ring-bell',
      label: '🔔 拍铃抢回合！',
      disabled: false,
      onAction: () => {
        if (myId) void act({ type: 'ring_bell', playerId: myId });
      },
    };
  } else if (isMyTurn && myId) {
    const selected = selectedIndex !== null ? me?.hand?.[selectedIndex] : undefined;
    const canPlaySelected = selected !== undefined && canPlayCard(selected);
    primary = {
      id: 'play-card',
      label: selected ? `打出 ${cardLabel(selected)}` : '点选手牌打出（需同色或同数字）',
      disabled: selectedIndex === null || !canPlaySelected,
      onAction: () => {
        if (myId && selectedIndex !== null) {
          void act({ type: 'play_card', playerId: myId, cardIndex: selectedIndex });
          setSelectedIndex(null);
        }
      },
    };
    secondary = [
      {
        id: 'draw',
        label: '打不出，摸一张',
        disabled: false,
        onAction: () => {
          if (myId) void act({ type: 'draw_card', playerId: myId });
        },
      },
    ];
  }

  const topLabel = top ? cardLabel(top) : '—';

  const waitingReason =
    view.phase === 'game_over'
      ? null
      : view.bellOpen
        ? `「${topLabel}」行动短语卡——若有人说了/做了牌上内容，立即拍铃抢回合！`
        : isMyTurn
          ? '轮到你出牌：打出同色或同数字的 UNO 牌，或摸一张'
          : `等待 ${nameFor(members, view.currentPlayerId)} 出牌…`;

  return (
    <TabletopShell
      title="铃铛对决"
      phase={phaseLabel(view.phase)}
      gameId="bell-clash"
      phaseKey={`${view.phase}:${view.currentPlayerId}:${view.bellOpen ? `bell:${view.bellClaimantId ?? 'open'}` : 'turn'}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : 'active'}`}
      spectator={isSpectator}
      players={players}
      theme="poker"
      stageFit="arena"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          📜 游戏规则
        </button>
      )}
      actions={
        primary || secondary.length > 0 ? (
          <ActionDock
            primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }}
            secondary={secondary}
            busy={busy}
            waitingReason={waitingReason ?? undefined}
          />
        ) : (
          <ActionDock
            primary={{ id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }}
            busy={busy}
            waitingReason={waitingReason ?? undefined}
          />
        )
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="铃铛对决 · 游戏规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>🎴 核心机制（UNO 式出牌 + 抢铃）</h4>
          <p>1. <strong>UNO 出牌</strong>：打出与弃牌堆顶<strong>同颜色</strong>或<strong>同数字</strong>的牌；打不出则摸一张牌。</p>
          <p>2. <strong>行动短语卡</strong>：牌面印有一句生活短语（如「好耶！」、「等等」）。当场上有玩家在现实对话或行动中触发该内容时，持有同色短语卡的玩家可<strong>立刻拍铃抢夺回合</strong>并打出该牌！</p>
          <p>3. <strong>拍铃抢答</strong>：拍铃成功者接管出牌权；错误拍铃罚摸一张。</p>
          <p>4. <strong>获胜条件</strong>：最先打光手中所有手牌者获胜！</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage bell-stage">
          <div className="bell-dual-col">
            {/* 左列：桌面中心区（3D 摸牌堆 + UNO 弃牌堆顶 + 实体抢铃台） */}
            <section className="sg-panel" aria-label="桌面中心台">
              <div className="sg-panel__head">
                <div className="sg-panel__title-group">
                  <span>🃏</span>
                  <h3>桌面案台</h3>
                </div>
                <span className="sg-badge sg-badge--highlight">抽牌堆剩 {view.drawCount} 张</span>
              </div>

              <div className="bell-board">
                {/* 3D 摸牌堆 */}
                <div
                  className="ding-draw-stack"
                  onClick={() => isMyTurn && myId && void act({ type: 'draw_card', playerId: myId })}
                  title={isMyTurn ? '点击摸一张牌' : '摸牌堆'}
                >
                  <img src="/assets/uno/back.png" alt="摸牌堆" className="ding-uno-card__img" />
                  <span className="ding-draw-stack__count" style={{ position: 'absolute', bottom: '6px', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '999px' }}>
                    {view.drawCount} 张
                  </span>
                </div>

                {/* 弃牌堆顶卡牌（UNO 官方立绘质感） */}
                <DingUnoCardView card={view.discardTop} isTop />

                {/* 实体抢铃台 */}
                <button
                  type="button"
                  className={`ding-bell-stage-btn ${view.bellOpen ? 'is-ringing' : ''}`}
                  onClick={() => myId && void act({ type: 'ring_bell', playerId: myId })}
                  title="拍铃抢回合"
                >
                  <span className="ding-bell-stage-icon">🛎️</span>
                  <span className="ding-bell-stage-text">{view.bellOpen ? '立即拍铃!' : '抢铃台'}</span>
                </button>
              </div>
            </section>

            {/* 右列：按铃提醒横幅 + UNO 质感我的手牌 */}
            <section className="bell-right-col">
              {view.bellOpen && (
                <section className="bell-window" aria-label="按铃窗口">
                  <span className="bell-window__icon" aria-hidden="true">🔔</span>
                  <div className="bell-window__copy">
                    <strong>按铃抢答窗口开启！</strong>
                    <span>「{topLabel}」——若有人说了/做了牌上内容，拍铃抢回合（须持有同色短语卡）。</span>
                  </div>
                </section>
              )}

              {me && (
                <section className="sg-panel" aria-label="我的手牌">
                  <div className="sg-panel__head">
                    <div className="sg-panel__title-group">
                      <span>🎴</span>
                      <h3>我的手牌（{(me.hand ?? []).length} 张）</h3>
                    </div>
                    {isMyTurn && <span className="sg-badge sg-badge--warning">轮到你出牌</span>}
                  </div>

                  <div className="bell-hand">
                    {(me.hand ?? []).map((card, index) => {
                      const isPlayable = isMyTurn && canPlayCard(card);
                      const isSelected = selectedIndex === index;
                      return (
                        <DingUnoCardView
                          key={index}
                          card={card}
                          isSelected={isSelected}
                          isPlayable={isPlayable}
                          onClick={() => setSelectedIndex(isSelected ? null : index)}
                        />
                      );
                    })}
                  </div>

                  {isMyTurn && (
                    <p className="sg-hint">
                      💡 提示：点击一张<strong>同色</strong>或<strong>同数字</strong>的 UNO 卡牌后点击下方按钮打出，或摸一张牌。
                    </p>
                  )}
                </section>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="sg-stage">
          <div className="winner-hero">
            <span className="winner-rays" aria-hidden="true" />
            <h2 className="winner-title">🎉 手牌全部清空！</h2>
            <p className="winner-names">
              🏆 获胜玩家：{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}
            </p>
          </div>
        </div>
      )}
    </TabletopShell>
  );
}
