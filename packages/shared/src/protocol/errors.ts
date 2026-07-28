/**
 * 核心错误码表（SPEC 附录 A）。
 * 错误响应必须包含稳定错误码、面向用户的短文案和 recoverable；
 * 生产环境不得返回堆栈或内部 SQL。
 */

export const ERROR_CODES = [
  'INVALID_MESSAGE',
  'UNSUPPORTED_PROTOCOL',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSED',
  'ROOM_FULL',
  'INVALID_PASSWORD',
  'NICKNAME_TAKEN',
  'NOT_AUTHORIZED',
  'INVALID_RESUME_TOKEN',
  'RESERVATION_EXPIRED',
  'SESSION_REPLACED',
  'STALE_CLIENT_STATE',
  'ACTION_NOT_ALLOWED',
  'RATE_LIMITED',
  'RECOVERY_IN_PROGRESS',
  'PERSISTENCE_FAILED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorMeta {
  /** 面向用户的默认短文案（客户端可覆盖为更具体文案） */
  userMessage: string;
  /** 客户端是否可以安全重试同一请求 */
  recoverable: boolean;
}

export const ERROR_META: Record<ErrorCode, ErrorMeta> = {
  INVALID_MESSAGE: { userMessage: '请求格式有误，请刷新后重试', recoverable: false },
  UNSUPPORTED_PROTOCOL: { userMessage: '版本不兼容，请刷新页面', recoverable: false },
  ROOM_NOT_FOUND: { userMessage: '房间不存在或已被清理', recoverable: false },
  ROOM_CLOSED: { userMessage: '房间已关闭', recoverable: false },
  ROOM_FULL: { userMessage: '房间已满，请稍后重试', recoverable: true },
  INVALID_PASSWORD: { userMessage: '房间密码错误', recoverable: true },
  NICKNAME_TAKEN: { userMessage: '昵称已被占用，请换一个', recoverable: true },
  NOT_AUTHORIZED: { userMessage: '没有权限执行此操作', recoverable: false },
  INVALID_RESUME_TOKEN: { userMessage: '恢复凭证无效，无法恢复席位', recoverable: false },
  RESERVATION_EXPIRED: { userMessage: '席位保留已过期', recoverable: false },
  SESSION_REPLACED: { userMessage: '已在其他设备登录，本连接已断开', recoverable: false },
  STALE_CLIENT_STATE: { userMessage: '状态已过期，正在重新同步', recoverable: true },
  ACTION_NOT_ALLOWED: { userMessage: '当前阶段不允许该操作', recoverable: false },
  RATE_LIMITED: { userMessage: '操作过于频繁，请稍候', recoverable: true },
  RECOVERY_IN_PROGRESS: { userMessage: '服务端正在恢复对局，请稍候', recoverable: true },
  PERSISTENCE_FAILED: { userMessage: '保存失败，请重试', recoverable: true },
  INTERNAL_ERROR: { userMessage: '服务端开小差了，请重试', recoverable: true },
};

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  /** RATE_LIMITED 时的建议等待毫秒数 */
  retryAfterMs?: number;
  /** STALE_CLIENT_STATE 时附带的当前房间序号 */
  currentSeq?: number;
}

export function makeErrorPayload(
  code: ErrorCode,
  overrides?: Partial<Omit<ErrorPayload, 'code'>>,
): ErrorPayload {
  const meta = ERROR_META[code];
  return {
    code,
    message: overrides?.message ?? meta.userMessage,
    recoverable: overrides?.recoverable ?? meta.recoverable,
    ...(overrides?.retryAfterMs !== undefined ? { retryAfterMs: overrides.retryAfterMs } : {}),
    ...(overrides?.currentSeq !== undefined ? { currentSeq: overrides.currentSeq } : {}),
  };
}
