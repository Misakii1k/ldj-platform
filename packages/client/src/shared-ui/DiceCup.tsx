import React, { useCallback, useEffect, useState } from 'react';
import { webAudio } from './WebAudioManager.ts';
import { ThreeDiceCupCanvas } from './ThreeDiceCupCanvas.tsx';

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
  const [isShaking, setIsShaking] = useState(false);

  // 归一化点数数组
  const normalizedValues = normalizeDiceValues(diceValues);

  // 环境级安全防窥：切换后台或失焦时自动扣盖
  useEffect(() => {
    const hide = () => {
      if (isLifted) {
        setIsLifted(false);
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
  }, [isLifted, onInspectCommit]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canInteract) return;
      e.preventDefault();
      setIsLifted(true);
      webAudio.playDiceReveal();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {
        // Ignore vibration error on unsupported platforms
      }
    },
    [canInteract]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isLifted) return;
      e.preventDefault();
      setIsLifted(false);
      onInspectCommit?.();
    },
    [isLifted, onInspectCommit]
  );

  const handlePointerCancel = useCallback(() => {
    if (isLifted) {
      setIsLifted(false);
      onInspectCommit?.();
    }
  }, [isLifted, onInspectCommit]);

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
        // Ignore vibration error on unsupported platforms
      }
      setTimeout(() => {
        setIsShaking(false);
        onShakeCommit?.();
      }, 500);
    },
    [allowShake, canInteract, isShaking, onShakeCommit]
  );

  const isCompact = variant === 'compact';
  const hasValidDice = normalizedValues.length > 0;

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
        <ThreeDiceCupCanvas
          diceValues={hasValidDice ? normalizedValues : [4]}
          isLifted={isLifted}
          isShaking={isShaking}
          theme={theme}
          variant={variant}
        />
      </div>

      {/* 底部提示与辅助操作 */}
      <div className="shared-cup-info">
        {playerName && !peekTargetName && (
          <div className="shared-cup-owner">{playerName}</div>
        )}
        <div className="shared-cup-hint">
          {canInteract ? (
            isLifted ? (
              <span className="hint-lifted">
                松开手指自动扣盖防窥{' '}
                {normalizedValues.length === 1
                  ? `（${normalizedValues[0]} 点）`
                  : normalizedValues.length > 1
                    ? `（共 ${normalizedValues.reduce((a, b) => a + b, 0)} 点）`
                    : ''}
              </span>
            ) : (
              <span className="hint-press">按住掀开 3D 骰盅查看</span>
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
            {isShaking ? '摇骰中…' : '摇晃骰盅'}
          </button>
        )}
      </div>
    </div>
  );
}
