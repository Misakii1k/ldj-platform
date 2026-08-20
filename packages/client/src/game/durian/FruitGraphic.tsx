import React, { useId } from 'react';
import type { DurianFruit } from './types.ts';

interface FruitIconProps {
  fruit: DurianFruit | 'monkey';
  size?: number;
  className?: string;
}

/**
 * 高品质矢量水果插画（果园桌游设计美学风格）
 * 包含高光、阴影、细节纹理与饱满层次
 */
export function FruitIcon({ fruit, size = 48, className = '' }: FruitIconProps) {
  const rawId = useId();
  const idPrefix = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (fruit) {
    case 'durian':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--durian ${className}`}
        >
          {/* 果柄 */}
          <path d="M30 4C30 4 29 12 25 14C23 15 25 18 28 17C32 15 34 11 34 4C34 4 32 3 30 4Z" fill="#5c4033" stroke="#2d261e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 榴莲外壳尖刺与本体 */}
          <path
            d="M32 12C20 12 12 22 12 36C12 48 20 58 32 60C44 58 52 48 52 36C52 22 44 12 32 12Z"
            fill={`url(#durian-grad-${idPrefix})`}
            stroke="#2d261e"
            strokeWidth="2"
          />
          {/* 外部立体尖刺装饰 */}
          <path d="M12 28L6 32L13 36M15 20L10 18L18 25M15 44L8 46L16 50M24 56L20 62L28 59M40 56L44 62L36 59M49 44L56 46L48 50M49 28L58 32L48 36M46 20L54 18L46 25M32 12L32 6L36 13" stroke="#713f12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* 内部切开果肉凹槽 */}
          <path d="M32 18C25 22 20 30 20 38C20 46 25 52 32 54C39 52 44 46 44 38C44 30 39 22 32 18Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
          {/* 饱满两瓣金黄果肉 */}
          <ellipse cx="27" cy="37" rx="5" ry="9" fill="#facc15" stroke="#a16207" strokeWidth="1.2" />
          <ellipse cx="37" cy="37" rx="5" ry="9" fill="#fde047" stroke="#a16207" strokeWidth="1.2" />
          {/* 果肉高光 */}
          <ellipse cx="26" cy="34" rx="1.8" ry="4" fill="#ffffff" opacity="0.75" />
          <ellipse cx="36" cy="34" rx="1.8" ry="4" fill="#ffffff" opacity="0.75" />
          <defs>
            <linearGradient id={`durian-grad-${idPrefix}`} x1="12" y1="12" x2="52" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a3e635" />
              <stop offset="0.5" stopColor="#84cc16" />
              <stop offset="1" stopColor="#4d7c0f" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'strawberry':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--strawberry ${className}`}
        >
          {/* 草莓主体 */}
          <path
            d="M32 60C32 60 12 46 12 30C12 18 20 14 32 16C44 14 52 18 52 30C52 46 32 60 32 60Z"
            fill={`url(#berry-grad-${idPrefix})`}
            stroke="#2d261e"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* 高光 */}
          <path d="M18 24C16 30 18 38 22 44" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          {/* 草莓籽 */}
          <circle cx="26" cy="25" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          <circle cx="38" cy="25" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          <circle cx="32" cy="33" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          <circle cx="23" cy="39" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          <circle cx="41" cy="39" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          <circle cx="32" cy="47" r="1.5" fill="#fef08a" stroke="#854d0e" strokeWidth="0.6" />
          {/* 绿叶托与果梗 */}
          <path d="M32 16L32 6M32 16L22 10M32 16L42 10M32 16L18 18M32 16L46 18M32 16L26 21M32 16L38 21" stroke="#15803d" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M32 16L32 6" stroke="#166534" strokeWidth="2" strokeLinecap="round" />
          <defs>
            <linearGradient id={`berry-grad-${idPrefix}`} x1="12" y1="14" x2="52" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f87171" />
              <stop offset="0.4" stopColor="#ef4444" />
              <stop offset="1" stopColor="#991b1b" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'banana':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--banana ${className}`}
        >
          {/* 一串/弯弯熟香蕉 */}
          <path
            d="M20 16C28 14 44 20 48 38C50 46 46 54 40 56C36 57 32 54 34 46C38 32 26 22 18 20L20 16Z"
            fill="#eab308"
            stroke="#2d261e"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M16 14C28 10 48 18 52 40C54 50 48 58 42 58C36 58 32 52 34 44C38 28 24 18 14 18C13 18 14 15 16 14Z"
            fill={`url(#banana-body-grad-${idPrefix})`}
            stroke="#2d261e"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M16 15C30 16 45 26 46 48"
            stroke="#ca8a04"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M20 15C34 14 47 22 49 38"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M14 18C12 17 10 13 12 10C13 8 16 9 17 11L16 14"
            fill="#65a30d"
            stroke="#2d261e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse cx="12" cy="10" rx="2.5" ry="1.5" fill="#3f6212" stroke="#2d261e" strokeWidth="1" />
          <path
            d="M42 58L44 61C44 61 41 62 40 60L42 58Z"
            fill="#713f12"
            stroke="#2d261e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id={`banana-body-grad-${idPrefix}`} x1="14" y1="12" x2="50" y2="58" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fef9c3" />
              <stop offset="0.3" stopColor="#fde047" />
              <stop offset="0.75" stopColor="#facc15" />
              <stop offset="1" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'grape':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--grape ${className}`}
        >
          <path d="M32 16L32 6M32 10C36 8 44 8 46 12M32 10C28 8 20 8 18 12" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M38 12C44 10 48 14 46 18C44 20 40 18 38 12Z" fill="#22c55e" stroke="#15803d" strokeWidth="1.2" />
          <circle cx="24" cy="24" r="7" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="36" cy="24" r="7" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="46" cy="28" r="6.5" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="16" cy="30" r="6.5" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="26" cy="36" r="7" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="38" cy="36" r="7" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="48" cy="40" r="6" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="22" cy="46" r="6.5" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="34" cy="46" r="6.5" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="28" cy="54" r="6" fill={`url(#grape-grad-${idPrefix})`} stroke="#2d261e" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="1.8" fill="#ffffff" opacity="0.85" />
          <circle cx="34" cy="22" r="1.8" fill="#ffffff" opacity="0.85" />
          <circle cx="24" cy="34" r="1.8" fill="#ffffff" opacity="0.85" />
          <circle cx="36" cy="34" r="1.8" fill="#ffffff" opacity="0.85" />
          <circle cx="26" cy="52" r="1.8" fill="#ffffff" opacity="0.85" />
          <defs>
            <linearGradient id={`grape-grad-${idPrefix}`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#c084fc" />
              <stop offset="0.5" stopColor="#9333ea" />
              <stop offset="1" stopColor="#581c87" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'apple':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--apple ${className}`}
        >
          <path
            d="M32 18C28 14 18 12 12 20C4 30 6 48 18 56C24 60 28 58 32 55C36 58 40 60 46 56C58 48 60 30 52 20C46 12 36 14 32 18Z"
            fill={`url(#apple-body-grad-${idPrefix})`}
            stroke="#2d261e"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M28 18C30 20 34 20 36 18" stroke="#7f1d1d" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M16 22C10 30 11 42 18 50"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.65"
          />
          <circle cx="16" cy="24" r="2" fill="#ffffff" opacity="0.8" />
          <path
            d="M32 18C32 12 35 7 39 4"
            stroke="#5c4033"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M34 14C40 9 49 10 47 16C44 20 37 18 34 14Z"
            fill={`url(#apple-leaf-grad-${idPrefix})`}
            stroke="#2d261e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M35 14C39 13 44 14 46 16" stroke="#166534" strokeWidth="1" strokeLinecap="round" />
          <defs>
            <linearGradient id={`apple-body-grad-${idPrefix}`} x1="12" y1="14" x2="52" y2="58" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fb7185" />
              <stop offset="0.3" stopColor="#f43f5e" />
              <stop offset="0.75" stopColor="#dc2626" />
              <stop offset="1" stopColor="#881337" />
            </linearGradient>
            <linearGradient id={`apple-leaf-grad-${idPrefix}`} x1="34" y1="9" x2="47" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#86efac" />
              <stop offset="0.6" stopColor="#22c55e" />
              <stop offset="1" stopColor="#15803d" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'monkey':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`fruit-svg fruit-svg--monkey ${className}`}
        >
          <circle cx="14" cy="28" r="9" fill="#92400e" stroke="#2d261e" strokeWidth="2" />
          <circle cx="14" cy="28" r="5" fill="#fed7aa" />
          <circle cx="50" cy="28" r="9" fill="#92400e" stroke="#2d261e" strokeWidth="2" />
          <circle cx="50" cy="28" r="5" fill="#fed7aa" />
          <ellipse cx="32" cy="34" rx="20" ry="18" fill="#78350f" stroke="#2d261e" strokeWidth="2" />
          <path d="M22 26C18 26 16 34 22 40C28 46 36 46 42 40C48 34 46 26 42 26C38 26 34 30 32 30C30 30 26 26 22 26Z" fill="#ffedd5" stroke="#92400e" strokeWidth="1.5" />
          <ellipse cx="26" cy="32" rx="2.5" ry="3.5" fill="#1e293b" />
          <circle cx="25" cy="31" r="1" fill="#ffffff" />
          <ellipse cx="38" cy="32" rx="2.5" ry="3.5" fill="#1e293b" />
          <circle cx="37" cy="31" r="1" fill="#ffffff" />
          <ellipse cx="32" cy="39" rx="2" ry="1.2" fill="#78350f" />
          <path d="M28 43C30 46 34 46 36 43" stroke="#78350f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M20 22C24 12 40 12 44 22Z" fill="#15803d" stroke="#2d261e" strokeWidth="1.5" />
          <rect x="18" y="20" width="28" height="4" rx="2" fill="#22c55e" stroke="#2d261e" strokeWidth="1" />
        </svg>
      );
  }
}

interface FruitGroupProps {
  fruit: DurianFruit;
  quantity: 1 | 2 | 3;
  size?: number;
  stacked?: boolean;
}

/**
 * 实体水果数量图形展示组（不显示乘号 ×N，通过纯视觉水果摆放/微重叠呈现数量）
 */
export function FruitGroup({ fruit, quantity, size = 64, stacked = true }: FruitGroupProps) {
  if (quantity === 1) {
    return (
      <div className="fruit-group fruit-group--1" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FruitIcon fruit={fruit} size={size} />
      </div>
    );
  }

  if (quantity === 2) {
    const itemSize = Math.round(size * 0.78);
    return (
      <div
        className={`fruit-group fruit-group--2 ${stacked ? 'is-stacked' : 'is-side-by-side'}`}
        style={{ width: stacked ? size * 1.3 : size * 1.7, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      >
        <div className="fruit-item item-1" style={{ position: 'relative', zIndex: 1, transform: stacked ? 'rotate(-4deg)' : 'none' }}>
          <FruitIcon fruit={fruit} size={itemSize} />
        </div>
        <div
          className="fruit-item item-2"
          style={{
            position: 'relative',
            marginLeft: stacked ? `-${Math.round(itemSize * 0.35)}px` : '4px',
            marginTop: stacked ? '4px' : '0',
            zIndex: 2,
            transform: stacked ? 'rotate(5deg)' : 'none',
          }}
        >
          <FruitIcon fruit={fruit} size={itemSize} />
        </div>
      </div>
    );
  }

  // quantity === 3
  const itemSize = Math.round(size * 0.68);
  return (
    <div
      className={`fruit-group fruit-group--3 ${stacked ? 'is-stacked' : 'is-row'}`}
      style={{ width: stacked ? size * 1.5 : size * 2.1, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
    >
      <div className="fruit-item item-1" style={{ position: 'relative', zIndex: 1, transform: stacked ? 'rotate(-6deg)' : 'none' }}>
        <FruitIcon fruit={fruit} size={itemSize} />
      </div>
      <div
        className="fruit-item item-2"
        style={{
          position: 'relative',
          marginLeft: stacked ? `-${Math.round(itemSize * 0.38)}px` : '3px',
          marginTop: stacked ? '6px' : '0',
          zIndex: 2,
          transform: stacked ? 'rotate(3deg)' : 'none',
        }}
      >
        <FruitIcon fruit={fruit} size={itemSize} />
      </div>
      <div
        className="fruit-item item-3"
        style={{
          position: 'relative',
          marginLeft: stacked ? `-${Math.round(itemSize * 0.38)}px` : '3px',
          marginTop: stacked ? '-3px' : '0',
          zIndex: 3,
          transform: stacked ? 'rotate(8deg)' : 'none',
        }}
      >
        <FruitIcon fruit={fruit} size={itemSize} />
      </div>
    </div>
  );
}
