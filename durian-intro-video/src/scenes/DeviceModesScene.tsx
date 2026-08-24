import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { BG, BORDER, SHADOW, RADIUS, COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const DeviceModesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 14 } });
  const card1Enter = spring({ frame: frame - 15, fps, config: { damping: 14 } });
  const card2Enter = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  const card3Enter = spring({ frame: frame - 45, fps, config: { damping: 14 } });

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);

  return (
    <JungleBackground>
      <AbsoluteFill style={{ padding: '50px 80px', boxSizing: 'border-box', opacity, fontFamily: FONT.family }}>
        {/* 标题 */}
        <div
          style={{
            textAlign: 'center',
            transform: `translateY(${interpolate(titleEnter, [0, 1], [-40, 0])}px)`,
            opacity: titleEnter,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              ...pillTag(),
              display: 'inline-block',
              marginBottom: 10,
              background: '#fff',
              color: '#10b981',
            }}
          >
            MODES 多端适配
          </div>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: '#fff',
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            实体模拟器与数字联机 · <span style={{ color: '#facc15' }}>随时随地无缝开局</span>
          </h2>
        </div>

        {/* 三大模式卡片 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 30,
            marginTop: 50,
          }}
        >
          {/* 模式 1: 玩家手牌端 */}
          <div
            style={{
              ...cardPanel(),
              background: BG.paper,
              borderColor: '#38bdf8',
              padding: '30px 24px',
              textAlign: 'center',
              transform: `translateY(${interpolate(card1Enter, [0, 1], [40, 0])}px) scale(${card1Enter})`,
              opacity: card1Enter,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 14 }}>📱</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0ea5e9', marginBottom: 10 }}>
              玩家手牌端
            </div>
            <div style={{ fontSize: 15, color: '#333', lineHeight: 1.6, fontWeight: 700 }}>
              手机立于面前朝向他人，完美模拟实体木质暗牌支架。自己盲牌、他人明牌，沉浸感十足！
            </div>
          </div>

          {/* 模式 2: 桌面中央端 */}
          <div
            style={{
              ...cardPanel(),
              background: BG.paper,
              borderColor: '#facc15',
              padding: '30px 24px',
              textAlign: 'center',
              transform: `translateY(${interpolate(card2Enter, [0, 1], [40, 0])}px) scale(${card2Enter})`,
              opacity: card2Enter,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 14 }}>🖥️</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#ca8a04', marginBottom: 10 }}>
              桌面中央端
            </div>
            <div style={{ fontSize: 15, color: '#333', lineHeight: 1.6, fontWeight: 700 }}>
              平板或电视平放于桌中，充当出牌轨道、实时采购统计看板与实体质感抢单按铃器！
            </div>
          </div>

          {/* 模式 3: 全局数字联机 */}
          <div
            style={{
              ...cardPanel(),
              background: BG.paper,
              borderColor: '#a855f7',
              padding: '30px 24px',
              textAlign: 'center',
              transform: `translateY(${interpolate(card3Enter, [0, 1], [40, 0])}px) scale(${card3Enter})`,
              opacity: card3Enter,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 14 }}>🌐</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#9333ea', marginBottom: 10 }}>
              多端扫码开房
            </div>
            <div style={{ fontSize: 15, color: '#333', lineHeight: 1.6, fontWeight: 700 }}>
              无需复杂准备，扫码秒进房间。支持跨平台、移动端与桌面端实时同步对战！
            </div>
          </div>
        </div>

        {/* 底部号召 */}
        <div style={{ textAlign: 'center', marginTop: 45 }}>
          <div
            style={{
              ...glassPanel(),
              display: 'inline-block',
              fontSize: 18,
              fontWeight: 800,
              color: '#fef08a',
              padding: '12px 30px',
            }}
          >
            聚会面对面立机开玩，或是远程跨屏联机，体验极致盲牌博弈！
          </div>
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
