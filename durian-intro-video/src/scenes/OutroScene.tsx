import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { FruitIcon } from '../components/FruitGraphic';
import { GorillaManager } from '../components/GorillaManager';
import { BG, BORDER, SHADOW, RADIUS, COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const contentFade = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });
  const floatAnim = Math.sin(frame * 0.08) * 8;
  const opacity = fadeInOut(frame, durationInFrames, 15, 15);

  return (
    <JungleBackground>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          fontFamily: FONT.family,
        }}
      >
        {/* 顶部店长与水果 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 30,
            transform: `translateY(${floatAnim}px) scale(${titleSpring})`,
            marginBottom: 20,
          }}
        >
          <FruitIcon fruit="durian" size={90} />
          <GorillaManager mood="calm" angerLevel={1} size={150} showAngerBar={false} />
          <FruitIcon fruit="strawberry" size={80} />
        </div>

        {/* 主标语包裹在大卡片中 */}
        <div
          style={{
            ...cardPanel(),
            background: BG.paper,
            borderColor: '#facc15',
            padding: '40px 60px',
            transform: `scale(${titleSpring})`,
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          <h1
            style={{
              fontSize: 76,
              fontWeight: 900,
              color: '#ca8a04',
              margin: 0,
              letterSpacing: 4,
              textShadow: '0 4px 0 #2d261e',
            }}
          >
            快来开一局《榴莲店长》吧！
          </h1>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#333',
              marginTop: 16,
              letterSpacing: 3,
            }}
          >
            看似风平浪静的采购清单，随时可能引爆猩猩店长的怒火！
          </div>
        </div>

        {/* 4 维特性标签 */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 40,
            opacity: contentFade,
          }}
        >
          {[
            { icon: '👥', label: '2-7 人聚会' },
            { icon: '⏱️', label: '约 15-20 分钟' },
            { icon: '🧠', label: '心理盲区博弈' },
            { icon: '🔔', label: '拍铃查账刺激对决' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                ...pillTag(),
                ...cardPanel(),
                borderRadius: 999,
                padding: '12px 24px',
                background: BG.paper,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 18,
                fontWeight: 800,
                color: '#333',
              }}
            >
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* 平台尾标 */}
        <div
          style={{
            ...cardPanel(),
            marginTop: 50,
            padding: '12px 32px',
            background: BG.paper,
            fontSize: 18,
            color: '#333',
            fontWeight: 700,
            letterSpacing: 2,
            opacity: contentFade,
          }}
        >
          聚乐桌桌游平台 · Durian 榴莲店长
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
