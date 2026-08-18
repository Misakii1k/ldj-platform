import React from 'react';

export type GameIconName =
  | 'crown'
  | 'farmer'
  | 'trophy'
  | 'bomb'
  | 'rocket'
  | 'horn'
  | 'hourglass'
  | 'pointer'
  | 'sound_on'
  | 'sound_off'
  | 'door_exit'
  | 'cards_deck'
  | 'werewolf'
  | 'undercover'
  | 'robot'
  | 'star';

const ICON_SRC_MAP: Record<GameIconName, string> = {
  crown: '/assets/icons/crown.png',
  farmer: '/assets/icons/farmer.png',
  trophy: '/assets/icons/trophy.png',
  bomb: '/assets/icons/bomb.png',
  rocket: '/assets/icons/rocket.png',
  horn: '/assets/icons/horn.png',
  hourglass: '/assets/icons/hourglass.png',
  pointer: '/assets/icons/pointer.png',
  sound_on: '/assets/icons/sound_on.png',
  sound_off: '/assets/icons/sound_off.png',
  door_exit: '/assets/icons/door_exit.png',
  cards_deck: '/assets/icons/cards_deck.png',
  werewolf: '/assets/icons/werewolf.png',
  undercover: '/assets/icons/undercover.png',
  robot: '/assets/icons/robot.png',
  star: '/assets/icons/star.png',
};

export interface GameIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  name: GameIconName;
  size?: number | string;
  className?: string;
  alt?: string;
}

/**
 * GameIcon — 项目专用美学高保真图标组件
 * 替代普通系统 emoji，呈现统一的 2.5D 复古派对桌游质感。
 */
export function GameIcon({
  name,
  size = 18,
  className = '',
  style,
  alt = '',
  ...rest
}: GameIconProps) {
  const src = ICON_SRC_MAP[name];
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <img
      src={src}
      alt={alt || name}
      className={`game-icon game-icon--${name} ${className}`}
      style={{
        width: dimension,
        height: dimension,
        display: 'inline-block',
        verticalAlign: '-0.18em',
        objectFit: 'contain',
        flexShrink: 0,
        ...style,
      }}
      draggable={false}
      {...rest}
    />
  );
}
