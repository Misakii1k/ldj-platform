import type { BoardTargetView } from '../types.ts';
import { targetLabel } from '../types.ts';

export interface WitsPokerCardProps {
  /** 已揭晓的槽位；传 null 表示这是一张背面牌（DOM 里不含任何数值，隐私硬约束） */
  readonly target: BoardTargetView | null;
  /** 牌面右上角的作者色点（与座位章同色的玩家色） */
  readonly authorColors?: readonly string[];
  /** table = 桌面 94×132；compact = 紧凑 78×92（手机由媒体查询统一缩，无需传） */
  readonly size?: 'table' | 'compact';
  /** 牌面下方的单位小字（题目单位），背面与「更低」格不显示 */
  readonly unit?: string;
  readonly className?: string;
}

/**
 * 象牙扑克牌（01-CONTRACT.md §4.2 / §4.3，像素参照 A2-casino-lounge.html 的 .pcard / .back）。
 *
 * 牌面：中央衬线数字 + 下方单位；左上 / 右下（旋转 180°）牌角索引「数字 + 红 ♠」；
 * 右上作者色点；淡 ♠ 水印；纸纹；金色内框。
 * 「更低」格（target.id === 'lower'）走虚线透明样式。
 * 背面：酒红菱格 + 象牙白边 + 中央黄铜「智」字圆章。
 *
 * 赔率牌不在本组件里——它是槽位结构的一部分（WitsTableStage 的 .ww-odds-plaque）。
 */
export function WitsPokerCard({
  target,
  authorColors = [],
  size = 'table',
  unit,
  className = '',
}: WitsPokerCardProps) {
  const classes = [
    'ww-poker-card',
    // ww-target-card 是对外的稳定选择器契约（E2E 按它数已上桌的槽位），只挂在真正的版图牌上
    target ? 'ww-target-card' : '',
    target ? 'ww-poker-card--face' : 'ww-poker-card--back',
    target?.id === 'lower' ? 'ww-poker-card--lower' : '',
    size === 'compact' ? 'ww-poker-card--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!target) {
    return <div className={classes} role="img" aria-label="未翻开的答案牌" />;
  }

  const isLower = target.id === 'lower';
  const label = targetLabel(target);

  return (
    <div
      className={classes}
      role="img"
      // 数字位数交给 CSS：牌面中央大字按字符数自动缩放，保证长数字（估数可能很大）
      // 既不溢出象牙牌的金框、也不被裁切，且始终保留精确位数（下注要按精确值比大小）。
      style={{ ['--ww-val-len' as string]: String(label.length) }}
      aria-label={
        isLower
          ? `答案低于全部估数，净赢 ${target.odds} 倍`
          : `估数 ${label}，净赢 ${target.odds} 倍`
      }
    >
      {isLower ? (
        <span className="ww-poker-card__lower-label">
          更低
          <small>比所有牌都小</small>
        </span>
      ) : (
        <>
          <span className="ww-poker-card__ix ww-poker-card__ix--tl" aria-hidden="true">
            {label}
            <i>♠</i>
          </span>
          <span className="ww-poker-card__ix ww-poker-card__ix--br" aria-hidden="true">
            {label}
            <i>♠</i>
          </span>
          {authorColors.length > 0 && (
            <span className="ww-poker-card__authors" aria-hidden="true">
              {authorColors.map((color, index) => (
                <i key={index} style={{ background: color }} />
              ))}
            </span>
          )}
          <span className="ww-poker-card__value">{label}</span>
          {unit && <span className="ww-poker-card__unit">{unit}</span>}
        </>
      )}
    </div>
  );
}
