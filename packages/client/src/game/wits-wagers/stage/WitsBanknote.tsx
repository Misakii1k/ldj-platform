import { useId } from 'react';
import type { ChipId, NoteDenomination } from '../types.ts';

export interface WitsBanknoteProps {
  readonly denomination: NoteDenomination;
  /** 宽度（px）；高度按 120:64 的钞票比例推出 */
  readonly width?: number;
  /** 角标：基础筹码用 A/B 标明是哪一枚永久筹码 */
  readonly badge?: ChipId | null;
  /** 半透明预览：草稿未保存时用来和已确认的钞票区分 */
  readonly pending?: boolean;
  readonly className?: string;
}

/** 四种面值各一套配色。色相拉开，缩到 40px 宽也能一眼分辨。 */
const PALETTE: Record<NoteDenomination, { base: string; deep: string; light: string; ink: string }> = {
  100: { base: '#8c3b2e', deep: '#5f2419', light: '#d78a76', ink: '#fdf2ea' },
  200: { base: '#2f4a8a', deep: '#1c2f5e', light: '#8aa3dc', ink: '#eef2ff' },
  500: { base: '#2e6b4a', deep: '#1a4530', light: '#8ccba7', ink: '#eefbf3' },
  1000: { base: '#b08a2e', deep: '#7a5c14', light: '#f0d78a', ink: '#fff9e6' },
};

/** 钞票的长宽比（横版） */
export const NOTE_ASPECT = 64 / 120;

/**
 * 一张钞票。
 *
 * 内联 SVG 而非图片：面值配色要随主题走，飞行时还要对同一节点做 3D transform，
 * 位图缩放会糊边。渐变与底纹的 id 用 useId 加前缀，避免同页多张钞票互相覆盖
 * —— SVG 的 id 是全文档作用域的。
 */
export function WitsBanknote({
  denomination,
  width = 64,
  badge = null,
  pending = false,
  className = '',
}: WitsBanknoteProps) {
  const color = PALETTE[denomination];
  const uid = useId().replace(/:/g, '');
  const gradId = `wwn-g-${uid}`;
  const patId = `wwn-p-${uid}`;
  const height = Math.round(width * NOTE_ASPECT);

  return (
    <span
      className={`ww-note ${pending ? 'ww-note--pending' : ''} ${className}`.trim()}
      data-note-denom={denomination}
      style={{ width, height }}
      aria-label={`${denomination} 元钞票${badge ? `（筹码 ${badge}）` : ''}`}
    >
      <svg viewBox="0 0 120 64" width={width} height={height} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color.light} />
            <stop offset="0.5" stopColor={color.base} />
            <stop offset="1" stopColor={color.deep} />
          </linearGradient>
          <pattern id={patId} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 3h6M3 0v6" stroke={color.deep} strokeWidth="0.6" opacity="0.35" />
          </pattern>
        </defs>

        <rect x="1" y="1" width="118" height="62" rx="6" fill={`url(#${gradId})`} />
        <rect x="1" y="1" width="118" height="62" rx="6" fill={`url(#${patId})`} />
        <rect
          x="4"
          y="4"
          width="112"
          height="56"
          rx="4"
          fill="none"
          stroke={color.ink}
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        {/* 左侧色带与花纹章：钞票的识别特征，缩小后也还在 */}
        <rect x="8" y="4" width="22" height="56" fill={color.deep} opacity="0.55" />
        <circle cx="19" cy="32" r="9" fill="none" stroke={color.ink} strokeOpacity="0.7" strokeWidth="1.4" />
        <circle cx="19" cy="32" r="4" fill={color.ink} fillOpacity="0.8" />

        <text
          x="74"
          y="40"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize={denomination >= 1000 ? 24 : 28}
          fill={color.ink}
          letterSpacing="1"
        >
          {denomination}
        </text>
        <text x="108" y="14" textAnchor="end" fontSize="8" fill={color.ink} fillOpacity="0.8">
          ¥
        </text>
        <text x="38" y="58" fontSize="7" fill={color.ink} fillOpacity="0.7" letterSpacing="1">
          WITS BANK
        </text>

        {badge && (
          <>
            <circle cx="104" cy="50" r="9" fill={color.ink} />
            <text
              x="104"
              y="53.5"
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fill={color.deep}
            >
              {badge}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}
