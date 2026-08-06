/**
 * 谁是卧底服务端入口：GameModule 实现 + 词库 + 视角。
 * 服务端专用（含词库与完整状态类型），不得进入客户端构建（SPEC §8.4）。
 */
export { undercoverModule } from './module.ts';
export {
  UNDERCOVER_VERSIONED_IDENTITY,
  assertUndercoverInvariants,
  undercoverVersionedModule,
} from './versionedModule.ts';
export { pickUndercoverBotAction } from './bot.ts';
export { WORD_BANK, WORD_BANK_VERSION, type WordPair } from './words.ts';
export * from './state.ts';
export {
  buildPlayerView,
  buildSpectatorView,
  undercoverPlayerViewSchema,
  undercoverPublicViewSchema,
  undercoverSpectatorViewSchema,
  type UndercoverPlayerView,
  type UndercoverSpectatorView,
  type UndercoverPublicView,
  type PublicPlayerInfo,
} from './views.ts';
export { buildUndercoverBotPrompt } from './botPrompt.ts';
// —— D4-B：白板规则集（undercover_blank_v1）并行注册（与 classic 完全隔离） ——
export * from './blank/module.ts';
