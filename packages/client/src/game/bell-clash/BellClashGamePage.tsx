/**
 * bell_clash_v1 客户端主页面（Ding）。
 *
 * 视觉：整屏色块派对桌（.pt-table）。
 * 盘心大铃，出牌与摸牌走共享飞行层，拍铃挑卡，亮卡质疑与胶囊投票。
 * 详见 docs/plans/2026-09-26-cards-trio-visual/contracts/ding.md
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { CardFanEngine, type CardItem } from '../../shared-ui/CardFanEngine.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { DeskBell } from './stage/DeskBell.tsx';
import { ChallengePanel } from './stage/ChallengePanel.tsx';
import { BellClashResult } from './stage/BellClashResult.tsx';
import { useBellClashStage } from './stage/useBellClashStage.tsx';
import { PartyCloth, type PartyColor } from '../party-table/PartyCloth.tsx';
import { PartyDisc } from '../party-table/PartyDisc.tsx';
import { PartyCard } from '../party-table/PartyCard.tsx';
import { PartySeatRing } from '../party-table/PartySeatRing.tsx';
import { PartySticker } from '../party-table/PartySticker.tsx';
import { PartySlam } from '../party-table/PartySlam.tsx';
import { sortByColor } from '../party-table/cornerHandLayout.ts';
import { UserAvatar } from '../../user/UserAvatar.tsx';
import type { BellClashCard, BellClashPlayerView, PhraseCard } from './types.ts';

interface Props {
  view: BellClashPlayerView;
}

export function BellClashGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  // 手牌尺寸改由 .pt-table 作用域的 --fan-card-w/--fan-card-h 令牌驱动（断点契约内随视口变化）。
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // 纯客户端挑卡态
  const [picking, setPicking] = useState(false);
  const [emptyPhraseAlert, setEmptyPhraseAlert] = useState(false);

  const isMyTurn = view.currentPlayerId === myId && view.phase !== 'game_over';
  const top = view.discardTop;
  const currentColor: PartyColor = (top?.color ?? 'green') as PartyColor;

  const nameOf = useCallback((id: string) => nameFor(members, id), [members]);
  const avatarOf = useCallback(
    (id: string) => {
      const member = members.find((m) => m.playerId === id);
      return <UserAvatar nickname={nameOf(id)} avatar={member?.avatar} size={36} />;
    },
    [members, nameOf],
  );

  const stage = useBellClashStage(view, nameOf);

  // 挑卡态如果在 challenge 或 game_over 时自动退出
  useEffect(() => {
    if (view.challenge !== null || view.phase === 'game_over') {
      setPicking(false);
    }
  }, [view.challenge, view.phase]);

  // 判断手牌是否可合法打出
  const canPlayCard = (card: BellClashCard): boolean => {
    if (!top) return true;
    if (card.color === top.color) return true;
    if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
    return false;
  };

  const handlePlayCardAtIndex = (cardIndex: number) => {
    if (!myId || busy || !isMyTurn || view.challenge !== null) return;
    void act({ type: 'play_card', playerId: myId, cardIndex });
  };

  const handleDrawCard = () => {
    if (!myId || busy || !isMyTurn || view.challenge !== null) return;
    void act({ type: 'draw_card', playerId: myId });
    setPicking(false);
  };

  // 检查手里是否有短语卡
  const myPhrases = useMemo(() => {
    if (!me?.hand) return [];
    return me.hand
      .map((c, idx) => ({ card: c, originalIndex: idx }))
      .filter((x): x is { card: PhraseCard; originalIndex: number } => x.card.kind === 'phrase');
  }, [me?.hand]);

  // 点击铃或点击「拍铃！」按钮
  const handleRingClick = () => {
    if (!myId || busy || view.challenge !== null) return;

    if (myPhrases.length === 0) {
      stage.triggerBellMiss();
      setEmptyPhraseAlert(true);
      setTimeout(() => setEmptyPhraseAlert(false), 1600);
      return;
    }

    if (picking) {
      setPicking(false);
    } else {
      setPicking(true);
      stage.triggerBellHit();
    }
  };

  // 挑卡态下点中一张短语卡发起质疑
  const handlePickPhrase = (originalIndex: number) => {
    if (!myId || busy) return;
    void act({ type: 'ring_bell', playerId: myId, cardIndex: originalIndex });
    setPicking(false);
  };

  // 投票处理
  const handleVote = (doubt: boolean) => {
    if (!myId || busy || view.challenge === null) return;
    void act({ type: 'challenge_vote', playerId: myId, doubt });
  };

  // 手牌预处理与排序
  const rawHand = me?.hand ?? [];
  const indexedHand = useMemo(
    () => rawHand.map((c, idx) => ({ ...c, originalIndex: idx })),
    [rawHand],
  );
  const sortedHand = useMemo(() => sortByColor(indexedHand), [indexedHand]);

  const fanCards: CardItem[] = sortedHand.map((card) => {
    const isPhrase = card.kind === 'phrase';
    const isHot = picking && isPhrase;
    const isDim = (picking && !isPhrase) || (!picking && isMyTurn && !canPlayCard(card));
    const cardId = `card-${card.originalIndex}-${card.color}-${
      card.kind === 'phrase' ? card.phrase : card.number
    }`;

    return {
      id: cardId,
      label: card.kind === 'phrase' ? card.phrase : `${card.color} ${card.number}`,
      disabled: picking ? !isPhrase : !isMyTurn || !canPlayCard(card),
      badge: isPhrase ? '短语' : undefined,
      customContent: (
        <PartyCard
          card={{
            id: cardId,
            kind: card.kind,
            color: card.color,
            number: card.kind === 'number' ? card.number : undefined,
            phrase: card.kind === 'phrase' ? card.phrase : undefined,
          }}
          dim={isDim}
          className={isHot ? 'is-pick-target' : undefined}
        />
      ),
    };
  });

  const handleCardClick = (card: CardItem) => {
    const item = sortedHand.find(
      (c) =>
        card.id ===
        `card-${c.originalIndex}-${c.color}-${
          c.kind === 'phrase' ? c.phrase : c.number
        }`,
    );
    if (!item) return;

    if (picking) {
      if (item.kind === 'phrase') {
        handlePickPhrase(item.originalIndex);
      }
      return;
    }

    if (isMyTurn && canPlayCard(item)) {
      handlePlayCardAtIndex(item.originalIndex);
    }
  };

  // 对手席位列表
  const opponentSeats = useMemo(() => {
    return view.players
      .filter((id) => id !== myId)
      .map((id) => {
        const member = members.find((m) => m.playerId === id);
        const count = view.handCounts?.[id] ?? 0;
        const isCurrent = id === view.currentPlayerId && view.phase !== 'game_over';
        const isOne = count === 1;

        return {
          id,
          name: nameFor(members, id),
          avatar: <UserAvatar nickname={nameFor(members, id)} avatar={member?.avatar} size={36} />,
          handCount: count,
          isActive: isCurrent,
          isOne,
        };
      });
  }, [view.players, myId, members, view.handCounts, view.currentPlayerId, view.phase]);

  // 我的席位
  const mySeat = useMemo(() => {
    if (!myId) return null;
    const member = members.find((m) => m.playerId === myId);
    const count = view.handCounts?.[myId] ?? rawHand.length;
    return {
      id: myId,
      name: `${nameFor(members, myId)}（你）`,
      avatar: <UserAvatar nickname={nameFor(members, myId)} avatar={member?.avatar} size={36} />,
      handCount: count,
      isActive: isMyTurn,
      isOne: count === 1,
    };
  }, [myId, members, view.handCounts, rawHand.length, isMyTurn]);

  // 阶段提示语
  const phaseWord = useMemo(() => {
    if (emptyPhraseAlert) return '手里没有短语卡';
    if (picking) return '点一张你看到的动作';
    if (view.challenge !== null) {
      const claimant = nameOf(view.challenge.claimantId);
      return `${claimant} 拍铃！质疑进行中`;
    }
    if (view.phase === 'game_over') return '对局结束';
    if (isMyTurn) return '轮到你出牌';
    return `轮到 ${nameOf(view.currentPlayerId)}`;
  }, [emptyPhraseAlert, picking, view.challenge, view.phase, isMyTurn, view.currentPlayerId, nameOf]);

  const isChallenge = view.challenge !== null;

  return (
    <div
      className={`bc-game pt-table ${picking ? 'is-picking' : ''} ${isChallenge ? 'is-challenging' : ''}`}
      data-color={currentColor}
      ref={stage.stageRef}
      onClick={() => {
        if (picking) setPicking(false);
      }}
    >
      {/* 桌面背景泼色 */}
      <PartyCloth
        color={currentColor}
        art={['叮', '!', '🔔', '?']}
      />

      {/* 顶部工具栏与局数/阶段说明 */}
      <div className="pt-top-bar">
        <div className="pt-phase-pill" data-box="phase">
          {phaseWord}
        </div>
        <div className="pt-top-actions">
          <button
            ref={rulesRef}
            type="button"
            className="pt-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              setRulesOpen(true);
            }}
            title="规则说明"
            aria-label="规则说明"
          >
            <BookOpen className="w-5 h-5 text-current" />
          </button>
        </div>
      </div>

      {/* 对手贴纸环 */}
      {!isSpectator && opponentSeats.length > 0 && (
        <PartySeatRing seats={opponentSeats} />
      )}

      {/* 盘心中央区 */}
      <PartyDisc className="bc-disc">
        {/* 质疑倒计时环（紧贴圆盘边缘） */}
        <StageCountdownRing
          deadlineAt={view.deadlineAt}
          phaseKey={view.deadlineKind === 'challenge' ? `challenge:${view.challenge?.claimantId}` : `turn:${view.currentPlayerId}`}
          active={view.deadlineAt !== null && view.phase !== 'game_over'}
          className="bc-countdown-ring"
        />

        {/* 盘心内容：平时为铃+牌堆+弃牌；质疑态切换为亮卡+投票面板 */}
        {isChallenge && view.challenge ? (
          <ChallengePanel
            challenge={view.challenge}
            myId={myId}
            nameOf={nameOf}
            avatarOf={avatarOf}
            onVote={handleVote}
            busy={busy}
            showNope={stage.showNope}
          />
        ) : (
          <div className="bc-core" data-box="core">
            {/* 摸牌堆 */}
            <div
              className="bc-deck"
              data-box="deck"
              data-stage-anchor="draw"
              onClick={(e) => {
                e.stopPropagation();
                handleDrawCard();
              }}
            >
              <PartyCard
                card={{ id: 'deck-top', kind: 'back', face: 'back' }}
                className="bc-deck-card"
              />
              <span className="pt-deck-count" data-count={view.drawCount}>
                {view.drawCount}
              </span>
            </div>

            {/* 盘心金色大铃 */}
            <DeskBell
              isHit={stage.bellHit}
              isMiss={stage.bellMiss}
              disabled={isSpectator || busy}
              onClick={() => handleRingClick()}
            />

            {/* 弃牌堆 */}
            <div
              className="bc-discard"
              data-box="discard"
              data-stage-anchor="discard"
            >
              {top ? (
                <PartyCard
                  card={{
                    id: `discard-${top.color}-${top.kind === 'phrase' ? top.phrase : top.number}`,
                    kind: top.kind,
                    color: top.color,
                    number: top.kind === 'number' ? top.number : undefined,
                    phrase: top.kind === 'phrase' ? top.phrase : undefined,
                  }}
                  className="bc-discard-card"
                />
              ) : (
                <div className="pt-discard-empty" />
              )}
            </div>
          </div>
        )}
      </PartyDisc>

      {/* 挑卡提示气泡 */}
      {picking && (
        <div className="bc-pick-tip">
          点一张你看到的动作
        </div>
      )}

      {/* 我方区域（手牌与操作坞） */}
      {!isSpectator && me && (
        <div className="pt-me-zone" data-box="me-zone" onClick={(e) => e.stopPropagation()}>
          {/* 手机上本人的贴纸在手牌上方 */}
          {mySeat && (
            <div className="pt-my-sticker-wrap">
              <PartySticker
                id={mySeat.id}
                name={mySeat.name}
                avatar={mySeat.avatar}
                handCount={mySeat.handCount}
                isActive={mySeat.isActive}
                isOne={mySeat.isOne}
                isOpponent={false}
                className="pt-my-sticker"
              />
            </div>
          )}

          {/* 扇形手牌区 */}
          <div className="pt-hand-wrap" data-stage-anchor="hand">
            <CardFanEngine
              cards={fanCards}
              crowdMode="corner"
              hidePlayButton
              onPlayCard={handleCardClick}
            />
          </div>

          {/* 底部操作坞 */}
          <div className="pt-dock" data-box="dock">
            <button
              type="button"
              className="pt-btn"
              disabled={busy || !isMyTurn || isChallenge}
              onClick={handleDrawCard}
            >
              摸牌
            </button>
            <button
              type="button"
              className={`pt-btn pt-btn--primary ${picking ? 'pt-btn--active' : ''}`}
              disabled={busy || isChallenge}
              onClick={handleRingClick}
            >
              拍铃！
            </button>
          </div>
        </div>
      )}

      {/* 终局结算画面 */}
      {view.phase === 'game_over' && (
        <BellClashResult
          view={view}
          nameOf={nameOf}
          avatarOf={avatarOf}
        />
      )}

      {/* 冲屏演出（终局由 BellClashResult 接管：门控掉 game_over，
          否则质疑失败残留的「拍错了！罚摸 1」会压住结算获胜横幅） */}
      {view.phase !== 'game_over' && (
        <PartySlam
          text={stage.slam?.text}
          kind={stage.slam?.kind ?? ''}
          triggerKey={stage.slam?.text}
        />
      )}

      {/* 共享卡牌飞行演出层 */}
      <FlightLayer flights={stage.flights} />

      {/* 规则说明抽屉 */}
      {rulesOpen && (
        <GameDrawer
          kind="rules"
          title="铃铛对决 · 游戏规则"
          triggerRef={rulesRef}
          onClose={() => setRulesOpen(false)}
        >
          <div className="prose prose-sm dark:prose-invert">
            <h4>基本玩法</h4>
            <p>按颜色或数字出牌。当打出手牌只剩 1 张时，注意准备拍铃或保护自己！</p>
            <h4>拍铃与短语卡</h4>
            <p>任何时候，当你观察到现实中有人做出了某动作，都可以拍下案台正中的金色大铃！</p>
            <p>亮出手里对应的短语卡（无需同色），其他玩家有 3 秒时间质疑。</p>
            <p>若质疑未过半，你成功抢到出牌权并将该短语卡打出；若过半人认为没人做过，你将被罚摸 1 张牌！</p>
          </div>
        </GameDrawer>
      )}
    </div>
  );
}
