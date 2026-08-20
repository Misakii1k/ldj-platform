import React, { useCallback, useEffect, useState } from 'react';
import { webAudio } from './WebAudioManager.ts';

export type IdentityCardTheme =
  | 'confidential' // 谁是卧底/以鹅传鹅：机密牛皮纸档案
  | 'gothic'       // 狼人杀：暗夜古堡荆棘月相
  | 'cyber'        // 伪人测试：赛博终端测谎
  | 'prison'       // 暗夜证词：铁窗案卷
  | 'classic';     // 奶酪大盗/情书/通用：古典奢华金纹

export type IdentityCamp = 'good' | 'evil' | 'neutral' | 'human' | 'echo' | 'special';

export interface IdentityFlipCardProps {
  /** 角色名称 / 秘密词条（正面核心大标题） */
  roleName: string;
  /** 角色副标题 / 身份说明（如：神职阵营、卧底词条） */
  roleSubtitle?: string;
  /** 阵营类型，用于高亮边缘光晕与色彩 */
  roleCamp?: IdentityCamp;
  /** 角色头像/立绘 URL（可选） */
  artworkUrl?: string;
  /** 秘密核心词（特供卧底词、伪人触发词等重点突出显示） */
  secretWord?: string;
  /** 详细技能/阵营说明/提示条目 */
  secretHints?: string[] | string;
  /** 卡牌视觉主题，默认 classic */
  theme?: IdentityCardTheme;
  /** 卡背提示印章文案，默认根据主题自适应 */
  badgeLabel?: string;
  /** 是否为观战者 */
  isSpectator?: boolean;
  /** 是否允许交互查看，默认 true */
  canInteract?: boolean;
  /** 是否已确认就绪 */
  confirmed?: boolean;
  /** 点击就绪确认回调 */
  onConfirm?: () => void;
  /** 确认就绪按钮文案 */
  confirmButtonText?: string;
  /** 尺寸变体：standard 标准卡牌 / compact 紧凑条形卡 */
  variant?: 'standard' | 'compact';
  /** 状态变更监听 */
  onRevealChange?: (revealed: boolean) => void;
  /** 外部附加样式类名 */
  className?: string;
  /** 底部附加操作插槽（可选） */
  children?: React.ReactNode;
}

export type IdentityCardAction =
  | { type: 'pointer_down'; canInteract: boolean; isSpectator: boolean }
  | { type: 'pointer_up' }
  | { type: 'pointer_cancel' }
  | { type: 'toggle_lock'; canInteract: boolean; isSpectator: boolean }
  | { type: 'emergency_hide' }; // blur or visibilitychange

export interface IdentityCardState {
  isPressing: boolean;
  isLockedOpen: boolean;
}

export const INITIAL_IDENTITY_CARD_STATE: IdentityCardState = {
  isPressing: false,
  isLockedOpen: false,
};

export function reduceIdentityCardState(
  state: IdentityCardState,
  action: IdentityCardAction
): IdentityCardState {
  switch (action.type) {
    case 'pointer_down':
      if (!action.canInteract || action.isSpectator) return state;
      return { ...state, isPressing: true };
    case 'pointer_up':
    case 'pointer_cancel':
      return { ...state, isPressing: false };
    case 'toggle_lock':
      if (!action.canInteract || action.isSpectator) return state;
      return { ...state, isLockedOpen: !state.isLockedOpen };
    case 'emergency_hide':
      return { isPressing: false, isLockedOpen: false };
    default:
      return state;
  }
}

export function computeIsRevealed(state: IdentityCardState, isSpectator: boolean): boolean {
  return (state.isPressing || state.isLockedOpen) && !isSpectator;
}

const DEFAULT_THEME_BADGES: Record<IdentityCardTheme, string> = {
  confidential: '机密档案 · 阅后即焚',
  gothic: '暗夜降临 · 封印血契',
  cyber: 'ECHO 终端 · 测谎协议',
  prison: '囚徒案卷 · 密存口供',
  classic: '命运之牌 · 密函亲启',
};

export function IdentityFlipCard({
  roleName,
  roleSubtitle,
  roleCamp = 'neutral',
  artworkUrl,
  secretWord,
  secretHints,
  theme = 'classic',
  badgeLabel,
  isSpectator = false,
  canInteract = true,
  confirmed = false,
  onConfirm,
  confirmButtonText = '我已记下，确认就绪',
  variant = 'standard',
  onRevealChange,
  className = '',
  children,
}: IdentityFlipCardProps) {
  const [isPressing, setIsPressing] = useState(false);
  const [isLockedOpen, setIsLockedOpen] = useState(false);

  const isRevealed = (isPressing || isLockedOpen) && !isSpectator;

  // 触发振动与音效反馈
  const triggerFeedback = useCallback(() => {
    webAudio.playCardFlip();
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
    } catch {
      // Ignore vibration error on unsupported platforms
    }
  }, []);

  // 状态变化通知外部
  useEffect(() => {
    onRevealChange?.(isRevealed);
  }, [isRevealed, onRevealChange]);

  // 环境级安全防窥：切换后台或失焦时，100% 立即扣回并解锁
  useEffect(() => {
    const hideAndLock = () => {
      setIsPressing(false);
      setIsLockedOpen(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hideAndLock();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', hideAndLock);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', hideAndLock);
    };
  }, []);

  const [tilt, setTilt] = useState<{ x: number; y: number; glareX: number; glareY: number } | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!canInteract || isSpectator) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    setTilt({ x: rotateX, y: rotateY, glareX, glareY });
  }, [canInteract, isSpectator]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!canInteract || isSpectator) return;
    // 忽略小锁按钮本身的 pointer 事件穿透
    if ((e.target as HTMLElement).closest('.identity-card-lock-btn')) return;
    e.preventDefault();
    setIsPressing(true);
    triggerFeedback();
  }, [canInteract, isSpectator, triggerFeedback]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPressing) {
      e.preventDefault();
      setIsPressing(false);
    }
  }, [isPressing]);

  const handlePointerCancel = useCallback(() => {
    setTilt(null);
    if (isPressing) {
      setIsPressing(false);
    }
  }, [isPressing]);

  const handleToggleLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canInteract || isSpectator) return;
    setIsLockedOpen((prev) => {
      const next = !prev;
      triggerFeedback();
      return next;
    });
  }, [canInteract, isSpectator, triggerFeedback]);

  const displayBadge = badgeLabel || DEFAULT_THEME_BADGES[theme];
  const hintsArray = Array.isArray(secretHints)
    ? secretHints
    : secretHints
      ? [secretHints]
      : [];

  const isCompact = variant === 'compact';

  return (
    <div
      className={`identity-flip-container theme-${theme} camp-${roleCamp} ${
        isCompact ? 'identity-flip-container--compact' : ''
      } ${className}`}
      style={{
        '--tilt-x': `${tilt ? tilt.x.toFixed(1) : 0}deg`,
        '--tilt-y': `${tilt ? tilt.y.toFixed(1) : 0}deg`,
        '--glare-x': `${tilt ? tilt.glareX.toFixed(1) : 50}%`,
        '--glare-y': `${tilt ? tilt.glareY.toFixed(1) : 50}%`,
      } as React.CSSProperties}
    >
      {/* 3D 翻牌主舞台 */}
      <div
        className={`identity-flip-card ${isRevealed ? 'is-revealed' : ''} ${
          isLockedOpen ? 'is-locked' : ''
        }`}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        role="button"
        tabIndex={canInteract && !isSpectator ? 0 : -1}
        aria-label={isRevealed ? `当前身份：${roleName}` : '按住查看私密身份'}
      >
        <div className="identity-card-inner">
          {/* ════════ 卡牌背面（遮蔽态 · 拟真封印） ════════ */}
          <div className="identity-card-back">
            <div className="identity-card-back__texture" />
            <div className="identity-card-holo-foil" />
            <div className="identity-card-back__border">
              <div className="identity-card-back__seal">
                <span className="identity-card-back__emblem" aria-hidden="true" />
                <strong className="identity-card-back__badge">{displayBadge}</strong>
              </div>

              <div className="identity-card-back__action-tip">
                {isSpectator ? (
                  <span className="tip-spectator">👁️ 观战视角（仅玩家本人可见）</span>
                ) : canInteract ? (
                  <span className="tip-press">
                    <span className="tip-finger">👆</span> 按住卡牌悄悄查看
                  </span>
                ) : (
                  <span className="tip-disabled">🔒 身份已锁定</span>
                )}
              </div>
            </div>
          </div>

          {/* ════════ 卡牌正面（揭示态 · 3D 核心身份） ════════ */}
          <div className="identity-card-front">
            <div className="identity-card-front__aura" />
            <div className="identity-card-holo-foil" />
            
            {/* 右上角常驻锁止按钮 */}
            {canInteract && !isSpectator && (
              <button
                type="button"
                className={`identity-card-lock-btn ${isLockedOpen ? 'is-locked' : ''}`}
                onClick={handleToggleLock}
                title={isLockedOpen ? '解锁（恢复松手自动防窥）' : '锁定常驻显示（便于查看）'}
                aria-label={isLockedOpen ? '已锁定常驻，点击解除' : '点击锁定常驻显示'}
              >
                {isLockedOpen ? '🔓 已常驻' : '🔒 锁常驻'}
              </button>
            )}

            <div className="identity-card-front__header">
              {roleSubtitle && (
                <span className="identity-card-front__camp-tag">{roleSubtitle}</span>
              )}
              <span className="identity-card-front__theme-icon" />
            </div>

            <div className="identity-card-front__content">
              {artworkUrl && (
                <div className="identity-card-front__artwork-wrap">
                  <img
                    src={artworkUrl}
                    alt={roleName}
                    className="identity-card-front__artwork"
                    loading="lazy"
                  />
                </div>
              )}

              <h3 className="identity-card-front__role-name">{roleName}</h3>

              {secretWord && (
                <div className="identity-card-front__secret-word-box">
                  <span className="secret-label">秘密词条</span>
                  <strong className="secret-word">{secretWord}</strong>
                </div>
              )}

              {hintsArray.length > 0 && (
                <div className="identity-card-front__hints">
                  {hintsArray.map((hint, idx) => (
                    <p key={idx} className="identity-hint-text">
                      {hint}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="identity-card-front__footer">
              <span className="identity-card-front__safe-hint">
                {isLockedOpen ? '👀 离开页面将自动遮挡' : '👀 松手瞬间自动遮扣防窥'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部确认操作坞（当提供 onConfirm 时渲染） */}
      {onConfirm && !isSpectator && (
        <div className="identity-card-action-bar">
          <button
            type="button"
            className="identity-confirm-btn"
            onClick={onConfirm}
            disabled={confirmed}
          >
            {confirmed ? '✓ 已确认，等待全员就绪' : confirmButtonText}
          </button>
        </div>
      )}

      {children && <div className="identity-card-extra-dock">{children}</div>}
    </div>
  );
}
