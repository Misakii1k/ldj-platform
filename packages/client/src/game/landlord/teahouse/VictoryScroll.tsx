import React from 'react';

export interface VictoryScrollProps {
  winnerTeam: 'landlord' | 'farmers' | null;
  winnerName?: string;
  landlordName?: string;
  farmerNames?: string[];
  /** 本局倍数（= 最高叫分，炸弹不改写它）。 */
  multiplier: number;
  /** 最高叫分；为 0 表示三家都不叫、由首家兜底当地主。 */
  topBid?: number;
  isSpring?: boolean;
  className?: string;
}

const CONFETTI_COLORS = [
  'var(--th-red)',
  'var(--gp-yellow)',
  'var(--th-gold)',
  'var(--gp-surface, #fffdf7)',
  'var(--th-jade)',
];

/**
 * 斗地主终局捷报卷轴（含胜负大字、战报详情与春天印章）。
 *
 * 契约：contracts/landlord.md §4.3
 */
export function VictoryScroll({
  winnerTeam,
  winnerName,
  landlordName = '地主',
  farmerNames = [],
  multiplier,
  topBid,
  isSpring = false,
  className = '',
}: VictoryScrollProps) {
  const isLordWin = winnerTeam === 'landlord';
  const bigTitle = isLordWin ? '地主胜' : '农民胜';

  let whoText = '';
  if (isLordWin) {
    whoText = `${landlordName} 一人扛下两家`;
  } else if (farmerNames.length > 0) {
    whoText = `${farmerNames.join('、')} 联手拿下`;
  } else {
    whoText = `${winnerName || '农民'} 拿下对局`;
  }

  // 「叫分」要与「倍数」分开：三家都不叫时服务端倍数兜底为 1，但并没有人叫过 1 分。
  const bidText = topBid === undefined
    ? `倍数 ×${multiplier}`
    : topBid === 0
      ? `无人叫分 · 倍数 ×${multiplier}`
      : `叫分 ${topBid} · 倍数 ×${multiplier}`;

  const facts = [
    bidText,
    isLordWin ? `地主：${landlordName}` : `地主：${landlordName}（负）`,
    isSpring ? '农民一张未出' : '',
  ].filter(Boolean);

  return (
    <>
      <div className={`th-scroll ${className}`.trim()} data-box="scroll">
        <span className="th-scroll__head">捷 报</span>
        <span className="th-scroll__big">{bigTitle}</span>
        <span className="th-scroll__who">{whoText}</span>
        <div className="th-scroll__facts">
          {facts.map((fact, idx) => (
            <span key={idx}>{fact}</span>
          ))}
        </div>
        {isSpring && <span className="th-seal">春</span>}
      </div>

      {/* 地主获胜时的庆祝纸屑：卷轴落定（1600ms）时开撒（契约 §4.3 时序） */}
      {isLordWin && (
        <div className="th-confetti" aria-hidden="true">
          {Array.from({ length: 32 }).map((_, idx) => {
            const left = `${(idx * 3.1) % 100}%`;
            const bg = CONFETTI_COLORS[idx % CONFETTI_COLORS.length];
            const delay = `${1500 + ((idx * 45) % 500)}ms`;
            const duration = `${1400 + ((idx * 65) % 900)}ms`;
            return (
              <i
                key={idx}
                style={{
                  left,
                  background: bg,
                  animationDelay: delay,
                  animationDuration: duration,
                }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
