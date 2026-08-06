/**
 * D4-UI0：按 (action, object) 作用域的 action 提交状态纯 reducer。
 * 无 React、无 I/O，纯函数便于单元测试。
 *
 * 设计：
 *  - 状态按 `actionKeyString(key)` 为键的扁平映射，键隔离（失败一个动作不影响其他动作）。
 *  - 未知键处理安全：不崩溃，视为“不存在”，读取（isBusy）返回空闲。
 *  - 错误在下次 beginAction 之前持续保留；settleAction 只清 busy，不清错误。
 */

/** 作用域键：同一动作对象上的同一动作视为同一键 */
export interface ActionKey {
  action: string;
  object: string;
}

/**
 * 稳定的键字符串：JSON 编码 [action, object]，对任意字符串对均为单射，
 * 避免分隔符注入导致的不同键串成同一串。
 */
export function actionKeyString(key: ActionKey): string {
  return JSON.stringify([key.action, key.object]);
}

export type ScopedActionStatus = 'idle' | 'submitting' | 'error';

/** 单个键的提交状态 */
export interface ScopedActionState {
  status: ScopedActionStatus;
  requestId?: string;
  errorMessage?: string;
}

/** 全部键的状态表：键字符串 → 该键状态 */
export type ActionStateMap = Record<string, ScopedActionState>;

function empty(): ScopedActionState {
  return { status: 'idle' };
}

/** 标记动作开始：置为 submitting，替换旧记录（含上一次的 error） */
export function beginAction(
  state: ActionStateMap,
  key: ActionKey,
  requestId: string,
): ActionStateMap {
  return {
    ...state,
    [actionKeyString(key)]: { status: 'submitting', requestId },
  };
}

/** 标记动作失败：置为 error；只影响该键 */
export function failAction(
  state: ActionStateMap,
  key: ActionKey,
  message: string,
): ActionStateMap {
  return {
    ...state,
    [actionKeyString(key)]: { status: 'error', errorMessage: message },
  };
}

/** 标记动作正常结束：置为 idle（不清错误，错误由下次 begin 覆盖） */
export function settleAction(
  state: ActionStateMap,
  key: ActionKey,
): ActionStateMap {
  return {
    ...state,
    [actionKeyString(key)]: empty(),
  };
}

/** 该键是否正在提交；未知键视为空闲 */
export function isBusy(state: ActionStateMap, key: ActionKey): boolean {
  return state[actionKeyString(key)]?.status === 'submitting';
}
