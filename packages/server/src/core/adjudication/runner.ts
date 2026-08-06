/**
 * D4-A2：白板猜词外部裁判 runner（blank-adjudication-v1）。
 * 裁决链：本地精确匹配 → 主模型 → 备用模型 → 失败关闭为猜错（只有 equivalent 判正确）。
 * runner 无状态、无持久化副作用；每次 dispatch 从最小输入独立重建载荷，
 * 备用载荷绝不观察主响应或主 classification。
 * 非法任务输入（多余字段/类型错/长度越界/policyVersion 不匹配）抛 Error，
 * A1 taskQueue 会标 errored 并由恢复续跑；provider 错误一律作为结构化分类参与回退。
 */
import {
  ADJUDICATION_POLICY_VERSION,
  classifyLocalExactMatch,
  finalizeAdjudicationDecision,
  isValidBlankAdjudicationText,
  normalizeBlankAdjudicationText,
  shouldInvokeFallback,
  type AdjudicationClassification,
  type AdjudicationProviderPayload,
  type AdjudicationSource,
  type AdjudicationStage,
  type AdjudicationVerdict,
} from '@ldj/shared';
import { parseAdjudicationResponse } from '../llmProtocol.ts';

/** 单次 provider 调用的有界摘要（不含明文/密钥/请求头/原始响应） */
export interface AdjudicationAttemptSummary {
  stage: AdjudicationStage;
  classification: AdjudicationClassification;
  elapsedMs: number;
}

/** runner 返回的有界结果，可被 A1 taskQueue 直接 JSON 序列化消费 */
export interface AdjudicationDispatchResult {
  classification: AdjudicationClassification;
  verdict: AdjudicationVerdict;
  source: AdjudicationSource;
  policyVersion: string;
  attempts: readonly AdjudicationAttemptSummary[];
}

/**
 * D4-B T2：provider invoker 契约接受 AbortSignal。
 * 每次 provider 调用由 runner 注入受控 AbortController；超时既映射 timeout，
 * 又真正 abort 底层请求（safeUpstream.safeFetch 已支持 signal），避免孤儿连接累积。
 */
export type AdjudicationProviderInvoker = (
  payload: AdjudicationProviderPayload,
  signal: AbortSignal,
) => Promise<unknown>;

export interface AdjudicationRunnerOptions {
  primary: AdjudicationProviderInvoker;
  fallback: AdjudicationProviderInvoker;
  /** 可控时钟，默认 Date.now */
  now?: () => number;
  /** 每次 provider 调用超时，默认 20000 */
  timeoutMs?: number;
  /** 可选日志：只记录有界摘要，绝不记录明文/密钥/请求头/原始响应 */
  logger?: {
    info: (msg: string, fields?: Record<string, unknown>) => void;
    warn: (msg: string, fields?: Record<string, unknown>) => void;
    error: (msg: string, fields?: Record<string, unknown>) => void;
  };
}

export class AdjudicationRunner {
  readonly #primary: AdjudicationProviderInvoker;
  readonly #fallback: AdjudicationProviderInvoker;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  readonly #logger?: AdjudicationRunnerOptions['logger'];

  constructor(options: AdjudicationRunnerOptions) {
    this.#primary = options.primary;
    this.#fallback = options.fallback;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#logger = options.logger;
  }

  /**
   * dispatch：解析 taskStore 中 inputPlaintextJson 的已 parse 值。
   * 严格解析在调用任何 provider 之前完成（非法输入抛 Error，零调用）。
   */
  async dispatch(input: unknown): Promise<AdjudicationDispatchResult> {
    const payload = this.#parseInput(input);

    // 本地精确匹配：归一化后相等，零次 provider 调用
    if (classifyLocalExactMatch(payload.normalizedStandardAnswer, payload.normalizedGuess)) {
      this.#log('info', '本地精确匹配命中', { classification: 'equivalent', source: 'local' });
      return {
        classification: 'equivalent',
        verdict: 'equivalent',
        source: 'local',
        policyVersion: ADJUDICATION_POLICY_VERSION,
        attempts: [],
      };
    }

    // 主模型：非终局才触发备用
    const attempts: AdjudicationAttemptSummary[] = [];
    const primary = await this.#invoke('primary', payload);
    attempts.push(primary);

    let fallback: AdjudicationAttemptSummary | null = null;
    if (shouldInvokeFallback(primary.classification)) {
      fallback = await this.#invoke('fallback', payload);
      attempts.push(fallback);
    }

    const { verdict, source } = finalizeAdjudicationDecision({
      primary: primary.classification,
      fallback: fallback?.classification ?? null,
    });
    // 最终分类：主终局取主；否则取备用分类（存在时）；否则取主分类
    const classification =
      primary.classification === 'equivalent' || primary.classification === 'not_equivalent' ||
      fallback === null
        ? primary.classification
        : fallback.classification;

    this.#log('info', '外部裁判裁决完成', {
      classification,
      source,
      attempts: attempts.map((a) => ({ stage: a.stage, classification: a.classification })),
    });
    return {
      classification,
      verdict,
      source,
      policyVersion: ADJUDICATION_POLICY_VERSION,
      attempts,
    };
  }

  /** 严格解析输入：多余键/类型错/非空/长度越界/policyVersion 不匹配 → 抛 Error（中文消息） */
  #parseInput(input: unknown): AdjudicationProviderPayload {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('外部裁判输入必须是 JSON 对象');
    }
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);
    for (const key of keys) {
      if (
        key !== 'normalizedStandardAnswer' &&
        key !== 'normalizedGuess' &&
        key !== 'adjudicationPolicyVersion'
      ) {
        throw new Error(`外部裁判输入含未知字段：${key}`);
      }
    }
    if (keys.length !== 3) {
      throw new Error('外部裁判输入必须恰好包含三个字段');
    }
    const { normalizedStandardAnswer, normalizedGuess, adjudicationPolicyVersion } = record;
    if (typeof normalizedStandardAnswer !== 'string') throw new Error('标准答案必须是字符串');
    if (typeof normalizedGuess !== 'string') throw new Error('玩家答案必须是字符串');
    if (typeof adjudicationPolicyVersion !== 'string') {
      throw new Error('裁决政策版本必须是字符串');
    }
    if (adjudicationPolicyVersion !== ADJUDICATION_POLICY_VERSION) {
      throw new Error(`裁决政策版本不匹配：${adjudicationPolicyVersion}`);
    }
    const normalizedStandard = normalizeBlankAdjudicationText(normalizedStandardAnswer);
    const normalizedGuessText = normalizeBlankAdjudicationText(normalizedGuess);
    if (!isValidBlankAdjudicationText(normalizedStandard)) {
      throw new Error('标准答案长度非法（需 1–64 个码点）');
    }
    if (!isValidBlankAdjudicationText(normalizedGuessText)) {
      throw new Error('玩家答案长度非法（需 1–64 个码点）');
    }
    return {
      normalizedStandardAnswer: normalizedStandard,
      normalizedGuess: normalizedGuessText,
      adjudicationPolicyVersion,
    };
  }

  /**
   * 单次 provider 调用：每次从 approved 字段独立重建载荷（主备不可共享引用），
   * 受控超时映射 timeout，AbortError 亦映射 timeout，其余抛错映射 provider_error。
   * 超时触发 controller.abort()：向底层请求传播真实取消（T2 真取消）。
   */
  async #invoke(
    stage: AdjudicationStage,
    payload: AdjudicationProviderPayload,
  ): Promise<AdjudicationAttemptSummary> {
    const invoker = stage === 'primary' ? this.#primary : this.#fallback;
    const start = this.#now();
    const requestPayload: AdjudicationProviderPayload = {
      normalizedStandardAnswer: payload.normalizedStandardAnswer,
      normalizedGuess: payload.normalizedGuess,
      adjudicationPolicyVersion: payload.adjudicationPolicyVersion,
    };
    const controller = new AbortController();
    let classification: AdjudicationClassification;
    try {
      const raw = await this.#withTimeout(
        invoker(requestPayload, controller.signal),
        this.#timeoutMs,
        () => controller.abort(),
      );
      // 严格分类解析：未知键/未知类别/空文本/非 JSON 均映射 invalid_response
      classification = parseAdjudicationResponse(raw) ?? 'invalid_response';
    } catch (err) {
      classification = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'provider_error';
    }
    return { stage, classification, elapsedMs: this.#now() - start };
  }

  /**
   * Promise.race + timer 的受控超时；超时先触发 onTimeout（abort 底层请求），
   * 再抛 name 为 AbortError 的 Error 供上层映射；timer 在 finally 中清理，不泄漏。
   */
  #withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        const err = new Error('外部裁判调用超时');
        err.name = 'AbortError';
        reject(err);
      }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /** 日志只记录有界摘要（policyVersion/classification/source/attempts 各 stage+classification） */
  #log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown>): void {
    this.#logger?.[level]?.(msg, { policyVersion: ADJUDICATION_POLICY_VERSION, ...fields });
  }
}
