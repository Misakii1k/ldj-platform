import type { RandomSource } from '@ldj/shared';
import { QUESTION_BANK_ZH_CN } from './question-bank.zh-CN.ts';
import type { Question } from './types.ts';

export const ALL_QUESTIONS: readonly Question[] = QUESTION_BANK_ZH_CN;

/**
 * 从题库中按确定性随机源抽取 7 道不重复题目。
 * 按照 02 §6：题库只在 server/questions.ts 静态导入，严禁向客户端或配置泄露全量题库。
 */
export function selectQuestions(
  random: RandomSource,
  count = 7,
  pool: readonly Question[] = ALL_QUESTIONS,
): Question[] {
  if (pool.length < count) {
    throw new Error(`题库总数 (${pool.length}) 不足要求的抽题数 (${count})`);
  }

  const shuffled = random.shuffle(pool);
  const selected = shuffled.slice(0, count);

  const ids = new Set(selected.map((q) => q.id));
  if (ids.size !== count) {
    throw new Error('抽取到的题目 ID 存在重复');
  }

  for (const q of selected) {
    if (!q.reviewed) {
      throw new Error(`题目 ${q.id} 未通过审核，不能进入抽取池`);
    }
    if (!Number.isSafeInteger(q.answer) || q.answer < 1) {
      throw new Error(`题目 ${q.id} 的答案必须为正整数，当前为: ${q.answer}`);
    }
  }

  return [...selected];
}
