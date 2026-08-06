/**
 * D4-F2：会话失败语义。
 * 内部规则错误把会话置为 SUSPENDED 并携带类型化失败码；
 * 确定性可恢复时平台从最近有效快照恢复，否则以 FAILED_* 异常终止。
 * FAILED_* 在 game_sessions.failure 列持久化，会话状态仍为 ABORTED（不写正常战绩）。
 */

/** SUSPENDED 阶段记录的内部失败原因码（仅落库诊断，不进普通客户端视角）。 */
export const SUSPENDED_REASON_CODES = [
  'SUSPENDED_REDUCE_FAULT',
  'SUSPENDED_STATE_SCHEMA',
  'SUSPENDED_INVARIANT',
  'SUSPENDED_UNKNOWN_EFFECT',
  'SUSPENDED_UNSERIALIZABLE',
] as const;
export type SuspendedReasonCode = (typeof SUSPENDED_REASON_CODES)[number];

/** 异常终止的正式失败码（会话状态为 ABORTED，不产生正常战绩）。 */
export const FAILURE_CODES = [
  'FAILED_RECOVERY',
  'FAILED_INVARIANT',
  'FAILED_RULESET_UNAVAILABLE',
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** 允许写入 game_sessions.failure 的全部类型化失败码。 */
export const SESSION_FAILURE_CODES = [...SUSPENDED_REASON_CODES, ...FAILURE_CODES] as const;
export type SessionFailureCode = (typeof SESSION_FAILURE_CODES)[number];

/**
 * 规则模块内部故障：reduce 抛错、next state schema/invariant 失败、
 * 未知 effect、不可序列化输出。与 CommandError（用户输入拒绝）严格区分。
 */
export class GameInternalError extends Error {
  readonly reason: SuspendedReasonCode;
  constructor(reason: SuspendedReasonCode, message?: string) {
    super(message ?? reason);
    this.name = 'GameInternalError';
    this.reason = reason;
  }
}

/** 脱敏失败详情：只保存有界元数据，绝不保存快照正文、手牌、角色、猜词、密钥或堆栈。 */
export function sanitizeFailureDetails(
  reason: SuspendedReasonCode,
  error: unknown,
  meta: { sessionId: string; moduleId: string; rulesetId: string; seq: number },
): string {
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({
    reason,
    moduleId: meta.moduleId,
    rulesetId: meta.rulesetId,
    sessionId: meta.sessionId,
    seq: meta.seq,
    message: message.slice(0, 200),
  });
}
