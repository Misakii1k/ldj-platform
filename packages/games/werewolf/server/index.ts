export { werewolfModule } from './module.ts';
export { werewolfV2Module } from './v2/module.ts';
export { werewolfModeratorModule, WEREWOLF_MODERATOR_IDENTITY } from './moderator/module.ts';
export { wrapLegacyWithJudgeVoice } from './judgeVoiceWrapper.ts';
export { pickWerewolfBotAction } from './bot.ts';
export * from '../shared/manifest.ts';
export { buildWerewolfBotPrompt } from './botPrompt.ts';
export {
  asWerewolfPlayView,
  cannedWerewolfSpeech,
  overlayWerewolfBotPrompt,
  pickWerewolfPlayAction,
} from './play.ts';
