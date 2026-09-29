import React, { useEffect, useState } from 'react';
import { DeskBell } from './DeskBell';
import { PartyCard } from '../../party-table/PartyCard';
import type { BellClashPlayerView } from '../types';

export interface BellClashResultProps {
  view: BellClashPlayerView;
  nameOf: (playerId: string) => string;
  avatarOf: (playerId: string) => React.ReactNode;
  onReturnRoom?: () => void;
  onPlayAgain?: () => void;
  canRestart?: boolean;
}

interface RankedPlayer {
  playerId: string;
  name: string;
  handCount: number;
  rank: number;
  isWinner: boolean;
}

export const BellClashResult: React.FC<BellClashResultProps> = ({
  view,
  nameOf,
  avatarOf,
  onReturnRoom,
  onPlayAgain,
  canRestart = true,
}) => {
  const [animStep, setAnimStep] = useState(0);

  useEffect(() => {
    // 铃响与卡片逐张入场节奏
    const t1 = setTimeout(() => setAnimStep(1), 100);
    const t2 = setTimeout(() => setAnimStep(2), 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const winners = view.winners ?? [];
  const players = view.players;
  const handCounts = view.handCounts ?? {};

  // 排序：剩余手牌少者在前
  const sorted = [...players].sort((a, b) => (handCounts[a] ?? 0) - (handCounts[b] ?? 0));

  let currentRank = 1;
  const ranked: RankedPlayer[] = sorted.map((id, index) => {
    const count = handCounts[id] ?? 0;
    if (index > 0) {
      const prevId = sorted[index - 1];
      const prevCount = prevId ? (handCounts[prevId] ?? 0) : 0;
      if (count > prevCount) {
        currentRank = index + 1;
      }
    }
    return {
      playerId: id,
      name: nameOf(id),
      handCount: count,
      rank: currentRank,
      isWinner: winners.includes(id),
    };
  });

  const isDeckEmpty = view.drawCount === 0;
  const winnerNames = winners.map((id) => nameOf(id)).join('、');
  const titleText = isDeckEmpty
    ? `牌摸完了 · ${winnerNames} 获胜`
    : winners.length === 1
    ? `${winnerNames} 先出完！`
    : `${winnerNames} 获胜！`;

  return (
    <div className="bc-result-layer" data-box="game-result">
      {/* 缩小的圆盘与盘心铃 */}
      <div className="bc-result-disc">
        <DeskBell
          isHit={animStep === 1}
          disabled
          className="bc-result-bell"
        />
      </div>

      <div className={`bc-champ ${animStep >= 1 ? 'in' : ''}`}>
        <b>{titleText}</b>
        <small>本局获胜</small>
      </div>

      <div className="bc-rest">
        {ranked.map((player, idx) => (
          <div
            key={player.playerId}
            className={`bc-rest-row ${animStep >= 2 ? 'in' : ''}`}
            style={{
              transitionDelay: `${idx * 140}ms`,
              animationDelay: `${idx * 140}ms`,
            }}
          >
            <div className="bc-rest-row__who">
              <i>{avatarOf(player.playerId) ?? player.name.slice(0, 1)}</i>
              <span>{player.name}</span>
            </div>
            <div className="bc-rest-row__rk">#{player.rank}</div>
            <div className="bc-rest-row__backs">
              {Array.from({ length: Math.min(player.handCount, 6) }, (_, k) => (
                <PartyCard
                  key={k}
                  card={{ id: `back-${k}`, kind: 'back', face: 'back' }}
                  className="bc-rest-back-card"
                />
              ))}
            </div>
            <div className="bc-rest-row__left-n">
              {player.handCount}
              <small>张</small>
            </div>
          </div>
        ))}
      </div>

      <div className="bc-after-dock">
        {onReturnRoom && (
          <button
            type="button"
            className="pt-btn"
            onClick={onReturnRoom}
          >
            返回房间
          </button>
        )}
        {canRestart && onPlayAgain && (
          <button
            type="button"
            className="pt-btn pt-btn--primary"
            onClick={onPlayAgain}
          >
            再来一局
          </button>
        )}
      </div>
    </div>
  );
};
