/**
 * PlayingCard — 内联 SVG 扑克牌组件。
 *
 * 根据 rank + suit 绘制一张完整的矢量扑克牌面，包含：
 * - 左上角标（数字/字母 + 花色小图标）
 * - 右下角标（旋转 180°）
 * - 中央花色 pip 布局（数字牌按传统扑克排列）
 * - J/Q/K 人物牌装饰
 * - 大小王特殊设计
 * - 牌背设计
 *
 * 设计风格：温暖复古，白/米白卡面，与项目 party UI 一致。
 */

// ── 花色 SVG 路径 ──────────────────────────────────────
// viewBox origin (0,0), 大小约 100×100

const SUIT_PATHS: Record<string, string> = {
  spades:
    'M50 5 C50 5 5 40 5 60 C5 80 25 90 50 75 C75 90 95 80 95 60 C95 40 50 5 50 5Z M42 75 L50 95 L58 75Z',
  hearts:
    'M50 90 C50 90 5 55 5 35 C5 15 25 5 50 30 C75 5 95 15 95 35 C95 55 50 90 50 90Z',
  diamonds:
    'M50 5 L90 50 L50 95 L10 50Z',
  clubs:
    'M50 15 C35 15 20 25 20 40 C20 55 35 60 45 55 C35 70 25 75 25 75 L50 95 L75 75 C75 75 65 70 55 55 C65 60 80 55 80 40 C80 25 65 15 50 15Z',
};

// ── Pip 布局：每种点数的花色图标位置 ──────────────────
// 坐标是 SVG viewBox 中的百分比位置 (cx%, cy%), 有些需要翻转

interface PipPos { x: number; y: number; flip?: boolean }

const PIP_LAYOUTS: Record<number, PipPos[]> = {
  1: [{ x: 50, y: 50 }], // A — 中央大 pip
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

// ── 点数 → 显示文本 ──────────────────────────────────
function rankText(rank: string): string {
  if (rank === 'SJ') return '小';
  if (rank === 'BJ') return '大';
  return rank;
}

function suitColor(suit?: string): string {
  return suit === 'hearts' || suit === 'diamonds' ? '#c81e1e' : '#1a1a2e';
}

function rankNumber(rank: string): number | null {
  const n = Number(rank);
  if (n >= 2 && n <= 10) return n;
  if (rank === 'A') return 1;
  return null;
}

// ── 单个 pip 图标 ─────────────────────────────────────
function SuitPip({ suit, x, y, size, flip, color }: {
  suit: string; x: number; y: number; size: number; flip?: boolean; color: string;
}) {
  const path = SUIT_PATHS[suit];
  if (!path) return null;
  const halfSize = size / 2;
  return (
    <g transform={`translate(${x},${y}) scale(${size / 100}) ${flip ? 'rotate(180)' : ''} translate(-50,-50)`}>
      <path d={path} fill={color} transform={`translate(${-halfSize + 50}, ${-halfSize + 50})`} />
    </g>
  );
}

// ── 角标 ──────────────────────────────────────────────
function Corner({ rank, suit, color, flip }: {
  rank: string; suit?: string; color: string; flip?: boolean;
}) {
  const text = rankText(rank);
  const suitChar = suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : suit === 'spades' ? '♠' : suit === 'clubs' ? '♣' : '★';
  return (
    <g transform={flip ? 'translate(250,360) rotate(180)' : 'translate(0,0)'}>
      <text
        x="20" y="48"
        fill={color}
        fontSize={text.length > 1 ? '28' : '32'}
        fontWeight="800"
        fontFamily="Arial, 'Microsoft YaHei', sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
      <text
        x="20" y="76"
        fill={color}
        fontSize="24"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {suitChar}
      </text>
    </g>
  );
}

// ── 人物牌 J/Q/K 中央装饰 ─────────────────────────────
function FaceCardCenter({ rank, color, suit }: { rank: string; color: string; suit: string }) {
  const suitPath = SUIT_PATHS[suit];
  // 中文字符 + 装饰框
  const label = rank === 'J' ? 'J' : rank === 'Q' ? 'Q' : 'K';
  return (
    <g>
      {/* 装饰框 */}
      <rect x="55" y="75" width="140" height="210" rx="12" ry="12"
        fill="none" stroke={color} strokeWidth="2.5" opacity=".35" />
      <rect x="62" y="82" width="126" height="196" rx="8" ry="8"
        fill={color} opacity=".07" />
      {/* 大字母 */}
      <text
        x="125" y="175"
        fill={color}
        fontSize="100"
        fontWeight="900"
        fontFamily="Georgia, 'Times New Roman', serif"
        textAnchor="middle"
        dominantBaseline="central"
        opacity=".22"
      >
        {label}
      </text>
      {/* 中央花色 */}
      {suitPath && (
        <g transform="translate(125,180) scale(0.42)" opacity=".85">
          <g transform="translate(-50,-50)">
            <path d={suitPath} fill={color} />
          </g>
        </g>
      )}
      {/* 装饰冠/剑/花符号 */}
      <text
        x="125" y="120"
        fill={color}
        fontSize="36"
        textAnchor="middle"
        dominantBaseline="central"
        opacity=".6"
      >
        {rank === 'K' ? '♚' : rank === 'Q' ? '♛' : '♞'}
      </text>
    </g>
  );
}

// ── 大小王 ────────────────────────────────────────────
function JokerCenter({ big }: { big: boolean }) {
  const color = big ? '#c81e1e' : '#1a1a2e';
  const bgColor = big ? '#fff5f5' : '#f0f4ff';
  const label = big ? '大王' : '小王';
  const star = big ? '★' : '☆';
  return (
    <g>
      {/* 背景渐变圆 */}
      <circle cx="125" cy="180" r="75" fill={bgColor} stroke={color} strokeWidth="2" opacity=".5" />
      <circle cx="125" cy="180" r="60" fill="none" stroke={color} strokeWidth="1.5" opacity=".25" />
      {/* 星星装饰 */}
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <text
          key={angle}
          x={125 + 68 * Math.cos((angle * Math.PI) / 180)}
          y={180 + 68 * Math.sin((angle * Math.PI) / 180)}
          fill={color}
          fontSize="14"
          textAnchor="middle"
          dominantBaseline="central"
          opacity=".4"
        >
          {star}
        </text>
      ))}
      {/* 中心文字 */}
      <text
        x="125" y="168"
        fill={color}
        fontSize="44"
        fontWeight="900"
        fontFamily="'Microsoft YaHei', 'PingFang SC', sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label[0]}
      </text>
      <text
        x="125" y="210"
        fill={color}
        fontSize="30"
        fontWeight="800"
        fontFamily="'Microsoft YaHei', 'PingFang SC', sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
        opacity=".7"
      >
        {label[1]}
      </text>
      {/* JOKER 英文 */}
      <text
        x="125" y="245"
        fill={color}
        fontSize="11"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing="4"
        opacity=".35"
      >
        JOKER
      </text>
    </g>
  );
}

// ── 主组件 ────────────────────────────────────────────

interface PlayingCardProps {
  rank: string;
  suit?: string;
  className?: string;
}

/** 渲染一张完整的 SVG 扑克牌。viewBox 250×360，实际大小由 CSS 控制。 */
export function PlayingCard({ rank, suit, className }: PlayingCardProps) {
  const isJoker = rank === 'SJ' || rank === 'BJ';
  const color = isJoker
    ? (rank === 'BJ' ? '#c81e1e' : '#1a1a2e')
    : suitColor(suit);
  const num = rankNumber(rank);
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K';
  const isAce = rank === 'A';

  return (
    <svg
      className={`playing-card ${className ?? ''}`}
      viewBox="0 0 250 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={isJoker ? (rank === 'BJ' ? '大王' : '小王') : `${suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : suit === 'spades' ? '♠' : '♣'}${rank}`}
    >
      <defs>
        <linearGradient id="card-surface-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#fffcf5" />
          <stop offset="100%" stopColor="#f7f0e3" />
        </linearGradient>
        <linearGradient id="card-bevel-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(49,45,40,0.25)" />
        </linearGradient>
      </defs>

      {/* 2.5D 实体卡面底层与边框 */}
      <rect x="2" y="2" width="246" height="356" rx="16" ry="16"
        fill="url(#card-surface-grad)" stroke="#312d28" strokeWidth="3" />
      {/* 2.5D 高光压痕内框 */}
      <rect x="7" y="7" width="236" height="346" rx="12" ry="12"
        fill="none" stroke="url(#card-bevel-grad)" strokeWidth="1.8" />

      {/* 角标 */}
      <Corner rank={rank} suit={suit} color={color} />
      <Corner rank={rank} suit={suit} color={color} flip />

      {/* 中央区域 */}
      {isJoker && <JokerCenter big={rank === 'BJ'} />}

      {isFace && suit && <FaceCardCenter rank={rank} color={color} suit={suit} />}

      {isAce && suit && (
        /* A — 中央大花色 */
        <g>
          {SUIT_PATHS[suit] && (
            <g transform="translate(125,185) scale(0.72)">
              <g transform="translate(-50,-50)">
                <path d={SUIT_PATHS[suit]} fill={color} />
              </g>
            </g>
          )}
        </g>
      )}

      {num !== null && num >= 2 && num <= 10 && suit && (
        /* 数字牌 — pip 排列 */
        <g>
          {(PIP_LAYOUTS[num] ?? []).map((pos, i) => (
            <SuitPip
              key={i}
              suit={suit}
              x={pos.x * 2.5}  /* 250/100=2.5 映射到 viewBox */
              y={pos.y * 3.0 + 25} /* 偏移角标区域 */
              size={num <= 3 ? 32 : num <= 6 ? 28 : 24}
              flip={pos.flip}
              color={color}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

/** 渲染一张牌背面。 */
export function CardBack({ className }: { className?: string }) {
  return (
    <svg
      className={`playing-card playing-card--back ${className ?? ''}`}
      viewBox="0 0 250 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="未公开的牌"
    >
      <defs>
        <pattern id="card-back-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#1e3a5f" />
          <path d="M0 10 L10 0 L20 10 L10 20Z" fill="#243f6b" opacity=".6" />
        </pattern>
        <linearGradient id="card-back-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#111827" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="246" height="356" rx="16" ry="16"
        fill="url(#card-back-grad)" stroke="#312d28" strokeWidth="3" />
      <rect x="12" y="12" width="226" height="336" rx="10" ry="10"
        fill="url(#card-back-pattern)" opacity=".5" />
      <rect x="12" y="12" width="226" height="336" rx="10" ry="10"
        fill="none" stroke="#fde68a" strokeWidth="2" opacity=".6" />
      {/* 中央装饰 */}
      <text
        x="125" y="175"
        fill="#fde68a"
        fontSize="48"
        fontWeight="900"
        fontFamily="Georgia, serif"
        textAnchor="middle"
        dominantBaseline="central"
        opacity=".35"
      >
        ♠
      </text>
      <text
        x="125" y="195"
        fill="#fde68a"
        fontSize="12"
        fontWeight="800"
        fontFamily="'Microsoft YaHei', sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing="3"
        opacity=".3"
      >
        闹一桌
      </text>
    </svg>
  );
}

