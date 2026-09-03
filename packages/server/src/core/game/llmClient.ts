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
  /** 需要发言时模型写的公屏正文；模块未声明 speech 时恒为 null */
  speech: string | null;
}

function buildSystemPrompt(needsSpeech: boolean): string {
  const lines = [
    '你在陪真人玩家玩一局桌游，要扮演一名像样的玩家：按规则行动，像朋友聊天那样发言。',
    '行动前先看局势与大家近期的发言：该回应就回应（附和、质疑或补充），不要复述别人说过的话，也不要假装某人说过什么——公屏没出现过的内容不要编造。',
    '从「可选动作」里挑一个，把它的编号原样填进 choice 字段：只填列表行开头的代号本身，不要带上后面的说明（如列表是 "speech. 结束发言"，就填 "speech"），然后只输出一个 JSON 对象，不要任何其他文字：',
  ];
  if (needsSpeech) {
    lines.push('{"choice":"编号","speech":"给全桌听的话","reason":"你选它的真实理由"}');
    lines.push('speech 会公开展示给全桌，reason 只有系统能看到，其他玩家看不到，可以放心写真实想法。');
    lines.push('speech 用口语短句，1 到 2 句；不要在里面报身份、夜间信息或阵营秘密——想隐瞒的事交给行动本身。');
  } else {
    lines.push('{"choice":"编号","reason":"你选它的真实理由"}');
  }
  return lines.join('\n');
}

function buildUserPrompt<A>(prompt: BotPromptContext<A>): string {
  const lines = [prompt.roleBrief, '', prompt.situation, '', '可选动作：'];
  for (const option of prompt.options) {
    lines.push(`${option.id}. ${option.label}`);
  }
  if (prompt.speech) {
    lines.push('', `同时写一段公屏发言（最多 ${prompt.speech.maxChars} 字）：${prompt.speech.instruction}`);
    lines.push('公屏没人说话就自然起个话头，别假装在回应谁。');
  }
  lines.push('', '请选择一个编号。');
  return lines.join('\n');
}

/** 模型有时会把编号写成 "speech. 结束发言"（带上后面的说明），取点号/空格前的代号段再匹配 */
function extractChoiceId(value: string): string {
  const trimmed = value.trim();
  const sep = trimmed.search(/[.\s。]/);
  return sep === -1 ? trimmed : trimmed.slice(0, sep);
}

/** 从模型回复里取出选中编号：先按 JSON 解（兼容编号带 label 后缀），失败再宽松匹配 */
function extractChoice<A>(
  raw: string,
  options: readonly BotActionOption<A>[],
): { id: string; reason: string | null; speech: string | null } | null {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as { choice?: unknown; reason?: unknown; speech?: unknown };
    const choice = typeof parsed.choice === 'string' ? parsed.choice.trim() : '';
    const id = choice.length > 0
      ? options.find((o) => o.id === choice)?.id ?? options.find((o) => o.id === extractChoiceId(choice))?.id
      : undefined;
    if (id !== undefined) {
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : null;
      const speech = typeof parsed.speech === 'string' ? parsed.speech.trim() : null;
      return { id, reason, speech };
    }
  } catch {
    // 不是合法 JSON，走下面的宽松匹配
  }

  const byLength = [...options].sort((a, b) => b.id.length - a.id.length);
  for (const option of byLength) {
    if (new RegExp(`(^|[^0-9])${option.id}([^0-9]|$)`).test(candidate)) {
      return { id: option.id, reason: null, speech: null };
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
      // 输出预算按思考深度与发言字数动态放大：思考型模型会把预算消耗在
      // reasoning 上，固定 400 会在长发言时把 content 截断成空。
      const depthBase = this.#config.thinkingDepth === 'off' ? 400 : 1024;
      const speechBudget = prompt.speech
        ? Math.max(256, Math.ceil(prompt.speech.maxChars * 2))
        : 0;
      const maxOutputTokens = depthBase + speechBudget;

      this.#logger.debug('llm_prompt_built', {
        ...meta,
        optionCount: prompt.options.length,
        speechMaxChars: prompt.speech?.maxChars ?? null,
        situationLength: prompt.situation.length,
        thinkingDepth: this.#config.thinkingDepth,
        maxOutputTokens,
      });

      const requestUrl = buildInferenceUrl(this.#config.baseUrl, this.#config.provider);
      const request = buildInferenceRequest({
        provider: this.#config.provider,
        model: this.#config.model,
        apiKey: this.#config.apiKey,
        thinkingDepth: this.#config.thinkingDepth,
        system: buildSystemPrompt(Boolean(prompt.speech)),
        user: buildUserPrompt(prompt),
        maxOutputTokens,
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

      const body = await readLimitedJson(response);
      this.#logger.debug('llm_raw_reply', { ...meta, reply: JSON.stringify(body).slice(0, 200) });
      const content = extractText(this.#config.provider, body);
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
      return {
        option,
        reason: choice.reason,
        speech: prompt.speech ? choice.speech : null,
      };
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
