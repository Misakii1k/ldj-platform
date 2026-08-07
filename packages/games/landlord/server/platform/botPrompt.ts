/**
 * landlord_platform_v1 — LLM 决策材料。
 * 复用 legacy 提示构建（server/botPrompt.ts），只做视角适配；
 * 候选动作仍由模块枚举，模型挑 id 不可能产出非法动作。
 */
import type { BotDecisionInput, BotPromptContext } from '@ldj/shared';
import { buildLandlordBotPrompt } from '../botPrompt.ts';
import type { LandlordPlayerView } from '../module.ts';
import type { PlatformAction, PlatformPlayerView } from './types.ts';

export function buildPlatformBotPrompt(
  input: BotDecisionInput<PlatformPlayerView>,
): BotPromptContext<PlatformAction> | null {
  return buildLandlordBotPrompt(input as unknown as BotDecisionInput<LandlordPlayerView>);
}
