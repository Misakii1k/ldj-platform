import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { RollingNumber } from '../../../shared-ui/RollingNumber.tsx';
import { TabletopVictoryBurst } from '../../../shared-ui/TabletopVictoryBurst.tsx';
import { nameFor, type MemberLike } from '../../useGameAction.ts';
import { PartyCard } from '../../party-table/PartyCard.tsx';
import { PartySlam } from '../../party-table/PartySlam.tsx';
import type { UnoCard, UnoHousePlayerView } from '../types.ts';

export interface UnoRoundResultProps {
  view: UnoHousePlayerView;
  members: readonly MemberLike[];
  remainingHands?: readonly (readonly UnoCard[])[];
  onNextRound?: () => void;
  onShowLeaderboard?: () => void;
  className?: string;
}

interface ResultPlayerRow {
  id: string;
  name: string;
  avatar?: string;
  cards: readonly UnoCard[];
  thisRoundScore: number;
  prevCumulativeScore: number;
  finalCumulativeScore: number;
  rank: number;
}

function getMotionLevel(): 'full' | 'reduced' | 'minimal' | 'off' {
  if (typeof document === 'undefined') return 'full';
  const level = document.documentElement.getAttribute('data-motion-level');
  if (level === 'reduced' || level === 'minimal' || level === 'off') {
    return level;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return 'reduced';
  }
  return 'full';
}

export const UnoRoundResult: React.FC<UnoRoundResultProps> = ({
  view,
  members,
  remainingHands,
  onNextRound,
  className,
}) => {
  const isMatchOver = view.phase === 'match_over';
  const motion = getMotionLevel();
  const isReduced = motion === 'reduced';
  const isMinimal = motion === 'minimal' || motion === 'off';

  // 1. 组装每位玩家的结算数据
  const initialRows: ResultPlayerRow[] = useMemo(() => {
    const players = view.players;
    const roundIdx = view.round - 1;
    const thisRoundScores = view.roundScores[roundIdx] ?? [];
    const cumulative = view.cumulativeScores ?? [];

    return players.map((p, idx) => {
      const member = members.find((m) => m.playerId === p.playerId);
      const roundScore = thisRoundScores[idx] ?? 0;
      const totalScore = cumulative[idx] ?? 0;
      const prevTotal = Math.max(0, totalScore - roundScore);
      const cards = remainingHands?.[idx] ?? [];

      return {
        id: p.playerId,
        name: nameFor(members, p.playerId),
        avatar: member?.avatar,
        cards,
        thisRoundScore: roundScore,
        prevCumulativeScore: prevTotal,
        finalCumulativeScore: totalScore,
        rank: idx + 1,
      };
    });
  }, [view.players, view.round, view.roundScores, view.cumulativeScores, members, remainingHands]);

  // 胜者判定：match_over 取 rank 1；round_over 取本局 0 分或出完者
  const winner = useMemo(() => {
    if (isMatchOver && view.matchRanking && view.matchRanking.length > 0) {
      const first = view.matchRanking.find((r) => r.rank === 1);
      if (first) {
        return members.find((m) => m.playerId === first.playerId) ?? { playerId: first.playerId, nickname: '玩家' };
      }
    }
    // 优先用服务端结算快照的出完者；缺快照时退化为本局 0 分启发式
    const finisherId = view.lastRound?.finisherPlayerId;
    if (finisherId) {
      return members.find((m) => m.playerId === finisherId) ?? { playerId: finisherId, nickname: '玩家' };
    }
    const zeroScorer = initialRows.find((r) => r.thisRoundScore === 0);
    if (zeroScorer) {
      return members.find((m) => m.playerId === zeroScorer.id) ?? { playerId: zeroScorer.id, nickname: '玩家' };
    }
    return members[0] ?? { playerId: 'unknown', nickname: '玩家' };
  }, [isMatchOver, view.matchRanking, view.lastRound, initialRows, members]);

  const [rows, setRows] = useState<ResultPlayerRow[]>(initialRows);
  const [sorted, setSorted] = useState<boolean>(isMinimal);
  // 行入场：挂载时不带 in，下一帧再加，错峰过渡才真正生效
  const [, setEntered] = useState<boolean>(isMinimal);
  const [slamText, setSlamText] = useState<string>('');
  const [slamKey, setSlamKey] = useState<number>(0);
  const rowElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPositionsRef = useRef<Map<string, number>>(new Map());

  // 2. 动画阶段控制：冲屏 → 逐行展开与跳分 → FLIP 换位重排
  useEffect(() => {
    if (isMinimal) {
      setEntered(true);
      setSlamText('');
      const finalSorted = [...initialRows].sort(
        (a, b) => a.finalCumulativeScore - b.finalCumulativeScore
      );
      setRows(
        finalSorted.map((r, k) => ({
          ...r,
          rank: k + 1,
        }))
      );
      setSorted(true);
      return;
    }

    // 冲屏只播一次：播完由 PartySlam 自行卸载，不得常驻
    setSlamText(isMatchOver ? '冠军诞生！' : 'UNO!');
    setSlamKey((k) => k + 1);
    // 冲屏进行中行再依次入场
    const enterTimer = setTimeout(() => setEntered(true), isReduced ? 150 : 500);

    const timer = setTimeout(() => {
      // 记录排序前的绝对 top 位置
      const positions = new Map<string, number>();
      rowElementsRef.current.forEach((el, id) => {
        positions.set(id, el.getBoundingClientRect().top);
      });
      prevPositionsRef.current = positions;

      // 按累计分低者优先排序
      const nextSorted = [...initialRows].sort(
        (a, b) => a.finalCumulativeScore - b.finalCumulativeScore
      );
      setRows(
        nextSorted.map((r, k) => ({
          ...r,
          rank: k + 1,
        }))
      );
      setSorted(true);
    }, isReduced ? 600 : 1500);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(timer);
    };
  }, [initialRows, isMinimal, isReduced]);

  // 3. FLIP 动画：排序后平滑移动各行
  useLayoutEffect(() => {
    if (!sorted || isMinimal) return;
    const prevPositions = prevPositionsRef.current;
    if (prevPositions.size === 0) return;

    rowElementsRef.current.forEach((el, id) => {
      const prevTop = prevPositions.get(id);
      if (prevTop !== undefined) {
        const newTop = el.getBoundingClientRect().top;
        const dy = prevTop - newTop;
        if (Math.abs(dy) > 0.5) {
          el.animate(
            [
              { transform: `translateY(${dy}px)` },
              { transform: 'none' },
            ],
            {
              duration: 480,
              easing: 'cubic-bezier(.22, 1, .36, 1)',
            }
          );
        }
      }
    });
    prevPositionsRef.current.clear();
  }, [sorted, rows, isMinimal]);

  const roundsRemaining = Math.max(0, view.roundLimit - view.round);
  const me = view.me;
  const isWinnerMe = me?.playerId === winner.playerId;

  return (
    <div className={`pt-result-view ${className ?? ''}`}>
      {/* 胜者爆头与残影 */}
      <PartySlam text={slamText} kind={isMatchOver ? 'phrase' : 'uno'} triggerKey={slamKey} />

      {/* 整场结束胜利彩花 */}
      {isMatchOver ? (
        <TabletopVictoryBurst
          gameOver={true}
          isWinner={isWinnerMe}
          label="整场结束"
          sublabel={`冠军：${nameFor(members, winner.playerId)}`}
        />
      ) : null}

      {/* 局数/结束状态由外壳顶栏副标题承载，不再重复渲染左上标签 */}

      {/* 纸板圆盘背景与胜者徽章 */}
      <div className="pt-disc pt-disc--result" aria-hidden="true" />
      <div className="pt-winner-badge in">
        <div className="avatar">
          <UserAvatar avatar={winner.avatar} nickname={nameFor(members, winner.playerId)} size={76} />
        </div>
        <b>{nameFor(members, winner.playerId)} {isMatchOver ? '获胜！' : '出完了！'}</b>
        <small>{isMatchOver ? '总冠军' : '本局 0 分'}</small>
      </div>

      {/* 计分板卡片 */}
      <div className="pt-result-board">
        <h3>
          {isMatchOver ? '总榜' : '本局计分'}
          <small>
            分越低越好 · {isMatchOver ? '最终结算' : `还剩 ${roundsRemaining} 局`}
          </small>
        </h3>

        <div className="pt-result-board-head">
          <span>名次</span>
          <span>玩家</span>
          <span>剩牌</span>
          <span>本局</span>
          <span>累计</span>
        </div>

        <div className="pt-result-rows">
          {rows.map((row, rowIdx) => {
            const isBest = sorted && row.rank === 1;
            return (
              <div
                key={row.id}
                ref={(el) => {
                  if (el) rowElementsRef.current.set(row.id, el);
                  else rowElementsRef.current.delete(row.id);
                }}
                className={`pt-result-row in ${isBest ? 'best' : ''}`}
                data-player-id={row.id}
                style={{ '--row-i': rowIdx } as React.CSSProperties}
              >
                <span className="rk">
                  {isBest ? '★' : ''}{row.rank}
                </span>
                <span className="nm">
                  <i>
                    <UserAvatar avatar={row.avatar} nickname={row.name} size={28} />
                  </i>
                  {row.name}
                </span>

                <span className="cards">
                  {row.cards.length === 0 ? (
                    <span className="none">出完了</span>
                  ) : (
                    row.cards.map((c, cIdx) => (
                      <PartyCard
                        key={c.id ?? cIdx}
                        card={c}
                        size={34}
                        className="flip"
                        style={{ animationDelay: `${cIdx * 90}ms` }}
                      />
                    ))
                  )}
                </span>

                <span className={`pts ${row.thisRoundScore === 0 ? 'zero' : ''}`}>
                  <RollingNumber
                    value={row.thisRoundScore}
                  />
                  <small>本局</small>
                </span>

                <span className="tot">
                  <RollingNumber
                    value={sorted ? row.finalCumulativeScore : row.prevCumulativeScore}
                  />
                  <small>累计</small>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部操作坞 */}
      <div className="pt-result-actions">
        {onNextRound ? (
          <button
            type="button"
            className="gp-btn gp-btn--primary"
            onClick={onNextRound}
          >
            {isMatchOver ? '返回大厅' : '下一局'}
          </button>
        ) : null}
      </div>
    </div>
  );
};
