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
  | 'star'
  | 'uno_wild'
  | 'uno_skip'
  | 'uno_reverse'
  | 'uno_draw2'
  | 'uno_draw4'
  | 'uno_alert'
  | 'uno_challenge'
  | 'wits-wagers'
  | 'wits_wagers'
  | (string & {});

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
  uno_wild: '/assets/icons/uno_wild.png',
  uno_skip: '/assets/icons/uno_skip.png',
  uno_reverse: '/assets/icons/uno_reverse.png',
  uno_draw2: '/assets/icons/uno_draw2.png',
  uno_draw4: '/assets/icons/uno_draw4.png',
  uno_alert: '/assets/icons/uno_alert.png',
  uno_challenge: '/assets/icons/uno_challenge.png',
  'wits-wagers': '/icons/wits-wagers.png',
  'wits_wagers': '/icons/wits-wagers.png',
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
  onError,
  ...rest
}: GameIconProps) {
  const src = ICON_SRC_MAP[name] || `/icons/${name}.png`;
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
      onError={(e) => {
        if (onError) {
          onError(e);
        } else {
          // 优雅隐藏加载失败的破裂图片
          (e.currentTarget as HTMLElement).style.visibility = 'hidden';
        }
      }}
      draggable={false}
      {...rest}
    />
  );
}
