/**
 * D4-UI0：按 (action, object) 作用域的动作提交 hook。
 * 复用纯 reducer（actionState.ts），React 层只做发送与状态同步。
 * act 成功返回 true；失败返回 false 并记录 error（下次 begin 才清除）。
 */
import { useCallback, useRef, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
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
  /** 发送 game_action；成功 true，失败 false（错误保留到下次 begin） */
  act: (key: ActionKey, payload: unknown) => Promise<boolean>;
  /** 读取指定键的错误文案；无错误返回 null */
  errorFor: (key: ActionKey) => string | null;
}

/** 生成稳定性足够、无碰撞的 requestId（仅用于状态记录） */
function nextRequestId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useScopedAction(): ScopedActionApi {
  const { send } = useConnection();
  const [state, setState] = useState<ActionStateMap>({});
  const seqRef = useRef(0);

  const act = useCallback(async (key: ActionKey, payload: unknown): Promise<boolean> => {
    const requestId = `${nextRequestId()}_${(seqRef.current++).toString(36)}`;
    setState((prev) => beginAction(prev, key, requestId));
    try {
      await send('game_action', payload);
      setState((prev) => settleAction(prev, key));
      return true;
    } catch (err) {
      setState((prev) => failAction(prev, key, describeError(err)));
      return false;
    }
  }, [send]);

  const errorFor = useCallback((key: ActionKey): string | null => {
    const entry = state[actionKeyString(key)];
    return entry?.status === 'error' ? (entry.errorMessage ?? '未知错误') : null;
  }, [state]);

  // isBusy 由消费方从 actionState.ts 直接导入，保持此 hook 只返回 { state, act, errorFor }。
  return { state, act, errorFor };
}
