/**
 * 大模型决策客户端（AI 玩家）。
 *
 * 三条设计原则：
 * 1. 模型只做选择题。候选动作由游戏模块枚举，模型回一个编号；
 *    因此模型再怎么胡说也产不出非法动作，最坏是选了个笨招。
 * 2. 失败必须兜住。超时、网络错误、返回垃圾——一律返回 null，
 *    由调用方回落到规则策略，绝不让一次 API 抖动把整局卡死。
 * 3. 不把秘密写进日志。局势描述含身份与手牌，只记编号与耗时。
 *
 * 走 OpenAI Chat Completions 兼容协议，本地 Ollama / vLLM 与各家云 API
 * 都能直连，不引第三方 SDK。
 */
import type { BotActionOption, BotPromptContext } from '@ldj/shared';
import type { LlmConfig } from '../../config.ts';
import type { Logger } from '../../boot/logger.ts';

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
  // 模型常把 JSON 套在 ```json 围栏里
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

  // 兜底：模型可能直接回 "3" 或 "我选 3"。
  // 按编号长度降序匹配，避免 "1" 抢先命中 "12"。
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

  constructor(config: ActiveLlmConfig, logger: Logger) {
    this.#config = config;
    this.#logger = logger;
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
      const response = await fetch(`${this.#config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.#config.apiKey !== null ? { authorization: `Bearer ${this.#config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.#config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(prompt) },
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.#logger.warn('llm_http_error', { ...meta, status: response.status });
        return null;
      }

      const body = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
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
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      this.#logger.warn(aborted ? 'llm_timeout' : 'llm_request_failed', {
        ...meta,
        elapsedMs: Date.now() - startedAt,
        ...(aborted ? {} : { message: (err as Error).message }),
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
