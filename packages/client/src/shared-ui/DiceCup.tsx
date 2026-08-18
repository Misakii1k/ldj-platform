import React, { useCallback, useEffect, useState } from 'react';
import { webAudio } from './WebAudioManager.ts';

export type DiceCupTheme = 'wood' | 'felt' | 'metal';

export interface DiceCupProps {
  /** 骰子点数数组（支持 1~6 粒骰子），例如 [5] 或 [1, 4, 6]；为 null 或未知点数时渲染 '?' */
  diceValues?: number[] | number | null;
  /** 所属玩家名称（用于展示所有者标识） */
  playerName?: string;
  /** 是否属于本人（默认 false） */
  isMe?: boolean;
  /** 是否允许交互（长按揭开/偷看，默认 true） */
  canInteract?: boolean;
  /** 底部提示文案覆盖 */
  hint?: string;
  /** 查验目标玩家名（例如：查验 张三 的骰盅） */
  peekTargetName?: string;
  /** 掀开查看完成（松手扣盖）后的业务提交回调 */
  onInspectCommit?: () => void;
  /** 点击摇骰完成回调 */
  onShakeCommit?: () => void;
  /** 骰盅材质主题：wood 经典木质 / felt 绒布皮革 / metal 暗黑金属，默认 wood */
  theme?: DiceCupTheme;
  /** 尺寸变体：large 标准大号 / compact 紧凑网格小号，默认 large */
  variant?: 'large' | 'compact';
  /** 是否允许点击摇晃掷骰动效，默认 true */
  allowShake?: boolean;
  /** 附加样式类 */
  className?: string;
}

export type DiceCupAction =
  | { type: 'lift_down'; canInteract: boolean }
  | { type: 'lift_up' }
  | { type: 'lift_cancel' }
  | { type: 'emergency_hide' }
  | { type: 'shake_start'; canInteract: boolean; allowShake: boolean }
  | { type: 'shake_end' };

export interface DiceCupState {
  isLifted: boolean;
  isShaking: boolean;
}

export const INITIAL_DICE_CUP_STATE: DiceCupState = {
  isLifted: false,
  isShaking: false,
};

export function normalizeDiceValues(diceValues?: number[] | number | null): number[] {
  if (Array.isArray(diceValues)) {
    return diceValues.filter((v) => typeof v === 'number' && v >= 1 && v <= 6);
  }
  if (typeof diceValues === 'number' && diceValues >= 1 && diceValues <= 6) {
    return [diceValues];
  }
  return [];
}

export function reduceDiceCupState(
  state: DiceCupState,
  action: DiceCupAction
): DiceCupState {
  switch (action.type) {
    case 'lift_down':
      if (!action.canInteract) return state;
      return { ...state, isLifted: true };
    case 'lift_up':
    case 'lift_cancel':
    case 'emergency_hide':
      return { ...state, isLifted: false };
    case 'shake_start':
      if (!action.canInteract || !action.allowShake || state.isShaking) return state;
      return { ...state, isShaking: true };
    case 'shake_end':
      return { ...state, isShaking: false };
    default:
      return state;
  }
}

export function DiceCup({
  diceValues = null,
  playerName,
  isMe = false,
  canInteract = true,
  hint,
  peekTargetName,
  onInspectCommit,
  onShakeCommit,
  theme = 'wood',
  variant = 'large',
  allowShake = false,
  className = '',
}: DiceCupProps) {
  const [isLifted, setIsLifted] = useState(false);
  const [isLockedOpen, setIsLockedOpen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // 归一化点数数组
  const normalizedValues = normalizeDiceValues(diceValues);

  // 环境级安全防窥：切换后台或失焦时自动扣盖
  useEffect(() => {
    const hide = () => {
      if (isLifted || isLockedOpen) {
        setIsLifted(false);
        setIsLockedOpen(false);
        onInspectCommit?.();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', hide);
    };
  }, [isLifted, isLockedOpen, onInspectCommit]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canInteract) return;
      if (isLockedOpen) return; // 已锁定时点击交给 click
      setIsLifted(true);
      webAudio.playDiceReveal();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {
        // Ignore vibration error
      }
    },
    [canInteract, isLockedOpen]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isLockedOpen) return;
      if (!isLifted) return;
      setIsLifted(false);
      onInspectCommit?.();
    },
    [isLifted, isLockedOpen, onInspectCommit]
  );

  const handlePointerCancel = useCallback(() => {
    if (isLockedOpen) return;
    if (isLifted) {
      setIsLifted(false);
      onInspectCommit?.();
    }
  }, [isLifted, isLockedOpen, onInspectCommit]);

  const toggleLockOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canInteract) return;
      setIsLockedOpen((prev) => {
        const next = !prev;
        if (next) {
          webAudio.playDiceReveal();
        } else {
          onInspectCommit?.();
        }
        return next;
      });
    },
    [canInteract, onInspectCommit]
  );

  const handleShakeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canInteract || !allowShake || isShaking) return;
      setIsShaking(true);
      webAudio.playDiceShake();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([15, 30, 20]);
        }
      } catch {
        // Ignore vibration error
      }
      setTimeout(() => {
        setIsShaking(false);
        onShakeCommit?.();
      }, 500);
    },
    [allowShake, canInteract, isShaking, onShakeCommit]
  );

  const currentlyOpen = isLifted || isLockedOpen;

  // 渲染单个骰子的点数（国标中式红 1、红 4 点）
  const renderDiceDots = (value: number) => {
    const dots: Array<{ x: number; y: number; isRed?: boolean }> = [];
    if (value === 1) {
      dots.push({ x: 50, y: 50, isRed: true });
    } else if (value === 2) {
      dots.push({ x: 30, y: 30 }, { x: 70, y: 70 });
    } else if (value === 3) {
      dots.push({ x: 30, y: 30 }, { x: 50, y: 50 }, { x: 70, y: 70 });
    } else if (value === 4) {
      dots.push(
        { x: 30, y: 30, isRed: true },
        { x: 70, y: 30, isRed: true },
        { x: 30, y: 70, isRed: true },
        { x: 70, y: 70, isRed: true }
      );
    } else if (value === 5) {
      dots.push(
        { x: 30, y: 30 },
        { x: 70, y: 30 },
        { x: 50, y: 50, isRed: true },
        { x: 30, y: 70 },
        { x: 70, y: 70 }
      );
    } else if (value === 6) {
      dots.push(
        { x: 30, y: 25 },
        { x: 30, y: 50 },
        { x: 30, y: 75 },
        { x: 70, y: 25 },
        { x: 70, y: 50 },
        { x: 70, y: 75 }
      );
    }

    return dots.map((dot, index) => (
      <span
        key={index}
        className={`shared-die-dot ${dot.isRed ? 'shared-die-dot--red' : ''}`}
        style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      />
    ));
  };

  const isCompact = variant === 'compact';
  const hasValidDice =
    normalizedValues.length > 0 &&
    normalizedValues.every((v) => typeof v === 'number' && v >= 1 && v <= 6);

  return (
    <div
      className={`shared-dice-cup-wrapper theme-${theme} ${
        isCompact ? 'shared-dice-cup-wrapper--compact' : ''
      } ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      role="button"
      tabIndex={canInteract ? 0 : -1}
      aria-label={
        playerName
          ? `${playerName} 的 3D 骰盅`
          : peekTargetName
            ? `查验 ${peekTargetName} 的骰盅`
            : '3D 骰盅'
      }
    >
      <div className={`shared-dice-cup-scene ${isShaking ? 'is-shaking' : ''}`}>
        {/* 底部绒布/木质托盘底座 */}
        <div className="shared-cup-base">
          <div className="shared-cup-mat">
            {hasValidDice ? (
              <div
                className={`shared-dice-cluster count-${Math.min(normalizedValues.length, 6)} ${
                  isLifted ? 'is-visible' : ''
                }`}
              >
                {normalizedValues.map((val, idx) => (
                  <div key={idx} className="shared-die-3d">
                    <div className="shared-die-face">{renderDiceDots(val)}</div>
                  </div>
                ))}
                {normalizedValues.length === 1 && (
                  <div className="shared-die-number-badge">{normalizedValues[0]} 点</div>
                )}
              </div>
            ) : (
              <div className="shared-die-unknown">
                <span>?</span>
              </div>
            )}
          </div>
        </div>

        {/* 3D 骰盅罩体与长按掀起动效 */}
        <div className={`shared-cup-dome ${isLifted ? 'is-lifted' : ''}`}>
          <div className="shared-cup-dome__top">
            <span className="shared-cup-dome__knob" />
          </div>
          <div className="shared-cup-dome__body">
            <span className="shared-cup-dome__icon" aria-hidden="true">
              🎲
            </span>
            <span className="shared-cup-dome__label">
              {peekTargetName
                ? `查验 ${peekTargetName}`
                : isMe
                  ? '我的骰盅'
                  : playerName || '骰盅'}
            </span>
          </div>
          <div className="shared-cup-dome__rim" />
        </div>
      </div>

      {/* 底部提示与辅助操作 */}
      <div className="shared-cup-info">
        {playerName && !peekTargetName && (
          <div className="shared-cup-owner">{playerName}</div>
        )}
        <div className="shared-cup-hint">
          {canInteract ? (
            isLifted ? (
              <span className="hint-lifted">👀 松开手指自动扣盖防窥</span>
            ) : (
              <span className="hint-press">👆 按住掀开骰盅查看</span>
            )
          ) : (
            <span className="hint-disabled">{hint || '骰盅已扣紧'}</span>
          )}
        </div>
        {allowShake && canInteract && !isLifted && (
          <button
            type="button"
            className="shared-cup-shake-btn"
            onClick={handleShakeClick}
            disabled={isShaking}
          >
            {isShaking ? '🎲 摇骰中…' : '🎲 摇晃骰盅'}
          </button>
        )}
      </div>
    </div>
  );
}
