/**
 * 大模型决策客户端（AI 玩家）。
 *
 * 走 OpenAI Chat Completions 兼容协议或 Anthropic Messages 协议，
 * 支持选择思考深度 (Reasoning Effort / Thinking Budget)，
 * 本地 Ollama / vLLM、DeepSeek、Anthropic Claude 与各家云 API 均可直连。
 */
import type { BotActionOption, BotPromptContext } from '@ldj/shared';
import type { LlmConfig } from '../../config.ts';
import type { Logger } from '../../boot/logger.ts';
import { buildInferenceRequest, buildInferenceUrl, extractText } from '../llmProtocol.ts';
import { readLimitedJson, safeFetch, type UpstreamAddressPolicy } from '../safeUpstream.ts';

/** 已启用的 LLM 配置：baseUrl 非空才能构造客户端 */
export type ActiveLlmConfig = LlmConfig & { baseUrl: string };

/** 配置是否足以发起决策请求（没配端点 = 功能关闭） */
export function isLlmEnabled(config: LlmConfig): config is ActiveLlmConfig {
  return config.baseUrl !== null && config.baseUrl !== '';
}

/** 决策结果；调用方拿不到就回落规则策略 */
export interface LlmDecision<A> {
  option: BotActionOption<A>;
  /** 模型给的一句话理由，写日志便于观察它在想什么 */
  reason: string | null;
}

const SYSTEM_PROMPT = [
  '你在陪人类玩一局桌游，请像一个认真的玩家那样做决定。',
  '你只能从给出的候选动作里选一个，用它的编号回答。',
  '严格按 JSON 回复，不要加解释文字或代码块标记：',
  '{"choice": "<候选动作编号>", "reason": "<一句话理由，20 字以内>"}',
].join('\n');

function buildUserPrompt<A>(prompt: BotPromptContext<A>): string {
  const lines = [prompt.roleBrief, '', prompt.situation, '', '可选动作：'];
  for (const option of prompt.options) {
    lines.push(`${option.id}. ${option.label}`);
  }
  lines.push('', '请选择一个编号。');
  return lines.join('\n');
}

/** 从模型回复里取出选中编号：先按 JSON 解，失败再宽松匹配 */
function extractChoice<A>(
  raw: string,
  options: readonly BotActionOption<A>[],
): { id: string; reason: string | null } | null {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as { choice?: unknown; reason?: unknown };
    const choice = typeof parsed.choice === 'string' ? parsed.choice.trim() : '';
    if (options.some((o) => o.id === choice)) {
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : null;
      return { id: choice, reason };
    }
  } catch {
    // 不是合法 JSON，走下面的宽松匹配
  }

  const byLength = [...options].sort((a, b) => b.id.length - a.id.length);
  for (const option of byLength) {
    if (new RegExp(`(^|[^0-9])${option.id}([^0-9]|$)`).test(candidate)) {
      return { id: option.id, reason: null };
    }
  }
  return null;
}

export class LlmClient {
  readonly #config: ActiveLlmConfig;
  readonly #logger: Logger;
  readonly #addressPolicy: UpstreamAddressPolicy;

  constructor(config: ActiveLlmConfig, logger: Logger, addressPolicy: UpstreamAddressPolicy = {}) {
    this.#config = config;
    this.#logger = logger;
    this.#addressPolicy = addressPolicy;
  }

  /**
   * 请模型从候选项里挑一个。
   * 任何失败都返回 null——调用方据此回落规则策略，对局不会卡住。
   */
  async decide<A>(
    prompt: BotPromptContext<A>,
    meta: { roomId: string; botId: string; moduleId: string },
  ): Promise<LlmDecision<A> | null> {
    if (prompt.options.length === 0) return null;

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    timer.unref?.();

    try {
      const requestUrl = buildInferenceUrl(this.#config.baseUrl, this.#config.provider);
      const request = buildInferenceRequest({
        provider: this.#config.provider,
        model: this.#config.model,
        apiKey: this.#config.apiKey,
        thinkingDepth: this.#config.thinkingDepth,
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(prompt),
        maxOutputTokens: 400,
        temperature: 0.7,
      });
      const response = await safeFetch(requestUrl, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
        redirect: 'manual',
      }, this.#addressPolicy);

      if (response.status >= 300 && response.status < 400) {
        this.#logger.warn('llm_invalid_response', { ...meta, provider: this.#config.provider });
        return null;
      }
      if (!response.ok) {
        this.#logger.warn('llm_http_error', {
          ...meta,
          status: response.status,
          provider: this.#config.provider,
        });
        return null;
      }

      const content = extractText(this.#config.provider, await readLimitedJson(response));
      if (content === null) {
        this.#logger.warn('llm_empty_response', meta);
        return null;
      }

      const choice = extractChoice(content, prompt.options);
      if (!choice) {
        this.#logger.warn('llm_unparsable_choice', { ...meta, replyLength: content.length });
        return null;
      }
      const option = prompt.options.find((o) => o.id === choice.id);
      if (!option) return null;

      this.#logger.info('llm_decided', {
        ...meta,
        choiceId: option.id,
        reason: choice.reason,
        elapsedMs: Date.now() - startedAt,
      });
      return { option, reason: choice.reason };
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';
      this.#logger.warn(aborted ? 'llm_timeout' : 'llm_request_failed', {
        ...meta,
        elapsedMs: Date.now() - startedAt,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
