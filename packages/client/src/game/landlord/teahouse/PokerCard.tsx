import React from 'react';
import type { LandlordRank, LandlordSuit } from '../types.ts';

export type PokerRank = LandlordRank | '小王' | '大王';
export type PokerSuit = LandlordSuit | '♠' | '♥' | '♣' | '♦';

export interface PokerCardProps {
  rank?: PokerRank;
  suit?: PokerSuit;
  size?: 'sm' | 'md' | 'lg' | number;
  back?: boolean;
  selected?: boolean;
  isNew?: boolean;
  flip?: boolean;
  isLand?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const RED_SUITS = new Set<string>(['hearts', 'diamonds', '♥', '♦']);

function normalizeSuit(suit?: PokerSuit): { symbol: string; isRed: boolean } {
  if (!suit) return { symbol: '', isRed: false };
  const isRed = RED_SUITS.has(suit);
  let symbol = suit;
  if (suit === 'spades') symbol = '♠';
  else if (suit === 'hearts') symbol = '♥';
  else if (suit === 'clubs') symbol = '♣';
  else if (suit === 'diamonds') symbol = '♦';
  return { symbol, isRed };
}

/**
 * 斗地主茶馆扑克牌面组件。
 *
 * 契约：contracts/landlord.md §3, §4
 * - 数字牌：中央花色，双角标
 * - 人头牌（J/Q/K）：中央字母 + 冠（♛）+ 圆形淡徽
 * - 大小王：垂直 JOKER 双角标，中央圆章 + 星号（★），大王带浅红底衬
 * - 牌背：朱红回纹 + 金色"乐"字
 */
export function PokerCard({
  rank,
  suit,
  size,
  back = false,
  selected = false,
  isNew = false,
  flip = false,
  isLand = false,
  onClick,
  className = '',
  style,
}: PokerCardProps) {
  const isJoker = rank === '小王' || rank === '大王' || rank === 'SJ' || rank === 'BJ';
  const isBig = rank === '大王' || rank === 'BJ';
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K';
  const { symbol: suitSymbol, isRed: isSuitRed } = normalizeSuit(suit);
  const isRed = isJoker ? isBig : isSuitRed;

  const classNames = [
    'th-card',
    back && 'is-back',
    isRed && 'is-red',
    isFace && 'is-face',
    isJoker && 'is-joker',
    isBig && 'is-big',
    size === 'sm' && 'is-sm',
    size === 'lg' && 'is-lg',
    selected && 'is-selected',
    isNew && 'is-new',
    flip && 'is-flip',
    isLand && 'is-land',
    className,
  ].filter(Boolean).join(' ');

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(typeof size === 'number' ? { ['--w' as string]: `${size}px` } : {}),
  };

  if (back) {
    return (
      <div
        className={classNames}
        style={mergedStyle}
        onClick={onClick}
        aria-label="扑克牌背面"
      />
    );
  }

  const ariaLabel = isJoker
    ? (isBig ? '大王' : '小王')
    : `${suitSymbol}${rank ?? ''}`;

  return (
    <div
      className={classNames}
      style={mergedStyle}
      onClick={onClick}
      aria-label={ariaLabel}
      data-rank={rank}
      data-suit={suit}
    >
      {isJoker ? (
        <>
          <span className="th-card__corner th-card__corner--tl">
            <b>JOKER</b>
          </span>
          <span className="th-card__corner th-card__corner--br">
            <b>JOKER</b>
          </span>
          <span className="th-card__mid">
            <span className="th-card__mid-inner">{isBig ? '大' : '小'}</span>
          </span>
        </>
      ) : (
        <>
          <span className="th-card__corner th-card__corner--tl">
            <b>{rank}</b>
            <i>{suitSymbol}</i>
          </span>
          <span className="th-card__corner th-card__corner--br">
            <b>{rank}</b>
            <i>{suitSymbol}</i>
          </span>
          <span className="th-card__mid">
            {isFace ? (
              <span className="th-card__mid-inner">{rank}</span>
            ) : (
              <span>{suitSymbol}</span>
            )}
          </span>
        </>
      )}
    </div>
  );
}
