/**
 * 谁是卧底服务端入口：GameModule 实现 + 词库 + 视角。
 * 服务端专用（含词库与完整状态类型），不得进入客户端构建（SPEC §8.4）。
 */
export { undercoverModule } from './module.ts';
export { WORD_BANK, WORD_BANK_VERSION, type WordPair } from './words.ts';
export * from './state.ts';
export {
  buildPlayerView,
  buildSpectatorView,
  type UndercoverPlayerView,
  type UndercoverSpectatorView,
  type UndercoverPublicView,
  type PublicPlayerInfo,
} from './views.ts';
