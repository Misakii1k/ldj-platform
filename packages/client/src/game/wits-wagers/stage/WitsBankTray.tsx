export interface WitsBankTrayProps {
  /** 托盘中待派发/已收回的筹码数量，仅用于视觉厚度 */
  readonly stackSize?: number;
  readonly label?: string;
  readonly active?: boolean;
}

/**
 * 桌边银行托盘。收付演出的起点与终点锚（data-ww-anchor="bank"）。
 */
export function WitsBankTray({ stackSize = 3, label = '银行', active = false }: WitsBankTrayProps) {
  const layers = Math.min(5, Math.max(1, stackSize));

  return (
    <div
      className={`ww-bank ${active ? 'is-active' : ''}`.trim()}
      data-ww-anchor="bank"
      aria-label={`${label}托盘`}
    >
      <div className="ww-bank__tray" aria-hidden="true">
        {Array.from({ length: layers }, (_, index) => (
          <span key={index} className="ww-bank__layer" style={{ ['--ww-layer' as string]: String(index) }} />
        ))}
      </div>
      <span className="ww-bank__label">{label}</span>
    </div>
  );
}
