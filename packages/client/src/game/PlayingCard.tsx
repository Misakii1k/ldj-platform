/**
 * PlayingCard — 油画/派对风格定制扑克牌组件。
 *
 * 结合 AI 生成与精准切图的高清美术资源：
 * - 大王 / 小王：宫廷小丑与国王吉祥物立绘
 * - J / Q / K：12 张专属黑桃/红桃/方块/梅花贵族与骑士立绘 + 金箔画框
 * - 黑桃 A：大师级金叶藤蔓花体黑桃勋章
 * - 红桃/梅花/方块 A 及数字牌：宝石级精致花色徽章
 * - 牌背：复古几何金星与纸牌图腾徽章
 * - 经典纸牌角标与 2.5D 象牙白温润卡面
 */

import React, { useId } from 'react';

/** useId 含浏览器安全字符集之外的字位，过滤为纯字母数字下划线，保证 SVG url(#...) 引用可靠 */
function useSvgId(): string {
  const raw = useId();
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

const CARD_ART_MAP: Record<string, string> = {
  // Jokers
  BJ: '/assets/cards/joker_big.png',
  SJ: '/assets/cards/joker_small.png',
  // Spades
  spades_K: '/assets/cards/king_spades.png',
  spades_Q: '/assets/cards/queen_spades.png',
  spades_J: '/assets/cards/jack_spades.png',
  spades_A: '/assets/cards/ace_spades.png',
  // Hearts
  hearts_K: '/assets/cards/king_hearts.png',
  hearts_Q: '/assets/cards/queen_hearts.png',
  hearts_J: '/assets/cards/jack_hearts.png',
  // Clubs
  clubs_K: '/assets/cards/king_clubs.png',
  clubs_Q: '/assets/cards/queen_clubs.png',
  clubs_J: '/assets/cards/jack_clubs.png',
  // Diamonds
  diamonds_K: '/assets/cards/king_diamonds.png',
  diamonds_Q: '/assets/cards/queen_diamonds.png',
  diamonds_J: '/assets/cards/jack_diamonds.png',
};

const SUIT_ART_MAP: Record<string, string> = {
  spades: '/assets/cards/suit_spades.png',
  hearts: '/assets/cards/suit_hearts.png',
  clubs: '/assets/cards/suit_clubs.png',
  diamonds: '/assets/cards/suit_diamonds.png',
};

interface PipPos { x: number; y: number; flip?: boolean }

const PIP_LAYOUTS: Record<number, PipPos[]> = {
  1: [{ x: 50, y: 50 }], // A
  2: [{ x: 50, y: 18 }, { x: 50, y: 82, flip: true }],
  3: [{ x: 50, y: 18 }, { x: 50, y: 50 }, { x: 50, y: 82, flip: true }],
  4: [{ x: 30, y: 18 }, { x: 70, y: 18 }, { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true }],
  5: [{ x: 30, y: 18 }, { x: 70, y: 18 }, { x: 50, y: 50 }, { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true }],
  6: [
    { x: 30, y: 18 }, { x: 70, y: 18 },
    { x: 30, y: 50 }, { x: 70, y: 50 },
    { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true },
  ],
  7: [
    { x: 30, y: 18 }, { x: 70, y: 18 },
    { x: 50, y: 34 },
    { x: 30, y: 50 }, { x: 70, y: 50 },
    { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true },
  ],
  8: [
    { x: 30, y: 18 }, { x: 70, y: 18 },
    { x: 50, y: 34 },
    { x: 30, y: 50 }, { x: 70, y: 50 },
    { x: 50, y: 66, flip: true },
    { x: 30, y: 82, flip: true }, { x: 70, y: 82, flip: true },
  ],
  9: [
    { x: 30, y: 16 }, { x: 70, y: 16 },
    { x: 30, y: 38 }, { x: 70, y: 38 },
    { x: 50, y: 50 },
    { x: 30, y: 62, flip: true }, { x: 70, y: 62, flip: true },
    { x: 30, y: 84, flip: true }, { x: 70, y: 84, flip: true },
  ],
  10: [
    { x: 30, y: 16 }, { x: 70, y: 16 },
    { x: 50, y: 28 },
    { x: 30, y: 38 }, { x: 70, y: 38 },
    { x: 30, y: 62, flip: true }, { x: 70, y: 62, flip: true },
    { x: 50, y: 72, flip: true },
    { x: 30, y: 84, flip: true }, { x: 70, y: 84, flip: true },
  ],
};

function rankText(rank: string): string {
  if (rank === 'SJ') return '小';
  if (rank === 'BJ') return '大';
  return rank;
}

function suitColor(suit?: string): string {
  return suit === 'hearts' || suit === 'diamonds' ? '#d92727' : '#1e293b';
}

function rankNumber(rank: string): number | null {
  const n = Number(rank);
  if (n >= 2 && n <= 10) return n;
  if (rank === 'A') return 1;
  return null;
}

/** 角标 */
function Corner({ rank, suit, color, flip }: {
  rank: string; suit?: string; color: string; flip?: boolean;
}) {
  const text = rankText(rank);
  const suitImg = suit ? SUIT_ART_MAP[suit] : null;
  const suitChar = suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : suit === 'spades' ? '♠' : suit === 'clubs' ? '♣' : '★';
  const isTen = rank === '10';
  const isJokerText = text === '大' || text === '小';

  // 极具辨识度的大号字号与位置
  const fontSize = isTen ? '44' : isJokerText ? '48' : '52';

  return (
    <g transform={flip ? 'translate(250,360) rotate(180)' : 'translate(0,0)'}>
      {/* 角标大号清晰数字（大而不粗，清秀易认） */}
      <text
        x={isTen ? '28' : '26'}
        y="38"
        fill={color}
        fontSize={fontSize}
        fontWeight="600"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing={isTen ? '-2' : '0'}
      >
        {text}
      </text>

      {/* 角标花色大号宝石图标 */}
      {suitImg ? (
        <image
          href={suitImg}
          x="8" y="66"
          width="36" height="36"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <text
          x="26" y="80"
          fill={color}
          fontSize="28"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {suitChar}
        </text>
      )}
    </g>
  );
}

/** 人物牌 (J, Q, K) */
function FaceCardCenter({ rank, suit, color }: { rank: string; suit: string; color: string }) {
  const artKey = `${suit}_${rank}`;
  const artImg = CARD_ART_MAP[artKey];

  return (
    <g>
      {/* 华丽金边画框背景 */}
      <rect x="46" y="55" width="158" height="250" rx="14" ry="14"
        fill="#fbf8f0" stroke="#d4af37" strokeWidth="2.5" />
      <rect x="52" y="61" width="146" height="238" rx="10" ry="10"
        fill="none" stroke="rgba(212,175,55,0.4)" strokeWidth="1" strokeDasharray="4 2" />

      {/* 人物肖像插画 */}
      {artImg ? (
        <image
          href={artImg}
          x="52" y="61"
          width="146" height="238"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <text
          x="125" y="180"
          fill={color}
          fontSize="72"
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {rank}
        </text>
      )}
    </g>
  );
}

/** 大小王 (Joker) */
function JokerCenter({ big, uid }: { big: boolean; uid: string }) {
  const artImg = big ? CARD_ART_MAP.BJ : CARD_ART_MAP.SJ;
  const color = big ? '#d92727' : '#1e293b';
  const glowId = `joker-glow-${uid}-${big ? 'b' : 's'}`;

  return (
    <g>
      {/* 渐变底光 */}
      <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={big ? 'rgba(255,215,0,0.4)' : 'rgba(147,197,253,0.35)'} />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
      <circle cx="125" cy="180" r="90" fill={`url(#${glowId})`} />

      {/* 装饰边框 */}
      <rect x="42" y="55" width="166" height="250" rx="16" ry="16"
        fill="none" stroke={big ? '#eab308' : '#64748b'} strokeWidth="1.8" strokeDasharray="6 3" />

      {/* 大王/小王插画 */}
      {artImg ? (
        <image
          href={artImg}
          x="44" y="60"
          width="162" height="240"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <text x="125" y="180" fill={color} fontSize="44" fontWeight="900" textAnchor="middle">
          {big ? '大王' : '小王'}
        </text>
      )}
    </g>
  );
}

interface PlayingCardProps {
  rank: string;
  suit?: string;
  className?: string;
}

/** 渲染一张完整的 SVG 扑克牌。viewBox 250×360，实际大小由 CSS 控制。 */
export function PlayingCard({ rank, suit, className }: PlayingCardProps) {
  const uid = useSvgId();
  const surfaceGradId = `card-surface-grad-${uid}`;
  const bevelGradId = `card-bevel-grad-${uid}`;
  const dropShadowId = `card-drop-shadow-${uid}`;
  const isJoker = rank === 'SJ' || rank === 'BJ';
  const color = isJoker
    ? (rank === 'BJ' ? '#d92727' : '#1e293b')
    : suitColor(suit);
  const num = rankNumber(rank);
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K';
  const isAce = rank === 'A';
  const isSpadeAce = isAce && suit === 'spades';

  return (
    <svg
      className={`playing-card ${className ?? ''}`}
      viewBox="0 0 250 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={isJoker ? (rank === 'BJ' ? '大王' : '小王') : `${suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : suit === 'spades' ? '♠' : '♣'}${rank}`}
    >
      <defs>
        <linearGradient id={surfaceGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#fffdfa" />
          <stop offset="100%" stopColor="#f7f2e7" />
        </linearGradient>
        <linearGradient id={bevelGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(41,39,34,0.2)" />
        </linearGradient>
        <filter id={dropShadowId} x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* 2.5D 实体卡面底层与边框 */}
      <rect x="2" y="2" width="246" height="356" rx="16" ry="16"
        fill={`url(#${surfaceGradId})`} stroke="#2b2722" strokeWidth="2.5" filter={`url(#${dropShadowId})`} />
      {/* 2.5D 高光内框 */}
      <rect x="6" y="6" width="238" height="348" rx="12" ry="12"
        fill="none" stroke={`url(#${bevelGradId})`} strokeWidth="1.6" />

      {/* 角标 */}
      <Corner rank={rank} suit={suit} color={color} />
      <Corner rank={rank} suit={suit} color={color} flip />

      {/* ── 中央主图 ── */}
      {/* 大小王 */}
      {isJoker && <JokerCenter big={rank === 'BJ'} uid={uid} />}

      {/* J / Q / K 贵族人物立绘 */}
      {isFace && suit && <FaceCardCenter rank={rank} suit={suit} color={color} />}

      {/* 黑桃 A 大师金叶勋章 */}
      {isSpadeAce && (
        <g>
          <image
            href={CARD_ART_MAP.spades_A}
            x="35" y="80"
            width="180" height="200"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}

      {/* 其他花色的 A */}
      {isAce && !isSpadeAce && suit && (
        <g>
          <image
            href={SUIT_ART_MAP[suit]}
            x="50" y="105"
            width="150" height="150"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}

      {/* 数字牌 2-10 (宝石级花色 Pip 排列) */}
      {num !== null && num >= 2 && num <= 10 && suit && (
        <g>
          {(PIP_LAYOUTS[num] ?? []).map((pos, i) => {
            const pipSize = num <= 3 ? 42 : num <= 6 ? 36 : 30;
            const px = pos.x * 2.5 - pipSize / 2;
            const py = pos.y * 3.0 + 25 - pipSize / 2;
            return (
              <image
                key={i}
                href={SUIT_ART_MAP[suit]}
                x={px}
                y={py}
                width={pipSize}
                height={pipSize}
                preserveAspectRatio="xMidYMid meet"
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

/** 渲染一张牌背面。采用生成的复古图腾金徽章。 */
export function CardBack({ className }: { className?: string }) {
  const uid = useSvgId();
  const clipId = `card-back-clip-${uid}`;
  return (
    <svg
      className={`playing-card playing-card--back ${className ?? ''}`}
      viewBox="0 0 250 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="未公开的牌"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="246" height="356" rx="16" ry="16" />
        </clipPath>
      </defs>

      {/* 牌底 */}
      <rect x="2" y="2" width="246" height="356" rx="16" ry="16"
        fill="#1e293b" stroke="#2b2722" strokeWidth="2.5" />

      {/* 牌背插画图案 */}
      <g clipPath={`url(#${clipId})`}>
        <image
          href="/assets/cards/card_back.png"
          x="0" y="0"
          width="250" height="360"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      {/* 外圈高光描边 */}
      <rect x="5" y="5" width="240" height="350" rx="13" ry="13"
        fill="none" stroke="rgba(255,215,0,0.5)" strokeWidth="1.5" />
    </svg>
  );
}


