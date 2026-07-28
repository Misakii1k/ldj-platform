/**
 * 错误码 → 中文文案映射（SPEC §7.4：可读错误文案，不只显示错误码）。
 * 在 shared 的 ERROR_META 基础上补充客户端上下文。
 */
import { ERROR_META, type ErrorCode } from '@ldj/shared';

/** 客户端可读错误文案表（覆盖服务端默认文案，更贴近用户场景） */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_MESSAGE: '请求格式有误，请刷新页面后重试',
  UNSUPPORTED_PROTOCOL: '客户端版本过旧，请刷新页面或清除缓存',
  ROOM_NOT_FOUND: '房间不存在或已被清理',
  ROOM_CLOSED: '房间已关闭',
  ROOM_FULL: '房间已满，请稍后再试',
  INVALID_PASSWORD: '房间密码错误',
  NICKNAME_TAKEN: '昵称已被占用，请换一个',
  NOT_AUTHORIZED: '没有权限执行此操作',
  INVALID_RESUME_TOKEN: '恢复凭证无效，无法恢复席位，请重新加入',
  RESERVATION_EXPIRED: '席位保留已过期，请重新加入',
  SESSION_REPLACED: '已在其他设备登录，本连接已断开',
  STALE_CLIENT_STATE: '客户端状态过期，正在重新同步',
  ACTION_NOT_ALLOWED: '当前阶段不允许该操作',
  RATE_LIMITED: '操作过于频繁，请稍候',
  RECOVERY_IN_PROGRESS: '服务端正在恢复对局，请稍候',
  PERSISTENCE_FAILED: '保存失败，请重试',
  INTERNAL_ERROR: '服务端开小差了，请重试',
};

export interface ClientError {
  code: string;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
  currentSeq?: number;
}

/** 将未知错误对象转为可读文案；优先识别 ServerError 结构 */
export function describeError(err: unknown): string {
  if (err instanceof ServerError) {
    return err.payload.message ?? ERROR_MESSAGES[err.payload.code as ErrorCode] ?? '未知错误';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '未知错误';
}

/** 服务端 error envelope 抛出的错误对象 */
export class ServerError extends Error {
  readonly payload: ClientError;
  constructor(payload: ClientError) {
    super(payload.message);
    this.name = 'ServerError';
    this.payload = payload;
  }
}

/** 根据 code 获取可读文案 */
export function messageForCode(code: string): string {
  return ERROR_MESSAGES[code as ErrorCode] ?? ERROR_META[code as ErrorCode]?.userMessage ?? '未知错误';
}

/** 判断错误是否可重试 */
export function isRecoverable(err: unknown): boolean {
  if (err instanceof ServerError) return err.payload.recoverable;
  return false;
}
