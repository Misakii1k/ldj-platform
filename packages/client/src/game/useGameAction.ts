/**
 * 各游戏页共用的 game_action 提交钩子与成员昵称查找。
 * 只封装“发送动作 + busy/error”，不解释任何游戏规则。
 *
 * D4-UI0：行为委托给 useScopedAction（按 (action, object) 作用域的纯状态）。
 * 现有消费者不传键，使用默认键 { action: 'game_action', object: 'table' }。
 * 对外 API（useGameAction / GameActionApi / MemberLike / nameFor）保持不变。
 */
import { useCallback } from 'react';
import { isBusy, type ActionKey } from './actionState.ts';
import { useScopedAction } from './useScopedAction.ts';

export interface MemberLike {
  playerId: string;
  nickname: string;
}

export function nameFor(members: readonly MemberLike[], id: string | null | undefined): string {
  return members.find((member) => member.playerId === id)?.nickname ?? id ?? '—';
}

export interface GameActionApi {
  act: (payload: unknown) => Promise<void>;
  busy: boolean;
  error: string | null;
}

/** 无显式键的既有消费者共用的默认作用域键 */
const DEFAULT_ACTION_KEY: ActionKey = { action: 'game_action', object: 'table' };

export function useGameAction(): GameActionApi {
  const { state, act: actScoped, errorFor } = useScopedAction();
  const busy = isBusy(state, DEFAULT_ACTION_KEY);
  const error = errorFor(DEFAULT_ACTION_KEY);

  const act = useCallback(async (payload: unknown): Promise<void> => {
    await actScoped(DEFAULT_ACTION_KEY, payload);
  }, [actScoped]);

  return { act, busy, error };
}
