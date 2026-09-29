import React from 'react';

export interface BidChipsProps {
  /** 当前最高叫分（0 表示暂无人叫分） */
  currentScore?: number;
  /** 点击木牌回调（若可直接交互） */
  onSelect?: (score: 1 | 2 | 3) => void;
  className?: string;
}

/**
 * 斗地主桌心叫分木牌（1分 / 2分 / 3分）。
 *
 * 契约：contracts/landlord.md §4.1
 * - 已被超越的分数变灰（is-taken）
 * - 当前最高叫分变金色并挂"最高"角标（is-top）
 */
export function BidChips({
  currentScore = 0,
  onSelect,
  className = '',
}: BidChipsProps) {
  const scores: Array<1 | 2 | 3> = [1, 2, 3];

  return (
    <div className={`th-bid-board ${className}`.trim()} data-box="bids">
      {scores.map((score) => {
        const isTaken = currentScore > score;
        const isTop = currentScore === score && currentScore > 0;

        const chipClasses = [
          'th-chip',
          isTaken && 'is-taken',
          isTop && 'is-top',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={score}
            className={chipClasses}
            data-score={score}
            onClick={() => onSelect?.(score)}
            aria-label={`叫 ${score} 分${isTop ? '（最高）' : ''}`}
          >
            <small>叫</small>
            {score}
            <small>分</small>
          </div>
        );
      })}
    </div>
  );
}
