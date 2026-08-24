import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { FruitIcon } from '../components/FruitGraphic';
import { GorillaManager } from '../components/GorillaManager';
import { BG, BORDER, SHADOW, RADIUS, COLOR, FONT, cardPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

/* ── SVG 叶片组件 ── */
const Leaf: React.FC<{
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  flip?: boolean;
}> = ({ x, y, size, rotation, opacity, flip }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `rotate(${rotation}deg)${flip ? ' scaleX(-1)' : ''}`,
      opacity,
    }}
  >
    <defs>
      <linearGradient id={`leafGrad-${x}-${y}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2d6b3f" />
        <stop offset="100%" stopColor="#1a4a2e" />
      </linearGradient>
    </defs>
    <path
      d="M50 5 C25 20, 5 45, 10 75 C15 90, 30 95, 50 90 C70 95, 85 90, 90 75 C95 45, 75 20, 50 5Z"
      fill={`url(#leafGrad-${x}-${y})`}
    />
    <path
      d="M50 15 C50 15, 50 85, 50 85"
      stroke="#3d8b55"
      strokeWidth="2"
      fill="none"
      opacity="0.6"
    />
    <path
      d="M50 30 C40 35, 25 50, 20 60"
      stroke="#3d8b55"
      strokeWidth="1.5"
      fill="none"
      opacity="0.4"
    />
    <path
      d="M50 45 C60 50, 75 60, 80 70"
      stroke="#3d8b55"
      strokeWidth="1.5"
      fill="none"
      opacity="0.4"
    />
  </svg>
);

/* ── 小圆形光斑粒子 ── */
const GlowOrb: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  frame: number;
}> = ({ x, y, size, color, delay, frame }) => {
  const float = Math.sin((frame + delay) * 0.03) * 15;
  const pulse = interpolate(Math.sin((frame + delay) * 0.05), [-1, 1], [0.3, 0.7]);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        opacity: pulse,
        transform: `translateY(${float}px)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * 升级版丛林背景组件
 * 用矢量 SVG 叶片取代 Emoji，增加光斑粒子和纹理
 */
export const JungleBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const leafWave = Math.sin(frame * 0.04) * 5;

  return (
    <AbsoluteFill
      style={{
        background: BG.tabletop,
        fontFamily: FONT.family,
        overflow: 'hidden',
        color: '#fff',
      }}
    >
      {/* SVG 叶片装饰 */}
      <Leaf x={-20} y={-20} size={160} rotation={-15 + leafWave} opacity={0.18} />
      <Leaf x={-10} y={680} size={140} rotation={10 + leafWave} opacity={0.15} />
      <Leaf x={1780} y={-10} size={150} rotation={25 - leafWave} opacity={0.14} flip />
      <Leaf x={1750} y={700} size={130} rotation={-20 - leafWave} opacity={0.16} flip />
      <Leaf x={880} y={-30} size={100} rotation={5 + leafWave * 0.5} opacity={0.08} />
      <Leaf x={400} y={950} size={110} rotation={-10 - leafWave * 0.5} opacity={0.1} />

      {/* 浮动光斑粒子 */}
      <GlowOrb x={200} y={150} size={120} color="rgba(163,230,53,0.15)" delay={0} frame={frame} />
      <GlowOrb x={1500} y={200} size={100} color="rgba(250,204,21,0.12)" delay={50} frame={frame} />
      <GlowOrb x={900} y={800} size={140} color="rgba(134,239,172,0.10)" delay={100} frame={frame} />
      <GlowOrb x={300} y={600} size={80} color="rgba(250,204,21,0.08)" delay={150} frame={frame} />
      <GlowOrb x={1600} y={700} size={90} color="rgba(163,230,53,0.10)" delay={200} frame={frame} />

      {/* 中央柔和环境光 */}
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          top: '25%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(234,179,8,0.10) 0%, rgba(0,0,0,0) 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* 微妙纹理覆盖层 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-conic-gradient(rgba(255,255,255,0.008) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px',
          pointerEvents: 'none',
        }}
      />

      {children}
    </AbsoluteFill>
  );
};

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);
  const titleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 90 } });
  const gorillaSpring = spring({ frame: frame - 20, fps, config: { damping: 14 } });
  const subtitleOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' });
  const tagsEnter = spring({ frame: frame - 40, fps, config: { damping: 15 } });

  const durianFloat = Math.sin(frame * 0.08) * 12;
  const glowPulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.6, 1]);

  return (
    <JungleBackground>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
        }}
      >
        {/* 左侧店长探头 */}
        <div
          style={{
            position: 'absolute',
            left: 120,
            top: '48%',
            transform: `translateY(-50%) scale(${gorillaSpring}) rotate(-8deg)`,
            opacity: gorillaSpring,
          }}
        >
          <GorillaManager mood="calm" angerLevel={1} size={170} showAngerBar={false} />
        </div>

        {/* 右侧悬浮水果装饰 */}
        <div
          style={{
            position: 'absolute',
            right: 140,
            top: '50%',
            transform: `translateY(-50%) scale(${gorillaSpring})`,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            opacity: gorillaSpring,
          }}
        >
          <div style={{ transform: `translateY(${durianFloat}px)` }}>
            <FruitIcon fruit="strawberry" size={70} />
          </div>
          <div style={{ transform: `translateY(${-durianFloat}px) rotate(15deg)` }}>
            <FruitIcon fruit="banana" size={64} />
          </div>
          <div style={{ transform: `translateY(${durianFloat * 0.8}px)` }}>
            <FruitIcon fruit="grape" size={60} />
          </div>
        </div>

        {/* 中央发光大榴莲 */}
        <div
          style={{
            transform: `translateY(${durianFloat}px) scale(${titleSpring})`,
            filter: `drop-shadow(0 0 50px rgba(234,179,8,${0.6 * glowPulse}))`,
            marginBottom: 30,
          }}
        >
          <FruitIcon fruit="durian" size={140} />
        </div>

        {/* 主标题 — 实体卡片风格 */}
        <div
          style={{
            ...cardPanel({
              bg: 'rgba(10, 23, 13, 0.75)',
              radius: RADIUS.lg,
              shadow: SHADOW.lg,
              border: '3.5px solid #2d261e',
            }),
            padding: '24px 64px',
            transform: `scale(${titleSpring})`,
            backdropFilter: 'blur(10px)',
          }}
        >
          <h1
            style={{
              fontSize: 92,
              fontWeight: FONT.heavy,
              color: COLOR.gold,
              margin: 0,
              letterSpacing: 12,
              textShadow: '0 4px 24px rgba(250,204,21,0.5), 0 2px 6px rgba(0,0,0,0.8)',
              fontFamily: FONT.family,
            }}
          >
            榴莲店长
          </h1>
        </div>

        {/* 英文副标与说明 */}
        <div
          style={{
            fontSize: 26,
            fontWeight: FONT.medium,
            color: COLOR.mint,
            marginTop: 16,
            letterSpacing: 4,
            opacity: subtitleOpacity,
            textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            fontFamily: FONT.family,
          }}
        >
          DURIAN · 丛林水果店的暗牌心理博弈
        </div>

        {/* 标签列表 — 实体按钮风格 */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 40,
            transform: `scale(${tagsEnter}) translateY(${interpolate(tagsEnter, [0, 1], [30, 0])}px)`,
            opacity: tagsEnter,
          }}
        >
          {[
            { icon: '👥', text: '2-7 人同乐' },
            { icon: '❓', text: '头顶暗牌' },
            { icon: '⚖️', text: '二选一采购' },
            { icon: '🔔', text: '按铃查账' },
          ].map((tag) => (
            <div
              key={tag.text}
              style={{
                ...pillTag({ bg: BG.paper, borderColor: BORDER.color }),
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#422006',
              }}
            >
              <span style={{ fontSize: 20 }}>{tag.icon}</span>
              <span>{tag.text}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
