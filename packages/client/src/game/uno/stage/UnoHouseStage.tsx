/**
 * uno_platform_house_v1 主舞台（整屏色块 · 派对桌全面接入）。
 * 深度集成 PartyCloth、PartyDisc、PartyCard、PartySeatRing、PartyColorPicker、PartySlam 与 UnoRoundResult。
 * 契约：contracts/uno.md
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useConnection } from '../../../connection/useConnection.ts';
import { CardFanEngine, type CardItem } from '../../../shared-ui/CardFanEngine.tsx';
import { GameDrawer } from '../../tabletop/GameDrawer.tsx';
import { TabletopOvalShell } from '../../../shared-ui/TabletopOvalShell.tsx';
import { StageCountdownRing } from '../../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../../shared-ui/stage/FlightLayer.tsx';
import { useUnoHouseStage } from './useUnoHouseStage.tsx';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import { nameFor, useGameAction } from '../../useGameAction.ts';
import {
  PartyCloth,
  PartyDisc,
  PartyCard,
  PartySticker,
  PartySeatRing,
  PartyColorPicker,
  PartySlam,
  sortByColor,
  type PartyColor,
  type PartySeatItem,
  type PartySlamKind,
} from '../../party-table/index.ts';
import { UnoRoundResult } from './UnoRoundResult.tsx';
import {
  UNO_COLOR_NAMES,
  cardLabel,
  colorLabel,
  getUnoCardAssetPath,
  type UnoCard,
  type UnoHousePlayerView,
} from '../types.ts';

interface Props {
  view: UnoHousePlayerView;
}

export function UnoHouseStage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  // 手牌尺寸由 .pt-table 作用域的 --fan-card-w/--fan-card-h 令牌驱动（断点契约内随视口变化）
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [preCallCardId, setPreCallCardId] = useState<string | null>(null);
  const [pendingPreCall, setPendingPreCall] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // 冲屏与残影状态
  const [slamText, setSlamText] = useState<string>('');
  const [slamKind, setSlamKind] = useState<PartySlamKind>('');
  const [slamKey, setSlamKey] = useState<number>(0);
  const [ghostCard, setGhostCard] = useState<React.ReactNode | null>(null);

  // 弃牌堆顶与下一层露角
  const [underCard, setUnderCard] = useState<UnoCard | null>(null);
  const [topTilt, setTopTilt] = useState<number>(-4);
  const [underTilt, setUnderTilt] = useState<number>(6);
  const prevTopDiscardRef = useRef<UnoCard | null>(null);

  const discardRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const me = view.me;
  const isSpectator = me === null || me === undefined;
  const phase = view.phase;

  const stage = useUnoHouseStage(view);
  const caps = new Set(me?.capabilities ?? []);
  const inWindow = me?.activeWindow !== null && me?.activeWindow !== undefined;
  const isMyTurn = me?.isCurrentPlayer ?? false;

  // 顶牌变动时更新压底牌与倾斜度，并驱动功能牌冲屏
  useEffect(() => {
    const curTop = view.topDiscard;
    if (prevTopDiscardRef.current && prevTopDiscardRef.current.id !== curTop.id) {
      setUnderCard(prevTopDiscardRef.current);
      setUnderTilt((Math.random() * 20 - 10));
      setTopTilt((Math.random() * 16 - 8));

      // 功能牌冲屏
      const v = curTop.kind;
      if (v === 'wild4') {
        setGhostCard(<PartyCard card={curTop} />);
        setSlamText('+4');
        setSlamKind('draw4');
        setSlamKey((k) => k + 1);
      } else if (v === 'wild') {
        setGhostCard(<PartyCard card={curTop} />);
        setSlamText('变色');
        setSlamKind('uno');
        setSlamKey((k) => k + 1);
      } else if (v === 'reverse') {
        setGhostCard(null);
        setSlamText('反转！');
        setSlamKind('reverse');
        setSlamKey((k) => k + 1);
      } else if (v === 'skip') {
        setGhostCard(null);
        setSlamText('跳过！');
        setSlamKind('skip');
        setSlamKey((k) => k + 1);
      } else if (v === 'draw2') {
        setGhostCard(null);
        setSlamText('+2');
        setSlamKind('draw2');
        setSlamKey((k) => k + 1);
      }
    }
    prevTopDiscardRef.current = curTop;
  }, [view.topDiscard]);

  const canPlay = (cardId: string): boolean =>
    phase === 'round_playing' &&
    me !== null &&
    !busy &&
    ((inWindow && caps.has('canStackPenalty')) ||
      (!inWindow && (me.playableCardIds ?? []).includes(cardId)));

  const cardColor = (card: UnoCard): string => ('color' in card ? card.color : 'wild');

  function submitPlay(card: UnoCard, preCallUno: boolean) {
    if (card.kind === 'wild' || card.kind === 'wild4') {
      setWildCardId(card.id);
      setPendingPreCall(preCallUno);
      return;
    }
    if (preCallUno) webAudio.playUnoShout();
    void act(
      preCallUno
        ? { type: 'play_card', cardId: card.id, preCallUno: true }
        : { type: 'play_card', cardId: card.id }
    );
  }

  function handlePlayCard(card: UnoCard) {
    if (me === null || busy) return;

    if (card.kind === 'skip') webAudio.playUnoSkip();
    else if (card.kind === 'reverse') webAudio.playUnoReverse();
    else if (card.kind === 'draw2' || card.kind === 'wild4') webAudio.playUnoDrawPenalty();
    else webAudio.playCardPlay();

    if (inWindow && caps.has('canStackPenalty')) {
      if (card.kind === 'wild' || card.kind === 'wild4') setWildCardId(card.id);
      else void act({ type: 'stack_penalty', cardId: card.id });
      setSelectedCardIds([]);
      return;
    }
    if (caps.has('canPreCallUno')) {
      setPreCallCardId(card.id);
      setSelectedCardIds([]);
      return;
    }
    submitPlay(card, false);
    setSelectedCardIds([]);
  }

  function confirmWild(color: PartyColor) {
    if (wildCardId === null) return;
    webAudio.playCardPlay();
    if (inWindow && caps.has('canStackPenalty')) {
      void act({ type: 'stack_penalty', cardId: wildCardId, declaredColor: color });
    } else if (pendingPreCall) {
      webAudio.playUnoShout();
      void act({
        type: 'play_card',
        cardId: wildCardId,
        declaredColor: color,
        preCallUno: true,
      });
    } else {
      void act({ type: 'play_card', cardId: wildCardId, declaredColor: color });
    }
    setWildCardId(null);
    setPendingPreCall(false);
    setSelectedCardIds([]);
  }

  // 轮到自己轻微震动
  useEffect(() => {
    if (isMyTurn && phase === 'round_playing') {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([30, 40, 30]);
        }
      } catch {
        // Ignored
      }
    }
  }, [isMyTurn, phase]);

  // 对手列表：按座次 + 方向排布，映射为 PartySeatItem
  const opponents: PartySeatItem[] = useMemo(() => {
    const total = view.players.length;
    const myIndex = view.players.findIndex((p) => p.playerId === me?.playerId);
    const ordered =
      myIndex < 0
        ? view.players.filter((p) => p.playerId !== me?.playerId)
        : Array.from({ length: Math.max(total - 1, 0) }, (_, step) =>
            view.players[(((myIndex + view.direction * (step + 1)) % total) + total) % total]!
          );

    return ordered.map((opp) => {
      const oppMember = members.find((m) => m.playerId === opp.playerId);
      const isCurrent = opp.playerId === view.currentPlayerId;
      const isOne = opp.handCount === 1 || opp.unoCalled;
      const isMissedTarget = opp.playerId === view.unoRaceWindow?.targetPlayerId;

      // UNO! 由贴纸角标（.pt-sticker--one::after）常显表达，不再叠一个说话泡；
      // 气泡只留给瞬时事件：被抓漏报警告 / 当前玩家思考中
      let bubbleText: string | undefined = undefined;
      if (isMissedTarget) bubbleText = '漏报!';
      else if (isCurrent) bubbleText = '思考中...';

      return {
        id: opp.playerId,
        name: nameFor(members, opp.playerId),
        avatar: <UserAvatar avatar={oppMember?.avatar} nickname={nameFor(members, opp.playerId)} size={36} />,
        handCount: opp.handCount,
        isActive: isCurrent,
        isOne,
        bubbleText,
      };
    });
  }, [view.players, view.currentPlayerId, view.unoRaceWindow, view.direction, me?.playerId, members]);

  // 手牌：先按颜色排序（红黄绿蓝万能），紧凑模式由 crowdMode="corner" 自适应
  const sortedRawHand = useMemo(() => {
    return sortByColor(me?.hand ?? []);
  }, [me?.hand]);

  const fanCards: CardItem[] = useMemo(() => {
    return sortedRawHand.map((card) => ({
      id: card.id,
      label: cardLabel(card),
      sublabel: colorLabel(cardColor(card)),
      colorTheme: cardColor(card),
      imageUrl: getUnoCardAssetPath(card),
      disabled: !canPlay(card.id),
      raw: card,
    }));
  }, [sortedRawHand, phase, me, busy, inWindow, caps]);

  // 阶段牌文案
  const phaseWord = useMemo(() => {
    if (view.unoRaceWindow) return '抓漏喊 UNO 中';
    if (view.pendingPenalty) return '罚牌响应中';
    if (isMyTurn) return '轮到你';
    return '等别人出牌';
  }, [view.unoRaceWindow, view.pendingPenalty, isMyTurn]);

  const canDraw = phase === 'round_playing' && isMyTurn && !busy;
  // 喊 UNO 只在服务端认可的窗口可点（被抓漏报的 race 窗口、轮到自己且剩 1 张的补喊），
  // 平时一律禁用；剩 1 张时也不加 ready 摆动去主动诱导玩家点它。
  const canCallUno = phase === 'round_playing' && !busy && caps.has('canCallUno');
  const isOneCard = (me?.hand ?? []).length === 1;

  // 标准顶栏外壳：深色标题栏（标题 + 阶段副标题 + 游戏规则 + 菜单），与其它游戏一致；
  // 全出血派对舞台装进 centerArena，靠 uno.css 里 [data-game-id='uno'] 的竞技场覆盖填满
  const wrapInShell = (stageContent: React.ReactNode) => (
    <TabletopOvalShell
      title="UNO 房规模式"
      subtitle={`第 ${view.round} / ${view.roundLimit} 局 · ${view.mode === 'team' ? '组队赛' : '个人赛'}${
        view.phase === 'round_over' ? ' · 本局结束' : view.phase === 'match_over' ? ' · 整场结束' : ''
      }`}
      gameId="uno"
      theme="party"
      players={[]}
      hideSeats
      stageFit="arena"
      phaseKey={`${view.phase}:${view.round}`}
      topRightControls={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          游戏规则
        </button>
      )}
      onShowRules={() => setRulesOpen(true)}
      centerArena={(
        <>
          {stageContent}
          {rulesOpen && (
            <GameDrawer
              kind="rules"
              title="UNO 房规模式 · 游戏规则"
              triggerRef={rulesRef}
              onClose={() => setRulesOpen(false)}
            >
              <div className="prose prose-sm dark:prose-invert">
                <h4>基本玩法</h4>
                <p>按颜色、数字或功能出牌，先出完手牌的人赢下本局。每张剩牌按面值记分，分越低越好；整场局数打完后总分最低者夺冠。</p>
                <h4>房规要点</h4>
                <p>+2 / +4 可叠加：下家跟出同类罚牌就把罚牌数累加给再下家，接不住的人一次摸完。</p>
                <p>打出 +4 可能被下家质疑：若你手里其实有同色的可出牌，质疑成立、改由你摸 4 张；否则质疑者摸 6 张。</p>
                <p>出到剩 1 张前必须喊 UNO（剩 2 张时可提前喊）。没喊且 5 秒内被其他玩家抓到，罚摸 2 张。</p>
              </div>
            </GameDrawer>
          )}
        </>
      )}
    />
  );

  // 渲染出局结算页面
  if (phase === 'round_over' || phase === 'match_over') {
    return wrapInShell(
      <div
        className="pt-table uno-house-table"
        data-color={view.currentColor}
        data-phase={view.phase}
      >
        <PartyCloth color={view.currentColor} />
        <UnoRoundResult
          view={view}
          members={members}
          remainingHands={view.lastRound?.remainingHands}
          onNextRound={() => {
            void act({ type: 'begin' });
          }}
        />
      </div>,
    );
  }

  return wrapInShell(
    <div
      ref={stage.stageRef}
      className="pt-table uno-house-table"
      data-color={view.currentColor}
      data-phase={view.phase}
    >
      {/* 1. 桌布 + 泼色层 + 淡剪影 */}
      <PartyCloth color={view.currentColor} originRef={discardRef} />

      {/* 2. 标题/局数/规则入口由外壳顶栏承载；倒计时环在竞技场右上角（.uno-turn-ring） */}

      {/* 3. 纸板圆盘 + 顺/逆时针方向环 + 中央插槽 */}
      <PartyDisc direction={view.direction === -1 ? 'ccw' : 'cw'}>
        {/* 牌堆 */}
        <div
          ref={deckRef}
          className="pt-deck"
          data-stage-anchor="draw"
          data-box="deck"
          style={{ cursor: canDraw ? 'pointer' : 'default' }}
          onClick={() => {
            if (canDraw) void act({ type: 'draw_card' });
          }}
        >
          <PartyCard card={{ face: 'back', color: 'back' }} backLabel="UNO" />
          <span className="pt-deck__left">剩 {view.deckCount} 张</span>
        </div>

        {/* 弃牌堆 */}
        <div ref={discardRef} className="pt-discard uno-house-discard" data-stage-anchor="discard" data-box="discard">
          <div className="pt-discard__under">
            {underCard ? (
              <PartyCard
                card={underCard}
                style={{ transform: `rotate(${underTilt.toFixed(1)}deg)` }}
              />
            ) : null}
          </div>
          <PartyCard
            card={view.topDiscard}
            style={{ transform: `rotate(${topTilt.toFixed(1)}deg)` }}
          />
        </div>
      </PartyDisc>

      {/* 4. 阶段牌与中央 HUD */}
      <div className="pt-phase-word" aria-live="polite">
        {phaseWord}
      </div>

      <div className="pt-hud uno-house-center__meta">
        <span className="pt-color-chip">
          <i />
          当前：{UNO_COLOR_NAMES[view.currentColor] ?? view.currentColor}
        </span>
      </div>

      {/* 倒计时环钉到桌面右上角：不占圆盘下方黄金区，竖屏也不再挤压席位与贴纸 */}
      <StageCountdownRing
        className="uno-turn-ring"
        deadlineAt={view.clockInfo?.windowDeadlineAt ?? view.clockInfo?.turnDeadlineAt ?? null}
        phaseKey={`${view.clockInfo?.windowDeadlineAt ? 'window' : 'turn'}:${view.currentPlayerId}:${view.round}`}
        active={view.phase === 'round_playing'}
      />

      {/* 5. 上半圈对手贴纸席位 */}
      <PartySeatRing seats={opponents} />

      {/* 6. 我的贴纸 */}
      {me ? (
        <PartySticker
          id={me.playerId}
          name={nameFor(members, me.playerId)}
          avatar={<UserAvatar avatar={members.find((m) => m.playerId === me.playerId)?.avatar} nickname={nameFor(members, me.playerId)} size={36} />}
          handCount={(me.hand ?? []).length}
          isActive={isMyTurn}
          isOne={isOneCard}
          className="pt-me-sticker"
        />
      ) : null}

      {/* 7. 底部手牌与操作坞 */}
      <div className="pt-me-zone">
        {!isSpectator && (
          <div className="uno-fan-anchor" data-stage-anchor="hand" style={{ width: '100%', maxWidth: '900px' }}>
            <CardFanEngine
              cards={fanCards}
              selectedCardIds={selectedCardIds}
              onSelectCards={(ids) => {
                const card = (me?.hand ?? []).find((c) => c.id === ids[0]);
                if (card && canPlay(card.id)) {
                  handlePlayCard(card);
                }
              }}
              crowdMode="corner"
              hidePlayButton
              disabled={busy || phase !== 'round_playing'}
            />
          </div>
        )}

        {isSpectator && (
          <p style={{ color: 'var(--pt-cream)', fontWeight: 800, textShadow: '0 1px 2px var(--pt-ink)' }}>
            观战模式中 · 手牌仅对玩家本人显示
          </p>
        )}

        <div className="pt-dock uno-floating-controls">
          {/* 摸牌 */}
          <button
            type="button"
            className="gp-btn"
            disabled={!canDraw}
            onClick={() => void act({ type: 'draw_card' })}
          >
            摸牌
          </button>

          {/* 喊 UNO：仅 canCallUno 窗口可点，平时禁用 */}
          <button
            type="button"
            className="gp-btn pt-btn-uno"
            disabled={!canCallUno}
            onClick={() => {
              webAudio.playUnoShout();
              setSlamText('UNO!');
              setSlamKind('uno');
              setSlamKey((k) => k + 1);
              void act({ type: 'call_uno' });
            }}
          >
            UNO!
          </button>

          {/* 质疑 / 接受罚牌 */}
          {inWindow && caps.has('canAcceptPenalty') && (
            <button
              type="button"
              className="gp-btn"
              onClick={() => void act({ type: 'accept_penalty', windowToken: view.pendingPenalty?.windowToken ?? '' })}
            >
              接受罚牌 (+{view.pendingPenalty?.total})
            </button>
          )}

          {inWindow && caps.has('canChallengePenalty') && (
            <button
              type="button"
              className="gp-btn"
              onClick={() => void act({ type: 'challenge_penalty', windowToken: view.pendingPenalty?.windowToken ?? '' })}
            >
              质疑 +4
            </button>
          )}

          {/* 抓漏报 */}
          {view.unoRaceWindow && !isMyTurn && view.unoRaceWindow.targetPlayerId !== me?.playerId && (
            <button
              type="button"
              className="gp-btn"
              style={{ background: 'var(--pt-red)', color: 'var(--pt-cream)' }}
              onClick={() => {
                void act({
                  type: 'catch_missed_uno',
                  targetPlayerId: view.unoRaceWindow!.targetPlayerId,
                  windowToken: view.unoRaceWindow!.windowToken,
                });
              }}
            >
              抓漏报！
            </button>
          )}
        </div>
      </div>

      {/* 8. 冲屏大字与卡牌放大残影 */}
      <PartySlam text={slamText} kind={slamKind} ghostCard={ghostCard} triggerKey={slamKey} />

      {/* 9. 选色弹窗 */}
      <PartyColorPicker
        open={wildCardId !== null}
        onSelect={confirmWild}
      />

      {/* 10. 预喊 UNO 确认弹窗 */}
      {preCallCardId !== null && (
        <div className="pt-picker open" role="dialog" aria-modal="true">
          <div className="pt-picker__pad" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '380px', padding: '24px' }}>
            <p>只剩 1 张了！</p>
            <span style={{ fontSize: '14px', color: 'var(--pt-ink)', fontWeight: 700, textAlign: 'center' }}>
              现在喊 UNO 就安全了；不喊的话 5 秒内可能被抓漏报罚摸 2 张。
            </span>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                style={{ width: 'auto', padding: '10px 18px', background: 'var(--pt-yellow)' }}
                onClick={() => {
                  const card = (me?.hand ?? []).find((c) => c.id === preCallCardId);
                  setPreCallCardId(null);
                  if (card) submitPlay(card, true);
                }}
              >
                喊 UNO 并出牌
              </button>
              <button
                type="button"
                style={{ width: 'auto', padding: '10px 18px', background: 'var(--pt-cream)' }}
                onClick={() => {
                  const card = (me?.hand ?? []).find((c) => c.id === preCallCardId);
                  setPreCallCardId(null);
                  if (card) submitPlay(card, false);
                }}
              >
                静默出牌
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. 飞行层 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
    </div>,
  );
}
