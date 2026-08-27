/**
 * werewolf_platform_open_kill_v1 — 规则机器人（测试陪练）。
 * 启发式与 legacy 包装共用 play.ts：默认不自刀、预言家不重查、女巫首夜救人。
 */
import type { BotDecisionInput } from '@ldj/shared';
import { pickWerewolfPlayAction } from '../play.ts';
import type { V2Action, V2PlayerView } from './types.ts';

export function pickV2BotAction(input: BotDecisionInput<V2PlayerView>): V2Action | null {
  return pickWerewolfPlayAction(input) as V2Action | null;
}
