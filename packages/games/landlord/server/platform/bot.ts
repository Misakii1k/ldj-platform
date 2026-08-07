/**
 * landlord_platform_v1 — 机器人策略。
 * 复用 legacy 陪练（server/bot.ts 的枚举/代价/决策逻辑），只做视角与动作适配：
 * 平台视图与 legacy 视图同构（phase/bids/currentBidderId/currentTrick/me.hand…），
 * 返回的动作继续走平台 parseAction + reduce 合法入口。
 */
import type { BotDecisionInput } from '@ldj/shared';
import { pickLandlordBotAction } from '../bot.ts';
import type { LandlordPlayerView } from '../module.ts';
import { platformActionSchema } from './schemas.ts';
import type { PlatformAction, PlatformPlayerView } from './types.ts';

export function pickPlatformBotAction(input: BotDecisionInput<PlatformPlayerView>): PlatformAction | null {
  const legacy = pickLandlordBotAction(input as unknown as BotDecisionInput<LandlordPlayerView>);
  if (legacy === null) return null;
  return platformActionSchema.parse(legacy) as PlatformAction;
}
