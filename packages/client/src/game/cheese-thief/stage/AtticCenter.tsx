/**
 * 阁楼世界 · 中央区：木砧板 + 整轮奶酪（切一角）/ 大骰盅（T2）/ 倒计时圆盘（T4）。
 * T1 先落地砧板 + 奶酪 + 说明胶囊；其余模式随各自任务接入。
 *
 * 奶酪 SVG 逐像素照抄定稿（B2-attic-final.html）：整轮奶酪切一角、深色蜡边、孔洞剖面。
 */
import type { ReactNode } from 'react';
import type { CheeseSight } from './atticModel.ts';

/** 整轮奶酪切一角（定稿 SVG，viewBox 220×150）。 */
export function CheeseWheel({ className }: { readonly className?: string }) {
  return (
    <svg className={`cta-cheese${className ? ` ${className}` : ''}`} viewBox="0 0 220 150" aria-label="奶酪">
      <path d="M20 70 Q20 36 110 30 Q200 36 200 70 L200 108 Q200 138 110 142 Q20 138 20 108 Z" fill="#b8431f" stroke="#292722" strokeWidth="5" strokeLinejoin="round" />
      <path d="M28 70 Q28 44 110 38 Q192 44 192 70 L192 104 Q192 130 110 134 Q28 130 28 104 Z" fill="#f7c84b" />
      <path d="M28 72 Q28 46 110 40 Q192 46 192 72 Q192 96 110 100 Q28 96 28 72 Z" fill="#ffe08a" stroke="#292722" strokeWidth="3" />
      <path d="M110 70 L192 72 L192 104 Q176 124 140 131 L140 90 Z" fill="#f2b937" stroke="#292722" strokeWidth="4" strokeLinejoin="round" />
      <path d="M110 70 L140 90 L140 131 Q126 133 110 134 Z" fill="#e8a92a" stroke="#292722" strokeWidth="4" strokeLinejoin="round" />
      <path d="M110 70 L192 72 Q184 60 162 52 Z" fill="#fff0b8" stroke="#292722" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="64" cy="66" rx="12" ry="6" fill="#e0a92a" />
      <ellipse cx="96" cy="54" rx="8" ry="4" fill="#e0a92a" />
      <ellipse cx="60" cy="112" rx="10" ry="12" fill="#e0a92a" stroke="#292722" strokeWidth="2" />
      <ellipse cx="88" cy="120" rx="6" ry="7" fill="#e0a92a" stroke="#292722" strokeWidth="2" />
      <circle cx="160" cy="98" r="9" fill="#c98a1c" stroke="#292722" strokeWidth="2.5" />
      <circle cx="178" cy="86" r="5" fill="#c98a1c" stroke="#292722" strokeWidth="2" />
      <circle cx="124" cy="112" r="6" fill="#b87c16" stroke="#292722" strokeWidth="2" />
      <path d="M44 60 Q70 46 104 44" stroke="#fff8d8" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

interface AtticCenterProps {
  /** 砧板上的奶酪状态：on-board 在 / missing 空砧板 / with-me 在我卡里（砧板空） */
  readonly cheese: CheeseSight;
  /** 奶酪被偷瞬间的淡出（T3 接入飞行后配合）；T1 恒 false */
  readonly cheeseTaken?: boolean;
  readonly caption: string;
  /** 砧板下方额外内容位（T2 大骰盅 / T4 倒计时圆盘挂载点） */
  readonly children?: ReactNode;
}

export function AtticCenter({ cheese, cheeseTaken = false, caption, children }: AtticCenterProps) {
  return (
    <div className="cta-center" data-box="center">
      {children ?? (
        <div className="cta-cheese-box">
          {cheese === 'on-board' ? (
            <div className={cheeseTaken ? 'is-taken' : undefined} data-cheese-anchor="board">
              <CheeseWheel />
            </div>
          ) : null}
        </div>
      )}
      <div className="cta-board" aria-hidden="true" />
      {caption ? <span className="cta-caption">{caption}</span> : null}
    </div>
  );
}
