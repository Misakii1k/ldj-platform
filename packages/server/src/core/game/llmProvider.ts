/**
 * LLM 客户端持有者（热生效）。
 *
 * 为什么需要这一层：LlmClient 的配置是构造时固定的，而设置面板改完
 * 应当立刻生效，不该要求重启服务端。BotRunner 与 WsGateway 都只拿
 * 这个 provider 的引用，配置变更时由它换掉内部的客户端实例。
 *
 * 谁在读：
 *   - BotRunner 每次决策前调 current()，拿到的总是最新配置的客户端
 *   - WsGateway 在 welcome 与 add_bot 校验里调 isAvailable()
 */
import { LlmClient, isLlmEnabled } from './llmClient.ts';
import type { LlmConfig } from '../../config.ts';
import type { Logger } from '../../boot/logger.ts';

export class LlmProvider {
  #client: LlmClient | null;
  #config: LlmConfig;
  readonly #logger: Logger;

  constructor(config: LlmConfig, logger: Logger) {
    this.#config = config;
    this.#logger = logger;
    this.#client = isLlmEnabled(config) ? new LlmClient(config, logger) : null;
  }

  /** 当前可用的客户端；null 表示未配置，调用方应回落规则策略 */
  current(): LlmClient | null {
    return this.#client;
  }

  /** 是否已配置可用（决定"加 AI 玩家"按钮是否出现、add_bot 是否放行） */
  isAvailable(): boolean {
    return this.#client !== null;
  }

  /** 当前配置（apiKey 不外传，只用于服务端内部） */
  config(): LlmConfig {
    return this.#config;
  }

  /**
   * 换一套配置：立即重建客户端。
   * 正在进行中的那次 decide() 用的是旧客户端，它会自然跑完——
   * 无需打断，最坏情况只是最后一次决策用了旧端点。
   */
  update(config: LlmConfig): void {
    this.#config = config;
    this.#client = isLlmEnabled(config) ? new LlmClient(config, this.#logger) : null;
    this.#logger.info('llm_config_updated', {
      enabled: this.#client !== null,
      model: config.model,
      // 端点与密钥不入日志
    });
  }
}
