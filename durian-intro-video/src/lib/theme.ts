/**
 * 《榴莲店长》视频设计 Token
 * 对齐游戏客户端 UI 风格：实体桌游风 (Physical Neo-Brutalist Boardgame)
 */

/* ─── 背景 ────────────────────────────────────── */
export const BG = {
  /** 桌面毛毡径向渐变 */
  tabletop: 'radial-gradient(circle at 50% 40%, #1b3821 0%, #0f2517 50%, #0a170d 100%)',
  /** 卡牌纸张底色 */
  paper: '#fffbf0',
  /** 提示/高亮底色 */
  hint: '#fff4df',
  /** 深色毛玻璃面板 */
  glassPanel: 'rgba(10, 23, 13, 0.88)',
  /** 结算遮罩 */
  verdictOverlay: 'rgba(15, 23, 42, 0.88)',
} as const;

/* ─── 粗描边 & 3D 挤出投影 ───────────────────── */
export const BORDER = {
  /** 标志性墨黑粗描边色 */
  color: '#2d261e',
  /** 小卡片/按钮描边 */
  thin: '2.5px solid #2d261e',
  /** 标准面板描边 */
  medium: '3px solid #2d261e',
  /** 大面板/英雄级描边 */
  thick: '3.5px solid #2d261e',
  /** 虚线分割 */
  dashed: '2.5px dashed rgba(45, 38, 30, 0.25)',
} as const;

export const SHADOW = {
  /** 小元素挤出阴影 */
  sm: '0 3px 0 #2d261e',
  /** 标准面板挤出阴影 */
  md: '0 4px 0 #2d261e',
  /** 大面板挤出阴影 + 漫射 */
  lg: '0 6px 0 #2d261e, 0 12px 36px rgba(0, 0, 0, 0.45)',
  /** 发光铃铛金属质感 */
  bell: '0 3px 0 #2d261e, 0 0 12px rgba(245, 158, 11, 0.4)',
} as const;

export const RADIUS = {
  /** 按钮/小卡片 */
  sm: 10,
  /** 标准卡片 */
  md: 14,
  /** 大面板/模态框 */
  lg: 18,
  /** 胶囊 */
  pill: 999,
} as const;

/* ─── 配色 ────────────────────────────────────── */
export const COLOR = {
  /** 主标题金黄 */
  gold: '#facc15',
  /** 浅金 */
  goldLight: '#fef9c3',
  /** 暖奶黄 */
  cream: '#fef9c3',
  /** 薄荷绿文字 */
  mint: '#86efac',
  /** 翠绿成功 */
  success: '#22c55e',
  /** 红色警报 */
  danger: '#ef4444',
  /** 橙色警告 */
  warning: '#f59e0b',
  /** 白色 */
  white: '#ffffff',
  /** 浅灰文字 */
  muted: '#94a3b8',
  /** 深色文字 */
  dark: '#1e293b',
} as const;

/** 水果专属配色 */
export const FRUIT_COLORS = {
  durian: { bg: '#fef9c3', text: '#713f12', accent: '#a3e635', glow: 'rgba(163, 230, 53, 0.3)' },
  strawberry: { bg: '#ffe4e6', text: '#881337', accent: '#f87171', glow: 'rgba(248, 113, 113, 0.3)' },
  banana: { bg: '#fefce8', text: '#78350f', accent: '#fde047', glow: 'rgba(253, 224, 71, 0.3)' },
  grape: { bg: '#f3e8ff', text: '#581c87', accent: '#c084fc', glow: 'rgba(192, 132, 252, 0.3)' },
  apple: { bg: '#fee2e2', text: '#7f1d1d', accent: '#f43f5e', glow: 'rgba(244, 63, 94, 0.3)' },
  monkey: { bg: '#fed7aa', text: '#7c2d12', accent: '#fb923c', glow: 'rgba(251, 146, 60, 0.3)' },
} as const;

/* ─── 字体 ────────────────────────────────────── */
export const FONT = {
  family: "'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Segoe UI', sans-serif",
  /** 超粗标题 */
  heavy: 900,
  /** 粗体正文 */
  bold: 800,
  /** 中等 */
  medium: 700,
  /** 正文 */
  regular: 600,
} as const;

/* ─── 常用复合样式工具 ─────────────────────────── */

/** 实体卡片面板 (带粗描边 + 3D 挤出投影) */
export const cardPanel = (opts?: {
  bg?: string;
  radius?: number;
  shadow?: string;
  border?: string;
}): React.CSSProperties => ({
  background: opts?.bg ?? BG.paper,
  border: opts?.border ?? BORDER.medium,
  borderRadius: opts?.radius ?? RADIUS.md,
  boxShadow: opts?.shadow ?? SHADOW.md,
});

/** 深色毛玻璃面板 */
export const glassPanel = (opts?: {
  bg?: string;
  radius?: number;
  border?: string;
}): React.CSSProperties => ({
  background: opts?.bg ?? BG.glassPanel,
  backdropFilter: 'blur(12px)',
  border: opts?.border ?? BORDER.medium,
  borderRadius: opts?.radius ?? RADIUS.lg,
  boxShadow: SHADOW.md,
});

/** 胶囊标签按钮 */
export const pillTag = (opts?: {
  bg?: string;
  borderColor?: string;
}): React.CSSProperties => ({
  padding: '10px 24px',
  background: opts?.bg ?? BG.paper,
  border: `2.5px solid ${opts?.borderColor ?? BORDER.color}`,
  borderRadius: RADIUS.pill,
  boxShadow: SHADOW.sm,
  fontFamily: FONT.family,
  fontWeight: FONT.bold,
  fontSize: 18,
});

import type React from 'react';
