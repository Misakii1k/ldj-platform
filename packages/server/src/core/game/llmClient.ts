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
    lines.push('发言请直接自然地给出日常表达，切勿进行冗长赘述或不必要的大段推理，确保快速输出。');
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CHINESE_NUMERALS: Readonly<Record<string, string>> = {
  一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5',
  六: '6', 七: '7', 八: '8', 九: '9', 十: '10',
  十一: '11', 十二: '12',
};

function normalizeSeatNumber(raw: string): string {
  const trimmed = raw.trim();
  return CHINESE_NUMERALS[trimmed] ?? trimmed;
}

/** 模型有时会把编号写成 "speech. 结束发言"（带上后面的说明），取点号/空格/中文标点前的代号段再匹配 */
function extractChoiceId(value: string): string {
  const trimmed = value.trim();
  const sep = trimmed.search(/[.\s。、:：-]/);
  return sep === -1 ? trimmed : trimmed.slice(0, sep);
}

/** 根据模型给出的 choice 文本在候选项列表中查找对应 option */
function matchOption<A>(
  rawChoice: unknown,
  options: readonly BotActionOption<A>[],
): BotActionOption<A> | undefined {
  const choice = typeof rawChoice === 'number'
    ? String(rawChoice)
    : typeof rawChoice === 'string'
      ? rawChoice.trim()
      : '';
  if (choice.length === 0) return undefined;

  // 1. 精确匹配 id
  const direct = options.find((o) => o.id === choice);
  if (direct) return direct;

  // 2. 匹配剥离点号/后缀后的 id（如 "1. 投票淘汰 1 号玩家" -> "1"）
  const extractedId = extractChoiceId(choice);
  const byExtracted = options.find((o) => o.id === extractedId);
  if (byExtracted) return byExtracted;

  // 3. 匹配 action 内部的 targetPlayerId（若模型直接返回了目标玩家 ID）
  const byTarget = options.find((o) => {
    const act = o.action as Record<string, unknown> | null | undefined;
    return act && typeof act === 'object' && act.targetPlayerId === choice;
  });
  if (byTarget) return byTarget;

  // 4. 席位号匹配（如 "1", "1号", "1号玩家", "第1号", "1号位", "投1号", "二号"）
  const seatMatch = /^(?:投(?:票)?(?:给|淘汰)?|放逐|出|选(?:择)?|第)?\s*(\d+|[一二两三四五六七八九十]+)\s*号?(?:玩家|位)?$/.exec(choice);
  if (seatMatch) {
    const seatNum = normalizeSeatNumber(seatMatch[1]!);
    const byId = options.find((o) => o.id === seatNum);
    if (byId) return byId;
    const byLabelSeat = options.find((o) =>
      new RegExp(`(^|[^0-9])${seatNum}\\s*号(?:玩家|位)?`).test(o.label),
    );
    if (byLabelSeat) return byLabelSeat;
  }

  // 5. 完整 label 精确匹配（如 choice 为 "投票淘汰 1 号玩家"）
  const exactLabel = options.find((o) => o.label === choice);
  if (exactLabel) return exactLabel;

  // 6. choice 包含了完整的 option.label（如 choice 为 "我决定投票淘汰 1 号玩家"）
  const matchingByFullLabel = options.filter((o) => choice.includes(o.label));
  if (matchingByFullLabel.length === 1) return matchingByFullLabel[0];

  // 7. choice 是 option.label 的子串，仅当唯一确定时匹配（如 "淘汰 1 号"，排除 "投票" 等多选通用词）
  if (choice.length >= 2) {
    const uniqueMatchingLabels = options.filter((o) => o.label.includes(choice));
    if (uniqueMatchingLabels.length === 1) return uniqueMatchingLabels[0];
  }

  // 8. 仅在 choice 字符串内部独立查找 option.id（按 id 长度降序，避免短 id 误碰）
  const byLength = [...options].sort((a, b) => b.id.length - a.id.length);
  const inChoice = byLength.find((o) =>
    new RegExp(`(^|[^0-9a-zA-Z_-])${escapeRegex(o.id)}([^0-9a-zA-Z_-]|$)`).test(choice),
  );
  if (inChoice) return inChoice;

  return undefined;
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  // 1. 优先提取 ```json ... ``` 代码块
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    const parsed = tryParseJson(fenced[1].trim());
    if (parsed) return parsed;
  }

  // 2. 整段直接解析
  const direct = tryParseJson(text.trim());
  if (direct) return direct;

  // 3. 搜索含有 choice 字段的 JSON 对象切片（从 choice 往前找匹配的大括号）
  const choiceIdx = text.search(/"choice"\s*:/);
  if (choiceIdx !== -1) {
    const startIdx = text.lastIndexOf('{', choiceIdx);
    if (startIdx !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = startIdx; i < text.length; i++) {
        const char = text[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              const candidate = text.slice(startIdx, i + 1);
              const parsed = tryParseJson(candidate);
              if (parsed) return parsed;
              break;
            }
          }
        }
      }
    }
  }

  // 4. 最外层 { 到 } 兜底
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    const parsed = tryParseJson(candidate);
    if (parsed) return parsed;
  }

  return null;
}

/** 从模型回复里取出选中编号：先按 JSON 解，失败再做无串票的语义匹配 */
export function extractChoice<A>(
  raw: string,
  options: readonly BotActionOption<A>[],
): { id: string; reason: string | null; speech: string | null } | null {
  // 剥离 <think>...</think> 思考链，避免思考内容干扰决策提取
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 1. JSON 提取与解析
  const parsed = extractJsonObject(cleaned) as { choice?: unknown; reason?: unknown; speech?: unknown } | null;
  if (parsed && typeof parsed === 'object') {
    const option = matchOption(parsed.choice, options);
    if (option) {
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : null;
      const speech = typeof parsed.speech === 'string' ? parsed.speech.trim() : null;
      return { id: option.id, reason, speech };
    }
    // 若模型显式给出了非空 choice（如 "999" 或 "unknown"）但不在候选项中，严格判为非法回复，绝不猜测
    if (parsed.choice !== undefined && parsed.choice !== null && String(parsed.choice).trim().length > 0) {
      return null;
    }
  }

  // 2. 非 JSON 自然语言回复解析
  // (a) 检查是否有唯一的完整选项 label 命中（如 "我决定投票淘汰 1 号玩家"）
  const matchingByLabel = options.filter((o) => o.label.length >= 2 && cleaned.includes(o.label));
  if (matchingByLabel.length === 1) {
    return { id: matchingByLabel[0]!.id, reason: null, speech: null };
  }

  // (b) 检查显式投票/淘汰动作动词 + 席位（排除否定前缀如 "我不投 1 号"）
  const actionMatches = [
    ...cleaned.matchAll(
      /(?<!(?:不|别|未|没)\s*)(?:投(?:票)?(?:给|淘汰)?|票投给|放逐|出|归票(?:给)?|选(?:择)?)\s*第?\s*(\d+|[一二两三四五六七八九十]+)\s*号?(?:玩家|位)?/g,
    ),
  ];
  if (actionMatches.length > 0) {
    // 采用最后一个动作判定（契合思考-结论表达，如 "本来想投3号，但我投2号"）
    const lastMatch = actionMatches[actionMatches.length - 1]!;
    const seatNum = normalizeSeatNumber(lastMatch[1]!);
    const byId = options.find((o) => o.id === seatNum);
    if (byId) return { id: byId.id, reason: null, speech: null };
    const byLabelSeat = options.find((o) =>
      new RegExp(`(^|[^0-9])${seatNum}\\s*号(?:玩家|位)?`).test(o.label),
    );
    if (byLabelSeat) return { id: byLabelSeat.id, reason: null, speech: null };
  }

  // (c) 弃票意图（狼人杀等场景）
  if (/(?<!(?:不|别|未|没)\s*)(?:选择)?弃票/.test(cleaned)) {
    const abstainOpt = options.find((o) => o.id === 'abstain' || o.label.includes('弃票'));
    if (abstainOpt) return { id: abstainOpt.id, reason: null, speech: null };
  }

  // (d) 回复整体即为单一席位号（如 "2号", "2号玩家", "第2号", "二号"）
  const singleSeat = /^第?\s*(\d+|[一二两三四五六七八九十]+)\s*号?(?:玩家|位)?$/.exec(cleaned);
  if (singleSeat) {
    const seatNum = normalizeSeatNumber(singleSeat[1]!);
    const byId = options.find((o) => o.id === seatNum);
    if (byId) return { id: byId.id, reason: null, speech: null };
    const byLabelSeat = options.find((o) =>
      new RegExp(`(^|[^0-9])${seatNum}\\s*号(?:玩家|位)?`).test(o.label),
    );
    if (byLabelSeat) return { id: byLabelSeat.id, reason: null, speech: null };
  }

  // (e) 全文中仅提及了唯一一个席位
  const allMentioned = [
    ...cleaned.matchAll(/(?:^|[^0-9])(\d+|[一二两三四五六七八九十]+)\s*号(?:玩家|位)?/g),
  ].map((m) => normalizeSeatNumber(m[1]!));
  const uniqueMentioned = Array.from(new Set(allMentioned));
  if (uniqueMentioned.length === 1) {
    const seatNum = uniqueMentioned[0]!;
    const byId = options.find((o) => o.id === seatNum);
    if (byId) return { id: byId.id, reason: null, speech: null };
    const byLabelSeat = options.find((o) =>
      new RegExp(`(^|[^0-9])${seatNum}\\s*号(?:玩家|位)?`).test(o.label),
    );
    if (byLabelSeat) return { id: byLabelSeat.id, reason: null, speech: null };
  }

  // (f) 纯 id 边界匹配兜底（仅在无其他混淆席位时按 id 长度匹配）
  const byLength = [...options].sort((a, b) => b.id.length - a.id.length);
  for (const option of byLength) {
    if (new RegExp(`(^|[^0-9a-zA-Z_-])${escapeRegex(option.id)}([^0-9a-zA-Z_-]|$)`).test(cleaned)) {
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
    const effectiveTimeoutMs = prompt.speech
      ? Math.max(this.#config.timeoutMs, 20_000)
      : this.#config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
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
