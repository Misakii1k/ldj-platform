import type {
  Inspection,
  LoveLetterCard,
  LoveLetterPlayerView,
  LoveLetterPublicView,
  LoveLetterState,
} from './types.ts';

function buildPublicView(state: LoveLetterState): LoveLetterPublicView {
  return {
    gameId: 'loveletter',
    rulesetId: 'loveletter_classic16_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: state.players.map((playerId) => ({
      playerId,
      handCount: state.hands[playerId]?.length ?? 0,
      discarded: structuredClone(state.discardPiles[playerId] ?? []),
    })),
    round: state.round,
    deckCount: state.deck.length,
    removedCards: structuredClone(state.removedCards),
    eliminatedPlayers: [...state.eliminatedPlayers],
    protectedPlayers: [...state.protectedPlayers],
    currentPlayerId: state.currentPlayerId,
    affection: { ...state.affection },
    affectionTarget: state.affectionTarget,
    roundWinners: [...state.roundWinners],
    winners: [...state.winners],
  };
}

export function buildLoveLetterPlayerView(state: LoveLetterState, playerId: string): LoveLetterPlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  return {
    ...base,
    me: {
      playerId,
      hand: structuredClone(state.hands[playerId] ?? []),
      inspections: structuredClone(state.inspections.filter((entry) => entry.viewerId === playerId)),
    },
  };
}

export function buildLoveLetterSpectatorView(state: LoveLetterState): LoveLetterPublicView {
  return buildPublicView(state);
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(`${label} 必须是对象`);
  return input as Record<string, unknown>;
}

function stringArray(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string')) throw new Error(`${label} 无效`);
  return [...input];
}

function numberRecord(input: unknown, label: string): Record<string, number> {
  const value = record(input, label);
  if (Object.values(value).some((item) => !Number.isInteger(item) || (item as number) < 0)) throw new Error(`${label} 无效`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item as number]));
}

function parsePublic(input: unknown): LoveLetterPublicView {
  const value = record(input, '情书视图');
  const expected = ['gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'round', 'deckCount', 'removedCards', 'eliminatedPlayers', 'protectedPlayers', 'currentPlayerId', 'affection', 'affectionTarget', 'roundWinners', 'winners'];
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) throw new Error('情书视图字段无效');
  if (value.gameId !== 'loveletter' || value.rulesetId !== 'loveletter_classic16_v1' || value.schemaVersion !== 1) throw new Error('情书视图身份无效');
  if (value.phase !== 'playing' && value.phase !== 'game_over') throw new Error('情书阶段无效');
  if (!Number.isInteger(value.round) || (value.round as number) < 1 || !Number.isInteger(value.deckCount) || (value.deckCount as number) < 0) throw new Error('情书轮次无效');
  if (!Number.isInteger(value.affectionTarget) || (value.affectionTarget as number) < 1) throw new Error('好感阈值无效');
  if (value.currentPlayerId !== null && typeof value.currentPlayerId !== 'string') throw new Error('当前玩家无效');
  if (!Array.isArray(value.players) || !Array.isArray(value.removedCards)) throw new Error('情书牌区无效');
  return {
    gameId: value.gameId,
    rulesetId: value.rulesetId,
    schemaVersion: value.schemaVersion,
    phase: value.phase,
    players: structuredClone(value.players) as LoveLetterPublicView['players'],
    round: value.round as number,
    deckCount: value.deckCount as number,
    removedCards: structuredClone(value.removedCards) as LoveLetterCard[],
    eliminatedPlayers: stringArray(value.eliminatedPlayers, '淘汰列表'),
    protectedPlayers: stringArray(value.protectedPlayers, '保护列表'),
    currentPlayerId: value.currentPlayerId,
    affection: numberRecord(value.affection, '好感'),
    affectionTarget: value.affectionTarget as number,
    roundWinners: stringArray(value.roundWinners, '轮次赢家'),
    winners: stringArray(value.winners, '赢家'),
  };
}

export function parseLoveLetterSpectatorView(input: unknown): LoveLetterPublicView {
  return parsePublic(input);
}

export function parseLoveLetterPlayerView(input: unknown): LoveLetterPlayerView {
  const value = record(input, '情书玩家视图');
  if (!('me' in value)) throw new Error('情书玩家视图缺少 me');
  const { me, ...publicValue } = value;
  const parsed = parsePublic(publicValue);
  if (me === null) return { ...parsed, me: null };
  const self = record(me, '情书本人视图');
  if (Object.keys(self).length !== 3 || typeof self.playerId !== 'string' || !Array.isArray(self.hand) || !Array.isArray(self.inspections)) throw new Error('情书本人视图无效');
  return {
    ...parsed,
    me: {
      playerId: self.playerId,
      hand: structuredClone(self.hand) as LoveLetterCard[],
      inspections: structuredClone(self.inspections) as Inspection[],
    },
  };
}
