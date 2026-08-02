/**
 * 错误码 → 中文文案映射（SPEC §7.4：可读错误文案，不只显示错误码）。
 * 在 shared 的 ERROR_META 基础上补充客户端上下文。
 */
import { ERROR_META, type ErrorCode } from '@ldj/shared';

/** 客户端可读错误文案表（覆盖服务端默认文案，更贴近用户场景） */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_MESSAGE: '请求数据格式不匹配，请刷新页面重试',
  UNSUPPORTED_PROTOCOL: '客户端版本需要更新，请刷新页面或清除浏览器缓存',
  ROOM_NOT_FOUND: '未能找到该房间，可能已解散或房间码有误',
  ROOM_CLOSED: '该房间已经关闭',
  ROOM_FULL: '对局席位已满，无法加入',
  INVALID_PASSWORD: '房间密码不正确，请重新输入',
  NICKNAME_TAKEN: '该昵称已被同房玩家使用，请换一个吧',
  NOT_AUTHORIZED: '暂无操作权限',
  INVALID_RESUME_TOKEN: '席位恢复凭证已失效，请重新加入房间',
  RESERVATION_EXPIRED: '断线席位保留已到期，请重新加入',
  SESSION_REPLACED: '账号已在其他设备建立连接，本页面已下线',
  STALE_CLIENT_STATE: '对局数据更新中，正在为你同步最新状态',
  ACTION_NOT_ALLOWED: '当前对局阶段暂不支持此操作',
  RATE_LIMITED: '操作稍微有点快哦，请稍候再试',
  RECOVERY_IN_PROGRESS: '服务器正在恢复房间数据，请稍候…',
  PERSISTENCE_FAILED: '数据保存异常，请重试',
  INTERNAL_ERROR: '服务器正在打瞌睡，请稍后重试',
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
