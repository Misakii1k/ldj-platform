import React from 'react';
import { FruitGroup, FruitIcon, FRUIT_COLORS, FRUIT_NAMES, type DurianFruit } from './FruitGraphic';

export type MonkeySpecial = 'flip' | 'do_nothing' | 'three_void' | 'banana_void';

export const MONKEY_SPECIAL_NAMES: Record<MonkeySpecial, string> = {
  flip: '翻转卡牌',
  do_nothing: '无事发生',
  three_void: '3个水果无效',
  banana_void: '所有香蕉无效',
};

export const MONKEY_SPECIAL_DESCS: Record<MonkeySpecial, string> = {
  flip: '翻转桌上任意一张水果牌的生效方向',
  do_nothing: '什么都不做，直接跳过本回合',
  three_void: '桌面上所有标为 3 的水果格子全部失效',
  banana_void: '桌面上所有香蕉全部不计入总数',
};

export const MONKEY_SPECIAL_ICONS: Record<MonkeySpecial, string> = {
  flip: '🔄',
  do_nothing: '🙈',
  three_void: '🚫',
  banana_void: '🍌',
};

export const MONKEY_SPECIAL_COLORS: Record<MonkeySpecial, string> = {
  flip: '#3b82f6',
  do_nothing: '#8b5cf6',
  three_void: '#f97316',
  banana_void: '#eab308',
};

export interface FruitHalf {
  fruit: DurianFruit;
  quantity: 1 | 2 | 3;
}

export type DurianCardData =
  | {
      kind: 'fruit';
      id?: string;
      left: FruitHalf;
      right: FruitHalf;
    }
  | {
      kind: 'monkey';
      id?: string;
      special: MonkeySpecial;
    };

interface DurianCardProps {
  card?: DurianCardData;
  checkHalf?: 'left' | 'right';
  isSecret?: boolean;
  secretLabel?: string;
  isLarge?: boolean;
  width?: number;
  height?: number;
  showBadge?: boolean;
  highlightHalf?: 'left' | 'right' | null;
  rotateDeg?: number;
  glowColor?: string;
  style?: React.CSSProperties;
}

export const DurianCardGraphic: React.FC<DurianCardProps> = ({
  card,
  checkHalf,
  isSecret = false,
  secretLabel = '头顶暗牌（他人可见）',
  isLarge = false,
  width,
  height,
  showBadge = true,
  highlightHalf = null,
  rotateDeg = 0,
  glowColor,
  style = {},
}) => {
  const cardWidth = width ?? (isLarge ? 280 : 210);
  const cardHeight = height ?? (isLarge ? 170 : 130);

  // 暗牌状态
  if (isSecret || !card) {
    return (
      <div
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 18,
          background: 'linear-gradient(145deg, #2c1a0e, #1b1008)',
          border: '3px dashed #eab308',
          boxShadow: glowColor ? `0 0 30px ${glowColor}` : '0 12px 36px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${rotateDeg}deg)`,
          position: 'relative',
          padding: 16,
          boxSizing: 'border-box',
          ...style,
        }}
      >
        <div style={{ fontSize: isLarge ? 52 : 36, filter: 'drop-shadow(0 2px 8px rgba(234,179,8,0.4))' }}>❓</div>
        <div
          style={{
            fontSize: isLarge ? 18 : 14,
            fontWeight: 700,
            color: '#fef08a',
            marginTop: 8,
            textAlign: 'center',
            letterSpacing: 1,
          }}
        >
          {secretLabel}
        </div>
        <div style={{ fontSize: isLarge ? 13 : 11, color: '#a1887f', marginTop: 4 }}>自己看不见 · 别人全看见</div>
      </div>
    );
  }

  // 猴子卡牌
  if (card.kind === 'monkey') {
    const specialColor = MONKEY_SPECIAL_COLORS[card.special];
    return (
      <div
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 18,
          background: `linear-gradient(135deg, ${specialColor}25 0%, #1e1b18 70%, #12100e 100%)`,
          border: `3px solid ${specialColor}`,
          boxShadow: glowColor ? `0 0 30px ${glowColor}` : `0 10px 30px rgba(0,0,0,0.4), 0 0 16px ${specialColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isLarge ? '18px 24px' : '12px 18px',
          boxSizing: 'border-box',
          transform: `rotate(${rotateDeg}deg)`,
          position: 'relative',
          overflow: 'hidden',
          ...style,
        }}
      >
        {/* 背景大水印 */}
        <div
          style={{
            position: 'absolute',
            right: -10,
            bottom: -10,
            fontSize: isLarge ? 100 : 70,
            opacity: 0.15,
            pointerEvents: 'none',
          }}
        >
          {MONKEY_SPECIAL_ICONS[card.special]}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isLarge ? 18 : 12, zIndex: 1 }}>
          <FruitIcon fruit="monkey" size={isLarge ? 72 : 52} />
          <div>
            <div
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                background: specialColor,
                color: '#fff',
                borderRadius: 20,
                fontSize: isLarge ? 13 : 11,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              猴子功能牌
            </div>
            <div style={{ fontSize: isLarge ? 22 : 17, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>
              {MONKEY_SPECIAL_ICONS[card.special]} {MONKEY_SPECIAL_NAMES[card.special]}
            </div>
            <div
              style={{
                fontSize: isLarge ? 13 : 11,
                color: '#cbd5e1',
                marginTop: 4,
                maxWidth: isLarge ? 160 : 120,
                lineHeight: 1.4,
              }}
            >
              {MONKEY_SPECIAL_DESCS[card.special]}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 水果双拼卡牌
  const isLeftChecked = checkHalf === 'left';
  const isRightChecked = checkHalf === 'right';

  const leftColor = FRUIT_COLORS[card.left.fruit];
  const rightColor = FRUIT_COLORS[card.right.fruit];

  return (
    <div
      style={{
        width: cardWidth,
        height: cardHeight,
        borderRadius: 18,
        background: '#fffbf0',
        border: '3px solid #d4c5a0',
        boxShadow: glowColor
          ? `0 0 35px ${glowColor}`
          : '0 12px 32px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.8)',
        display: 'flex',
        overflow: 'hidden',
        transform: `rotate(${rotateDeg}deg)`,
        position: 'relative',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* 左半边 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            checkHalf !== undefined
              ? isLeftChecked
                ? `linear-gradient(180deg, ${leftColor.light} 0%, #ffffff 100%)`
                : 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)'
              : highlightHalf === 'left'
                ? `linear-gradient(180deg, ${leftColor.light} 0%, #fff 100%)`
                : `linear-gradient(180deg, #fffdfa 0%, #faf5ea 100%)`,
          borderRight: '2px dashed #cbd5e1',
          position: 'relative',
          padding: 8,
          opacity: checkHalf !== undefined ? (isLeftChecked ? 1 : 0.45) : 1,
          transition: 'all 0.3s',
        }}
      >
        {/* 生效/作废标签 */}
        {checkHalf !== undefined && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 8,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: isLarge ? 12 : 10,
              fontWeight: 800,
              background: isLeftChecked ? '#16a34a' : '#64748b',
              color: '#fff',
              boxShadow: isLeftChecked ? '0 2px 8px rgba(22,163,74,0.4)' : 'none',
            }}
          >
            {isLeftChecked ? '✓ 生效' : '✗ 作废'}
          </div>
        )}

        <FruitGroup
          fruit={card.left.fruit}
          quantity={card.left.quantity}
          size={isLarge ? 54 : 40}
          stacked={false}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: isLarge ? 15 : 12, fontWeight: 700, color: '#334155' }}>
            {FRUIT_NAMES[card.left.fruit]}
          </span>
          {showBadge && (
            <span
              style={{
                fontSize: isLarge ? 14 : 11,
                fontWeight: 800,
                color: leftColor.primary,
                background: `${leftColor.light}`,
                padding: '1px 6px',
                borderRadius: 8,
                border: `1px solid ${leftColor.border}40`,
              }}
            >
              ×{card.left.quantity}
            </span>
          )}
        </div>
      </div>

      {/* 中轴分割线装饰 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#e2e8f0',
          border: '2px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#64748b',
          fontWeight: 800,
          zIndex: 2,
        }}
      >
        OR
      </div>

      {/* 右半边 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            checkHalf !== undefined
              ? isRightChecked
                ? `linear-gradient(180deg, ${rightColor.light} 0%, #ffffff 100%)`
                : 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)'
              : highlightHalf === 'right'
                ? `linear-gradient(180deg, ${rightColor.light} 0%, #fff 100%)`
                : `linear-gradient(180deg, #fffdfa 0%, #faf5ea 100%)`,
          position: 'relative',
          padding: 8,
          opacity: checkHalf !== undefined ? (isRightChecked ? 1 : 0.45) : 1,
          transition: 'all 0.3s',
        }}
      >
        {/* 生效/作废标签 */}
        {checkHalf !== undefined && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 8,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: isLarge ? 12 : 10,
              fontWeight: 800,
              background: isRightChecked ? '#16a34a' : '#64748b',
              color: '#fff',
              boxShadow: isRightChecked ? '0 2px 8px rgba(22,163,74,0.4)' : 'none',
            }}
          >
            {isRightChecked ? '✓ 生效' : '✗ 作废'}
          </div>
        )}

        <FruitGroup
          fruit={card.right.fruit}
          quantity={card.right.quantity}
          size={isLarge ? 54 : 40}
          stacked={false}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: isLarge ? 15 : 12, fontWeight: 700, color: '#334155' }}>
            {FRUIT_NAMES[card.right.fruit]}
          </span>
          {showBadge && (
            <span
              style={{
                fontSize: isLarge ? 14 : 11,
                fontWeight: 800,
                color: rightColor.primary,
                background: `${rightColor.light}`,
                padding: '1px 6px',
                borderRadius: 8,
                border: `1px solid ${rightColor.border}40`,
              }}
            >
              ×{card.right.quantity}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
