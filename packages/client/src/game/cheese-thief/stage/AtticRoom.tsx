/**
 * 阁楼世界 · 房间骨架：墙 / 斜梁 / 木地板 / 鼠洞 / 拱窗（日月星云窗帘）/ 月光束 /
 * 卡纸告示牌 / 时刻条 / 昼夜扫屏。
 *
 * 像素参照：docs/ui-preview/cheese-thief/directions/_attic.css（B2 定稿共用层）。
 * 样式：cheese-thief.css「阁楼世界」段，类名 .cta-*。
 */
import { useEffect, useRef, useState } from 'react';
import type { AtticTime } from './atticModel.ts';

interface AtticRoomProps {
  readonly time: AtticTime;
  /** 告示牌小字（如「夜晚 · 第 3 点」） */
  readonly when: string;
  /** 告示牌大标题（衬线） */
  readonly title: string;
  /** ④ 揭晓时的副标题；平时不传 */
  readonly sub?: string | null;
  /** ④ 盖章动画触发：true 时告示牌播 stamp */
  readonly stamped?: boolean;
  /** 时刻条：当前时刻（1–6，0 = 开局窗口不高亮）、我的点数（mine）、是否淡化（白天） */
  readonly currentHour: number;
  readonly myHour: number | null;
}

const HOURS = [1, 2, 3, 4, 5, 6] as const;

const STARS = [
  { left: '16%', top: '18%' },
  { left: '34%', top: '36%' },
  { left: '82%', top: '22%' },
  { left: '26%', top: '8%' },
  { left: '88%', top: '48%' },
] as const;

export function AtticRoom({ time, when, title, sub = null, stamped = false, currentHour, myHour }: AtticRoomProps) {
  // 昼夜扫屏：time 变化时播一次 780ms 径向扫屏，中途切换实际背景（照 _shared.js setTime）
  const [sweepTo, setSweepTo] = useState<AtticTime | null>(null);
  const prevTimeRef = useRef(time);
  useEffect(() => {
    if (prevTimeRef.current === time) return;
    prevTimeRef.current = time;
    setSweepTo(time);
    const timer = setTimeout(() => setSweepTo(null), 820);
    return () => clearTimeout(timer);
  }, [time]);

  return (
    <>
      <div className="cta-wall" aria-hidden="true" />
      <div className="cta-beams" aria-hidden="true"><b /><i /><i /></div>
      <div className="cta-floor" aria-hidden="true" />
      <div className="cta-mousehole" aria-hidden="true" />

      <div className="cta-window" aria-hidden="true">
        <span className="cta-cloud" style={{ left: '20%', top: '62%', width: 70 }} />
        <span className="cta-cloud" style={{ left: '58%', top: '72%', width: 54 }} />
        {STARS.map((s, i) => (
          <span key={i} className="cta-star" style={s}>{i % 2 === 0 ? '✦' : '✧'}</span>
        ))}
        <div className="cta-moon" />
        <div className="cta-sun" />
        <div className="cta-mullion" />
        <div className="cta-transom" />
        <div className="cta-curtain cta-curtain--l" />
        <div className="cta-curtain cta-curtain--r" />
      </div>
      <div className="cta-sill" aria-hidden="true" />
      <div className="cta-lightbeam" aria-hidden="true" />

      <header className={`cta-notice${stamped ? ' cta-notice--stamp' : ''}`}>
        <div className="cta-notice__when">{when}</div>
        <h1 className={`cta-notice__title${sub ? ' cta-notice__title--verdict' : ''}`}>{title}</h1>
        {sub ? <div className="cta-notice__sub">{sub}</div> : null}
      </header>

      <div className="cta-hours-box" aria-label="夜间时刻条">
        <div className="cta-hours">
          {HOURS.map((h) => (
            <span
              key={h}
              className={[
                currentHour === h ? 'is-now' : '',
                currentHour > h ? 'is-done' : '',
                myHour === h ? 'is-mine' : '',
              ].filter(Boolean).join(' ') || undefined}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {sweepTo ? <div className="cta-sweep is-run" data-to={sweepTo} aria-hidden="true" /> : null}
    </>
  );
}
