import React from 'react';

export type PartyCardFace =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'draw4'
  | 'phrase'
  | 'back';

export type PartyCardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild' | 'back';

export interface PartyCardDescriptor {
  color?: PartyCardColor;
  face: PartyCardFace;
  value?: number | string;
  phrase?: string;
}

export type PartyCardInput =
  | PartyCardDescriptor
  | { kind: 'number'; color: string; value?: number; number?: number; id?: string }
  | { kind: 'phrase'; color: string; phrase: string; id?: string }
  | { kind: 'skip' | 'reverse' | 'draw2'; color: string; id?: string }
  | { kind: 'wild' | 'wild4'; id?: string }
  | { kind: string; [key: string]: unknown };

export interface PartyCardProps extends React.HTMLAttributes<HTMLDivElement> {
  card: PartyCardInput;
  size?: number;
  playable?: boolean;
  dim?: boolean;
  tinted?: boolean;
  backLabel?: string;
  backAccent?: string;
  className?: string;
}

const GLYPHS: Record<string, string> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '★',
  draw4: '+4',
  wild4: '+4',
};

export function normalizePartyCard(raw: PartyCardInput): PartyCardDescriptor {
  if (!raw) {
    return { face: 'back', color: 'back' };
  }
  if ('face' in raw) {
    return raw as PartyCardDescriptor;
  }
  const kind = raw.kind;
  if (kind === 'number') {
    const numCard = raw as { color?: string; value?: number; number?: number };
    return {
      face: 'number',
      color: (numCard.color as PartyCardColor) || 'red',
      value: numCard.value ?? numCard.number,
    };
  }
  if (kind === 'phrase') {
    const phrCard = raw as { color?: string; phrase?: string };
    return {
      face: 'phrase',
      color: (phrCard.color as PartyCardColor) || 'green',
      phrase: phrCard.phrase,
    };
  }
  if (kind === 'skip' || kind === 'reverse' || kind === 'draw2') {
    const actCard = raw as { color?: string };
    return {
      face: kind,
      color: (actCard.color as PartyCardColor) || 'red',
    };
  }
  if (kind === 'wild') {
    return {
      face: 'wild',
      color: 'wild',
    };
  }
  if (kind === 'wild4' || kind === 'draw4') {
    return {
      face: 'draw4',
      color: 'wild',
    };
  }
  if (kind === 'back') {
    const backCard = raw as { value?: number | string };
    return {
      face: 'back',
      color: 'back',
      value: backCard.value,
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    face: 'number',
    color: (r.color as PartyCardColor) || 'red',
    value: (r.value as number | string | undefined) ?? (r.number as number | string | undefined) ?? '',
  };
}

export const PartyCard: React.FC<PartyCardProps> = ({
  card,
  size,
  playable,
  dim,
  tinted,
  backLabel = 'UNO',
  backAccent,
  className,
  style,
  ...rest
}) => {
  const descriptor = normalizePartyCard(card);
  const isBack = descriptor.face === 'back' || descriptor.color === 'back';
  const isPhrase = descriptor.face === 'phrase';
  const isWild =
    descriptor.face === 'wild' ||
    descriptor.face === 'draw4' ||
    descriptor.color === 'wild';

  const colorClass = isBack
    ? 'pt-card--back'
    : isWild
    ? 'pt-card--wild'
    : descriptor.color
    ? `pt-card--${descriptor.color}`
    : '';

  const classes = [
    'pt-card',
    colorClass,
    isPhrase && 'pt-card--phrase',
    playable && 'pt-card--playable',
    dim && 'pt-card--dim',
    tinted && 'pt-card--tinted',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const computedStyle: React.CSSProperties = { ...style };
  if (size !== undefined) {
    (computedStyle as Record<string, string | number>)['--w'] = `${size}px`;
  }
  if (isBack && backAccent) {
    (computedStyle as Record<string, string | number>)['--pt-back-accent'] = backAccent;
  }

  if (isBack) {
    return (
      <div
        className={classes}
        style={computedStyle}
        data-face="back"
        {...rest}
      >
        <span className="pt-card__face" />
        <span className="pt-card__v">{descriptor.value ?? backLabel}</span>
      </div>
    );
  }

  if (isPhrase) {
    return (
      <div
        className={classes}
        style={computedStyle}
        data-color={descriptor.color}
        data-face="phrase"
        {...rest}
      >
        <span className="pt-card__face" />
        <span className="pt-card__v">{descriptor.phrase}</span>
        <span className="pt-card__c1">!</span>
        <span className="pt-card__c2">!</span>
      </div>
    );
  }

  const glyph =
    descriptor.face === 'number'
      ? String(descriptor.value ?? '')
      : GLYPHS[descriptor.face] ?? String(descriptor.value ?? '');

  return (
    <div
      className={classes}
      style={computedStyle}
      data-color={descriptor.color}
      data-face={descriptor.face}
      data-v={descriptor.face}
      {...rest}
    >
      <span className="pt-card__face" />
      <span className="pt-card__v">{glyph}</span>
      <span className="pt-card__c1">{glyph}</span>
      <span className="pt-card__c2">{glyph}</span>
    </div>
  );
};
