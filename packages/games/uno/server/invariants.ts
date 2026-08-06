import type { UnoState } from './module.ts';

export function assertUnoInvariants(state: UnoState): void {
  const playerIds = state.players;
  if (new Set(playerIds).size !== playerIds.length) throw new Error('UNO 玩家必须唯一');
  const playerSet = new Set(playerIds);
  if (!playerSet.has(state.currentPlayerId)) throw new Error('UNO 当前玩家无效');
  if (state.discardPile.length === 0) throw new Error('UNO 弃牌顶必须存在');
  for (const map of [state.hands, state.playerState]) {
    const keys = Object.keys(map);
    if (keys.length !== playerIds.length || keys.some((id) => !playerSet.has(id))) {
      throw new Error('UNO 玩家映射必须与参局者一致');
    }
  }
  const cards = [
    ...state.deck,
    ...state.discardPile,
    ...Object.values(state.hands).flat(),
  ];
  if (cards.length !== 108) throw new Error(`UNO 卡牌总数必须为 108，实际 ${cards.length}`);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error('UNO 卡牌实例 ID 必须唯一');
  if (![0, 2, 4].includes(state.pendingDraw)) throw new Error('UNO 罚牌数无效');
  if (state.phase === 'playing' && state.winnerId !== null) throw new Error('UNO 进行中不能已有胜者');
  if (state.phase === 'game_over') {
    if (state.winnerId === null || !playerSet.has(state.winnerId)) throw new Error('UNO 终局胜者无效');
    if ((state.hands[state.winnerId]?.length ?? -1) !== 0) throw new Error('UNO 胜者必须已经出完牌');
  }
  if (state.lastPlayed) {
    if (!playerSet.has(state.lastPlayed.playerId)) throw new Error('UNO 最后出牌者无效');
    if (state.lastPlayed.resultingColor !== state.currentColor) throw new Error('UNO 最后出牌颜色与当前颜色不一致');
  }
}
