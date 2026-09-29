import { useEffect, useState } from 'react';
import { useMotion } from '../../../motion/MotionContext.tsx';
import type { RevealedQuestionView } from '../types.ts';

export interface WitsAnswerPlaqueProps {
  readonly question: RevealedQuestionView;
}

/**
 * 黄铜答案牌匾（01-CONTRACT.md §4.5，A2 的 .reveal）。
 *
 * 小字「正确答案」+ 衬线金色大数字 + 单位 + 来源小字。
 * 数字从 0 计数到答案（default 900ms / reduced 400ms / minimal·off 直接终值），
 * 结束弹一下（scale 1.35 → 1）。tabular-nums + min-width，位数变化容器不变宽（§5.1 第 6 条）。
 * 挂载即播，没有开场延迟（§5.1 第 2 条）。
 */
export function WitsAnswerPlaque({ question }: WitsAnswerPlaqueProps) {
  const { level } = useMotion();
  const counting = level === 'full' || level === 'reduced';
  const durationMs = level === 'full' ? 900 : 400;

  const [display, setDisplay] = useState(() => (counting ? 0 : question.answer));
  const [done, setDone] = useState(!counting);

  useEffect(() => {
    if (!counting) {
      setDisplay(question.answer);
      setDone(true);
      return;
    }

    setDisplay(0);
    setDone(false);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(question.answer * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [question.answer, counting, durationMs]);

  return (
    <div className="ww-plaque" role="status" aria-label={`正确答案 ${question.answer.toLocaleString('zh-CN')} ${question.unit}`}>
      <div className="ww-plaque__label">正确答案</div>
      <div className={`ww-plaque__value ${done ? 'is-done' : ''}`}>
        {display.toLocaleString('zh-CN')}
        <small>{question.unit}</small>
      </div>
      <div className="ww-plaque__src">{question.sourceNote}</div>
    </div>
  );
}
