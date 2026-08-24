import React from 'react';

interface BellGraphicProps {
  size?: number;
  isRinging?: boolean;
  shakeDeg?: number;
  showRipple?: boolean;
  label?: string;
  sublabel?: string;
  style?: React.CSSProperties;
}

export const BellGraphic: React.FC<BellGraphicProps> = ({
  size = 140,
  isRinging = false,
  shakeDeg = 0,
  showRipple = true,
  label = '抢单按铃',
  sublabel = '怀疑超卖 · 叫来店长',
  style = {},
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        ...style,
      }}
    >
      {/* 扩散声波环 */}
      {isRinging && showRipple && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: size * 1.5,
              height: size * 1.5,
              borderRadius: '50%',
              border: '3px solid rgba(234, 179, 8, 0.6)',
              animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: size * 1.9,
              height: size * 1.9,
              borderRadius: '50%',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              animation: 'ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* 叮咚声波符号 */}
      {isRinging && (
        <div
          style={{
            position: 'absolute',
            top: -15,
            display: 'flex',
            gap: 40,
            fontSize: 24,
            fontWeight: 800,
            color: '#fef08a',
            textShadow: '0 0 10px rgba(234,179,8,0.8)',
            zIndex: 5,
          }}
        >
          <span>✨ DING!</span>
          <span>DONG! ✨</span>
        </div>
      )}

      {/* 铃铛矢量 SVG */}
      <div
        style={{
          transform: `rotate(${shakeDeg}deg)`,
          transformOrigin: '50% 10%',
          transition: 'transform 0.05s linear',
          filter: isRinging
            ? 'drop-shadow(0 0 35px rgba(234,179,8,0.8)) drop-shadow(0 12px 28px rgba(0,0,0,0.6))'
            : 'drop-shadow(0 12px 24px rgba(0,0,0,0.45))',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* 黄金金属渐变 */}
            <linearGradient id="gold-dome" x1="20" y1="20" x2="100" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fef08a" />
              <stop offset="0.3" stopColor="#facc15" />
              <stop offset="0.7" stopColor="#ca8a04" />
              <stop offset="1" stopColor="#713f12" />
            </linearGradient>
            {/* 顶帽渐变 */}
            <linearGradient id="gold-knob" x1="50" y1="8" x2="70" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fef9c3" />
              <stop offset="0.5" stopColor="#eab308" />
              <stop offset="1" stopColor="#854d0e" />
            </linearGradient>
            {/* 底座木质/金属渐变 */}
            <linearGradient id="bell-base" x1="10" y1="88" x2="110" y2="110" gradientUnits="userSpaceOnUse">
              <stop stopColor="#475569" />
              <stop offset="0.5" stopColor="#1e293b" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* 稳重底座 */}
          <ellipse cx="60" cy="100" rx="46" ry="12" fill="url(#bell-base)" stroke="#0f172a" strokeWidth="2.5" />
          <ellipse cx="60" cy="98" rx="42" ry="10" fill="#334155" />
          <rect x="54" y="86" width="12" height="12" fill="#713f12" />

          {/* 钟罩主体 */}
          <path
            d="M60 20C40 20 28 42 24 72C24 82 20 88 16 90C30 96 90 96 104 90C100 88 96 82 96 72C92 42 80 20 60 20Z"
            fill="url(#gold-dome)"
            stroke="#5c3b09"
            strokeWidth="3"
          />

          {/* 高光反光弧 */}
          <path
            d="M36 40C40 30 50 25 60 25"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.8"
          />
          <path
            d="M32 60C34 50 38 42 42 38"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.6"
          />

          {/* 顶端按压手柄 */}
          <rect x="57" y="14" width="6" height="8" rx="2" fill="url(#gold-knob)" stroke="#713f12" strokeWidth="1.5" />
          <ellipse cx="60" cy="14" rx="9" ry="5" fill="url(#gold-knob)" stroke="#713f12" strokeWidth="2" />
          <ellipse cx="58" cy="13" rx="4" ry="2" fill="#ffffff" opacity="0.85" />

          {/* 钟舌 / 摆锤（底部微露） */}
          <circle cx="60" cy="92" r="6" fill="#ca8a04" stroke="#713f12" strokeWidth="2" />
        </svg>
      </div>

      {/* 按钮说明标签 */}
      {label && (
        <div
          style={{
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: isRinging ? '#fde047' : '#fff',
              letterSpacing: 2,
              textShadow: isRinging ? '0 0 12px rgba(253,224,71,0.8)' : '0 2px 4px rgba(0,0,0,0.6)',
            }}
          >
            {label}
          </div>
          {sublabel && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              {sublabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
