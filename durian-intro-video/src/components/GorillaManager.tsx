import React from 'react';

export type GorillaMood = 'calm' | 'suspicious' | 'angry' | 'checking';

interface GorillaManagerProps {
  mood?: GorillaMood;
  angerLevel?: number; // 1 to 7
  size?: number;
  showAngerBar?: boolean;
  style?: React.CSSProperties;
}

export const GorillaManager: React.FC<GorillaManagerProps> = ({
  mood = 'angry',
  angerLevel = 1,
  size = 180,
  showAngerBar = true,
  style = {},
}) => {
  const isAngry = mood === 'angry' || angerLevel >= 4;
  const isChecking = mood === 'checking';

  // 猩猩颜色
  const furColor = '#271c19';
  const skinColor = '#523a34';
  const chestColor = '#3a2824';

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
      {/* 怒气蒸汽 */}
      {isAngry && (
        <div style={{ position: 'absolute', top: -20, display: 'flex', gap: 30, zIndex: 10 }}>
          <span style={{ fontSize: 28, animation: 'bounce 1s infinite' }}>💨</span>
          <span style={{ fontSize: 28, animation: 'bounce 1.2s infinite' }}>💢</span>
          <span style={{ fontSize: 28, animation: 'bounce 1s infinite' }}>💨</span>
        </div>
      )}

      {/* 猩猩主体 SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: isAngry
            ? 'drop-shadow(0 8px 24px rgba(239,68,68,0.5)) drop-shadow(0 0 12px rgba(234,179,8,0.3))'
            : 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))',
        }}
      >
        {/* 壮硕胸肌与肩膀 */}
        <path
          d="M20 140C20 110 40 85 80 85C120 85 140 110 140 140C140 155 120 160 80 160C40 160 20 155 20 140Z"
          fill={furColor}
          stroke="#120c0a"
          strokeWidth="3"
        />
        <path
          d="M50 110C50 98 62 92 80 92C98 92 110 98 110 110C110 135 98 150 80 150C62 150 50 135 50 110Z"
          fill={chestColor}
        />
        {/* 胸肌分割线 */}
        <line x1="80" y1="95" x2="80" y2="140" stroke="#221512" strokeWidth="2.5" />
        <path d="M60 118C70 122 90 122 100 118" stroke="#221512" strokeWidth="2" strokeLinecap="round" />

        {/* 经理领结 / 围裙 */}
        <path d="M72 90L80 98L88 90L84 84L80 88L76 84Z" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />
        <circle cx="80" cy="94" r="2.5" fill="#fef08a" />

        {/* 头部 */}
        <ellipse cx="80" cy="55" rx="42" ry="40" fill={furColor} stroke="#120c0a" strokeWidth="3" />
        {/* 头部毛发耸立 (怒发冲冠) */}
        {isAngry ? (
          <path
            d="M60 25L68 12L76 22L80 8L86 22L94 12L102 25"
            fill={furColor}
            stroke="#120c0a"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ) : (
          <path d="M65 22C72 16 88 16 95 22" fill={furColor} stroke="#120c0a" strokeWidth="2" />
        )}

        {/* 双耳 */}
        <circle cx="36" cy="55" r="10" fill={furColor} stroke="#120c0a" strokeWidth="2.5" />
        <circle cx="36" cy="55" r="5.5" fill={skinColor} />
        <circle cx="124" cy="55" r="10" fill={furColor} stroke="#120c0a" strokeWidth="2.5" />
        <circle cx="124" cy="55" r="5.5" fill={skinColor} />

        {/* 面部面具结构 */}
        <path
          d="M50 42C44 48 46 62 52 70C60 80 100 80 108 70C114 62 116 48 110 42C102 34 88 38 80 39C72 38 58 34 50 42Z"
          fill={skinColor}
          stroke="#2d1e1a"
          strokeWidth="2.5"
        />

        {/* 浓密眉毛 */}
        {isAngry ? (
          <path
            d="M52 38L76 48M108 38L84 48"
            stroke="#120c0a"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M54 44C62 42 74 44 76 47M106 44C98 42 86 44 84 47"
            stroke="#120c0a"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* 眼睛 */}
        <circle cx="65" cy="52" r="6.5" fill="#f8fafc" stroke="#120c0a" strokeWidth="1.5" />
        <circle cx="95" cy="52" r="6.5" fill="#f8fafc" stroke="#120c0a" strokeWidth="1.5" />
        {isAngry ? (
          <>
            <circle cx="66" cy="52" r="3.5" fill="#dc2626" />
            <circle cx="94" cy="52" r="3.5" fill="#dc2626" />
            <circle cx="67" cy="51" r="1" fill="#fff" />
            <circle cx="95" cy="51" r="1" fill="#fff" />
          </>
        ) : (
          <>
            <circle cx="66" cy="52" r="3" fill="#1e293b" />
            <circle cx="94" cy="52" r="3" fill="#1e293b" />
            <circle cx="67" cy="51" r="1" fill="#fff" />
            <circle cx="95" cy="51" r="1" fill="#fff" />
          </>
        )}

        {/* 宽大鼻孔 */}
        <ellipse cx="74" cy="63" rx="3.5" ry="2.5" fill="#201310" />
        <ellipse cx="86" cy="63" rx="3.5" ry="2.5" fill="#201310" />

        {/* 嘴巴与獠牙 */}
        {isAngry ? (
          <g>
            <path
              d="M60 70C60 70 68 84 80 84C92 84 100 70 100 70Z"
              fill="#7f1d1d"
              stroke="#120c0a"
              strokeWidth="2"
            />
            {/* 上尖牙 */}
            <polygon points="66,70 70,70 68,76" fill="#fff" />
            <polygon points="90,70 94,70 92,76" fill="#fff" />
            {/* 舌头 */}
            <ellipse cx="80" cy="80" rx="6" ry="3" fill="#ef4444" />
          </g>
        ) : isChecking ? (
          <ellipse cx="80" cy="72" rx="4" ry="5" fill="#201310" />
        ) : (
          <path d="M68 73C74 76 86 76 92 73" stroke="#201310" strokeWidth="2.5" strokeLinecap="round" />
        )}

        {/* 店长金色徽章 */}
        <circle cx="112" cy="118" r="14" fill="#eab308" stroke="#ca8a04" strokeWidth="2" />
        <polygon points="112,108 115,114 121,114 116,118 118,124 112,120 106,124 108,118 103,114 109,114" fill="#fff" />
      </svg>

      {/* 店长铭牌 */}
      <div
        style={{
          marginTop: -10,
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: isAngry ? '2px solid #ef4444' : '2px solid #eab308',
          borderRadius: 20,
          padding: '4px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
          zIndex: 5,
        }}
      >
        <span style={{ fontSize: 16 }}>🦍</span>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>
          猩猩店长
        </span>
        <span
          style={{
            background: isAngry ? '#ef4444' : '#eab308',
            color: isAngry ? '#fff' : '#713f12',
            fontSize: 11,
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: 10,
          }}
        >
          {isAngry ? '查账暴怒中' : '监工巡视'}
        </span>
      </div>

      {/* 怒气与惩罚条 */}
      {showAngerBar && (
        <div
          style={{
            marginTop: 10,
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: '#fef08a', fontWeight: 700 }}>
            第 {angerLevel} 轮怒气
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
              <div
                key={num}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background:
                    num <= angerLevel
                      ? num >= 5
                        ? '#ef4444'
                        : num >= 3
                          ? '#f59e0b'
                          : '#10b981'
                      : 'rgba(255,255,255,0.15)',
                  boxShadow: num === angerLevel ? '0 0 8px #ef4444' : 'none',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 800 }}>
            +{angerLevel} 罚分
          </span>
        </div>
      )}
    </div>
  );
};
