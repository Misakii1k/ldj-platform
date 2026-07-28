/**
 * 限流骨架（SPEC §9.5）：固定窗口计数器。
 * M1 先接入连接与消息级硬限；M2 按聊天/动作/加入细化配额。
 */

export interface RateLimitRule {
  /** 窗口时长（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大次数 */
  max: number;
}

export const DEFAULT_RULES = {
  /** 聊天 5 条 / 10 秒 / 玩家 */
  chat: { windowMs: 10_000, max: 5 },
  /** 游戏动作 20 条 / 秒 / 玩家 */
  gameAction: { windowMs: 1_000, max: 20 },
  /** 加入或密码尝试 10 次 / 分钟 / IP */
  joinAttempt: { windowMs: 60_000, max: 10 },
  /** 单连接消息总量硬限（防洪泛） */
  messagesPerConnection: { windowMs: 1_000, max: 40 },
} as const satisfies Record<string, RateLimitRule>;

interface WindowState {
  windowStart: number;
  count: number;
}

export class RateLimiter {
  readonly #rule: RateLimitRule;
  readonly #windows = new Map<string, WindowState>();

  constructor(rule: RateLimitRule) {
    this.#rule = rule;
  }

  /** 尝试消费一次配额；拒绝时返回建议等待毫秒数 */
  tryAcquire(key: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    const state = this.#windows.get(key);
    if (!state || now - state.windowStart >= this.#rule.windowMs) {
      this.#windows.set(key, { windowStart: now, count: 1 });
      return { ok: true };
    }
    if (state.count < this.#rule.max) {
      state.count += 1;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: state.windowStart + this.#rule.windowMs - now };
  }

  /** 清理过期窗口（定期调用，防内存增长） */
  sweep(now: number = Date.now()): void {
    for (const [key, state] of this.#windows) {
      if (now - state.windowStart >= this.#rule.windowMs) {
        this.#windows.delete(key);
      }
    }
  }
}
