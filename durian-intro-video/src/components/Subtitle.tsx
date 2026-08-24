import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BORDER, FONT, RADIUS, SHADOW } from '../lib/theme';

interface SubtitleProps {
  /** 字幕文本 */
  text: string;
  /** 淡入帧数（默认 8） */
  fadeIn?: number;
  /** 淡出帧数（默认 8） */
  fadeOut?: number;
}

/**
 * 底部字幕组件
 * 实体桌游风格：粗描边 + 3D 挤出投影 + 半透明深色毛玻璃背景
 */
export const Subtitle: React.FC<SubtitleProps> = ({
  text,
  fadeIn = 8,
  fadeOut = 8,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const slideY = interpolate(
    frame,
    [0, fadeIn],
    [12, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: `translateX(-50%) translateY(${slideY}px)`,
        opacity,
        zIndex: 100,
        /* 毛玻璃容器 */
        background: 'rgba(10, 23, 13, 0.88)',
        backdropFilter: 'blur(14px)',
        border: BORDER.thin,
        borderRadius: RADIUS.md,
        boxShadow: SHADOW.sm,
        /* 内边距 */
        padding: '14px 40px',
        maxWidth: '80%',
        /* 文字 */
        fontFamily: FONT.family,
        fontSize: 28,
        fontWeight: FONT.bold,
        color: '#fef9c3',
        textAlign: 'center' as const,
        letterSpacing: 1.5,
        lineHeight: 1.5,
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        whiteSpace: 'pre-line' as const,
      }}
    >
      {text}
    </div>
  );
};
