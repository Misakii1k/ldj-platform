import React from 'react';

export interface PartyStickerProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  name: string;
  avatar?: React.ReactNode;
  handCount: number;
  isActive?: boolean;
  isOne?: boolean;
  isOpponent?: boolean;
  bubbleText?: string;
  rotDeg?: number;
  dataBox?: string;
  className?: string;
}

export const PartySticker: React.FC<PartyStickerProps> = ({
  id,
  name,
  avatar,
  handCount,
  isActive,
  isOne,
  isOpponent,
  bubbleText,
  rotDeg = 0,
  dataBox,
  className,
  style,
  ...rest
}) => {
  const classes = [
    'pt-sticker',
    isActive && 'pt-sticker--active',
    isOne && 'pt-sticker--one',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const computedStyle: React.CSSProperties = {
    ['--rot' as string]: `${rotDeg}deg`,
    ...style,
  };

  return (
    <div
      className={classes}
      data-player-id={id}
      data-box={dataBox ?? `seat-${id}`}
      style={computedStyle}
      {...rest}
    >
      <div className="pt-sticker__avatar">{avatar}</div>
      <b>{name}</b>
      <span
        className={`pt-sticker__n ${isOpponent ? 'uno-opponent-cards-tag' : ''}`}
        data-count={handCount}
      >
        {handCount}
      </span>
      {bubbleText ? (
        <span key={bubbleText} className="pt-sticker__say show">
          {bubbleText}
        </span>
      ) : null}
    </div>
  );
};
