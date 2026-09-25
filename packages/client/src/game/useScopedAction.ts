/**
 * D4-UI0：按 (action, object) 作用域的动作提交 hook。
 * 复用纯 reducer（actionState.ts），React 层只做发送与状态同步。
 * act 成功返回 true；失败返回 false 并记录 error（支持自动超时 3.5s 消除与手动 clearError）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError, ServerError } from '../shared-ui/errors.ts';
import {
  actionKeyString,
  beginAction,
  failAction,
  settleAction,
  type ActionKey,
  type ActionStateMap,
} from './actionState.ts';

export interface ScopedActionApi {
  /** 全部键的状态表（仅用于读取派生值，勿直接修改） */
  state: ActionStateMap;
  /** 发送 game_action；成功 true，失败 false（错误保留到下次 begin 或 3.5s 自动消失） */
  act: (key: ActionKey, payload: unknown) => Promise<boolean>;
  /** 读取指定键的错误文案；无错误返回 null */
  errorFor: (key: ActionKey) => string | null;
  /** 手动消除指定键的错误状态 */
  clearError: (key: ActionKey) => void;
}

/** 生成稳定性足够、无碰撞的 requestId（仅用于状态记录） */
function nextRequestId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useScopedAction(): ScopedActionApi {
  const { send } = useConnection();
  const [state, setState] = useState<ActionStateMap>({});
  const seqRef = useRef(0);
  const autoClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearError = useCallback((key: ActionKey) => {
    const keyStr = actionKeyString(key);
    const timer = autoClearTimersRef.current.get(keyStr);
    if (timer) {
      clearTimeout(timer);
      autoClearTimersRef.current.delete(keyStr);
    }
    setState((prev) => settleAction(prev, key));
  }, []);

  const act = useCallback(
    async (key: ActionKey, payload: unknown): Promise<boolean> => {
      const keyStr = actionKeyString(key);
      const existingTimer = autoClearTimersRef.current.get(keyStr);
      if (existingTimer) {
        clearTimeout(existingTimer);
        autoClearTimersRef.current.delete(keyStr);
      }

      const requestId = `${nextRequestId()}_${(seqRef.current++).toString(36)}`;
      setState((prev) => beginAction(prev, key, requestId));
      try {
        await send('game_action', payload);
        setState((prev) => settleAction(prev, key));
        return true;
      } catch (err) {
        const isStale =
          (err instanceof ServerError && err.payload.code === 'STALE_CLIENT_STATE') ||
          (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'STALE_CLIENT_STATE');
        if (isStale) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 150));
            await send('game_action', payload);
            setState((prev) => settleAction(prev, key));
            return true;
          } catch {
            // 重试失败则继续走默认错误处理
          }
        }
        setState((prev) => failAction(prev, key, describeError(err)));
        // 3.5 秒后自动消失，防止错误横幅永久阻塞界面
        const timer = setTimeout(() => {
          autoClearTimersRef.current.delete(keyStr);
          setState((prev) => settleAction(prev, key));
        }, 3500);
        autoClearTimersRef.current.set(keyStr, timer);
        return false;
      }
    },
    [send],
  );

  const errorFor = useCallback(
    (key: ActionKey): string | null => {
      const entry = state[actionKeyString(key)];
      return entry?.status === 'error' ? (entry.errorMessage ?? '未知错误') : null;
    },
    [state],
  );

  useEffect(() => {
    const timers = autoClearTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // isBusy 由消费方从 actionState.ts 直接导入，保持此 hook 只返回 { state, act, errorFor, clearError }。
  return { state, act, errorFor, clearError };
}
