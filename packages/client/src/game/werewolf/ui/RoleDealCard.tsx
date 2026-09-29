import React from 'react';
import './theatre-stage.css';

/**
 * 发身份中央场景（视觉契约 §4.7 / 剧场 W06）。像素参照 R-reveal.html step=deal。
 * 中央一张大牌：卡背（card_back.png）点一下翻开 → 身份插画 + 阵营胶囊 + 衬线身份名 + 技能说明；
 * 翻开瞬间扫光；防窥纪律与 shared-ui/IdentityFlipCard 的 flip 模式一致
 * （切后台 / 失焦立即扣回，确认后由父组件接管）。
 *
 * 隐私红线（契约 §2）：本组件只渲染自己的身份；确认进度只显示人数。
 */

export interface RoleDealCardProps {
  /** kicker：「第 1 夜之前 · 查看你的身份」 */
  readonly kicker: string;
  /** 身份名：狼人 / 预言家 … */
  readonly roleLabel: string;
  /** 阵营：决定胶囊配色 */
  readonly team: 'wolves' | 'village';
  readonly teamLabel: string;
  /** 技能说明（翻开后显示） */
  readonly skill: string;
  /** 身份插画 */
  readonly artworkUrl: string;
  /** 已确认人数 / 总人数（进度点） */
  readonly confirmedCount: number;
  readonly totalCount: number;
  /** 翻开状态变化（父组件用它决定底部黄色按钮的显隐） */
  readonly onFlipChange?: (flipped: boolean) => void;
}

export function RoleDealCard({
  kicker,
  roleLabel,
  team,
  teamLabel,
  skill,
  artworkUrl,
  confirmedCount,
  totalCount,
  onFlipChange,
}: RoleDealCardProps) {
  const [flipped, setFlipped] = React.useState(false);

  // 防窥：与 IdentityFlipCard 同一纪律——页面隐藏 / 窗口失焦立即扣回
  React.useEffect(() => {
    const conceal = () => setFlipped(false);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') conceal();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', conceal);
    window.addEventListener('pagehide', conceal);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', conceal);
      window.removeEventListener('pagehide', conceal);
    };
  }, []);

  React.useEffect(() => {
    onFlipChange?.(flipped);
  }, [flipped, onFlipChange]);

  return (
    <div className="ww-rcenter">
      <span className="ww-rcenter__kicker">{kicker}</span>
      <button
        type="button"
        className={`ww-deal${flipped ? ' flipped' : ''}`}
        onClick={() => setFlipped((v) => !v)}
        aria-pressed={flipped}
        aria-label={flipped ? `你的身份是${roleLabel}，点击盖回` : '点一下翻开身份牌'}
      >
        <span className="ww-deal__card">
          <span className="ww-deal__face ww-deal__back" aria-hidden={flipped ? 'true' : undefined} />
          <span className={`ww-deal__face ww-deal__front ${team}`} aria-hidden={flipped ? undefined : 'true'}>
            <span className={`ww-deal__team ${team}`}>{teamLabel}</span>
            <img src={artworkUrl} alt={flipped ? roleLabel : ''} draggable={false} />
            <span className="ww-deal__role-name">{roleLabel}</span>
          </span>
        </span>
      </button>
      <span className="ww-rcenter__line ww-deal__skill">
        {flipped ? skill : '只有你能看到。别让旁边的人瞄到屏幕。'}
      </span>
      <span className="ww-rcenter__line">
        已确认 <b>{confirmedCount}</b> / {totalCount} 人
      </span>
      <span className="ww-rcenter__progress" aria-label={`已确认 ${confirmedCount} / ${totalCount} 人`}>
        {Array.from({ length: totalCount }, (_, i) => (
          <i key={i} className={i < confirmedCount ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}
