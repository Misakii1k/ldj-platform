/**
 * D4-A2：白板猜词外部裁判政策（blank-normalization-v1 / blank-adjudication-v1）。
 * 纯函数：无 I/O、无网络、无 DB、无时钟、无日志、无全局状态。
 * 归一化规则冻结（blank-normalization-v1）：先拒绝控制字符 → NFC →
 * 内部 Unicode 空白折叠为单个 ASCII 空格 → trim → 仅 ASCII A-Z 转小写。
 */

export const BLANK_NORMALIZATION_VERSION = 'blank-normalization-v1';
export const ADJUDICATION_POLICY_VERSION = 'blank-adjudication-v1';

export type AdjudicationClassification =
  | 'equivalent'
  | 'not_equivalent'
  | 'uncertain'
  | 'provider_error'
  | 'timeout'
  | 'invalid_response';
export type AdjudicationVerdict = 'equivalent' | 'not_equivalent';
export type AdjudicationSource = 'local' | 'primary' | 'fallback' | 'fail_closed';
export type AdjudicationStage = 'primary' | 'fallback';

export interface AdjudicationProviderPayload {
  normalizedStandardAnswer: string;
  normalizedGuess: string;
  adjudicationPolicyVersion: string;
}

/** 空白折叠前拒绝：Cc（控制字符，含 \t）、Zl（行分隔）、Zp（段分隔），以及 \r、\n */
const REJECTED_CODE_POINTS = /[\p{Cc}\p{Zl}\p{Zp}\r\n]/u;

const ADJUDICATION_CLASSIFICATIONS: readonly AdjudicationClassification[] = [
  'equivalent',
  'not_equivalent',
  'uncertain',
  'provider_error',
  'timeout',
  'invalid_response',
];

/**
 * 归一化（blank-normalization-v1，规则冻结）：
 * 1. 先拒绝控制字符/行段分隔符（含换行），避免换行被吞成空格；
 * 2. NFC 归一化；3. 内部连续 Unicode 空白折叠为单个 ASCII 空格；
 * 4. trim 外围空白；5. 仅 ASCII A-Z 转小写（其余字符一律原样保留）。
 */
export function normalizeBlankAdjudicationText(input: string): string {
  if (typeof input !== 'string') throw new Error('空白裁判文本必须是字符串');
  if (REJECTED_CODE_POINTS.test(input)) {
    throw new Error('空白裁判文本不得包含控制字符或换行');
  }
  const nfc = input.normalize('NFC');
  const folded = nfc.replace(/\p{White_Space}+/gu, ' ').trim();
  // 仅对 ASCII 大写（U+0041–U+005A）转小写；CJK、emoji、Latin 非 ASCII 原样保留
  let out = '';
  for (const ch of folded) {
    const code = ch.codePointAt(0)!;
    out += code >= 0x41 && code <= 0x5A ? String.fromCodePoint(code + 0x20) : ch;
  }
  return out;
}

/** 长度校验：按 Unicode code point 计数，接受 1–64（含）；non-BMP 计 1。 */
export function isValidBlankAdjudicationText(text: string): boolean {
  if (typeof text !== 'string') return false;
  const length = [...text].length;
  return length >= 1 && length <= 64;
}

/** 本地精确匹配：对已归一化的两段文本做精确相等。 */
export function classifyLocalExactMatch(
  normalizedStandardAnswer: string,
  normalizedGuess: string,
): boolean {
  return normalizedStandardAnswer === normalizedGuess;
}

/**
 * 解析 provider 返回的原始值：仅接受「恰有一个键 classification 且值属于
 * 六类之一」的对象；未知键/多余键/其他形状 → null（调用方映射为 invalid_response）。
 */
export function parseAdjudicationClassification(
  value: unknown,
): AdjudicationClassification | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'classification') return null;
  const classification = record.classification;
  if (typeof classification !== 'string') return null;
  return ADJUDICATION_CLASSIFICATIONS.includes(classification as AdjudicationClassification)
    ? (classification as AdjudicationClassification)
    : null;
}

/** 是否触发备用：uncertain / provider_error / timeout / invalid_response 为 true。 */
export function shouldInvokeFallback(classification: AdjudicationClassification): boolean {
  return classification !== 'equivalent' && classification !== 'not_equivalent';
}

function isTerminal(
  classification: AdjudicationClassification,
): classification is AdjudicationVerdict {
  return classification === 'equivalent' || classification === 'not_equivalent';
}

/**
 * 终局决策：
 * - primary 终局 → verdict 随 primary，source primary；
 * - 否则 fallback 终局 → verdict 随 fallback，source fallback；
 * - 否则 → 失败关闭：verdict not_equivalent，source fail_closed。
 */
export function finalizeAdjudicationDecision(options: {
  primary: AdjudicationClassification | null;
  fallback: AdjudicationClassification | null;
}): { verdict: AdjudicationVerdict; source: AdjudicationSource } {
  const { primary, fallback } = options;
  if (primary !== null && isTerminal(primary)) {
    return { verdict: primary, source: 'primary' };
  }
  if (fallback !== null && isTerminal(fallback)) {
    return { verdict: fallback, source: 'fallback' };
  }
  return { verdict: 'not_equivalent', source: 'fail_closed' };
}

/** 结果是否可应用：会话未结算、taskId 匹配期望序号、结果未应用，三者全满足才 true。 */
export function isAdjudicationResultEligible(options: {
  taskSettled: boolean;
  taskIdMatchesExpectedSequence: boolean;
  alreadyApplied: boolean;
}): boolean {
  return !options.taskSettled && options.taskIdMatchesExpectedSequence && !options.alreadyApplied;
}
