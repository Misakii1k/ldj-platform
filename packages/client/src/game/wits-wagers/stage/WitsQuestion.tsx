import type { QuestionBrief } from '../types.ts';

export interface WitsQuestionProps {
  readonly question: QuestionBrief;
  /** 题目上方的小字（作答阶段「写下你的估数」）；compact 与空串不渲染 */
  readonly kicker?: string;
  /** settlement 变体：缩成一行灰字（kicker 与单位行都收起） */
  readonly compact?: boolean;
}

/**
 * 贵宾厅题目（01-CONTRACT.md §4.2 / §4.5，A2 的 .question）。
 *
 * kicker + 衬线大题目（桌面 40px / 手机 24px）+ 「单位：X」；
 * settlement 变体缩成一行 20px 灰字（手机 15px），给黄铜答案牌匾让位。
 */
export function WitsQuestion({ question, kicker, compact = false }: WitsQuestionProps) {
  return (
    <div className={`ww-question ${compact ? 'ww-question--compact' : ''}`.trim()}>
      {!compact && kicker && <div className="ww-question__kicker">{kicker}</div>}
      <h2 className="ww-question__prompt">{question.prompt}</h2>
      {!compact && <div className="ww-question__unit">单位：{question.unit}</div>}
    </div>
  );
}
