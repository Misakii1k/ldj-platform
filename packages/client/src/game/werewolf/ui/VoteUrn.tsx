import React from 'react';
// 样式由 TicketSeat/theatre-stage.css 统一加载；本文件不直接引 CSS。

/**
 * 放逐投票中央场景（视觉契约 §4.6 / 剧场 W05）。像素参照 V-vote.html step=vote。
 * 中央：票箱（你已投票时票口露出半张票）+ kicker「第 N 天 · 放逐投票」
 * + 大字「投出你心中的狼 / 你投给了 N 号」+ 进度点（只显示人数，不显示投向）+ 倒计时环。
 */

export interface VoteUrnProps {
  readonly kicker: string;
  readonly big: string;
  /** 如「已投 7 / 11 人 · 可以弃票」 */
  readonly line?: React.ReactNode;
  /** 已投人数（进度点亮起数量） */
  readonly submitted: number;
  /** 应投人数 */
  readonly expected: number;
  /** 你已投票：票口露出半张选票 */
  readonly peek: boolean;
  readonly timerSeconds?: number | null;
  readonly timerTotal?: number | null;
  readonly timerNote?: string | null;
}

export function VoteUrn({
  kicker,
  big,
  line = null,
  submitted,
  expected,
  peek,
  timerSeconds = null,
  timerTotal = null,
  timerNote = null,
}: VoteUrnProps) {
  const ringPct = timerSeconds !== null && timerTotal && timerTotal > 0
    ? Math.max(0, Math.min(1, timerSeconds / timerTotal))
    : 1;
  const ringLevel = timerSeconds !== null ? (timerSeconds <= 5 ? 'crit' : timerSeconds <= 10 ? 'warn' : '') : '';
  return (
    <div className="ww-vcenter">
      <div className="ww-urn" aria-hidden="true">
        <span className="ww-urn__box" />
        <span className="ww-urn__lid" />
        <span className="ww-urn__slot" />
        {peek ? <span className="ww-urn__peek" /> : null}
      </div>
      <span className="ww-vcenter__kicker">{kicker}</span>
      <strong className="ww-vcenter__big">{big}</strong>
      {line ? <span className="ww-vcenter__line">{line}</span> : null}
      {expected > 0 && (
        <span className="ww-vcenter__progress" aria-label={`已投 ${submitted} / ${expected} 人`}>
          {Array.from({ length: expected }, (_, i) => (
            <i key={i} className={i < submitted ? 'on' : ''} />
          ))}
        </span>
      )}
      {timerNote ? (
        <span className="ww-vcenter__timer-note">{timerNote}</span>
      ) : timerSeconds !== null ? (
        <span className={`ww-timer ${ringLevel}`.trim()} role="timer" aria-label={`剩余 ${timerSeconds} 秒`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="track" cx="50" cy="50" r="42" pathLength={100} strokeWidth={7} strokeDasharray="100" strokeDashoffset={0} />
            <circle className="bar" cx="50" cy="50" r="42" pathLength={100} strokeWidth={7} strokeDasharray="100" strokeDashoffset={(100 - ringPct * 100).toFixed(1)} />
          </svg>
          <span className="num">{timerSeconds}</span>
        </span>
      ) : null}
    </div>
  );
}
