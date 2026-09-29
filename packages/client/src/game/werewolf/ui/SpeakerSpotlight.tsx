import React from 'react';
import './theatre-stage.css';

/**
 * 中央发言者追光（视觉契约 §4.5 / 剧场 W03）。像素参照
 * `docs/ui-preview/werewolf/directions/A2-box-wings.html`（A 原版发言者：圆形头像 +
 * 衬线大名字 + 顺序行 + 倒计时环；**不是**拱形海报立绘，用户 2026-09-26 已否定）。
 *
 * 同时复用于天亮公告（`day_announcement`：kicker「天亮了」+「昨夜平安 / N 号、M 号出局」，
 * 不写死因）与自由发言（kicker「自由发言」）等非发言者场景：此时不传 portraitUrl，
 * 大字直接落在追光下。
 *
 * 动效：交麦落地后名字 slam（520ms）；倒计时 ≤10 秒变橙、≤5 秒变红脉冲。
 * 降级见 `theatre-stage.css` 的 data-motion-level 门控（契约 §5）。
 */

export interface SpeakerSpotlightProps {
  /** 眉标：「正在发言」「天亮了」「自由发言」「遗言」 */
  readonly kicker: string;
  /** 衬线大字：发言者名 / 「轮到你了」/「昨夜平安」/「自由讨论」 */
  readonly big: string;
  /** 顺序行 / 说明行（如「6 号 · 第 2 / 12 位发言」），可含 <b> 强调 */
  readonly sub?: React.ReactNode;
  /** 说明行第二行（如倒计时状态「已暂停」之外的补充文案） */
  readonly footnote?: React.ReactNode;
  /** 圆形头像（getSpeakerIllustrationUrl）；非发言者场景留空则不渲染 */
  readonly portraitUrl?: string | null;
  /** 倒计时剩余秒；null 表示本阶段无倒计时 */
  readonly timerSeconds?: number | null;
  /** 倒计时总量秒（用于环的进度；缺省按已见最大值） */
  readonly timerTotal?: number | null;
  /** 权威时间线非计数状态文案：已暂停 / 等待主持人 / 正在播报 */
  readonly timerNote?: string | null;
  /** 变化时重播名字 slam 动画（通常传「day:playerId」） */
  readonly slamKey?: string | number | null;
}

function TimerRing({ seconds, total }: { readonly seconds: number; readonly total: number | null }) {
  const pct = total && total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 1;
  const level = seconds <= 5 ? 'crit' : seconds <= 10 ? 'warn' : '';
  return (
    <span
      className={`ww-timer ${level}`.trim()}
      role="timer"
      aria-label={`剩余 ${seconds} 秒`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r="42" pathLength={100} strokeWidth={7} strokeDasharray="100" strokeDashoffset={0} />
        <circle
          className="bar"
          cx="50"
          cy="50"
          r="42"
          pathLength={100}
          strokeWidth={7}
          strokeDasharray="100"
          strokeDashoffset={(100 - pct * 100).toFixed(1)}
        />
      </svg>
      <span className="num">{seconds}</span>
    </span>
  );
}

export function SpeakerSpotlight({
  kicker,
  big,
  sub = null,
  footnote = null,
  portraitUrl = null,
  timerSeconds = null,
  timerTotal = null,
  timerNote = null,
  slamKey = null,
}: SpeakerSpotlightProps) {
  return (
    <div className="ww-speaker">
      <span className="ww-speaker__kicker">{kicker}</span>
      {portraitUrl ? (
        <span className="ww-speaker__portrait">
          <img src={portraitUrl} alt="" draggable={false} />
        </span>
      ) : null}
      <strong className="ww-speaker__big" key={slamKey}>{big}</strong>
      {sub ? <span className="ww-speaker__sub">{sub}</span> : null}
      {timerNote ? (
        <span className="ww-speaker__timer-note">{timerNote}</span>
      ) : timerSeconds !== null ? (
        <TimerRing seconds={timerSeconds} total={timerTotal ?? timerSeconds} />
      ) : null}
      {footnote ? <span className="ww-speaker__footnote">{footnote}</span> : null}
    </div>
  );
}
