import { useCallback, useState } from 'react';

interface CheeseDiceCup3DProps {
  diceValue: number | null;
  playerName?: string;
  isMe?: boolean;
  canInteract?: boolean;
  hint?: string;
  peekTargetName?: string;
  onInspectCommit?: () => void;
  variant?: 'large' | 'compact';
}

export function CheeseDiceCup3D({
  diceValue,
  playerName,
  isMe = false,
  canInteract = true,
  hint,
  peekTargetName,
  onInspectCommit,
  variant = 'large',
}: CheeseDiceCup3DProps) {
  const [isLifted, setIsLifted] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!canInteract) return;
    e.preventDefault();
    setIsLifted(true);
  }, [canInteract]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isLifted) return;
    e.preventDefault();
    setIsLifted(false);
    onInspectCommit?.();
  }, [isLifted, onInspectCommit]);

  const handlePointerCancel = useCallback(() => {
    if (isLifted) {
      setIsLifted(false);
      onInspectCommit?.();
    }
  }, [isLifted, onInspectCommit]);

  const renderDiceDots = (value: number) => {
    const dots: Array<{ x: number; y: number; isRed?: boolean }> = [];
    if (value === 1) {
      dots.push({ x: 50, y: 50, isRed: true });
    } else if (value === 2) {
      dots.push({ x: 30, y: 30 }, { x: 70, y: 70 });
    } else if (value === 3) {
      dots.push({ x: 30, y: 30 }, { x: 50, y: 50 }, { x: 70, y: 70 });
    } else if (value === 4) {
      dots.push({ x: 30, y: 30, isRed: true }, { x: 70, y: 30, isRed: true }, { x: 30, y: 70, isRed: true }, { x: 70, y: 70, isRed: true });
    } else if (value === 5) {
      dots.push({ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 50, y: 50, isRed: true }, { x: 30, y: 70 }, { x: 70, y: 70 });
    } else if (value === 6) {
      dots.push({ x: 30, y: 25 }, { x: 30, y: 50 }, { x: 30, y: 75 }, { x: 70, y: 25 }, { x: 70, y: 50 }, { x: 70, y: 75 });
    }

    return dots.map((dot, index) => (
      <span
        key={index}
        className={`cheese-die-dot ${dot.isRed ? 'cheese-die-dot--red' : ''}`}
        style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
      />
    ));
  };

  const isCompact = variant === 'compact';

  return (
    <div
      className={`cheese-dice-cup-wrapper ${isCompact ? 'cheese-dice-cup-wrapper--compact' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      role="button"
      tabIndex={canInteract ? 0 : -1}
      aria-label={playerName ? `${playerName} 的骰盅` : '骰盅'}
    >
      <div className="cheese-dice-cup-scene">
        {/* 底部绒布底座 */}
        <div className="cheese-cup-base">
          <div className="cheese-cup-mat">
            {/* 3D 骰子 */}
            {diceValue !== null && diceValue >= 1 && diceValue <= 6 ? (
              <div className={`cheese-die-3d ${isLifted ? 'is-visible' : ''}`}>
                <div className="cheese-die-face">
                  {renderDiceDots(diceValue)}
                </div>
                <div className="cheese-die-number-badge">{diceValue} 点醒来</div>
              </div>
            ) : (
              <div className="cheese-die-unknown">
                <span>?</span>
              </div>
            )}
          </div>
        </div>

        {/* 3D 木质骰盅罩体 */}
        <div className={`cheese-cup-dome ${isLifted ? 'is-lifted' : ''}`}>
          <div className="cheese-cup-dome__top">
            <span className="cheese-cup-dome__knob" />
          </div>
          <div className="cheese-cup-dome__body">
            <span className="cheese-cup-dome__pattern">🧀</span>
            <span className="cheese-cup-dome__label">
              {peekTargetName ? `查验 ${peekTargetName}` : isMe ? '我的骰盅' : playerName || '骰盅'}
            </span>
          </div>
          <div className="cheese-cup-dome__rim" />
        </div>
      </div>

      {/* 提示文案与状态 */}
      <div className="cheese-cup-info">
        {playerName && <div className="cheese-cup-owner">{playerName}</div>}
        <div className="cheese-cup-hint">
          {canInteract ? (
            isLifted ? (
              <span className="cheese-hint-lifted">👀 松开手指自动扣盖防窥</span>
            ) : (
              <span>👆 按住掀开骰盅查看</span>
            )
          ) : (
            <span className="cheese-hint-disabled">{hint || '骰盅已扣紧'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
