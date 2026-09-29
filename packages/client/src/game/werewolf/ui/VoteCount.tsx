import React from 'react';
// 样式由 TicketSeat/theatre-stage.css 统一加载；本文件保持无 CSS 导入以便 node --test 直接加载纯函数。

/**
 * 唱票（视觉契约 §4.6 / 剧场 W05）。像素参照 V-vote.html step=count。
 * 中央：票箱 + kicker「唱票」+ 大字「正在开箱… / N 号得票最多 / N 号与 M 号平票」+ 说明行。
 * 隐私红线：只公开每人得票数，绝不公开谁投了谁。
 *
 * 选票飞行节奏（纯函数 buildBallotQueue 决定顺序，播放动效在 WerewolfStage）：
 * 按得票从少到多逐张飞出，最高票最后落定。
 */

/** 唱票队列：按得票数升序（同票按席位号升序），每票一项，值为目标玩家 id。 */
export function buildBallotQueue(
  tally: Readonly<Record<string, number>>,
  seatOrder?: ReadonlyMap<string, number>,
): readonly string[] {
  const entries = Object.entries(tally).filter(([, count]) => count > 0);
  entries.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    const sa = seatOrder?.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
    const sb = seatOrder?.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a[0] < b[0] ? -1 : 1;
  });
  const queue: string[] = [];
  for (const [targetId, count] of entries) {
    for (let i = 0; i < count; i += 1) queue.push(targetId);
  }
  return queue;
}

export interface VoteCountProps {
  readonly kicker: string;
  /** 「正在开箱…」「4 号得票最多」「4 号与 3 号平票」 */
  readonly big: string;
  readonly line?: React.ReactNode;
  readonly timerSeconds?: number | null;
  readonly timerTotal?: number | null;
  readonly timerNote?: string | null;
}

export function VoteCount({ kicker, big, line = null, timerSeconds = null, timerTotal = null, timerNote = null }: VoteCountProps) {
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
      </div>
      <span className="ww-vcenter__kicker">{kicker}</span>
      <strong className="ww-vcenter__big">{big}</strong>
      {line ? <span className="ww-vcenter__line">{line}</span> : null}
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
